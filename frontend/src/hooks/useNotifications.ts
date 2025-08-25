import { useState, useEffect, useCallback } from 'react';

// 알림 타입 정의
export enum NotificationType {
  REVIEW_REMINDER = 'REVIEW_REMINDER',
  STUDY_STREAK = 'STUDY_STREAK',
  ACHIEVEMENT = 'ACHIEVEMENT',
  PROGRESS_UPDATE = 'PROGRESS_UPDATE',
  OVERDUE_REVIEW = 'OVERDUE_REVIEW',
  DAILY_GOAL = 'DAILY_GOAL',
  WEEKLY_SUMMARY = 'WEEKLY_SUMMARY',
  SYSTEM_ALERT = 'SYSTEM_ALERT',
  // 새로운 스마트 알림 타입들
  SMART_REVIEW_REMINDER = 'SMART_REVIEW_REMINDER',
  MOTIVATION_BOOST = 'MOTIVATION_BOOST',
  OPTIMAL_TIME_REMINDER = 'OPTIMAL_TIME_REMINDER',
  MASTERY_MILESTONE = 'MASTERY_MILESTONE',
  LEARNING_PATTERN_ANALYSIS = 'LEARNING_PATTERN_ANALYSIS',
  FORGETTING_CURVE_WARNING = 'FORGETTING_CURVE_WARNING'
}

export enum NotificationPriority {
  LOW = 'LOW',
  MEDIUM = 'MEDIUM',
  HIGH = 'HIGH',
  URGENT = 'URGENT'
}

export interface NotificationData {
  id: string;
  userId: string;
  type: NotificationType;
  title: string;
  message: string;
  data?: any;
  isRead: boolean;
  priority: NotificationPriority;
  scheduledAt?: Date;
  sentAt?: Date;
  createdAt: Date;
}

export interface UserNotificationSettings {
  userId: string;
  enablePushNotifications: boolean;
  enableEmailNotifications: boolean;
  enableInAppNotifications: boolean;
  reviewReminders: boolean;
  studyStreakReminders: boolean;
  achievementNotifications: boolean;
  progressUpdates: boolean;
  dailyGoalReminders: boolean;
  weeklyDigest: boolean;
  // 새로운 스마트 알림 설정들
  smartReviewReminders: boolean;
  motivationBoosts: boolean;
  optimalTimeReminders: boolean;
  masteryMilestones: boolean;
  learningPatternAnalysis: boolean;
  forgettingCurveWarnings: boolean;
  quietHours: {
    enabled: boolean;
    startTime: string; // HH:MM
    endTime: string; // HH:MM
  };
  timezone: string;
}

// API 유틸리티 함수
const apiRequest = async <T>(endpoint: string, options: RequestInit = {}): Promise<T> => {
  const response = await fetch(`/api/notifications${endpoint}`, {
    ...options,
    headers: {
      'Content-Type': 'application/json',
      'Authorization': `Bearer ${localStorage.getItem('accessToken')}`,
      ...options.headers
    }
  });

  if (!response.ok) {
    throw new Error(`API request failed: ${response.statusText}`);
  }

  const result = await response.json();
  if (!result.success) {
    throw new Error(result.message || 'API request failed');
  }

  return result.data;
};

