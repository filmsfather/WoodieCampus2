import { cacheUtils } from '../config/redis.js';
import { logger } from '../config/logger.js';
import { decodeToken } from './jwt.js';

// Session management utilities
export class SessionManager {
  private static readonly TOKEN_BLACKLIST_PREFIX = 'blacklisted_token:';
  private static readonly USER_SESSIONS_PREFIX = 'user_sessions:';
  private static readonly SESSION_DATA_PREFIX = 'session_data:';
  private static readonly TOKEN_BLACKLIST_TTL = 7 * 24 * 60 * 60; // 7 days (max refresh token lifetime)
  private static readonly SESSION_TTL = 24 * 60 * 60; // 24 hours

  // Add token to blacklist
  static async blacklistToken(token: string, userId?: string): Promise<boolean> {
    try {
      const tokenKey = `${this.TOKEN_BLACKLIST_PREFIX}${token}`;
      
      // Get token expiration if available
      const decoded = decodeToken(token);
      const expiresIn = decoded?.exp ? Math.max(decoded.exp - Math.floor(Date.now() / 1000), 0) : this.TOKEN_BLACKLIST_TTL;
      
      const success = await cacheUtils.set(tokenKey, {
        blacklistedAt: new Date().toISOString(),
        userId: userId || decoded?.userId,
        reason: 'manual_logout'
      }, expiresIn);

      if (success && userId) {
        logger.info(`Token blacklisted for user ${userId}`);
      }

      return success;
    } catch (error) {
      logger.error('Error blacklisting token:', error);
      return false;
    }
  }

  // Check if token is blacklisted
  static async isTokenBlacklisted(token: string): Promise<boolean> {
    try {
      const tokenKey = `${this.TOKEN_BLACKLIST_PREFIX}${token}`;
      const blacklistedData = await cacheUtils.get(tokenKey);
      return blacklistedData !== null;
    } catch (error) {
      logger.error('Error checking token blacklist:', error);
      return false; // Fail open for cache errors
    }
  }

  // Create user session
  static async createSession(userId: string, sessionData: {
    deviceInfo?: string;
    ipAddress?: string;
    userAgent?: string;
    loginTime?: Date;
    refreshToken?: string;
  }): Promise<string | null> {
    try {
      const sessionId = this.generateSessionId();
      const sessionKey = `${this.SESSION_DATA_PREFIX}${sessionId}`;
      
      const session = {
        userId,
        sessionId,
        createdAt: new Date().toISOString(),
        lastActivity: new Date().toISOString(),
        isActive: true,
        ...sessionData
      };

      // Store session data
      const sessionCreated = await cacheUtils.set(sessionKey, session, this.SESSION_TTL);
      
      if (sessionCreated) {
        // Add session to user's session list
        await this.addSessionToUserList(userId, sessionId);
        logger.info(`Session created for user ${userId}: ${sessionId}`);
        return sessionId;
      }

      return null;
    } catch (error) {
      logger.error('Error creating session:', error);
      return null;
    }
  }

  // Get session data
  static async getSession(sessionId: string): Promise<any | null> {
    try {
      const sessionKey = `${this.SESSION_DATA_PREFIX}${sessionId}`;
      return await cacheUtils.get(sessionKey);
    } catch (error) {
      logger.error('Error getting session:', error);
      return null;
    }
  }

  // Update session activity
  static async updateSessionActivity(sessionId: string): Promise<boolean> {
    try {
      const session = await this.getSession(sessionId);
      if (!session) return false;

      session.lastActivity = new Date().toISOString();
      
      const sessionKey = `${this.SESSION_DATA_PREFIX}${sessionId}`;
      return await cacheUtils.set(sessionKey, session, this.SESSION_TTL);
    } catch (error) {
      logger.error('Error updating session activity:', error);
      return false;
    }
  }

  // Invalidate specific session
  static async invalidateSession(sessionId: string): Promise<boolean> {
    try {
      const session = await this.getSession(sessionId);
      if (!session) return false;

      // Remove session data
      const sessionKey = `${this.SESSION_DATA_PREFIX}${sessionId}`;
      const deleted = await cacheUtils.del(sessionKey);
      
      // Remove from user's session list
      if (session.userId) {
        await this.removeSessionFromUserList(session.userId, sessionId);
        logger.info(`Session invalidated for user ${session.userId}: ${sessionId}`);
      }

      return deleted;
    } catch (error) {
      logger.error('Error invalidating session:', error);
      return false;
    }
  }

