import { Router, Response } from 'express';
import { body, param, query, validationResult } from 'express-validator';
import { PrismaClient } from "@prisma/client"
import { ForgettingCurveLevel, ReviewStatus } from '../types/common.js';
import { authenticateToken, AuthenticatedRequest } from '../middleware/auth.js';
import ForgettingCurveAlgorithm, { ReviewPerformanceData } from '../services/forgettingCurveService.js';
import { cacheUtils } from '../config/redis.js';
import progressService from '../services/progressService.js';
import { 
  ForgettingCurveProfileResponse, 
  ReviewScheduleResponse, 
  LearningSessionResponse,
  ForgettingCurveAnalyticsResponse 
} from '../types/api.js';

const router = Router();
const prisma = new PrismaClient();

// 모든 라우트에 인증 미들웨어 적용
// 모든 라우트에 인증 미들웨어 적용됨 (개별 라우트에 authenticateToken 사용)

/**
 * 사용자의 망각곡선 프로필 조회/생성
 * GET /api/forgetting-curve/profile
 */
router.get('/profile', authenticateToken, async (req: AuthenticatedRequest, res: Response) => {
  try {
    const userId = req.user!.userId;
    
    // 캐시에서 먼저 확인
    const cacheKey = `forgetting_curve_profile:${userId}`;
    const cached = await cacheUtils.get(cacheKey);
    if (cached) {
      return res.json({ success: true, data: cached });
    }
    
    let profile = await prisma.forgettingCurveProfile.findUnique({
      where: { userId },
      include: {
        user: {
          select: { id: true, firstName: true, lastName: true }
        },
        reviewSchedules: {
          where: { status: ReviewStatus.SCHEDULED },
          orderBy: { scheduledAt: 'asc' },
          take: 10
        }
      }
    });
    
    // 프로필이 없으면 생성
    if (!profile) {
      profile = await prisma.forgettingCurveProfile.create({
        data: {
          userId,
          memoryRetentionFactor: 1.0,
          difficultyAdjustment: 1.0,
          successRate: 0.0,
          totalReviews: 0,
          successfulReviews: 0
        },
        include: {
          user: {
            select: { id: true, firstName: true, lastName: true }
          },
          reviewSchedules: {
            where: { status: ReviewStatus.SCHEDULED },
            orderBy: { scheduledAt: 'asc' },
            take: 10
          }
        }
      });
    }
    
    const response: ForgettingCurveProfileResponse = {
      id: profile.id,
      memoryRetentionFactor: profile.memoryRetentionFactor,
      difficultyAdjustment: profile.difficultyAdjustment,
      successRate: profile.successRate,
      totalReviews: profile.totalReviews,
      successfulReviews: profile.successfulReviews,
      subjectAdjustments: profile.subjectAdjustments as Record<string, number> || {},
      upcomingReviews: profile.reviewSchedules.length,
      user: profile.user,
      createdAt: profile.createdAt,
      updatedAt: profile.updatedAt
    };
    
    // 캐시 저장 (5분)
    await cacheUtils.set(cacheKey, response, 5 * 60);
    
    res.json({ success: true, data: response });
  } catch (error) {
    console.error('Forgetting curve profile fetch error:', error);
    res.status(500).json({ 
      success: false, 
      message: '망각곡선 프로필을 조회하는 중 오류가 발생했습니다.' 
    });
  }
});

/**
 * 복습 스케줄 생성 (문제 또는 문제집 학습 완료 후)
 * POST /api/forgetting-curve/schedule-review
 */
