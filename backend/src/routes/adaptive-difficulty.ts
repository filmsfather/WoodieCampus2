import { Router, Response } from 'express';
import { body, param, query, validationResult } from 'express-validator';
import { authenticateToken, AuthenticatedRequest } from '../middleware/auth.js';
import { DifficultyFeedback } from '../types/common.js';
import AdaptiveDifficultyService from '../services/adaptiveDifficultyService.js';
import AdaptiveDifficultyCache from '../services/adaptiveDifficultyCache.js';
import SmartRecommendationService from '../services/smartRecommendationService.js';
import { logger } from '../config/logger.js';

const router = Router();

/**
 * 난이도 피드백 제출
 * POST /api/adaptive-difficulty/feedback
 */
router.post('/feedback',
  authenticateToken,
  [
    body('problemId').isString().notEmpty().withMessage('Problem ID is required'),
    body('feedback').isIn(['RETRY', 'TOO_HARD', 'JUST_RIGHT', 'TOO_EASY']).withMessage('Invalid feedback type'),
    body('responseTime').optional().isNumeric().withMessage('Response time must be a number'),
    body('isCorrect').optional().isBoolean().withMessage('isCorrect must be boolean'),
    body('sessionId').optional().isString().withMessage('Session ID must be string'),
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
      const { problemId, feedback, responseTime, isCorrect, sessionId } = req.body;

      // 1. 피드백 데이터베이스 저장
      const feedbackRecord = await AdaptiveDifficultyService.submitFeedback({
        userId,
        problemId,
        feedback: feedback as DifficultyFeedback,
        responseTime,
        isCorrect,
        sessionId
      });

      // 2. 실시간 피드백 처리 (캐시 업데이트)
      await AdaptiveDifficultyCache.processRealtimeFeedback(
        problemId,
        userId,
        feedback as DifficultyFeedback,
        {
          responseTime,
          isCorrect,
          sessionId
        }
      );

      // 3. 사용자 프로필 업데이트 (비동기)
      AdaptiveDifficultyService.updateUserProfile(userId, {
        recentFeedback: feedback,
        responseTime,
        isCorrect
      }).catch((error: any) => {
        logger.error('Failed to update user profile:', error);
      });

      logger.info(`Difficulty feedback submitted: User ${userId}, Problem ${problemId}, Feedback: ${feedback}`);

      res.json({
        success: true,
        message: 'Feedback submitted successfully',
        data: {
          feedbackId: feedbackRecord.id,
          processedAt: new Date(),
          nextRecommendationUpdate: true
        }
      });

    } catch (error) {
      logger.error('Error submitting difficulty feedback:', error);
      res.status(500).json({
        success: false,
        message: 'Failed to submit feedback'
      });
    }
  }
);

/**
 * 난이도 예측
 * GET /api/adaptive-difficulty/predict/:problemId
 */
router.get('/predict/:problemId',
  authenticateToken,
  [
    param('problemId').isString().notEmpty().withMessage('Problem ID is required')
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
      const { problemId } = req.params;

      // 1. 캐시에서 예측 결과 확인
      const cachedPrediction = await AdaptiveDifficultyCache.getDifficultyPrediction(userId, problemId);
      
      if (cachedPrediction) {
        return res.json({
          success: true,
          data: {
            ...cachedPrediction,
            fromCache: true
          }
        });
      }

      // 2. 문제 정보 조회
      const problem = await AdaptiveDifficultyService.prisma.problem.findUnique({
        where: { id: problemId },
        select: { id: true, difficulty: true, title: true }
      });

      if (!problem) {
        return res.status(404).json({
          success: false,
          message: 'Problem not found'
        });
      }

      // 3. 난이도 예측 수행
      const prediction = await AdaptiveDifficultyService.predictDifficulty({
        userId,
        problemId,
        currentDifficulty: problem.difficulty
      });

      // 4. 예측 결과 캐시
      await AdaptiveDifficultyCache.cacheDifficultyPrediction(userId, problemId, {
        ...prediction,
        timestamp: new Date()
      });

      res.json({
        success: true,
        data: {
          ...prediction,
          problemTitle: problem.title,
          originalDifficulty: problem.difficulty,
          fromCache: false
        }
      });

    } catch (error) {
      logger.error('Error predicting difficulty:', error);
      res.status(500).json({
        success: false,
        message: 'Failed to predict difficulty'
      });
    }
  }
);

/**
 * 개인화된 문제 추천
 * GET /api/adaptive-difficulty/recommendations
 */