  // Get all active sessions for a user
  static async getUserSessions(userId: string): Promise<any[]> {
    try {
      const userSessionsKey = `${this.USER_SESSIONS_PREFIX}${userId}`;
      const sessionIds = await cacheUtils.get(userSessionsKey) || [];
      
      const sessions = [];
      for (const sessionId of sessionIds) {
        const session = await this.getSession(sessionId);
        if (session && session.isActive) {
          sessions.push(session);
        }
      }

      return sessions;
    } catch (error) {
      logger.error('Error getting user sessions:', error);
      return [];
    }
  }

  // Invalidate all sessions for a user (useful for security breaches)
  static async invalidateAllUserSessions(userId: string, excludeSessionId?: string): Promise<number> {
    try {
      const sessions = await this.getUserSessions(userId);
      let invalidatedCount = 0;

      for (const session of sessions) {
        if (session.sessionId !== excludeSessionId) {
          const success = await this.invalidateSession(session.sessionId);
          if (success) {
            invalidatedCount++;
            
            // Blacklist refresh token if available
            if (session.refreshToken) {
              await this.blacklistToken(session.refreshToken, userId);
            }
          }
        }
      }

      logger.info(`Invalidated ${invalidatedCount} sessions for user ${userId}`);
      return invalidatedCount;
    } catch (error) {
      logger.error('Error invalidating all user sessions:', error);
      return 0;
    }
  }

  // Clean up expired sessions
  static async cleanupExpiredSessions(userId: string): Promise<number> {
    try {
      const userSessionsKey = `${this.USER_SESSIONS_PREFIX}${userId}`;
      const sessionIds = await cacheUtils.get(userSessionsKey) || [];
      let cleanedCount = 0;

      const validSessionIds = [];
      for (const sessionId of sessionIds) {
        const session = await this.getSession(sessionId);
        if (session) {
          // Check if session is expired (older than 24 hours since last activity)
          const lastActivity = new Date(session.lastActivity);
          const now = new Date();
          const hoursSinceActivity = (now.getTime() - lastActivity.getTime()) / (1000 * 60 * 60);
          
          if (hoursSinceActivity > 24) {
            await this.invalidateSession(sessionId);
            cleanedCount++;
          } else {
            validSessionIds.push(sessionId);
          }
        } else {
          // Session data not found, remove from list
          cleanedCount++;
        }
      }

      // Update user's session list
      if (cleanedCount > 0) {
        await cacheUtils.set(userSessionsKey, validSessionIds, 7 * 24 * 60 * 60);
        logger.info(`Cleaned up ${cleanedCount} expired sessions for user ${userId}`);
      }

      return cleanedCount;
    } catch (error) {
      logger.error('Error cleaning up expired sessions:', error);
      return 0;
    }
  }

  // Add session to user's session list
  private static async addSessionToUserList(userId: string, sessionId: string): Promise<void> {
    try {
      const userSessionsKey = `${this.USER_SESSIONS_PREFIX}${userId}`;
      const sessionIds = await cacheUtils.get(userSessionsKey) || [];
      
      if (!sessionIds.includes(sessionId)) {
        sessionIds.push(sessionId);
        await cacheUtils.set(userSessionsKey, sessionIds, 7 * 24 * 60 * 60);
      }
    } catch (error) {
      logger.error('Error adding session to user list:', error);
    }
  }

  // Remove session from user's session list
  private static async removeSessionFromUserList(userId: string, sessionId: string): Promise<void> {
    try {
      const userSessionsKey = `${this.USER_SESSIONS_PREFIX}${userId}`;
      const sessionIds = await cacheUtils.get(userSessionsKey) || [];
      
      const updatedSessionIds = sessionIds.filter((id: string) => id !== sessionId);
      await cacheUtils.set(userSessionsKey, updatedSessionIds, 7 * 24 * 60 * 60);
    } catch (error) {
      logger.error('Error removing session from user list:', error);
    }
  }

  // Generate unique session ID
  private static generateSessionId(): string {
    const timestamp = Date.now().toString(36);
    const randomPart = Math.random().toString(36).substring(2);
    return `sess_${timestamp}_${randomPart}`;
  }

  // Get session statistics
  static async getSessionStats(): Promise<{
    totalActiveSessions: number;
    sessionsPerUser: Record<string, number>;
    oldestSession?: string;
    newestSession?: string;
  }> {
    try {
      // This would require iterating through all sessions in a real implementation
      // For now, return basic stats
      return {
        totalActiveSessions: 0,
        sessionsPerUser: {},
      };
    } catch (error) {
      logger.error('Error getting session stats:', error);
      return {
        totalActiveSessions: 0,
        sessionsPerUser: {},
      };
    }
  }
}