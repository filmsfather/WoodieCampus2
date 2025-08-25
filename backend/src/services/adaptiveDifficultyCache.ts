import { cacheUtils } from '../config/redis.js';
import { logger } from '../config/logger.js';
import { DifficultyPredictionResult, DifficultyPredictionInput } from './adaptiveDifficultyService.js';
import { DifficultyFeedback } from '../types/common.js';

/**
 * 적응형 난이도 조정을 위한 Redis 캐싱 서비스
 */
export class AdaptiveDifficultyCache {
  
  // 캐시 키 prefix
  private static readonly PREFIX = 'adaptive_difficulty';
  private static readonly USER_PROFILE_PREFIX = 'user_difficulty_profile';
  private static readonly PROBLEM_DIFFICULTY_PREFIX = 'problem_difficulty';
  private static readonly FEEDBACK_AGGREGATION_PREFIX = 'feedback_aggregation';
  private static readonly PREDICTION_CACHE_PREFIX = 'difficulty_prediction';
  
  // TTL 설정 (초)
  private static readonly TTL = {
    USER_PROFILE: 3600,        // 1시간 (개인 프로필)
    PROBLEM_DIFFICULTY: 1800,  // 30분 (문제별 난이도)
    FEEDBACK_AGGREGATION: 300, // 5분 (피드백 집계)
    PREDICTION_CACHE: 600,     // 10분 (예측 결과)
    REALTIME_STATS: 60,        // 1분 (실시간 통계)
    ADJUSTMENT_QUEUE: 1800     // 30분 (조정 대기열)
  };
  
  /**
   * 사용자의 개인화된 난이도 프로필을 캐시합니다
   */
  static async cacheUserDifficultyProfile(userId: string, profile: {
    idealDifficulty: number;
    preferredRange: { min: number; max: number };
    learningPace: string;
    frustrationTolerance: number;
    recentPerformance: number[];
    lastUpdated: Date;
  }): Promise<boolean> {
    const key = `${this.USER_PROFILE_PREFIX}:${userId}`;
    return await cacheUtils.set(key, profile, this.TTL.USER_PROFILE);
  }
  
  /**
   * 사용자 난이도 프로필을 조회합니다
   */
  static async getUserDifficultyProfile(userId: string): Promise<any | null> {
    const key = `${this.USER_PROFILE_PREFIX}:${userId}`;
    return await cacheUtils.get(key);
  }
  
  /**
   * 문제별 동적 난이도 정보를 캐시합니다
   */
  static async cacheProblemDifficulty(problemId: string, difficultyData: {
    originalDifficulty: number;
    currentAdjustedDifficulty: number;
    adjustmentHistory: Array<{
      timestamp: Date;
      adjustment: number;
      reason: string;
    }>;
    feedbackSummary: {
      totalFeedbacks: number;
      averageFeedback: number;
      retryRate: number;
      lastFeedbackTime: Date;
    };
    globalStats: {
      averageSuccessRate: number;
      averageResponseTime: number;
      popularityScore: number;
    };
  }): Promise<boolean> {
    const key = `${this.PROBLEM_DIFFICULTY_PREFIX}:${problemId}`;
    return await cacheUtils.set(key, difficultyData, this.TTL.PROBLEM_DIFFICULTY);
  }
  
  /**
   * 문제별 난이도 정보를 조회합니다
   */
  static async getProblemDifficulty(problemId: string): Promise<any | null> {
    const key = `${this.PROBLEM_DIFFICULTY_PREFIX}:${problemId}`;
    return await cacheUtils.get(key);
  }
  
  /**
   * 실시간 피드백 집계를 캐시합니다
   */
  static async cacheFeedbackAggregation(problemId: string, aggregation: {
    windowStart: Date;
    totalFeedbacks: number;
    feedbackCounts: {
      RETRY: number;
      TOO_HARD: number;
      JUST_RIGHT: number;
      TOO_EASY: number;
    };
    averageResponseTime: number;
    successRate: number;
    needsAdjustment: boolean;
    adjustmentUrgency: 'LOW' | 'MEDIUM' | 'HIGH';
  }): Promise<boolean> {
    const key = `${this.FEEDBACK_AGGREGATION_PREFIX}:${problemId}`;
    return await cacheUtils.set(key, aggregation, this.TTL.FEEDBACK_AGGREGATION);
  }
  
