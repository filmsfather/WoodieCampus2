import { ForgettingCurveLevel, ReviewStatus } from '@prisma/client';

// 에빙하우스 망각곡선 상수
export const FORGETTING_CURVE_CONSTANTS = {
  // 기본 망각곡선 간격 (분 단위)
  BASE_INTERVALS: {
    [ForgettingCurveLevel.LEVEL_1]: 20,      // 20분
    [ForgettingCurveLevel.LEVEL_2]: 60,      // 1시간  
    [ForgettingCurveLevel.LEVEL_3]: 480,     // 8시간
    [ForgettingCurveLevel.LEVEL_4]: 1440,    // 1일 (24시간)
    [ForgettingCurveLevel.LEVEL_5]: 4320,    // 3일
    [ForgettingCurveLevel.LEVEL_6]: 10080,   // 7일
    [ForgettingCurveLevel.LEVEL_7]: 20160,   // 14일
    [ForgettingCurveLevel.LEVEL_8]: 43200    // 30일
  },
  
  // 기본 기억 유지율 (에빙하우스 곡선 기반)
  BASE_RETENTION_RATES: {
    [ForgettingCurveLevel.LEVEL_1]: 0.58,    // 20분 후 58% 기억
    [ForgettingCurveLevel.LEVEL_2]: 0.44,    // 1시간 후 44% 기억
    [ForgettingCurveLevel.LEVEL_3]: 0.36,    // 8시간 후 36% 기억  
    [ForgettingCurveLevel.LEVEL_4]: 0.33,    // 1일 후 33% 기억
    [ForgettingCurveLevel.LEVEL_5]: 0.28,    // 3일 후 28% 기억
    [ForgettingCurveLevel.LEVEL_6]: 0.25,    // 7일 후 25% 기억
    [ForgettingCurveLevel.LEVEL_7]: 0.21,    // 14일 후 21% 기억
    [ForgettingCurveLevel.LEVEL_8]: 0.18     // 30일 후 18% 기억
  },

  // 성공 시 다음 레벨로의 승격 기준
  SUCCESS_THRESHOLD: 0.8,  // 80% 이상 정답 시 다음 레벨로
  
  // 실패 시 레벨 하락 또는 간격 단축 비율
  FAILURE_PENALTY: 0.5,    // 실패 시 간격을 50%로 단축
  
  // 개인별 조정 범위
  ADJUSTMENT_RANGE: {
    MIN: 0.1,  // 최소 10% 간격
    MAX: 2.0   // 최대 200% 간격
  }
};

export interface ForgettingCurveCalculationResult {
  nextLevel: ForgettingCurveLevel;
  nextScheduleTime: Date;
  adjustedRetentionRate: number;
  recommendedAction: 'ADVANCE' | 'REPEAT' | 'DEMOTE';
}

export interface ReviewPerformanceData {
  isSuccess: boolean;
  responseTime: number;        // 응답 시간 (초)
  confidenceLevel: number;     // 1-5
  difficultyScore?: number;    // 문제 난이도
  userScore?: number;          // 사용자 점수
}

export interface UserForgettingCurveProfile {
  memoryRetentionFactor: number;  // 개인별 기억 유지 계수
  difficultyAdjustment: number;   // 난이도 조정 계수
  successRate: number;            // 전체 복습 성공률
  totalReviews: number;           // 총 복습 횟수
  subjectAdjustments?: Record<string, number>; // 과목별 조정 계수
}

/**
 * 에빙하우스 망각곡선 알고리즘 클래스
 */
export class ForgettingCurveAlgorithm {
  
