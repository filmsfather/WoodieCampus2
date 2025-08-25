import { PrismaClient } from "@prisma/client"
import { 
  LearningStatus, 
  ForgettingCurveLevel,
  ReviewStatus 
} from "@prisma/client"

const prisma = new PrismaClient();

export interface LearningPatternData {
  userId: string;
  
  // 기본 학습 패턴
  totalProblemsAttempted: number;
  totalProblemsCorrect: number;
  overallSuccessRate: number;
  averageResponseTime: number; // 초 단위
  totalStudyTime: number; // 분 단위
  
  // 시간별 학습 패턴
  learningTimeDistribution: Record<string, number>; // 시간대별 학습량
  peakLearningHours: string[]; // 최고 성과 시간대
  dailyConsistency: number; // 일일 일관성 점수 (0-1)
  weeklyConsistency: number; // 주간 일관성 점수 (0-1)
  
  // 난이도별 성과 패턴
  difficultyPerformance: {
    level: number;
    successRate: number;
    averageTime: number;
    attemptCount: number;
  }[];
  
  // 망각곡선 레벨별 성과
  forgettingCurvePerformance: {
    level: ForgettingCurveLevel;
    successRate: number;
    averageResponseTime: number;
    reviewCount: number;
  }[];
  
  // 학습 개선 추세
  improvementTrend: {
    period: string;
    successRate: number;
    responseTime: number;
    studyTime: number;
  }[];
  
  // 문제 유형별 성과
  questionTypePerformance: {
    type: string;
    successRate: number;
    averageTime: number;
    strengthLevel: 'WEAK' | 'AVERAGE' | 'STRONG';
  }[];
  
  // 집중도 및 일관성 분석
  focusAnalysis: {
    averageFocusScore: number;
    focusConsistency: number;
    bestFocusTimes: string[];
    focusTrend: 'IMPROVING' | 'STABLE' | 'DECLINING';
  };
  
  // 복습 패턴
  reviewPatterns: {
    averageReviewDelay: number; // 예정 시간 대비 지연 시간 (분)
    reviewCompleteRate: number; // 복습 완료율
    preferredReviewTimes: string[];
    reviewConsistency: number;
  };
  
  // 추천 사항
  recommendations: {
    type: 'STUDY_TIME' | 'DIFFICULTY' | 'REVIEW_SCHEDULE' | 'FOCUS_IMPROVEMENT';
    priority: 'HIGH' | 'MEDIUM' | 'LOW';
    message: string;
    actionItems: string[];
  }[];
  
  lastAnalysisDate: Date;
}

export interface LearningSessionData {
  sessionId: string;
  userId: string;
  startTime: Date;
  endTime: Date | null;
  problemsAttempted: number;
  problemsCorrect: number;
  averageResponseTime: number;
  focusScore?: number;
  consistencyScore?: number;
}

export class LearningPatternService {
  
  /**
   * 사용자의 전체 학습 패턴을 분석합니다
   */
  static async analyzeLearningPattern(userId: string): Promise<LearningPatternData> {
    const [
      basicStats,
      timeDistribution,
      difficultyPerformance,
      forgettingCurveStats,
      improvementTrend,
      questionTypeStats,
      focusAnalysis,
      reviewPatterns
    ] = await Promise.all([
      this.getBasicLearningStats(userId),
      this.getLearningTimeDistribution(userId),
      this.getDifficultyPerformance(userId),
      this.getForgettingCurvePerformance(userId),
      this.getImprovementTrend(userId),
      this.getQuestionTypePerformance(userId),
      this.getFocusAnalysis(userId),
      this.getReviewPatterns(userId)
    ]);
    
    const recommendations = this.generateRecommendations({
      basicStats,
      timeDistribution,
      difficultyPerformance,
      focusAnalysis,
      reviewPatterns
    });
    
    return {
      userId,
      ...basicStats,
      ...timeDistribution,
      difficultyPerformance,
      forgettingCurvePerformance: forgettingCurveStats,
      improvementTrend,
      questionTypePerformance: questionTypeStats,
      focusAnalysis,
      reviewPatterns,
      recommendations,
      lastAnalysisDate: new Date()
    };
  }
  