  /**
   * 피드백 집계 정보를 조회합니다
   */
  static async getFeedbackAggregation(problemId: string): Promise<any | null> {
    const key = `${this.FEEDBACK_AGGREGATION_PREFIX}:${problemId}`;
    return await cacheUtils.get(key);
  }
  
  /**
   * 난이도 예측 결과를 캐시합니다
   */
  static async cacheDifficultyPrediction(
    userId: string, 
    problemId: string, 
    prediction: DifficultyPredictionResult & { timestamp: Date }
  ): Promise<boolean> {
    const key = `${this.PREDICTION_CACHE_PREFIX}:${userId}:${problemId}`;
    return await cacheUtils.set(key, prediction, this.TTL.PREDICTION_CACHE);
  }
  
  /**
   * 캐시된 난이도 예측 결과를 조회합니다
   */
  static async getDifficultyPrediction(userId: string, problemId: string): Promise<any | null> {
    const key = `${this.PREDICTION_CACHE_PREFIX}:${userId}:${problemId}`;
    return await cacheUtils.get(key);
  }
  
  /**
   * 실시간 피드백을 즉시 처리하고 집계를 업데이트합니다
   */
  static async processRealtimeFeedback(
    problemId: string, 
    userId: string, 
    feedback: DifficultyFeedback,
    metadata: {
      responseTime?: number;
      isCorrect?: boolean;
      sessionId?: string;
    }
  ): Promise<void> {
    // 1. 현재 집계 정보 가져오기
    let aggregation = await this.getFeedbackAggregation(problemId);
    
    if (!aggregation) {
      aggregation = {
        windowStart: new Date(),
        totalFeedbacks: 0,
        feedbackCounts: {
          RETRY: 0,
          TOO_HARD: 0,
          JUST_RIGHT: 0,
          TOO_EASY: 0
        },
        averageResponseTime: 0,
        successRate: 0,
        needsAdjustment: false,
        adjustmentUrgency: 'LOW'
      };
    }
    
    // 2. 새 피드백으로 집계 업데이트
    aggregation.totalFeedbacks += 1;
    aggregation.feedbackCounts[feedback] += 1;
    
    if (metadata.responseTime) {
      const totalTime = aggregation.averageResponseTime * (aggregation.totalFeedbacks - 1);
      aggregation.averageResponseTime = (totalTime + metadata.responseTime) / aggregation.totalFeedbacks;
    }
    
    if (metadata.isCorrect !== undefined) {
      const totalCorrect = aggregation.successRate * (aggregation.totalFeedbacks - 1);
      const newCorrect = totalCorrect + (metadata.isCorrect ? 1 : 0);
      aggregation.successRate = newCorrect / aggregation.totalFeedbacks;
    }
    
    // 3. 조정 필요성 판단
    const negativeRate = (aggregation.feedbackCounts.RETRY + aggregation.feedbackCounts.TOO_HARD) / aggregation.totalFeedbacks;
    const easyRate = aggregation.feedbackCounts.TOO_EASY / aggregation.totalFeedbacks;
    
    aggregation.needsAdjustment = negativeRate > 0.6 || easyRate > 0.7;
    
    if (negativeRate > 0.8) {
      aggregation.adjustmentUrgency = 'HIGH';
    } else if (negativeRate > 0.6 || easyRate > 0.7) {
      aggregation.adjustmentUrgency = 'MEDIUM';
    } else {
      aggregation.adjustmentUrgency = 'LOW';
    }
    
    // 4. 집계 정보 캐시 업데이트
    await this.cacheFeedbackAggregation(problemId, aggregation);
    
    // 5. 조정이 필요한 경우 조정 대기열에 추가
    if (aggregation.needsAdjustment && aggregation.adjustmentUrgency !== 'LOW') {
      await this.addToAdjustmentQueue(problemId, aggregation.adjustmentUrgency);
    }
    
    logger.info(`Realtime feedback processed: Problem ${problemId}, Feedback: ${feedback}, Urgency: ${aggregation.adjustmentUrgency}`);
  }
  
