import { PrismaClient } from '@prisma/client';
import redisClient from '../config/redis.js';
import cron from 'node-cron';
import { socketUtils } from '../config/socket.js';
import progressService from './progressService.js';
import learningPatternService from './learningPatternService.js';

const prisma = new PrismaClient();

export interface NotificationData {
  id: string;
  userId: string;
  type: NotificationType;
  title: string;
  message: string;
  data?: any;
  isRead: boolean;
  priority: NotificationPriority;
  scheduledAt?: Date;
  sentAt?: Date;
  createdAt: Date;
}

export enum NotificationType {
  REVIEW_REMINDER = 'REVIEW_REMINDER',
  STUDY_STREAK = 'STUDY_STREAK',
  ACHIEVEMENT = 'ACHIEVEMENT',
  PROGRESS_UPDATE = 'PROGRESS_UPDATE',
  OVERDUE_REVIEW = 'OVERDUE_REVIEW',
  DAILY_GOAL = 'DAILY_GOAL',
  WEEKLY_SUMMARY = 'WEEKLY_SUMMARY',
  SYSTEM_ALERT = 'SYSTEM_ALERT',
  SMART_REMINDER = 'SMART_REMINDER',
  MOTIVATION_BOOST = 'MOTIVATION_BOOST',
  OPTIMAL_TIME_REMINDER = 'OPTIMAL_TIME_REMINDER',
  DIFFICULTY_ADJUSTMENT = 'DIFFICULTY_ADJUSTMENT',
  MASTERY_MILESTONE = 'MASTERY_MILESTONE'
}

export enum NotificationPriority {
  LOW = 'LOW',
  MEDIUM = 'MEDIUM',
  HIGH = 'HIGH',
  URGENT = 'URGENT'
}

export interface UserNotificationSettings {
  userId: string;
  enablePushNotifications: boolean;
  enableEmailNotifications: boolean;
  enableInAppNotifications: boolean;
  reviewReminders: boolean;
  studyStreakReminders: boolean;
  achievementNotifications: boolean;
  progressUpdates: boolean;
  dailyGoalReminders: boolean;
  weeklyDigest: boolean;
  smartReminders: boolean;
  motivationBoosts: boolean;
  optimalTimeReminders: boolean;
  difficultyAdjustmentAlerts: boolean;
  masteryMilestones: boolean;
  quietHours: {
    enabled: boolean;
    startTime: string; // HH:MM
    endTime: string; // HH:MM
  };
  timezone: string;
  preferredStudyTime?: string; // HH:MM
  reminderFrequency: 'low' | 'medium' | 'high';
}

// 스마트 알림을 위한 사용자 학습 패턴 데이터
export interface UserLearningPattern {
  userId: string;
  optimalStudyHours: string[]; // ['09:00', '14:00', '20:00']
  averageSessionDuration: number; // 분
  preferredDifficulty: number; // 1-10
  motivationLevel: number; // 1-10
  lastActiveTime: Date;
  consecutiveDaysActive: number;
  currentStreak: number;
  bestPerformanceTime: string; // HH:MM
  weeklyGoal: number;
  dailyGoal: number;
}

// 동기부여 메시지 템플릿
export interface MotivationMessage {
  type: 'encouragement' | 'challenge' | 'celebration' | 'reminder';
  templates: string[];
  conditions: {
    streakMin?: number;
    streakMax?: number;
    accuracyMin?: number;
    accuracyMax?: number;
    progressMin?: number;
    progressMax?: number;
  };
}

class NotificationService {
  private readonly CACHE_PREFIX = 'notifications:';
  private readonly SETTINGS_CACHE_TTL = 3600; // 1 hour
  private readonly motivationTemplates: MotivationMessage[] = [
    {
      type: 'encouragement',
      templates: [
        '💪 좋은 습관이 만들어지고 있어요! 오늘도 한 걸음 더 나아가볼까요?',
        '🌟 꾸준함이 실력이 됩니다. 오늘의 학습으로 더 발전된 자신을 만나보세요!',
        '🎯 작은 성취들이 모여 큰 변화를 만듭니다. 계속 진행해보세요!',
        '📚 지금까지 해온 노력이 빛을 발할 때가 왔어요. 화이팅!'
      ],
      conditions: { streakMin: 3, streakMax: 10, progressMin: 30, progressMax: 70 }
    },
    {
      type: 'challenge',
      templates: [
        '🔥 도전해볼 시간이에요! 오늘은 어제보다 한 문제 더 풀어보세요.',
        '⚡ 실력 향상의 비결은 꾸준한 도전입니다. 새로운 목표를 세워보세요!',
        '🚀 컴포트 존을 벗어날 준비가 되셨나요? 조금 더 어려운 문제에 도전해보세요!',
        '🎖️ 지금까지의 성과가 대단해요! 더 높은 목표를 향해 나아가볼까요?'
      ],
      conditions: { streakMin: 7, accuracyMin: 80, progressMin: 60 }
    },
    {
      type: 'celebration',
      templates: [
        '🎉 축하합니다! 목표를 달성하셨네요. 정말 대단해요!',
        '🏆 완벽한 성취입니다! 지금까지의 노력이 결실을 맺었어요.',
        '✨ 놀라운 발전이에요! 계속해서 이런 멋진 성과를 만들어가세요!',
        '🌈 목표 달성을 축하드려요! 다음 도전도 기대됩니다.'
      ],
      conditions: { accuracyMin: 90, progressMin: 80 }
    },
    {
      type: 'reminder',
      templates: [
        '⏰ 학습할 시간이에요! 오늘도 새로운 지식을 습득해보세요.',
        '📖 기억은 반복으로 강화됩니다. 복습할 준비가 되셨나요?',
        '🧠 두뇌 운동 시간입니다! 짧은 시간이라도 집중해서 학습해보세요.',
        '💡 새로운 하루, 새로운 학습! 오늘의 목표를 달성해보세요.'
      ],
      conditions: {}
    }
  ];

