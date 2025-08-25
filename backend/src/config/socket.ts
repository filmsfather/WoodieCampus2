import type { Server as HTTPServer } from 'http';
import type { Socket } from 'socket.io';
import { Server as SocketIOServer } from 'socket.io';
import { logger } from './logger.js';
import { cacheUtils } from './redis.js';

export interface AuthenticatedSocket extends Socket {
  userId?: string;
  userRole?: string;
}

// Socket.io server instance
let io: SocketIOServer;

// Initialize Socket.io server
export const initializeSocketIO = (httpServer: HTTPServer): SocketIOServer => {
  io = new SocketIOServer(httpServer, {
    cors: {
      origin: process.env.FRONTEND_URL || 'http://localhost:5173',
      methods: ['GET', 'POST'],
      credentials: true,
    },
    transports: ['websocket', 'polling'],
  });

  // Connection event handler
  io.on('connection', (socket) => {
    logger.info(`New client connected: ${socket.id}`);
    
    // Authentication middleware
    socket.on('authenticate', async (data) => {
      try {
        // In a real app, validate the JWT token here
        const { token, userId, userRole } = data;
        
        // For demo purposes, we'll accept any user
        if (userId) {
          (socket as AuthenticatedSocket).userId = userId;
          (socket as AuthenticatedSocket).userRole = userRole || 'student';
          
          // Join user to their personal room
          socket.join(`user:${userId}`);
          
          // Join role-based rooms
          socket.join(`role:${userRole || 'student'}`);
          
          // Cache user's socket connection
          await cacheUtils.set(`socket:${userId}`, socket.id, 3600);
          
          socket.emit('authenticated', {
            success: true,
            userId,
            userRole: userRole || 'student',
          });
          
          logger.info(`User authenticated: ${userId} (${userRole})`);
        } else {
          socket.emit('authenticated', { success: false, error: 'Invalid credentials' });
        }
      } catch (error) {
        logger.error('Authentication error:', error);
        socket.emit('authenticated', { success: false, error: 'Authentication failed' });
      }
    });

    // Join room event
    socket.on('join-room', (roomId: string) => {
      socket.join(roomId);
      socket.emit('room-joined', { roomId });
      socket.to(roomId).emit('user-joined', { 
        userId: (socket as AuthenticatedSocket).userId,
        socketId: socket.id 
      });
      logger.info(`Socket ${socket.id} joined room: ${roomId}`);
    });

    // Leave room event
    socket.on('leave-room', (roomId: string) => {
      socket.leave(roomId);
      socket.emit('room-left', { roomId });
      socket.to(roomId).emit('user-left', { 
        userId: (socket as AuthenticatedSocket).userId,
        socketId: socket.id 
      });
      logger.info(`Socket ${socket.id} left room: ${roomId}`);
    });

    // Real-time messaging
    socket.on('send-message', (data) => {
      const { roomId, message, type = 'text' } = data;
      const userId = (socket as AuthenticatedSocket).userId;
      
      const messageData = {
        id: Date.now().toString(),
        userId,
        message,
        type,
        timestamp: new Date().toISOString(),
      };

      // Send to room participants
      socket.to(roomId).emit('new-message', messageData);
      
      // Send back confirmation to sender
      socket.emit('message-sent', messageData);
      
      logger.info(`Message sent to room ${roomId} by user ${userId}`);
    });

    // Live typing indicator
    socket.on('typing', (data) => {
      const { roomId, isTyping } = data;
      const userId = (socket as AuthenticatedSocket).userId;
      
      socket.to(roomId).emit('user-typing', {
        userId,
        isTyping,
        timestamp: new Date().toISOString(),
      });
    });

    // Course progress updates
    socket.on('progress-update', (data) => {
      const { courseId, progress, lessonId } = data;
      const userId = (socket as AuthenticatedSocket).userId;
      
      const progressData = {
        userId,
        courseId,
        lessonId,
        progress,
        timestamp: new Date().toISOString(),
      };

      // Notify instructors in the course room
      socket.to(`course:${courseId}:instructors`).emit('student-progress', progressData);
      
      logger.info(`Progress update: User ${userId}, Course ${courseId}, Progress ${progress}%`);
    });

    // Real-time learning progress events
    socket.on('start-learning-session', async (data) => {
      const userId = (socket as AuthenticatedSocket).userId;
      if (!userId) return;

      const { sessionId, problemSetId, difficulty } = data;
      
      // Join session room
      socket.join(`learning-session:${sessionId}`);
      
      const sessionData = {
        sessionId,
        userId,
        problemSetId,
        difficulty,
        startTime: new Date().toISOString(),
        status: 'active'
      };

      // Store session info in cache for tracking
      await cacheUtils.set(`session:${sessionId}`, JSON.stringify(sessionData), 7200); // 2 hours
      
      // Notify user about session start
      socket.emit('session-started', sessionData);
      
      logger.info(`Learning session started: ${sessionId} by user ${userId}`);
    });

    // Update learning session progress
    socket.on('update-learning-progress', async (data) => {
      const userId = (socket as AuthenticatedSocket).userId;
      if (!userId) return;

      const { 
        sessionId, 
        problemId, 
        isCorrect, 
        responseTime, 
        difficulty,
        currentIndex,
        totalProblems 
      } = data;

      const progressUpdate = {
        sessionId,
        userId,
        problemId,
        isCorrect,
        responseTime,
        difficulty,
        progress: Math.round((currentIndex / totalProblems) * 100),
        timestamp: new Date().toISOString()
      };

      // Emit to user's room for real-time UI updates
      socket.to(`user:${userId}`).emit('progress-updated', progressUpdate);
      
      // Emit to learning session room for collaborative features
      socket.to(`learning-session:${sessionId}`).emit('session-progress', progressUpdate);
      
      // Emit to instructors for monitoring
      socket.to('role:instructor').emit('student-learning-update', {
        studentId: userId,
        ...progressUpdate
      });

      logger.info(`Learning progress updated: User ${userId}, Session ${sessionId}, Progress ${progressUpdate.progress}%`);
    });

    // Complete learning session
    socket.on('complete-learning-session', async (data) => {
      const userId = (socket as AuthenticatedSocket).userId;
      if (!userId) return;

      const { 
        sessionId, 
        totalProblems, 
        correctAnswers, 
        totalTime,
        averageResponseTime 
      } = data;

      // Leave session room
      socket.leave(`learning-session:${sessionId}`);
      
      const completionData = {
        sessionId,
        userId,
        completedAt: new Date().toISOString(),
        stats: {
          totalProblems,
          correctAnswers,
          accuracy: totalProblems > 0 ? (correctAnswers / totalProblems) * 100 : 0,
          totalTime,
          averageResponseTime
        }
      };

      // Remove session from cache
      await cacheUtils.del(`session:${sessionId}`);
      
      // Notify completion
      socket.emit('session-completed', completionData);
      
      // Notify instructors
      socket.to('role:instructor').emit('student-session-completed', {
        studentId: userId,
        ...completionData
      });

      logger.info(`Learning session completed: ${sessionId} by user ${userId}`);
    });

    // Subscribe to real-time progress updates
    socket.on('subscribe-progress', (data) => {
      const userId = (socket as AuthenticatedSocket).userId;
      if (!userId) return;

      const { subscriptionType = 'own' } = data; // 'own', 'class', 'all'
      
      // Join appropriate rooms based on subscription type
      switch (subscriptionType) {
        case 'own':
          socket.join(`progress:${userId}`);
          break;
        case 'class':
          // Join class-wide progress updates (for instructors)
          if ((socket as AuthenticatedSocket).userRole === 'instructor') {
            socket.join('progress:class');
          }
          break;
        case 'all':
          // Admin-level progress monitoring
          if ((socket as AuthenticatedSocket).userRole === 'admin') {
            socket.join('progress:all');
          }
          break;
      }

      socket.emit('progress-subscription-confirmed', { 
        subscriptionType,
        userId,
        timestamp: new Date().toISOString()
      });
      
      logger.info(`User ${userId} subscribed to ${subscriptionType} progress updates`);
    });

    // Unsubscribe from progress updates
    socket.on('unsubscribe-progress', (data) => {
      const userId = (socket as AuthenticatedSocket).userId;
      if (!userId) return;

      const { subscriptionType = 'own' } = data;
      
      switch (subscriptionType) {
        case 'own':
          socket.leave(`progress:${userId}`);
          break;
        case 'class':
          socket.leave('progress:class');
          break;
        case 'all':
          socket.leave('progress:all');
          break;
      }

      socket.emit('progress-unsubscribed', { 
        subscriptionType,
        timestamp: new Date().toISOString()
      });
    });

    // Live session events
    socket.on('join-live-session', (sessionId: string) => {
      socket.join(`session:${sessionId}`);
      const userId = (socket as AuthenticatedSocket).userId;
      
      socket.to(`session:${sessionId}`).emit('participant-joined', {
        userId,
        socketId: socket.id,
        timestamp: new Date().toISOString(),
      });
      
      logger.info(`User ${userId} joined live session: ${sessionId}`);
    });

    // Disconnect handler
    socket.on('disconnect', async (reason) => {
      const userId = (socket as AuthenticatedSocket).userId;
      
      if (userId) {
        // Remove cached socket connection
        await cacheUtils.del(`socket:${userId}`);
        
        // Notify rooms about user disconnection
        socket.broadcast.emit('user-disconnected', {
          userId,
          socketId: socket.id,
          reason,
          timestamp: new Date().toISOString(),
        });
      }
      
      logger.info(`Client disconnected: ${socket.id}, reason: ${reason}`);
    });

    // Error handler
    socket.on('error', (error) => {
      logger.error(`Socket error for ${socket.id}:`, error);
    });
  });

  // Global error handler
  io.engine.on('connection_error', (error) => {
    logger.error('Connection error:', error);
  });

  logger.info('Socket.io server initialized');
  return io;
};

