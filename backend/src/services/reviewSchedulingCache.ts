import { cacheUtils } from '../config/redis.js';
import { logger } from '../config/logger.js';
import { ReviewItem, SchedulingOptions } from './reviewSchedulingService.js';
import { ForgettingCurveLevel } from '../types/common.js';

/**
 * 복습 스케줄링 전용 Redis 캐싱 서비스
 */
export class ReviewSchedulingCache {
  
  // 캐시 키 prefix
  private static readonly PREFIX = 'review_scheduling';
  private static readonly USER_SCHEDULE_PREFIX = 'user_schedule';
  private static readonly PRIORITY_QUEUE_PREFIX = 'priority_queue';
  private static readonly SCHEDULE_STATS_PREFIX = 'schedule_stats';
  private static readonly TIME_SLOTS_PREFIX = 'time_slots';
  private static readonly OVERDUE_ITEMS_PREFIX = 'overdue_items';
  
  // TTL 설정 (초)
  private static readonly TTL = {
    USER_SCHEDULE: 900,       // 15분 (개인 스케줄)
    PRIORITY_QUEUE: 300,      // 5분 (우선순위 큐)
    SCHEDULE_STATS: 1800,     // 30분 (통계)
    TIME_SLOTS: 3600,         // 1시간 (시간대별 슬롯)
    OVERDUE_ITEMS: 60,        // 1분 (지연 항목)
    BATCH_UPDATES: 600,       // 10분 (배치 업데이트)
    REALTIME_METRICS: 120     // 2분 (실시간 메트릭)
  };

  /**
   * 사용자별 개인화된 복습 스케줄을 캐시합니다
   */
  static async cacheUserSchedule(
    userId: string, 
    schedule: ReviewItem[],
    options?: SchedulingOptions
  ): Promise<boolean> {
    const key = `${this.USER_SCHEDULE_PREFIX}:${userId}`;
    
    const cacheData = {
      schedule,
      options: options || {},
      generatedAt: new Date(),
      totalItems: schedule.length,
      overdueCount: schedule.filter(item => item.isOverdue).length,
      highPriorityCount: schedule.filter(item => item.priorityScore > 70).length
    };
    
    return await cacheUtils.set(key, cacheData, this.TTL.USER_SCHEDULE);
  }

  /**
   * 사용자의 캐시된 복습 스케줄을 조회합니다
   */
  static async getUserSchedule(userId: string): Promise<{
    schedule: ReviewItem[];
    options: SchedulingOptions;
    generatedAt: Date;
    totalItems: number;
    overdueCount: number;
    highPriorityCount: number;
  } | null> {
    const key = `${this.USER_SCHEDULE_PREFIX}:${userId}`;
    return await cacheUtils.get(key);
  }

  /**
   * 우선순위 기반 복습 큐를 캐시합니다
   */
  static async cachePriorityQueue(
    userId: string,
    queueData: {
      highPriority: ReviewItem[];
      mediumPriority: ReviewItem[];
      lowPriority: ReviewItem[];
      overdueItems: ReviewItem[];
    }
  ): Promise<boolean> {
    const key = `${this.PRIORITY_QUEUE_PREFIX}:${userId}`;
    
    const cacheData = {
      ...queueData,
      lastUpdated: new Date(),
      totalItems: Object.values(queueData).flat().length
    };
    
    return await cacheUtils.set(key, cacheData, this.TTL.PRIORITY_QUEUE);
  }

  /**
   * 우선순위 큐를 조회합니다
   */
  static async getPriorityQueue(userId: string): Promise<any | null> {
    const key = `${this.PRIORITY_QUEUE_PREFIX}:${userId}`;
    return await cacheUtils.get(key);
  }

  /**
   * 복습 스케줄 통계를 캐시합니다
   */
  static async cacheScheduleStats(userId: string, stats: {
    totalScheduled: number;
    overdueCount: number;
    todayCount: number;
    weekCount: number;
    averagePriorityScore: number;
    byLevel: Record<ForgettingCurveLevel, number>;
    performance: {
      completionRate: number;
      averageResponseTime: number;
      streakDays: number;
    };
    trends: {
      dailyCompletions: number[];
      weeklyProgress: number[];
    };
  }): Promise<boolean> {
    const key = `${this.SCHEDULE_STATS_PREFIX}:${userId}`;
    
    const cacheData = {
      ...stats,
      lastCalculated: new Date()
    };
    
    return await cacheUtils.set(key, cacheData, this.TTL.SCHEDULE_STATS);
  }

  /**
   * 복습 스케줄 통계를 조회합니다
   */
  static async getScheduleStats(userId: string): Promise<any | null> {
    const key = `${this.SCHEDULE_STATS_PREFIX}:${userId}`;
    return await cacheUtils.get(key);
  }