  constructor() {
    // 스케줄링된 작업들 시작
    this.startScheduledTasks();
  }

  /**
   * 사용자별 알림 생성
   */
  async createNotification(notification: Omit<NotificationData, 'id' | 'createdAt' | 'isRead' | 'sentAt'>): Promise<NotificationData | null> {
    // 사용자 알림 설정 확인
    const settings = await this.getUserSettings(notification.userId);
    
    if (!this.shouldSendNotification(notification.type, settings)) {
      console.log(`Notification skipped for user ${notification.userId}: ${notification.type}`);
      return null;
    }

    // 조용한 시간 체크
    if (this.isQuietHours(settings)) {
      // 조용한 시간이면 나중에 전송하도록 스케줄링
      const nextSendTime = this.getNextAvailableTime(settings);
      notification.scheduledAt = nextSendTime;
    }

    const createdNotification = {
      id: `notif_${Date.now()}_${Math.random().toString(36).substr(2, 9)}`,
      ...notification,
      isRead: false,
      createdAt: new Date(),
      sentAt: notification.scheduledAt ? undefined : new Date()
    };

    // Redis에 저장 (빠른 조회용)
    await this.cacheNotification(createdNotification);

    // 데이터베이스에는 중요한 알림만 저장
    if (this.shouldPersistNotification(notification.type)) {
      await this.persistNotification(createdNotification);
    }

    // 즉시 전송 (스케줄링되지 않은 경우)
    if (!notification.scheduledAt) {
      await this.sendNotification(createdNotification);
    }

    return createdNotification;
  }

  /**
   * 복습 알림 생성
   */
  async createReviewReminder(userId: string, overdueCount: number): Promise<void> {
    const title = overdueCount > 0 ? '⏰ 복습할 카드가 있어요!' : '📚 오늘의 복습 시간';
    const message = overdueCount > 0 
      ? `${overdueCount}개의 복습 카드가 대기 중입니다. 지금 복습해보세요!`
      : '새로운 복습 카드가 준비되었습니다. 꾸준한 학습으로 기억을 강화하세요.';

    await this.createNotification({
      userId,
      type: NotificationType.REVIEW_REMINDER,
      title,
      message,
      priority: overdueCount > 5 ? NotificationPriority.HIGH : NotificationPriority.MEDIUM,
      data: { overdueCount }
    });
  }

  /**
   * 연속 학습 알림
   */
  async createStudyStreakNotification(userId: string, streakDays: number, isBreakingStreak: boolean = false): Promise<void> {
    if (isBreakingStreak) {
      await this.createNotification({
        userId,
        type: NotificationType.STUDY_STREAK,
        title: '🔥 연속 기록을 지켜주세요!',
        message: `${streakDays}일 연속 학습 기록이 끊어질 위험이 있어요. 오늘도 조금이라도 학습해보세요.`,
        priority: NotificationPriority.HIGH,
        data: { streakDays, isBreakingStreak: true }
      });
    } else {
      const milestones = [7, 14, 30, 60, 100, 365];
      if (milestones.includes(streakDays)) {
        await this.createNotification({
          userId,
          type: NotificationType.STUDY_STREAK,
          title: `🎉 ${streakDays}일 연속 학습 달성!`,
          message: `대단해요! ${streakDays}일 연속 학습을 달성했습니다. 계속해서 좋은 습관을 유지해보세요.`,
          priority: NotificationPriority.HIGH,
          data: { streakDays, milestone: true }
        });
      }
    }
  }

  /**
   * 성취 알림
   */
  async createAchievementNotification(userId: string, achievement: {
    title: string;
    description: string;
    badge?: string;
  }): Promise<void> {
    await this.createNotification({
      userId,
      type: NotificationType.ACHIEVEMENT,
      title: `🏆 ${achievement.title} 달성!`,
      message: achievement.description,
      priority: NotificationPriority.MEDIUM,
      data: achievement
    });
  }