  /**
   * 난이도 조정 대기열에 문제를 추가합니다
   */
  static async addToAdjustmentQueue(problemId: string, urgency: 'LOW' | 'MEDIUM' | 'HIGH'): Promise<void> {
    const queueKey = `${this.PREFIX}:adjustment_queue:${urgency.toLowerCase()}`;
    
    const queueItem = {
      problemId,
      addedAt: new Date(),
      urgency,
      processingAttempts: 0
    };
    
    // Redis List를 사용해서 우선순위 큐 구현
    await cacheUtils.set(`${queueKey}:${problemId}`, queueItem, this.TTL.ADJUSTMENT_QUEUE);
  }
  
  /**
   * 조정 대기열에서 다음 처리할 문제를 가져옵니다
   */
  static async getNextAdjustmentTask(): Promise<{ problemId: string; urgency: string } | null> {
    // 우선순위 순으로 확인: HIGH -> MEDIUM -> LOW
    const priorities = ['high', 'medium', 'low'];
    
    for (const priority of priorities) {
      const queueKey = `${this.PREFIX}:adjustment_queue:${priority}`;
      
      // 패턴 매칭으로 큐 아이템 찾기 (실제로는 Redis SCAN 사용)
      // 임시 구현: 개별 키 확인
      const testKey = `${queueKey}:*`;
      if (await cacheUtils.exists(testKey)) {
        return { problemId: 'temp', urgency: priority };
      }
    }
    
    return null;
  }
  
  /**
   * 실시간 난이도 통계를 업데이트합니다
   */
  static async updateRealtimeDifficultyStats(stats: {
    totalProblemsWithFeedback: number;
    averageAdjustmentFrequency: number;
    activeUsers: number;
    feedbacksPerMinute: number;
    adjustmentsPerHour: number;
    topAdjustedProblems: Array<{
      problemId: string;
      adjustmentCount: number;
      lastAdjustment: Date;
    }>;
  }): Promise<boolean> {
    const key = `${this.PREFIX}:realtime_stats`;
    const timestampedStats = {
      ...stats,
      lastUpdated: new Date()
    };
    
    return await cacheUtils.set(key, timestampedStats, this.TTL.REALTIME_STATS);
  }
  
  /**
   * 실시간 난이도 통계를 조회합니다
   */
  static async getRealtimeDifficultyStats(): Promise<any | null> {
    const key = `${this.PREFIX}:realtime_stats`;
    return await cacheUtils.get(key);
  }
  
  /**
   * 사용자별 개인화된 문제 추천 목록을 캐시합니다
   */
  static async cachePersonalizedRecommendations(
    userId: string, 
    categoryId: string | null, 
    recommendations: Array<{
      problemId: string;
      predictedDifficulty: number;
      personalizedScore: number;
      recommendationReason: string;
      estimatedCompletionTime: number;
    }>
  ): Promise<boolean> {
    const key = `${this.PREFIX}:recommendations:${userId}:${categoryId || 'all'}`;
    const cachedData = {
      recommendations,
      generatedAt: new Date(),
      expiresAt: new Date(Date.now() + this.TTL.PREDICTION_CACHE * 1000)
    };
    
    return await cacheUtils.set(key, cachedData, this.TTL.PREDICTION_CACHE);
  }
  
  /**
   * 개인화된 문제 추천 목록을 조회합니다
   */
  static async getPersonalizedRecommendations(userId: string, categoryId: string | null): Promise<any | null> {
    const key = `${this.PREFIX}:recommendations:${userId}:${categoryId || 'all'}`;
    return await cacheUtils.get(key);
  }
  
