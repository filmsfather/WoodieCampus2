import { Router, Response } from 'express';
import { body, query, param, validationResult } from 'express-validator';
import { authenticateToken, AuthenticatedRequest } from '../middleware/auth.js';
import notificationService, { NotificationType, NotificationPriority } from '../services/notificationService.js';

const router = Router();

/**
 * GET /api/notifications
 * 사용자 알림 목록 조회
 */
router.get('/', authenticateToken, [
  query('limit').optional().isInt({ min: 1, max: 50 }),
  query('offset').optional().isInt({ min: 0 })
], async (req: AuthenticatedRequest, res: Response) => {
  try {
    const errors = validationResult(req);
    if (!errors.isEmpty()) {
      return res.status(400).json({ 
        success: false,
        message: '입력 데이터가 올바르지 않습니다.',
        errors: errors.array() 
      });
    }

    const userId = req.user?.userId;
    if (!userId) {
      return res.status(401).json({ success: false, message: 'User not authenticated' });
    }

    const limit = parseInt(req.query.limit as string) || 20;
    const offset = parseInt(req.query.offset as string) || 0;

    const notifications = await notificationService.getUserNotifications(userId, limit, offset);
    
    res.json({
      success: true,
      data: {
        notifications,
        pagination: {
          limit,
          offset,
          total: notifications.length
        }
      }
    });
  } catch (error) {
    console.error('Error fetching notifications:', error);
    res.status(500).json({ 
      success: false, 
      message: '알림 조회 중 오류가 발생했습니다.' 
    });
  }
});

/**
 * POST /api/notifications/mark-read
 * 알림 읽음 처리
 */
router.post('/mark-read', authenticateToken, [
  body('notificationIds').isArray({ min: 1 }),
  body('notificationIds.*').isString()
], async (req: AuthenticatedRequest, res: Response) => {
  try {
    const errors = validationResult(req);
    if (!errors.isEmpty()) {
      return res.status(400).json({ 
        success: false,
        message: '입력 데이터가 올바르지 않습니다.',
        errors: errors.array() 
      });
    }

    const userId = req.user?.userId;
    if (!userId) {
      return res.status(401).json({ success: false, message: 'User not authenticated' });
    }

    const { notificationIds } = req.body;
    await notificationService.markAsRead(userId, notificationIds);

    res.json({
      success: true,
      message: '알림이 읽음 처리되었습니다.',
      data: {
        markedCount: notificationIds.length
      }
    });
  } catch (error) {
    console.error('Error marking notifications as read:', error);
    res.status(500).json({ 
      success: false, 
      message: '알림 처리 중 오류가 발생했습니다.' 
    });
  }
});

/**
 * GET /api/notifications/settings
 * 사용자 알림 설정 조회
 */
router.get('/settings', authenticateToken, async (req: AuthenticatedRequest, res: Response) => {
  try {
    const userId = req.user?.userId;
    if (!userId) {
      return res.status(401).json({ success: false, message: 'User not authenticated' });
    }

    const settings = await notificationService.getUserSettings(userId);
    
    res.json({
      success: true,
      data: settings
    });
  } catch (error) {
    console.error('Error fetching notification settings:', error);
    res.status(500).json({ 
      success: false, 
      message: '알림 설정 조회 중 오류가 발생했습니다.' 
    });
  }
});

/**
 * PUT /api/notifications/settings
 * 사용자 알림 설정 업데이트
 */
router.put('/settings', authenticateToken, [
  body('enablePushNotifications').optional().isBoolean(),
  body('enableEmailNotifications').optional().isBoolean(),
  body('enableInAppNotifications').optional().isBoolean(),
  body('reviewReminders').optional().isBoolean(),
  body('studyStreakReminders').optional().isBoolean(),
  body('achievementNotifications').optional().isBoolean(),
  body('progressUpdates').optional().isBoolean(),
  body('dailyGoalReminders').optional().isBoolean(),
  body('weeklyDigest').optional().isBoolean(),
  body('quietHours').optional().isObject(),
  body('quietHours.enabled').optional().isBoolean(),
  body('quietHours.startTime').optional().matches(/^([01]?[0-9]|2[0-3]):[0-5][0-9]$/),
  body('quietHours.endTime').optional().matches(/^([01]?[0-9]|2[0-3]):[0-5][0-9]$/),
  body('timezone').optional().isString()
], async (req: AuthenticatedRequest, res: Response) => {
  try {
    const errors = validationResult(req);
    if (!errors.isEmpty()) {
      return res.status(400).json({ 
        success: false,
        message: '입력 데이터가 올바르지 않습니다.',
        errors: errors.array() 
      });
    }

    const userId = req.user?.userId;
    if (!userId) {
      return res.status(401).json({ success: false, message: 'User not authenticated' });
    }

    // 현재는 Redis에만 저장하지만, 실제로는 DB에 저장해야 함
    const currentSettings = await notificationService.getUserSettings(userId);
    const updatedSettings = { ...currentSettings, ...req.body, userId };

    // TODO: DB에 설정 저장 로직
    
    res.json({
      success: true,
      message: '알림 설정이 업데이트되었습니다.',
      data: updatedSettings
    });
  } catch (error) {
    console.error('Error updating notification settings:', error);
    res.status(500).json({ 
      success: false, 
      message: '알림 설정 업데이트 중 오류가 발생했습니다.' 
    });
  }
});

