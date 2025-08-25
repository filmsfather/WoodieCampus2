import { PrismaClient } from "@prisma/client"
import { 
  DifficultyFeedback,
  ProblemDifficultyFeedback,
  DynamicDifficultyAdjustment,
  PersonalizedDifficultyProfile 
} from '../types/common.js';
import { logger } from '../config/logger.js';

const prisma = new PrismaClient();

export interface DifficultyPredictionInput {
  userId: string;
  problemId?: string;
  currentDifficulty: number;
  responseTime?: number;
  isCorrect?: boolean;
  sessionId?: string;
  contextFactors?: {
    timeOfDay?: number;
    deviceType?: string;
    previousPerformance?: number[];
  };
}

export interface DifficultyPredictionResult {
  predictedDifficulty: number;
  confidence: number; // 0.0-1.0
  adjustmentReason: string;
  recommendedAction: 'MAINTAIN' | 'INCREASE' | 'DECREASE' | 'PERSONALIZE';
  factors: {
    userProfile: number;
    feedbackHistory: number;
    contextualFactors: number;
    globalTrends: number;
  };
}

export interface FeedbackSubmission {
  userId: string;
  problemId: string;
  feedback: DifficultyFeedback;
  responseTime?: number;
  isCorrect?: boolean;
  sessionId?: string;
  deviceType?: string;
}

export interface DifficultyAdjustmentInput {
  problemId: string;
  adjustmentValue: number;
  triggerUserId?: string;
  reason?: string;
  feedbackSummary?: any;
}

export interface UserProfileUpdateInput {
  recentFeedback?: DifficultyFeedback;
  responseTime?: number;
  isCorrect?: boolean;
}

/**
 * 적응형 난이도 조정 시스템
 */
export class AdaptiveDifficultyService {
  
  // Prisma client 노출
  static get prisma() {
    return prisma;
  }

  /**
   * 사용자 피드백을 기반으로 난이도를 예측합니다
   */
  static async predictDifficulty(input: DifficultyPredictionInput): Promise<DifficultyPredictionResult> {
    const {
      userId,
      problemId,
      currentDifficulty,
      responseTime,
      isCorrect,
      contextFactors
    } = input;

    // 1. 개인 프로필 가져오기 또는 생성
    const userProfile = await this.getOrCreateUserProfile(userId);

    // 2. 문제별 피드백 히스토리 분석
    const feedbackAnalysis = problemId ? 
      await this.analyzeProblemFeedback(problemId, userId) : 
      { averageFeedback: 0, totalFeedbacks: 0, retryRate: 0 };

    // 3. 사용자의 최근 학습 패턴 분석
    const userPatternAnalysis = await this.analyzeUserLearningPattern(userId);

    // 4. 전역 난이도 트렌드 분석
    const globalTrends = problemId ? 
      await this.analyzeGlobalDifficultyTrends(problemId) : 
      { averageDifficulty: currentDifficulty, adjustmentTrend: 0 };

    // 5. 난이도 예측 알고리즘 실행
    const prediction = this.calculateDifficultyPrediction({
      currentDifficulty,
      userProfile,
      feedbackAnalysis,
      userPatternAnalysis,
      globalTrends,
      responseTime,
      isCorrect,
      contextFactors
    });

    return prediction;
  }

  /**
   * 사용자 피드백을 처리하고 저장합니다
   */
  static async submitFeedback(feedback: FeedbackSubmission): Promise<ProblemDifficultyFeedback> {
    const {
      userId,
      problemId,
      feedback: feedbackType,
      responseTime,
      isCorrect,
      sessionId,
      deviceType
    } = feedback;

    // 현재 시간대 계산
    const timeOfDay = new Date().getHours();

    // 피드백 저장
    const savedFeedback = await prisma.problemDifficultyFeedback.create({
      data: {
        userId,
        problemId,
        feedback: feedbackType,
        responseTime,
        isCorrect,
        sessionId,
        deviceType,
        timeOfDay,
        submittedAt: new Date()
      }
    });

    // 사용자 프로필 업데이트
    await this.updateUserProfileFromFeedback(userId, feedbackType, responseTime);

    // 실시간 난이도 조정 트리거
    if (await this.shouldTriggerDifficultyAdjustment(problemId)) {
      await this.triggerDifficultyAdjustment(problemId);
    }

    logger.info(`Difficulty feedback submitted: User ${userId}, Problem ${problemId}, Feedback: ${feedbackType}`);
    
    return savedFeedback;
  }

