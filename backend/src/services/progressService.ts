import { PrismaClient } from '@prisma/client';
import redisClient from '../config/redis.js';

const prisma = new PrismaClient();

export interface UserProgressStats {
  userId: string;
  totalProblems: number;
  completedProblems: number;
  completionRate: number;
  averageAccuracy: number;
  totalStudyTime: number; // minutes
  todayStudyTime: number; // minutes
  currentStreak: number; // days
  longestStreak: number; // days
  weeklyProgress: number; // problems completed this week
  monthlyProgress: number; // problems completed this month
  levelDistribution: {
    [key: string]: number;
  };
  categoryProgress: {
    category: string;
    completed: number;
    total: number;
    accuracy: number;
  }[];
}

export interface DailyProgressData {
  date: string;
  problemsCompleted: number;
  studyTime: number;
  accuracy: number;
  streak: number;
}

class ProgressService {
  private readonly CACHE_PREFIX = 'progress:';
  private readonly CACHE_TTL = 300; // 5 minutes

  /**
   * 사용자의 전체 진도율 통계를 계산합니다
   */
  async getUserProgressStats(userId: string): Promise<UserProgressStats> {
    const cacheKey = `${this.CACHE_PREFIX}stats:${userId}`;
    
    // Redis 캐시에서 먼저 확인
    try {
      const cached = await redisClient.get(cacheKey);
      if (cached) {
        return JSON.parse(cached);
      }
    } catch (error) {
      console.warn('Redis cache error:', error);
    }

    // 데이터베이스에서 계산
    const stats = await this.calculateProgressStats(userId);
    
    // 캐시에 저장
    try {
      await redisClient.setEx(cacheKey, this.CACHE_TTL, JSON.stringify(stats));
    } catch (error) {
      console.warn('Redis cache save error:', error);
    }

    return stats;
  }

  /**
   * 진도율 통계를 실시간으로 계산합니다
   */
  private async calculateProgressStats(userId: string): Promise<UserProgressStats> {
    const now = new Date();
    const todayStart = new Date(now.getFullYear(), now.getMonth(), now.getDate());
    const weekStart = new Date(now.getTime() - 7 * 24 * 60 * 60 * 1000);
    const monthStart = new Date(now.getFullYear(), now.getMonth(), 1);

    // 병렬로 데이터 조회
    const [
      totalProblems,
      userReviews,
      reviewSessions,
      categoryStats
    ] = await Promise.all([
      // 전체 문제 수
      prisma.problem.count(),
      
      // 사용자 복습 기록
      prisma.learningProgress.findMany({
        where: { userId },
        include: {
          problem: {
            select: {
              category: true,
              difficulty: true
            }
          }
        },
        orderBy: { updatedAt: 'desc' }
      }),

      // 복습 세션 데이터
      prisma.learningSession.findMany({
        where: { userId },
        orderBy: { sessionStartTime: 'desc' }
      }),

      // 카테고리별 통계
      prisma.problem.groupBy({
        by: ['categoryId'],
        where: {
          categoryId: { not: null }
        },
        _count: {
          id: true
        }
      })
    ]);

    // 완료한 문제 (COMPLETED 상태)
    const completedProblems = userReviews.filter(review => 
      review.status === 'COMPLETED'
    ).length;

    // 정확도 계산 (점수 기반)
    const totalReviews = userReviews.length;
    const correctReviews = userReviews.filter(review => 
      review.score !== null && review.score >= 70 // 70점 이상을 정답으로 간주
    ).length;
    const averageAccuracy = totalReviews > 0 ? (correctReviews / totalReviews) * 100 : 0;

    // 총 학습 시간 계산 (분)
    const totalStudyTime = reviewSessions.reduce((sum, session) => {
      if (session.sessionEndTime && session.sessionStartTime) {
        const duration = (session.sessionEndTime.getTime() - session.sessionStartTime.getTime()) / (1000 * 60);
        return sum + duration;
      }
      return sum;
    }, 0);

    // 오늘 학습 시간
    const todayStudyTime = reviewSessions
      .filter(session => session.sessionStartTime >= todayStart)
      .reduce((sum, session) => {
        if (session.sessionEndTime && session.sessionStartTime) {
          const duration = (session.sessionEndTime.getTime() - session.sessionStartTime.getTime()) / (1000 * 60);
          return sum + duration;
        }
        return sum;
      }, 0);

    // 연속 학습 일수 계산
    const streakData = await this.calculateStudyStreak(userId);

    // 상태별 분포 (currentLevel 대신 status 사용)
    const levelDistribution: { [key: string]: number } = {};
    userReviews.forEach(review => {
      const level = review.status;
      levelDistribution[level] = (levelDistribution[level] || 0) + 1;
    });

    // 카테고리별 진도율
    const categoryProgress = await this.calculateCategoryProgress(userId, categoryStats);

    // 주간/월간 진도율
    const weeklyProgress = userReviews.filter(review => 
      review.updatedAt >= weekStart
    ).length;

    const monthlyProgress = userReviews.filter(review => 
      review.updatedAt >= monthStart
    ).length;

    return {
      userId,
      totalProblems,
      completedProblems,
      completionRate: totalProblems > 0 ? (completedProblems / totalProblems) * 100 : 0,
      averageAccuracy,
      totalStudyTime: Math.round(totalStudyTime),
      todayStudyTime: Math.round(todayStudyTime),
      currentStreak: streakData.currentStreak,
      longestStreak: streakData.longestStreak,
      weeklyProgress,
      monthlyProgress,
      levelDistribution,
      categoryProgress
    };
  }

