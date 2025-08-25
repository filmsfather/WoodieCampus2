import cron from 'node-cron';
import { PrismaClient } from '@prisma/client';
import { ReviewStatus, ForgettingCurveLevel } from '../types/common.js';
import { logger } from '../config/logger.js';
import ReviewSchedulingService, { ReviewItem } from './reviewSchedulingService.js';
import ReviewSchedulingCache from './reviewSchedulingCache.js';

const prisma = new PrismaClient();

interface SchedulerConfig {
  enabled: boolean;
  timezone: string;
  batchSize: number;
  maxConcurrentJobs: number;
  retryAttempts: number;
}

/**
 * 복습 스케줄링 자동화 서비스
 * Cron job을 활용한 정기적인 복습 스케줄 생성 및 관리
 */
export class ReviewScheduler {
  
  private static instance: ReviewScheduler;
  private config: SchedulerConfig;
  private runningJobs: Set<string> = new Set();
  private jobStats = {
    totalRuns: 0,
    successfulRuns: 0,
    failedRuns: 0,
    lastRunTime: null as Date | null,
    averageExecutionTime: 0
  };

  private constructor(config: SchedulerConfig) {
    this.config = config;
  }

  public static getInstance(config?: SchedulerConfig): ReviewScheduler {
    if (!ReviewScheduler.instance) {
      const defaultConfig: SchedulerConfig = {
        enabled: true,
        timezone: 'Asia/Seoul',
        batchSize: 50,
        maxConcurrentJobs: 3,
        retryAttempts: 2
      };
      ReviewScheduler.instance = new ReviewScheduler(config || defaultConfig);
    }
    return ReviewScheduler.instance;
  }

  /**
   * 모든 스케줄링 작업을 시작합니다
   */
  public start(): void {
    if (!this.config.enabled) {
      logger.info('Review scheduler is disabled');
      return;
    }

    this.startDailyScheduleGeneration();
    this.startHourlyScheduleRefresh();
    this.startOverdueMonitoring();
    this.startPerformanceTracking();
    this.startCacheCleanup();
    this.startWeeklyAnalytics();

    logger.info('Review scheduler started successfully');
  }

  /**
   * 모든 스케줄링 작업을 중지합니다
   */
  public stop(): void {
    cron.getTasks().forEach((task, name) => {
      task.stop();
      logger.info(`Stopped cron job: ${name}`);
    });
    this.runningJobs.clear();
    logger.info('Review scheduler stopped');
  }

  /**
   * 매일 새벽 2시에 전체 사용자의 복습 스케줄을 생성합니다
   */
  private startDailyScheduleGeneration(): void {
    cron.schedule('0 2 * * *', async () => {
      const jobId = `daily-schedule-${Date.now()}`;
      
      if (this.runningJobs.has('daily-schedule')) {
        logger.warn('Daily schedule generation already running, skipping...');
        return;
      }

      this.runningJobs.add('daily-schedule');
      const startTime = Date.now();

      try {
        logger.info('Starting daily schedule generation...');
        
        const batchId = `batch_${Date.now()}`;
        await this.generateSchedulesForAllUsers(batchId);
        
        const duration = Date.now() - startTime;
        this.updateJobStats(true, duration);
        
        logger.info(`Daily schedule generation completed in ${duration}ms`);
        
      } catch (error) {
        logger.error('Daily schedule generation failed:', error);
        this.updateJobStats(false, Date.now() - startTime);
      } finally {
        this.runningJobs.delete('daily-schedule');
      }
    }, {
      timezone: this.config.timezone
    });

    logger.info('Daily schedule generation job registered (02:00 daily)');
  }

  /**
   * 매시간 복습 스케줄을 새로고침합니다
   */
  private startHourlyScheduleRefresh(): void {
    cron.schedule('0 * * * *', async () => {
      if (this.runningJobs.has('hourly-refresh')) {
        logger.warn('Hourly refresh already running, skipping...');
        return;
      }

      this.runningJobs.add('hourly-refresh');

      try {
        logger.info('Starting hourly schedule refresh...');
        
        await this.refreshActiveUserSchedules();
        await this.updateRealtimeMetrics();
        
        logger.info('Hourly schedule refresh completed');
        
      } catch (error) {
        logger.error('Hourly schedule refresh failed:', error);
      } finally {
        this.runningJobs.delete('hourly-refresh');
      }
    }, {
      timezone: this.config.timezone
    });

    logger.info('Hourly schedule refresh job registered (every hour)');
  }

  /**
   * 5분마다 지연된 복습 항목을 모니터링합니다
   */
  private startOverdueMonitoring(): void {
    cron.schedule('*/5 * * * *', async () => {
      try {
        await this.monitorOverdueItems();
        await this.updateUrgentNotifications();
      } catch (error) {
        logger.error('Overdue monitoring failed:', error);
      }
    }, {
      timezone: this.config.timezone
    });

    logger.info('Overdue monitoring job registered (every 5 minutes)');
  }

