import { Router, Response } from 'express';
import { body, param, query, validationResult } from 'express-validator';
import { authenticateToken, requireAnyRole, AuthenticatedRequest } from '../middleware/auth.js';
import { UserRole } from '../types/common.js';
import ReviewSchedulingService, { ReviewItem, SchedulingOptions } from '../services/reviewSchedulingService.js';
import ReviewSchedulingCache from '../services/reviewSchedulingCache.js';
import ReviewScheduler from '../services/reviewScheduler.js';
import { logger } from '../config/logger.js';

const router = Router();

/**
 * 개인화된 복습 스케줄 조회
 * GET /api/review-scheduling/schedule
 */
router.get('/schedule',
  authenticateToken,
  [
    query('maxItems').optional().isInt({ min: 1, max: 100 }).withMessage('maxItems must be between 1-100'),
    query('timeWindow.startHour').optional().isInt({ min: 0, max: 23 }).withMessage('startHour must be 0-23'),
    query('timeWindow.endHour').optional().isInt({ min: 0, max: 23 }).withMessage('endHour must be 0-23'),
    query('forceRefresh').optional().isBoolean().withMessage('forceRefresh must be boolean')
  ],
  async (req: AuthenticatedRequest, res: Response) => {
    try {
      const errors = validationResult(req);
      if (!errors.isEmpty()) {
        return res.status(400).json({
          success: false,
          message: 'Validation error',
          errors: errors.array()
        });
      }

      const userId = req.user?.userId!;
      const {
        maxItems = 20,
        'timeWindow.startHour': startHour = 9,
        'timeWindow.endHour': endHour = 22,
        forceRefresh = false
      } = req.query;

      // 캐시에서 먼저 확인 (강제 새로고침이 아닌 경우)
      if (!forceRefresh) {
        const cached = await ReviewSchedulingCache.getUserSchedule(userId);
        if (cached && cached.schedule.length > 0) {
          return res.json({
            success: true,
            data: {
              ...cached,
              fromCache: true
            }
          });
        }
      }

      // 스케줄링 옵션 구성
      const options: SchedulingOptions = {
        maxItems: parseInt(maxItems as string),
        timeWindow: {
          startHour: parseInt(startHour as string),
          endHour: parseInt(endHour as string)
        }
      };

      // 개인화된 스케줄 생성
      const schedule = await ReviewSchedulingService.generatePersonalizedSchedule(
        userId,
        options
      );

      // 결과 캐시
      await ReviewSchedulingCache.cacheUserSchedule(userId, schedule, options);

      res.json({
        success: true,
        data: {
          schedule,
          options,
          generatedAt: new Date(),
          totalItems: schedule.length,
          overdueCount: schedule.filter(item => item.isOverdue).length,
          highPriorityCount: schedule.filter(item => item.priorityScore > 70).length,
          fromCache: false
        }
      });

    } catch (error) {
      logger.error('Error generating review schedule:', error);
      res.status(500).json({
        success: false,
        message: 'Failed to generate review schedule'
      });
    }
  }
);

/**
 * 복습 완료 처리 및 다음 스케줄 생성
 * POST /api/review-scheduling/complete
 */
router.post('/complete',
  authenticateToken,
  [
    body('scheduleId').isString().notEmpty().withMessage('Schedule ID is required'),
    body('isSuccess').isBoolean().withMessage('isSuccess is required'),
    body('responseTime').optional().isNumeric().withMessage('responseTime must be numeric'),
    body('difficulty').optional().isFloat({ min: 1, max: 10 }).withMessage('difficulty must be 1-10'),
    body('sessionId').optional().isString().withMessage('sessionId must be string')
  ],
  async (req: AuthenticatedRequest, res: Response) => {
    try {
      const errors = validationResult(req);
      if (!errors.isEmpty()) {
        return res.status(400).json({
          success: false,
          message: 'Validation error',
          errors: errors.array()
        });
      }

      const userId = req.user?.userId!;
      const { scheduleId, isSuccess, responseTime, difficulty, sessionId } = req.body;

      // 복습 완료 처리
      await ReviewSchedulingService.completeReview(
        scheduleId,
        isSuccess,
        responseTime
      );

      // 완료율 업데이트
      await ReviewSchedulingCache.updateCompletionRate(userId, isSuccess);

      // 사용자 스케줄 캐시 무효화 (새로운 스케줄 생성을 위해)
      await ReviewSchedulingCache.clearUserScheduleCache(userId);

      res.json({
        success: true,
        message: 'Review completed successfully',
        data: {
          completedAt: new Date(),
          scheduleId,
          isSuccess,
          nextScheduleGenerated: true
        }
      });

    } catch (error) {
      logger.error('Error completing review:', error);
      res.status(500).json({
        success: false,
        message: 'Failed to complete review'
      });
    }
  }
);

