/**
 * WoodieCampus API 표준 타입 정의
 * 
 * ⚠️ 중요: 모든 AI 개발자는 이 파일의 타입만 사용해야 합니다
 * 
 * 금지사항:
 * - src/types/permissions.ts의 UserRole 사용 금지
 * - 새로운 AuthenticatedRequest 인터페이스 생성 금지
 * - Express 글로벌 타입 확장 금지
 */

import type { Request } from 'express';

// ✅ Prisma가 생성한 타입을 단일 진실 공급원으로 사용
export { 
  UserRole,
  QuestionType 
} from "@prisma/client"

// ✅ 표준 사용자 정보 인터페이스
export interface ApiUser {
  userId: string;
  email: string;
  firstName?: string;
  lastName?: string;
  role: import('@prisma/client').UserRole;
  isVerified: boolean;
  isActive?: boolean;
}

// ✅ 표준 API 요청 인터페이스 (모든 인증된 요청에서 사용)
export interface ApiRequest extends Request {
  user?: ApiUser;
  sessionId?: string;
}

// ✅ 역할 계층 정의 (권한 체크용)
export const ROLE_HIERARCHY = {
  'STUDENT': 1,
  'INSTRUCTOR': 2, 
  'ADMIN': 3,
  'SUPER_ADMIN': 4
} as const;

// ✅ 유틸리티 함수들
export const hasAnyRole = (
  userRole: import('@prisma/client').UserRole, 
  allowedRoles: import('@prisma/client').UserRole[]
): boolean => {
  return allowedRoles.includes(userRole);
};

export const isRoleHigherOrEqual = (
  userRole: import('@prisma/client').UserRole,
  requiredRole: import('@prisma/client').UserRole
): boolean => {
  return ROLE_HIERARCHY[userRole as keyof typeof ROLE_HIERARCHY] >= ROLE_HIERARCHY[requiredRole as keyof typeof ROLE_HIERARCHY];
};

// ✅ API 응답 표준 인터페이스들
export interface ApiResponse<T = any> {
  data?: T;
  message?: string;
  error?: string;
  timestamp: string;
}

export interface PaginatedResponse<T = any> {
  data: T[];
  pagination: {
    page: number;
    limit: number;
    total: number;
    totalPages: number;
  };
}

// ✅ 표준 에러 타입들
export interface ApiError {
  error: string;
  message: string;
  code?: string;
  details?: any;
}

/**
 * 🔧 AI 개발자 가이드
 * 
 * 올바른 사용법:
 * ```typescript
 * import { ApiRequest, UserRole } from '../types/api.js';
 * 
 * router.get('/', async (req: ApiRequest, res: Response) => {
 *   const userId = req.user?.userId; // ✅ userId 사용
 *   const role = req.user?.role;     // ✅ Prisma UserRole
 * });
 * ```
 * 
 * 금지사항:
 * - req.user?.id (userId 사용)
 * - AuthenticatedRequest (ApiRequest 사용)
 * - permissions.ts의 UserRole (api.ts의 UserRole 사용)
 */

// ===== 망각곡선 관련 API 타입 정의 =====

export interface ForgettingCurveProfileResponse {
  id: string;
  memoryRetentionFactor: number;
  difficultyAdjustment: number;
  successRate: number;
  totalReviews: number;
  successfulReviews: number;
  subjectAdjustments: Record<string, number>;
  upcomingReviews: number;
  user: {
    id: string;
    firstName: string;
    lastName: string;
  };
  createdAt: Date;
  updatedAt: Date;
}

export interface ReviewScheduleResponse {
  id: string;
  currentLevel: import('@prisma/client').ForgettingCurveLevel;
  status: import('@prisma/client').ReviewStatus;
  scheduledAt: Date;
  nextScheduledAt: Date | null;
  isSuccess: boolean | null;
  responseTime: number | null;
  confidenceLevel: number | null;
  difficultyScore: number | null;
  userScore: number | null;
  problem: {
    id: string;
    title: string;
    difficulty: number;
    questionType?: import('@prisma/client').QuestionType;
  } | null;
  problemSet: {
    id: string;
    title: string;
    difficulty: number;
  } | null;
  createdAt: Date;
  updatedAt: Date;
}

export interface LearningSessionResponse {
  id: string;
  sessionStartTime: Date;
  sessionEndTime: Date | null;
  totalDuration: number | null;
  problemsAttempted: number;
  problemsCorrect: number;
  averageResponseTime: number | null;
  focusScore: number | null;
  consistencyScore: number | null;
  improvementRate: number | null;
  deviceInfo: string | null;
  sessionNotes: string | null;
  createdAt: Date;
  updatedAt: Date;
}

export interface ForgettingCurveAnalyticsResponse {
  id: string;
  analysisDate: Date;
  levelSuccessRates: {
    level1: number | null;
    level2: number | null;
    level3: number | null;
    level4: number | null;
    level5: number | null;
    level6: number | null;
    level7: number | null;
    level8: number | null;
  };
  overallRetentionRate: number | null;
  averageResponseTime: number | null;
  totalReviewsCompleted: number;
  peakLearningTime: string | null;
  weeklyConsistency: number | null;
  monthlyImprovement: number | null;
  createdAt: Date;
  updatedAt: Date;
}