  /**
   * 사용자 개인화 프로필을 가져오거나 생성합니다
   */
  private static async getOrCreateUserProfile(userId: string): Promise<PersonalizedDifficultyProfile> {
    let profile = await prisma.personalizedDifficultyProfile.findUnique({
      where: { userId }
    });

    if (!profile) {
      profile = await prisma.personalizedDifficultyProfile.create({
        data: {
          userId,
          preferredMinDifficulty: 3.0,
          preferredMaxDifficulty: 7.0,
          idealDifficulty: 5.0,
          learningPace: 'MODERATE',
          challengePreference: 'BALANCED',
          frustrationTolerance: 0.5,
          adaptationRate: 0.1,
          stabilityFactor: 0.8
        }
      });
    }

    return profile;
  }

  /**
   * 특정 문제의 피드백 히스토리를 분석합니다
   */
  private static async analyzeProblemFeedback(problemId: string, excludeUserId?: string) {
    const thirtyDaysAgo = new Date();
    thirtyDaysAgo.setDate(thirtyDaysAgo.getDate() - 30);

    const feedbacks = await prisma.problemDifficultyFeedback.findMany({
      where: {
        problemId,
        submittedAt: { gte: thirtyDaysAgo },
        ...(excludeUserId && { userId: { not: excludeUserId } })
      }
    });

    if (feedbacks.length === 0) {
      return { averageFeedback: 0, totalFeedbacks: 0, retryRate: 0 };
    }

    // 피드백을 숫자로 변환 (RETRY=-2, TOO_HARD=-1, JUST_RIGHT=0, TOO_EASY=1)
    const feedbackValues: number[] = feedbacks.map(f => {
      switch (f.feedback) {
        case DifficultyFeedback.RETRY: return -2;
        case DifficultyFeedback.TOO_HARD: return -1;
        case DifficultyFeedback.JUST_RIGHT: return 0;
        case DifficultyFeedback.TOO_EASY: return 1;
        default: return 0;
      }
    });

    const averageFeedback = feedbackValues.reduce((sum, val) => sum + (val as number), 0) / feedbackValues.length;
    const retryCount = feedbacks.filter(f => f.feedback === DifficultyFeedback.RETRY).length;
    const retryRate = retryCount / feedbacks.length;

    return {
      averageFeedback,
      totalFeedbacks: feedbacks.length,
      retryRate
    };
  }

  /**
   * 사용자의 학습 패턴을 분석합니다
   */
  private static async analyzeUserLearningPattern(userId: string) {
    const sevenDaysAgo = new Date();
    sevenDaysAgo.setDate(sevenDaysAgo.getDate() - 7);

    const recentFeedbacks = await prisma.problemDifficultyFeedback.findMany({
      where: {
        userId,
        submittedAt: { gte: sevenDaysAgo }
      },
      orderBy: { submittedAt: 'desc' }
    });

    if (recentFeedbacks.length === 0) {
      return {
        recentPerformanceTrend: 0,
        averageResponseTime: 0,
        frustrationLevel: 0,
        consistencyScore: 0.5
      };
    }

    // 최근 성과 트렌드 계산
    const feedbackTrend = this.calculateFeedbackTrend(recentFeedbacks);
    
    // 평균 응답 시간
    const validResponseTimes = recentFeedbacks.filter(f => f.responseTime !== null).map(f => f.responseTime!);
    const averageResponseTime = validResponseTimes.length > 0 ? 
      validResponseTimes.reduce((sum, time) => sum + time, 0) / validResponseTimes.length : 0;

    // 좌절 레벨 (RETRY, TOO_HARD 피드백 비율)
    const frustrationFeedbacks = recentFeedbacks.filter(
      f => f.feedback === DifficultyFeedback.RETRY || f.feedback === DifficultyFeedback.TOO_HARD
    );
    const frustrationLevel = frustrationFeedbacks.length / recentFeedbacks.length;

    // 일관성 점수 (피드백의 표준편차 역수)
    const consistencyScore = this.calculateConsistencyScore(recentFeedbacks);

    return {
      recentPerformanceTrend: feedbackTrend,
      averageResponseTime,
      frustrationLevel,
      consistencyScore
    };
  }

