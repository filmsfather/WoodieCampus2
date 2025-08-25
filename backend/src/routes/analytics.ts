import { Router, Response } from 'express';
import { query, validationResult } from 'express-validator';
import { authenticateToken, AuthenticatedRequest } from '../middleware/auth.js';
import analyticsService from '../services/analyticsService.js';

const router = Router();

/**
 * GET /api/analytics/forgetting-curve
 * 망각곡선 분석 데이터 조회
 */
router.get('/forgetting-curve', authenticateToken, [
  query('days').optional().isInt({ min: 7, max: 365 })
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

    const userId = req.user?.userId;
    if (!userId) {
      return res.status(401).json({ success: false, message: 'User not authenticated' });
    }

    const days = parseInt(req.query.days as string) || 30;
    const analytics = await analyticsService.getForgettingCurveAnalytics(userId, days);
    
    res.json({
      success: true,
      data: analytics
    });
  } catch (error) {
    console.error('Error fetching forgetting curve analytics:', error);
    res.status(500).json({ 
      success: false, 
      message: '망각곡선 분석 데이터 조회 중 오류가 발생했습니다.',
      details: error instanceof Error ? error.message : 'Unknown error'
    });
  }
});

/**
 * GET /api/analytics/learning-efficiency
 * 학습 효율성 분석 데이터 조회
 */
router.get('/learning-efficiency', authenticateToken, async (req: AuthenticatedRequest, res: Response) => {
  try {
    const userId = req.user?.userId;
    if (!userId) {
      return res.status(401).json({ success: false, message: 'User not authenticated' });
    }

    const metrics = await analyticsService.getLearningEfficiencyMetrics(userId);
    
    res.json({
      success: true,
      data: metrics
    });
  } catch (error) {
    console.error('Error fetching learning efficiency metrics:', error);
    res.status(500).json({ 
      success: false, 
      message: '학습 효율성 분석 데이터 조회 중 오류가 발생했습니다.',
      details: error instanceof Error ? error.message : 'Unknown error'
    });
  }
});

/**
 * GET /api/analytics/summary
 * 분석 데이터 요약 정보 조회
 */
router.get('/summary', authenticateToken, [
  query('days').optional().isInt({ min: 7, max: 365 })
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

    const userId = req.user?.userId;
    if (!userId) {
      return res.status(401).json({ success: false, message: 'User not authenticated' });
    }

    const days = parseInt(req.query.days as string) || 30;
    
    // 병렬로 두 분석 데이터 조회
    const [forgettingCurveData, efficiencyData] = await Promise.all([
      analyticsService.getForgettingCurveAnalytics(userId, days),
      analyticsService.getLearningEfficiencyMetrics(userId)
    ]);
    
    // 요약 데이터 생성
    const summary = {
      userId,
      period: `${days}일`,
      overallStats: {
        totalReviews: forgettingCurveData.totalReviews,
        successRate: Math.round(forgettingCurveData.successRate),
        retentionRate: Math.round(forgettingCurveData.retentionRate),
        averageResponseTime: Math.round(forgettingCurveData.averageResponseTime),
        efficiencyScore: efficiencyData.overallEfficiency
      },
      topCategories: forgettingCurveData.categoryAnalysis
        .sort((a, b) => b.successRate - a.successRate)
        .slice(0, 3)
        .map(cat => ({
          category: cat.category,
          successRate: Math.round(cat.successRate),
          totalReviews: cat.totalReviews
        })),
      weakCategories: forgettingCurveData.categoryAnalysis
        .sort((a, b) => a.successRate - b.successRate)
        .slice(0, 3)
        .map(cat => ({
          category: cat.category,
          successRate: Math.round(cat.successRate),
          totalReviews: cat.totalReviews
        })),
      levelDistribution: forgettingCurveData.levelDistribution,
      bestStudyTime: efficiencyData.learningPattern.bestTimeOfDay,
      consistencyScore: Math.round(efficiencyData.learningPattern.consistencyScore),
      recommendations: efficiencyData.recommendations.slice(0, 3)
    };
    
    res.json({
      success: true,
      data: summary
    });
  } catch (error) {
    console.error('Error fetching analytics summary:', error);
    res.status(500).json({ 
      success: false, 
      message: '분석 요약 데이터 조회 중 오류가 발생했습니다.',
      details: error instanceof Error ? error.message : 'Unknown error'
    });
  }
});

/**
 * GET /api/analytics/retention-curve
 * 망각곡선 보존율 데이터 조회
 */
router.get('/retention-curve', authenticateToken, async (req: AuthenticatedRequest, res: Response) => {
  try {
    const userId = req.user?.userId;
    if (!userId) {
      return res.status(401).json({ success: false, message: 'User not authenticated' });
    }

    const analytics = await analyticsService.getForgettingCurveAnalytics(userId, 90); // 90일 데이터
    
    res.json({
      success: true,
      data: {
        retentionCurve: analytics.retentionCurve,
        levelProgression: analytics.levelProgressionFlow
      }
    });
  } catch (error) {
    console.error('Error fetching retention curve:', error);
    res.status(500).json({ 
      success: false, 
      message: '보존율 곡선 데이터 조회 중 오류가 발생했습니다.',
      details: error instanceof Error ? error.message : 'Unknown error'
    });
  }
});

