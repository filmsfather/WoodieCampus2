import { Router, Response } from 'express';
import { authenticateToken, requireAnyRole, AuthenticatedRequest } from '../middleware/auth.js';
import { UserRole } from '../types/common.js';
import { LearningPatternService } from '../services/learningPatternService.js';
import { LearningPatternCache } from '../services/learningPatternCache.js';
import { logger } from '../config/logger.js';

const router = Router();

/**
 * GET /api/learning-patterns/analysis
 * 사용자의 전체 학습 패턴 분석 결과를 조회합니다
 */
router.get('/analysis', authenticateToken, async (req: AuthenticatedRequest, res: Response) => {
  try {
    const userId = req.user?.userId;
    if (!userId) {
      return res.status(401).json({ error: 'User not authenticated' });
    }

    const forceRefresh = req.query.refresh === 'true';

    // 캐시에서 먼저 확인
    if (!forceRefresh) {
      const cachedPattern = await LearningPatternCache.getLearningPattern(userId);
      if (cachedPattern) {
        return res.json({
          success: true,
          data: cachedPattern,
          source: 'cache'
        });
      }
    }

    // 캐시에 없거나 강제 새로고침인 경우 DB에서 분석
    logger.info(`Analyzing learning pattern for user ${userId}`);
    const learningPattern = await LearningPatternService.analyzeLearningPattern(userId);

    // 분석 결과를 캐시에 저장
    await LearningPatternCache.setLearningPattern(userId, learningPattern);
    
    // 메타데이터도 업데이트
    await LearningPatternCache.setPatternMetadata(userId, {
      lastFullAnalysis: new Date(),
      analysisCount: 1,
      dataQuality: 'HIGH',
      needsRefresh: false
    });

    res.json({
      success: true,
      data: learningPattern,
      source: 'fresh_analysis'
    });

  } catch (error) {
    logger.error('Learning pattern analysis error:', error);
    res.status(500).json({ 
      success: false, 
      error: 'Failed to analyze learning pattern' 
    });
  }
});

/**
 * GET /api/learning-patterns/summary
 * 사용자의 학습 패턴 요약 정보를 조회합니다 (빠른 조회용)
 */
router.get('/summary', authenticateToken, async (req: AuthenticatedRequest, res: Response) => {
  try {
    const userId = req.user?.userId;
    if (!userId) {
      return res.status(401).json({ error: 'User not authenticated' });
    }

    // 캐시에서 먼저 확인
    let summary = await LearningPatternCache.getLearningPatternSummary(userId);
    
    if (!summary) {
      // 캐시에 없으면 DB에서 요약 정보 생성
      summary = await LearningPatternService.getLearningPatternSummary(userId);
      
      // 캐시에 저장
      await LearningPatternCache.setLearningPatternSummary(userId, summary);
    }

    res.json({
      success: true,
      data: summary
    });

  } catch (error) {
    logger.error('Learning pattern summary error:', error);
    res.status(500).json({ 
      success: false, 
      error: 'Failed to get learning pattern summary' 
    });
  }
});

/**
 * GET /api/learning-patterns/realtime-stats
 * 실시간 학습 통계를 조회합니다
 */
router.get('/realtime-stats', authenticateToken, async (req: AuthenticatedRequest, res: Response) => {
  try {
    const userId = req.user?.userId;
    if (!userId) {
      return res.status(401).json({ error: 'User not authenticated' });
    }

    const realtimeStats = await LearningPatternCache.getRealtimeStats(userId);
    
    res.json({
      success: true,
      data: realtimeStats || {
        problemsAttempted: 0,
        problemsCorrect: 0,
        sessionTime: 0,
        avgResponseTime: 0,
        currentStreak: 0,
        lastUpdated: Date.now()
      }
    });

  } catch (error) {
    logger.error('Realtime stats error:', error);
    res.status(500).json({ 
      success: false, 
      error: 'Failed to get realtime stats' 
    });
  }
});

/**
 * POST /api/learning-patterns/session/start
 * 새로운 학습 세션을 시작합니다
 */
router.post('/session/start', authenticateToken, async (req: AuthenticatedRequest, res: Response) => {
  try {
    const userId = req.user?.userId;
    if (!userId) {
      return res.status(401).json({ error: 'User not authenticated' });
    }

    const sessionId = `session_${userId}_${Date.now()}`;
    const sessionData = {
      sessionId,
      startTime: new Date(),
      problemsAttempted: 0,
      problemsCorrect: 0,
      averageResponseTime: 0
    };

    // 현재 세션 정보를 캐시에 저장
    await LearningPatternCache.setCurrentSession(userId, sessionData);

    res.json({
      success: true,
      data: {
        sessionId,
        startTime: sessionData.startTime
      }
    });

  } catch (error) {
    logger.error('Session start error:', error);
    res.status(500).json({ 
      success: false, 
      error: 'Failed to start learning session' 
    });
  }
});

