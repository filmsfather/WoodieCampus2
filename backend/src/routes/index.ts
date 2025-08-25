import { Router } from 'express';
import { logger } from '../config/logger.js';
import { cacheUtils } from '../config/redis.js';
import socketRoutes from './socket.js';
import authRoutes from './auth.js';
import userRoutes from './users.js';
import problemRoutes from './problems.js';
import problemSetRoutes from './problem-sets.js';
import categoryRoutes from './categories.js';
import tagRoutes from './tags.js';
import searchRoutes from './search.js';
import problemSetBuilderRoutes from './problem-set-builder.js';
import mediaRoutes from './media.js';
import problemTemplateRoutes from './problem-templates.js';
import problemDraftRoutes from './problem-drafts.js';
import forgettingCurveRoutes from './forgetting-curve.js';
import learningPatternRoutes from './learning-patterns.js';
import adaptiveDifficultyRoutes from './adaptive-difficulty.js';
import reviewSchedulingRoutes from './review-scheduling.js';
import progressRoutes from './progress.js';
import notificationRoutes from './notifications.js';
import analyticsRoutes from './analytics.js';

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
      'GET /api/problems - Get problems list',
      'GET /api/problems/:id - Get problem details',
      'POST /api/problems - Create new problem (Instructor+)',
      'PUT /api/problems/:id - Update problem (Instructor+)',
      'DELETE /api/problems/:id - Delete problem (Instructor+)',
      'PATCH /api/problems/:id/order - Update problem order (Instructor+)',
      'GET /api/problem-sets - Get problem sets list',
      'GET /api/problem-sets/:id - Get problem set details',
      'POST /api/problem-sets - Create new problem set (Instructor+)',
      'PUT /api/problem-sets/:id - Update problem set (Instructor+)',
      'DELETE /api/problem-sets/:id - Delete problem set (Instructor+)',
      'POST /api/problem-sets/from-template/:templateId - Create problem set from template (Instructor+)',
      'POST /api/problem-sets/:id/save-as-template - Save problem set as template (Instructor+)',
      'POST /api/problem-sets/:id/share - Create share link for problem set (Instructor+)',
      'GET /api/problem-sets/shared/:shareToken - Access shared problem set',
      'GET /api/problem-sets/:id/shares - Get share links for problem set (Instructor+)',
      'DELETE /api/problem-sets/shares/:shareId - Delete share link (Instructor+)',
      'POST /api/problem-sets/:id/versions - Create version for problem set (Instructor+)',
      'GET /api/problem-sets/:id/versions - Get version list for problem set (Instructor+)',
      'GET /api/problem-sets/:id/versions/:versionId - Get specific version details (Instructor+)',
      'POST /api/problem-sets/:id/versions/:versionId/restore - Restore problem set from version (Instructor+)',
      'GET /api/problem-sets/:id/versions/:versionId/compare/:compareVersionId - Compare two versions (Instructor+)',
      'DELETE /api/problem-sets/:id/versions/:versionId - Delete version (Instructor+)',
      'GET /api/categories - Get categories with hierarchy',
      'GET /api/categories/:id - Get category details',
      'POST /api/categories - Create new category (Instructor+)',
      'PUT /api/categories/:id - Update category (Instructor+)',
      'DELETE /api/categories/:id - Delete category (Instructor+)',
      'GET /api/tags - Get tags list with search/filter',
      'GET /api/tags/autocomplete - Tag autocomplete suggestions',
      'GET /api/tags/popular - Get popular tags',
      'GET /api/tags/:id - Get tag details',
      'POST /api/tags - Create new tag (Instructor+)',
      'PUT /api/tags/:id - Update tag (Instructor+)',
      'DELETE /api/tags/:id - Delete tag (Instructor+)',
      'GET /api/search - Universal search with filters',
      'GET /api/search/suggestions - Search suggestions',
      'GET /api/search/history - Search history',
      'DELETE /api/search/history - Clear search history',
      'POST /api/problem-set-builder/sessions - Create builder session',
      'GET /api/problem-set-builder/sessions - List user builder sessions',
      'GET /api/problem-set-builder/sessions/:id - Get builder session',
      'PUT /api/problem-set-builder/sessions/:id/metadata - Update metadata',
      'POST /api/problem-set-builder/sessions/:id/problems - Add problems',
      'DELETE /api/problem-set-builder/sessions/:id/problems/:itemId - Remove problem',
      'PUT /api/problem-set-builder/sessions/:id/problems/reorder - Reorder problems',
      'PUT /api/problem-set-builder/sessions/:id/problems/:itemId/settings - Update problem settings',
      'POST /api/problem-set-builder/sessions/:id/save - Save as problem set',
      'DELETE /api/problem-set-builder/sessions/:id - Delete builder session',
      'POST /api/media/upload - Upload single file (Instructor+)',
      'POST /api/media/upload/multiple - Upload multiple files (Instructor+)',
      'GET /api/media/files/:filename - Serve uploaded file',
      'GET /api/media/images/:filename/resize - Get image resize options',
      'DELETE /api/media/files/:filename - Delete file (Instructor+)',
      'POST /api/media/latex/preview - Preview LaTeX formula',
      'POST /api/media/autosave - Auto-save content (Instructor+)',
      'GET /api/media/autosave/:type/:id - Get auto-saved content (Instructor+)',
      'GET /api/media/files - List uploaded files',
      'GET /api/problem-templates - Get problem templates list',
      'GET /api/problem-templates/:id - Get specific problem template',
      'POST /api/problem-templates/:id/create-problem - Create problem from template (Instructor+)',
      'GET /api/problem-templates/guides/:questionType - Get problem writing guide',
      'POST /api/problem-templates/validate - Validate problem data (Instructor+)',
      'POST /api/problem-drafts/save - Save problem draft (Instructor+)',
      'GET /api/problem-drafts/:problemId? - Get problem draft (Instructor+)',
      'GET /api/problem-drafts - List user problem drafts (Instructor+)',
      'DELETE /api/problem-drafts/:problemId? - Delete problem draft (Instructor+)',
      'POST /api/problem-drafts/:problemId?/publish - Publish draft as problem (Instructor+)',
      'POST /api/problem-drafts/:problemId/compare - Compare draft with current (Instructor+)',
      'GET /api/forgetting-curve/profile - Get user forgetting curve profile',
      'POST /api/forgetting-curve/schedule-review - Schedule new review after learning',
      'POST /api/forgetting-curve/complete-review/:scheduleId - Complete scheduled review',
      'GET /api/forgetting-curve/scheduled-reviews - Get scheduled reviews list',
      'POST /api/forgetting-curve/start-session - Start learning session',
      'POST /api/forgetting-curve/end-session/:sessionId - End learning session',
      'GET /api/forgetting-curve/analytics - Get forgetting curve analytics',
      'GET /api/learning-patterns/analysis - Get full learning pattern analysis',
      'GET /api/learning-patterns/summary - Get learning pattern summary',
      'GET /api/learning-patterns/realtime-stats - Get realtime learning statistics',
      'POST /api/learning-patterns/session/start - Start learning session tracking',
      'POST /api/learning-patterns/session/update - Update current learning session',
      'POST /api/learning-patterns/session/end - End learning session and save data',
      'GET /api/learning-patterns/upcoming-reviews - Get upcoming reviews list',
      'GET /api/learning-patterns/trends - Get learning pattern trends',
      'GET /api/learning-patterns/rankings - Get performance rankings',
      'DELETE /api/learning-patterns/cache - Clear learning pattern cache (Admin)',
      'POST /api/adaptive-difficulty/feedback - Submit difficulty feedback',
      'GET /api/adaptive-difficulty/predict/:problemId - Get difficulty prediction',
      'GET /api/adaptive-difficulty/recommendations - Get personalized recommendations',
      'POST /api/adaptive-difficulty/adjust - Trigger difficulty adjustment',
      'GET /api/adaptive-difficulty/profile - Get user difficulty profile',
      'GET /api/adaptive-difficulty/stats - Get realtime difficulty stats',
      'GET /api/adaptive-difficulty/adjustment-queue - Get adjustment queue status',
      'GET /api/review-scheduling/schedule - Get personalized review schedule',
      'POST /api/review-scheduling/complete - Complete review and generate next schedule',
      'POST /api/review-scheduling/schedule - Register new review schedule',
      'GET /api/review-scheduling/schedule/range - Get review schedule by time range',
      'GET /api/review-scheduling/stats - Get review schedule statistics',
      'GET /api/review-scheduling/overdue - Get overdue review items',
      'GET /api/review-scheduling/time-slots/:date - Get time slots for specific date',
      'GET /api/review-scheduling/metrics - Get realtime scheduling metrics (Admin)',
      'GET /api/review-scheduling/batch/:batchId - Get batch update status (Admin)',
      'POST /api/review-scheduling/scheduler/:action - Control scheduler (Admin)',
      'DELETE /api/review-scheduling/cache - Clear user schedule cache',
      'GET /api/progress/stats - Get user progress statistics',
      'GET /api/progress/daily - Get daily progress data for charts',
      'GET /api/progress/realtime - Get realtime progress summary',
      'POST /api/progress/invalidate - Invalidate progress cache',
      'GET /api/notifications - Get user notifications',
      'POST /api/notifications/mark-read - Mark notifications as read',
      'GET /api/notifications/settings - Get notification settings',
      'PUT /api/notifications/settings - Update notification settings',
      'POST /api/notifications/test - Send test notification',
      'POST /api/notifications/review-reminder - Send review reminder',
      'POST /api/notifications/achievement - Send achievement notification',
      'GET /api/notifications/unread-count - Get unread notification count',
      'GET /api/analytics/forgetting-curve - Get forgetting curve analytics',
      'GET /api/analytics/learning-efficiency - Get learning efficiency metrics',
      'GET /api/analytics/summary - Get analytics summary',
      'GET /api/analytics/retention-curve - Get retention curve data',
      'GET /api/analytics/time-patterns - Get time-based learning patterns',
      'GET /api/analytics/category-performance - Get category performance analysis',
      'POST /api/analytics/invalidate-cache - Invalidate analytics cache',
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
    } else {
      res.status(503).json({
        error: 'Redis cache set operation failed'
      });
    }
  } catch (error) {
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

// Problem management routes
router.use('/problems', problemRoutes);

// Problem set management routes
router.use('/problem-sets', problemSetRoutes);

// Category management routes
router.use('/categories', categoryRoutes);

// Tag management routes
router.use('/tags', tagRoutes);

// Search routes
router.use('/search', searchRoutes);

// Problem Set Builder routes
router.use('/problem-set-builder', problemSetBuilderRoutes);

// Media and file upload routes  
router.use('/media', mediaRoutes);

// Problem template routes
router.use('/problem-templates', problemTemplateRoutes);

// Problem draft routes
router.use('/problem-drafts', problemDraftRoutes);

// Forgetting curve (spaced repetition) routes
router.use('/forgetting-curve', forgettingCurveRoutes);

// Learning pattern analysis routes
router.use('/learning-patterns', learningPatternRoutes);

// Adaptive difficulty adjustment routes
router.use('/adaptive-difficulty', adaptiveDifficultyRoutes);

// Review scheduling service routes
router.use('/review-scheduling', reviewSchedulingRoutes);

// Progress tracking routes
router.use('/progress', progressRoutes);

// Smart notification system routes
router.use('/notifications', notificationRoutes);

// Forgetting curve analytics routes
router.use('/analytics', analyticsRoutes);

export default router;