/**
 * 새로운 복습 스케줄 등록
 * POST /api/review-scheduling/schedule
 */
router.post('/schedule',
  authenticateToken,
  [
    body('problemId').isString().notEmpty().withMessage('Problem ID is required'),
    body('isSuccess').isBoolean().withMessage('isSuccess is required'),
    body('responseTime').optional().isNumeric().withMessage('responseTime must be numeric'),
    body('difficulty').optional().isFloat({ min: 1, max: 10 }).withMessage('difficulty must be 1-10'),
    body('sessionId').optional().isString().withMessage('sessionId must be string')
  ],
  async (req: AuthenticatedRequest, res: Response) => {
    try {
      const errors = validationResult(req);
      if (!errors.isEmpty()) {
        return res.status(400).json({
          success: false,
          message: 'Validation error',
          errors: errors.array()
        });
      }

      const userId = req.user?.userId!;
      const { problemId, isSuccess, responseTime, difficulty, sessionId } = req.body;

      // 새로운 복습 스케줄 등록
      await ReviewSchedulingService.scheduleReview({
        userId,
        problemId,
        isSuccess,
        responseTime,
        difficulty,
        sessionId
      });

      // 사용자 스케줄 캐시 무효화
      await ReviewSchedulingCache.clearUserScheduleCache(userId);

      res.json({
        success: true,
        message: 'Review schedule created successfully',
        data: {
          userId,
          problemId,
          scheduledAt: new Date(),
          isSuccess
        }
      });

    } catch (error) {
      logger.error('Error scheduling review:', error);
      res.status(500).json({
        success: false,
        message: 'Failed to schedule review'
      });
    }
  }
);

/**
 * 시간 범위별 복습 스케줄 조회
 * GET /api/review-scheduling/schedule/range
 */
router.get('/schedule/range',
  authenticateToken,
  [
    query('startTime').isISO8601().withMessage('startTime must be valid ISO date'),
    query('endTime').isISO8601().withMessage('endTime must be valid ISO date')
  ],
  async (req: AuthenticatedRequest, res: Response) => {
    try {
      const errors = validationResult(req);
      if (!errors.isEmpty()) {
        return res.status(400).json({
          success: false,
          message: 'Validation error',
          errors: errors.array()
        });
      }

      const userId = req.user?.userId!;
      const { startTime, endTime } = req.query;

      const start = new Date(startTime as string);
      const end = new Date(endTime as string);

      // 날짜 범위 검증
      if (end <= start) {
        return res.status(400).json({
          success: false,
          message: 'endTime must be after startTime'
        });
      }

      // 최대 30일 범위 제한
      const daysDiff = (end.getTime() - start.getTime()) / (1000 * 60 * 60 * 24);
      if (daysDiff > 30) {
        return res.status(400).json({
          success: false,
          message: 'Date range cannot exceed 30 days'
        });
      }

      const schedules = await ReviewSchedulingService.getScheduleByTimeRange(
        userId,
        start,
        end
      );

      res.json({
        success: true,
        data: {
          schedules,
          dateRange: { startTime: start, endTime: end },
          totalCount: schedules.length,
          overdueCount: schedules.filter(s => s.isOverdue).length
        }
      });

    } catch (error) {
      logger.error('Error getting schedule range:', error);
      res.status(500).json({
        success: false,
        message: 'Failed to get schedule range'
      });
    }
  }
);

/**
 * 복습 스케줄 통계 조회
 * GET /api/review-scheduling/stats
 */