router.get('/recommendations',
  authenticateToken,
  [
    query('categoryId').optional().isString().withMessage('Category ID must be string'),
    query('limit').optional().isInt({ min: 1, max: 50 }).withMessage('Limit must be between 1-50'),
    query('targetDifficulty').optional().isFloat({ min: 1, max: 10 }).withMessage('Target difficulty must be 1-10'),
    query('timeConstraint').optional().isInt({ min: 1 }).withMessage('Time constraint must be positive integer'),
    query('studyMode').optional().isIn(['REVIEW', 'LEARN_NEW', 'CHALLENGE']).withMessage('Invalid study mode')
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
        categoryId,
        limit = 10,
        targetDifficulty,
        timeConstraint,
        studyMode
      } = req.query;

      // 추천 입력 데이터 구성
      const recommendationInput = {
        userId,
        categoryId: categoryId as string,
        learningGoals: {
          targetDifficulty: targetDifficulty ? parseFloat(targetDifficulty as string) : undefined,
          timeConstraint: timeConstraint ? parseInt(timeConstraint as string) : undefined
        },
        contextFactors: {
          timeOfDay: new Date().getHours(),
          studyMode: studyMode as any
        }
      };

      // 스마트 추천 생성
      const recommendations = await SmartRecommendationService.generateSmartRecommendations(
        recommendationInput,
        parseInt(limit as string)
      );

      res.json({
        success: true,
        data: {
          recommendations,
          totalCount: recommendations.length,
          generatedAt: new Date(),
          parameters: {
            categoryId,
            limit: parseInt(limit as string),
            targetDifficulty,
            timeConstraint,
            studyMode
          }
        }
      });

    } catch (error) {
      logger.error('Error generating recommendations:', error);
      res.status(500).json({
        success: false,
        message: 'Failed to generate recommendations'
      });
    }
  }
);

/**
 * 난이도 조정 트리거
 * POST /api/adaptive-difficulty/adjust
 */
router.post('/adjust',
  authenticateToken,
  [
    body('problemId').isString().notEmpty().withMessage('Problem ID is required'),
    body('adjustmentType').isIn(['INCREASE', 'DECREASE', 'AUTO']).withMessage('Invalid adjustment type'),
    body('adjustmentValue').optional().isFloat({ min: -3, max: 3 }).withMessage('Adjustment value must be between -3 and 3'),
    body('reason').optional().isString().withMessage('Reason must be string')
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
      const { problemId, adjustmentType, adjustmentValue, reason } = req.body;

      // 1. 문제 존재 확인
      const problem = await AdaptiveDifficultyService.prisma.problem.findUnique({
        where: { id: problemId },
        select: { id: true, difficulty: true, title: true }
      });

      if (!problem) {
        return res.status(404).json({
          success: false,
          message: 'Problem not found'
        });
      }

      // 2. 피드백 집계 정보 확인
      const feedbackAggregation = await AdaptiveDifficultyCache.getFeedbackAggregation(problemId);
      
      let finalAdjustmentValue = adjustmentValue;

      // 3. AUTO 모드인 경우 자동 조정값 계산
      if (adjustmentType === 'AUTO') {
        if (feedbackAggregation) {
          const { feedbackCounts, totalFeedbacks } = feedbackAggregation;
          const negativeRate = (feedbackCounts.RETRY + feedbackCounts.TOO_HARD) / totalFeedbacks;
          const easyRate = feedbackCounts.TOO_EASY / totalFeedbacks;

          if (negativeRate > 0.6) {
            finalAdjustmentValue = -0.5 - (negativeRate - 0.6); // 난이도 감소
          } else if (easyRate > 0.6) {
            finalAdjustmentValue = 0.5 + (easyRate - 0.6); // 난이도 증가
          } else {
            finalAdjustmentValue = 0; // 조정 불필요
          }
        } else {
          finalAdjustmentValue = 0;
        }
      } else {
        // 수동 조정인 경우
        finalAdjustmentValue = adjustmentType === 'INCREASE' ? 
          (adjustmentValue || 0.3) : 
          -(adjustmentValue || 0.3);
      }

      // 4. 조정이 필요한 경우에만 실행
      if (Math.abs(finalAdjustmentValue) < 0.1) {
        return res.json({
          success: true,
          message: 'No adjustment needed',
          data: {
            currentDifficulty: problem.difficulty,
            adjustmentValue: 0,
            reason: 'Difficulty is already optimal'
          }
        });
      }

      // 5. 난이도 조정 실행
      const adjustment = await AdaptiveDifficultyService.adjustDifficulty({
        problemId,
        adjustmentValue: finalAdjustmentValue,
        triggerUserId: userId,
        reason: reason || `${adjustmentType} adjustment requested`,
        feedbackSummary: feedbackAggregation
      });

      // 6. 관련 캐시 무효화
      await AdaptiveDifficultyCache.clearProblemDifficultyCache(problemId);

      logger.info(`Difficulty adjustment completed: Problem ${problemId}, Value: ${finalAdjustmentValue}, User: ${userId}`);

      res.json({
        success: true,
        message: 'Difficulty adjusted successfully',
        data: {
          adjustmentId: adjustment.id,
          originalDifficulty: problem.difficulty,
          adjustmentValue: finalAdjustmentValue,
          newDifficulty: problem.difficulty + finalAdjustmentValue,
          adjustedAt: adjustment.createdAt,
          reason: reason || 'Auto adjustment'
        }
      });

    } catch (error) {
      logger.error('Error adjusting difficulty:', error);
      res.status(500).json({
        success: false,
        message: 'Failed to adjust difficulty'
      });
    }
  }
);

