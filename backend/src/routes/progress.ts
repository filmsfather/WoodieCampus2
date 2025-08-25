import { Router, Response } from 'express';
import { authenticateToken, AuthenticatedRequest } from '../middleware/auth.js';
import progressService from '../services/progressService.js';

const router = Router();

/**
 * GET /api/progress/stats
 * 사용자의 전체 진도율 통계 조회
 */
router.get('/stats', authenticateToken, async (req: AuthenticatedRequest, res: Response) => {
  try {
    const userId = req.user?.userId;
    if (!userId) {
      return res.status(401).json({ error: 'User not authenticated' });
    }

    const stats = await progressService.getUserProgressStats(userId);
    res.json(stats);
  } catch (error) {
    console.error('Error fetching progress stats:', error);
    res.status(500).json({ error: 'Internal server error' });
  }
});

/**
 * GET /api/progress/daily
 * 일별 진도율 데이터 조회 (차트용)
 */
router.get('/daily', authenticateToken, async (req: AuthenticatedRequest, res: Response) => {
  try {
    const userId = req.user?.userId;
    if (!userId) {
      return res.status(401).json({ error: 'User not authenticated' });
    }

    const days = parseInt(req.query.days as string) || 30;
    if (days > 365) {
      return res.status(400).json({ error: 'Days parameter cannot exceed 365' });
    }

    const dailyData = await progressService.getDailyProgressData(userId, days);
    res.json(dailyData);
  } catch (error) {
    console.error('Error fetching daily progress:', error);
    res.status(500).json({ error: 'Internal server error' });
  }
});

/**
 * GET /api/progress/realtime
 * 실시간 진도율 요약 정보 조회
 */
router.get('/realtime', authenticateToken, async (req: AuthenticatedRequest, res: Response) => {
  try {
    const userId = req.user?.userId;
    if (!userId) {
      return res.status(401).json({ error: 'User not authenticated' });
    }

    const realtimeProgress = await progressService.getRealtimeProgress(userId);
    res.json(realtimeProgress);
  } catch (error) {
    console.error('Error fetching realtime progress:', error);
    res.status(500).json({ error: 'Internal server error' });
  }
});

/**
 * POST /api/progress/invalidate
 * 진도율 캐시 무효화 (복습 완료 후 호출)
 */
router.post('/invalidate', authenticateToken, async (req: AuthenticatedRequest, res: Response) => {
  try {
    const userId = req.user?.userId;
    if (!userId) {
      return res.status(401).json({ error: 'User not authenticated' });
    }

    await progressService.invalidateProgressCache(userId);
    res.json({ message: 'Progress cache invalidated successfully' });
  } catch (error) {
    console.error('Error invalidating progress cache:', error);
    res.status(500).json({ error: 'Internal server error' });
  }
});

/**
 * POST /api/progress/update-realtime
 * 실시간 진도율 업데이트 (복습 완료 시 호출)
 */
router.post('/update-realtime', authenticateToken, async (req: AuthenticatedRequest, res: Response) => {
  try {
    const userId = req.user?.userId;
    if (!userId) {
      return res.status(401).json({ error: 'User not authenticated' });
    }

    const { problemId, isCorrect, responseTime, difficulty } = req.body;
    
    if (!problemId || typeof isCorrect !== 'boolean' || !responseTime) {
      return res.status(400).json({ 
        error: 'Missing required fields: problemId, isCorrect, responseTime' 
      });
    }

    await progressService.updateProgressRealtime(userId, {
      problemId,
      isCorrect,
      responseTime,
      difficulty: difficulty || 1
    });

    res.json({ 
      message: 'Progress updated and broadcast in real-time',
      timestamp: new Date().toISOString()
    });
  } catch (error) {
    console.error('Error updating realtime progress:', error);
    res.status(500).json({ error: 'Internal server error' });
  }
});

/**
 * GET /api/progress/subject-mastery
 * 주제별 숙련도 진도율 조회
 */
router.get('/subject-mastery', authenticateToken, async (req: AuthenticatedRequest, res: Response) => {
  try {
    const userId = req.user?.userId;
    if (!userId) {
      return res.status(401).json({ error: 'User not authenticated' });
    }

    const masteryData = await progressService.getSubjectMasteryProgress(userId);
    res.json({
      success: true,
      data: masteryData,
      timestamp: new Date().toISOString()
    });
  } catch (error) {
    console.error('Error fetching subject mastery:', error);
    res.status(500).json({ error: 'Internal server error' });
  }
});

/**
 * POST /api/progress/track-session
 * 실시간 학습 세션 추적
 */
router.post('/track-session', authenticateToken, async (req: AuthenticatedRequest, res: Response) => {
  try {
    const userId = req.user?.userId;
    if (!userId) {
      return res.status(401).json({ error: 'User not authenticated' });
    }

    const { sessionId, problemsAttempted, problemsCorrect, totalTime, difficulty } = req.body;
    
    if (!sessionId || typeof problemsAttempted !== 'number' || typeof problemsCorrect !== 'number') {
      return res.status(400).json({ 
        error: 'Missing required fields: sessionId, problemsAttempted, problemsCorrect' 
      });
    }

    await progressService.trackLearningSession(userId, {
      sessionId,
      problemsAttempted,
      problemsCorrect,
      totalTime: totalTime || 0,
      difficulty: difficulty || 1
    });

    res.json({ 
      message: 'Session progress tracked and broadcast',
      sessionId,
      timestamp: new Date().toISOString()
    });
  } catch (error) {
    console.error('Error tracking session:', error);
    res.status(500).json({ error: 'Internal server error' });
  }
});

/**
 * GET /api/progress/live-stats
 * 실시간 종합 진도 통계 (대시보드용)
 */
router.get('/live-stats', authenticateToken, async (req: AuthenticatedRequest, res: Response) => {
  try {
    const userId = req.user?.userId;
    if (!userId) {
      return res.status(401).json({ error: 'User not authenticated' });
    }

    // 병렬로 여러 데이터 조회
    const [realtimeProgress, masteryProgress, dailyProgress] = await Promise.all([
      progressService.getRealtimeProgress(userId),
      progressService.getSubjectMasteryProgress(userId),
      progressService.getDailyProgressData(userId, 7) // 최근 7일
    ]);

    const liveStats = {
      overall: realtimeProgress,
      subjectMastery: masteryProgress.slice(0, 5), // 상위 5개 주제
      weeklyTrend: dailyProgress,
      summary: {
        totalSubjects: masteryProgress.length,
        masteredSubjects: masteryProgress.filter(subject => subject.masteryLevel >= 80).length,
        averageMastery: masteryProgress.length > 0 
          ? Math.round(masteryProgress.reduce((sum, subject) => sum + subject.masteryLevel, 0) / masteryProgress.length)
          : 0,
        weakestSubject: masteryProgress.length > 0 
          ? masteryProgress[masteryProgress.length - 1].subject
          : null
      }
    };

    res.json({
      success: true,
      data: liveStats,
      timestamp: new Date().toISOString()
    });
  } catch (error) {
    console.error('Error fetching live stats:', error);
    res.status(500).json({ error: 'Internal server error' });
  }
});

export default router;