  /**
   * 연속 학습 일수를 계산합니다
   */
  private async calculateStudyStreak(userId: string): Promise<{
    currentStreak: number;
    longestStreak: number;
  }> {
    // 날짜별 학습 기록 조회
    const dailyActivity = await prisma.learningSession.groupBy({
      by: ['sessionStartTime'],
      where: {
        userId,
        sessionEndTime: { not: null }
      },
      _count: {
        id: true
      },
      orderBy: {
        sessionStartTime: 'desc'
      }
    });

    // 날짜별로 그룹화
    const activityByDate = new Map<string, number>();
    dailyActivity.forEach(activity => {
      const dateKey = activity.sessionStartTime.toISOString().split('T')[0];
      activityByDate.set(dateKey, (activityByDate.get(dateKey) || 0) + activity._count.id);
    });

    const sortedDates = Array.from(activityByDate.keys()).sort().reverse();

    // 현재 연속 일수 계산
    let currentStreak = 0;
    let longestStreak = 0;
    let tempStreak = 0;

    const today = new Date().toISOString().split('T')[0];
    let checkDate = new Date();

    // 현재 연속 일수 계산
    for (let i = 0; i < 365; i++) { // 최대 1년
      const dateKey = checkDate.toISOString().split('T')[0];
      
      if (activityByDate.has(dateKey)) {
        if (dateKey === today || currentStreak > 0) {
          currentStreak++;
        }
        tempStreak++;
        longestStreak = Math.max(longestStreak, tempStreak);
      } else {
        if (currentStreak === 0 && dateKey !== today) {
          break; // 오늘부터 연속이 아니면 중단
        }
        tempStreak = 0;
      }

      checkDate.setDate(checkDate.getDate() - 1);
    }

    return { currentStreak, longestStreak };
  }

  /**
   * 카테고리별 진도율을 계산합니다
   */
  private async calculateCategoryProgress(
    userId: string, 
    categoryStats: { categoryId: string | null; _count: { id: number } }[]
  ): Promise<{ category: string; completed: number; total: number; accuracy: number }[]> {
    
    const categoryProgress = await Promise.all(
      categoryStats.filter(stat => stat.categoryId !== null).map(async (stat) => {
        const categoryReviews = await prisma.learningProgress.findMany({
          where: {
            userId,
            problem: {
              categoryId: stat.categoryId
            }
          }
        });

        const completed = categoryReviews.filter(review => 
          review.status === 'COMPLETED'
        ).length;

        const totalReviews = categoryReviews.length;
        const correctReviews = categoryReviews.filter(review => 
          review.score !== null && review.score >= 70
        ).length;

        const accuracy = totalReviews > 0 ? (correctReviews / totalReviews) * 100 : 0;

        return {
          category: stat.categoryId || 'Unknown',
          completed,
          total: stat._count.id,
          accuracy: Math.round(accuracy * 100) / 100
        };
      })
    );

    return categoryProgress;
  }