  /**
   * 다음 복습 시점을 계산합니다
   * @param currentLevel 현재 망각곡선 레벨
   * @param reviewPerformance 복습 성과 데이터
   * @param userProfile 사용자 프로필
   * @param lastReviewTime 마지막 복습 시간
   * @returns 계산 결과
   */
  static calculateNextReview(
    currentLevel: ForgettingCurveLevel,
    reviewPerformance: ReviewPerformanceData,
    userProfile: UserForgettingCurveProfile,
    lastReviewTime: Date = new Date()
  ): ForgettingCurveCalculationResult {
    
    const baseInterval = FORGETTING_CURVE_CONSTANTS.BASE_INTERVALS[currentLevel];
    const baseRetention = FORGETTING_CURVE_CONSTANTS.BASE_RETENTION_RATES[currentLevel];
    
    // 1. 개인별 기억 유지 계수 적용
    const personalAdjustment = userProfile.memoryRetentionFactor;
    
    // 2. 복습 성과에 따른 조정
    const performanceAdjustment = this.calculatePerformanceAdjustment(
      reviewPerformance, 
      userProfile
    );
    
    // 3. 최종 조정된 간격 계산
    const adjustedInterval = Math.round(
      baseInterval * personalAdjustment * performanceAdjustment
    );
    
    // 4. 다음 레벨 결정
    const nextLevel = this.determineNextLevel(currentLevel, reviewPerformance);
    
    // 5. 다음 복습 시간 계산
    const nextScheduleTime = new Date(lastReviewTime.getTime() + adjustedInterval * 60 * 1000);
    
    // 6. 조정된 기억 유지율 계산
    const adjustedRetentionRate = Math.min(
      0.95, 
      baseRetention * personalAdjustment * (reviewPerformance.isSuccess ? 1.2 : 0.8)
    );
    
    // 7. 권장 행동 결정
    const recommendedAction = this.determineRecommendedAction(
      currentLevel, 
      nextLevel, 
      reviewPerformance
    );
    
    return {
      nextLevel,
      nextScheduleTime,
      adjustedRetentionRate,
      recommendedAction
    };
  }
  
  /**
   * 복습 성과에 따른 조정 계수 계산
   */
  private static calculatePerformanceAdjustment(
    performance: ReviewPerformanceData,
    userProfile: UserForgettingCurveProfile
  ): number {
    let adjustment = 1.0;
    
    // 성공/실패에 따른 기본 조정
    if (performance.isSuccess) {
      adjustment *= 1.2; // 성공 시 간격 20% 증가
    } else {
      adjustment *= FORGETTING_CURVE_CONSTANTS.FAILURE_PENALTY;
    }
    
    // 응답 시간에 따른 조정 (빠른 응답 = 높은 확신)
    const responseTimeAdjustment = this.calculateResponseTimeAdjustment(
      performance.responseTime
    );
    adjustment *= responseTimeAdjustment;
    
    // 자신감 레벨에 따른 조정
    const confidenceAdjustment = 0.8 + (performance.confidenceLevel - 1) * 0.1;
    adjustment *= confidenceAdjustment;
    
    // 난이도에 따른 조정
    if (performance.difficultyScore) {
      const difficultyAdjustment = 0.7 + (11 - performance.difficultyScore) * 0.03;
      adjustment *= difficultyAdjustment;
    }
    
    // 개인별 성공률을 반영한 조정
    if (userProfile.successRate > 0) {
      const successRateAdjustment = 0.8 + userProfile.successRate * 0.4;
      adjustment *= successRateAdjustment;
    }
    
    // 조정 범위 제한
    return Math.max(
      FORGETTING_CURVE_CONSTANTS.ADJUSTMENT_RANGE.MIN,
      Math.min(FORGETTING_CURVE_CONSTANTS.ADJUSTMENT_RANGE.MAX, adjustment)
    );
  }
  
  /**
   * 응답 시간에 따른 조정 계수 계산
   */
  private static calculateResponseTimeAdjustment(responseTime: number): number {
    // 응답 시간이 짧을수록 (확신이 높을수록) 간격을 늘림
    if (responseTime <= 3) {
      return 1.3; // 3초 이하: 매우 빠름
    } else if (responseTime <= 10) {
      return 1.1; // 10초 이하: 빠름
    } else if (responseTime <= 30) {
      return 1.0; // 30초 이하: 보통
    } else if (responseTime <= 60) {
      return 0.9; // 60초 이하: 느림
    } else {
      return 0.8; // 60초 초과: 매우 느림
    }
  }
  
  /**
   * 다음 망각곡선 레벨 결정
   */
  private static determineNextLevel(
    currentLevel: ForgettingCurveLevel, 
    performance: ReviewPerformanceData
  ): ForgettingCurveLevel {
    const levelOrder = Object.values(ForgettingCurveLevel);
    const currentIndex = levelOrder.indexOf(currentLevel);
    
    if (performance.isSuccess) {
      // 성공 시: 다음 레벨로 승격 (마지막 레벨이 아닌 경우)
      if (currentIndex < levelOrder.length - 1) {
        // 높은 자신감과 빠른 응답 시 레벨 승격
        if (performance.confidenceLevel >= 4 && performance.responseTime <= 10) {
          return levelOrder[currentIndex + 1];
        }
        // 일반적인 성공의 경우도 레벨 승격
        return levelOrder[currentIndex + 1];
      }
      return currentLevel; // 마지막 레벨 유지
    } else {
      // 실패 시: 레벨 하락 또는 현재 레벨 반복
      if (currentIndex > 0 && performance.confidenceLevel <= 2) {
        // 낮은 자신감과 함께 실패한 경우 레벨 하락
        return levelOrder[currentIndex - 1];
      }
      return currentLevel; // 현재 레벨 반복
    }
  }
  