router.post('/schedule-review', authenticateToken, [
  body('problemId').optional().isString(),
  body('problemSetId').optional().isString(),
  body('initialPerformance').isObject(),
  body('initialPerformance.isSuccess').isBoolean(),
  body('initialPerformance.responseTime').isNumeric(),
  body('initialPerformance.confidenceLevel').isInt({ min: 1, max: 5 }),
  body('initialPerformance.difficultyScore').optional().isNumeric(),
  body('initialPerformance.userScore').optional().isNumeric()
], async (req: AuthenticatedRequest, res: Response) => {
  try {
    const errors = validationResult(req);
    if (!errors.isEmpty()) {
      return res.status(400).json({ 
        success: false, 
        message: '입력 데이터가 올바르지 않습니다.',
        errors: errors.array() 
      });
    }
    
    const userId = req.user!.userId;
    const { problemId, problemSetId, initialPerformance } = req.body;
    
    if (!problemId && !problemSetId) {
      return res.status(400).json({
        success: false,
        message: '문제 ID 또는 문제집 ID 중 하나는 필수입니다.'
      });
    }
    
    // 사용자 프로필 조회/생성
    let profile = await prisma.forgettingCurveProfile.findUnique({
      where: { userId }
    });
    
    if (!profile) {
      profile = await prisma.forgettingCurveProfile.create({
        data: {
          userId,
          memoryRetentionFactor: 1.0,
          difficultyAdjustment: 1.0,
          successRate: 0.0,
          totalReviews: 0,
          successfulReviews: 0
        }
      });
    }
    
    // 망각곡선 알고리즘으로 첫 복습 시점 계산
    const performance: ReviewPerformanceData = {
      isSuccess: initialPerformance.isSuccess,
      responseTime: initialPerformance.responseTime,
      confidenceLevel: initialPerformance.confidenceLevel,
      difficultyScore: initialPerformance.difficultyScore,
      userScore: initialPerformance.userScore
    };
    
    const userProfileData = {
      memoryRetentionFactor: profile.memoryRetentionFactor,
      difficultyAdjustment: profile.difficultyAdjustment,
      successRate: profile.successRate,
      totalReviews: profile.totalReviews
    };
    
    const calculation = ForgettingCurveAlgorithm.calculateNextReview(
      ForgettingCurveLevel.LEVEL_1, // 첫 복습은 LEVEL_1부터
      performance,
      userProfileData
    );
    
    // 복습 스케줄 생성
    const reviewSchedule = await prisma.reviewSchedule.create({
      data: {
        profileId: profile.id,
        userId,
        problemId,
        problemSetId,
        currentLevel: calculation.nextLevel,
        status: ReviewStatus.SCHEDULED,
        scheduledAt: calculation.nextScheduleTime,
        isSuccess: performance.isSuccess,
        responseTime: performance.responseTime,
        confidenceLevel: performance.confidenceLevel,
        difficultyScore: performance.difficultyScore,
        userScore: performance.userScore
      },
      include: {
        problem: {
          select: { id: true, title: true, difficulty: true, questionType: true }
        },
        problemSet: {
          select: { id: true, title: true, difficulty: true }
        }
      }
    });
    
    // 프로필 업데이트 (통계)
    await prisma.forgettingCurveProfile.update({
      where: { id: profile.id },
      data: {
        totalReviews: profile.totalReviews + 1,
        successfulReviews: performance.isSuccess 
          ? profile.successfulReviews + 1 
          : profile.successfulReviews,
        successRate: profile.totalReviews > 0 
          ? (profile.successfulReviews + (performance.isSuccess ? 1 : 0)) / (profile.totalReviews + 1)
          : (performance.isSuccess ? 1.0 : 0.0)
      }
    });
    
    // 캐시 무효화
    await cacheUtils.del(`forgetting_curve_profile:${userId}`);
    
    const response: ReviewScheduleResponse = {
      id: reviewSchedule.id,
      currentLevel: reviewSchedule.currentLevel,
      status: reviewSchedule.status,
      scheduledAt: reviewSchedule.scheduledAt,
      nextScheduledAt: reviewSchedule.nextScheduledAt,
      isSuccess: reviewSchedule.isSuccess,
      responseTime: reviewSchedule.responseTime,
      confidenceLevel: reviewSchedule.confidenceLevel,
      difficultyScore: reviewSchedule.difficultyScore,
      userScore: reviewSchedule.userScore,
      problem: reviewSchedule.problem,
      problemSet: reviewSchedule.problemSet,
      createdAt: reviewSchedule.createdAt,
      updatedAt: reviewSchedule.updatedAt
    };
    
    res.status(201).json({ 
      success: true, 
      data: response,
      message: '복습 스케줄이 성공적으로 생성되었습니다.' 
    });
  } catch (error) {
    console.error('Review schedule creation error:', error);
    res.status(500).json({ 
      success: false, 
      message: '복습 스케줄을 생성하는 중 오류가 발생했습니다.' 
    });
  }
});

