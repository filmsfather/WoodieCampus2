import { Router } from 'express';
import { pool } from '../config/database.js';
import { logger } from '../config/logger.js';
import { authenticateToken, requirePermission, requireOwnershipOrAdmin } from '../middleware/auth.js';
import { getRolePermissions, getRolePermissionsByCategory, checkPermission } from '../utils/permissions.js';
import { UserRole, Permission } from '../types/permissions.js';
const router = Router();
// Get all users (Admin only)
router.get('/', authenticateToken, requirePermission(Permission.VIEW_USERS), async (req, res) => {
    try {
        const result = await pool.query('SELECT id, email, first_name, last_name, role, is_active, is_verified, created_at FROM users ORDER BY created_at DESC');
        res.json({
            message: 'Users retrieved successfully',
            users: result.rows.map(user => ({
                id: user.id,
                email: user.email,
                firstName: user.first_name,
                lastName: user.last_name,
                role: user.role,
                isActive: user.is_active,
                isVerified: user.is_verified,
                createdAt: user.created_at
            })),
            total: result.rows.length
        });
    }
    catch (error) {
        logger.error('Get users error:', error);
        res.status(500).json({
            error: 'Failed to retrieve users',
            message: error instanceof Error ? error.message : 'Unknown error'
        });
    }
});
// Get user by ID (Own profile or Admin)
router.get('/:userId', authenticateToken, async (req, res) => {
    try {
        if (!req.user) {
            return res.status(401).json({ error: 'User not authenticated' });
        }
        const { userId } = req.params;
        // Check if user is accessing their own profile or has admin privileges
        const context = {
            userId: req.user.userId,
            userRole: req.user.role,
            resourceOwnerId: userId
        };
        const permissionResult = checkPermission(context, Permission.VIEW_USERS);
        const isOwnProfile = req.user.userId === userId;
        if (!permissionResult.granted && !isOwnProfile) {
            return res.status(403).json({
                error: 'Access denied. You can only view your own profile or need admin privileges.',
                code: 'INSUFFICIENT_PERMISSIONS'
            });
        }
        // Get user data from database
        const userResult = await pool.query('SELECT id, email, first_name, last_name, role, is_active, is_verified, created_at, updated_at FROM users WHERE id = $1', [userId]);
        if (userResult.rows.length === 0) {
            return res.status(404).json({
                error: 'User not found'
            });
        }
        const user = userResult.rows[0];
        res.json({
            message: 'User profile retrieved successfully',
            user: {
                id: user.id,
                email: user.email,
                firstName: user.first_name,
                lastName: user.last_name,
                role: user.role,
                isActive: user.is_active,
                isVerified: user.is_verified,
                createdAt: user.created_at,
                updatedAt: user.updated_at
            },
            accessReason: isOwnProfile ? 'own_profile' : 'admin_access'
        });
    }
    catch (error) {
        logger.error('Get user error:', error);
        res.status(500).json({
            error: 'Failed to retrieve user',
            message: error instanceof Error ? error.message : 'Unknown error'
        });
    }
});
// Update user role (Admin only)
router.patch('/:userId/role', authenticateToken, requirePermission(Permission.MANAGE_USER_ROLES), async (req, res) => {
    try {
        const { userId } = req.params;
        const { role } = req.body;
        // Validate role
        if (!Object.values(UserRole).includes(role)) {
            return res.status(400).json({
                error: 'Invalid role',
                validRoles: Object.values(UserRole)
            });
        }
        // Prevent users from changing their own role (except super admin)
        if (req.user?.userId === userId && req.user.role !== UserRole.SUPER_ADMIN) {
            return res.status(403).json({
                error: 'You cannot change your own role'
            });
        }
        // Check if target user exists
        const userResult = await pool.query('SELECT id, role FROM users WHERE id = $1', [userId]);
        if (userResult.rows.length === 0) {
            return res.status(404).json({ error: 'User not found' });
        }
        // Update role
        const updateResult = await pool.query('UPDATE users SET role = $1, updated_at = CURRENT_TIMESTAMP WHERE id = $2 RETURNING id, email, first_name, last_name, role', [role, userId]);
        const updatedUser = updateResult.rows[0];
        logger.info(`User role updated by ${req.user?.email} (${req.user?.userId}): ${updatedUser.email} -> ${role}`);
        res.json({
            message: 'User role updated successfully',
            user: {
                id: updatedUser.id,
                email: updatedUser.email,
                firstName: updatedUser.first_name,
                lastName: updatedUser.last_name,
                role: updatedUser.role
            }
        });
    }
    catch (error) {
        logger.error('Update user role error:', error);
        res.status(500).json({
            error: 'Failed to update user role',
            message: error instanceof Error ? error.message : 'Unknown error'
        });
    }
});
// Get user's permissions
router.get('/:userId/permissions', authenticateToken, requireOwnershipOrAdmin('userId'), async (req, res) => {
    try {
        const { userId } = req.params;
        // Get user data
        const userResult = await pool.query('SELECT id, email, first_name, last_name, role FROM users WHERE id = $1', [userId]);
        if (userResult.rows.length === 0) {
            return res.status(404).json({ error: 'User not found' });
        }
        const user = userResult.rows[0];
        const userRole = user.role;
        // Get role permissions
        const permissions = getRolePermissions(userRole);
        const permissionsByCategory = getRolePermissionsByCategory(userRole);
        res.json({
            message: 'User permissions retrieved successfully',
            user: {
                id: user.id,
                email: user.email,
                firstName: user.first_name,
                lastName: user.last_name,
                role: user.role
            },
            permissions: {
                total: permissions.length,
                list: permissions,
                byCategory: permissionsByCategory
            }
        });
    }
    catch (error) {
        logger.error('Get user permissions error:', error);
        res.status(500).json({
            error: 'Failed to get user permissions',
            message: error instanceof Error ? error.message : 'Unknown error'
        });
    }
});
// Deactivate user (Admin only)
router.patch('/:userId/deactivate', authenticateToken, requirePermission(Permission.DELETE_USER), async (req, res) => {
    try {
        const { userId } = req.params;
        // Prevent users from deactivating themselves
        if (req.user?.userId === userId) {
            return res.status(403).json({
                error: 'You cannot deactivate your own account'
            });
        }
        // Deactivate user
        const result = await pool.query('UPDATE users SET is_active = false, updated_at = CURRENT_TIMESTAMP WHERE id = $1 RETURNING id, email, first_name, last_name, is_active', [userId]);
        if (result.rows.length === 0) {
            return res.status(404).json({ error: 'User not found' });
        }
        const deactivatedUser = result.rows[0];
        logger.info(`User deactivated by ${req.user?.email} (${req.user?.userId}): ${deactivatedUser.email}`);
        res.json({
            message: 'User deactivated successfully',
            user: {
                id: deactivatedUser.id,
                email: deactivatedUser.email,
                firstName: deactivatedUser.first_name,
                lastName: deactivatedUser.last_name,
                isActive: deactivatedUser.is_active
            }
        });
    }
    catch (error) {
        logger.error('Deactivate user error:', error);
        res.status(500).json({
            error: 'Failed to deactivate user',
            message: error instanceof Error ? error.message : 'Unknown error'
        });
    }
});
// Reactivate user (Admin only)
router.patch('/:userId/activate', authenticateToken, requirePermission(Permission.DELETE_USER), async (req, res) => {
    try {
        const { userId } = req.params;
        // Reactivate user
        const result = await pool.query('UPDATE users SET is_active = true, updated_at = CURRENT_TIMESTAMP WHERE id = $1 RETURNING id, email, first_name, last_name, is_active', [userId]);
        if (result.rows.length === 0) {
            return res.status(404).json({ error: 'User not found' });
        }
        const reactivatedUser = result.rows[0];
        logger.info(`User reactivated by ${req.user?.email} (${req.user?.userId}): ${reactivatedUser.email}`);
        res.json({
            message: 'User reactivated successfully',
            user: {
                id: reactivatedUser.id,
                email: reactivatedUser.email,
                firstName: reactivatedUser.first_name,
                lastName: reactivatedUser.last_name,
                isActive: reactivatedUser.is_active
            }
        });
    }
    catch (error) {
        logger.error('Reactivate user error:', error);
        res.status(500).json({
            error: 'Failed to reactivate user',
            message: error instanceof Error ? error.message : 'Unknown error'
        });
    }
});
export default router;
//# sourceMappingURL=users.js.map