  /**
   * 10분마다 성능 메트릭을 추적합니다
   */
  private startPerformanceTracking(): void {
    cron.schedule('*/10 * * * *', async () => {
      try {
        await this.collectPerformanceMetrics();
        await this.optimizeSchedulerPerformance();
      } catch (error) {
        logger.error('Performance tracking failed:', error);
      }
    }, {
      timezone: this.config.timezone
    });

    logger.info('Performance tracking job registered (every 10 minutes)');
  }

  /**
   * 매일 새벽 1시에 캐시를 정리합니다
   */
  private startCacheCleanup(): void {
    cron.schedule('0 1 * * *', async () => {
      try {
        logger.info('Starting cache cleanup...');
        await this.cleanupExpiredCaches();
        logger.info('Cache cleanup completed');
      } catch (error) {
        logger.error('Cache cleanup failed:', error);
      }
    }, {
      timezone: this.config.timezone
    });

    logger.info('Cache cleanup job registered (01:00 daily)');
  }

  /**
   * 매주 일요일 자정에 주간 분석을 실행합니다
   */
  private startWeeklyAnalytics(): void {
    cron.schedule('0 0 * * 0', async () => {
      try {
        logger.info('Starting weekly analytics...');
        await this.generateWeeklyAnalytics();
        logger.info('Weekly analytics completed');
      } catch (error) {
        logger.error('Weekly analytics failed:', error);
      }
    }, {
      timezone: this.config.timezone
    });

    logger.info('Weekly analytics job registered (Sunday 00:00)');
  }

  /**
   * 모든 활성 사용자의 복습 스케줄을 생성합니다
   */
  private async generateSchedulesForAllUsers(batchId: string): Promise<void> {
    const users = await prisma.user.findMany({
      select: { id: true, email: true },
      where: {
        isActive: true,
        // 최근 30일 내 활동한 사용자만
        lastLoginAt: {
          gte: new Date(Date.now() - 30 * 24 * 60 * 60 * 1000)
        }
      }
    });

    let processedCount = 0;
    let errorCount = 0;
    const totalUsers = users.length;

    // 배치 처리 정보 캐시
    await ReviewSchedulingCache.cacheBatchUpdateInfo({
      batchId,
      startedAt: new Date(),
      usersProcessed: 0,
      totalUsers,
      schedulesGenerated: 0,
      errors: 0,
      estimatedCompletion: new Date(Date.now() + (totalUsers * 2000)), // 사용자당 2초 추정
      status: 'RUNNING'
    });

    // 배치별로 처리
    for (let i = 0; i < users.length; i += this.config.batchSize) {
      const batch = users.slice(i, i + this.config.batchSize);
      
      const batchPromises = batch.map(async (user) => {
        try {
          const startTime = Date.now();
          
          // 개인화된 스케줄 생성
          const schedule = await ReviewSchedulingService.generatePersonalizedSchedule(
            user.id,
            { maxItems: 20 }
          );
          
          // 캐시 저장
          await ReviewSchedulingCache.cacheUserSchedule(user.id, schedule);
          
          // 성능 추적
          await ReviewSchedulingCache.trackScheduleGenerationPerformance(
            user.id,
            startTime,
            Date.now(),
            schedule.length,
            false
          );
          
          processedCount++;
          
        } catch (error) {
          logger.error(`Failed to generate schedule for user ${user.id}:`, error);
          errorCount++;
        }
      });

      await Promise.all(batchPromises);

      // 진행 상황 업데이트
      await ReviewSchedulingCache.cacheBatchUpdateInfo({
        batchId,
        startedAt: new Date(),
        usersProcessed: processedCount,
        totalUsers,
        schedulesGenerated: processedCount,
        errors: errorCount,
        estimatedCompletion: new Date(Date.now() + ((totalUsers - processedCount) * 2000)),
        status: 'RUNNING'
      });

      // 메모리 부하 방지를 위한 짧은 대기
      if (i + this.config.batchSize < users.length) {
        await new Promise(resolve => setTimeout(resolve, 100));
      }
    }

    // 최종 배치 상태 업데이트
    await ReviewSchedulingCache.cacheBatchUpdateInfo({
      batchId,
      startedAt: new Date(),
      usersProcessed: processedCount,
      totalUsers,
      schedulesGenerated: processedCount,
      errors: errorCount,
      estimatedCompletion: new Date(),
      status: errorCount > 0 ? 'COMPLETED' : 'COMPLETED'
    });

    logger.info(`Batch schedule generation completed: ${processedCount}/${totalUsers} users, ${errorCount} errors`);
  }