  /**
   * 일일 목표 알림
   */
  async createDailyGoalReminder(userId: string, progress: number, target: number): Promise<void> {
    const percentage = Math.round((progress / target) * 100);
    
    if (percentage < 50) {
      await this.createNotification({
        userId,
        type: NotificationType.DAILY_GOAL,
        title: '🎯 오늘의 목표를 달성해보세요',
        message: `오늘 목표까지 ${target - progress}문제 남았어요. 조금만 더 힘내세요!`,
        priority: NotificationPriority.MEDIUM,
        data: { progress, target, percentage }
      });
    } else if (percentage >= 100) {
      await this.createNotification({
        userId,
        type: NotificationType.DAILY_GOAL,
        title: '🎉 오늘의 목표 달성!',
        message: `축하합니다! 오늘 목표 ${target}문제를 모두 완료했습니다.`,
        priority: NotificationPriority.HIGH,
        data: { progress, target, percentage, achieved: true }
      });
    }
  }

  /**
   * 주간 요약 알림
   */
  async createWeeklySummary(userId: string, weeklyStats: {
    problemsCompleted: number;
    studyTime: number;
    accuracyRate: number;
    streakDays: number;
    topCategories: string[];
  }): Promise<void> {
    const { problemsCompleted, studyTime, accuracyRate, streakDays, topCategories } = weeklyStats;
    const studyHours = Math.round(studyTime / 60);

    await this.createNotification({
      userId,
      type: NotificationType.WEEKLY_SUMMARY,
      title: '📊 이번 주 학습 요약',
      message: `이번 주에 ${problemsCompleted}문제 완료, ${studyHours}시간 학습, ${Math.round(accuracyRate)}% 정답률을 기록했습니다.`,
      priority: NotificationPriority.LOW,
      data: weeklyStats
    });
  }

  /**
   * 사용자 알림 목록 조회
   */
  async getUserNotifications(userId: string, limit: number = 20, offset: number = 0): Promise<NotificationData[]> {
    const cacheKey = `${this.CACHE_PREFIX}user:${userId}:${offset}:${limit}`;
    
    try {
      const cached = await redisClient.get(cacheKey);
      if (cached) {
        return JSON.parse(cached);
      }
    } catch (error) {
      console.warn('Redis cache error:', error);
    }

    // Redis에서 최근 알림들 조회
    const notifications = await this.getUserNotificationsFromCache(userId, limit, offset);
    
    // 캐시에 저장
    try {
      await redisClient.setEx(cacheKey, 300, JSON.stringify(notifications)); // 5분 캐시
    } catch (error) {
      console.warn('Redis cache save error:', error);
    }

    return notifications;
  }

  /**
   * 알림 읽음 처리
   */
  async markAsRead(userId: string, notificationIds: string[]): Promise<void> {
    for (const notificationId of notificationIds) {
      const cacheKey = `${this.CACHE_PREFIX}notif:${notificationId}`;
      
      try {
        const cached = await redisClient.get(cacheKey);
        if (cached) {
          const notification = JSON.parse(cached);
          if (notification.userId === userId) {
            notification.isRead = true;
            await redisClient.setEx(cacheKey, 86400, JSON.stringify(notification)); // 24시간
          }
        }
      } catch (error) {
        console.warn('Redis operation error:', error);
      }
    }

    // 캐시 무효화
    await this.invalidateUserNotificationCache(userId);
  }

  /**
   * 사용자 알림 설정 조회/생성
   */
  async getUserSettings(userId: string): Promise<UserNotificationSettings> {
    const cacheKey = `${this.CACHE_PREFIX}settings:${userId}`;
    
    try {
      const cached = await redisClient.get(cacheKey);
      if (cached) {
        return JSON.parse(cached);
      }
    } catch (error) {
      console.warn('Redis cache error:', error);
    }

    // 기본 설정 반환 (실제로는 DB에서 조회)
    const defaultSettings: UserNotificationSettings = {
      userId,
      enablePushNotifications: true,
      enableEmailNotifications: false,
      enableInAppNotifications: true,
      reviewReminders: true,
      studyStreakReminders: true,
      achievementNotifications: true,
      progressUpdates: true,
      dailyGoalReminders: true,
      weeklyDigest: true,
      smartReminders: true,
      motivationBoosts: true,
      optimalTimeReminders: true,
      difficultyAdjustmentAlerts: true,
      masteryMilestones: true,
      quietHours: {
        enabled: true,
        startTime: '22:00',
        endTime: '08:00'
      },
      timezone: 'Asia/Seoul',
      preferredStudyTime: '14:00',
      reminderFrequency: 'medium'
    };

    // 캐시에 저장
    try {
      await redisClient.setEx(cacheKey, this.SETTINGS_CACHE_TTL, JSON.stringify(defaultSettings));
    } catch (error) {
      console.warn('Redis cache save error:', error);
    }

    return defaultSettings;
  }