/**
 * POST /api/learning-patterns/session/update
 * 현재 학습 세션 정보를 업데이트합니다
 */
router.post('/session/update', authenticateToken, async (req: AuthenticatedRequest, res: Response) => {
  try {
    const userId = req.user?.userId;
    if (!userId) {
      return res.status(401).json({ error: 'User not authenticated' });
    }

    const {
      problemsAttempted,
      problemsCorrect,
      averageResponseTime,
      focusScore,
      currentProblem
    } = req.body;

    // 현재 세션 정보 조회
    const currentSession = await LearningPatternCache.getCurrentSession(userId);
    if (!currentSession) {
      return res.status(404).json({ 
        success: false, 
        error: 'No active session found' 
      });
    }

    // 세션 정보 업데이트
    const updatedSession = {
      ...currentSession,
      problemsAttempted: problemsAttempted || currentSession.problemsAttempted,
      problemsCorrect: problemsCorrect || currentSession.problemsCorrect,
      averageResponseTime: averageResponseTime || currentSession.averageResponseTime,
      currentFocusScore: focusScore,
      currentProblem: currentProblem
    };

    await LearningPatternCache.setCurrentSession(userId, updatedSession);

    // 실시간 통계도 업데이트
    const sessionStartTime = new Date(currentSession.startTime);
    const sessionTime = Math.round((Date.now() - sessionStartTime.getTime()) / (1000 * 60)); // 분
    const currentStreak = calculateCurrentStreak(problemsAttempted, problemsCorrect);

    await LearningPatternCache.updateRealtimeStats(userId, {
      problemsAttempted: problemsAttempted || 0,
      problemsCorrect: problemsCorrect || 0,
      sessionTime,
      avgResponseTime: averageResponseTime || 0,
      currentStreak,
      focusScore
    });

    res.json({
      success: true,
      data: updatedSession
    });

  } catch (error) {
    logger.error('Session update error:', error);
    res.status(500).json({ 
      success: false, 
      error: 'Failed to update learning session' 
    });
  }
});

/**
 * POST /api/learning-patterns/session/end
 * 현재 학습 세션을 종료하고 데이터를 저장합니다
 */
router.post('/session/end', authenticateToken, async (req: AuthenticatedRequest, res: Response) => {
  try {
    const userId = req.user?.userId;
    if (!userId) {
      return res.status(401).json({ error: 'User not authenticated' });
    }

    // 현재 세션 정보 조회
    const currentSession = await LearningPatternCache.getCurrentSession(userId);
    if (!currentSession) {
      return res.status(404).json({ 
        success: false, 
        error: 'No active session found' 
      });
    }

    const endTime = new Date();
    const sessionDuration = Math.round(
      (endTime.getTime() - new Date(currentSession.startTime).getTime()) / (1000 * 60)
    );

    // 세션 데이터를 DB에 저장
    const sessionRecord = await LearningPatternService.recordLearningSession({
      userId,
      startTime: new Date(currentSession.startTime),
      endTime,
      problemsAttempted: currentSession.problemsAttempted,
      problemsCorrect: currentSession.problemsCorrect,
      averageResponseTime: currentSession.averageResponseTime,
      focusScore: currentSession.currentFocusScore
    });

    // 캐시에서 현재 세션 정보 삭제
    await LearningPatternCache.endCurrentSession(userId);

    // 세션 종료 후 요약 정보 캐시 무효화 (다음 조회 시 새로 계산되도록)
    await LearningPatternCache.clearUserCache(userId);

    res.json({
      success: true,
      data: {
        sessionId: sessionRecord.id,
        duration: sessionDuration,
        summary: {
          problemsAttempted: currentSession.problemsAttempted,
          problemsCorrect: currentSession.problemsCorrect,
          successRate: currentSession.problemsAttempted > 0 ? 
            currentSession.problemsCorrect / currentSession.problemsAttempted : 0,
          averageResponseTime: currentSession.averageResponseTime,
          focusScore: currentSession.currentFocusScore
        }
      }
    });

  } catch (error) {
    logger.error('Session end error:', error);
    res.status(500).json({ 
      success: false, 
      error: 'Failed to end learning session' 
    });
  }
});

/**
 * GET /api/learning-patterns/upcoming-reviews
 * 다가오는 복습 목록을 조회합니다
 */