  /**
   * 전역 난이도 트렌드를 분석합니다
   */
  private static async analyzeGlobalDifficultyTrends(problemId: string) {
    const recentAdjustments = await prisma.dynamicDifficultyAdjustment.findMany({
      where: {
        problemId,
        createdAt: {
          gte: new Date(Date.now() - 7 * 24 * 60 * 60 * 1000) // 최근 7일
        }
      },
      orderBy: { createdAt: 'desc' }
    });

    if (recentAdjustments.length === 0) {
      const problem = await prisma.problem.findUnique({
        where: { id: problemId },
        select: { difficulty: true }
      });
      
      return {
        averageDifficulty: problem?.difficulty || 5,
        adjustmentTrend: 0
      };
    }

    const averageDifficulty = recentAdjustments.reduce(
      (sum, adj) => sum + adj.adjustedDifficulty, 0
    ) / recentAdjustments.length;

    // 조정 트렌드 계산 (최근 조정이 증가/감소 추세인지)
    const adjustmentTrend = recentAdjustments.length >= 2 ? 
      recentAdjustments[0].adjustedDifficulty - recentAdjustments[recentAdjustments.length - 1].adjustedDifficulty : 0;

    return {
      averageDifficulty,
      adjustmentTrend
    };
  }

  /**
   * 난이도 예측 알고리즘의 핵심 계산
   */
  private static calculateDifficultyPrediction(params: {
    currentDifficulty: number;
    userProfile: PersonalizedDifficultyProfile;
    feedbackAnalysis: any;
    userPatternAnalysis: any;
    globalTrends: any;
    responseTime?: number;
    isCorrect?: boolean;
    contextFactors?: any;
  }): DifficultyPredictionResult {

    const {
      currentDifficulty,
      userProfile,
      feedbackAnalysis,
      userPatternAnalysis,
      globalTrends,
      responseTime,
      isCorrect
    } = params;

    let predictedDifficulty = currentDifficulty;
    let adjustmentReason = 'No adjustment needed';
    let recommendedAction: DifficultyPredictionResult['recommendedAction'] = 'MAINTAIN';

    // 1. 사용자 프로필 기반 조정 (가중치: 0.4)
    const profileFactor = this.calculateProfileFactor(userProfile, currentDifficulty);
    
    // 2. 피드백 히스토리 기반 조정 (가중치: 0.3)
    const feedbackFactor = this.calculateFeedbackFactor(feedbackAnalysis);
    
    // 3. 사용자 패턴 기반 조정 (가중치: 0.2)
    const patternFactor = this.calculatePatternFactor(userPatternAnalysis, responseTime, isCorrect);
    
    // 4. 전역 트렌드 기반 조정 (가중치: 0.1)
    const trendFactor = this.calculateTrendFactor(globalTrends);

    // 가중 평균으로 최종 난이도 계산
    const adjustmentWeight = (
      profileFactor * 0.4 +
      feedbackFactor * 0.3 +
      patternFactor * 0.2 +
      trendFactor * 0.1
    );

    predictedDifficulty = Math.max(1, Math.min(10, currentDifficulty + adjustmentWeight));

    // 조정 크기에 따른 액션 결정
    const adjustmentSize = Math.abs(predictedDifficulty - currentDifficulty);
    
    if (adjustmentSize < 0.1) {
      recommendedAction = 'MAINTAIN';
      adjustmentReason = 'Current difficulty is optimal';
    } else if (predictedDifficulty > currentDifficulty) {
      recommendedAction = adjustmentSize > 1 ? 'INCREASE' : 'PERSONALIZE';
      adjustmentReason = 'User can handle higher difficulty';
    } else {
      recommendedAction = adjustmentSize > 1 ? 'DECREASE' : 'PERSONALIZE';
      adjustmentReason = 'Current difficulty may be too challenging';
    }

    // 신뢰도 계산 (데이터가 많을수록 높은 신뢰도)
    const confidence = Math.min(0.95, 0.5 + (feedbackAnalysis.totalFeedbacks * 0.05));

    return {
      predictedDifficulty: Math.round(predictedDifficulty * 10) / 10, // 소수점 1자리
      confidence,
      adjustmentReason,
      recommendedAction,
      factors: {
        userProfile: profileFactor,
        feedbackHistory: feedbackFactor,
        contextualFactors: patternFactor,
        globalTrends: trendFactor
      }
    };
  }

