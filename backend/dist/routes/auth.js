import { Router } from 'express';
import { pool } from '../config/database.js';
import { logger } from '../config/logger.js';
import { cacheUtils } from '../config/redis.js';
import { generateTokenPair, verifyRefreshToken, extractTokenFromHeader } from '../utils/jwt.js';
import { hashPassword, comparePassword, validatePassword } from '../utils/password.js';
import { authenticateToken } from '../middleware/auth.js';
import { authRateLimit } from '../middleware/security.js';
import { SessionManager } from '../utils/session.js';
import { UserRole } from '../types/permissions.js';
const router = Router();
// User registration
router.post('/register', authRateLimit, async (req, res) => {
    try {
        const { email, password, firstName, lastName, role = 'student' } = req.body;
        // Validation
        if (!email || !password || !firstName || !lastName) {
            return res.status(400).json({
                error: 'Missing required fields',
                required: ['email', 'password', 'firstName', 'lastName'],
            });
        }
        // Email validation
        const emailRegex = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
        if (!emailRegex.test(email)) {
            return res.status(400).json({
                error: 'Invalid email format',
            });
        }
        // Password validation
        const passwordValidation = validatePassword(password);
        if (!passwordValidation.isValid) {
            return res.status(400).json({
                error: 'Password does not meet requirements',
                requirements: passwordValidation.errors,
            });
        }
        // Check if user already exists
        const existingUser = await pool.query('SELECT id FROM users WHERE email = $1', [email.toLowerCase()]);
        if (existingUser.rows.length > 0) {
            return res.status(409).json({
                error: 'User already exists with this email',
            });
        }
        // Hash password
        const hashedPassword = await hashPassword(password);
        // Create user
        const newUser = await pool.query(`INSERT INTO users (email, password_hash, first_name, last_name, role, is_active, is_verified)
       VALUES ($1, $2, $3, $4, $5, true, false)
       RETURNING id, email, first_name, last_name, role, is_active, is_verified, created_at`, [email.toLowerCase(), hashedPassword, firstName, lastName, role]);
        const user = newUser.rows[0];
        // Generate tokens
        const tokenPair = generateTokenPair({
            userId: user.id.toString(),
            email: user.email,
            role: user.role,
            isVerified: user.is_verified,
        });
        // Store refresh token in cache
        await cacheUtils.set(`refresh_token:${user.id}`, tokenPair.refreshToken, 7 * 24 * 60 * 60 // 7 days
        );
        // Log successful registration
        logger.info(`User registered successfully: ${user.email} (ID: ${user.id})`);
        res.status(201).json({
            message: 'User registered successfully',
            user: {
                id: user.id,
                email: user.email,
                firstName: user.first_name,
                lastName: user.last_name,
                role: user.role,
                isActive: user.is_active,
                isVerified: user.is_verified,
                createdAt: user.created_at,
            },
            tokens: tokenPair,
        });
    }
    catch (error) {
        logger.error('Registration error:', error);
        res.status(500).json({
            error: 'Registration failed',
            message: error instanceof Error ? error.message : 'Unknown error',
        });
    }
});
// User login
router.post('/login', authRateLimit, async (req, res) => {
    try {
        const { email, password } = req.body;
        // Validation
        if (!email || !password) {
            return res.status(400).json({
                error: 'Email and password are required',
            });
        }
        // Find user
        const userResult = await pool.query('SELECT * FROM users WHERE email = $1', [email.toLowerCase()]);
        if (userResult.rows.length === 0) {
            return res.status(401).json({
                error: 'Invalid email or password',
            });
        }
        const user = userResult.rows[0];
        // Check if user is active
        if (!user.is_active) {
            return res.status(401).json({
                error: 'Account is deactivated',
            });
        }
        // Verify password
        const isPasswordValid = await comparePassword(password, user.password_hash);
        if (!isPasswordValid) {
            return res.status(401).json({
                error: 'Invalid email or password',
            });
        }
        // Generate tokens
        const tokenPair = generateTokenPair({
            userId: user.id.toString(),
            email: user.email,
            role: user.role,
            isVerified: user.is_verified,
        });
        // Store refresh token in cache
        await cacheUtils.set(`refresh_token:${user.id}`, tokenPair.refreshToken, 7 * 24 * 60 * 60 // 7 days
        );
        // Update last login
        await pool.query('UPDATE users SET updated_at = CURRENT_TIMESTAMP WHERE id = $1', [user.id]);
        // Log successful login
        logger.info(`User logged in successfully: ${user.email} (ID: ${user.id})`);
        res.json({
            message: 'Login successful',
            user: {
                id: user.id,
                email: user.email,
                firstName: user.first_name,
                lastName: user.last_name,
                role: user.role,
                isActive: user.is_active,
                isVerified: user.is_verified,
            },
            tokens: tokenPair,
        });
    }
    catch (error) {
        logger.error('Login error:', error);
        res.status(500).json({
            error: 'Login failed',
            message: error instanceof Error ? error.message : 'Unknown error',
        });
    }
});
// Refresh token
router.post('/refresh', async (req, res) => {
    try {
        const { refreshToken } = req.body;
        if (!refreshToken) {
            return res.status(400).json({
                error: 'Refresh token is required',
            });
        }
        // Verify refresh token
        const decoded = verifyRefreshToken(refreshToken);
        // Check if token exists in cache
        const cachedToken = await cacheUtils.get(`refresh_token:${decoded.userId}`);
        if (cachedToken !== refreshToken) {
            return res.status(401).json({
                error: 'Invalid refresh token',
            });
        }
        // Get user data
        const userResult = await pool.query('SELECT * FROM users WHERE id = $1 AND is_active = true', [decoded.userId]);
        if (userResult.rows.length === 0) {
            return res.status(401).json({
                error: 'User not found or inactive',
            });
        }
        const user = userResult.rows[0];
        // Generate new token pair
        const tokenPair = generateTokenPair({
            userId: user.id.toString(),
            email: user.email,
            role: user.role,
            isVerified: user.is_verified,
        });
        // Update refresh token in cache
        await cacheUtils.set(`refresh_token:${user.id}`, tokenPair.refreshToken, 7 * 24 * 60 * 60 // 7 days
        );
        logger.info(`Tokens refreshed for user: ${user.email} (ID: ${user.id})`);
        res.json({
            message: 'Tokens refreshed successfully',
            tokens: tokenPair,
        });
    }
    catch (error) {
        logger.error('Token refresh error:', error);
        res.status(401).json({
            error: 'Token refresh failed',
            message: error instanceof Error ? error.message : 'Invalid token',
        });
    }
});
// Logout
router.post('/logout', authenticateToken, async (req, res) => {
    try {
        const authHeader = req.headers.authorization;
        const token = extractTokenFromHeader(authHeader || '');
        if (!token || !req.user) {
            return res.status(400).json({
                error: 'Authorization token is required',
            });
        }
        const userId = req.user.userId;
        // Blacklist the current access token
        await SessionManager.blacklistToken(token, userId);
        // Get and blacklist refresh token from cache
        const refreshToken = await cacheUtils.get(`refresh_token:${userId}`);
        if (refreshToken) {
            await SessionManager.blacklistToken(refreshToken, userId);
            // Remove refresh token from cache
            await cacheUtils.del(`refresh_token:${userId}`);
        }
        // Clean up expired sessions for the user
        await SessionManager.cleanupExpiredSessions(userId);
        logger.info(`User logged out: ${req.user.email} (${userId})`);
        res.json({
            message: 'Logout successful',
            note: 'Access token has been revoked'
        });
    }
    catch (error) {
        logger.error('Logout error:', error);
        res.status(500).json({
            error: 'Logout failed',
            message: error instanceof Error ? error.message : 'Unknown error',
        });
    }
});
// Get current user profile
router.get('/me', authenticateToken, async (req, res) => {
    try {
        if (!req.user) {
            return res.status(401).json({
                error: 'User not authenticated',
            });
        }
        // Get full user data from database
        const userResult = await pool.query('SELECT id, email, first_name, last_name, role, is_active, is_verified, created_at, updated_at FROM users WHERE id = $1', [req.user.userId]);
        if (userResult.rows.length === 0) {
            return res.status(404).json({
                error: 'User not found',
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
                updatedAt: user.updated_at,
            },
            permissions: {
                note: 'Role-based permissions are now active',
                role: user.role,
                roleLevel: getRoleLevel(user.role),
            }
        });
    }
    catch (error) {
        logger.error('Get profile error:', error);
        res.status(500).json({
            error: 'Failed to get user profile',
            message: error instanceof Error ? error.message : 'Unknown error',
        });
    }
});
// Get user sessions
router.get('/sessions', authenticateToken, async (req, res) => {
    try {
        if (!req.user) {
            return res.status(401).json({ error: 'User not authenticated' });
        }
        const sessions = await SessionManager.getUserSessions(req.user.userId);
        res.json({
            message: 'User sessions retrieved successfully',
            sessions,
            total: sessions.length
        });
    }
    catch (error) {
        logger.error('Get sessions error:', error);
        res.status(500).json({
            error: 'Failed to retrieve sessions',
            message: error instanceof Error ? error.message : 'Unknown error'
        });
    }
});
// Invalidate all other sessions (logout from all devices except current)
router.post('/logout-all-others', authenticateToken, async (req, res) => {
    try {
        if (!req.user) {
            return res.status(401).json({ error: 'User not authenticated' });
        }
        const userId = req.user.userId;
        const currentSessionId = req.sessionId; // This would need to be set in the auth middleware
        const invalidatedCount = await SessionManager.invalidateAllUserSessions(userId, currentSessionId);
        logger.info(`User ${req.user.email} invalidated ${invalidatedCount} other sessions`);
        res.json({
            message: 'All other sessions have been invalidated',
            invalidatedSessions: invalidatedCount
        });
    }
    catch (error) {
        logger.error('Logout all others error:', error);
        res.status(500).json({
            error: 'Failed to invalidate other sessions',
            message: error instanceof Error ? error.message : 'Unknown error'
        });
    }
});
// Invalidate all sessions (logout from all devices including current)
router.post('/logout-all', authenticateToken, async (req, res) => {
    try {
        if (!req.user) {
            return res.status(401).json({ error: 'User not authenticated' });
        }
        const userId = req.user.userId;
        // Get current access token and blacklist it
        const authHeader = req.headers.authorization;
        const token = extractTokenFromHeader(authHeader || '');
        if (token) {
            await SessionManager.blacklistToken(token, userId);
        }
        // Blacklist refresh token
        const refreshToken = await cacheUtils.get(`refresh_token:${userId}`);
        if (refreshToken) {
            await SessionManager.blacklistToken(refreshToken, userId);
            await cacheUtils.del(`refresh_token:${userId}`);
        }
        // Invalidate all sessions
        const invalidatedCount = await SessionManager.invalidateAllUserSessions(userId);
        logger.info(`User ${req.user.email} invalidated all ${invalidatedCount} sessions`);
        res.json({
            message: 'All sessions have been invalidated',
            invalidatedSessions: invalidatedCount,
            note: 'You have been logged out from all devices'
        });
    }
    catch (error) {
        logger.error('Logout all error:', error);
        res.status(500).json({
            error: 'Failed to invalidate all sessions',
            message: error instanceof Error ? error.message : 'Unknown error'
        });
    }
});
// Check token status (for debugging/admin purposes)
router.post('/token-status', authenticateToken, async (req, res) => {
    try {
        const { token } = req.body;
        if (!token) {
            return res.status(400).json({
                error: 'Token is required'
            });
        }
        const isBlacklisted = await SessionManager.isTokenBlacklisted(token);
        res.json({
            token: token.substring(0, 20) + '...', // Only show part of token for security
            isBlacklisted,
            status: isBlacklisted ? 'revoked' : 'active'
        });
    }
    catch (error) {
        logger.error('Token status error:', error);
        res.status(500).json({
            error: 'Failed to check token status',
            message: error instanceof Error ? error.message : 'Unknown error'
        });
    }
});
// Helper function to get role level for display
function getRoleLevel(role) {
    const roleLevels = {
        [UserRole.STUDENT]: 1,
        [UserRole.INSTRUCTOR]: 2,
        [UserRole.ADMIN]: 3,
        [UserRole.SUPER_ADMIN]: 4
    };
    return roleLevels[role] || 1;
}
export default router;
//# sourceMappingURL=auth.js.map