router.get('/upcoming-reviews', authenticateToken, async (req: AuthenticatedRequest, res: Response) => {
  try {
    const userId = req.user?.userId;
    if (!userId) {
      return res.status(401).json({ error: 'User not authenticated' });
    }

    const limit = parseInt(req.query.limit as string) || 10;

    // 캐시에서 먼저 확인
    let upcomingReviews = await LearningPatternCache.getUpcomingReviews(userId);
    
    if (!upcomingReviews) {
      // TODO: ReviewScheduleService에서 다가오는 복습 목록 조회
      upcomingReviews = [];
      
      // 캐시에 저장
      await LearningPatternCache.setUpcomingReviews(userId, upcomingReviews);
    }

    res.json({
      success: true,
      data: upcomingReviews.slice(0, limit)
    });

  } catch (error) {
    logger.error('Upcoming reviews error:', error);
    res.status(500).json({ 
      success: false, 
      error: 'Failed to get upcoming reviews' 
    });
  }
});

/**
 * GET /api/learning-patterns/trends
 * 학습 패턴 트렌드 데이터를 조회합니다
 */
router.get('/trends', authenticateToken, async (req: AuthenticatedRequest, res: Response) => {
  try {
    const userId = req.user?.userId;
    if (!userId) {
      return res.status(401).json({ error: 'User not authenticated' });
    }

    // 캐시에서 트렌드 데이터 조회
    const trendData = await LearningPatternCache.getPatternTrends(userId);
    
    if (!trendData) {
      // 트렌드 데이터가 없으면 기본 분석에서 추출
      const fullAnalysis = await LearningPatternCache.getLearningPattern(userId);
      if (fullAnalysis) {
        const extractedTrends = {
          weeklyPerformance: fullAnalysis.improvementTrend.map((trend: any) => ({
            week: trend.period,
            successRate: trend.successRate,
            studyTime: trend.studyTime,
            focusScore: 0 // 기본값
          })),
          difficultyTrends: fullAnalysis.difficultyPerformance.map((diff: any) => ({
            difficulty: diff.level,
            trendDirection: 'STABLE' as const,
            recentSuccessRate: diff.successRate
          })),
          learningVelocity: {
            problemsPerHour: 0, // 계산 필요
            accuracyTrend: 'STABLE' as const,
            consistencyScore: fullAnalysis.weeklyConsistency
          }
        };
        
        await LearningPatternCache.setPatternTrends(userId, extractedTrends);
        return res.json({ success: true, data: extractedTrends });
      }
    }

    res.json({
      success: true,
      data: trendData || {
        weeklyPerformance: [],
        difficultyTrends: [],
        learningVelocity: {
          problemsPerHour: 0,
          accuracyTrend: 'STABLE',
          consistencyScore: 0
        }
      }
    });

  } catch (error) {
    logger.error('Trends data error:', error);
    res.status(500).json({ 
      success: false, 
      error: 'Failed to get trend data' 
    });
  }
});

/**
 * DELETE /api/learning-patterns/cache
 * 사용자의 학습 패턴 캐시를 삭제합니다 (관리자용)
 */
router.delete('/cache', authenticateToken, requireAnyRole([UserRole.ADMIN, UserRole.SUPER_ADMIN]), 
  async (req: AuthenticatedRequest, res: Response) => {
    try {
      const targetUserId = req.query.userId as string || req.user?.userId;
      if (!targetUserId) {
        return res.status(400).json({ error: 'User ID required' });
      }

      const success = await LearningPatternCache.clearUserCache(targetUserId);
      
      res.json({
        success,
        message: success ? 'Cache cleared successfully' : 'Failed to clear cache'
      });

    } catch (error) {
      logger.error('Cache clear error:', error);
      res.status(500).json({ 
        success: false, 
        error: 'Failed to clear cache' 
      });
    }
  }
);

/**
 * GET /api/learning-patterns/rankings
 * 학습 성과 리더보드를 조회합니다
 */
router.get('/rankings', authenticateToken, async (req: AuthenticatedRequest, res: Response) => {
  try {
    const rankings = await LearningPatternCache.getPerformanceRankings();
    
    res.json({
      success: true,
      data: rankings || []
    });

  } catch (error) {
    logger.error('Rankings error:', error);
    res.status(500).json({ 
      success: false, 
      error: 'Failed to get rankings' 
    });
  }
});

/**
 * 연속 정답 수를 계산하는 헬퍼 함수
 */
function calculateCurrentStreak(attempted: number, correct: number): number {
  // 실제로는 더 복잡한 로직이 필요 (최근 문제들의 정답 여부를 순서대로 확인)
  // 임시로 간단한 계산
  if (attempted === 0) return 0;
  return Math.min(correct, attempted);
}

export default router;