/**
 * 복습 완료 처리 및 다음 복습 스케줄링
 * POST /api/forgetting-curve/complete-review/:scheduleId
 */
router.post('/complete-review/:scheduleId', authenticateToken, [
  param('scheduleId').isString(),
  body('performance').isObject(),
  body('performance.isSuccess').isBoolean(),
  body('performance.responseTime').isNumeric(),
  body('performance.confidenceLevel').isInt({ min: 1, max: 5 }),
  body('performance.difficultyScore').optional().isNumeric(),
  body('performance.userScore').optional().isNumeric()
], async (req: AuthenticatedRequest, res: Response) => {
  try {
    const errors = validationResult(req);
    if (!errors.isEmpty()) {
      return res.status(400).json({ 
        success: false, 
        message: '입력 데이터가 올바르지 않습니다.',
        errors: errors.array() 
      });
    }
    
    const userId = req.user!.userId;
    const { scheduleId } = req.params;
    const { performance } = req.body;
    
    // 현재 복습 스케줄 조회
    const currentSchedule = await prisma.reviewSchedule.findFirst({
      where: {
        id: scheduleId,
        userId,
        status: ReviewStatus.SCHEDULED
      },
      include: {
        profile: true
      }
    });
    
    if (!currentSchedule) {
      return res.status(404).json({
        success: false,
        message: '복습 스케줄을 찾을 수 없습니다.'
      });
    }
    
    const userProfileData = {
      memoryRetentionFactor: currentSchedule.profile.memoryRetentionFactor,
      difficultyAdjustment: currentSchedule.profile.difficultyAdjustment,
      successRate: currentSchedule.profile.successRate,
      totalReviews: currentSchedule.profile.totalReviews
    };
    
    const reviewPerformance: ReviewPerformanceData = {
      isSuccess: performance.isSuccess,
      responseTime: performance.responseTime,
      confidenceLevel: performance.confidenceLevel,
      difficultyScore: performance.difficultyScore,
      userScore: performance.userScore
    };
    
    // 다음 복습 시점 계산
    const calculation = ForgettingCurveAlgorithm.calculateNextReview(
      currentSchedule.currentLevel,
      reviewPerformance,
      userProfileData
    );
    
    // 현재 스케줄 완료 처리
    await prisma.reviewSchedule.update({
      where: { id: scheduleId },
      data: {
        status: ReviewStatus.COMPLETED,
        completedAt: new Date(),
        isSuccess: performance.isSuccess,
        responseTime: performance.responseTime,
        confidenceLevel: performance.confidenceLevel,
        difficultyScore: performance.difficultyScore,
        userScore: performance.userScore,
        nextScheduledAt: calculation.nextScheduleTime
      }
    });
    
    // 다음 복습 스케줄 생성 (아직 최종 단계가 아닌 경우)
    let nextSchedule = null;
    if (calculation.nextLevel !== currentSchedule.currentLevel || !performance.isSuccess) {
      nextSchedule = await prisma.reviewSchedule.create({
        data: {
          profileId: currentSchedule.profileId,
          userId,
          problemId: currentSchedule.problemId,
          problemSetId: currentSchedule.problemSetId,
          currentLevel: calculation.nextLevel,
          status: ReviewStatus.SCHEDULED,
          scheduledAt: calculation.nextScheduleTime
        },
        include: {
          problem: {
            select: { id: true, title: true, difficulty: true }
          },
          problemSet: {
            select: { id: true, title: true, difficulty: true }
          }
        }
      });
    }
    
    // 프로필 업데이트
    const updatedProfile = await prisma.forgettingCurveProfile.update({
      where: { id: currentSchedule.profileId },
      data: {
        totalReviews: { increment: 1 },
        successfulReviews: performance.isSuccess 
          ? { increment: 1 } 
          : undefined,
        successRate: {
          set: (currentSchedule.profile.successfulReviews + (performance.isSuccess ? 1 : 0)) / 
               (currentSchedule.profile.totalReviews + 1)
        }
      }
    });
    
    // 캐시 무효화 (망각곡선 프로필 + 진도율)
    await cacheUtils.del(`forgetting_curve_profile:${userId}`);
    await progressService.invalidateProgressCache(userId);
    
    res.json({ 
      success: true, 
      data: {
        completedSchedule: {
          id: currentSchedule.id,
          status: ReviewStatus.COMPLETED,
          completedAt: new Date()
        },
        nextSchedule: nextSchedule ? {
          id: nextSchedule.id,
          currentLevel: nextSchedule.currentLevel,
          scheduledAt: nextSchedule.scheduledAt,
          problem: nextSchedule.problem,
          problemSet: nextSchedule.problemSet
        } : null,
        calculation: {
          recommendedAction: calculation.recommendedAction,
          adjustedRetentionRate: calculation.adjustedRetentionRate
        }
      },
      message: '복습이 완료되었습니다.' 
    });
  } catch (error) {
    console.error('Review completion error:', error);
    res.status(500).json({ 
      success: false, 
      message: '복습 완료 처리 중 오류가 발생했습니다.' 
    });
  }
});

