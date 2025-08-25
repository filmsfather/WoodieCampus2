import { performance } from 'perf_hooks';
import winston from 'winston';

// 성능 모니터링 유틸리티
export class PerformanceMonitor {
  private static instance: PerformanceMonitor;
  private metrics: Map<string, number[]> = new Map();
  private logger: winston.Logger;

  constructor() {
    this.logger = winston.createLogger({
      level: 'info',
      format: winston.format.combine(
        winston.format.timestamp(),
        winston.format.json()
      ),
      transports: [
        new winston.transports.File({ 
          filename: 'logs/performance.log',
          level: 'info'
        })
      ]
    });
  }

  static getInstance(): PerformanceMonitor {
    if (!PerformanceMonitor.instance) {
      PerformanceMonitor.instance = new PerformanceMonitor();
    }
    return PerformanceMonitor.instance;
  }

  /**
   * 함수 실행 시간 측정
   */
  async measureExecutionTime<T>(
    operation: string,
    fn: () => Promise<T>
  ): Promise<{ result: T; duration: number }> {
    const startTime = performance.now();
    
    try {
      const result = await fn();
      const duration = performance.now() - startTime;
      
      this.recordMetric(operation, duration);
      
      if (duration > 1000) { // 1초 이상인 경우 로깅
        this.logger.warn(`Slow operation detected: ${operation}`, {
          duration: `${duration.toFixed(2)}ms`,
          operation
        });
      }
      
      return { result, duration };
    } catch (error) {
      const duration = performance.now() - startTime;
      this.logger.error(`Operation failed: ${operation}`, {
        duration: `${duration.toFixed(2)}ms`,
        operation,
        error: error instanceof Error ? error.message : 'Unknown error'
      });
      throw error;
    }
  }

  /**
   * 메트릭 기록
   */
  recordMetric(operation: string, duration: number): void {
    if (!this.metrics.has(operation)) {
      this.metrics.set(operation, []);
    }
    
    const operationMetrics = this.metrics.get(operation)!;
    operationMetrics.push(duration);
    
    // 최대 100개 항목만 유지 (메모리 절약)
    if (operationMetrics.length > 100) {
      operationMetrics.shift();
    }
  }

  /**
   * 특정 작업의 통계 조회
   */
  getOperationStats(operation: string): {
    count: number;
    average: number;
    min: number;
    max: number;
    p95: number;
  } | null {
    const metrics = this.metrics.get(operation);
    if (!metrics || metrics.length === 0) {
      return null;
    }

    const sorted = [...metrics].sort((a, b) => a - b);
    const count = sorted.length;
    const average = sorted.reduce((sum, val) => sum + val, 0) / count;
    const min = sorted[0];
    const max = sorted[sorted.length - 1];
    const p95Index = Math.floor(count * 0.95);
    const p95 = sorted[p95Index] || sorted[sorted.length - 1];

    return {
      count,
      average: Math.round(average * 100) / 100,
      min: Math.round(min * 100) / 100,
      max: Math.round(max * 100) / 100,
      p95: Math.round(p95 * 100) / 100
    };
  }

  /**
   * 모든 작업의 통계 조회
   */
  getAllStats(): Record<string, any> {
    const stats: Record<string, any> = {};
    
    for (const [operation] of this.metrics) {
      stats[operation] = this.getOperationStats(operation);
    }
    
    return stats;
  }

  /**
   * 메모리 사용량 모니터링
   */
  getMemoryUsage(): {
    used: string;
    total: string;
    percentage: string;
  } {
    const usage = process.memoryUsage();
    const totalMemory = usage.heapTotal;
    const usedMemory = usage.heapUsed;
    const percentage = ((usedMemory / totalMemory) * 100).toFixed(2);

    return {
      used: `${Math.round(usedMemory / 1024 / 1024)}MB`,
      total: `${Math.round(totalMemory / 1024 / 1024)}MB`,
      percentage: `${percentage}%`
    };
  }

  /**
   * 성능 리포트 생성
   */
  generatePerformanceReport(): {
    timestamp: string;
    memoryUsage: any;
    operationStats: Record<string, any>;
    slowOperations: Array<{
      operation: string;
      averageTime: number;
      maxTime: number;
    }>;
  } {
    const stats = this.getAllStats();
    const slowOperations = Object.entries(stats)
      .filter(([_, stat]) => stat && stat.average > 500) // 500ms 이상
      .map(([operation, stat]) => ({
        operation,
        averageTime: stat.average,
        maxTime: stat.max
      }))
      .sort((a, b) => b.averageTime - a.averageTime);

    return {
      timestamp: new Date().toISOString(),
      memoryUsage: this.getMemoryUsage(),
      operationStats: stats,
      slowOperations
    };
  }

  /**
   * 주기적 성능 리포트 로깅
   */
  startPeriodicReporting(intervalMs: number = 60000): void {
    setInterval(() => {
      const report = this.generatePerformanceReport();
      this.logger.info('Performance Report', report);
    }, intervalMs);
  }

  /**
   * 메트릭 초기화
   */
  clearMetrics(): void {
    this.metrics.clear();
  }
}

// 싱글톤 인스턴스
export const performanceMonitor = PerformanceMonitor.getInstance();

/**
 * 데코레이터로 성능 측정 (TypeScript 데코레이터 사용 시)
 */
export function measurePerformance(operation?: string) {
  return function (target: any, propertyKey: string, descriptor: PropertyDescriptor) {
    const originalMethod = descriptor.value;
    const operationName = operation || `${target.constructor.name}.${propertyKey}`;

    descriptor.value = async function (...args: any[]) {
      return performanceMonitor.measureExecutionTime(
        operationName,
        () => originalMethod.apply(this, args)
      );
    };

    return descriptor;
  };
}

/**
 * Express 미들웨어로 API 성능 측정
 */
export function createPerformanceMiddleware() {
  return (req: any, res: any, next: any) => {
    const startTime = performance.now();
    const operation = `${req.method} ${req.route?.path || req.path}`;

    res.on('finish', () => {
      const duration = performance.now() - startTime;
      performanceMonitor.recordMetric(operation, duration);
      
      // 응답 헤더에 실행 시간 추가
      res.set('X-Response-Time', `${duration.toFixed(2)}ms`);
    });

    next();
  };
}

export default performanceMonitor;