import { cacheUtils } from '../config/redis.js';
import { logger } from '../config/logger.js';
import { LearningPatternData } from './learningPatternService.js';

/**
 * 학습 패턴 분석 결과를 Redis에 캐시하는 서비스
 */
export class LearningPatternCache {
  
  // 캐시 키 prefix
  private static readonly PREFIX = 'learning_pattern';
  private static readonly SUMMARY_PREFIX = 'learning_summary';
  private static readonly SESSION_PREFIX = 'learning_session';
  private static readonly REALTIME_PREFIX = 'realtime_stats';
  
  // TTL 설정 (초)
  private static readonly TTL = {
    FULL_ANALYSIS: 3600,    // 1시간 (전체 분석)
    SUMMARY: 1800,          // 30분 (요약 정보)
    SESSION: 300,           // 5분 (세션 데이터)
    REALTIME: 60,           // 1분 (실시간 통계)
    PATTERN_TRENDS: 7200    // 2시간 (패턴 트렌드)
  };
  
  /**
   * 전체 학습 패턴 분석 결과를 캐시합니다
   */
  static async setLearningPattern(userId: string, data: LearningPatternData): Promise<boolean> {
    const key = `${this.PREFIX}:full:${userId}`;
    const success = await cacheUtils.set(key, data, this.TTL.FULL_ANALYSIS);
    
    if (success) {
      logger.info(`Learning pattern cached for user ${userId}`);
      // 분석 완료 시간도 별도로 저장
      await cacheUtils.set(`${key}:timestamp`, Date.now(), this.TTL.FULL_ANALYSIS);
    } else {
      logger.error(`Failed to cache learning pattern for user ${userId}`);
    }
    
    return success;
  }
  
  /**
   * 전체 학습 패턴 분석 결과를 조회합니다
   */
  static async getLearningPattern(userId: string): Promise<LearningPatternData | null> {
    const key = `${this.PREFIX}:full:${userId}`;
    const data = await cacheUtils.get(key);
    
    if (data) {
      logger.info(`Learning pattern cache hit for user ${userId}`);
    } else {
      logger.info(`Learning pattern cache miss for user ${userId}`);
    }
    
    return data;
  }
  
  /**
   * 학습 패턴 요약 정보를 캐시합니다
   */
  static async setLearningPatternSummary(userId: string, summaryData: any): Promise<boolean> {
    const key = `${this.SUMMARY_PREFIX}:${userId}`;
    return await cacheUtils.set(key, summaryData, this.TTL.SUMMARY);
  }
  
  /**
   * 학습 패턴 요약 정보를 조회합니다
   */
  static async getLearningPatternSummary(userId: string): Promise<any | null> {
    const key = `${this.SUMMARY_PREFIX}:${userId}`;
    return await cacheUtils.get(key);
  }
  
  /**
   * 현재 학습 세션 정보를 실시간 캐시합니다
   */
  static async setCurrentSession(userId: string, sessionData: {
    sessionId: string;
    startTime: Date;
    currentProblem?: string;
    problemsAttempted: number;
    problemsCorrect: number;
    currentFocusScore?: number;
    averageResponseTime: number;
  }): Promise<boolean> {
    const key = `${this.SESSION_PREFIX}:current:${userId}`;
    return await cacheUtils.set(key, sessionData, this.TTL.SESSION);
  }
  
  /**
   * 현재 학습 세션 정보를 조회합니다
   */
  static async getCurrentSession(userId: string): Promise<any | null> {
    const key = `${this.SESSION_PREFIX}:current:${userId}`;
    return await cacheUtils.get(key);
  }
  
  /**
   * 학습 세션을 종료하고 캐시를 정리합니다
   */
  static async endCurrentSession(userId: string): Promise<boolean> {
    const key = `${this.SESSION_PREFIX}:current:${userId}`;
    return await cacheUtils.del(key);
  }
  
  /**
   * 실시간 학습 통계를 업데이트합니다
   */
  static async updateRealtimeStats(userId: string, stats: {
    problemsAttempted: number;
    problemsCorrect: number;
    sessionTime: number; // 분
    avgResponseTime: number; // 초
    currentStreak: number; // 연속 정답
    focusScore?: number;
  }): Promise<boolean> {
    const key = `${this.REALTIME_PREFIX}:${userId}`;
    const existingStats = await cacheUtils.get(key) || {};
    
    // 기존 통계와 병합
    const updatedStats = {
      ...existingStats,
      ...stats,
      lastUpdated: Date.now()
    };
    
    return await cacheUtils.set(key, updatedStats, this.TTL.REALTIME);
  }
  