/**
 * POST /api/notifications/test
 * 테스트 알림 전송 (개발용)
 */
router.post('/test', authenticateToken, [
  body('type').isIn(Object.values(NotificationType)),
  body('title').isString().isLength({ min: 1, max: 100 }),
  body('message').isString().isLength({ min: 1, max: 500 }),
  body('priority').optional().isIn(Object.values(NotificationPriority))
], async (req: AuthenticatedRequest, res: Response) => {
  try {
    const errors = validationResult(req);
    if (!errors.isEmpty()) {
      return res.status(400).json({ 
        success: false,
        message: '입력 데이터가 올바르지 않습니다.',
        errors: errors.array() 
      });
    }

    const userId = req.user?.userId;
    if (!userId) {
      return res.status(401).json({ success: false, message: 'User not authenticated' });
    }

    const { type, title, message, priority = NotificationPriority.MEDIUM } = req.body;

    const notification = await notificationService.createNotification({
      userId,
      type: type as NotificationType,
      title,
      message,
      priority: priority as NotificationPriority,
      data: { test: true }
    });

    res.json({
      success: true,
      message: '테스트 알림이 전송되었습니다.',
      data: notification
    });
  } catch (error) {
    console.error('Error sending test notification:', error);
    res.status(500).json({ 
      success: false, 
      message: '테스트 알림 전송 중 오류가 발생했습니다.' 
    });
  }
});

/**
 * POST /api/notifications/review-reminder
 * 복습 알림 수동 전송 (관리자용)
 */
router.post('/review-reminder', authenticateToken, [
  body('userId').optional().isString(),
  body('overdueCount').optional().isInt({ min: 0 })
], async (req: AuthenticatedRequest, res: Response) => {
  try {
    const userId = req.body.userId || req.user?.userId;
    const overdueCount = req.body.overdueCount || 0;

    if (!userId) {
      return res.status(401).json({ success: false, message: 'User ID is required' });
    }

    await notificationService.createReviewReminder(userId, overdueCount);

    res.json({
      success: true,
      message: '복습 알림이 전송되었습니다.',
      data: { userId, overdueCount }
    });
  } catch (error) {
    console.error('Error sending review reminder:', error);
    res.status(500).json({ 
      success: false, 
      message: '복습 알림 전송 중 오류가 발생했습니다.' 
    });
  }
});

/**
 * POST /api/notifications/achievement
 * 성취 알림 전송
 */
router.post('/achievement', authenticateToken, [
  body('title').isString().isLength({ min: 1, max: 100 }),
  body('description').isString().isLength({ min: 1, max: 500 }),
  body('badge').optional().isString()
], async (req: AuthenticatedRequest, res: Response) => {
  try {
    const errors = validationResult(req);
    if (!errors.isEmpty()) {
      return res.status(400).json({ 
        success: false,
        message: '입력 데이터가 올바르지 않습니다.',
        errors: errors.array() 
      });
    }

    const userId = req.user?.userId;
    if (!userId) {
      return res.status(401).json({ success: false, message: 'User not authenticated' });
    }

    const { title, description, badge } = req.body;

    await notificationService.createAchievementNotification(userId, {
      title,
      description,
      badge
    });

    res.json({
      success: true,
      message: '성취 알림이 전송되었습니다.',
      data: { title, description, badge }
    });
  } catch (error) {
    console.error('Error sending achievement notification:', error);
    res.status(500).json({ 
      success: false, 
      message: '성취 알림 전송 중 오류가 발생했습니다.' 
    });
  }
});

/**
 * GET /api/notifications/unread-count
 * 읽지 않은 알림 수 조회
 */
router.get('/unread-count', authenticateToken, async (req: AuthenticatedRequest, res: Response) => {
  try {
    const userId = req.user?.userId;
    if (!userId) {
      return res.status(401).json({ success: false, message: 'User not authenticated' });
    }

    // Redis에서 읽지 않은 알림 수 계산
    const notifications = await notificationService.getUserNotifications(userId, 100, 0);
    const unreadCount = notifications.filter(n => !n.isRead).length;

    res.json({
      success: true,
      data: {
        unreadCount,
        total: notifications.length
      }
    });
  } catch (error) {
    console.error('Error fetching unread count:', error);
    res.status(500).json({ 
      success: false, 
      message: '읽지 않은 알림 수 조회 중 오류가 발생했습니다.' 
    });
  }
});

