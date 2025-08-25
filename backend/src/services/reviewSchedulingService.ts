import { PrismaClient } from "@prisma/client"
import { ForgettingCurveLevel, ReviewStatus, LearningStatus } from '../types/common.js';
import { logger } from '../config/logger.js';
import ForgettingCurveAlgorithm, { FORGETTING_CURVE_CONSTANTS } from './forgettingCurveService.js';

const prisma = new PrismaClient();

export interface ReviewItem {
  id: string;
  problemId: string;
  problemTitle: string;
  currentLevel: ForgettingCurveLevel;
  scheduledAt: Date;
  priorityScore: number;
  retentionRate: number;
  categoryName?: string;
  difficulty: number;
  consecutiveSuccesses: number;
  totalAttempts: number;
  isOverdue: boolean;
  overdueHours?: number;
}

export interface ReviewScheduleInput {
  userId: string;
  problemId: string;
  isSuccess: boolean;
  responseTime?: number;
  difficulty?: number;
  sessionId?: string;
}

export interface SchedulingOptions {
  maxItems?: number;
  priorityWeights?: {
    retention: number;      // 기억 유지율 가중치
    difficulty: number;     // 난이도 가중치
    overdue: number;        // 지연 가중치
    frequency: number;      // 빈도 가중치
    recency: number;        // 최근성 가중치
  };
  timeWindow?: {
    startHour: number;      // 스케줄링 시작 시간
    endHour: number;        // 스케줄링 종료 시간
  };
}

/**
 * 복습 스케줄링 서비스
 * 망각곡선 알고리즘과 개인화된 우선순위를 결합한 지능형 복습 스케줄 관리
 */
export class ReviewSchedulingService {
  
  // 기본 우선순위 가중치
  private static readonly DEFAULT_PRIORITY_WEIGHTS = {
    retention: 0.35,    // 기억 유지율 (35%)
    difficulty: 0.25,   // 난이도 (25%)
    overdue: 0.20,      // 지연 상태 (20%)
    frequency: 0.10,    // 복습 빈도 (10%)
    recency: 0.10       // 최근성 (10%)
  };

  private static readonly DEFAULT_TIME_WINDOW = {
    startHour: 9,   // 오전 9시
    endHour: 22     // 오후 10시
  };

  /**
   * 사용자의 개인화된 복습 스케줄을 생성합니다
   */
  static async generatePersonalizedSchedule(
    userId: string, 
    options: SchedulingOptions = {}
  ): Promise<ReviewItem[]> {
    
    const {
      maxItems = 20,
      priorityWeights = this.DEFAULT_PRIORITY_WEIGHTS,
      timeWindow = this.DEFAULT_TIME_WINDOW
    } = options;

    try {
      // 1. 예정된 복습 항목들 조회
      const scheduledReviews = await this.getScheduledReviews(userId);
      
      // 2. 각 항목의 우선순위 점수 계산
      const prioritizedItems = await Promise.all(
        scheduledReviews.map(item => this.calculatePriorityScore(item, priorityWeights))
      );

      // 3. 우선순위 순으로 정렬
      const sortedItems = prioritizedItems.sort((a, b) => b.priorityScore - a.priorityScore);

      // 4. 시간 창 내에서 스케줄 조정
      const adjustedSchedule = this.adjustScheduleWithinTimeWindow(
        sortedItems.slice(0, maxItems),
        timeWindow
      );

      logger.info(`Generated personalized schedule for user ${userId}: ${adjustedSchedule.length} items`);
      
      return adjustedSchedule;

    } catch (error) {
      logger.error('Error generating personalized schedule:', error);
      throw error;
    }
  }

