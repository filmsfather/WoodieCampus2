import { PrismaClient } from "@prisma/client"
import { DifficultyFeedback } from '../types/common.js';
import AdaptiveDifficultyService from './adaptiveDifficultyService.js';
import AdaptiveDifficultyCache from './adaptiveDifficultyCache.js';
import { LearningPatternService } from './learningPatternService.js';
import { logger } from '../config/logger.js';

const prisma = new PrismaClient();

export interface SmartRecommendationInput {
  userId: string;
  categoryId?: string;
  currentSessionTime?: number; // 현재 세션 시간 (분)
  recentPerformance?: {
    correctAnswers: number;
    totalAttempted: number;
    averageResponseTime: number;
  };
  learningGoals?: {
    targetDifficulty?: number;
    timeConstraint?: number; // 분
    focusAreas?: string[];
  };
  contextFactors?: {
    timeOfDay?: number;
    deviceType?: string;
    studyMode?: 'REVIEW' | 'LEARN_NEW' | 'CHALLENGE';
  };
}

export interface SmartRecommendation {
  problemId: string;
  title: string;
  predictedDifficulty: number;
  personalizedScore: number;
  estimatedTime: number; // 예상 소요 시간 (분)
  recommendationReason: string;
  confidenceLevel: number; // 0-1
  learningBenefits: string[];
  metadata: {
    originalDifficulty: number;
    categoryName: string;
    questionType: string;
    tags: string[];
    lastAttemptedAt?: Date;
    previousFeedback?: DifficultyFeedback;
  };
}

export interface RecommendationStrategy {
  name: string;
  weight: number;
  description: string;
}

/**
 * 고도화된 개인별 문제 추천 시스템
 */
export class SmartRecommendationService {
  
  // 추천 전략별 가중치
  private static readonly STRATEGIES: Record<string, RecommendationStrategy> = {
    DIFFICULTY_MATCHING: {
      name: 'Difficulty Matching',
      weight: 0.3,
      description: '사용자의 현재 실력에 맞는 난이도'
    },
    LEARNING_PATTERN: {
      name: 'Learning Pattern',
      weight: 0.25,
      description: '개인 학습 패턴 기반 추천'
    },
    SPACED_REPETITION: {
      name: 'Spaced Repetition',
      weight: 0.2,
      description: '망각곡선 기반 복습 최적화'
    },
    KNOWLEDGE_GAP: {
      name: 'Knowledge Gap',
      weight: 0.15,
      description: '약점 보완을 위한 추천'
    },
    CONTEXTUAL: {
      name: 'Contextual',
      weight: 0.1,
      description: '현재 상황 및 목표 기반'
    }
  };
  
  /**
   * 스마트 문제 추천을 생성합니다
   */
  static async generateSmartRecommendations(
    input: SmartRecommendationInput,
    limit: number = 10
  ): Promise<SmartRecommendation[]> {
    
    const { userId, categoryId, contextFactors } = input;
    
    // 1. 캐시된 추천이 있는지 확인
    const cachedRecommendations = await AdaptiveDifficultyCache.getPersonalizedRecommendations(
      userId, 
      categoryId || null
    );
    
    if (cachedRecommendations && this.isCacheValid(cachedRecommendations)) {
      logger.info(`Using cached recommendations for user ${userId}`);
      return cachedRecommendations.recommendations.slice(0, limit);
    }
    
    // 2. 사용자 학습 패턴 분석
    const learningPattern = await LearningPatternService.getLearningPatternSummary(userId);
    
    // 3. 사용자 난이도 프로필 가져오기
    const userProfile = await AdaptiveDifficultyService['getOrCreateUserProfile'](userId);
    
    // 4. 후보 문제들 가져오기
    const candidateProblems = await this.getCandidateProblems(userId, categoryId, limit * 3);
    
    // 5. 각 전략별로 점수 계산
    const scoredProblems = await Promise.all(
      candidateProblems.map(problem => this.calculateComprehensiveScore(
        problem, 
        userId, 
        input, 
        learningPattern, 
        userProfile
      ))
    );
    
    // 6. 다양성을 고려한 최종 선별
    const diversifiedRecommendations = this.diversifyRecommendations(scoredProblems, limit);
    
    // 7. 추천 결과 캐시
    await AdaptiveDifficultyCache.cachePersonalizedRecommendations(
      userId,
      categoryId || null,
      diversifiedRecommendations.map(r => ({
        problemId: r.problemId,
        predictedDifficulty: r.predictedDifficulty,
        personalizedScore: r.personalizedScore,
        recommendationReason: r.recommendationReason,
        estimatedCompletionTime: r.estimatedTime
      }))
    );
    
    logger.info(`Generated ${diversifiedRecommendations.length} smart recommendations for user ${userId}`);
    
    return diversifiedRecommendations;
  }
  