  /**
   * 기본 학습 통계를 가져옵니다
   */
  private static async getBasicLearningStats(userId: string) {
    const thirtyDaysAgo = new Date();
    thirtyDaysAgo.setDate(thirtyDaysAgo.getDate() - 30);
    
    // 학습 진도 데이터 조회
    const learningProgress = await prisma.learningProgress.findMany({
      where: {
        userId,
        createdAt: { gte: thirtyDaysAgo }
      }
    });
    
    // 학습 세션 데이터 조회
    const learningSessions = await prisma.learningSession.findMany({
      where: {
        userId,
        sessionStartTime: { gte: thirtyDaysAgo }
      }
    });
    
    // 복습 스케줄 데이터 조회
    const reviewSchedules = await prisma.reviewSchedule.findMany({
      where: {
        userId,
        createdAt: { gte: thirtyDaysAgo }
      }
    });
    
    const totalProblemsAttempted = learningProgress.reduce((sum, p) => sum + p.attemptsCount, 0);
    const totalCorrect = learningProgress.filter(p => p.score && p.maxScore && p.score >= p.maxScore * 0.7).length;
    const overallSuccessRate = totalProblemsAttempted > 0 ? totalCorrect / totalProblemsAttempted : 0;
    const averageResponseTime = reviewSchedules
      .filter(r => r.responseTime)
      .reduce((sum, r) => sum + (r.responseTime || 0), 0) / Math.max(1, reviewSchedules.filter(r => r.responseTime).length);
    const totalStudyTime = learningSessions.reduce((sum, s) => sum + (s.totalDuration || 0), 0);
    
    return {
      totalProblemsAttempted,
      totalProblemsCorrect: totalCorrect,
      overallSuccessRate,
      averageResponseTime,
      totalStudyTime
    };
  }
  
  /**
   * 시간별 학습 분포를 분석합니다
   */
  private static async getLearningTimeDistribution(userId: string) {
    const thirtyDaysAgo = new Date();
    thirtyDaysAgo.setDate(thirtyDaysAgo.getDate() - 30);
    
    const learningSessions = await prisma.learningSession.findMany({
      where: {
        userId,
        sessionStartTime: { gte: thirtyDaysAgo }
      },
      orderBy: { sessionStartTime: 'asc' }
    });
    
    // 시간대별 학습량 계산
    const learningTimeDistribution: Record<string, number> = {};
    const dailyStudyTime: Record<string, number> = {};
    
    learningSessions.forEach(session => {
      const hour = session.sessionStartTime.getHours();
      const hourKey = `${hour.toString().padStart(2, '0')}:00`;
      const dateKey = session.sessionStartTime.toDateString();
      
      learningTimeDistribution[hourKey] = (learningTimeDistribution[hourKey] || 0) + (session.totalDuration || 0);
      dailyStudyTime[dateKey] = (dailyStudyTime[dateKey] || 0) + (session.totalDuration || 0);
    });
    
    // 최고 성과 시간대 찾기 (상위 3개)
    const peakLearningHours = Object.entries(learningTimeDistribution)
      .sort(([,a], [,b]) => b - a)
      .slice(0, 3)
      .map(([hour]) => hour);
    
    // 일일 일관성 점수 계산 (지난 30일 중 학습한 일수 비율)
    const studyDays = Object.keys(dailyStudyTime).length;
    const dailyConsistency = studyDays / 30;
    
    // 주간 일관성 점수 계산 (주별 학습량 편차)
    const weeklyStudyTimes: number[] = [];
    const now = new Date();
    for (let i = 0; i < 4; i++) {
      const weekStart = new Date(now.getTime() - (i + 1) * 7 * 24 * 60 * 60 * 1000);
      const weekEnd = new Date(weekStart.getTime() + 7 * 24 * 60 * 60 * 1000);
      
      const weeklyTime = learningSessions
        .filter(s => s.sessionStartTime >= weekStart && s.sessionStartTime < weekEnd)
        .reduce((sum, s) => sum + (s.totalDuration || 0), 0);
      
      weeklyStudyTimes.push(weeklyTime);
    }
    
    const avgWeeklyTime = weeklyStudyTimes.reduce((sum, time) => sum + time, 0) / weeklyStudyTimes.length;
    const weeklyVariance = weeklyStudyTimes.reduce((sum, time) => sum + Math.pow(time - avgWeeklyTime, 2), 0) / weeklyStudyTimes.length;
    const weeklyConsistency = avgWeeklyTime > 0 ? Math.max(0, 1 - Math.sqrt(weeklyVariance) / avgWeeklyTime) : 0;
    
    return {
      learningTimeDistribution,
      peakLearningHours,
      dailyConsistency,
      weeklyConsistency
    };
  }
  
