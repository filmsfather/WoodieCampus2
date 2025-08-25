export declare class SessionManager {
    private static readonly TOKEN_BLACKLIST_PREFIX;
    private static readonly USER_SESSIONS_PREFIX;
    private static readonly SESSION_DATA_PREFIX;
    private static readonly TOKEN_BLACKLIST_TTL;
    private static readonly SESSION_TTL;
    static blacklistToken(token: string, userId?: string): Promise<boolean>;
    static isTokenBlacklisted(token: string): Promise<boolean>;
    static createSession(userId: string, sessionData: {
        deviceInfo?: string;
        ipAddress?: string;
        userAgent?: string;
        loginTime?: Date;
        refreshToken?: string;
    }): Promise<string | null>;
    static getSession(sessionId: string): Promise<any | null>;
    static updateSessionActivity(sessionId: string): Promise<boolean>;
    static invalidateSession(sessionId: string): Promise<boolean>;
    static getUserSessions(userId: string): Promise<any[]>;
    static invalidateAllUserSessions(userId: string, excludeSessionId?: string): Promise<number>;
    static cleanupExpiredSessions(userId: string): Promise<number>;
    private static addSessionToUserList;
    private static removeSessionFromUserList;
    private static generateSessionId;
    static getSessionStats(): Promise<{
        totalActiveSessions: number;
        sessionsPerUser: Record<string, number>;
        oldestSession?: string;
        newestSession?: string;
    }>;
}
