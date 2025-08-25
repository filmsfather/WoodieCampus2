import { UserRole, Permission, PermissionCategory } from '../types/permissions.js';
import { logger } from '../config/logger.js';
// Define all permissions with their categories and descriptions
export const PERMISSION_DEFINITIONS = [
    // User Management
    {
        permission: Permission.VIEW_USERS,
        category: PermissionCategory.USER_MANAGEMENT,
        description: 'View user profiles and basic information'
    },
    {
        permission: Permission.CREATE_USER,
        category: PermissionCategory.USER_MANAGEMENT,
        description: 'Create new user accounts'
    },
    {
        permission: Permission.EDIT_USER,
        category: PermissionCategory.USER_MANAGEMENT,
        description: 'Edit user profile information',
        requiresOwnership: true
    },
    {
        permission: Permission.DELETE_USER,
        category: PermissionCategory.USER_MANAGEMENT,
        description: 'Delete user accounts'
    },
    {
        permission: Permission.MANAGE_USER_ROLES,
        category: PermissionCategory.USER_MANAGEMENT,
        description: 'Change user roles and permissions'
    },
    // Course Management
    {
        permission: Permission.VIEW_COURSES,
        category: PermissionCategory.COURSE_MANAGEMENT,
        description: 'View available courses'
    },
    {
        permission: Permission.CREATE_COURSE,
        category: PermissionCategory.COURSE_MANAGEMENT,
        description: 'Create new courses'
    },
    {
        permission: Permission.EDIT_COURSE,
        category: PermissionCategory.COURSE_MANAGEMENT,
        description: 'Edit course information and settings',
        requiresOwnership: true
    },
    {
        permission: Permission.DELETE_COURSE,
        category: PermissionCategory.COURSE_MANAGEMENT,
        description: 'Delete courses'
    },
    {
        permission: Permission.ENROLL_STUDENTS,
        category: PermissionCategory.COURSE_MANAGEMENT,
        description: 'Enroll students in courses'
    },
    // Content Management
    {
        permission: Permission.VIEW_CONTENT,
        category: PermissionCategory.CONTENT_MANAGEMENT,
        description: 'View course content and materials'
    },
    {
        permission: Permission.CREATE_CONTENT,
        category: PermissionCategory.CONTENT_MANAGEMENT,
        description: 'Create course content and materials'
    },
    {
        permission: Permission.EDIT_CONTENT,
        category: PermissionCategory.CONTENT_MANAGEMENT,
        description: 'Edit course content',
        requiresOwnership: true
    },
    {
        permission: Permission.DELETE_CONTENT,
        category: PermissionCategory.CONTENT_MANAGEMENT,
        description: 'Delete course content'
    },
    // Assessment Management
    {
        permission: Permission.VIEW_ASSESSMENTS,
        category: PermissionCategory.ASSESSMENT_MANAGEMENT,
        description: 'View assessments and quizzes'
    },
    {
        permission: Permission.CREATE_ASSESSMENT,
        category: PermissionCategory.ASSESSMENT_MANAGEMENT,
        description: 'Create assessments and quizzes'
    },
    {
        permission: Permission.GRADE_ASSESSMENTS,
        category: PermissionCategory.ASSESSMENT_MANAGEMENT,
        description: 'Grade student assessments'
    },
    {
        permission: Permission.VIEW_GRADES,
        category: PermissionCategory.ASSESSMENT_MANAGEMENT,
        description: 'View student grades',
        requiresOwnership: true
    },
    // Communication
    {
        permission: Permission.SEND_MESSAGES,
        category: PermissionCategory.COMMUNICATION,
        description: 'Send messages to other users'
    },
    {
        permission: Permission.MODERATE_DISCUSSIONS,
        category: PermissionCategory.COMMUNICATION,
        description: 'Moderate discussion forums and chats'
    },
    {
        permission: Permission.SEND_ANNOUNCEMENTS,
        category: PermissionCategory.COMMUNICATION,
        description: 'Send announcements to course participants'
    },
    // Analytics
    {
        permission: Permission.VIEW_ANALYTICS,
        category: PermissionCategory.ANALYTICS,
        description: 'View system analytics and statistics'
    },
    {
        permission: Permission.VIEW_STUDENT_PROGRESS,
        category: PermissionCategory.ANALYTICS,
        description: 'View student progress and performance'
    }
];
// Define role-based permissions
export const ROLE_PERMISSIONS = [
    {
        role: UserRole.STUDENT,
        permissions: [
            Permission.VIEW_COURSES,
            Permission.VIEW_CONTENT,
            Permission.VIEW_ASSESSMENTS,
            Permission.VIEW_GRADES, // Own grades only
            Permission.SEND_MESSAGES,
            Permission.EDIT_USER // Own profile only
        ]
    },
    {
        role: UserRole.INSTRUCTOR,
        permissions: [
            Permission.VIEW_COURSES,
            Permission.CREATE_COURSE,
            Permission.EDIT_COURSE, // Own courses only
            Permission.ENROLL_STUDENTS,
            Permission.VIEW_CONTENT,
            Permission.CREATE_CONTENT,
            Permission.EDIT_CONTENT, // Own content only
            Permission.DELETE_CONTENT, // Own content only
            Permission.VIEW_ASSESSMENTS,
            Permission.CREATE_ASSESSMENT,
            Permission.GRADE_ASSESSMENTS,
            Permission.VIEW_GRADES, // All students in their courses
            Permission.SEND_MESSAGES,
            Permission.MODERATE_DISCUSSIONS,
            Permission.SEND_ANNOUNCEMENTS,
            Permission.VIEW_STUDENT_PROGRESS, // Own courses only
            Permission.EDIT_USER, // Own profile only
            Permission.VIEW_USERS // Basic info only
        ]
    },
    {
        role: UserRole.ADMIN,
        permissions: [
            Permission.VIEW_USERS,
            Permission.CREATE_USER,
            Permission.EDIT_USER, // All users
            Permission.DELETE_USER,
            Permission.MANAGE_USER_ROLES,
            Permission.VIEW_COURSES,
            Permission.CREATE_COURSE,
            Permission.EDIT_COURSE, // All courses
            Permission.DELETE_COURSE,
            Permission.ENROLL_STUDENTS,
            Permission.VIEW_CONTENT,
            Permission.CREATE_CONTENT,
            Permission.EDIT_CONTENT, // All content
            Permission.DELETE_CONTENT,
            Permission.VIEW_ASSESSMENTS,
            Permission.CREATE_ASSESSMENT,
            Permission.GRADE_ASSESSMENTS,
            Permission.VIEW_GRADES, // All grades
            Permission.SEND_MESSAGES,
            Permission.MODERATE_DISCUSSIONS,
            Permission.SEND_ANNOUNCEMENTS,
            Permission.VIEW_ANALYTICS,
            Permission.VIEW_STUDENT_PROGRESS
        ]
    },
    {
        role: UserRole.SUPER_ADMIN,
        permissions: Object.values(Permission) // All permissions
    }
];
// Get permissions for a specific role
export const getRolePermissions = (role) => {
    const rolePermissions = ROLE_PERMISSIONS.find(rp => rp.role === role);
    return rolePermissions?.permissions || [];
};
// Check if a role has a specific permission
export const roleHasPermission = (role, permission) => {
    const permissions = getRolePermissions(role);
    return permissions.includes(permission);
};
// Check permission with context (including resource ownership)
export const checkPermission = (context, requiredPermission) => {
    const { userId, userRole, resourceOwnerId } = context;
    // Get user's role permissions
    const rolePermissions = getRolePermissions(userRole);
    if (!rolePermissions.includes(requiredPermission)) {
        return {
            granted: false,
            reason: `Role ${userRole} does not have permission: ${requiredPermission}`,
            requiredPermissions: [requiredPermission]
        };
    }
    // Check if permission requires ownership
    const permissionInfo = PERMISSION_DEFINITIONS.find(p => p.permission === requiredPermission);
    if (permissionInfo?.requiresOwnership && resourceOwnerId) {
        // For ownership-required permissions, check if user owns the resource
        // or if user is admin/super_admin (they can access all resources)
        const canBypassOwnership = userRole === UserRole.ADMIN || userRole === UserRole.SUPER_ADMIN;
        if (!canBypassOwnership && userId !== resourceOwnerId) {
            return {
                granted: false,
                reason: `Permission ${requiredPermission} requires resource ownership or higher privileges`,
                requiredPermissions: [requiredPermission]
            };
        }
    }
    return { granted: true };
};
// Check multiple permissions (user must have ALL)
export const checkPermissions = (context, requiredPermissions) => {
    for (const permission of requiredPermissions) {
        const result = checkPermission(context, permission);
        if (!result.granted) {
            return {
                granted: false,
                reason: result.reason,
                requiredPermissions
            };
        }
    }
    return { granted: true };
};
// Check if user has any of the given permissions (user needs at least ONE)
export const checkAnyPermission = (context, permissions) => {
    for (const permission of permissions) {
        const result = checkPermission(context, permission);
        if (result.granted) {
            return { granted: true };
        }
    }
    return {
        granted: false,
        reason: `User does not have any of the required permissions`,
        requiredPermissions: permissions
    };
};
// Get all permissions for a role, grouped by category
export const getRolePermissionsByCategory = (role) => {
    const rolePermissions = getRolePermissions(role);
    const result = {};
    // Initialize categories
    Object.values(PermissionCategory).forEach(category => {
        result[category] = [];
    });
    // Group permissions by category
    rolePermissions.forEach(permission => {
        const permissionInfo = PERMISSION_DEFINITIONS.find(p => p.permission === permission);
        if (permissionInfo) {
            result[permissionInfo.category].push(permissionInfo);
        }
    });
    return result;
};
// Validate role hierarchy (for future role inheritance)
export const isRoleHigherThan = (role1, role2) => {
    const roleHierarchy = {
        [UserRole.STUDENT]: 1,
        [UserRole.INSTRUCTOR]: 2,
        [UserRole.ADMIN]: 3,
        [UserRole.SUPER_ADMIN]: 4
    };
    return roleHierarchy[role1] > roleHierarchy[role2];
};
// Log permission check for auditing
export const logPermissionCheck = (context, permission, result) => {
    const logData = {
        userId: context.userId,
        userRole: context.userRole,
        permission,
        resourceId: context.resourceId,
        resourceType: context.resourceType,
        granted: result.granted,
        reason: result.reason,
        timestamp: new Date().toISOString()
    };
    if (result.granted) {
        logger.info('Permission granted', logData);
    }
    else {
        logger.warn('Permission denied', logData);
    }
};
//# sourceMappingURL=permissions.js.map