  /**
   * 일별 진도율 데이터를 조회합니다 (차트용)
   */
  async getDailyProgressData(userId: string, days: number = 30): Promise<DailyProgressData[]> {
    const endDate = new Date();
    const startDate = new Date(endDate.getTime() - days * 24 * 60 * 60 * 1000);

    // 날짜별 세션 데이터 조회
    const sessions = await prisma.learningSession.findMany({
      where: {
        userId,
        sessionStartTime: {
          gte: startDate,
          lte: endDate
        },
        sessionEndTime: { not: null }
      },
      // include 제거 - 간단한 조회로 변경
      orderBy: { sessionStartTime: 'asc' }
    });

    // 날짜별로 그룹화하여 통계 계산
    const dailyData = new Map<string, DailyProgressData>();

    for (let i = 0; i < days; i++) {
      const date = new Date(startDate.getTime() + i * 24 * 60 * 60 * 1000);
      const dateKey = date.toISOString().split('T')[0];
      
      dailyData.set(dateKey, {
        date: dateKey,
        problemsCompleted: 0,
        studyTime: 0,
        accuracy: 0,
        streak: 0
      });
    }

    sessions.forEach(session => {
      const dateKey = session.sessionStartTime.toISOString().split('T')[0];
      const data = dailyData.get(dateKey);
      
      if (data) {
        data.problemsCompleted += session.problemsAttempted || 0;
        if (session.sessionEndTime) {
          data.studyTime += (session.sessionEndTime.getTime() - session.sessionStartTime.getTime()) / (1000 * 60);
        }
        data.accuracy = session.problemsAttempted > 0 ? ((session.problemsCorrect || Math.floor(session.problemsAttempted * 0.7)) / session.problemsAttempted) * 100 : 0;
      }
    });

    return Array.from(dailyData.values()).map(data => ({
      ...data,
      studyTime: Math.round(data.studyTime),
      accuracy: Math.round(data.accuracy * 100) / 100
    }));
  }

  /**
   * 진도율 캐시를 무효화합니다 (복습 완료 시 호출)
   */
  async invalidateProgressCache(userId: string): Promise<void> {
    const cacheKey = `${this.CACHE_PREFIX}stats:${userId}`;
    
    try {
      await redisClient.del(cacheKey);
    } catch (error) {
      console.warn('Redis cache invalidation error:', error);
    }
  }

  /**
   * 실시간 진도율 업데이트 (WebSocket 등에서 사용)
   */
  async getRealtimeProgress(userId: string): Promise<{
    completionRate: number;
    todayProgress: number;
    currentStreak: number;
    studyTime: number;
  }> {
    const stats = await this.getUserProgressStats(userId);
    
    return {
      completionRate: stats.completionRate,
      todayProgress: stats.weeklyProgress, // 이번 주 진도
      currentStreak: stats.currentStreak,
      studyTime: stats.todayStudyTime
    };
  }

  /**
   * 복습 완료 시 실시간으로 진도율을 업데이트하고 WebSocket으로 전송
   */
  async updateProgressRealtime(userId: string, reviewData: {
    problemId: string;
    isCorrect: boolean;
    responseTime: number;
    difficulty: number;
  }): Promise<void> {
    // 캐시 무효화
    await this.invalidateProgressCache(userId);
    
    // 최신 진도율 데이터 계산
    const realtimeProgress = await this.getRealtimeProgress(userId);
    
    // 상세한 업데이트 정보 생성
    const progressUpdate = {
      userId,
      timestamp: new Date().toISOString(),
      completionRate: realtimeProgress.completionRate,
      todayProgress: realtimeProgress.todayProgress,
      currentStreak: realtimeProgress.currentStreak,
      studyTime: realtimeProgress.studyTime,
      lastReview: {
        problemId: reviewData.problemId,
        isCorrect: reviewData.isCorrect,
        responseTime: reviewData.responseTime,
        difficulty: reviewData.difficulty
      }
    };

    // WebSocket을 통해 실시간 업데이트 전송
    try {
      const { socketUtils } = await import('../config/socket.js');
      await socketUtils.emitProgressUpdate(userId, progressUpdate);
    } catch (error) {
      console.warn('Failed to emit progress update:', error);
    }
  }

