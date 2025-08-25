import { Request, Response, NextFunction } from 'express';
import { UserRole, Permission } from '../types/permissions.js';
export interface AuthenticatedRequest extends Request {
    user?: {
        userId: string;
        email: string;
        role: UserRole;
        isVerified: boolean;
    };
    sessionId?: string;
}
export declare const authenticateToken: (req: AuthenticatedRequest, res: Response, next: NextFunction) => Promise<void>;
export declare const requireRole: (requiredRole: UserRole) => (req: AuthenticatedRequest, res: Response, next: NextFunction) => void;
export declare const requireAnyRole: (roles: UserRole[]) => (req: AuthenticatedRequest, res: Response, next: NextFunction) => void;
export declare const requirePermission: (permission: Permission, options?: {
    resourceIdParam?: string;
    resourceOwnerId?: string;
    getResourceOwnerId?: (req: AuthenticatedRequest) => string | undefined;
}) => (req: AuthenticatedRequest, res: Response, next: NextFunction) => Promise<void>;
export declare const requirePermissions: (permissions: Permission[], options?: {
    resourceIdParam?: string;
    resourceOwnerId?: string;
    getResourceOwnerId?: (req: AuthenticatedRequest) => string | undefined;
}) => (req: AuthenticatedRequest, res: Response, next: NextFunction) => Promise<void>;
export declare const requireAnyPermission: (permissions: Permission[], options?: {
    resourceIdParam?: string;
    resourceOwnerId?: string;
    getResourceOwnerId?: (req: AuthenticatedRequest) => string | undefined;
}) => (req: AuthenticatedRequest, res: Response, next: NextFunction) => Promise<void>;
export declare const requireVerifiedAccount: (req: AuthenticatedRequest, res: Response, next: NextFunction) => void;
export declare const requireOwnershipOrAdmin: (resourceOwnerIdParam: string) => (req: AuthenticatedRequest, res: Response, next: NextFunction) => void;