/**
 * 예정된 복습 목록 조회
 * GET /api/forgetting-curve/scheduled-reviews
 */
router.get('/scheduled-reviews', authenticateToken, [
  query('limit').optional().isInt({ min: 1, max: 100 }),
  query('includeOverdue').optional().isBoolean()
], async (req: AuthenticatedRequest, res: Response) => {
  try {
    const userId = req.user!.userId;
    const limit = parseInt(req.query.limit as string) || 20;
    const includeOverdue = req.query.includeOverdue === 'true';
    
    const now = new Date();
    const whereClause: any = {
      userId,
      status: ReviewStatus.SCHEDULED
    };
    
    if (!includeOverdue) {
      whereClause.scheduledAt = { lte: now };
    }
    
    const reviews = await prisma.reviewSchedule.findMany({
      where: whereClause,
      orderBy: [
        { scheduledAt: 'asc' }
      ],
      take: limit,
      include: {
        problem: {
          select: { id: true, title: true, difficulty: true, questionType: true }
        },
        problemSet: {
          select: { id: true, title: true, difficulty: true }
        }
      }
    });
    
    // 우선순위 계산 및 정렬
    const reviewsWithPriority = reviews.map(review => {
      const daysSinceScheduled = Math.floor(
        (now.getTime() - review.scheduledAt.getTime()) / (1000 * 60 * 60 * 24)
      );
      
      const priority = ForgettingCurveAlgorithm.calculateReviewPriority(
        review.scheduledAt,
        review.difficultyScore || 5,
        review.isSuccess ? 1.0 : 0.0,
        daysSinceScheduled
      );
      
      return {
        ...review,
        priority,
        isOverdue: review.scheduledAt < now,
        daysSinceScheduled
      };
    });
    
    reviewsWithPriority.sort((a, b) => b.priority - a.priority);
    
    res.json({ 
      success: true, 
      data: reviewsWithPriority.map(review => ({
        id: review.id,
        currentLevel: review.currentLevel,
        scheduledAt: review.scheduledAt,
        priority: review.priority,
        isOverdue: review.isOverdue,
        daysSinceScheduled: review.daysSinceScheduled,
        problem: review.problem,
        problemSet: review.problemSet,
        createdAt: review.createdAt
      })),
      total: reviewsWithPriority.length
    });
  } catch (error) {
    console.error('Scheduled reviews fetch error:', error);
    res.status(500).json({ 
      success: false, 
      message: '예정된 복습 목록을 조회하는 중 오류가 발생했습니다.' 
    });
  }
});

/**
 * 학습 세션 시작
 * POST /api/forgetting-curve/start-session
 */