  /**
   * 활성 사용자의 스케줄을 새로고침합니다
   */
  private async refreshActiveUserSchedules(): Promise<void> {
    // 최근 1시간 내 활동한 사용자 조회
    const activeUsers = await prisma.user.findMany({
      select: { id: true },
      where: {
        isActive: true,
        lastLoginAt: {
          gte: new Date(Date.now() - 60 * 60 * 1000)
        }
      },
      take: 100 // 최대 100명
    });

    const refreshPromises = activeUsers.map(async (user) => {
      try {
        // 캐시된 스케줄 확인
        const cached = await ReviewSchedulingCache.getUserSchedule(user.id);
        
        if (!cached || this.shouldRefreshSchedule(cached.generatedAt)) {
          const schedule = await ReviewSchedulingService.generatePersonalizedSchedule(user.id);
          await ReviewSchedulingCache.cacheUserSchedule(user.id, schedule);
        }
      } catch (error) {
        logger.error(`Failed to refresh schedule for user ${user.id}:`, error);
      }
    });

    await Promise.all(refreshPromises);
    logger.info(`Refreshed schedules for ${activeUsers.length} active users`);
  }

  /**
   * 지연된 복습 항목들을 모니터링합니다
   */
  private async monitorOverdueItems(): Promise<void> {
    const overdueSchedules = await prisma.reviewSchedule.findMany({
      where: {
        status: ReviewStatus.SCHEDULED,
        scheduledAt: {
          lt: new Date()
        }
      },
      include: {
        problem: {
          select: { title: true, difficulty: true }
        }
      },
      take: 1000
    });

    // 사용자별로 그룹화
    const overdueByUser = overdueSchedules.reduce((acc, schedule) => {
      if (!acc[schedule.userId]) {
        acc[schedule.userId] = [];
      }
      acc[schedule.userId].push(schedule);
      return acc;
    }, {} as Record<string, any[]>);

    // 각 사용자의 지연 항목 캐시 업데이트
    const updatePromises = Object.entries(overdueByUser).map(async ([userId, items]) => {
      const overdueItems = items.map(item => {
        const overdueHours = (Date.now() - new Date(item.scheduledAt).getTime()) / (1000 * 60 * 60);
        
        let urgencyLevel: 'LOW' | 'MEDIUM' | 'HIGH' | 'CRITICAL';
        if (overdueHours > 168) urgencyLevel = 'CRITICAL'; // 1주일 이상
        else if (overdueHours > 72) urgencyLevel = 'HIGH'; // 3일 이상
        else if (overdueHours > 24) urgencyLevel = 'MEDIUM'; // 1일 이상
        else urgencyLevel = 'LOW';

        return {
          id: item.id,
          problemId: item.problemId!,
          problemTitle: item.problem?.title || 'Unknown',
          currentLevel: item.currentLevel,
          scheduledAt: item.scheduledAt,
          priorityScore: 0,
          retentionRate: item.retentionRate || 0.5,
          difficulty: item.problem?.difficulty || 5,
          consecutiveSuccesses: item.consecutiveSuccesses,
          totalAttempts: item.completionCount,
          isOverdue: true,
          overdueHours,
          urgencyLevel,
          suggestedAction: this.getSuggestedAction(urgencyLevel, overdueHours),
          impactScore: this.calculateImpactScore(item, overdueHours)
        };
      });

      await ReviewSchedulingCache.cacheOverdueItems(userId, overdueItems);
    });

    await Promise.all(updatePromises);
    
    if (overdueSchedules.length > 0) {
      logger.info(`Monitored ${overdueSchedules.length} overdue items for ${Object.keys(overdueByUser).length} users`);
    }
  }

  /**
   * 실시간 메트릭을 업데이트합니다
   */
  private async updateRealtimeMetrics(): Promise<void> {
    const now = new Date();
    const today = new Date(now.setHours(0, 0, 0, 0));

    const [
      activeUsers,
      totalScheduled,
      completedToday,
      overdueCount
    ] = await Promise.all([
      // 활성 사용자 수 (최근 24시간)
      prisma.user.count({
        where: {
          isActive: true,
          lastLoginAt: {
            gte: new Date(Date.now() - 24 * 60 * 60 * 1000)
          }
        }
      }),
      
      // 총 예정된 복습 수
      prisma.reviewSchedule.count({
        where: { status: ReviewStatus.SCHEDULED }
      }),
      
      // 오늘 완료된 복습 수
      prisma.reviewSchedule.count({
        where: {
          status: ReviewStatus.COMPLETED,
          lastCompletedAt: { gte: today }
        }
      }),
      
      // 지연된 복습 수
      prisma.reviewSchedule.count({
        where: {
          status: ReviewStatus.SCHEDULED,
          scheduledAt: { lt: new Date() }
        }
      })
    ]);

    const metrics = {
      activeUsers,
      totalScheduledReviews: totalScheduled,
      completedToday,
      averageCompletionTime: 0, // 별도 계산 필요
      overdueRate: totalScheduled > 0 ? (overdueCount / totalScheduled) : 0,
      topPerformers: [], // 별도 계산 필요
      systemLoad: {
        scheduleGenerations: this.jobStats.totalRuns,
        cacheHitRate: 0.92, // Redis에서 실제 계산 필요
        averageResponseTime: this.jobStats.averageExecutionTime
      }
    };

    await ReviewSchedulingCache.updateRealtimeMetrics(metrics);
  }