  /**
   * 사용자 프로필 기반 조정 계수 계산
   */
  private static calculateProfileFactor(profile: PersonalizedDifficultyProfile, currentDifficulty: number): number {
    const idealDiff = profile.idealDifficulty - currentDifficulty;
    const adaptationRate = profile.adaptationRate;
    const stabilityFactor = profile.stabilityFactor;

    // 이상적 난이도와의 차이에 적응률을 적용하고 안정성 계수로 조정
    return idealDiff * adaptationRate * stabilityFactor;
  }

  /**
   * 피드백 히스토리 기반 조정 계수 계산
   */
  private static calculateFeedbackFactor(analysis: any): number {
    const { averageFeedback, retryRate, totalFeedbacks } = analysis;
    
    if (totalFeedbacks === 0) return 0;

    // 피드백이 음수(어려움)면 난이도 감소, 양수(쉬움)면 증가
    let adjustment = averageFeedback * 0.5;

    // 재시도율이 높으면 추가로 난이도 감소
    if (retryRate > 0.3) {
      adjustment -= retryRate;
    }

    return adjustment;
  }

  /**
   * 사용자 패턴 기반 조정 계수 계산
   */
  private static calculatePatternFactor(
    patternAnalysis: any, 
    responseTime?: number, 
    isCorrect?: boolean
  ): number {
    const { recentPerformanceTrend, frustrationLevel, averageResponseTime } = patternAnalysis;
    
    let adjustment = 0;

    // 최근 성과 트렌드 반영
    adjustment += recentPerformanceTrend * 0.3;

    // 좌절 레벨이 높으면 난이도 감소
    if (frustrationLevel > 0.4) {
      adjustment -= frustrationLevel * 0.5;
    }

    // 현재 응답 시간이 평균보다 빠르고 정답이면 난이도 증가 고려
    if (responseTime && averageResponseTime > 0 && isCorrect) {
      const timeRatio = responseTime / averageResponseTime;
      if (timeRatio < 0.7) { // 30% 빠름
        adjustment += 0.2;
      } else if (timeRatio > 1.3) { // 30% 느림
        adjustment -= 0.2;
      }
    }

    return adjustment;
  }

  /**
   * 전역 트렌드 기반 조정 계수 계산
   */
  private static calculateTrendFactor(trends: any): number {
    const { adjustmentTrend } = trends;
    
    // 전역 트렌드를 약하게 반영 (0.1 배율)
    return adjustmentTrend * 0.1;
  }

  /**
   * 피드백 트렌드 계산
   */
  private static calculateFeedbackTrend(feedbacks: ProblemDifficultyFeedback[]): number {
    if (feedbacks.length < 3) return 0;

    const recentCount = Math.min(5, feedbacks.length);
    const recentFeedbacks = feedbacks.slice(0, recentCount);
    
    const feedbackValues: number[] = recentFeedbacks.map(f => {
      switch (f.feedback) {
        case DifficultyFeedback.RETRY: return -2;
        case DifficultyFeedback.TOO_HARD: return -1;
        case DifficultyFeedback.JUST_RIGHT: return 0;
        case DifficultyFeedback.TOO_EASY: return 1;
        default: return 0;
      }
    });

    // 선형 회귀로 트렌드 계산
    const n = feedbackValues.length;
    const x = Array.from({ length: n }, (_, i) => i);
    const y = feedbackValues;

    const sumX = x.reduce((sum, val) => sum + val, 0);
    const sumY = y.reduce((sum, val) => sum + val, 0);
    const sumXY = x.reduce((sum, val, i) => sum + val * y[i], 0);
    const sumXX = x.reduce((sum, val) => sum + val * val, 0);

    const slope = (n * sumXY - sumX * sumY) / (n * sumXX - sumX * sumX);
    
    return slope;
  }