  /**
   * 난이도별 성과를 분석합니다
   */
  private static async getDifficultyPerformance(userId: string) {
    const thirtyDaysAgo = new Date();
    thirtyDaysAgo.setDate(thirtyDaysAgo.getDate() - 30);
    
    const learningProgress = await prisma.learningProgress.findMany({
      where: {
        userId,
        createdAt: { gte: thirtyDaysAgo }
      },
      include: {
        problem: true
      }
    });
    
    const difficultyStats: Record<number, { total: number; correct: number; totalTime: number; attempts: number }> = {};
    
    learningProgress.forEach(progress => {
      if (!progress.problem) return;
      
      const difficulty = progress.problem.difficulty;
      if (!difficultyStats[difficulty]) {
        difficultyStats[difficulty] = { total: 0, correct: 0, totalTime: 0, attempts: 0 };
      }
      
      difficultyStats[difficulty].attempts += progress.attemptsCount;
      difficultyStats[difficulty].totalTime += progress.timeSpent;
      difficultyStats[difficulty].total += 1;
      
      if (progress.score && progress.maxScore && progress.score >= progress.maxScore * 0.7) {
        difficultyStats[difficulty].correct += 1;
      }
    });
    
    return Object.entries(difficultyStats).map(([level, stats]) => ({
      level: parseInt(level),
      successRate: stats.total > 0 ? stats.correct / stats.total : 0,
      averageTime: stats.attempts > 0 ? stats.totalTime / stats.attempts : 0,
      attemptCount: stats.attempts
    }));
  }
  
  /**
   * 망각곡선 레벨별 성과를 분석합니다
   */
  private static async getForgettingCurvePerformance(userId: string) {
    const thirtyDaysAgo = new Date();
    thirtyDaysAgo.setDate(thirtyDaysAgo.getDate() - 30);
    
    const reviewSchedules = await prisma.reviewSchedule.findMany({
      where: {
        userId,
        completedAt: { gte: thirtyDaysAgo }
      }
    });
    
    const levelStats: Record<ForgettingCurveLevel, { total: number; success: number; totalTime: number }> = {} as any;
    
    // 각 레벨 초기화
    Object.values(ForgettingCurveLevel).forEach(level => {
      levelStats[level] = { total: 0, success: 0, totalTime: 0 };
    });
    
    reviewSchedules.forEach(review => {
      const level = review.currentLevel;
      levelStats[level].total += 1;
      levelStats[level].totalTime += review.responseTime || 0;
      
      if (review.isSuccess) {
        levelStats[level].success += 1;
      }
    });
    
    return Object.entries(levelStats).map(([level, stats]) => ({
      level: level as ForgettingCurveLevel,
      successRate: stats.total > 0 ? stats.success / stats.total : 0,
      averageResponseTime: stats.total > 0 ? stats.totalTime / stats.total : 0,
      reviewCount: stats.total
    }));
  }
  
  /**
   * 학습 개선 추세를 분석합니다
   */
  private static async getImprovementTrend(userId: string) {
    const trends = [];
    const now = new Date();
    
    for (let i = 0; i < 4; i++) {
      const weekStart = new Date(now.getTime() - (i + 1) * 7 * 24 * 60 * 60 * 1000);
      const weekEnd = new Date(weekStart.getTime() + 7 * 24 * 60 * 60 * 1000);
      
      const [learningProgress, learningSessions, reviewSchedules] = await Promise.all([
        prisma.learningProgress.findMany({
          where: {
            userId,
            createdAt: { gte: weekStart, lt: weekEnd }
          }
        }),
        prisma.learningSession.findMany({
          where: {
            userId,
            sessionStartTime: { gte: weekStart, lt: weekEnd }
          }
        }),
        prisma.reviewSchedule.findMany({
          where: {
            userId,
            completedAt: { gte: weekStart, lt: weekEnd }
          }
        })
      ]);
      
      const totalAttempts = learningProgress.reduce((sum, p) => sum + p.attemptsCount, 0);
      const successfulAttempts = learningProgress.filter(p => p.score && p.maxScore && p.score >= p.maxScore * 0.7).length;
      const successRate = totalAttempts > 0 ? successfulAttempts / totalAttempts : 0;
      
      const avgResponseTime = reviewSchedules
        .filter(r => r.responseTime)
        .reduce((sum, r) => sum + (r.responseTime || 0), 0) / Math.max(1, reviewSchedules.filter(r => r.responseTime).length);
      
      const studyTime = learningSessions.reduce((sum, s) => sum + (s.totalDuration || 0), 0);
      
      trends.unshift({
        period: `Week ${4 - i}`,
        successRate,
        responseTime: avgResponseTime,
        studyTime
      });
    }
    
    return trends;
  }
  
