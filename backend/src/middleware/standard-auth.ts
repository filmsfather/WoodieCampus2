/**
 * 표준 인증 미들웨어
 * 
 * ⚠️ 중요: 새로운 모든 라우터는 이 미들웨어를 사용해야 합니다
 * 기존 auth.ts는 레거시 호환성을 위해 유지되지만 새 코드에서는 사용 금지
 */

import type { Response, NextFunction } from 'express';
import { verifyAccessToken, extractTokenFromHeader } from '../utils/jwt.js';
import { SessionManager } from '../utils/session.js';
import { logger } from '../config/logger.js';
import type { ApiRequest, UserRole} from '../types/api.js';
import { hasAnyRole } from '../types/api.js';

// ✅ 표준 JWT 토큰 인증 미들웨어
export const authenticateToken = async (
  req: ApiRequest, 
  res: Response, 
  next: NextFunction
): Promise<void> => {
  try {
    const authHeader = req.headers.authorization;
    const token = extractTokenFromHeader(authHeader || '');

    if (!token) {
      res.status(401).json({
        error: 'Unauthorized',
        message: 'Access token is required',
        code: 'TOKEN_REQUIRED',
        timestamp: new Date().toISOString()
      });
      return;
    }

    // 토큰 블랙리스트 체크
    const isBlacklisted = await SessionManager.isTokenBlacklisted(token);
    if (isBlacklisted) {
      res.status(401).json({
        error: 'Unauthorized',
        message: 'Token has been revoked',
        code: 'TOKEN_REVOKED',
        timestamp: new Date().toISOString()
      });
      return;
    }

    // 토큰 검증
    const decoded = verifyAccessToken(token);
    
    // 사용자 정보를 요청에 추가
    req.user = {
      userId: decoded.userId,
      email: decoded.email,
      role: decoded.role as UserRole,
      isVerified: decoded.isVerified
    };

    logger.info(`User authenticated: ${decoded.email} (${decoded.userId})`);
    next();
  } catch (error) {
    logger.error('Authentication error:', error);
    
    if (error instanceof Error) {
      if (error.message.includes('expired')) {
        res.status(401).json({
          error: 'Unauthorized',
          message: 'Access token has expired',
          code: 'TOKEN_EXPIRED',
          timestamp: new Date().toISOString()
        });
      } else if (error.message.includes('invalid')) {
        res.status(401).json({
          error: 'Unauthorized',
          message: 'Invalid access token',
          code: 'TOKEN_INVALID',
          timestamp: new Date().toISOString()
        });
      } else {
        res.status(401).json({
          error: 'Unauthorized',
          message: 'Token verification failed',
          code: 'TOKEN_VERIFICATION_FAILED',
          timestamp: new Date().toISOString()
        });
      }
    } else {
      res.status(401).json({
        error: 'Unauthorized',
        message: 'Authentication failed',
        code: 'AUTH_FAILED',
        timestamp: new Date().toISOString()
      });
    }
  }
};

// ✅ 단일 역할 체크 미들웨어
export const requireRole = (requiredRole: UserRole) => {
  return (req: ApiRequest, res: Response, next: NextFunction): void => {
    if (!req.user) {
      res.status(401).json({
        error: 'Unauthorized',
        message: 'Authentication required',
        code: 'AUTH_REQUIRED',
        timestamp: new Date().toISOString()
      });
      return;
    }

    if (req.user.role !== requiredRole) {
      res.status(403).json({
        error: 'Forbidden',
        message: `Access denied. Required role: ${requiredRole}`,
        code: 'INSUFFICIENT_ROLE',
        required: requiredRole,
        current: req.user.role,
        timestamp: new Date().toISOString()
      });
      return;
    }

    next();
  };
};

// ✅ 다중 역할 체크 미들웨어
export const requireAnyRole = (allowedRoles: UserRole[]) => {
  return (req: ApiRequest, res: Response, next: NextFunction): void => {
    if (!req.user) {
      res.status(401).json({
        error: 'Unauthorized',
        message: 'Authentication required',
        code: 'AUTH_REQUIRED',
        timestamp: new Date().toISOString()
      });
      return;
    }

    if (!hasAnyRole(req.user.role, allowedRoles)) {
      res.status(403).json({
        error: 'Forbidden',
        message: `Access denied. Required roles: ${allowedRoles.join(', ')}`,
        code: 'INSUFFICIENT_ROLE',
        required: allowedRoles,
        current: req.user.role,
        timestamp: new Date().toISOString()
      });
      return;
    }

    next();
  };
};

// ✅ 최소 역할 레벨 체크 미들웨어
export const requireMinRole = (minRole: UserRole) => {
  return (req: ApiRequest, res: Response, next: NextFunction): void => {
    if (!req.user) {
      res.status(401).json({
        error: 'Unauthorized',
        message: 'Authentication required',
        code: 'AUTH_REQUIRED',
        timestamp: new Date().toISOString()
      });
      return;
    }

    const roleHierarchy = {
      'STUDENT': 1,
      'INSTRUCTOR': 2,
      'ADMIN': 3,
      'SUPER_ADMIN': 4
    };

    if (roleHierarchy[req.user.role as keyof typeof roleHierarchy] < roleHierarchy[minRole as keyof typeof roleHierarchy]) {
      res.status(403).json({
        error: 'Forbidden',
        message: `Access denied. Minimum role required: ${minRole}`,
        code: 'INSUFFICIENT_ROLE',
        required: minRole,
        current: req.user.role,
        timestamp: new Date().toISOString()
      });
      return;
    }

    next();
  };
};