  /**
   * 실시간 학습 통계를 조회합니다
   */
  static async getRealtimeStats(userId: string): Promise<any | null> {
    const key = `${this.REALTIME_PREFIX}:${userId}`;
    return await cacheUtils.get(key);
  }
  
  /**
   * 학습 패턴 트렌드 데이터를 캐시합니다
   */
  static async setPatternTrends(userId: string, trendData: {
    weeklyPerformance: Array<{
      week: string;
      successRate: number;
      studyTime: number;
      focusScore: number;
    }>;
    difficultyTrends: Array<{
      difficulty: number;
      trendDirection: 'IMPROVING' | 'STABLE' | 'DECLINING';
      recentSuccessRate: number;
    }>;
    learningVelocity: {
      problemsPerHour: number;
      accuracyTrend: 'IMPROVING' | 'STABLE' | 'DECLINING';
      consistencyScore: number;
    };
  }): Promise<boolean> {
    const key = `${this.PREFIX}:trends:${userId}`;
    return await cacheUtils.set(key, trendData, this.TTL.PATTERN_TRENDS);
  }
  
  /**
   * 학습 패턴 트렌드 데이터를 조회합니다
   */
  static async getPatternTrends(userId: string): Promise<any | null> {
    const key = `${this.PREFIX}:trends:${userId}`;
    return await cacheUtils.get(key);
  }
  
  /**
   * 사용자별 학습 패턴 메타데이터를 관리합니다 (분석 빈도, 마지막 업데이트 등)
   */
  static async setPatternMetadata(userId: string, metadata: {
    lastFullAnalysis: Date;
    analysisCount: number;
    dataQuality: 'HIGH' | 'MEDIUM' | 'LOW'; // 분석 데이터 품질
    needsRefresh: boolean;
    nextScheduledAnalysis?: Date;
  }): Promise<boolean> {
    const key = `${this.PREFIX}:metadata:${userId}`;
    return await cacheUtils.set(key, metadata, this.TTL.FULL_ANALYSIS);
  }
  
  /**
   * 사용자별 학습 패턴 메타데이터를 조회합니다
   */
  static async getPatternMetadata(userId: string): Promise<any | null> {
    const key = `${this.PREFIX}:metadata:${userId}`;
    return await cacheUtils.get(key);
  }
  
  /**
   * 학습 패턴 분석이 필요한지 확인합니다
   */
  static async needsAnalysisRefresh(userId: string): Promise<boolean> {
    const metadata = await this.getPatternMetadata(userId);
    if (!metadata) return true;
    
    const lastAnalysis = new Date(metadata.lastFullAnalysis);
    const now = new Date();
    const hoursSinceLastAnalysis = (now.getTime() - lastAnalysis.getTime()) / (1000 * 60 * 60);
    
    // 24시간 이상 지났거나 명시적으로 새로고침이 필요한 경우
    return hoursSinceLastAnalysis >= 24 || metadata.needsRefresh;
  }
  
  /**
   * 복습 스케줄 관련 캐시 (빠른 조회용)
   */
  static async setUpcomingReviews(userId: string, reviews: Array<{
    id: string;
    problemId: string;
    scheduledAt: Date;
    currentLevel: string;
    priority: number;
  }>): Promise<boolean> {
    const key = `${this.PREFIX}:reviews:${userId}`;
    return await cacheUtils.set(key, reviews, this.TTL.SUMMARY);
  }
  
  /**
   * 다가오는 복습 목록을 조회합니다
   */
  static async getUpcomingReviews(userId: string): Promise<any[] | null> {
    const key = `${this.PREFIX}:reviews:${userId}`;
    return await cacheUtils.get(key);
  }
  
  /**
   * 학습 성과 리더보드 캐시 (동기부여용)
   */
  static async setPerformanceRankings(rankings: Array<{
    userId: string;
    rank: number;
    score: number;
    weeklyImprovement: number;
  }>): Promise<boolean> {
    const key = `${this.PREFIX}:rankings:weekly`;
    return await cacheUtils.set(key, rankings, this.TTL.SUMMARY);
  }
  
  /**
   * 학습 성과 리더보드를 조회합니다
   */
  static async getPerformanceRankings(): Promise<any[] | null> {
    const key = `${this.PREFIX}:rankings:weekly`;
    return await cacheUtils.get(key);
  }
  