router.post('/start-session', authenticateToken, [
  body('deviceInfo').optional().isString()
], async (req: AuthenticatedRequest, res: Response) => {
  try {
    const userId = req.user!.userId;
    const { deviceInfo } = req.body;
    
    const session = await prisma.learningSession.create({
      data: {
        userId,
        sessionStartTime: new Date(),
        deviceInfo
      }
    });
    
    const response: LearningSessionResponse = {
      id: session.id,
      sessionStartTime: session.sessionStartTime,
      sessionEndTime: session.sessionEndTime,
      totalDuration: session.totalDuration,
      problemsAttempted: session.problemsAttempted,
      problemsCorrect: session.problemsCorrect,
      averageResponseTime: session.averageResponseTime,
      focusScore: session.focusScore,
      consistencyScore: session.consistencyScore,
      improvementRate: session.improvementRate,
      deviceInfo: session.deviceInfo,
      sessionNotes: session.sessionNotes,
      createdAt: session.createdAt,
      updatedAt: session.updatedAt
    };
    
    res.status(201).json({ 
      success: true, 
      data: response,
      message: '학습 세션이 시작되었습니다.' 
    });
  } catch (error) {
    console.error('Learning session start error:', error);
    res.status(500).json({ 
      success: false, 
      message: '학습 세션을 시작하는 중 오류가 발생했습니다.' 
    });
  }
});

/**
 * 학습 세션 종료
 * POST /api/forgetting-curve/end-session/:sessionId
 */
router.post('/end-session/:sessionId', authenticateToken, [
  param('sessionId').isString(),
  body('sessionData').optional().isObject(),
  body('sessionData.problemsAttempted').optional().isInt({ min: 0 }),
  body('sessionData.problemsCorrect').optional().isInt({ min: 0 }),
  body('sessionData.averageResponseTime').optional().isNumeric(),
  body('sessionData.focusScore').optional().isNumeric(),
  body('sessionData.consistencyScore').optional().isNumeric(),
  body('sessionData.sessionNotes').optional().isString()
], async (req: AuthenticatedRequest, res: Response) => {
  try {
    const errors = validationResult(req);
    if (!errors.isEmpty()) {
      return res.status(400).json({ 
        success: false, 
        message: '입력 데이터가 올바르지 않습니다.',
        errors: errors.array() 
      });
    }
    
    const userId = req.user!.userId;
    const { sessionId } = req.params;
    const { sessionData } = req.body;
    
    const session = await prisma.learningSession.findFirst({
      where: { id: sessionId, userId }
    });
    
    if (!session) {
      return res.status(404).json({
        success: false,
        message: '학습 세션을 찾을 수 없습니다.'
      });
    }
    
    const endTime = new Date();
    const duration = Math.floor((endTime.getTime() - session.sessionStartTime.getTime()) / (1000 * 60));
    
    const updateData: any = {
      sessionEndTime: endTime,
      totalDuration: duration
    };
    
    if (sessionData) {
      if (sessionData.problemsAttempted !== undefined) {
        updateData.problemsAttempted = sessionData.problemsAttempted;
      }
      if (sessionData.problemsCorrect !== undefined) {
        updateData.problemsCorrect = sessionData.problemsCorrect;
      }
      if (sessionData.averageResponseTime !== undefined) {
        updateData.averageResponseTime = sessionData.averageResponseTime;
      }
      if (sessionData.focusScore !== undefined) {
        updateData.focusScore = sessionData.focusScore;
      }
      if (sessionData.consistencyScore !== undefined) {
        updateData.consistencyScore = sessionData.consistencyScore;
      }
      if (sessionData.sessionNotes !== undefined) {
        updateData.sessionNotes = sessionData.sessionNotes;
      }
      
      // 향상률 계산
      if (sessionData.problemsAttempted > 0) {
        const successRate = sessionData.problemsCorrect / sessionData.problemsAttempted;
        updateData.improvementRate = successRate;
      }
    }
    
    const updatedSession = await prisma.learningSession.update({
      where: { id: sessionId },
      data: updateData
    });
    
    res.json({ 
      success: true, 
      data: {
        id: updatedSession.id,
        totalDuration: updatedSession.totalDuration,
        problemsAttempted: updatedSession.problemsAttempted,
        problemsCorrect: updatedSession.problemsCorrect,
        successRate: updatedSession.problemsAttempted > 0 
          ? updatedSession.problemsCorrect / updatedSession.problemsAttempted 
          : 0
      },
      message: '학습 세션이 종료되었습니다.' 
    });
  } catch (error) {
    console.error('Learning session end error:', error);
    res.status(500).json({ 
      success: false, 
      message: '학습 세션을 종료하는 중 오류가 발생했습니다.' 
    });
  }
});

