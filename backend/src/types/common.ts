// Common types used across the application
export { 
  UserRole, 
  QuestionType,
  NoticeCategory,
  ForumCategory,
  MessageType,
  NotificationType,
  AttendanceStatus,
  LearningStatus,
  AchievementType,
  ForgettingCurveLevel,
  ReviewStatus,
  DifficultyFeedback
} from '@prisma/client';

// Export Prisma types for convenience
export type { 
  User,
  ProblemSet,
  Problem,
  Category,
  Tag,
  LearningProgress,
  ForgettingCurveProfile,
  ReviewSchedule,
  LearningSession,
  ForgettingCurveAnalytics,
  ProblemDifficultyFeedback,
  DynamicDifficultyAdjustment,
  PersonalizedDifficultyProfile
} from '@prisma/client';