  /**
   * 일관성 점수 계산
   */
  private static calculateConsistencyScore(feedbacks: ProblemDifficultyFeedback[]): number {
    if (feedbacks.length < 2) return 0.5;

    const feedbackValues: number[] = feedbacks.map(f => {
      switch (f.feedback) {
        case DifficultyFeedback.RETRY: return -2;
        case DifficultyFeedback.TOO_HARD: return -1;
        case DifficultyFeedback.JUST_RIGHT: return 0;
        case DifficultyFeedback.TOO_EASY: return 1;
        default: return 0;
      }
    });

    const mean = feedbackValues.reduce((sum, val) => sum + (val as number), 0) / feedbackValues.length;
    const variance = feedbackValues.reduce((sum, val) => sum + Math.pow((val as number) - mean, 2), 0) / feedbackValues.length;
    const standardDeviation = Math.sqrt(variance);

    // 표준편차가 낮을수록 일관성이 높음 (0-1 스케일로 정규화)
    return Math.max(0, 1 - standardDeviation / 2);
  }

  /**
   * 사용자 프로필을 피드백으로부터 업데이트
   */
  private static async updateUserProfileFromFeedback(
    userId: string, 
    feedback: DifficultyFeedback, 
    responseTime?: number
  ): Promise<void> {
    const profile = await prisma.personalizedDifficultyProfile.findUnique({
      where: { userId }
    });

    if (!profile) return;

    // 피드백에 따른 이상적 난이도 조정
    let idealDifficultyAdjustment = 0;
    
    switch (feedback) {
      case DifficultyFeedback.TOO_EASY:
        idealDifficultyAdjustment = 0.1;
        break;
      case DifficultyFeedback.JUST_RIGHT:
        // 현재 난이도가 적절함 - 조정 없음
        break;
      case DifficultyFeedback.TOO_HARD:
        idealDifficultyAdjustment = -0.1;
        break;
      case DifficultyFeedback.RETRY:
        idealDifficultyAdjustment = -0.2;
        break;
    }

    const newIdealDifficulty = Math.max(1, Math.min(10, 
      profile.idealDifficulty + idealDifficultyAdjustment * profile.adaptationRate
    ));

    // 좌절 내성 조정
    let frustrationToleranceAdjustment = 0;
    if (feedback === DifficultyFeedback.RETRY) {
      frustrationToleranceAdjustment = -0.01; // 재시도 시 좌절 내성 감소
    } else if (feedback === DifficultyFeedback.TOO_EASY) {
      frustrationToleranceAdjustment = 0.01; // 쉬운 문제 시 좌절 내성 증가
    }

    const newFrustrationTolerance = Math.max(0, Math.min(1, 
      profile.frustrationTolerance + frustrationToleranceAdjustment
    ));

    // 프로필 업데이트
    await prisma.personalizedDifficultyProfile.update({
      where: { userId },
      data: {
        idealDifficulty: newIdealDifficulty,
        frustrationTolerance: newFrustrationTolerance,
        totalFeedbacks: profile.totalFeedbacks + 1,
        lastFeedbackAt: new Date()
      }
    });
  }

  /**
   * 난이도 조정이 필요한지 확인
   */
  private static async shouldTriggerDifficultyAdjustment(problemId: string): Promise<boolean> {
    const recentFeedbacks = await prisma.problemDifficultyFeedback.findMany({
      where: {
        problemId,
        submittedAt: {
          gte: new Date(Date.now() - 24 * 60 * 60 * 1000) // 최근 24시간
        }
      }
    });

    // 최소 5개의 피드백이 있고, 80% 이상이 TOO_HARD 또는 RETRY인 경우
    if (recentFeedbacks.length >= 5) {
      const negitiveFeedbacks = recentFeedbacks.filter(
        f => f.feedback === DifficultyFeedback.TOO_HARD || f.feedback === DifficultyFeedback.RETRY
      );
      
      if (negitiveFeedbacks.length / recentFeedbacks.length >= 0.8) {
        return true;
      }
    }

    // 최근 조정이 24시간 이내에 없었다면 고려
    const recentAdjustment = await prisma.dynamicDifficultyAdjustment.findFirst({
      where: {
        problemId,
        createdAt: {
          gte: new Date(Date.now() - 24 * 60 * 60 * 1000)
        }
      }
    });

    return !recentAdjustment;
  }