  /**
   * 새로운 복습 스케줄을 추가하거나 기존 스케줄을 업데이트합니다
   */
  static async scheduleReview(input: ReviewScheduleInput): Promise<void> {
    const { userId, problemId, isSuccess, responseTime, difficulty, sessionId } = input;

    try {
      // 1. 기존 스케줄 조회
      const existingSchedule = await prisma.reviewSchedule.findFirst({
        where: {
          userId,
          problemId,
          status: { in: [ReviewStatus.SCHEDULED, ReviewStatus.IN_PROGRESS] }
        }
      });

      // 2. 망각곡선 계산
      const currentLevel = existingSchedule?.currentLevel || ForgettingCurveLevel.LEVEL_1;
      
      // 사용자 프로필 조회 (임시)
      const userProfile = {
        memoryRetentionFactor: 1.0,
        difficultyAdjustment: 1.0,
        successRate: 0.7,
        totalReviews: existingSchedule?.completionCount || 0
      };
      
      const calculation = ForgettingCurveAlgorithm.calculateNextReview(
        currentLevel,
        {
          isSuccess,
          responseTime: responseTime || 30,
          confidenceLevel: 3, // 기본값
          difficultyScore: difficulty || 5
        },
        userProfile,
        new Date()
      );

      if (existingSchedule) {
        // 3a. 기존 스케줄 업데이트
        await prisma.reviewSchedule.update({
          where: { id: existingSchedule.id },
          data: {
            currentLevel: calculation.nextLevel,
            scheduledAt: calculation.nextScheduleTime,
            nextScheduledAt: calculation.nextScheduleTime,
            retentionRate: calculation.adjustedRetentionRate,
            completionCount: { increment: 1 },
            consecutiveSuccesses: isSuccess ? 
              { increment: 1 } : 
              0,
            lastCompletedAt: new Date(),
            status: ReviewStatus.SCHEDULED,
            updatedAt: new Date()
          }
        });
      } else {
        // 3b. 새로운 스케줄 생성
        await prisma.reviewSchedule.create({
          data: {
            userId,
            problemId,
            currentLevel: calculation.nextLevel,
            scheduledAt: calculation.nextScheduleTime,
            nextScheduledAt: calculation.nextScheduleTime,
            retentionRate: calculation.adjustedRetentionRate,
            completionCount: 1,
            consecutiveSuccesses: isSuccess ? 1 : 0,
            lastCompletedAt: new Date(),
            status: ReviewStatus.SCHEDULED,
            difficultyScore: difficulty,
            profileId: await this.getOrCreateProfileId(userId)
          }
        });
      }

      // 4. 학습 진행 상황 업데이트
      await this.updateLearningProgress(userId, problemId, isSuccess);

      logger.info(`Review scheduled: User ${userId}, Problem ${problemId}, Success: ${isSuccess}, Next Level: ${calculation.nextLevel}`);

    } catch (error) {
      logger.error('Error scheduling review:', error);
      throw error;
    }
  }

  /**
   * 예정된 복습 항목들을 조회합니다
   */
  private static async getScheduledReviews(userId: string): Promise<any[]> {
    return await prisma.reviewSchedule.findMany({
      where: {
        userId,
        status: ReviewStatus.SCHEDULED,
        scheduledAt: {
          lte: new Date(Date.now() + 24 * 60 * 60 * 1000) // 향후 24시간 내
        }
      },
      include: {
        problem: {
          select: {
            id: true,
            title: true,
            difficulty: true,
            category: {
              select: { name: true }
            }
          }
        }
      },
      orderBy: { scheduledAt: 'asc' }
    });
  }

  /**
   * 복습 항목의 우선순위 점수를 계산합니다
   */
  private static async calculatePriorityScore(
    item: any, 
    weights: typeof this.DEFAULT_PRIORITY_WEIGHTS
  ): Promise<ReviewItem> {
    
    const now = new Date();
    const scheduledTime = new Date(item.scheduledAt);
    const isOverdue = now > scheduledTime;
    const overdueHours = isOverdue ? 
      (now.getTime() - scheduledTime.getTime()) / (1000 * 60 * 60) : 
      0;

    // 1. 기억 유지율 점수 (낮을수록 우선순위 높음)
    const retentionScore = (1 - item.retentionRate) * 100;

    // 2. 난이도 점수 (어려운 문제일수록 우선순위 높음)
    const difficultyScore = (item.problem?.difficulty || 5) * 10;

    // 3. 지연 점수 (오버듀일수록 높은 점수)
    const overdueScore = isOverdue ? 
      Math.min(100, overdueHours * 10) :   // 시간당 10점, 최대 100점
      Math.max(0, 50 - (scheduledTime.getTime() - now.getTime()) / (1000 * 60 * 60)); // 예정 시간이 가까울수록 높은 점수

    // 4. 빈도 점수 (자주 틀리는 문제일수록 우선순위 높음)
    const successRate = item.consecutiveSuccesses / Math.max(item.completionCount, 1);
    const frequencyScore = (1 - successRate) * 100;

    // 5. 최근성 점수 (최근에 학습한 항목일수록 낮은 우선순위)
    const daysSinceLastReview = item.lastCompletedAt ? 
      (now.getTime() - new Date(item.lastCompletedAt).getTime()) / (1000 * 60 * 60 * 24) : 
      7; // 기본값 7일
    const recencyScore = Math.min(100, daysSinceLastReview * 10);

    // 가중 평균으로 최종 우선순위 계산
    const priorityScore = 
      retentionScore * weights.retention +
      difficultyScore * weights.difficulty +
      overdueScore * weights.overdue +
      frequencyScore * weights.frequency +
      recencyScore * weights.recency;

    return {
      id: item.id,
      problemId: item.problemId,
      problemTitle: item.problem?.title || 'Unknown',
      currentLevel: item.currentLevel,
      scheduledAt: scheduledTime,
      priorityScore: Math.round(priorityScore * 100) / 100,
      retentionRate: item.retentionRate,
      categoryName: item.problem?.category?.name,
      difficulty: item.problem?.difficulty || 5,
      consecutiveSuccesses: item.consecutiveSuccesses,
      totalAttempts: item.completionCount,
      isOverdue,
      overdueHours: isOverdue ? Math.round(overdueHours * 100) / 100 : undefined
    };
  }