/**
 * GET /api/analytics/time-patterns
 * 시간대별 학습 패턴 분석 데이터 조회
 */
router.get('/time-patterns', authenticateToken, [
  query('days').optional().isInt({ min: 7, max: 365 })
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

    const userId = req.user?.userId;
    if (!userId) {
      return res.status(401).json({ success: false, message: 'User not authenticated' });
    }

    const days = parseInt(req.query.days as string) || 30;
    const analytics = await analyticsService.getForgettingCurveAnalytics(userId, days);
    
    res.json({
      success: true,
      data: {
        timeAnalysis: analytics.timeAnalysis,
        dailyPerformance: analytics.reviewPerformance
      }
    });
  } catch (error) {
    console.error('Error fetching time patterns:', error);
    res.status(500).json({ 
      success: false, 
      message: '시간대별 학습 패턴 데이터 조회 중 오류가 발생했습니다.',
      details: error instanceof Error ? error.message : 'Unknown error'
    });
  }
});

/**
 * GET /api/analytics/category-performance
 * 카테고리별 성능 분석 데이터 조회
 */
router.get('/category-performance', authenticateToken, [
  query('days').optional().isInt({ min: 7, max: 365 })
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

    const userId = req.user?.userId;
    if (!userId) {
      return res.status(401).json({ success: false, message: 'User not authenticated' });
    }

    const days = parseInt(req.query.days as string) || 30;
    const [analytics, efficiency] = await Promise.all([
      analyticsService.getForgettingCurveAnalytics(userId, days),
      analyticsService.getLearningEfficiencyMetrics(userId)
    ]);
    
    res.json({
      success: true,
      data: {
        categoryAnalysis: analytics.categoryAnalysis,
        forgettingRateByCategory: efficiency.forgettingRateByCategory,
        timeToMastery: efficiency.timeToMastery
      }
    });
  } catch (error) {
    console.error('Error fetching category performance:', error);
    res.status(500).json({ 
      success: false, 
      message: '카테고리별 성능 분석 데이터 조회 중 오류가 발생했습니다.',
      details: error instanceof Error ? error.message : 'Unknown error'
    });
  }
});

/**
 * GET /api/analytics/admin/overall-stats
 * 관리자용 전체 사용자 망각곡선 통계 조회
 */
router.get('/admin/overall-stats', authenticateToken, async (req: AuthenticatedRequest, res: Response) => {
  try {
    // 관리자 권한 확인은 생략 (추후 구현 시 requireAnyRole 미들웨어 추가)
    
    const overallAnalytics = await analyticsService.getOverallLearningAnalytics();
    
    res.json({
      success: true,
      data: overallAnalytics
    });
  } catch (error) {
    console.error('Error fetching overall analytics:', error);
    res.status(500).json({ 
      success: false, 
      message: '전체 통계 조회 중 오류가 발생했습니다.',
      details: error instanceof Error ? error.message : 'Unknown error'
    });
  }
});

/**
 * GET /api/analytics/admin/comparative-analysis
 * 관리자용 학습 효율성 비교 분석
 */
router.get('/admin/comparative-analysis', authenticateToken, [
  query('period').optional().isIn(['7', '30', '90', '365']),
  query('metric').optional().isIn(['retention', 'efficiency', 'progress', 'consistency'])
], async (req: AuthenticatedRequest, res: Response) => {
  try {
    const period = parseInt(req.query.period as string) || 30;
    const metric = (req.query.metric as string) || 'retention';
    
    const comparativeData = await analyticsService.getComparativeLearningAnalysis(period, metric);
    
    res.json({
      success: true,
      data: comparativeData
    });
  } catch (error) {
    console.error('Error fetching comparative analysis:', error);
    res.status(500).json({ 
      success: false, 
      message: '비교 분석 데이터 조회 중 오류가 발생했습니다.',
      details: error instanceof Error ? error.message : 'Unknown error'
    });
  }
});

/**
 * POST /api/analytics/invalidate-cache
 * 분석 데이터 캐시 무효화
 */
router.post('/invalidate-cache', authenticateToken, async (req: AuthenticatedRequest, res: Response) => {
  try {
    const userId = req.user?.userId;
    if (!userId) {
      return res.status(401).json({ success: false, message: 'User not authenticated' });
    }

    await analyticsService.invalidateAnalyticsCache(userId);
    
    res.json({
      success: true,
      message: '분석 데이터 캐시가 무효화되었습니다.'
    });
  } catch (error) {
    console.error('Error invalidating analytics cache:', error);
    res.status(500).json({ 
      success: false, 
      message: '캐시 무효화 중 오류가 발생했습니다.' 
    });
  }
});

export default router;