  /**
   * 문제 유형별 성과를 분석합니다
   */
  private static async getQuestionTypePerformance(userId: string) {
    const thirtyDaysAgo = new Date();
    thirtyDaysAgo.setDate(thirtyDaysAgo.getDate() - 30);
    
    const learningProgress = await prisma.learningProgress.findMany({
      where: {
        userId,
        createdAt: { gte: thirtyDaysAgo }
      },
      include: {
        problem: true
      }
    });
    
    const typeStats: Record<string, { total: number; correct: number; totalTime: number }> = {};
    
    learningProgress.forEach(progress => {
      if (!progress.problem) return;
      
      const type = progress.problem.questionType;
      if (!typeStats[type]) {
        typeStats[type] = { total: 0, correct: 0, totalTime: 0 };
      }
      
      typeStats[type].total += 1;
      typeStats[type].totalTime += progress.timeSpent;
      
      if (progress.score && progress.maxScore && progress.score >= progress.maxScore * 0.7) {
        typeStats[type].correct += 1;
      }
    });
    
    return Object.entries(typeStats).map(([type, stats]) => {
      const successRate = stats.total > 0 ? stats.correct / stats.total : 0;
      const averageTime = stats.total > 0 ? stats.totalTime / stats.total : 0;
      
      let strengthLevel: 'WEAK' | 'AVERAGE' | 'STRONG';
      if (successRate >= 0.8) strengthLevel = 'STRONG';
      else if (successRate >= 0.6) strengthLevel = 'AVERAGE';
      else strengthLevel = 'WEAK';
      
      return {
        type,
        successRate,
        averageTime,
        strengthLevel
      };
    });
  }
  
  /**
   * 집중도 분석을 수행합니다
   */
  private static async getFocusAnalysis(userId: string) {
    const thirtyDaysAgo = new Date();
    thirtyDaysAgo.setDate(thirtyDaysAgo.getDate() - 30);
    
    const learningSessions = await prisma.learningSession.findMany({
      where: {
        userId,
        sessionStartTime: { gte: thirtyDaysAgo }
      },
      orderBy: { sessionStartTime: 'asc' }
    });
    
    const focusScores = learningSessions
      .filter(s => s.focusScore !== null)
      .map(s => s.focusScore!);
    
    const averageFocusScore = focusScores.length > 0 ? 
      focusScores.reduce((sum, score) => sum + score, 0) / focusScores.length : 0;
    
    // 집중도 일관성 (표준편차의 역수)
    const focusVariance = focusScores.length > 0 ?
      focusScores.reduce((sum, score) => sum + Math.pow(score - averageFocusScore, 2), 0) / focusScores.length : 0;
    const focusConsistency = averageFocusScore > 0 ? Math.max(0, 1 - Math.sqrt(focusVariance) / 10) : 0;
    
    // 최고 집중 시간대
    const hourlyFocus: Record<string, { total: number; count: number }> = {};
    learningSessions.forEach(session => {
      if (session.focusScore) {
        const hour = session.sessionStartTime.getHours();
        const hourKey = `${hour.toString().padStart(2, '0')}:00`;
        
        if (!hourlyFocus[hourKey]) {
          hourlyFocus[hourKey] = { total: 0, count: 0 };
        }
        hourlyFocus[hourKey].total += session.focusScore;
        hourlyFocus[hourKey].count += 1;
      }
    });
    
    const bestFocusTimes = Object.entries(hourlyFocus)
      .map(([hour, data]) => ({ hour, avgFocus: data.total / data.count }))
      .sort((a, b) => b.avgFocus - a.avgFocus)
      .slice(0, 3)
      .map(item => item.hour);
    
    // 집중도 추세 분석
    const recentFocus = focusScores.slice(-10);
    const earlyFocus = focusScores.slice(0, 10);
    const recentAvg = recentFocus.length > 0 ? recentFocus.reduce((sum, score) => sum + score, 0) / recentFocus.length : 0;
    const earlyAvg = earlyFocus.length > 0 ? earlyFocus.reduce((sum, score) => sum + score, 0) / earlyFocus.length : 0;
    
    let focusTrend: 'IMPROVING' | 'STABLE' | 'DECLINING';
    if (recentAvg > earlyAvg + 0.5) focusTrend = 'IMPROVING';
    else if (recentAvg < earlyAvg - 0.5) focusTrend = 'DECLINING';
    else focusTrend = 'STABLE';
    
    return {
      averageFocusScore,
      focusConsistency,
      bestFocusTimes,
      focusTrend
    };
  }
  
