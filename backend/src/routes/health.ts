import { Router, Request, Response } from 'express';
import { pool } from '../config/database.js';
import { cacheUtils } from '../config/redis.js';
import { logger } from '../config/logger.js';

const router = Router();

interface HealthCheckResult {
  status: 'healthy' | 'unhealthy' | 'degraded';
  timestamp: string;
  uptime: number;
  version: string;
  services: {
    database: {
      status: 'healthy' | 'unhealthy';
      responseTime?: number;
      error?: string;
    };
    redis: {
      status: 'healthy' | 'unhealthy';
      responseTime?: number;
      error?: string;
    };
    memory: {
      used: number;
      total: number;
      percentage: number;
    };
    cpu: {
      usage: number;
    };
  };
}

// 기본 헬스체크 엔드포인트
router.get('/', async (req: Request, res: Response) => {
  const startTime = Date.now();
  
  try {
    const healthCheck: HealthCheckResult = {
      status: 'healthy',
      timestamp: new Date().toISOString(),
      uptime: process.uptime(),
      version: process.env.npm_package_version || '1.0.0',
      services: {
        database: {
          status: 'unhealthy'
        },
        redis: {
          status: 'unhealthy'
        },
        memory: {
          used: 0,
          total: 0,
          percentage: 0
        },
        cpu: {
          usage: 0
        }
      }
    };

    // 데이터베이스 헬스체크
    try {
      const dbStartTime = Date.now();
      const dbResult = await pool.query('SELECT NOW() as current_time');
      const dbResponseTime = Date.now() - dbStartTime;
      
      healthCheck.services.database = {
        status: 'healthy',
        responseTime: dbResponseTime
      };
      
      logger.debug(`Database health check passed in ${dbResponseTime}ms`);
    } catch (error) {
      healthCheck.services.database = {
        status: 'unhealthy',
        error: error instanceof Error ? error.message : 'Unknown database error'
      };
      healthCheck.status = 'degraded';
      logger.error('Database health check failed:', error);
    }

    // Redis 헬스체크
    try {
      const redisStartTime = Date.now();
      await cacheUtils.set('health_check', Date.now().toString(), 10);
      const testValue = await cacheUtils.get('health_check');
      const redisResponseTime = Date.now() - redisStartTime;
      
      if (testValue) {
        healthCheck.services.redis = {
          status: 'healthy',
          responseTime: redisResponseTime
        };
        logger.debug(`Redis health check passed in ${redisResponseTime}ms`);
      } else {
        throw new Error('Redis test value not retrieved');
      }
    } catch (error) {
      healthCheck.services.redis = {
        status: 'unhealthy',
        error: error instanceof Error ? error.message : 'Unknown Redis error'
      };
      healthCheck.status = 'degraded';
      logger.error('Redis health check failed:', error);
    }

    // 메모리 사용량
    const memoryUsage = process.memoryUsage();
    const totalMemory = memoryUsage.heapTotal;
    const usedMemory = memoryUsage.heapUsed;
    const memoryPercentage = (usedMemory / totalMemory) * 100;

    healthCheck.services.memory = {
      used: Math.round(usedMemory / 1024 / 1024), // MB
      total: Math.round(totalMemory / 1024 / 1024), // MB
      percentage: Math.round(memoryPercentage * 100) / 100
    };

    // CPU 사용량 (간단한 근사치)
    const cpuUsage = process.cpuUsage();
    const cpuPercentage = (cpuUsage.user + cpuUsage.system) / 1000000; // 마이크로초를 초로 변환
    
    healthCheck.services.cpu = {
      usage: Math.round(cpuPercentage * 100) / 100
    };

    // 전체 상태 결정
    if (healthCheck.services.database.status === 'unhealthy' || 
        healthCheck.services.redis.status === 'unhealthy') {
      healthCheck.status = 'unhealthy';
    }

    // 메모리 사용량이 90% 이상이면 degraded
    if (memoryPercentage > 90) {
      healthCheck.status = healthCheck.status === 'healthy' ? 'degraded' : healthCheck.status;
    }

    // HTTP 상태 코드 결정
    const httpStatus = healthCheck.status === 'healthy' ? 200 : 
                      healthCheck.status === 'degraded' ? 200 : 503;

    const totalResponseTime = Date.now() - startTime;
    logger.debug(`Health check completed in ${totalResponseTime}ms with status: ${healthCheck.status}`);

    res.status(httpStatus).json(healthCheck);

  } catch (error) {
    logger.error('Health check endpoint error:', error);
    
    res.status(503).json({
      status: 'unhealthy',
      timestamp: new Date().toISOString(),
      error: error instanceof Error ? error.message : 'Unknown error',
      uptime: process.uptime()
    });
  }
});

// 간단한 liveness probe (Kubernetes/Docker 용)
router.get('/live', (req: Request, res: Response) => {
  res.status(200).json({
    status: 'alive',
    timestamp: new Date().toISOString(),
    uptime: process.uptime()
  });
});

// Readiness probe (서비스가 요청을 받을 준비가 되었는지)
router.get('/ready', async (req: Request, res: Response) => {
  try {
    // 기본적인 준비 상태 체크
    await pool.query('SELECT 1');
    
    res.status(200).json({
      status: 'ready',
      timestamp: new Date().toISOString()
    });
  } catch (error) {
    logger.error('Readiness check failed:', error);
    
    res.status(503).json({
      status: 'not_ready',
      timestamp: new Date().toISOString(),
      error: error instanceof Error ? error.message : 'Unknown error'
    });
  }
});

// 상세한 시스템 정보 (관리자용)
router.get('/system', (req: Request, res: Response) => {
  const systemInfo = {
    node: {
      version: process.version,
      platform: process.platform,
      arch: process.arch,
      uptime: process.uptime()
    },
    memory: process.memoryUsage(),
    cpu: process.cpuUsage(),
    environment: process.env.NODE_ENV,
    pid: process.pid,
    timestamp: new Date().toISOString()
  };

  res.json(systemInfo);
});

export default router;