  /**
   * 스케줄된 작업들 시작
   */
  private startScheduledTasks(): void {
    // 매일 오전 9시에 복습 알림 전송
    cron.schedule('0 9 * * *', async () => {
      await this.sendDailyReviewReminders();
    });

    // 매일 오후 8시에 일일 목표 체크
    cron.schedule('0 20 * * *', async () => {
      await this.checkDailyGoals();
    });

    // 매주 월요일 오전 10시에 주간 요약 전송
    cron.schedule('0 10 * * 1', async () => {
      await this.sendWeeklySummaries();
    });

    // 매시간마다 연속 학습 체크
    cron.schedule('0 * * * *', async () => {
      await this.checkStudyStreaks();
    });

    // 5분마다 스케줄된 알림 전송
    cron.schedule('*/5 * * * *', async () => {
      await this.sendScheduledNotifications();
    });

    // 30분마다 최적 시간 알림 체크
    cron.schedule('*/30 * * * *', async () => {
      await this.checkOptimalTimeReminders();
    });

    // 2시간마다 스마트 복습 알림 체크
    cron.schedule('0 */2 * * *', async () => {
      await this.sendSmartReviewReminders();
    });

    // 4시간마다 동기부여 알림 전송
    cron.schedule('0 */4 * * *', async () => {
      await this.sendMotivationBoosts();
    });

    // 매일 자정에 숙련도 마일스톤 체크
    cron.schedule('0 0 * * *', async () => {
      await this.checkMasteryMilestones();
    });
  }

  /**
   * 일일 복습 알림 전송
   */
  private async sendDailyReviewReminders(): Promise<void> {
    try {
      // 복습할 카드가 있는 사용자들 조회
      const usersWithReviews = await prisma.reviewSchedule.groupBy({
        by: ['userId'],
        where: {
          scheduledAt: {
            lte: new Date()
          },
          status: 'SCHEDULED'
        },
        _count: {
          id: true
        }
      });

      for (const userReview of usersWithReviews) {
        await this.createReviewReminder(userReview.userId, userReview._count.id);
      }

      console.log(`Sent review reminders to ${usersWithReviews.length} users`);
    } catch (error) {
      console.error('Error sending daily review reminders:', error);
    }
  }

  /**
   * 일일 목표 체크
   */
  private async checkDailyGoals(): Promise<void> {
    // 구현: 각 사용자의 일일 목표와 현재 진도 비교
    console.log('Checking daily goals...');
  }

  /**
   * 주간 요약 전송
   */
  private async sendWeeklySummaries(): Promise<void> {
    try {
      // 활성 사용자들 조회
      const activeUsers = await prisma.user.findMany({
        where: { isActive: true },
        select: { id: true }
      });

      for (const user of activeUsers) {
        const weeklyStats = await this.calculateWeeklyStats(user.id);
        if (weeklyStats) {
          await this.createWeeklySummary(user.id, weeklyStats);
        }
      }

      console.log(`Sent weekly summaries to ${activeUsers.length} users`);
    } catch (error) {
      console.error('Error sending weekly summaries:', error);
    }
  }

  /**
   * 스마트 복습 알림 생성 (개인화된 학습 패턴 기반)
   */
  async createSmartReviewReminder(userId: string): Promise<void> {
    try {
      const [learningPattern, progress] = await Promise.all([
        this.getUserLearningPattern(userId),
        progressService.getUserProgressStats(userId)
      ]);

      const optimalTime = this.calculateOptimalReminderTime(learningPattern);
      const personalizedMessage = this.generatePersonalizedMessage(progress, learningPattern);

      await this.createNotification({
        userId,
        type: NotificationType.SMART_REMINDER,
        title: '🎯 맞춤형 복습 시간이에요!',
        message: personalizedMessage,
        priority: NotificationPriority.MEDIUM,
        scheduledAt: optimalTime,
        data: {
          learningPattern,
          suggestedDuration: learningPattern.averageSessionDuration,
          optimalTime: learningPattern.bestPerformanceTime
        }
      });

      console.log(`Smart review reminder created for user ${userId}`);
    } catch (error) {
      console.error(`Error creating smart reminder for user ${userId}:`, error);
    }
  }

  /**
   * 동기부여 알림 생성
   */
  async createMotivationBoost(userId: string): Promise<void> {
    try {
      const [progress, learningPattern] = await Promise.all([
        progressService.getUserProgressStats(userId),
        this.getUserLearningPattern(userId)
      ]);

      const motivationType = this.determineMotivationType(progress, learningPattern);
      const message = this.selectMotivationMessage(motivationType, progress, learningPattern);

      await this.createNotification({
        userId,
        type: NotificationType.MOTIVATION_BOOST,
        title: this.getMotivationTitle(motivationType),
        message,
        priority: NotificationPriority.MEDIUM,
        data: {
          motivationType,
          currentStreak: progress.currentStreak,
          completionRate: progress.completionRate
        }
      });

      console.log(`Motivation boost sent to user ${userId}: ${motivationType}`);
    } catch (error) {
      console.error(`Error creating motivation boost for user ${userId}:`, error);
    }
  }