  /**
   * 복습 패턴을 분석합니다
   */
  private static async getReviewPatterns(userId: string) {
    const thirtyDaysAgo = new Date();
    thirtyDaysAgo.setDate(thirtyDaysAgo.getDate() - 30);
    
    const reviewSchedules = await prisma.reviewSchedule.findMany({
      where: {
        userId,
        createdAt: { gte: thirtyDaysAgo }
      }
    });
    
    // 평균 복습 지연 시간 계산
    const completedReviews = reviewSchedules.filter(r => r.completedAt);
    const delays = completedReviews.map(r => {
      if (r.completedAt && r.scheduledAt) {
        return (r.completedAt.getTime() - r.scheduledAt.getTime()) / (1000 * 60); // 분 단위
      }
      return 0;
    });
    const averageReviewDelay = delays.length > 0 ? delays.reduce((sum, delay) => sum + delay, 0) / delays.length : 0;
    
    // 복습 완료율
    const totalScheduled = reviewSchedules.length;
    const totalCompleted = completedReviews.length;
    const reviewCompleteRate = totalScheduled > 0 ? totalCompleted / totalScheduled : 0;
    
    // 선호하는 복습 시간대
    const reviewHours: Record<string, number> = {};
    completedReviews.forEach(review => {
      if (review.completedAt) {
        const hour = review.completedAt.getHours();
        const hourKey = `${hour.toString().padStart(2, '0')}:00`;
        reviewHours[hourKey] = (reviewHours[hourKey] || 0) + 1;
      }
    });
    
    const preferredReviewTimes = Object.entries(reviewHours)
      .sort(([,a], [,b]) => b - a)
      .slice(0, 3)
      .map(([hour]) => hour);
    
    // 복습 일관성 (일정한 시간에 복습하는지)
    const reviewDays = new Set(completedReviews.map(r => r.completedAt?.toDateString()).filter(Boolean));
    const reviewConsistency = reviewDays.size / 30; // 30일 중 복습한 일수 비율
    
    return {
      averageReviewDelay,
      reviewCompleteRate,
      preferredReviewTimes,
      reviewConsistency
    };
  }
  
