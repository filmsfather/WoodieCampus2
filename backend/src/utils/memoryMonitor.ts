import { performance } from 'perf_hooks';
import { EventEmitter } from 'events';
import winston from 'winston';

/**
 * 메모리 사용량 모니터링 및 최적화 유틸리티
 */
export class MemoryMonitor extends EventEmitter {
  private static instance: MemoryMonitor;
  private logger: winston.Logger;
  private monitoringInterval: NodeJS.Timeout | null = null;
  private memoryThreshold: number = 500 * 1024 * 1024; // 500MB
  private gcThreshold: number = 800 * 1024 * 1024; // 800MB
  private memoryHistory: Array<{ timestamp: number; usage: NodeJS.MemoryUsage }> = [];
  private readonly MAX_HISTORY_LENGTH = 100;

  private constructor() {
    super();
    this.logger = winston.createLogger({
      level: 'info',
      format: winston.format.combine(
        winston.format.timestamp(),
        winston.format.json()
      ),
      transports: [
        new winston.transports.File({ 
          filename: 'logs/memory-monitor.log',
          level: 'info'
        }),
        new winston.transports.Console({
          level: 'warn',
          format: winston.format.simple()
        })
      ]
    });
  }

  static getInstance(): MemoryMonitor {
    if (!MemoryMonitor.instance) {
      MemoryMonitor.instance = new MemoryMonitor();
    }
    return MemoryMonitor.instance;
  }

  /**
   * 메모리 모니터링 시작
   */
  startMonitoring(intervalMs: number = 30000): void {
    if (this.monitoringInterval) {
      this.stopMonitoring();
    }

    this.logger.info('Memory monitoring started', { intervalMs });

    this.monitoringInterval = setInterval(() => {
      this.checkMemoryUsage();
    }, intervalMs);

    // 프로세스 종료 시 정리
    process.on('SIGINT', () => this.stopMonitoring());
    process.on('SIGTERM', () => this.stopMonitoring());
  }

  /**
   * 메모리 모니터링 중지
   */
  stopMonitoring(): void {
    if (this.monitoringInterval) {
      clearInterval(this.monitoringInterval);
      this.monitoringInterval = null;
      this.logger.info('Memory monitoring stopped');
    }
  }

  /**
   * 현재 메모리 사용량 체크
   */
  private checkMemoryUsage(): void {
    const usage = process.memoryUsage();
    const timestamp = Date.now();

    // 메모리 히스토리 추가
    this.memoryHistory.push({ timestamp, usage });
    if (this.memoryHistory.length > this.MAX_HISTORY_LENGTH) {
      this.memoryHistory.shift();
    }

    // 메모리 사용량이 임계값을 초과하는 경우
    if (usage.heapUsed > this.memoryThreshold) {
      this.logger.warn('High memory usage detected', {
        heapUsed: `${Math.round(usage.heapUsed / 1024 / 1024)}MB`,
        heapTotal: `${Math.round(usage.heapTotal / 1024 / 1024)}MB`,
        percentage: `${Math.round((usage.heapUsed / usage.heapTotal) * 100)}%`
      });

      this.emit('highMemoryUsage', usage);
    }

    // GC 임계값 초과 시 수동 가비지 컬렉션 시도
    if (usage.heapUsed > this.gcThreshold && global.gc) {
      this.logger.info('Triggering manual garbage collection');
      global.gc();
      
      const afterGc = process.memoryUsage();
      const freedMemory = usage.heapUsed - afterGc.heapUsed;
      
      this.logger.info('Garbage collection completed', {
        freedMemory: `${Math.round(freedMemory / 1024 / 1024)}MB`,
        heapUsedAfter: `${Math.round(afterGc.heapUsed / 1024 / 1024)}MB`
      });

      this.emit('gcTriggered', { before: usage, after: afterGc, freed: freedMemory });
    }
  }

  /**
   * 현재 메모리 사용량 조회
   */
  getCurrentMemoryUsage(): {
    heapUsed: string;
    heapTotal: string;
    external: string;
    arrayBuffers: string;
    percentage: number;
    rss: string;
  } {
    const usage = process.memoryUsage();
    const percentage = Math.round((usage.heapUsed / usage.heapTotal) * 100);

    return {
      heapUsed: `${Math.round(usage.heapUsed / 1024 / 1024)}MB`,
      heapTotal: `${Math.round(usage.heapTotal / 1024 / 1024)}MB`,
      external: `${Math.round(usage.external / 1024 / 1024)}MB`,
      arrayBuffers: `${Math.round(usage.arrayBuffers / 1024 / 1024)}MB`,
      percentage,
      rss: `${Math.round(usage.rss / 1024 / 1024)}MB`
    };
  }