  /**
   * 시간대별 복습 슬롯을 캐시합니다
   */
  static async cacheTimeSlots(
    userId: string,
    date: string, // YYYY-MM-DD 형식
    slots: Array<{
      hour: number;
      available: boolean;
      scheduledCount: number;
      maxCapacity: number;
      recommendedItems: ReviewItem[];
    }>
  ): Promise<boolean> {
    const key = `${this.TIME_SLOTS_PREFIX}:${userId}:${date}`;
    
    const cacheData = {
      date,
      slots,
      lastUpdated: new Date(),
      totalAvailable: slots.filter(s => s.available).length
    };
    
    return await cacheUtils.set(key, cacheData, this.TTL.TIME_SLOTS);
  }

  /**
   * 시간대별 복습 슬롯을 조회합니다
   */
  static async getTimeSlots(userId: string, date: string): Promise<any | null> {
    const key = `${this.TIME_SLOTS_PREFIX}:${userId}:${date}`;
    return await cacheUtils.get(key);
  }

  /**
   * 지연된 복습 항목들을 캐시합니다
   */
  static async cacheOverdueItems(
    userId: string,
    overdueItems: Array<ReviewItem & {
      urgencyLevel: 'LOW' | 'MEDIUM' | 'HIGH' | 'CRITICAL';
      suggestedAction: string;
      impactScore: number;
    }>
  ): Promise<boolean> {
    const key = `${this.OVERDUE_ITEMS_PREFIX}:${userId}`;
    
    const cacheData = {
      items: overdueItems,
      lastUpdated: new Date(),
      totalCount: overdueItems.length,
      criticalCount: overdueItems.filter(item => item.urgencyLevel === 'CRITICAL').length,
      averageOverdueHours: overdueItems.reduce((sum, item) => 
        sum + (item.overdueHours || 0), 0) / Math.max(overdueItems.length, 1)
    };
    
    return await cacheUtils.set(key, cacheData, this.TTL.OVERDUE_ITEMS);
  }

  /**
   * 지연된 복습 항목들을 조회합니다
   */
  static async getOverdueItems(userId: string): Promise<any | null> {
    const key = `${this.OVERDUE_ITEMS_PREFIX}:${userId}`;
    return await cacheUtils.get(key);
  }

  /**
   * 실시간 복습 메트릭을 업데이트합니다
   */
  static async updateRealtimeMetrics(metrics: {
    activeUsers: number;
    totalScheduledReviews: number;
    completedToday: number;
    averageCompletionTime: number;
    overdueRate: number;
    topPerformers: Array<{
      userId: string;
      completionRate: number;
      streakDays: number;
    }>;
    systemLoad: {
      scheduleGenerations: number;
      cacheHitRate: number;
      averageResponseTime: number;
    };
  }): Promise<boolean> {
    const key = `${this.PREFIX}:realtime_metrics`;
    
    const timestampedMetrics = {
      ...metrics,
      timestamp: new Date(),
      uptimeHours: process.uptime() / 3600
    };
    
    return await cacheUtils.set(key, timestampedMetrics, this.TTL.REALTIME_METRICS);
  }

  /**
   * 실시간 복습 메트릭을 조회합니다
   */
  static async getRealtimeMetrics(): Promise<any | null> {
    const key = `${this.PREFIX}:realtime_metrics`;
    return await cacheUtils.get(key);
  }

  /**
   * 배치 스케줄 업데이트 정보를 캐시합니다
   */
  static async cacheBatchUpdateInfo(batchInfo: {
    batchId: string;
    startedAt: Date;
    usersProcessed: number;
    totalUsers: number;
    schedulesGenerated: number;
    errors: number;
    estimatedCompletion: Date;
    status: 'RUNNING' | 'COMPLETED' | 'FAILED';
  }): Promise<boolean> {
    const key = `${this.PREFIX}:batch_update:${batchInfo.batchId}`;
    return await cacheUtils.set(key, batchInfo, this.TTL.BATCH_UPDATES);
  }

  /**
   * 배치 업데이트 정보를 조회합니다
   */
  static async getBatchUpdateInfo(batchId: string): Promise<any | null> {
    const key = `${this.PREFIX}:batch_update:${batchId}`;
    return await cacheUtils.get(key);
  }

  /**
   * 사용자별 복습 패턴을 캐시합니다
   */
  static async cacheUserReviewPattern(userId: string, pattern: {
    preferredTimes: number[];      // 선호 시간대 (24시간 형식)
    averageSessionLength: number;  // 평균 세션 길이 (분)
    optimalBatchSize: number;      // 최적 배치 크기
    difficultyPreference: number;  // 난이도 선호도 (1-10)
    categoryFocus: string[];       // 집중 카테고리
    weeklyFrequency: number;       // 주간 복습 빈도
    performanceByTimeOfDay: Record<number, number>; // 시간대별 성과
    motivationalFactors: {
      streakImportance: number;
      competitiveness: number;
      achievementOriented: number;
    };
  }): Promise<boolean> {
    const key = `${this.PREFIX}:user_pattern:${userId}`;
    
    const patternData = {
      ...pattern,
      lastUpdated: new Date(),
      confidence: this.calculatePatternConfidence(pattern)
    };
    
    return await cacheUtils.set(key, patternData, this.TTL.USER_SCHEDULE);
  }