  /**
   * 학습 패턴을 기반으로 개인화된 추천사항을 생성합니다
   */
  private static generateRecommendations(analysisData: any) {
    const recommendations: any[] = [];
    
    // 학습 시간 추천
    if (analysisData.basicStats.totalStudyTime < 300) { // 5시간 미만
      recommendations.push({
        type: 'STUDY_TIME',
        priority: 'HIGH',
        message: '주간 학습 시간이 부족합니다. 꾸준한 학습을 위해 일일 학습 시간을 늘려보세요.',
        actionItems: [
          '일일 최소 30분 학습 시간 확보',
          `최적 학습 시간대(${analysisData.timeDistribution.peakLearningHours.join(', ')}) 활용`,
          '학습 알림 설정으로 일관성 유지'
        ]
      });
    }
    
    // 집중도 개선 추천
    if (analysisData.focusAnalysis.averageFocusScore < 6) {
      recommendations.push({
        type: 'FOCUS_IMPROVEMENT',
        priority: 'MEDIUM',
        message: '학습 집중도가 낮습니다. 집중력 향상 방법을 적용해보세요.',
        actionItems: [
          '25분 집중 + 5분 휴식 (포모도로 기법) 적용',
          `집중도가 높은 시간대(${analysisData.focusAnalysis.bestFocusTimes.join(', ')}) 활용`,
          '학습 환경 개선 (조명, 소음 등)'
        ]
      });
    }
    
    // 복습 스케줄 개선 추천
    if (analysisData.reviewPatterns.reviewCompleteRate < 0.8) {
      recommendations.push({
        type: 'REVIEW_SCHEDULE',
        priority: 'HIGH',
        message: '복습 완료율이 낮습니다. 복습 스케줄 관리를 개선해보세요.',
        actionItems: [
          '복습 알림 활성화',
          '복습 시간 단축 (한 번에 적은 양)',
          '복습 보상 시스템 도입'
        ]
      });
    }
    
    // 난이도 조정 추천
    const weakAreas = analysisData.difficultyPerformance.filter((d: any) => d.successRate < 0.6);
    if (weakAreas.length > 0) {
      recommendations.push({
        type: 'DIFFICULTY',
        priority: 'MEDIUM',
        message: '특정 난이도에서 성과가 저조합니다. 단계적 학습을 권장합니다.',
        actionItems: [
          `난이도 ${weakAreas.map((w: any) => w.level).join(', ')} 집중 학습`,
          '기초 개념 복습 후 응용 문제 도전',
          '오답노트 활용한 약점 보완'
        ]
      });
    }
    
    return recommendations;
  }
  
  /**
   * 학습 세션을 기록합니다
   */
  static async recordLearningSession(sessionData: Omit<LearningSessionData, 'sessionId'>) {
    return await prisma.learningSession.create({
      data: {
        userId: sessionData.userId,
        sessionStartTime: sessionData.startTime,
        sessionEndTime: sessionData.endTime,
        totalDuration: sessionData.endTime ? 
          Math.round((sessionData.endTime.getTime() - sessionData.startTime.getTime()) / (1000 * 60)) : null,
        problemsAttempted: sessionData.problemsAttempted,
        problemsCorrect: sessionData.problemsCorrect,
        averageResponseTime: sessionData.averageResponseTime,
        focusScore: sessionData.focusScore,
        consistencyScore: sessionData.consistencyScore
      }
    });
  }
  
  /**
   * 사용자의 학습 패턴 요약 정보를 가져옵니다 (빠른 조회용)
   */
  static async getLearningPatternSummary(userId: string) {
    const sevenDaysAgo = new Date();
    sevenDaysAgo.setDate(sevenDaysAgo.getDate() - 7);
    
    const [recentProgress, recentSessions, upcomingReviews] = await Promise.all([
      prisma.learningProgress.findMany({
        where: {
          userId,
          createdAt: { gte: sevenDaysAgo }
        }
      }),
      prisma.learningSession.findMany({
        where: {
          userId,
          sessionStartTime: { gte: sevenDaysAgo }
        }
      }),
      prisma.reviewSchedule.findMany({
        where: {
          userId,
          status: ReviewStatus.SCHEDULED,
          scheduledAt: {
            gte: new Date(),
            lte: new Date(Date.now() + 24 * 60 * 60 * 1000) // 다음 24시간
          }
        }
      })
    ]);
    
    const totalProblems = recentProgress.reduce((sum, p) => sum + p.attemptsCount, 0);
    const correctProblems = recentProgress.filter(p => p.score && p.maxScore && p.score >= p.maxScore * 0.7).length;
    const weeklySuccessRate = totalProblems > 0 ? correctProblems / totalProblems : 0;
    const weeklyStudyTime = recentSessions.reduce((sum, s) => sum + (s.totalDuration || 0), 0);
    const avgFocusScore = recentSessions
      .filter(s => s.focusScore)
      .reduce((sum, s) => sum + (s.focusScore || 0), 0) / Math.max(1, recentSessions.filter(s => s.focusScore).length);
    
    return {
      userId,
      weeklyStats: {
        successRate: weeklySuccessRate,
        studyTime: weeklyStudyTime,
        avgFocusScore: avgFocusScore || 0,
        sessionsCount: recentSessions.length
      },
      upcomingReviews: upcomingReviews.length,
      lastAnalysisDate: new Date()
    };
  }
}

export default LearningPatternService;