  /**
   * 최적 학습 시간 알림
   */
  async createOptimalTimeReminder(userId: string): Promise<void> {
    try {
      const learningPattern = await this.getUserLearningPattern(userId);
      const settings = await this.getUserSettings(userId);

      if (!settings.optimalTimeReminders) return;

      const now = new Date();
      const currentTime = now.toTimeString().substr(0, 5);
      const bestTime = learningPattern.bestPerformanceTime;

      // 최적 시간 30분 전에 알림
      const reminderTime = this.subtractMinutes(bestTime, 30);

      if (currentTime === reminderTime) {
        await this.createNotification({
          userId,
          type: NotificationType.OPTIMAL_TIME_REMINDER,
          title: '⏰ 최적의 학습 시간이 다가와요!',
          message: `${bestTime}는 당신의 최고 집중 시간입니다. 30분 후 학습을 시작해보세요!`,
          priority: NotificationPriority.HIGH,
          data: {
            optimalTime: bestTime,
            averagePerformance: learningPattern.motivationLevel,
            suggestedPreparation: '물 한 잔 마시고 책상 정리하기'
          }
        });
      }
    } catch (error) {
      console.error(`Error creating optimal time reminder for user ${userId}:`, error);
    }
  }

  /**
   * 숙련도 마일스톤 알림
   */
  async createMasteryMilestone(userId: string, subject: string, masteryLevel: number): Promise<void> {
    try {
      const milestones = [25, 50, 75, 90, 100];
      const achievedMilestone = milestones.find(m => masteryLevel >= m && masteryLevel < m + 5);

      if (achievedMilestone) {
        const title = achievedMilestone === 100 ? 
          `🏆 ${subject} 완전 숙련 달성!` : 
          `📈 ${subject} ${achievedMilestone}% 숙련도 달성!`;
          
        const message = achievedMilestone === 100 ?
          `축하합니다! ${subject} 영역을 완전히 마스터하셨습니다. 정말 대단한 성취예요!` :
          `${subject} 영역에서 ${achievedMilestone}% 숙련도를 달성했습니다. ${100 - achievedMilestone}%만 더 하면 완전 숙련이에요!`;

        await this.createNotification({
          userId,
          type: NotificationType.MASTERY_MILESTONE,
          title,
          message,
          priority: NotificationPriority.HIGH,
          data: {
            subject,
            masteryLevel,
            milestone: achievedMilestone,
            isComplete: achievedMilestone === 100
          }
        });

        console.log(`Mastery milestone notification sent: ${subject} ${achievedMilestone}% for user ${userId}`);
      }
    } catch (error) {
      console.error(`Error creating mastery milestone for user ${userId}:`, error);
    }
  }

  /**
   * 웹 푸시 알림 전송
   */
  async sendWebPushNotification(userId: string, notification: NotificationData): Promise<void> {
    try {
      // WebSocket을 통한 실시간 알림
      await socketUtils.emitToUser(userId, 'notification', {
        id: notification.id,
        type: notification.type,
        title: notification.title,
        message: notification.message,
        priority: notification.priority,
        data: notification.data,
        timestamp: notification.createdAt
      });

      console.log(`Web push notification sent to user ${userId}: ${notification.title}`);
    } catch (error) {
      console.error(`Error sending web push notification to user ${userId}:`, error);
    }
  }

  /**
   * 연속 학습 체크
   */
  private async checkStudyStreaks(): Promise<void> {
    // 구현: 연속 학습 기록 체크
    console.log('Checking study streaks...');
  }

  /**
   * 스케줄된 알림 전송
   */
  private async sendScheduledNotifications(): Promise<void> {
    const now = new Date();
    // Redis에서 스케줄된 알림들 조회하여 전송
    console.log('Sending scheduled notifications...');
  }

  /**
   * 헬퍼 메서드들
   */
  private shouldSendNotification(type: NotificationType, settings: UserNotificationSettings): boolean {
    if (!settings.enableInAppNotifications) return false;

    switch (type) {
      case NotificationType.REVIEW_REMINDER:
        return settings.reviewReminders;
      case NotificationType.STUDY_STREAK:
        return settings.studyStreakReminders;
      case NotificationType.ACHIEVEMENT:
        return settings.achievementNotifications;
      case NotificationType.PROGRESS_UPDATE:
        return settings.progressUpdates;
      case NotificationType.DAILY_GOAL:
        return settings.dailyGoalReminders;
      case NotificationType.WEEKLY_SUMMARY:
        return settings.weeklyDigest;
      case NotificationType.SMART_REMINDER:
        return settings.smartReminders;
      case NotificationType.MOTIVATION_BOOST:
        return settings.motivationBoosts;
      case NotificationType.OPTIMAL_TIME_REMINDER:
        return settings.optimalTimeReminders;
      case NotificationType.DIFFICULTY_ADJUSTMENT:
        return settings.difficultyAdjustmentAlerts;
      case NotificationType.MASTERY_MILESTONE:
        return settings.masteryMilestones;
      default:
        return true;
    }
  }