  /**
   * 메모리 사용량 트렌드 분석
   */
  getMemoryTrend(): {
    trend: 'increasing' | 'stable' | 'decreasing';
    averageUsage: number;
    peakUsage: number;
    growthRate: number;
    recommendations: string[];
  } {
    if (this.memoryHistory.length < 10) {
      return {
        trend: 'stable',
        averageUsage: 0,
        peakUsage: 0,
        growthRate: 0,
        recommendations: ['Insufficient data for trend analysis']
      };
    }

    const recentHistory = this.memoryHistory.slice(-10);
    const usages = recentHistory.map(h => h.usage.heapUsed);
    
    const averageUsage = usages.reduce((sum, usage) => sum + usage, 0) / usages.length;
    const peakUsage = Math.max(...usages);
    
    // 증가율 계산 (첫 번째와 마지막 값 비교)
    const firstUsage = usages[0];
    const lastUsage = usages[usages.length - 1];
    const growthRate = ((lastUsage - firstUsage) / firstUsage) * 100;

    let trend: 'increasing' | 'stable' | 'decreasing';
    if (growthRate > 5) {
      trend = 'increasing';
    } else if (growthRate < -5) {
      trend = 'decreasing';
    } else {
      trend = 'stable';
    }

    const recommendations = this.generateRecommendations(trend, averageUsage, peakUsage, growthRate);

    return {
      trend,
      averageUsage: Math.round(averageUsage / 1024 / 1024),
      peakUsage: Math.round(peakUsage / 1024 / 1024),
      growthRate: Math.round(growthRate * 100) / 100,
      recommendations
    };
  }

  /**
   * 최적화 권장사항 생성
   */
  private generateRecommendations(
    trend: string, 
    avgUsage: number, 
    peakUsage: number, 
    growthRate: number
  ): string[] {
    const recommendations: string[] = [];

    if (trend === 'increasing' && growthRate > 10) {
      recommendations.push('메모리 사용량이 지속적으로 증가하고 있습니다. 메모리 누수를 점검하세요.');
    }

    if (peakUsage > this.memoryThreshold) {
      recommendations.push('피크 메모리 사용량이 임계값을 초과했습니다. 캐시 전략을 재검토하세요.');
    }

    if (avgUsage > this.memoryThreshold * 0.8) {
      recommendations.push('평균 메모리 사용량이 높습니다. 불필요한 데이터 구조를 정리하세요.');
    }

    if (growthRate > 15) {
      recommendations.push('메모리 증가율이 높습니다. 데이터 파이프라인을 최적화하세요.');
    }

    if (recommendations.length === 0) {
      recommendations.push('메모리 사용량이 정상 범위입니다.');
    }

    return recommendations;
  }

  /**
   * 메모리 최적화 실행
   */
  async optimizeMemory(): Promise<{
    beforeOptimization: NodeJS.MemoryUsage;
    afterOptimization: NodeJS.MemoryUsage;
    optimizationSteps: string[];
    memoryFreed: number;
  }> {
    const beforeOptimization = process.memoryUsage();
    const optimizationSteps: string[] = [];

    // 1. 가비지 컬렉션 실행
    if (global.gc) {
      global.gc();
      optimizationSteps.push('Manual garbage collection executed');
    }

    // 2. 메모리 히스토리 정리
    if (this.memoryHistory.length > 50) {
      this.memoryHistory.splice(0, this.memoryHistory.length - 50);
      optimizationSteps.push('Memory history trimmed');
    }

    // 3. 이벤트 리스너 정리
    const listenerCount = this.listenerCount('highMemoryUsage');
    if (listenerCount > 10) {
      this.removeAllListeners('highMemoryUsage');
      optimizationSteps.push('Event listeners cleaned up');
    }

    // 최적화 후 메모리 사용량
    const afterOptimization = process.memoryUsage();
    const memoryFreed = beforeOptimization.heapUsed - afterOptimization.heapUsed;

    this.logger.info('Memory optimization completed', {
      memoryFreed: `${Math.round(memoryFreed / 1024 / 1024)}MB`,
      steps: optimizationSteps
    });

    return {
      beforeOptimization,
      afterOptimization,
      optimizationSteps,
      memoryFreed
    };
  }

  /**
   * 메모리 프로파일링 데이터 수집
   */
  profileMemoryUsage(): {
    timestamp: string;
    memoryUsage: NodeJS.MemoryUsage;
    cpuUsage: NodeJS.CpuUsage;
    uptime: number;
    loadAverage: number[];
  } {
    return {
      timestamp: new Date().toISOString(),
      memoryUsage: process.memoryUsage(),
      cpuUsage: process.cpuUsage(),
      uptime: process.uptime(),
      loadAverage: require('os').loadavg()
    };
  }

  /**
   * 메모리 사용량 보고서 생성
   */
  generateMemoryReport(): {
    summary: any;
    trend: any;
    currentUsage: any;
    history: Array<{ time: string; heapUsed: number; heapTotal: number }>;
    recommendations: string[];
  } {
    const summary = this.getCurrentMemoryUsage();
    const trend = this.getMemoryTrend();
    const currentUsage = this.profileMemoryUsage();

    const history = this.memoryHistory.slice(-20).map(entry => ({
      time: new Date(entry.timestamp).toISOString(),
      heapUsed: Math.round(entry.usage.heapUsed / 1024 / 1024),
      heapTotal: Math.round(entry.usage.heapTotal / 1024 / 1024)
    }));

    return {
      summary,
      trend,
      currentUsage,
      history,
      recommendations: trend.recommendations
    };
  }