/**
 * 망각곡선 분석 데이터 조회
 * GET /api/forgetting-curve/analytics
 */
router.get('/analytics', authenticateToken, [
  query('days').optional().isInt({ min: 1, max: 365 })
], async (req: AuthenticatedRequest, res: Response) => {
  try {
    const userId = req.user!.userId;
    const days = parseInt(req.query.days as string) || 30;
    
    const startDate = new Date();
    startDate.setDate(startDate.getDate() - days);
    
    const analytics = await prisma.forgettingCurveAnalytics.findMany({
      where: {
        userId,
        analysisDate: { gte: startDate }
      },
      orderBy: { analysisDate: 'desc' }
    });
    
    // 최신 분석 데이터가 없으면 생성
    if (analytics.length === 0) {
      // 최근 복습 데이터를 바탕으로 분석 데이터 생성
      const recentReviews = await prisma.reviewSchedule.findMany({
        where: {
          userId,
          status: ReviewStatus.COMPLETED,
          completedAt: { gte: startDate }
        }
      });
      
      if (recentReviews.length > 0) {
        // 레벨별 성공률 계산
        const levelStats = Object.values(ForgettingCurveLevel).reduce((acc, level) => {
          const levelReviews = recentReviews.filter(r => r.currentLevel === level);
          const successCount = levelReviews.filter(r => r.isSuccess).length;
          acc[level] = levelReviews.length > 0 ? successCount / levelReviews.length : null;
          return acc;
        }, {} as Record<ForgettingCurveLevel, number | null>);
        
        const totalSuccessful = recentReviews.filter(r => r.isSuccess).length;
        const overallRetentionRate = totalSuccessful / recentReviews.length;
        
        const avgResponseTime = recentReviews.reduce((sum, r) => 
          sum + (r.responseTime || 0), 0) / recentReviews.length;
        
        const newAnalytics = await prisma.forgettingCurveAnalytics.create({
          data: {
            userId,
            analysisDate: new Date(),
            level1SuccessRate: levelStats[ForgettingCurveLevel.LEVEL_1],
            level2SuccessRate: levelStats[ForgettingCurveLevel.LEVEL_2],
            level3SuccessRate: levelStats[ForgettingCurveLevel.LEVEL_3],
            level4SuccessRate: levelStats[ForgettingCurveLevel.LEVEL_4],
            level5SuccessRate: levelStats[ForgettingCurveLevel.LEVEL_5],
            level6SuccessRate: levelStats[ForgettingCurveLevel.LEVEL_6],
            level7SuccessRate: levelStats[ForgettingCurveLevel.LEVEL_7],
            level8SuccessRate: levelStats[ForgettingCurveLevel.LEVEL_8],
            overallRetentionRate,
            averageResponseTime: avgResponseTime,
            totalReviewsCompleted: recentReviews.length
          }
        });
        
        analytics.push(newAnalytics);
      }
    }
    
    const response: ForgettingCurveAnalyticsResponse[] = analytics.map(data => ({
      id: data.id,
      analysisDate: data.analysisDate,
      levelSuccessRates: {
        level1: data.level1SuccessRate,
        level2: data.level2SuccessRate,
        level3: data.level3SuccessRate,
        level4: data.level4SuccessRate,
        level5: data.level5SuccessRate,
        level6: data.level6SuccessRate,
        level7: data.level7SuccessRate,
        level8: data.level8SuccessRate
      },
      overallRetentionRate: data.overallRetentionRate,
      averageResponseTime: data.averageResponseTime,
      totalReviewsCompleted: data.totalReviewsCompleted,
      peakLearningTime: data.peakLearningTime,
      weeklyConsistency: data.weeklyConsistency,
      monthlyImprovement: data.monthlyImprovement,
      createdAt: data.createdAt,
      updatedAt: data.updatedAt
    }));
    
    res.json({ 
      success: true, 
      data: response,
      total: response.length
    });
  } catch (error) {
    console.error('Forgetting curve analytics fetch error:', error);
    res.status(500).json({ 
      success: false, 
      message: '망각곡선 분석 데이터를 조회하는 중 오류가 발생했습니다.' 
    });
  }
});

export default router;