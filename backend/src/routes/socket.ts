import { Router } from 'express';
import { logger } from '../config/logger.js';
import { socketUtils } from '../config/socket.js';

const router = Router();

// Get connected users count
router.get('/stats', async (req, res) => {
  try {
    const connectedUsers = await socketUtils.getConnectedUsers();
    
    res.json({
      connectedUsers,
      timestamp: new Date().toISOString(),
    });
  } catch (error) {
    logger.error('Error getting socket stats:', error);
    res.status(500).json({ error: 'Failed to get socket stats' });
  }
});

// Send message to specific user
router.post('/send-to-user', async (req, res) => {
  try {
    const { userId, event, data } = req.body;
    
    if (!userId || !event) {
      return res.status(400).json({ error: 'userId and event are required' });
    }
    
    await socketUtils.emitToUser(userId, event, {
      ...data,
      timestamp: new Date().toISOString(),
    });
    
    res.json({
      success: true,
      message: `Event '${event}' sent to user ${userId}`,
    });
    
    logger.info(`Event '${event}' sent to user ${userId}`);
  } catch (error) {
    logger.error('Error sending message to user:', error);
    res.status(500).json({ error: 'Failed to send message' });
  }
});

// Send message to users with specific role
router.post('/send-to-role', async (req, res) => {
  try {
    const { role, event, data } = req.body;
    
    if (!role || !event) {
      return res.status(400).json({ error: 'role and event are required' });
    }
    
    socketUtils.emitToRole(role, event, {
      ...data,
      timestamp: new Date().toISOString(),
    });
    
    res.json({
      success: true,
      message: `Event '${event}' sent to role '${role}'`,
    });
    
    logger.info(`Event '${event}' sent to role '${role}'`);
  } catch (error) {
    logger.error('Error sending message to role:', error);
    res.status(500).json({ error: 'Failed to send message' });
  }
});

// Send message to specific room
router.post('/send-to-room', async (req, res) => {
  try {
    const { roomId, event, data } = req.body;
    
    if (!roomId || !event) {
      return res.status(400).json({ error: 'roomId and event are required' });
    }
    
    socketUtils.emitToRoom(roomId, event, {
      ...data,
      timestamp: new Date().toISOString(),
    });
    
    res.json({
      success: true,
      message: `Event '${event}' sent to room ${roomId}`,
    });
    
    logger.info(`Event '${event}' sent to room ${roomId}`);
  } catch (error) {
    logger.error('Error sending message to room:', error);
    res.status(500).json({ error: 'Failed to send message' });
  }
});

// Broadcast message to all connected users
router.post('/broadcast', async (req, res) => {
  try {
    const { event, data } = req.body;
    
    if (!event) {
      return res.status(400).json({ error: 'event is required' });
    }
    
    socketUtils.broadcast(event, {
      ...data,
      timestamp: new Date().toISOString(),
    });
    
    res.json({
      success: true,
      message: `Event '${event}' broadcasted to all users`,
    });
    
    logger.info(`Event '${event}' broadcasted to all users`);
  } catch (error) {
    logger.error('Error broadcasting message:', error);
    res.status(500).json({ error: 'Failed to broadcast message' });
  }
});

// Trigger course progress notification
router.post('/course-progress', async (req, res) => {
  try {
    const { courseId, userId, progress, lessonId } = req.body;
    
    if (!courseId || !userId || progress === undefined) {
      return res.status(400).json({ 
        error: 'courseId, userId, and progress are required' 
      });
    }
    
    const progressData = {
      userId,
      courseId,
      lessonId,
      progress,
      timestamp: new Date().toISOString(),
    };
    
    // Notify instructors
    socketUtils.emitToRoom(`course:${courseId}:instructors`, 'student-progress', progressData);
    
    // Notify the student
    await socketUtils.emitToUser(userId, 'progress-updated', progressData);
    
    res.json({
      success: true,
      message: 'Progress notification sent',
      data: progressData,
    });
    
    logger.info(`Course progress updated: User ${userId}, Course ${courseId}, Progress ${progress}%`);
  } catch (error) {
    logger.error('Error sending course progress:', error);
    res.status(500).json({ error: 'Failed to send progress notification' });
  }
});

// Trigger live session notification
router.post('/live-session', async (req, res) => {
  try {
    const { sessionId, event, data } = req.body;
    
    if (!sessionId || !event) {
      return res.status(400).json({ 
        error: 'sessionId and event are required' 
      });
    }
    
    const sessionData = {
      sessionId,
      ...data,
      timestamp: new Date().toISOString(),
    };
    
    socketUtils.emitToRoom(`session:${sessionId}`, event, sessionData);
    
    res.json({
      success: true,
      message: `Live session event '${event}' sent to session ${sessionId}`,
      data: sessionData,
    });
    
    logger.info(`Live session event '${event}' sent to session ${sessionId}`);
  } catch (error) {
    logger.error('Error sending live session event:', error);
    res.status(500).json({ error: 'Failed to send live session event' });
  }
});

export default router;