  /**
   * 권장 행동 결정
   */
  private static determineRecommendedAction(
    currentLevel: ForgettingCurveLevel,
    nextLevel: ForgettingCurveLevel,
    performance: ReviewPerformanceData
  ): 'ADVANCE' | 'REPEAT' | 'DEMOTE' {
    const levelOrder = Object.values(ForgettingCurveLevel);
    const currentIndex = levelOrder.indexOf(currentLevel);
    const nextIndex = levelOrder.indexOf(nextLevel);
    
    if (nextIndex > currentIndex) {
      return 'ADVANCE';
    } else if (nextIndex < currentIndex) {
      return 'DEMOTE';
    } else {
      return 'REPEAT';
    }
  }
  
  /**
   * 사용자의 전체적인 학습 성과를 분석하여 프로필을 업데이트합니다
   */
  static analyzeAndUpdateProfile(
    currentProfile: UserForgettingCurveProfile,
    recentReviews: ReviewPerformanceData[]
  ): UserForgettingCurveProfile {
    if (recentReviews.length === 0) {
      return currentProfile;
    }
    
    // 최근 성과 분석
    const recentSuccessRate = recentReviews.filter(r => r.isSuccess).length / recentReviews.length;
    const averageResponseTime = recentReviews.reduce((sum, r) => sum + r.responseTime, 0) / recentReviews.length;
    const averageConfidence = recentReviews.reduce((sum, r) => sum + r.confidenceLevel, 0) / recentReviews.length;
    
    // 프로필 조정
    let newMemoryRetentionFactor = currentProfile.memoryRetentionFactor;
    
    // 성공률에 따른 조정
    if (recentSuccessRate > 0.8) {
      // 높은 성공률: 기억력 계수 증가 (최대 1.5까지)
      newMemoryRetentionFactor = Math.min(1.5, newMemoryRetentionFactor * 1.05);
    } else if (recentSuccessRate < 0.6) {
      // 낮은 성공률: 기억력 계수 감소 (최소 0.5까지)
      newMemoryRetentionFactor = Math.max(0.5, newMemoryRetentionFactor * 0.95);
    }
    
    // 응답 시간과 자신감에 따른 미세 조정
    if (averageResponseTime < 10 && averageConfidence > 3.5) {
      // 빠른 응답과 높은 자신감
      newMemoryRetentionFactor *= 1.02;
    } else if (averageResponseTime > 30 && averageConfidence < 2.5) {
      // 느린 응답과 낮은 자신감
      newMemoryRetentionFactor *= 0.98;
    }
    
    // 범위 제한
    newMemoryRetentionFactor = Math.max(0.1, Math.min(2.0, newMemoryRetentionFactor));
    
    return {
      ...currentProfile,
      memoryRetentionFactor: newMemoryRetentionFactor,
      successRate: (currentProfile.successRate * 0.7) + (recentSuccessRate * 0.3), // 지수 이동 평균
      totalReviews: currentProfile.totalReviews + recentReviews.length
    };
  }
  
  /**
   * 복습 우선순위를 계산합니다
   */
  static calculateReviewPriority(
    scheduledTime: Date,
    difficultyScore: number = 5,
    successRate: number = 0.5,
    daysSinceLastReview: number = 0
  ): number {
    const now = new Date();
    const hoursOverdue = Math.max(0, (now.getTime() - scheduledTime.getTime()) / (1000 * 60 * 60));
    
    // 기본 우선순위 (연체 시간에 따라)
    let priority = hoursOverdue * 10;
    
    // 난이도가 높을수록 우선순위 증가
    priority += difficultyScore * 5;
    
    // 성공률이 낮을수록 우선순위 증가
    priority += (1 - successRate) * 20;
    
    // 오랫동안 복습하지 않았을수록 우선순위 증가
    priority += daysSinceLastReview * 2;
    
    return Math.round(priority);
  }
}

export default ForgettingCurveAlgorithm;