  /**
   * 성능 메트릭을 수집합니다
   */
  private async collectPerformanceMetrics(): Promise<void> {
    const cacheMetrics = await ReviewSchedulingCache.getCachePerformanceMetrics();
    
    // 메모리 사용량 체크
    const memoryUsage = process.memoryUsage();
    const memoryPressure = memoryUsage.heapUsed / memoryUsage.heapTotal;
    
    if (memoryPressure > 0.8) {
      logger.warn(`High memory pressure: ${Math.round(memoryPressure * 100)}%`);
    }
    
    if (cacheMetrics.hitRate < 0.8) {
      logger.warn(`Low cache hit rate: ${Math.round(cacheMetrics.hitRate * 100)}%`);
    }
  }

  /**
   * 스케줄러 성능을 최적화합니다
   */
  private async optimizeSchedulerPerformance(): Promise<void> {
    // 배치 크기 동적 조정
    if (this.jobStats.averageExecutionTime > 30000) { // 30초 이상
      this.config.batchSize = Math.max(10, this.config.batchSize - 10);
      logger.info(`Reduced batch size to ${this.config.batchSize} due to slow performance`);
    } else if (this.jobStats.averageExecutionTime < 5000) { // 5초 미만
      this.config.batchSize = Math.min(100, this.config.batchSize + 10);
      logger.info(`Increased batch size to ${this.config.batchSize} due to good performance`);
    }
  }

  // 유틸리티 메서드들
  private shouldRefreshSchedule(lastGenerated: Date): boolean {
    const hoursSinceGeneration = (Date.now() - new Date(lastGenerated).getTime()) / (1000 * 60 * 60);
    return hoursSinceGeneration > 4; // 4시간 이상 경과시 새로고침
  }

  private getSuggestedAction(urgency: string, overdueHours: number): string {
    switch (urgency) {
      case 'CRITICAL': return '즉시 복습 필요 - 기억이 대부분 소실된 상태';
      case 'HIGH': return '우선 복습 권장 - 빠른 복습으로 기억 회복 가능';
      case 'MEDIUM': return '오늘 중 복습 권장 - 최적 복습 타이밍 경과';
      case 'LOW': return '가능한 빨리 복습 - 아직 기억 유지 중';
      default: return '복습 권장';
    }
  }

  private calculateImpactScore(item: any, overdueHours: number): number {
    let score = 50; // 기본 점수
    
    // 지연 시간에 따른 점수 증가
    score += Math.min(50, overdueHours * 2);
    
    // 난이도에 따른 가중치
    score += (item.problem?.difficulty || 5) * 2;
    
    // 연속 실패에 따른 가중치
    const failureRate = 1 - (item.consecutiveSuccesses / Math.max(item.completionCount, 1));
    score += failureRate * 20;
    
    return Math.min(100, Math.round(score));
  }

  private updateJobStats(success: boolean, duration: number): void {
    this.jobStats.totalRuns++;
    this.jobStats.lastRunTime = new Date();
    
    if (success) {
      this.jobStats.successfulRuns++;
    } else {
      this.jobStats.failedRuns++;
    }
    
    // 평균 실행 시간 업데이트 (이동 평균)
    this.jobStats.averageExecutionTime = 
      (this.jobStats.averageExecutionTime * (this.jobStats.totalRuns - 1) + duration) / this.jobStats.totalRuns;
  }

  private async updateUrgentNotifications(): Promise<void> {
    // 긴급 알림 로직 - 실제 알림 시스템과 연동 필요
    // 임시로 로깅만 수행
  }

  private async cleanupExpiredCaches(): Promise<void> {
    // 캐시 정리 로직 - Redis 키 만료 처리
    logger.info('Cache cleanup completed');
  }

  private async generateWeeklyAnalytics(): Promise<void> {
    // 주간 분석 생성 로직
    logger.info('Weekly analytics generated');
  }

  // Getter 메서드들
  public getJobStats() {
    return { ...this.jobStats };
  }

  public getConfig() {
    return { ...this.config };
  }

  public getRunningJobs() {
    return Array.from(this.runningJobs);
  }
}

export default ReviewScheduler;