  /**
   * 시간 창 내에서 스케줄을 조정합니다
   */
  private static adjustScheduleWithinTimeWindow(
    items: ReviewItem[],
    timeWindow: { startHour: number; endHour: number }
  ): ReviewItem[] {
    
    const { startHour, endHour } = timeWindow;
    const now = new Date();
    
    return items.map((item, index) => {
      // 오늘 날짜의 시작 시간으로 설정
      const today = new Date(now);
      today.setHours(startHour, 0, 0, 0);
      
      // 15분 간격으로 스케줄 분산
      const scheduledTime = new Date(today.getTime() + (index * 15 * 60 * 1000));
      
      // 종료 시간을 넘으면 다음날로 연기
      if (scheduledTime.getHours() >= endHour) {
        scheduledTime.setDate(scheduledTime.getDate() + 1);
        scheduledTime.setHours(startHour, 0, 0, 0);
      }
      
      // 이미 지나간 시간이면 현재 시간 이후로 조정
      if (scheduledTime < now) {
        const adjustedTime = new Date(now.getTime() + (index * 5 * 60 * 1000)); // 5분 간격
        if (adjustedTime.getHours() < endHour) {
          scheduledTime.setTime(adjustedTime.getTime());
        }
      }

      return {
        ...item,
        scheduledAt: scheduledTime
      };
    });
  }

  /**
   * 망각곡선 프로필 ID를 조회하거나 생성합니다
   */
  private static async getOrCreateProfileId(userId: string): Promise<string> {
    let profile = await prisma.forgettingCurveProfile.findUnique({
      where: { userId }
    });

    if (!profile) {
      profile = await prisma.forgettingCurveProfile.create({
        data: {
          userId,
          baseRetentionRate: 0.5,
          learningEfficiency: 1.0,
          optimalInterval: 1440,
          difficultyAdjustment: 1.0,
          personalizedFactors: JSON.stringify({})
        }
      });
    }

    return profile.id;
  }

  /**
   * 학습 진행 상황을 업데이트합니다
   */
  private static async updateLearningProgress(
    userId: string, 
    problemId: string, 
    isSuccess: boolean
  ): Promise<void> {
    
    const existingProgress = await prisma.learningProgress.findUnique({
      where: {
        userId_problemId: {
          userId,
          problemId
        }
      }
    });

    if (existingProgress) {
      await prisma.learningProgress.update({
        where: { id: existingProgress.id },
        data: {
          status: isSuccess ? LearningStatus.MASTERED : LearningStatus.STRUGGLING,
          totalAttempts: { increment: 1 },
          correctAttempts: isSuccess ? { increment: 1 } : undefined,
          lastAttemptAt: new Date(),
          updatedAt: new Date()
        }
      });
    } else {
      await prisma.learningProgress.create({
        data: {
          userId,
          problemId,
          status: isSuccess ? LearningStatus.IN_PROGRESS : LearningStatus.STRUGGLING,
          totalAttempts: 1,
          correctAttempts: isSuccess ? 1 : 0,
          lastAttemptAt: new Date(),
          firstAttemptAt: new Date()
        }
      });
    }
  }