  /**
   * 후보 문제들을 가져옵니다
   */
  private static async getCandidateProblems(userId: string, categoryId?: string, limit: number = 30) {
    // 최근 푼 문제들 제외
    const recentlyAttempted = await prisma.problemDifficultyFeedback.findMany({
      where: {
        userId,
        submittedAt: {
          gte: new Date(Date.now() - 7 * 24 * 60 * 60 * 1000) // 최근 7일
        }
      },
      select: { problemId: true }
    });
    
    const excludeProblemIds = recentlyAttempted.map(r => r.problemId);
    
    // 문제 검색 조건
    const whereClause: any = {
      isActive: true,
      isPublic: true,
      id: { notIn: excludeProblemIds }
    };
    
    if (categoryId) {
      whereClause.categoryId = categoryId;
    }
    
    return await prisma.problem.findMany({
      where: whereClause,
      include: {
        category: true,
        problemTags: {
          include: { tag: true }
        },
        difficultyFeedbacks: {
          where: { userId },
          orderBy: { submittedAt: 'desc' },
          take: 1
        },
        difficultyAdjustments: {
          orderBy: { createdAt: 'desc' },
          take: 1
        },
        learningProgress: {
          where: { userId },
          orderBy: { updatedAt: 'desc' },
          take: 1
        }
      },
      take: limit,
      orderBy: [
        { createdAt: 'desc' }, // 최신 문제 우선
        { difficulty: 'asc' }   // 난이도 오름차순
      ]
    });
  }
  
  /**
   * 종합적인 추천 점수를 계산합니다
   */
  private static async calculateComprehensiveScore(
    problem: any,
    userId: string,
    input: SmartRecommendationInput,
    learningPattern: any,
    userProfile: any
  ): Promise<SmartRecommendation> {
    
    // 각 전략별 점수 계산
    const difficultyScore = await this.calculateDifficultyMatchingScore(problem, userProfile);
    const patternScore = this.calculateLearningPatternScore(problem, learningPattern, input);
    const repetitionScore = await this.calculateSpacedRepetitionScore(problem, userId);
    const knowledgeGapScore = this.calculateKnowledgeGapScore(problem, learningPattern);
    const contextualScore = this.calculateContextualScore(problem, input);
    
    // 가중 평균으로 최종 점수 계산
    const personalizedScore = (
      difficultyScore * this.STRATEGIES.DIFFICULTY_MATCHING.weight +
      patternScore * this.STRATEGIES.LEARNING_PATTERN.weight +
      repetitionScore * this.STRATEGIES.SPACED_REPETITION.weight +
      knowledgeGapScore * this.STRATEGIES.KNOWLEDGE_GAP.weight +
      contextualScore * this.STRATEGIES.CONTEXTUAL.weight
    );
    
    // 난이도 예측
    const difficultyPrediction = await AdaptiveDifficultyService.predictDifficulty({
      userId,
      problemId: problem.id,
      currentDifficulty: problem.difficulty
    });
    
    // 추천 이유 생성
    const recommendationReason = this.generateRecommendationReason(
      problem,
      { difficultyScore, patternScore, repetitionScore, knowledgeGapScore, contextualScore }
    );
    
    // 학습 효과 예측
    const learningBenefits = this.predictLearningBenefits(problem, learningPattern);
    
    // 소요 시간 예상
    const estimatedTime = this.estimateCompletionTime(problem, learningPattern);
    
    return {
      problemId: problem.id,
      title: problem.title,
      predictedDifficulty: difficultyPrediction.predictedDifficulty,
      personalizedScore,
      estimatedTime,
      recommendationReason,
      confidenceLevel: difficultyPrediction.confidence,
      learningBenefits,
      metadata: {
        originalDifficulty: problem.difficulty,
        categoryName: problem.category?.name || 'Unknown',
        questionType: problem.questionType,
        tags: problem.problemTags?.map((pt: any) => pt.tag.name) || [],
        lastAttemptedAt: problem.learningProgress[0]?.updatedAt,
        previousFeedback: problem.difficultyFeedbacks[0]?.feedback
      }
    };
  }
  