  /**
   * 실제 난이도 조정을 실행
   */
  private static async triggerDifficultyAdjustment(problemId: string): Promise<void> {
    const problem = await prisma.problem.findUnique({
      where: { id: problemId }
    });

    if (!problem) return;

    // 최근 피드백 분석
    const feedbackAnalysis = await this.analyzeProblemFeedback(problemId);
    
    if (feedbackAnalysis.totalFeedbacks === 0) return;

    const originalDifficulty = problem.difficulty;
    let adjustedDifficulty = originalDifficulty;
    let adjustmentReason = '';

    // 피드백에 따른 조정
    if (feedbackAnalysis.averageFeedback < -0.5) {
      // 너무 어렵다는 피드백이 많음
      adjustedDifficulty = Math.max(1, originalDifficulty - 1);
      adjustmentReason = 'Too many "too hard" feedbacks';
    } else if (feedbackAnalysis.averageFeedback > 0.5) {
      // 너무 쉽다는 피드백이 많음
      adjustedDifficulty = Math.min(10, originalDifficulty + 1);
      adjustmentReason = 'Too many "too easy" feedbacks';
    }

    if (adjustedDifficulty !== originalDifficulty) {
      // 문제 난이도 업데이트
      await prisma.problem.update({
        where: { id: problemId },
        data: { difficulty: adjustedDifficulty }
      });

      // 조정 기록 저장
      await prisma.dynamicDifficultyAdjustment.create({
        data: {
          problemId,
          originalDifficulty,
          adjustedDifficulty,
          adjustmentReason,
          adjustmentFactor: Math.abs(adjustedDifficulty - originalDifficulty) / originalDifficulty,
          adjustmentValue: adjustedDifficulty - originalDifficulty,
          reason: adjustmentReason,
          feedbackCount: feedbackAnalysis.totalFeedbacks,
          retryRate: feedbackAnalysis.retryRate,
          averageResponseTime: null,
          successRate: null,
          feedbackSummary: null,
          triggerUserId: null,
          isPersonalized: false
        }
      });

      logger.info(`Difficulty adjusted for problem ${problemId}: ${originalDifficulty} → ${adjustedDifficulty}`);
    }
  }

  /**
   * 개인별 맞춤 문제 추천
   */
  static async getPersonalizedProblems(
    userId: string, 
    categoryId?: string, 
    limit: number = 10
  ): Promise<any[]> {
    const userProfile = await this.getOrCreateUserProfile(userId);
    
    // 사용자의 이상적 난이도 범위 계산
    const minDifficulty = Math.max(1, userProfile.idealDifficulty - 1);
    const maxDifficulty = Math.min(10, userProfile.idealDifficulty + 1);

    // 문제 검색 쿼리
    const whereClause: any = {
      difficulty: {
        gte: minDifficulty,
        lte: maxDifficulty
      },
      isActive: true,
      isPublic: true
    };

    if (categoryId) {
      whereClause.categoryId = categoryId;
    }

    const problems = await prisma.problem.findMany({
      where: whereClause,
      include: {
        difficultyFeedbacks: {
          where: { userId },
          orderBy: { submittedAt: 'desc' },
          take: 1
        },
        difficultyAdjustments: {
          where: { userId },
          orderBy: { createdAt: 'desc' },
          take: 1
        }
      },
      take: limit * 2 // 여유있게 가져와서 필터링
    });

    // 개인화 점수 계산 후 정렬
    const scoredProblems = problems.map(problem => {
      const personalizedScore = this.calculatePersonalizedScore(problem, userProfile);
      return { ...problem, personalizedScore };
    });

    // 점수 순으로 정렬 후 상위 항목 반환
    return scoredProblems
      .sort((a, b) => b.personalizedScore - a.personalizedScore)
      .slice(0, limit);
  }

