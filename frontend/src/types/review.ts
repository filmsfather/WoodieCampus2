// 복습 카드 시스템 관련 타입 정의

export interface Problem {
  id: string;
  title: string;
  content: string;
  answer: string;
  explanation?: string;
  difficulty: number; // 1-10
  category: string;
  tags: string[];
}

export interface ReviewCard {
  id: string;
  problem: Problem;
  currentLevel: ForgettingCurveLevel;
  nextReviewTime: Date;
  completionCount: number;
  consecutiveSuccesses: number;
  lastReviewedAt?: Date;
  retentionRate: number;
  isOverdue: boolean;
}

export enum ForgettingCurveLevel {
  LEVEL_1 = 'LEVEL_1', // 20분
  LEVEL_2 = 'LEVEL_2', // 1시간
  LEVEL_3 = 'LEVEL_3', // 8시간
  LEVEL_4 = 'LEVEL_4', // 1일
  LEVEL_5 = 'LEVEL_5', // 3일
  LEVEL_6 = 'LEVEL_6', // 7일
  LEVEL_7 = 'LEVEL_7', // 14일
  LEVEL_8 = 'LEVEL_8', // 30일
}

export enum DifficultyFeedback {
  AGAIN = 'AGAIN',      // 다시
  HARD = 'HARD',        // 어려움
  GOOD = 'GOOD',        // 알맞음
  EASY = 'EASY',        // 쉬움
}

export interface ReviewSession {
  id: string;
  userId: string;
  startedAt: Date;
  endedAt?: Date;
  totalCards: number;
  completedCards: number;
  correctAnswers: number;
  averageResponseTime: number;
  isActive: boolean;
}

export interface ReviewProgress {
  totalCards: number;
  completedCards: number;
  correctAnswers: number;
  completionRate: number;
  accuracyRate: number;
  estimatedTimeRemaining: number; // minutes
  currentStreak: number;
  bestStreak: number;
}

export interface TimerState {
  isRunning: boolean;
  elapsedTime: number;
  startTime?: Date;
}