/**
 * 사용자 난이도 프로필 조회
 * GET /api/adaptive-difficulty/profile
 */
router.get('/profile',
  authenticateToken,
  async (req: AuthenticatedRequest, res: Response) => {
    try {
      const userId = req.user?.userId!;

      // 1. 캐시에서 프로필 확인
      const cachedProfile = await AdaptiveDifficultyCache.getUserDifficultyProfile(userId);
      
      if (cachedProfile) {
        return res.json({
          success: true,
          data: {
            ...cachedProfile,
            fromCache: true
          }
        });
      }

      // 2. 프로필 생성/조회
      const profile = await AdaptiveDifficultyService['getOrCreateUserProfile'](userId);

      // 3. 프로필 캐시
      await AdaptiveDifficultyCache.cacheUserDifficultyProfile(userId, {
        idealDifficulty: profile.idealDifficulty,
        preferredRange: {
          min: profile.preferredMinDifficulty,
          max: profile.preferredMaxDifficulty
        },
        learningPace: profile.learningPace,
        frustrationTolerance: profile.frustrationTolerance,
        recentPerformance: [], // TODO: 최근 성과 계산
        lastUpdated: profile.updatedAt
      });

      res.json({
        success: true,
        data: {
          ...profile,
          fromCache: false
        }
      });

    } catch (error) {
      logger.error('Error fetching difficulty profile:', error);
      res.status(500).json({
        success: false,
        message: 'Failed to fetch difficulty profile'
      });
    }
  }
);

/**
 * 실시간 난이도 통계 조회
 * GET /api/adaptive-difficulty/stats
 */
router.get('/stats',
  authenticateToken,
  async (req: AuthenticatedRequest, res: Response) => {
    try {
      // 실시간 통계 조회
      const realtimeStats = await AdaptiveDifficultyCache.getRealtimeDifficultyStats();
      
      // 캐시 메트릭 조회
      const cacheMetrics = await AdaptiveDifficultyCache.getCacheMetrics();

      res.json({
        success: true,
        data: {
          realtimeStats: realtimeStats || {
            totalProblemsWithFeedback: 0,
            averageAdjustmentFrequency: 0,
            activeUsers: 0,
            feedbacksPerMinute: 0,
            adjustmentsPerHour: 0,
            topAdjustedProblems: []
          },
          cacheMetrics,
          retrievedAt: new Date()
        }
      });

    } catch (error) {
      logger.error('Error fetching difficulty stats:', error);
      res.status(500).json({
        success: false,
        message: 'Failed to fetch difficulty stats'
      });
    }
  }
);

/**
 * 조정 대기열 상태 조회
 * GET /api/adaptive-difficulty/adjustment-queue
 */
router.get('/adjustment-queue',
  authenticateToken,
  async (req: AuthenticatedRequest, res: Response) => {
    try {
      // 다음 조정 작업 조회
      const nextTask = await AdaptiveDifficultyCache.getNextAdjustmentTask();

      res.json({
        success: true,
        data: {
          nextTask,
          queueStatus: {
            hasItems: !!nextTask,
            checkTime: new Date()
          }
        }
      });

    } catch (error) {
      logger.error('Error fetching adjustment queue:', error);
      res.status(500).json({
        success: false,
        message: 'Failed to fetch adjustment queue status'
      });
    }
  }
);

export default router;