  /**
   * 개인화 점수 계산
   */
  private static calculatePersonalizedScore(problem: any, userProfile: PersonalizedDifficultyProfile): number {
    let score = 100; // 기본 점수

    // 1. 난이도 적합성 (가중치: 40%)
    const difficultyGap = Math.abs(problem.difficulty - userProfile.idealDifficulty);
    score += (5 - difficultyGap) * 8; // 차이가 적을수록 높은 점수

    // 2. 최근 피드백 고려 (가중치: 30%)
    if (problem.difficultyFeedbacks.length > 0) {
      const lastFeedback = problem.difficultyFeedbacks[0];
      const daysSinceLastFeedback = (Date.now() - lastFeedback.submittedAt.getTime()) / (1000 * 60 * 60 * 24);
      
      if (daysSinceLastFeedback < 7) {
        // 최근에 푼 문제는 점수 감소
        score -= 30;
      } else if (lastFeedback.feedback === DifficultyFeedback.JUST_RIGHT) {
        // 적절했던 문제는 점수 증가
        score += 20;
      }
    }

    // 3. 개인별 조정 히스토리 (가중치: 20%)
    if (problem.difficultyAdjustments.length > 0) {
      const lastAdjustment = problem.difficultyAdjustments[0];
      if (lastAdjustment.isPersonalized) {
        score += 15; // 개인화된 조정이 있었던 문제 선호
      }
    }

    // 4. 학습 성향 고려 (가중치: 10%)
    if (userProfile.challengePreference === 'CHALLENGING' && problem.difficulty >= 7) {
      score += 10;
    } else if (userProfile.challengePreference === 'EASY' && problem.difficulty <= 4) {
      score += 10;
    }

    return Math.max(0, score);
  }

  /**
   * 사용자 프로필 업데이트
   */
  static async updateUserProfile(userId: string, updateInput: UserProfileUpdateInput): Promise<void> {
    try {
      const profile = await this.getOrCreateUserProfile(userId);
      
      // 최근 성과 업데이트
      if (updateInput.isCorrect !== undefined) {
        const existingPerformance = profile.recentPerformance as number[] || [];
        const recentPerformance = [...existingPerformance, updateInput.isCorrect ? 1 : 0];
        
        // 최근 20개만 유지
        if (recentPerformance.length > 20) {
          recentPerformance.shift();
        }
        
        const successRate = recentPerformance.reduce((sum, val) => sum + val, 0) / recentPerformance.length;
        
        await prisma.personalizedDifficultyProfile.update({
          where: { userId },
          data: {
            recentPerformance,
            updatedAt: new Date()
          }
        });
        
        // 이상적 난이도 조정
        if (successRate > 0.8) {
          // 성공률이 높으면 난이도 상승
          const newIdealDifficulty = Math.min(10, profile.idealDifficulty + 0.1);
          await prisma.personalizedDifficultyProfile.update({
            where: { userId },
            data: { idealDifficulty: newIdealDifficulty }
          });
        } else if (successRate < 0.4) {
          // 성공률이 낮으면 난이도 하락
          const newIdealDifficulty = Math.max(1, profile.idealDifficulty - 0.1);
          await prisma.personalizedDifficultyProfile.update({
            where: { userId },
            data: { idealDifficulty: newIdealDifficulty }
          });
        }
      }
      
      logger.info(`User profile updated: ${userId}`);
    } catch (error) {
      logger.error('Failed to update user profile:', error);
      throw error;
    }
  }

  /**
   * 난이도 조정 실행
   */
  static async adjustDifficulty(input: DifficultyAdjustmentInput): Promise<DynamicDifficultyAdjustment> {
    try {
      const { problemId, adjustmentValue, triggerUserId, reason, feedbackSummary } = input;
      
      // 문제의 현재 난이도 확인
      const problem = await prisma.problem.findUnique({
        where: { id: problemId },
        select: { difficulty: true }
      });

      if (!problem) {
        throw new Error('Problem not found');
      }

      // 조정 레코드 생성
      const adjustment = await prisma.dynamicDifficultyAdjustment.create({
        data: {
          problemId,
          originalDifficulty: problem.difficulty,
          adjustedDifficulty: problem.difficulty + adjustmentValue,
          adjustmentReason: reason || 'API adjustment',
          adjustmentFactor: Math.abs(adjustmentValue) / problem.difficulty,
          adjustmentValue,
          reason: reason || 'Manual adjustment',
          triggerUserId,
          isPersonalized: !!triggerUserId,
          feedbackSummary: feedbackSummary ? JSON.stringify(feedbackSummary) : null,
          feedbackCount: 0,
          averageResponseTime: null,
          successRate: null,
          retryRate: null
        }
      });

      logger.info(`Difficulty adjustment created: Problem ${problemId}, Value: ${adjustmentValue}`);
      
      return adjustment;
    } catch (error) {
      logger.error('Failed to adjust difficulty:', error);
      throw error;
    }
  }
}

export default AdaptiveDifficultyService;