router.get('/stats',
  authenticateToken,
  async (req: AuthenticatedRequest, res: Response) => {
    try {
      const userId = req.user?.userId!;

      // 캐시된 통계 먼저 확인
      const cachedStats = await ReviewSchedulingCache.getScheduleStats(userId);
      
      if (cachedStats) {
        return res.json({
          success: true,
          data: {
            ...cachedStats,
            fromCache: true
          }
        });
      }

      // 통계 생성
      const stats = await ReviewSchedulingService.getScheduleStats(userId);

      // 추가 성과 데이터 (실제로는 별도 서비스에서 계산)
      const enhancedStats = {
        ...stats,
        performance: {
          completionRate: 0.85, // 임시값
          averageResponseTime: 45, // 임시값 (초)
          streakDays: 7 // 임시값
        },
        trends: {
          dailyCompletions: [8, 12, 6, 15, 9, 11, 10], // 최근 7일
          weeklyProgress: [0.82, 0.89, 0.76, 0.91] // 최근 4주
        }
      };

      // 결과 캐시
      await ReviewSchedulingCache.cacheScheduleStats(userId, enhancedStats);

      res.json({
        success: true,
        data: {
          ...enhancedStats,
          fromCache: false
        }
      });

    } catch (error) {
      logger.error('Error getting schedule stats:', error);
      res.status(500).json({
        success: false,
        message: 'Failed to get schedule stats'
      });
    }
  }
);

/**
 * 지연된 복습 항목 조회
 * GET /api/review-scheduling/overdue
 */
router.get('/overdue',
  authenticateToken,
  async (req: AuthenticatedRequest, res: Response) => {
    try {
      const userId = req.user?.userId!;

      const overdueData = await ReviewSchedulingCache.getOverdueItems(userId);

      if (!overdueData) {
        return res.json({
          success: true,
          data: {
            items: [],
            totalCount: 0,
            criticalCount: 0,
            averageOverdueHours: 0,
            lastUpdated: new Date()
          }
        });
      }

      res.json({
        success: true,
        data: overdueData
      });

    } catch (error) {
      logger.error('Error getting overdue items:', error);
      res.status(500).json({
        success: false,
        message: 'Failed to get overdue items'
      });
    }
  }
);

/**
 * 시간대별 복습 슬롯 조회
 * GET /api/review-scheduling/time-slots/:date
 */
router.get('/time-slots/:date',
  authenticateToken,
  [
    param('date').matches(/^\d{4}-\d{2}-\d{2}$/).withMessage('date must be in YYYY-MM-DD format')
  ],
  async (req: AuthenticatedRequest, res: Response) => {
    try {
      const errors = validationResult(req);
      if (!errors.isEmpty()) {
        return res.status(400).json({
          success: false,
          message: 'Validation error',
          errors: errors.array()
        });
      }

      const userId = req.user?.userId!;
      const { date } = req.params;

      const timeSlots = await ReviewSchedulingCache.getTimeSlots(userId, date);

      if (!timeSlots) {
        // 기본 시간 슬롯 생성
        const defaultSlots = Array.from({ length: 14 }, (_, i) => ({
          hour: i + 9, // 9시부터 22시까지
          available: true,
          scheduledCount: 0,
          maxCapacity: 5,
          recommendedItems: []
        }));

        const slotsData = {
          date,
          slots: defaultSlots,
          lastUpdated: new Date(),
          totalAvailable: defaultSlots.length
        };

        await ReviewSchedulingCache.cacheTimeSlots(userId, date, defaultSlots);

        return res.json({
          success: true,
          data: slotsData
        });
      }

      res.json({
        success: true,
        data: timeSlots
      });

    } catch (error) {
      logger.error('Error getting time slots:', error);
      res.status(500).json({
        success: false,
        message: 'Failed to get time slots'
      });
    }
  }
);

/**
 * 실시간 스케줄링 메트릭 조회 (관리자용)
 * GET /api/review-scheduling/metrics
 */
