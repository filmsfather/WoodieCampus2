// UserRole은 api.ts에서 Prisma 타입으로 통합됨
export { UserRole } from './api.js';

// Permission categories
export enum PermissionCategory {
  USER_MANAGEMENT = 'user_management',
  COURSE_MANAGEMENT = 'course_management',
  CONTENT_MANAGEMENT = 'content_management',
  ASSESSMENT_MANAGEMENT = 'assessment_management',
  COMMUNICATION = 'communication',
  ANALYTICS = 'analytics',
  SYSTEM_ADMIN = 'system_admin'
}

// Specific permissions
export enum Permission {
  // User Management
  VIEW_USERS = 'view_users',
  CREATE_USER = 'create_user',
  EDIT_USER = 'edit_user',
  DELETE_USER = 'delete_user',
  MANAGE_USER_ROLES = 'manage_user_roles',

  // Course Management
  VIEW_COURSES = 'view_courses',
  CREATE_COURSE = 'create_course',
  EDIT_COURSE = 'edit_course',
  DELETE_COURSE = 'delete_course',
  ENROLL_STUDENTS = 'enroll_students',
  MANAGE_COURSE_ACCESS = 'manage_course_access',

  // Content Management
  VIEW_CONTENT = 'view_content',
  CREATE_CONTENT = 'create_content',
  EDIT_CONTENT = 'edit_content',
  DELETE_CONTENT = 'delete_content',
  PUBLISH_CONTENT = 'publish_content',

  // Assessment Management
  VIEW_ASSESSMENTS = 'view_assessments',
  CREATE_ASSESSMENT = 'create_assessment',
  EDIT_ASSESSMENT = 'edit_assessment',
  DELETE_ASSESSMENT = 'delete_assessment',
  GRADE_ASSESSMENTS = 'grade_assessments',
  VIEW_GRADES = 'view_grades',

  // Communication
  SEND_MESSAGES = 'send_messages',
  MODERATE_DISCUSSIONS = 'moderate_discussions',
  SEND_ANNOUNCEMENTS = 'send_announcements',

  // Analytics
  VIEW_ANALYTICS = 'view_analytics',
  VIEW_STUDENT_PROGRESS = 'view_student_progress',
  EXPORT_REPORTS = 'export_reports',

  // System Administration
  MANAGE_SYSTEM_SETTINGS = 'manage_system_settings',
  VIEW_LOGS = 'view_logs',
  MANAGE_INTEGRATIONS = 'manage_integrations'
}

// Permission interface
export interface PermissionInfo {
  permission: Permission;
  category: PermissionCategory;
  description: string;
  requiresOwnership?: boolean; // True if permission only applies to owned resources
}

// Role permission mapping
export interface RolePermissions {
  role: import('./api.js').UserRole;
  permissions: Permission[];
  inheritFrom?: import('./api.js').UserRole; // For hierarchical permissions
}

// Context-based permission check
export interface PermissionContext {
  userId: string;
  userRole: import('./api.js').UserRole;
  resourceId?: string;
  resourceType?: string;
  resourceOwnerId?: string;
}

// Permission check result
export interface PermissionResult {
  granted: boolean;
  reason?: string;
  requiredRole?: import('./api.js').UserRole;
  requiredPermissions?: Permission[];
}