  /**
   * 난이도 매칭 점수 계산
   */
  private static async calculateDifficultyMatchingScore(problem: any, userProfile: any): Promise<number> {
    const difficultyGap = Math.abs(problem.difficulty - userProfile.idealDifficulty);
    
    // 이상적 난이도와의 차이가 적을수록 높은 점수
    let score = Math.max(0, 100 - difficultyGap * 15);
    
    // 사용자의 도전 선호도 반영
    if (userProfile.challengePreference === 'CHALLENGING' && problem.difficulty > userProfile.idealDifficulty) {
      score += 10;
    } else if (userProfile.challengePreference === 'EASY' && problem.difficulty < userProfile.idealDifficulty) {
      score += 10;
    }
    
    // 좌절 내성 고려
    if (problem.difficulty > userProfile.idealDifficulty + 1 && userProfile.frustrationTolerance < 0.3) {
      score -= 20;
    }
    
    return Math.max(0, Math.min(100, score));
  }
  
  /**
   * 학습 패턴 기반 점수 계산
   */
  private static calculateLearningPatternScore(
    problem: any, 
    learningPattern: any, 
    input: SmartRecommendationInput
  ): number {
    let score = 50; // 기본 점수
    
    // 최근 성과에 따른 조정
    if (input.recentPerformance) {
      const recentSuccessRate = input.recentPerformance.correctAnswers / input.recentPerformance.totalAttempted;
      
      if (recentSuccessRate > 0.8) {
        // 최근 성과가 좋으면 약간 더 어려운 문제 추천
        if (problem.difficulty >= 6) score += 15;
      } else if (recentSuccessRate < 0.5) {
        // 최근 성과가 나쁘면 더 쉬운 문제 추천
        if (problem.difficulty <= 4) score += 15;
      }
    }
    
    // 문제 유형별 선호도 (학습 패턴에서 강점/약점 분석)
    if (learningPattern?.questionTypePerformance) {
      const typePerformance = learningPattern.questionTypePerformance.find(
        (qtp: any) => qtp.type === problem.questionType
      );
      
      if (typePerformance) {
        if (typePerformance.strengthLevel === 'WEAK') {
          score += 20; // 약점 보완을 위해 높은 점수
        } else if (typePerformance.strengthLevel === 'STRONG') {
          score += 5;  // 강점 유지를 위해 낮은 점수
        }
      }
    }
    
    // 집중도가 높은 시간대 고려
    if (input.contextFactors?.timeOfDay && learningPattern?.focusAnalysis?.bestFocusTimes) {
      const currentHour = input.contextFactors.timeOfDay;
      const isBestFocusTime = learningPattern.focusAnalysis.bestFocusTimes.some(
        (time: string) => parseInt(time.split(':')[0]) === currentHour
      );
      
      if (isBestFocusTime && problem.difficulty >= 6) {
        score += 10; // 집중도 높은 시간에는 어려운 문제
      }
    }
    
    return Math.max(0, Math.min(100, score));
  }
  
  /**
   * 간격 반복 학습 점수 계산
   */
  private static async calculateSpacedRepetitionScore(problem: any, userId: string): Promise<number> {
    // 망각곡선 기반 복습 우선순위 확인
    const reviewSchedules = await prisma.reviewSchedule.findMany({
      where: {
        userId,
        problemId: problem.id,
        status: 'SCHEDULED'
      },
      orderBy: { scheduledAt: 'asc' },
      take: 1
    });
    
    if (reviewSchedules.length === 0) {
      return 30; // 새로운 문제는 중간 점수
    }
    
    const schedule = reviewSchedules[0];
    const now = new Date();
    const scheduledTime = new Date(schedule.scheduledAt);
    
    // 복습 예정 시간이 지났으면 높은 점수
    if (now >= scheduledTime) {
      const hoursOverdue = (now.getTime() - scheduledTime.getTime()) / (1000 * 60 * 60);
      return Math.min(100, 70 + hoursOverdue * 2);
    }
    
    // 복습 예정 시간이 가까우면 중간 점수
    const hoursUntilDue = (scheduledTime.getTime() - now.getTime()) / (1000 * 60 * 60);
    if (hoursUntilDue <= 24) {
      return 60;
    }
    
    return 20; // 복습 시기가 아직 멀면 낮은 점수
  }
  