// Utility functions for emitting events
export const socketUtils = {
  // Emit to specific user
  emitToUser: async (userId: string, event: string, data: any) => {
    if (io) {
      io.to(`user:${userId}`).emit(event, data);
    }
  },

  // Emit to users with specific role
  emitToRole: (role: string, event: string, data: any) => {
    if (io) {
      io.to(`role:${role}`).emit(event, data);
    }
  },

  // Emit to specific room
  emitToRoom: (roomId: string, event: string, data: any) => {
    if (io) {
      io.to(roomId).emit(event, data);
    }
  },

  // Broadcast to all connected users
  broadcast: (event: string, data: any) => {
    if (io) {
      io.emit(event, data);
    }
  },

  // Get connected users count
  getConnectedUsers: async (): Promise<number> => {
    if (io) {
      const sockets = await io.fetchSockets();
      return sockets.length;
    }
    return 0;
  },

  // Progress-specific utility functions
  emitProgressUpdate: (userId: string, progressData: any) => {
    if (io) {
      io.to(`user:${userId}`).emit('progress-updated', progressData);
      io.to(`progress:${userId}`).emit('progress-updated', progressData);
    }
  },

  emitSessionProgress: (sessionId: string, userId: string, progressData: any) => {
    if (io) {
      io.to(`learning-session:${sessionId}`).emit('session-progress', progressData);
      io.to(`user:${userId}`).emit('session-progress', progressData);
    }
  },

  emitMasteryUpdate: (userId: string, masteryData: any) => {
    if (io) {
      io.to(`user:${userId}`).emit('mastery-updated', masteryData);
    }
  },

  emitLiveStats: (userId: string, statsData: any) => {
    if (io) {
      io.to(`user:${userId}`).emit('live-stats', statsData);
    }
  },

  // Instructor monitoring
  emitToInstructors: (event: string, data: any) => {
    if (io) {
      io.to('role:instructor').emit(event, data);
    }
  },

  // Class-wide progress broadcasting
  emitClassProgress: (classId: string, progressData: any) => {
    if (io) {
      io.to(`class:${classId}`).emit('class-progress', progressData);
    }
  },

  // Get active learning sessions count
  getActiveSessions: async (): Promise<number> => {
    if (io) {
      const rooms = io.sockets.adapter.rooms;
      let sessionCount = 0;
      
      for (const [roomName] of rooms) {
        if (roomName.startsWith('learning-session:')) {
          sessionCount++;
        }
      }
      
      return sessionCount;
    }
    return 0;
  },
};

export { io };
export default initializeSocketIO;