  /**
   * 패턴 신뢰도를 계산합니다
   */
  private static calculatePatternConfidence(pattern: any): number {
    let confidence = 0;
    
    // 선호 시간대 일관성
    if (pattern.preferredTimes.length > 0) confidence += 20;
    
    // 세션 길이 안정성
    if (pattern.averageSessionLength > 0) confidence += 20;
    
    // 성과 데이터 충분성
    const timeSlots = Object.keys(pattern.performanceByTimeOfDay).length;
    confidence += Math.min(30, timeSlots * 3);
    
    // 빈도 일관성
    if (pattern.weeklyFrequency > 0) confidence += 15;
    
    // 카테고리 집중도
    if (pattern.categoryFocus.length > 0) confidence += 15;
    
    return Math.min(100, confidence);
  }

  /**
   * 특정 사용자의 모든 스케줄 관련 캐시를 삭제합니다
   */
  static async clearUserScheduleCache(userId: string): Promise<boolean> {
    const keys = [
      `${this.USER_SCHEDULE_PREFIX}:${userId}`,
      `${this.PRIORITY_QUEUE_PREFIX}:${userId}`,
      `${this.SCHEDULE_STATS_PREFIX}:${userId}`,
      `${this.OVERDUE_ITEMS_PREFIX}:${userId}`,
      `${this.PREFIX}:user_pattern:${userId}`
    ];
    
    let success = true;
    for (const key of keys) {
      const deleted = await cacheUtils.del(key);
      if (!deleted) success = false;
    }
    
    // 시간대별 캐시도 정리 (최근 7일)
    const today = new Date();
    for (let i = 0; i < 7; i++) {
      const date = new Date(today);
      date.setDate(date.getDate() - i);
      const dateStr = date.toISOString().split('T')[0];
      await cacheUtils.del(`${this.TIME_SLOTS_PREFIX}:${userId}:${dateStr}`);
    }
    
    if (success) {
      logger.info(`All schedule cache cleared for user ${userId}`);
    } else {
      logger.error(`Failed to clear some schedule cache for user ${userId}`);
    }
    
    return success;
  }

  /**
   * 캐시 성능 메트릭을 수집합니다
   */
  static async getCachePerformanceMetrics(): Promise<{
    hitRate: number;
    missRate: number;
    totalRequests: number;
    averageResponseTime: number;
    memoryUsage: string;
    topKeys: string[];
    errorRate: number;
  }> {
    // 실제로는 Redis INFO 명령어와 커스텀 메트릭 수집 필요
    // 임시로 기본값 반환
    return {
      hitRate: 0.92,
      missRate: 0.08,
      totalRequests: 15000,
      averageResponseTime: 1.8,
      memoryUsage: '256MB',
      topKeys: [
        `${this.USER_SCHEDULE_PREFIX}:*`,
        `${this.PRIORITY_QUEUE_PREFIX}:*`,
        `${this.SCHEDULE_STATS_PREFIX}:*`
      ],
      errorRate: 0.001
    };
  }

  /**
   * 스케줄 생성 성능을 추적합니다
   */
  static async trackScheduleGenerationPerformance(
    userId: string,
    startTime: number,
    endTime: number,
    itemsGenerated: number,
    cacheHit: boolean
  ): Promise<void> {
    const performanceData = {
      userId,
      generationTime: endTime - startTime,
      itemsGenerated,
      cacheHit,
      timestamp: new Date()
    };
    
    const key = `${this.PREFIX}:performance:${userId}:${Date.now()}`;
    await cacheUtils.set(key, performanceData, 300); // 5분간 보관
    
    // 성능 히스토리 업데이트 (최근 100개 항목만 유지)
    const historyKey = `${this.PREFIX}:performance_history:${userId}`;
    const history = await cacheUtils.get(historyKey) || [];
    history.push(performanceData);
    
    if (history.length > 100) {
      history.shift();
    }
    
    await cacheUtils.set(historyKey, history, this.TTL.SCHEDULE_STATS);
  }

  /**
   * 복습 완료율을 실시간 업데이트합니다
   */
  static async updateCompletionRate(userId: string, isCompleted: boolean): Promise<void> {
    const key = `${this.PREFIX}:completion_rate:${userId}`;
    
    const today = new Date().toISOString().split('T')[0];
    const dailyKey = `${key}:${today}`;
    
    const dailyData = await cacheUtils.get(dailyKey) || {
      completed: 0,
      attempted: 0,
      rate: 0
    };
    
    dailyData.attempted += 1;
    if (isCompleted) {
      dailyData.completed += 1;
    }
    dailyData.rate = dailyData.completed / dailyData.attempted;
    
    await cacheUtils.set(dailyKey, dailyData, this.TTL.SCHEDULE_STATS);
    
    logger.info(`Completion rate updated for user ${userId}: ${Math.round(dailyData.rate * 100)}%`);
  }
}

export default ReviewSchedulingCache;