  // 스마트 알림을 위한 헬퍼 메서드들
  private async getUserLearningPattern(userId: string): Promise<UserLearningPattern> {
    const cacheKey = `${this.CACHE_PREFIX}pattern:${userId}`;
    
    try {
      const cached = await redisClient.get(cacheKey);
      if (cached) {
        return JSON.parse(cached);
      }
    } catch (error) {
      console.warn('Redis cache error:', error);
    }

    try {
      // learningPatternService에서 패턴 분석 데이터 가져오기
      const analysis = await learningPatternService.getLearningPatternSummary(userId);
      const progress = await progressService.getUserProgressStats(userId);
      
      const pattern: UserLearningPattern = {
        userId,
        optimalStudyHours: ['09:00', '14:00', '20:00'], // 기본 학습 시간
        averageSessionDuration: 30, // 기본 30분
        preferredDifficulty: 5, // 중간 난이도
        motivationLevel: Math.round(progress.currentStreak * 10 / (progress.longestStreak || 1)),
        lastActiveTime: new Date(),
        consecutiveDaysActive: progress.currentStreak,
        currentStreak: progress.currentStreak,
        bestPerformanceTime: '14:00', // 기본 오후 2시
        weeklyGoal: 50, // 주간 목표 50문제
        dailyGoal: 10 // 일일 목표 10문제
      };

      // 캐시에 저장 (1시간)
      await redisClient.setEx(cacheKey, 3600, JSON.stringify(pattern));
      return pattern;
    } catch (error) {
      console.warn('Error getting learning pattern, using defaults:', error);
      
      // 기본값 반환
      return {
        userId,
        optimalStudyHours: ['09:00', '14:00', '20:00'],
        averageSessionDuration: 30,
        preferredDifficulty: 5,
        motivationLevel: 5,
        lastActiveTime: new Date(),
        consecutiveDaysActive: 0,
        currentStreak: 0,
        bestPerformanceTime: '14:00',
        weeklyGoal: 50,
        dailyGoal: 10
      };
    }
  }

  private calculateOptimalReminderTime(pattern: UserLearningPattern): Date | undefined {
    const now = new Date();
    const bestTime = pattern.bestPerformanceTime;
    
    const [hours, minutes] = bestTime.split(':').map(Number);
    const optimalTime = new Date(now);
    optimalTime.setHours(hours, minutes, 0, 0);
    
    // 최적 시간이 이미 지났다면 다음 날로
    if (optimalTime <= now) {
      optimalTime.setDate(optimalTime.getDate() + 1);
    }
    
    return optimalTime;
  }

  private generatePersonalizedMessage(progress: any, pattern: UserLearningPattern): string {
    const messages = [
      `${pattern.bestPerformanceTime}는 당신이 가장 집중을 잘하는 시간이에요! 약 ${pattern.averageSessionDuration}분 정도 학습해보세요.`,
      `현재 ${progress.currentStreak}일 연속 학습 중이시네요! 꾸준함을 유지해보세요.`,
      `지금까지 ${progress.completionRate.toFixed(1)}% 진도를 달성했어요. 오늘도 화이팅!`,
      `평소 ${pattern.averageSessionDuration}분 동안 집중해서 학습하시니까, 오늘도 이 페이스로 가볼까요?`
    ];
    
    return messages[Math.floor(Math.random() * messages.length)];
  }

  private determineMotivationType(progress: any, pattern: UserLearningPattern): 'encouragement' | 'challenge' | 'celebration' | 'reminder' {
    if (progress.completionRate >= 80 && progress.averageAccuracy >= 90) {
      return 'celebration';
    } else if (progress.currentStreak >= 7 && progress.averageAccuracy >= 80) {
      return 'challenge';
    } else if (progress.currentStreak >= 3 && progress.completionRate >= 30) {
      return 'encouragement';
    } else {
      return 'reminder';
    }
  }