  /**
   * 특정 시간 범위의 복습 스케줄을 조회합니다
   */
  static async getScheduleByTimeRange(
    userId: string,
    startTime: Date,
    endTime: Date
  ): Promise<ReviewItem[]> {
    
    const schedules = await prisma.reviewSchedule.findMany({
      where: {
        userId,
        status: ReviewStatus.SCHEDULED,
        scheduledAt: {
          gte: startTime,
          lte: endTime
        }
      },
      include: {
        problem: {
          select: {
            id: true,
            title: true,
            difficulty: true,
            category: { select: { name: true } }
          }
        }
      },
      orderBy: { scheduledAt: 'asc' }
    });

    return schedules.map(schedule => ({
      id: schedule.id,
      problemId: schedule.problemId!,
      problemTitle: schedule.problem?.title || 'Unknown',
      currentLevel: schedule.currentLevel,
      scheduledAt: schedule.scheduledAt,
      priorityScore: 0, // 시간 범위 조회에서는 우선순위 계산 생략
      retentionRate: schedule.retentionRate || 0.5,
      categoryName: schedule.problem?.category?.name,
      difficulty: schedule.problem?.difficulty || 5,
      consecutiveSuccesses: schedule.consecutiveSuccesses,
      totalAttempts: schedule.completionCount,
      isOverdue: new Date() > schedule.scheduledAt,
      overdueHours: new Date() > schedule.scheduledAt ? 
        (new Date().getTime() - schedule.scheduledAt.getTime()) / (1000 * 60 * 60) : 
        undefined
    }));
  }

  /**
   * 복습 완료 처리
   */
  static async completeReview(
    scheduleId: string,
    isSuccess: boolean,
    responseTime?: number
  ): Promise<void> {
    
    const schedule = await prisma.reviewSchedule.findUnique({
      where: { id: scheduleId }
    });

    if (!schedule) {
      throw new Error('Review schedule not found');
    }

    // 다음 복습 스케줄링
    await this.scheduleReview({
      userId: schedule.userId,
      problemId: schedule.problemId!,
      isSuccess,
      responseTime
    });

    // 현재 스케줄 완료 처리
    await prisma.reviewSchedule.update({
      where: { id: scheduleId },
      data: {
        status: ReviewStatus.COMPLETED,
        lastCompletedAt: new Date(),
        updatedAt: new Date()
      }
    });

    logger.info(`Review completed: Schedule ${scheduleId}, Success: ${isSuccess}`);
  }

  /**
   * 복습 스케줄 통계 조회
   */
  static async getScheduleStats(userId: string): Promise<{
    totalScheduled: number;
    overdueCount: number;
    todayCount: number;
    weekCount: number;
    averagePriorityScore: number;
    byLevel: Record<ForgettingCurveLevel, number>;
  }> {
    
    const now = new Date();
    const todayEnd = new Date(now);
    todayEnd.setHours(23, 59, 59, 999);
    
    const weekEnd = new Date(now);
    weekEnd.setDate(weekEnd.getDate() + 7);

    const schedules = await prisma.reviewSchedule.findMany({
      where: {
        userId,
        status: ReviewStatus.SCHEDULED
      }
    });

    const totalScheduled = schedules.length;
    const overdueCount = schedules.filter(s => s.scheduledAt < now).length;
    const todayCount = schedules.filter(s => 
      s.scheduledAt >= now && s.scheduledAt <= todayEnd
    ).length;
    const weekCount = schedules.filter(s => 
      s.scheduledAt >= now && s.scheduledAt <= weekEnd
    ).length;

    const byLevel = schedules.reduce((acc, schedule) => {
      acc[schedule.currentLevel] = (acc[schedule.currentLevel] || 0) + 1;
      return acc;
    }, {} as Record<ForgettingCurveLevel, number>);

    // 우선순위 점수는 실시간 계산 (비용 고려하여 샘플링)
    const sampleSchedules = schedules.slice(0, Math.min(10, schedules.length));
    const priorityScores = await Promise.all(
      sampleSchedules.map(s => this.calculatePriorityScore(s, this.DEFAULT_PRIORITY_WEIGHTS))
    );
    const averagePriorityScore = priorityScores.length > 0 ?
      priorityScores.reduce((sum, item) => sum + item.priorityScore, 0) / priorityScores.length :
      0;

    return {
      totalScheduled,
      overdueCount,
      todayCount,
      weekCount,
      averagePriorityScore: Math.round(averagePriorityScore * 100) / 100,
      byLevel
    };
  }
}

export default ReviewSchedulingService;