  /**
   * 메모리 누수 탐지
   */
  detectMemoryLeaks(): {
    suspectedLeak: boolean;
    leakIndicators: string[];
    severity: 'low' | 'medium' | 'high';
  } {
    const trend = this.getMemoryTrend();
    const leakIndicators: string[] = [];
    let suspectedLeak = false;
    let severity: 'low' | 'medium' | 'high' = 'low';

    // 지속적인 메모리 증가
    if (trend.trend === 'increasing' && trend.growthRate > 20) {
      suspectedLeak = true;
      leakIndicators.push('Continuous memory growth detected');
      severity = 'high';
    }

    // 피크 사용량이 계속 증가
    if (this.memoryHistory.length >= 10) {
      const recentPeaks = this.memoryHistory.slice(-10).map(h => h.usage.heapUsed);
      const oldPeaks = this.memoryHistory.slice(-20, -10).map(h => h.usage.heapUsed);
      
      if (recentPeaks.length && oldPeaks.length) {
        const recentAvgPeak = recentPeaks.reduce((a, b) => a + b) / recentPeaks.length;
        const oldAvgPeak = oldPeaks.reduce((a, b) => a + b) / oldPeaks.length;
        
        if (recentAvgPeak > oldAvgPeak * 1.5) {
          suspectedLeak = true;
          leakIndicators.push('Peak memory usage increasing over time');
          severity = severity === 'high' ? 'high' : 'medium';
        }
      }
    }

    // 가비지 컬렉션 후에도 높은 메모리 사용량
    const currentUsage = process.memoryUsage();
    if (currentUsage.heapUsed > currentUsage.heapTotal * 0.9) {
      suspectedLeak = true;
      leakIndicators.push('High memory usage after potential GC');
      severity = 'medium';
    }

    return {
      suspectedLeak,
      leakIndicators,
      severity
    };
  }

  /**
   * 임계값 설정
   */
  setThresholds(memoryThreshold: number, gcThreshold: number): void {
    this.memoryThreshold = memoryThreshold;
    this.gcThreshold = gcThreshold;
    
    this.logger.info('Memory thresholds updated', {
      memoryThreshold: `${Math.round(memoryThreshold / 1024 / 1024)}MB`,
      gcThreshold: `${Math.round(gcThreshold / 1024 / 1024)}MB`
    });
  }
}

// 싱글톤 인스턴스
export const memoryMonitor = MemoryMonitor.getInstance();

/**
 * Express 미들웨어로 메모리 사용량 트래킹
 */
export function createMemoryTrackingMiddleware() {
  return (req: any, res: any, next: any) => {
    const startMemory = process.memoryUsage().heapUsed;
    
    res.on('finish', () => {
      const endMemory = process.memoryUsage().heapUsed;
      const memoryDelta = endMemory - startMemory;
      
      // 메모리 사용량이 10MB 이상 증가한 경우 로깅
      if (Math.abs(memoryDelta) > 10 * 1024 * 1024) {
        memoryMonitor.emit('highMemoryRequest', {
          url: req.url,
          method: req.method,
          memoryDelta: Math.round(memoryDelta / 1024 / 1024),
          statusCode: res.statusCode
        });
      }
    });

    next();
  };
}

/**
 * 메모리 사용량 측정 데코레이터
 */
export function measureMemoryUsage(target: any, propertyKey: string, descriptor: PropertyDescriptor) {
  const originalMethod = descriptor.value;

  descriptor.value = async function (...args: any[]) {
    const startMemory = process.memoryUsage().heapUsed;
    const startTime = performance.now();
    
    try {
      const result = await originalMethod.apply(this, args);
      
      const endMemory = process.memoryUsage().heapUsed;
      const endTime = performance.now();
      const memoryDelta = endMemory - startMemory;
      const executionTime = endTime - startTime;
      
      if (Math.abs(memoryDelta) > 5 * 1024 * 1024) { // 5MB 임계값
        memoryMonitor.emit('methodMemoryUsage', {
          className: target.constructor.name,
          methodName: propertyKey,
          memoryDelta: Math.round(memoryDelta / 1024 / 1024),
          executionTime: Math.round(executionTime)
        });
      }
      
      return result;
    } catch (error) {
      const endMemory = process.memoryUsage().heapUsed;
      const memoryDelta = endMemory - startMemory;
      
      memoryMonitor.emit('methodMemoryError', {
        className: target.constructor.name,
        methodName: propertyKey,
        memoryDelta: Math.round(memoryDelta / 1024 / 1024),
        error: error instanceof Error ? error.message : 'Unknown error'
      });
      
      throw error;
    }
  };

  return descriptor;
}

export default memoryMonitor;