  private selectMotivationMessage(type: 'encouragement' | 'challenge' | 'celebration' | 'reminder', progress: any, pattern: UserLearningPattern): string {
    const template = this.motivationTemplates.find(t => t.type === type);
    if (!template) {
      return '오늘도 학습을 시작해보세요! 꾸준함이 실력이 됩니다.';
    }
    
    const applicableTemplates = template.templates.filter(tmpl => {
      const conditions = template.conditions;
      
      if (conditions.streakMin && progress.currentStreak < conditions.streakMin) return false;
      if (conditions.streakMax && progress.currentStreak > conditions.streakMax) return false;
      if (conditions.accuracyMin && progress.averageAccuracy < conditions.accuracyMin) return false;
      if (conditions.accuracyMax && progress.averageAccuracy > conditions.accuracyMax) return false;
      if (conditions.progressMin && progress.completionRate < conditions.progressMin) return false;
      if (conditions.progressMax && progress.completionRate > conditions.progressMax) return false;
      
      return true;
    });
    
    const selectedTemplates = applicableTemplates.length > 0 ? applicableTemplates : template.templates;
    return selectedTemplates[Math.floor(Math.random() * selectedTemplates.length)];
  }

  private getMotivationTitle(type: 'encouragement' | 'challenge' | 'celebration' | 'reminder'): string {
    const titles = {
      encouragement: '💪 힘내세요!',
      challenge: '🔥 도전해보세요!',
      celebration: '🎉 축하합니다!',
      reminder: '📚 학습 시간이에요!'
    };
    
    return titles[type];
  }

  private subtractMinutes(timeString: string, minutesToSubtract: number): string {
    const [hours, minutes] = timeString.split(':').map(Number);
    const totalMinutes = hours * 60 + minutes - minutesToSubtract;
    
    const newHours = Math.floor(totalMinutes / 60) % 24;
    const newMinutes = totalMinutes % 60;
    
    return `${String(newHours).padStart(2, '0')}:${String(newMinutes).padStart(2, '0')}`;
  }

  private async calculateWeeklyStats(userId: string) {
    try {
      const weekAgo = new Date();
      weekAgo.setDate(weekAgo.getDate() - 7);

      const [sessions, progress] = await Promise.all([
        prisma.learningSession.findMany({
          where: {
            userId,
            sessionStartTime: { gte: weekAgo }
          }
        }),
        progressService.getUserProgressStats(userId)
      ]);

      const problemsCompleted = sessions.reduce((sum, session) => sum + (session.problemsAttempted || 0), 0);
      const studyTime = sessions.reduce((sum, session) => {
        if (session.sessionEndTime && session.sessionStartTime) {
          return sum + (session.sessionEndTime.getTime() - session.sessionStartTime.getTime()) / (1000 * 60);
        }
        return sum;
      }, 0);

      const accuracyRate = sessions.length > 0 ?
        sessions.reduce((sum, session) => {
          const attempted = session.problemsAttempted || 0;
          const correct = session.problemsCorrect || 0;
          return sum + (attempted > 0 ? (correct / attempted) * 100 : 0);
        }, 0) / sessions.length : 0;

      return {
        problemsCompleted,
        studyTime,
        accuracyRate,
        streakDays: progress.currentStreak,
        topCategories: progress.categoryProgress.slice(0, 3).map(c => c.category)
      };
    } catch (error) {
      console.error(`Error calculating weekly stats for user ${userId}:`, error);
      return null;
    }
  }

  private isQuietHours(settings: UserNotificationSettings): boolean {
    if (!settings.quietHours.enabled) return false;

    const now = new Date();
    const currentTime = now.toTimeString().substr(0, 5); // HH:MM
    const { startTime, endTime } = settings.quietHours;

    if (startTime <= endTime) {
      return currentTime >= startTime && currentTime <= endTime;
    } else {
      // 자정을 넘는 경우 (예: 22:00 - 08:00)
      return currentTime >= startTime || currentTime <= endTime;
    }
  }

  private getNextAvailableTime(settings: UserNotificationSettings): Date {
    const now = new Date();
    const tomorrow = new Date(now);
    tomorrow.setDate(tomorrow.getDate() + 1);
    
    const [endHour, endMinute] = settings.quietHours.endTime.split(':').map(Number);
    tomorrow.setHours(endHour, endMinute, 0, 0);
    
    return tomorrow;
  }

  private shouldPersistNotification(type: NotificationType): boolean {
    return [
      NotificationType.ACHIEVEMENT,
      NotificationType.WEEKLY_SUMMARY,
      NotificationType.SYSTEM_ALERT
    ].includes(type);
  }

  private async cacheNotification(notification: NotificationData): Promise<void> {
    const cacheKey = `${this.CACHE_PREFIX}notif:${notification.id}`;
    try {
      await redisClient.setEx(cacheKey, 86400, JSON.stringify(notification)); // 24시간
      
      // 사용자별 알림 리스트에도 추가
      const userListKey = `${this.CACHE_PREFIX}user:${notification.userId}:list`;
      await redisClient.lPush(userListKey, notification.id);
      await redisClient.lTrim(userListKey, 0, 99); // 최근 100개만 유지
    } catch (error) {
      console.warn('Redis cache error:', error);
    }
  }

