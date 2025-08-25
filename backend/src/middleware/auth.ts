import type { Response, NextFunction } from 'express';
import { Request } from 'express';
import { verifyAccessToken, extractTokenFromHeader } from '../utils/jwt.js';
import { 
  checkPermission,
  checkPermissions,
  checkAnyPermission,
  logPermissionCheck
} from '../utils/permissions.js';
import type {
  Permission,
  PermissionContext} from '../types/permissions.js';
import {
  PermissionResult
} from '../types/permissions.js';
// 레거시 미들웨어 - 새로운 코드에서는 standard-auth.ts 사용 권장
import { SessionManager } from '../utils/session.js';
import { logger } from '../config/logger.js';
import type { ApiRequest} from '../types/api.js';
import { UserRole } from '../types/api.js';

// 표준 인증 요청 사용 (레거시 호환성 유지)
export type AuthenticatedRequest = ApiRequest;

// Middleware to authenticate JWT token
export const authenticateToken = async (req: AuthenticatedRequest, res: Response, next: NextFunction): Promise<void> => {
  try {
    const authHeader = req.headers.authorization;
    const token = extractTokenFromHeader(authHeader || '');

    if (!token) {
      res.status(401).json({
        error: 'Access token is required',
        code: 'TOKEN_REQUIRED'
      });
      return;
    }

    // Check if token is blacklisted
    const isBlacklisted = await SessionManager.isTokenBlacklisted(token);
    if (isBlacklisted) {
      res.status(401).json({
        error: 'Token has been revoked',
        code: 'TOKEN_REVOKED'
      });
      return;
    }

    // Verify token
    const decoded = verifyAccessToken(token);
    
    // Add user info to request
    req.user = {
      userId: decoded.userId,
      email: decoded.email,
      role: decoded.role as UserRole,
      isVerified: decoded.isVerified
    };

    // Update session activity if session management is needed
    // This would require session ID to be included in token or header
    // For now, we'll skip this part

    logger.info(`User authenticated: ${decoded.email} (${decoded.userId})`);
    next();
  } catch (error) {
    logger.error('Authentication error:', error);
    
    if (error instanceof Error) {
      if (error.message.includes('expired')) {
        res.status(401).json({
          error: 'Access token has expired',
          code: 'TOKEN_EXPIRED'
        });
      } else if (error.message.includes('invalid')) {
        res.status(401).json({
          error: 'Invalid access token',
          code: 'TOKEN_INVALID'
        });
      } else {
        res.status(401).json({
          error: 'Token verification failed',
          code: 'TOKEN_VERIFICATION_FAILED'
        });
      }
    } else {
      res.status(401).json({
        error: 'Authentication failed',
        code: 'AUTH_FAILED'
      });
    }
  }
};

// Middleware to check if user has specific role
export const requireRole = (requiredRole: UserRole) => {
  return (req: AuthenticatedRequest, res: Response, next: NextFunction): void => {
    if (!req.user) {
      res.status(401).json({
        error: 'Authentication required',
        code: 'AUTH_REQUIRED'
      });
      return;
    }

    if (req.user.role !== requiredRole) {
      res.status(403).json({
        error: `Access denied. Required role: ${requiredRole}`,
        code: 'INSUFFICIENT_ROLE',
        required: requiredRole,
        current: req.user.role
      });
      return;
    }

    next();
  };
};

// Middleware to check if user has any of the specified roles
export const requireAnyRole = (roles: UserRole[]) => {
  return (req: AuthenticatedRequest, res: Response, next: NextFunction): void => {
    if (!req.user) {
      res.status(401).json({
        error: 'Authentication required',
        code: 'AUTH_REQUIRED'
      });
      return;
    }

    if (!roles.includes(req.user.role)) {
      res.status(403).json({
        error: `Access denied. Required roles: ${roles.join(', ')}`,
        code: 'INSUFFICIENT_ROLE',
        required: roles,
        current: req.user.role
      });
      return;
    }

    next();
  };
};

// Middleware to check if user has specific permission
export const requirePermission = (permission: Permission, options?: {
  resourceIdParam?: string; // URL parameter name for resource ID
  resourceOwnerId?: string; // Fixed resource owner ID
  getResourceOwnerId?: (req: AuthenticatedRequest) => string | undefined; // Function to get owner ID
}) => {
  return async (req: AuthenticatedRequest, res: Response, next: NextFunction): Promise<void> => {
    if (!req.user) {
      res.status(401).json({
        error: 'Authentication required',
        code: 'AUTH_REQUIRED'
      });
      return;
    }

    // Build permission context
    const context: PermissionContext = {
      userId: req.user.userId,
      userRole: req.user.role,
      resourceId: options?.resourceIdParam ? req.params[options.resourceIdParam] : undefined,
    };

    // Get resource owner ID if specified
    if (options?.resourceOwnerId) {
      context.resourceOwnerId = options.resourceOwnerId;
    } else if (options?.getResourceOwnerId) {
      context.resourceOwnerId = options.getResourceOwnerId(req);
    }

    // Check permission
    const result = checkPermission(context, permission);
    
    // Log the permission check
    logPermissionCheck(context, permission, result);

    if (!result.granted) {
      res.status(403).json({
        error: 'Access denied. Insufficient permissions.',
        code: 'INSUFFICIENT_PERMISSIONS',
        required: result.requiredPermissions,
        reason: result.reason
      });
      return;
    }

    next();
  };
};

