import { Router } from 'express';
import { logger } from '../config/logger.js';
import { cacheUtils } from '../config/redis.js';
import socketRoutes from './socket.js';
import authRoutes from './auth.js';
import userRoutes from './users.js';
const router = Router();
// API root endpoint
router.get('/', (req, res) => {
    res.json({
        message: 'WoodieCampus API Server',
        version: '1.0.0',
        endpoints: [
            'GET /health - Health check',
            'GET /api - API information',
            'POST /api/auth/register - User registration',
            'POST /api/auth/login - User login',
            'POST /api/auth/refresh - Refresh tokens',
            'POST /api/auth/logout - User logout',
            'GET /api/auth/me - Get current user profile',
            'GET /api/auth/sessions - Get user sessions',
            'POST /api/auth/logout-all-others - Logout from other devices',
            'POST /api/auth/logout-all - Logout from all devices',
            'GET /api/users - Get all users (Admin)',
            'GET /api/users/:id - Get user profile (Own or Admin)',
            'PATCH /api/users/:id/role - Update user role (Admin)',
            'GET /api/users/:id/permissions - Get user permissions',
            'PATCH /api/users/:id/deactivate - Deactivate user (Admin)',
        ],
        timestamp: new Date().toISOString(),
    });
});
// Test endpoint
router.get('/test', (req, res) => {
    logger.info('Test endpoint accessed');
    res.json({
        message: 'API test successful',
        timestamp: new Date().toISOString(),
        request: {
            method: req.method,
            path: req.path,
            userAgent: req.get('User-Agent'),
        },
    });
});
// Redis cache test endpoint
router.get('/cache/test', async (req, res) => {
    try {
        const testKey = 'test:cache:' + Date.now();
        const testValue = { message: 'Hello from Redis!', timestamp: new Date().toISOString() };
        // Test cache set
        const setResult = await cacheUtils.set(testKey, testValue, 60);
        if (setResult) {
            // Test cache get
            const getValue = await cacheUtils.get(testKey);
            // Test cache delete
            const deleteResult = await cacheUtils.del(testKey);
            res.json({
                message: 'Redis cache test successful',
                operations: {
                    set: setResult,
                    get: getValue !== null,
                    delete: deleteResult,
                    retrievedValue: getValue
                }
            });
        }
        else {
            res.status(503).json({
                error: 'Redis cache set operation failed'
            });
        }
    }
    catch (error) {
        logger.error('Cache test error:', error);
        res.status(503).json({
            error: 'Redis cache test failed',
            message: error instanceof Error ? error.message : 'Unknown error'
        });
    }
});
// Authentication routes
router.use('/auth', authRoutes);
// User management routes
router.use('/users', userRoutes);
// Socket.io management routes
router.use('/socket', socketRoutes);
export default router;
//# sourceMappingURL=index.js.map