  private async persistNotification(notification: NotificationData): Promise<void> {
    // 중요한 알림만 PostgreSQL에 저장
    try {
      await prisma.notification.create({
        data: {
          id: notification.id,
          userId: notification.userId,
          type: notification.type as any,
          title: notification.title,
          message: notification.message,
          data: notification.data ? JSON.stringify(notification.data) : undefined,
          priority: notification.priority,
          isRead: notification.isRead,
          scheduledAt: notification.scheduledAt,
          sentAt: notification.sentAt
        }
      });
    } catch (error) {
      console.error('Error persisting notification:', error);
    }
  }

  private async sendNotification(notification: NotificationData): Promise<void> {
    // 실제 전송 로직 (푸시 알림, 이메일 등)
    console.log(`Sending notification: ${notification.title} to user ${notification.userId}`);
    
    // WebSocket으로 실시간 알림 전송
    await this.sendWebPushNotification(notification.userId, notification);
  }

  // 새로운 스케줄된 작업들
  private async checkOptimalTimeReminders(): Promise<void> {
    try {
      const activeUsers = await prisma.user.findMany({
        where: { isActive: true },
        select: { id: true }
      });

      for (const user of activeUsers) {
        await this.createOptimalTimeReminder(user.id);
      }

      console.log(`Checked optimal time reminders for ${activeUsers.length} users`);
    } catch (error) {
      console.error('Error checking optimal time reminders:', error);
    }
  }

  private async sendSmartReviewReminders(): Promise<void> {
    try {
      const activeUsers = await prisma.user.findMany({
        where: { isActive: true },
        select: { id: true }
      });

      for (const user of activeUsers) {
        // 사용자의 학습 패턴과 설정을 확인하여 스마트 알림 결정
        const settings = await this.getUserSettings(user.id);
        if (settings.smartReminders && settings.reminderFrequency !== 'low') {
          await this.createSmartReviewReminder(user.id);
        }
      }

      console.log(`Sent smart review reminders to active users`);
    } catch (error) {
      console.error('Error sending smart review reminders:', error);
    }
  }

  private async sendMotivationBoosts(): Promise<void> {
    try {
      const activeUsers = await prisma.user.findMany({
        where: { isActive: true },
        select: { id: true }
      });

      for (const user of activeUsers) {
        const settings = await this.getUserSettings(user.id);
        if (settings.motivationBoosts) {
          // 동기부여가 필요한 사용자들에게 선별적으로 전송
          const progress = await progressService.getUserProgressStats(user.id);
          
          // 최근 3일간 비활성 사용자나 진도율이 낮은 사용자에게 우선 전송
          if (progress.currentStreak === 0 || progress.completionRate < 50) {
            await this.createMotivationBoost(user.id);
          }
        }
      }

      console.log(`Sent motivation boosts to users who need encouragement`);
    } catch (error) {
      console.error('Error sending motivation boosts:', error);
    }
  }

  private async checkMasteryMilestones(): Promise<void> {
    try {
      const activeUsers = await prisma.user.findMany({
        where: { isActive: true },
        select: { id: true }
      });

      for (const user of activeUsers) {
        const settings = await this.getUserSettings(user.id);
        if (settings.masteryMilestones) {
          try {
            // 주제별 숙련도 체크
            const masteryData = await progressService.getSubjectMasteryProgress(user.id);
            
            for (const subject of masteryData) {
              await this.createMasteryMilestone(user.id, subject.subject, subject.masteryLevel);
            }
          } catch (error) {
            console.warn(`Error checking mastery for user ${user.id}:`, error);
          }
        }
      }

      console.log(`Checked mastery milestones for active users`);
    } catch (error) {
      console.error('Error checking mastery milestones:', error);
    }
  }

  private async getUserNotificationsFromCache(userId: string, limit: number, offset: number): Promise<NotificationData[]> {
    try {
      const userListKey = `${this.CACHE_PREFIX}user:${userId}:list`;
      const notificationIds = await redisClient.lRange(userListKey, offset, offset + limit - 1);
      
      const notifications: NotificationData[] = [];
      for (const id of notificationIds) {
        const cacheKey = `${this.CACHE_PREFIX}notif:${id}`;
        const cached = await redisClient.get(cacheKey);
        if (cached) {
          notifications.push(JSON.parse(cached));
        }
      }
      
      return notifications.sort((a, b) => new Date(b.createdAt).getTime() - new Date(a.createdAt).getTime());
    } catch (error) {
      console.warn('Redis operation error:', error);
      return [];
    }
  }

  private async invalidateUserNotificationCache(userId: string): Promise<void> {
    try {
      const pattern = `${this.CACHE_PREFIX}user:${userId}:*`;
      const keys = await redisClient.keys(pattern);
      if (keys.length > 0) {
        for (const key of keys) {
          await redisClient.del(key);
        }
      }
    } catch (error) {
      console.warn('Redis cache invalidation error:', error);
    }
  }
}

export const notificationService = new NotificationService();
export default notificationService;