// Middleware to check if user has ALL specified permissions
export const requirePermissions = (permissions: Permission[], options?: {
  resourceIdParam?: string;
  resourceOwnerId?: string;
  getResourceOwnerId?: (req: AuthenticatedRequest) => string | undefined;
}) => {
  return async (req: AuthenticatedRequest, res: Response, next: NextFunction): Promise<void> => {
    if (!req.user) {
      res.status(401).json({
        error: 'Authentication required',
        code: 'AUTH_REQUIRED'
      });
      return;
    }

    // Build permission context
    const context: PermissionContext = {
      userId: req.user.userId,
      userRole: req.user.role,
      resourceId: options?.resourceIdParam ? req.params[options.resourceIdParam] : undefined,
    };

    // Get resource owner ID if specified
    if (options?.resourceOwnerId) {
      context.resourceOwnerId = options.resourceOwnerId;
    } else if (options?.getResourceOwnerId) {
      context.resourceOwnerId = options.getResourceOwnerId(req);
    }

    // Check permissions
    const result = checkPermissions(context, permissions);
    
    // Log the permission check
    permissions.forEach(permission => {
      logPermissionCheck(context, permission, result);
    });

    if (!result.granted) {
      res.status(403).json({
        error: 'Access denied. Insufficient permissions.',
        code: 'INSUFFICIENT_PERMISSIONS',
        required: result.requiredPermissions,
        reason: result.reason
      });
      return;
    }

    next();
  };
};

// Middleware to check if user has ANY of the specified permissions
export const requireAnyPermission = (permissions: Permission[], options?: {
  resourceIdParam?: string;
  resourceOwnerId?: string;
  getResourceOwnerId?: (req: AuthenticatedRequest) => string | undefined;
}) => {
  return async (req: AuthenticatedRequest, res: Response, next: NextFunction): Promise<void> => {
    if (!req.user) {
      res.status(401).json({
        error: 'Authentication required',
        code: 'AUTH_REQUIRED'
      });
      return;
    }

    // Build permission context
    const context: PermissionContext = {
      userId: req.user.userId,
      userRole: req.user.role,
      resourceId: options?.resourceIdParam ? req.params[options.resourceIdParam] : undefined,
    };

    // Get resource owner ID if specified
    if (options?.resourceOwnerId) {
      context.resourceOwnerId = options.resourceOwnerId;
    } else if (options?.getResourceOwnerId) {
      context.resourceOwnerId = options.getResourceOwnerId(req);
    }

    // Check permissions
    const result = checkAnyPermission(context, permissions);
    
    // Log the permission check (only log the first granted permission)
    const grantedPermission = permissions.find(permission => {
      const singleResult = checkPermission(context, permission);
      return singleResult.granted;
    });
    
    if (grantedPermission) {
      logPermissionCheck(context, grantedPermission, { granted: true });
    } else {
      // Log all failed permissions
      permissions.forEach(permission => {
        const singleResult = checkPermission(context, permission);
        logPermissionCheck(context, permission, singleResult);
      });
    }

    if (!result.granted) {
      res.status(403).json({
        error: 'Access denied. Insufficient permissions.',
        code: 'INSUFFICIENT_PERMISSIONS',
        required: result.requiredPermissions,
        reason: result.reason
      });
      return;
    }

    next();
  };
};

// Middleware to ensure user account is verified
export const requireVerifiedAccount = (req: AuthenticatedRequest, res: Response, next: NextFunction): void => {
  if (!req.user) {
    res.status(401).json({
      error: 'Authentication required',
      code: 'AUTH_REQUIRED'
    });
    return;
  }

  if (!req.user.isVerified) {
    res.status(403).json({
      error: 'Account verification required',
      code: 'ACCOUNT_NOT_VERIFIED'
    });
    return;
  }

  next();
};

// Middleware to ensure user owns resource or has admin privileges
export const requireOwnershipOrAdmin = (resourceOwnerIdParam: string) => {
  return (req: AuthenticatedRequest, res: Response, next: NextFunction): void => {
    if (!req.user) {
      res.status(401).json({
        error: 'Authentication required',
        code: 'AUTH_REQUIRED'
      });
      return;
    }

    const resourceOwnerId = req.params[resourceOwnerIdParam] || req.body[resourceOwnerIdParam];
    const canBypassOwnership = req.user.role === UserRole.ADMIN || req.user.role === UserRole.SUPER_ADMIN;

    if (!canBypassOwnership && req.user.userId !== resourceOwnerId) {
      res.status(403).json({
        error: 'Access denied. Resource ownership or admin privileges required.',
        code: 'OWNERSHIP_REQUIRED'
      });
      return;
    }

    next();
  };
};