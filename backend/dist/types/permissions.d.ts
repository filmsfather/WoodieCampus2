export declare enum UserRole {
    STUDENT = "student",
    INSTRUCTOR = "instructor",
    ADMIN = "admin",
    SUPER_ADMIN = "super_admin"
}
export declare enum PermissionCategory {
    USER_MANAGEMENT = "user_management",
    COURSE_MANAGEMENT = "course_management",
    CONTENT_MANAGEMENT = "content_management",
    ASSESSMENT_MANAGEMENT = "assessment_management",
    COMMUNICATION = "communication",
    ANALYTICS = "analytics",
    SYSTEM_ADMIN = "system_admin"
}
export declare enum Permission {
    VIEW_USERS = "view_users",
    CREATE_USER = "create_user",
    EDIT_USER = "edit_user",
    DELETE_USER = "delete_user",
    MANAGE_USER_ROLES = "manage_user_roles",
    VIEW_COURSES = "view_courses",
    CREATE_COURSE = "create_course",
    EDIT_COURSE = "edit_course",
    DELETE_COURSE = "delete_course",
    ENROLL_STUDENTS = "enroll_students",
    MANAGE_COURSE_ACCESS = "manage_course_access",
    VIEW_CONTENT = "view_content",
    CREATE_CONTENT = "create_content",
    EDIT_CONTENT = "edit_content",
    DELETE_CONTENT = "delete_content",
    PUBLISH_CONTENT = "publish_content",
    VIEW_ASSESSMENTS = "view_assessments",
    CREATE_ASSESSMENT = "create_assessment",
    EDIT_ASSESSMENT = "edit_assessment",
    DELETE_ASSESSMENT = "delete_assessment",
    GRADE_ASSESSMENTS = "grade_assessments",
    VIEW_GRADES = "view_grades",
    SEND_MESSAGES = "send_messages",
    MODERATE_DISCUSSIONS = "moderate_discussions",
    SEND_ANNOUNCEMENTS = "send_announcements",
    VIEW_ANALYTICS = "view_analytics",
    VIEW_STUDENT_PROGRESS = "view_student_progress",
    EXPORT_REPORTS = "export_reports",
    MANAGE_SYSTEM_SETTINGS = "manage_system_settings",
    VIEW_LOGS = "view_logs",
    MANAGE_INTEGRATIONS = "manage_integrations"
}
export interface PermissionInfo {
    permission: Permission;
    category: PermissionCategory;
    description: string;
    requiresOwnership?: boolean;
}
export interface RolePermissions {
    role: UserRole;
    permissions: Permission[];
    inheritFrom?: UserRole;
}
export interface PermissionContext {
    userId: string;
    userRole: UserRole;
    resourceId?: string;
    resourceType?: string;
    resourceOwnerId?: string;
}
export interface PermissionResult {
    granted: boolean;
    reason?: string;
    requiredRole?: UserRole;
    requiredPermissions?: Permission[];
}
