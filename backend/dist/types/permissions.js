// User roles enum
export var UserRole;
(function (UserRole) {
    UserRole["STUDENT"] = "student";
    UserRole["INSTRUCTOR"] = "instructor";
    UserRole["ADMIN"] = "admin";
    UserRole["SUPER_ADMIN"] = "super_admin";
})(UserRole || (UserRole = {}));
// Permission categories
export var PermissionCategory;
(function (PermissionCategory) {
    PermissionCategory["USER_MANAGEMENT"] = "user_management";
    PermissionCategory["COURSE_MANAGEMENT"] = "course_management";
    PermissionCategory["CONTENT_MANAGEMENT"] = "content_management";
    PermissionCategory["ASSESSMENT_MANAGEMENT"] = "assessment_management";
    PermissionCategory["COMMUNICATION"] = "communication";
    PermissionCategory["ANALYTICS"] = "analytics";
    PermissionCategory["SYSTEM_ADMIN"] = "system_admin";
})(PermissionCategory || (PermissionCategory = {}));
// Specific permissions
export var Permission;
(function (Permission) {
    // User Management
    Permission["VIEW_USERS"] = "view_users";
    Permission["CREATE_USER"] = "create_user";
    Permission["EDIT_USER"] = "edit_user";
    Permission["DELETE_USER"] = "delete_user";
    Permission["MANAGE_USER_ROLES"] = "manage_user_roles";
    // Course Management
    Permission["VIEW_COURSES"] = "view_courses";
    Permission["CREATE_COURSE"] = "create_course";
    Permission["EDIT_COURSE"] = "edit_course";
    Permission["DELETE_COURSE"] = "delete_course";
    Permission["ENROLL_STUDENTS"] = "enroll_students";
    Permission["MANAGE_COURSE_ACCESS"] = "manage_course_access";
    // Content Management
    Permission["VIEW_CONTENT"] = "view_content";
    Permission["CREATE_CONTENT"] = "create_content";
    Permission["EDIT_CONTENT"] = "edit_content";
    Permission["DELETE_CONTENT"] = "delete_content";
    Permission["PUBLISH_CONTENT"] = "publish_content";
    // Assessment Management
    Permission["VIEW_ASSESSMENTS"] = "view_assessments";
    Permission["CREATE_ASSESSMENT"] = "create_assessment";
    Permission["EDIT_ASSESSMENT"] = "edit_assessment";
    Permission["DELETE_ASSESSMENT"] = "delete_assessment";
    Permission["GRADE_ASSESSMENTS"] = "grade_assessments";
    Permission["VIEW_GRADES"] = "view_grades";
    // Communication
    Permission["SEND_MESSAGES"] = "send_messages";
    Permission["MODERATE_DISCUSSIONS"] = "moderate_discussions";
    Permission["SEND_ANNOUNCEMENTS"] = "send_announcements";
    // Analytics
    Permission["VIEW_ANALYTICS"] = "view_analytics";
    Permission["VIEW_STUDENT_PROGRESS"] = "view_student_progress";
    Permission["EXPORT_REPORTS"] = "export_reports";
    // System Administration
    Permission["MANAGE_SYSTEM_SETTINGS"] = "manage_system_settings";
    Permission["VIEW_LOGS"] = "view_logs";
    Permission["MANAGE_INTEGRATIONS"] = "manage_integrations";
})(Permission || (Permission = {}));
//# sourceMappingURL=permissions.js.map