  /**
   * 지식 격차 보완 점수 계산
   */
  private static calculateKnowledgeGapScore(problem: any, learningPattern: any): number {
    let score = 50;
    
    // 카테고리별 성과 분석 (카테고리 정보가 있는 경우)
    if (problem.category && learningPattern?.difficultyPerformance) {
      // 해당 카테고리의 성과가 낮으면 우선순위 높임
      const categoryPerformance = learningPattern.difficultyPerformance.find(
        (dp: any) => dp.level === problem.difficulty
      );
      
      if (categoryPerformance && categoryPerformance.successRate < 0.6) {
        score += 25; // 약점 영역이므로 높은 점수
      }
    }
    
    // 태그 기반 약점 분석
    if (problem.problemTags && learningPattern?.questionTypePerformance) {
      const weakTypes = learningPattern.questionTypePerformance.filter(
        (qtp: any) => qtp.strengthLevel === 'WEAK'
      );
      
      const hasWeakTag = problem.problemTags.some((pt: any) => 
        weakTypes.some((wt: any) => wt.type === problem.questionType)
      );
      
      if (hasWeakTag) {
        score += 20;
      }
    }
    
    return Math.max(0, Math.min(100, score));
  }
  
  /**
   * 상황적 요소 점수 계산
   */
  private static calculateContextualScore(problem: any, input: SmartRecommendationInput): number {
    let score = 50;
    
    // 학습 목표 반영
    if (input.learningGoals?.targetDifficulty) {
      const difficultyGap = Math.abs(problem.difficulty - input.learningGoals.targetDifficulty);
      score += Math.max(0, 25 - difficultyGap * 5);
    }
    
    // 시간 제약 고려
    if (input.learningGoals?.timeConstraint) {
      const estimatedTime = problem.estimatedTime || (problem.difficulty * 3); // 임시 추정
      if (estimatedTime <= input.learningGoals.timeConstraint) {
        score += 15;
      } else if (estimatedTime > input.learningGoals.timeConstraint * 1.5) {
        score -= 20;
      }
    }
    
    // 학습 모드 반영
    if (input.contextFactors?.studyMode) {
      switch (input.contextFactors.studyMode) {
        case 'REVIEW':
          // 복습 모드에서는 이전에 푼 문제 유형 선호
          if (problem.learningProgress?.length > 0) score += 20;
          break;
        case 'LEARN_NEW':
          // 새로운 학습 모드에서는 새로운 문제 선호
          if (!problem.learningProgress?.length) score += 20;
          break;
        case 'CHALLENGE':
          // 도전 모드에서는 어려운 문제 선호
          if (problem.difficulty >= 7) score += 25;
          break;
      }
    }
    
    return Math.max(0, Math.min(100, score));
  }
  
  /**
   * 추천 이유를 생성합니다
   */
  private static generateRecommendationReason(problem: any, scores: any): string {
    const reasons = [];
    
    // 가장 높은 점수를 받은 전략 찾기
    const topStrategy = Object.entries(scores).reduce((a, b) => scores[a[0]] > scores[b[0]] ? a : b);
    
    switch (topStrategy[0]) {
      case 'difficultyScore':
        reasons.push('현재 실력에 최적화된 난이도');
        break;
      case 'patternScore':
        reasons.push('개인 학습 패턴에 맞는 문제');
        break;
      case 'repetitionScore':
        reasons.push('복습 최적 타이밍');
        break;
      case 'knowledgeGapScore':
        reasons.push('약점 보완에 도움');
        break;
      case 'contextualScore':
        reasons.push('현재 학습 상황에 적합');
        break;
    }
    
    // 추가 이유들
    if (problem.difficulty >= 7) {
      reasons.push('도전적 난이도로 실력 향상');
    }
    
    if (problem.questionType && scores.patternScore > 70) {
      reasons.push(`${problem.questionType} 유형 집중 연습`);
    }
    
    return reasons.slice(0, 2).join(', ');
  }
  