// 알림 목록 Hook
export const useNotifications = (autoRefresh: boolean = true, refreshInterval: number = 30000) => {
  const [notifications, setNotifications] = useState<NotificationData[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [unreadCount, setUnreadCount] = useState(0);

  // 알림 목록 조회
  const fetchNotifications = useCallback(async (limit: number = 20, offset: number = 0) => {
    try {
      setError(null);
      const data = await apiRequest<{
        notifications: NotificationData[];
        pagination: { limit: number; offset: number; total: number };
      }>(`?limit=${limit}&offset=${offset}`);
      
      setNotifications(data.notifications);
      setUnreadCount(data.notifications.filter(n => !n.isRead).length);
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Unknown error');
    } finally {
      setLoading(false);
    }
  }, []);

  // 읽지 않은 알림 수 조회
  const fetchUnreadCount = useCallback(async () => {
    try {
      const data = await apiRequest<{ unreadCount: number; total: number }>('/unread-count');
      setUnreadCount(data.unreadCount);
    } catch (err) {
      console.error('Failed to fetch unread count:', err);
    }
  }, []);

  // 알림 읽음 처리
  const markAsRead = useCallback(async (notificationIds: string[]) => {
    try {
      await apiRequest('/mark-read', {
        method: 'POST',
        body: JSON.stringify({ notificationIds })
      });

      // 로컬 상태 업데이트
      setNotifications(prev => 
        prev.map(notification => 
          notificationIds.includes(notification.id) 
            ? { ...notification, isRead: true }
            : notification
        )
      );

      // 읽지 않은 수 업데이트
      const readCount = notificationIds.filter(id => 
        notifications.find(n => n.id === id && !n.isRead)
      ).length;
      setUnreadCount(prev => Math.max(0, prev - readCount));

    } catch (err) {
      console.error('Failed to mark notifications as read:', err);
      throw err;
    }
  }, [notifications]);

  // 모든 알림 읽음 처리
  const markAllAsRead = useCallback(async () => {
    const unreadIds = notifications.filter(n => !n.isRead).map(n => n.id);
    if (unreadIds.length > 0) {
      await markAsRead(unreadIds);
    }
  }, [notifications, markAsRead]);

  // 초기 로드
  useEffect(() => {
    fetchNotifications();
  }, [fetchNotifications]);

  // 자동 새로고침
  useEffect(() => {
    if (autoRefresh && refreshInterval > 0) {
      const interval = setInterval(() => {
        fetchUnreadCount();
      }, refreshInterval);

      return () => clearInterval(interval);
    }
  }, [autoRefresh, refreshInterval, fetchUnreadCount]);

  return {
    notifications,
    loading,
    error,
    unreadCount,
    fetchNotifications,
    fetchUnreadCount,
    markAsRead,
    markAllAsRead,
    refresh: () => fetchNotifications()
  };
};

// 알림 설정 Hook
export const useNotificationSettings = () => {
  const [settings, setSettings] = useState<UserNotificationSettings | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [saving, setSaving] = useState(false);

  // 설정 조회
  const fetchSettings = useCallback(async () => {
    try {
      setError(null);
      const data = await apiRequest<UserNotificationSettings>('/settings');
      setSettings(data);
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Unknown error');
    } finally {
      setLoading(false);
    }
  }, []);

  // 설정 업데이트
  const updateSettings = useCallback(async (newSettings: Partial<UserNotificationSettings>) => {
    try {
      setSaving(true);
      setError(null);
      
      const data = await apiRequest<UserNotificationSettings>('/settings', {
        method: 'PUT',
        body: JSON.stringify(newSettings)
      });
      
      setSettings(data);
      return data;
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Unknown error');
      throw err;
    } finally {
      setSaving(false);
    }
  }, []);

  // 초기 로드
  useEffect(() => {
    fetchSettings();
  }, [fetchSettings]);

  return {
    settings,
    loading,
    error,
    saving,
    updateSettings,
    refresh: fetchSettings
  };
};

// 테스트 알림 전송 Hook
export const useTestNotification = () => {
  const [sending, setSending] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const sendTestNotification = useCallback(async (
    type: NotificationType,
    title: string,
    message: string,
    priority: NotificationPriority = NotificationPriority.MEDIUM
  ) => {
    try {
      setSending(true);
      setError(null);
      
      await apiRequest('/test', {
        method: 'POST',
        body: JSON.stringify({ type, title, message, priority })
      });
      
      return true;
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Unknown error');
      return false;
    } finally {
      setSending(false);
    }
  }, []);

  return {
    sending,
    error,
    sendTestNotification
  };
};

// 성취 알림 전송 Hook
export const useAchievementNotification = () => {
  const [sending, setSending] = useState(false);

  const sendAchievementNotification = useCallback(async (
    title: string,
    description: string,
    badge?: string
  ) => {
    try {
      setSending(true);
      
      await apiRequest('/achievement', {
        method: 'POST',
        body: JSON.stringify({ title, description, badge })
      });
      
      return true;
    } catch (err) {
      console.error('Failed to send achievement notification:', err);
      return false;
    } finally {
      setSending(false);
    }
  }, []);

  return {
    sending,
    sendAchievementNotification
  };
};

// 통합 알림 Hook
export const useNotificationSystem = (options: {
  autoRefresh?: boolean;
  refreshInterval?: number;
  enableSound?: boolean;
  enableDesktopNotifications?: boolean;
} = {}) => {
  const {
    autoRefresh = true,
    refreshInterval = 30000,
    enableSound = false,
    enableDesktopNotifications = false
  } = options;

  const notificationsHook = useNotifications(autoRefresh, refreshInterval);
  const settingsHook = useNotificationSettings();
  const testHook = useTestNotification();
  const achievementHook = useAchievementNotification();

  // 데스크톱 알림 권한 요청
  useEffect(() => {
    if (enableDesktopNotifications && 'Notification' in window) {
      if (Notification.permission === 'default') {
        Notification.requestPermission();
      }
    }
  }, [enableDesktopNotifications]);

  // 새 알림 감지 및 처리
  useEffect(() => {
    if (notificationsHook.notifications.length > 0) {
      const latestNotification = notificationsHook.notifications[0];
      
      // 데스크톱 알림 표시
      if (enableDesktopNotifications && 
          'Notification' in window && 
          Notification.permission === 'granted' &&
          !latestNotification.isRead) {
        
        new Notification(latestNotification.title, {
          body: latestNotification.message,
          icon: '/favicon.ico',
          tag: latestNotification.id
        });
      }

      // 알림 사운드 재생
      if (enableSound && !latestNotification.isRead) {
        // 사운드 재생 로직 (선택사항)
        const audio = new Audio('/notification-sound.mp3');
        audio.play().catch(() => {
          // 사운드 재생 실패 무시
        });
      }
    }
  }, [notificationsHook.notifications, enableDesktopNotifications, enableSound]);

  // 복습 완료 후 호출할 함수
  const onReviewComplete = useCallback(async (achievementData?: {
    title: string;
    description: string;
    badge?: string;
  }) => {
    // 진도율 업데이트 후 새로운 알림 확인
    setTimeout(() => {
      notificationsHook.fetchUnreadCount();
    }, 2000);

    // 성취 알림 전송 (있는 경우)
    if (achievementData) {
      await achievementHook.sendAchievementNotification(
        achievementData.title,
        achievementData.description,
        achievementData.badge
      );
    }
  }, [notificationsHook, achievementHook]);

  return {
    // 알림 데이터
    notifications: notificationsHook.notifications,
    unreadCount: notificationsHook.unreadCount,
    settings: settingsHook.settings,
    
    // 로딩 상태
    loading: {
      notifications: notificationsHook.loading,
      settings: settingsHook.loading,
      sending: testHook.sending || achievementHook.sending,
      saving: settingsHook.saving
    },
    
    // 에러 상태
    error: {
      notifications: notificationsHook.error,
      settings: settingsHook.error,
      test: testHook.error
    },
    
    // 액션 함수들
    markAsRead: notificationsHook.markAsRead,
    markAllAsRead: notificationsHook.markAllAsRead,
    updateSettings: settingsHook.updateSettings,
    sendTestNotification: testHook.sendTestNotification,
    sendAchievementNotification: achievementHook.sendAchievementNotification,
    onReviewComplete,
    
    // 새로고침 함수들
    refreshNotifications: notificationsHook.refresh,
    refreshSettings: settingsHook.refresh
  };
};

export default useNotificationSystem;