/**
 * POST /api/notifications/smart/review-reminder
 * 스마트 개인화된 복습 알림 생성
 */
router.post('/smart/review-reminder', authenticateToken, async (req: AuthenticatedRequest, res: Response) => {
  try {
    const userId = req.user?.userId;
    if (!userId) {
      return res.status(401).json({ success: false, message: 'User not authenticated' });
    }

    await notificationService.createSmartReviewReminder(userId);

    res.json({
      success: true,
      message: '스마트 복습 알림이 생성되었습니다.',
      data: { userId }
    });
  } catch (error) {
    console.error('Error creating smart review reminder:', error);
    res.status(500).json({ 
      success: false, 
      message: '스마트 복습 알림 생성 중 오류가 발생했습니다.' 
    });
  }
});

/**
 * POST /api/notifications/smart/motivation-boost
 * 동기부여 메시지 알림 생성
 */
router.post('/smart/motivation-boost', authenticateToken, async (req: AuthenticatedRequest, res: Response) => {
  try {
    const userId = req.user?.userId;
    if (!userId) {
      return res.status(401).json({ success: false, message: 'User not authenticated' });
    }

    await notificationService.createMotivationBoost(userId);

    res.json({
      success: true,
      message: '동기부여 알림이 생성되었습니다.',
      data: { userId }
    });
  } catch (error) {
    console.error('Error creating motivation boost:', error);
    res.status(500).json({ 
      success: false, 
      message: '동기부여 알림 생성 중 오류가 발생했습니다.' 
    });
  }
});

/**
 * POST /api/notifications/smart/optimal-time-reminder
 * 최적 학습 시간 알림 생성
 */
router.post('/smart/optimal-time-reminder', authenticateToken, async (req: AuthenticatedRequest, res: Response) => {
  try {
    const userId = req.user?.userId;
    if (!userId) {
      return res.status(401).json({ success: false, message: 'User not authenticated' });
    }

    await notificationService.createOptimalTimeReminder(userId);

    res.json({
      success: true,
      message: '최적 시간 알림이 생성되었습니다.',
      data: { userId }
    });
  } catch (error) {
    console.error('Error creating optimal time reminder:', error);
    res.status(500).json({ 
      success: false, 
      message: '최적 시간 알림 생성 중 오류가 발생했습니다.' 
    });
  }
});

/**
 * POST /api/notifications/smart/mastery-milestone
 * 숙련도 마일스톤 알림 생성
 */
router.post('/smart/mastery-milestone', authenticateToken, [
  body('subject').isString().isLength({ min: 1, max: 100 }),
  body('masteryLevel').isFloat({ min: 0, max: 100 })
], async (req: AuthenticatedRequest, res: Response) => {
  try {
    const errors = validationResult(req);
    if (!errors.isEmpty()) {
      return res.status(400).json({ 
        success: false,
        message: '입력 데이터가 올바르지 않습니다.',
        errors: errors.array() 
      });
    }

    const userId = req.user?.userId;
    if (!userId) {
      return res.status(401).json({ success: false, message: 'User not authenticated' });
    }

    const { subject, masteryLevel } = req.body;

    await notificationService.createMasteryMilestone(userId, subject, masteryLevel);

    res.json({
      success: true,
      message: '숙련도 마일스톤 알림이 생성되었습니다.',
      data: { userId, subject, masteryLevel }
    });
  } catch (error) {
    console.error('Error creating mastery milestone:', error);
    res.status(500).json({ 
      success: false, 
      message: '숙련도 마일스톤 알림 생성 중 오류가 발생했습니다.' 
    });
  }
});

/**
 * POST /api/notifications/smart/trigger-all
 * 모든 스마트 알림 트리거 (개발/테스트용)
 */
router.post('/smart/trigger-all', authenticateToken, async (req: AuthenticatedRequest, res: Response) => {
  try {
    const userId = req.user?.userId;
    if (!userId) {
      return res.status(401).json({ success: false, message: 'User not authenticated' });
    }

    // 모든 스마트 알림 타입 트리거
    await Promise.all([
      notificationService.createSmartReviewReminder(userId),
      notificationService.createMotivationBoost(userId),
      notificationService.createOptimalTimeReminder(userId),
      notificationService.createMasteryMilestone(userId, '수학', 75)
    ]);

    res.json({
      success: true,
      message: '모든 스마트 알림이 트리거되었습니다.',
      data: { userId, triggeredCount: 4 }
    });
  } catch (error) {
    console.error('Error triggering all smart notifications:', error);
    res.status(500).json({ 
      success: false, 
      message: '스마트 알림 트리거 중 오류가 발생했습니다.' 
    });
  }
});

export default router;