  /**
   * 학습 효과를 예측합니다
   */
  private static predictLearningBenefits(problem: any, learningPattern: any): string[] {
    const benefits = [];
    
    if (problem.difficulty >= 6) {
      benefits.push('문제 해결 능력 향상');
    }
    
    if (problem.difficulty <= 4) {
      benefits.push('기초 실력 다지기');
    }
    
    // 약점 유형이면
    const weakTypes = learningPattern?.questionTypePerformance?.filter(
      (qtp: any) => qtp.strengthLevel === 'WEAK'
    ) || [];
    
    if (weakTypes.some((wt: any) => wt.type === problem.questionType)) {
      benefits.push('약점 유형 보완');
    }
    
    benefits.push('개인화된 학습 경험');
    
    return benefits.slice(0, 3);
  }
  
  /**
   * 완료 예상 시간을 계산합니다
   */
  private static estimateCompletionTime(problem: any, learningPattern: any): number {
    // 기본 추정: 난이도 * 3분
    let baseTime = problem.difficulty * 3;
    
    // 개인 평균 응답 시간 반영
    if (learningPattern?.weeklyStats?.avgResponseTime) {
      const personalFactor = learningPattern.weeklyStats.avgResponseTime / 30; // 30초 기준
      baseTime *= personalFactor;
    }
    
    // 문제 유형별 조정
    const typeMultipliers: Record<string, number> = {
      'MULTIPLE_CHOICE': 0.8,
      'TRUE_FALSE': 0.6,
      'SHORT_ANSWER': 1.0,
      'ESSAY': 2.0,
      'CODING': 3.0
    };
    
    const multiplier = typeMultipliers[problem.questionType] || 1.0;
    
    return Math.round(baseTime * multiplier);
  }
  
  /**
   * 다양성을 고려한 최종 선별
   */
  private static diversifyRecommendations(
    scoredProblems: SmartRecommendation[], 
    limit: number
  ): SmartRecommendation[] {
    
    // 점수 순으로 정렬
    const sorted = scoredProblems.sort((a, b) => b.personalizedScore - a.personalizedScore);
    
    const selected: SmartRecommendation[] = [];
    const usedDifficulties = new Set<number>();
    const usedTypes = new Set<string>();
    const usedCategories = new Set<string>();
    
    // 다양성을 고려하면서 선별
    for (const problem of sorted) {
      if (selected.length >= limit) break;
      
      const difficulty = Math.round(problem.predictedDifficulty);
      const type = problem.metadata.questionType;
      const category = problem.metadata.categoryName;
      
      // 너무 비슷한 문제들 제한
      const difficultySimilar = usedDifficulties.has(difficulty);
      const typeSimilar = usedTypes.has(type);
      const categorySimilar = usedCategories.has(category);
      
      // 점수가 높거나 다양성을 위해 선택
      if (!difficultySimilar || !typeSimilar || selected.length < limit / 2) {
        selected.push(problem);
        usedDifficulties.add(difficulty);
        usedTypes.add(type);
        usedCategories.add(category);
      }
    }
    
    // 부족한 경우 남은 것으로 채움
    if (selected.length < limit) {
      const remaining = sorted.filter(p => !selected.includes(p));
      selected.push(...remaining.slice(0, limit - selected.length));
    }
    
    return selected;
  }
  
  /**
   * 캐시 유효성 확인
   */
  private static isCacheValid(cachedData: any): boolean {
    const now = new Date();
    const expiresAt = new Date(cachedData.expiresAt);
    return now < expiresAt;
  }
  
  /**
   * 추천 성과 피드백 처리
   */
  static async processFeedbackOnRecommendation(
    userId: string,
    problemId: string,
    wasRecommendationGood: boolean,
    actualDifficulty?: number,
    completionTime?: number
  ): Promise<void> {
    // 추천 성과 데이터 수집 및 알고리즘 개선에 활용
    logger.info(`Recommendation feedback: User ${userId}, Problem ${problemId}, Good: ${wasRecommendationGood}`);
    
    // TODO: 머신러닝 모델 재훈련을 위한 피드백 데이터 저장
  }
}

export default SmartRecommendationService;