  /**
   * 사용자의 모든 학습 패턴 캐시를 삭제합니다
   */
  static async clearUserCache(userId: string): Promise<boolean> {
    const keys = [
      `${this.PREFIX}:full:${userId}`,
      `${this.PREFIX}:full:${userId}:timestamp`,
      `${this.SUMMARY_PREFIX}:${userId}`,
      `${this.SESSION_PREFIX}:current:${userId}`,
      `${this.REALTIME_PREFIX}:${userId}`,
      `${this.PREFIX}:trends:${userId}`,
      `${this.PREFIX}:metadata:${userId}`,
      `${this.PREFIX}:reviews:${userId}`
    ];
    
    let success = true;
    for (const key of keys) {
      const deleted = await cacheUtils.del(key);
      if (!deleted) success = false;
    }
    
    if (success) {
      logger.info(`All learning pattern cache cleared for user ${userId}`);
    } else {
      logger.error(`Failed to clear some learning pattern cache for user ${userId}`);
    }
    
    return success;
  }
  
  /**
   * 배치 캐시 업데이트 (여러 사용자의 요약 정보를 한번에 업데이트)
   */
  static async batchUpdateSummaries(summaries: Array<{ userId: string; data: any }>): Promise<number> {
    let successCount = 0;
    
    const updatePromises = summaries.map(async ({ userId, data }) => {
      const success = await this.setLearningPatternSummary(userId, data);
      if (success) successCount++;
      return success;
    });
    
    await Promise.all(updatePromises);
    
    logger.info(`Batch summary update completed: ${successCount}/${summaries.length} successful`);
    return successCount;
  }
  
  /**
   * 캐시 상태를 체크하고 통계를 반환합니다
   */
  static async getCacheStats(): Promise<{
    totalKeys: number;
    keysByType: Record<string, number>;
    avgTtl: number;
  }> {
    // Redis의 모든 학습 패턴 관련 키를 스캔하여 통계 생성
    // 실제 구현에서는 Redis SCAN 명령을 사용해야 합니다
    const keyTypes = [
      this.PREFIX,
      this.SUMMARY_PREFIX,
      this.SESSION_PREFIX,
      this.REALTIME_PREFIX
    ];
    
    const keysByType: Record<string, number> = {};
    let totalKeys = 0;
    
    for (const type of keyTypes) {
      // 실제로는 SCAN 명령으로 패턴 매칭된 키 개수를 세어야 함
      keysByType[type] = 0; // 임시값
    }
    
    return {
      totalKeys,
      keysByType,
      avgTtl: 0 // 임시값
    };
  }
  
  /**
   * 캐시 warm-up: 자주 사용되는 사용자의 데이터를 미리 로드합니다
   */
  static async warmUpCache(userIds: string[]): Promise<void> {
    logger.info(`Starting cache warm-up for ${userIds.length} users`);
    
    // 병렬로 요약 정보만 미리 로드 (전체 분석은 너무 비용이 큼)
    const warmUpPromises = userIds.map(async (userId) => {
      try {
        const exists = await cacheUtils.exists(`${this.SUMMARY_PREFIX}:${userId}`);
        if (!exists) {
          // 요약 정보가 없으면 DB에서 조회해서 캐시
          // 실제로는 LearningPatternService.getLearningPatternSummary를 호출
          logger.info(`Pre-loading summary for user ${userId}`);
        }
      } catch (error) {
        logger.error(`Failed to warm up cache for user ${userId}:`, error);
      }
    });
    
    await Promise.all(warmUpPromises);
    logger.info('Cache warm-up completed');
  }
  
  /**
   * TTL이 곧 만료될 캐시를 갱신합니다
   */
  static async refreshExpiringCache(userId: string): Promise<boolean> {
    const summaryKey = `${this.SUMMARY_PREFIX}:${userId}`;
    const ttl = await cacheUtils.ttl(summaryKey);
    
    // TTL이 5분 이하로 남았으면 갱신
    if (ttl > 0 && ttl <= 300) {
      logger.info(`Refreshing expiring cache for user ${userId} (TTL: ${ttl}s)`);
      // 실제로는 새로운 데이터를 DB에서 조회해서 갱신
      return await cacheUtils.expire(summaryKey, this.TTL.SUMMARY);
    }
    
    return false;
  }
}

export default LearningPatternCache;