router.get('/metrics',
  authenticateToken,
  requireAnyRole([UserRole.ADMIN, UserRole.SUPER_ADMIN]),
  async (req: AuthenticatedRequest, res: Response) => {
    try {
      const metrics = await ReviewSchedulingCache.getRealtimeMetrics();
      const cacheMetrics = await ReviewSchedulingCache.getCachePerformanceMetrics();
      
      const scheduler = ReviewScheduler.getInstance();
      const schedulerStats = {
        jobStats: scheduler.getJobStats(),
        config: scheduler.getConfig(),
        runningJobs: scheduler.getRunningJobs()
      };

      res.json({
        success: true,
        data: {
          realtime: metrics,
          cache: cacheMetrics,
          scheduler: schedulerStats,
          retrievedAt: new Date()
        }
      });

    } catch (error) {
      logger.error('Error getting scheduling metrics:', error);
      res.status(500).json({
        success: false,
        message: 'Failed to get scheduling metrics'
      });
    }
  }
);

/**
 * 배치 업데이트 상태 조회 (관리자용)
 * GET /api/review-scheduling/batch/:batchId
 */
router.get('/batch/:batchId',
  authenticateToken,
  requireAnyRole([UserRole.ADMIN, UserRole.SUPER_ADMIN]),
  [
    param('batchId').isString().notEmpty().withMessage('Batch ID is required')
  ],
  async (req: AuthenticatedRequest, res: Response) => {
    try {
      const errors = validationResult(req);
      if (!errors.isEmpty()) {
        return res.status(400).json({
          success: false,
          message: 'Validation error',
          errors: errors.array()
        });
      }

      const { batchId } = req.params;

      const batchInfo = await ReviewSchedulingCache.getBatchUpdateInfo(batchId);

      if (!batchInfo) {
        return res.status(404).json({
          success: false,
          message: 'Batch not found'
        });
      }

      res.json({
        success: true,
        data: batchInfo
      });

    } catch (error) {
      logger.error('Error getting batch info:', error);
      res.status(500).json({
        success: false,
        message: 'Failed to get batch info'
      });
    }
  }
);

/**
 * 스케줄러 제어 (관리자용)
 * POST /api/review-scheduling/scheduler/:action
 */
router.post('/scheduler/:action',
  authenticateToken,
  requireAnyRole([UserRole.ADMIN, UserRole.SUPER_ADMIN]),
  [
    param('action').isIn(['start', 'stop', 'restart']).withMessage('action must be start, stop, or restart')
  ],
  async (req: AuthenticatedRequest, res: Response) => {
    try {
      const errors = validationResult(req);
      if (!errors.isEmpty()) {
        return res.status(400).json({
          success: false,
          message: 'Validation error',
          errors: errors.array()
        });
      }

      const { action } = req.params;
      const scheduler = ReviewScheduler.getInstance();

      switch (action) {
        case 'start':
          scheduler.start();
          break;
        case 'stop':
          scheduler.stop();
          break;
        case 'restart':
          scheduler.stop();
          setTimeout(() => scheduler.start(), 1000);
          break;
      }

      logger.info(`Scheduler ${action} requested by user ${req.user?.userId}`);

      res.json({
        success: true,
        message: `Scheduler ${action} completed`,
        data: {
          action,
          timestamp: new Date(),
          requestedBy: req.user?.userId
        }
      });

    } catch (error) {
      logger.error('Error controlling scheduler:', error);
      res.status(500).json({
        success: false,
        message: 'Failed to control scheduler'
      });
    }
  }
);

/**
 * 사용자 스케줄 캐시 초기화
 * DELETE /api/review-scheduling/cache
 */
router.delete('/cache',
  authenticateToken,
  async (req: AuthenticatedRequest, res: Response) => {
    try {
      const userId = req.user?.userId!;

      const success = await ReviewSchedulingCache.clearUserScheduleCache(userId);

      res.json({
        success,
        message: success ? 'Cache cleared successfully' : 'Failed to clear some cache entries',
        data: {
          clearedAt: new Date(),
          userId
        }
      });

    } catch (error) {
      logger.error('Error clearing cache:', error);
      res.status(500).json({
        success: false,
        message: 'Failed to clear cache'
      });
    }
  }
);

export default router;