  /**
   * 주제별 숙련도 진도율 계산
   */
  async getSubjectMasteryProgress(userId: string): Promise<{
    subject: string;
    masteryLevel: number; // 0-100
    totalProblems: number;
    masteredProblems: number;
    averageAccuracy: number;
    estimatedTimeToMaster: number; // 분
  }[]> {
    const categoryStats = await prisma.problem.groupBy({
      by: ['categoryId'],
      where: { categoryId: { not: null } },
      _count: { id: true }
    });

    const masteryData = await Promise.all(
      categoryStats.map(async (stat) => {
        const categoryReviews = await prisma.learningProgress.findMany({
          where: {
            userId,
            problem: { categoryId: stat.categoryId }
          },
          include: {
            problem: { select: { title: true, difficulty: true } }
          }
        });

        const totalProblems = stat._count.id;
        const masteredProblems = categoryReviews.filter(review => 
          review.status === 'COMPLETED' && 
          review.score !== null && 
          review.score >= 80 &&
          review.correctAttempts >= 3
        ).length;

        const totalReviews = categoryReviews.length;
        const correctReviews = categoryReviews.filter(review => 
          review.score !== null && review.score >= 70
        ).length;
        
        const averageAccuracy = totalReviews > 0 ? (correctReviews / totalReviews) * 100 : 0;
        const masteryLevel = totalProblems > 0 ? (masteredProblems / totalProblems) * 100 : 0;
        
        // 예상 완료 시간 계산 (남은 문제수 * 평균 소요시간)
        const averageTime = categoryReviews.reduce((sum, review) => sum + (review.timeSpent || 0), 0) / Math.max(totalReviews, 1);
        const remainingProblems = totalProblems - masteredProblems;
        const estimatedTimeToMaster = Math.ceil(remainingProblems * averageTime);

        // 카테고리 이름 조회
        const category = await prisma.category.findUnique({
          where: { id: stat.categoryId! },
          select: { name: true }
        });

        return {
          subject: category?.name || 'Unknown Category',
          masteryLevel: Math.round(masteryLevel * 100) / 100,
          totalProblems,
          masteredProblems,
          averageAccuracy: Math.round(averageAccuracy * 100) / 100,
          estimatedTimeToMaster
        };
      })
    );

    return masteryData.sort((a, b) => b.masteryLevel - a.masteryLevel);
  }

  /**
   * 실시간 학습 세션 추적
   */
  async trackLearningSession(userId: string, sessionData: {
    sessionId: string;
    problemsAttempted: number;
    problemsCorrect: number;
    totalTime: number; // 초
    difficulty: number;
  }): Promise<void> {
    const sessionProgress = {
      sessionId: sessionData.sessionId,
      userId,
      timestamp: new Date().toISOString(),
      stats: {
        problemsAttempted: sessionData.problemsAttempted,
        problemsCorrect: sessionData.problemsCorrect,
        accuracy: sessionData.problemsAttempted > 0 ? (sessionData.problemsCorrect / sessionData.problemsAttempted) * 100 : 0,
        totalTime: sessionData.totalTime,
        averageTimePerProblem: sessionData.problemsAttempted > 0 ? sessionData.totalTime / sessionData.problemsAttempted : 0,
        difficulty: sessionData.difficulty
      }
    };

    // WebSocket을 통해 실시간 세션 업데이트 전송
    try {
      const { socketUtils } = await import('../config/socket.js');
      await socketUtils.emitSessionProgress(sessionData.sessionId, userId, sessionProgress);
      
      // 관련 사용자들에게도 알림 (스터디 그룹, 강사 등)
      await socketUtils.emitToInstructors('student-session-update', {
        studentId: userId,
        ...sessionProgress
      });
    } catch (error) {
      console.warn('Failed to emit session progress:', error);
    }
  }
}

export const progressService = new ProgressService();
export default progressService;