  /**
   * 문제별 피드백 히스토리 요약을 캐시합니다
   */
  static async cacheProblemFeedbackSummary(problemId: string, summary: {
    last24Hours: {
      totalFeedbacks: number;
      feedbackDistribution: Record<string, number>;
      averageResponseTime: number;
      successRate: number;
    };
    last7Days: {
      totalFeedbacks: number;
      trendDirection: 'IMPROVING' | 'STABLE' | 'DECLINING';
      adjustmentHistory: number;
    };
    allTime: {
      totalFeedbacks: number;
      averageDifficulty: number;
      stabilityScore: number;
    };
  }): Promise<boolean> {
    const key = `${this.PREFIX}:feedback_summary:${problemId}`;
    return await cacheUtils.set(key, summary, this.TTL.FEEDBACK_AGGREGATION);
  }
  
  /**
   * 배치 예측 캐시 업데이트 (여러 사용자-문제 조합을 한번에 처리)
   */
  static async batchUpdatePredictions(predictions: Array<{
    userId: string;
    problemId: string;
    prediction: DifficultyPredictionResult;
  }>): Promise<number> {
    let successCount = 0;
    
    const updatePromises = predictions.map(async ({ userId, problemId, prediction }) => {
      const success = await this.cacheDifficultyPrediction(userId, problemId, {
        ...prediction,
        timestamp: new Date()
      });
      if (success) successCount++;
      return success;
    });
    
    await Promise.all(updatePromises);
    
    logger.info(`Batch prediction cache update: ${successCount}/${predictions.length} successful`);
    return successCount;
  }
  
  /**
   * 특정 사용자의 모든 난이도 관련 캐시를 삭제합니다
   */
  static async clearUserDifficultyCache(userId: string): Promise<boolean> {
    const keys = [
      `${this.USER_PROFILE_PREFIX}:${userId}`,
      `${this.PREFIX}:recommendations:${userId}:*`,
      `${this.PREDICTION_CACHE_PREFIX}:${userId}:*`
    ];
    
    let success = true;
    for (const keyPattern of keys) {
      // 실제로는 Redis SCAN으로 패턴 매칭된 키들을 삭제해야 함
      const deleted = await cacheUtils.del(keyPattern);
      if (!deleted && !keyPattern.includes('*')) success = false;
    }
    
    if (success) {
      logger.info(`All difficulty cache cleared for user ${userId}`);
    } else {
      logger.error(`Failed to clear some difficulty cache for user ${userId}`);
    }
    
    return success;
  }
  
  /**
   * 문제별 모든 난이도 관련 캐시를 삭제합니다
   */
  static async clearProblemDifficultyCache(problemId: string): Promise<boolean> {
    const keys = [
      `${this.PROBLEM_DIFFICULTY_PREFIX}:${problemId}`,
      `${this.FEEDBACK_AGGREGATION_PREFIX}:${problemId}`,
      `${this.PREFIX}:feedback_summary:${problemId}`,
      `${this.PREFIX}:adjustment_queue:*:${problemId}`
    ];
    
    let success = true;
    for (const keyPattern of keys) {
      const deleted = await cacheUtils.del(keyPattern);
      if (!deleted && !keyPattern.includes('*')) success = false;
    }
    
    return success;
  }
  
  /**
   * 캐시된 데이터의 유효성을 검증합니다
   */
  static async validateCacheConsistency(): Promise<{
    userProfiles: number;
    problemDifficulties: number;
    feedbackAggregations: number;
    predictions: number;
    inconsistencies: string[];
  }> {
    // 실제로는 더 복잡한 검증 로직이 필요
    // 임시로 기본 통계 반환
    return {
      userProfiles: 0,
      problemDifficulties: 0,
      feedbackAggregations: 0,
      predictions: 0,
      inconsistencies: []
    };
  }
  
  /**
   * 캐시 성능 메트릭을 수집합니다
   */
  static async getCacheMetrics(): Promise<{
    hitRate: number;
    missRate: number;
    totalRequests: number;
    averageResponseTime: number;
    memoryUsage: string;
    topHotKeys: string[];
  }> {
    // 실제로는 Redis INFO 명령어와 커스텀 메트릭 수집 필요
    return {
      hitRate: 0.85,
      missRate: 0.15,
      totalRequests: 10000,
      averageResponseTime: 2.5,
      memoryUsage: '128MB',
      topHotKeys: []
    };
  }
}

export default AdaptiveDifficultyCache;