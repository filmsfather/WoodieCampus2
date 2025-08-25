import React, { useState, useRef, useEffect } from 'react';
import { useNotificationSystem, NotificationData, NotificationType, NotificationPriority } from '../../hooks/useNotifications';
import './NotificationCenter.css';

interface NotificationCenterProps {
  className?: string;
  maxDisplayCount?: number;
  autoHideDelay?: number;
}

export const NotificationCenter: React.FC<NotificationCenterProps> = ({
  className = '',
  maxDisplayCount = 50,
  autoHideDelay = 5000
}) => {
  const [isOpen, setIsOpen] = useState(false);
  const [showSettings, setShowSettings] = useState(false);
  const dropdownRef = useRef<HTMLDivElement>(null);

  const {
    notifications,
    unreadCount,
    settings,
    loading,
    error,
    markAsRead,
    markAllAsRead,
    updateSettings,
    refreshNotifications
  } = useNotificationSystem({
    autoRefresh: true,
    refreshInterval: 30000,
    enableDesktopNotifications: true
  });

  // 외부 클릭시 드롭다운 닫기
  useEffect(() => {
    const handleClickOutside = (event: MouseEvent) => {
      if (dropdownRef.current && !dropdownRef.current.contains(event.target as Node)) {
        setIsOpen(false);
        setShowSettings(false);
      }
    };

    if (isOpen) {
      document.addEventListener('mousedown', handleClickOutside);
      return () => document.removeEventListener('mousedown', handleClickOutside);
    }
  }, [isOpen]);

  // 알림 타입별 아이콘 반환
  const getNotificationIcon = (type: NotificationType): string => {
    switch (type) {
      case NotificationType.REVIEW_REMINDER:
        return '📚';
      case NotificationType.STUDY_STREAK:
        return '🔥';
      case NotificationType.ACHIEVEMENT:
        return '🏆';
      case NotificationType.PROGRESS_UPDATE:
        return '📈';
      case NotificationType.OVERDUE_REVIEW:
        return '⏰';
      case NotificationType.DAILY_GOAL:
        return '🎯';
      case NotificationType.WEEKLY_SUMMARY:
        return '📊';
      case NotificationType.SYSTEM_ALERT:
        return '⚠️';
      // 새로운 스마트 알림 타입들
      case NotificationType.SMART_REVIEW_REMINDER:
        return '🤖'; // 로봇 아이콘 (스마트 복습)
      case NotificationType.MOTIVATION_BOOST:
        return '💪'; // 힘내라 아이콘
      case NotificationType.OPTIMAL_TIME_REMINDER:
        return '✨'; // 반짝이는 별 (최적 시간)
      case NotificationType.MASTERY_MILESTONE:
        return '🌟'; // 달성 보상
      case NotificationType.LEARNING_PATTERN_ANALYSIS:
        return '📉'; // 분석 차트
      case NotificationType.FORGETTING_CURVE_WARNING:
        return '🚨'; // 경고 사이렌
      default:
        return '🔔';
    }
  };

  // 우선순위별 스타일 클래스 반환
  const getPriorityClass = (priority: NotificationPriority): string => {
    switch (priority) {
      case NotificationPriority.URGENT:
        return 'priority-urgent';
      case NotificationPriority.HIGH:
        return 'priority-high';
      case NotificationPriority.MEDIUM:
        return 'priority-medium';
      case NotificationPriority.LOW:
        return 'priority-low';
      default:
        return 'priority-medium';
    }
  };

  // 상대 시간 포맷팅
  const formatRelativeTime = (date: Date): string => {
    const now = new Date();
    const diff = now.getTime() - new Date(date).getTime();
    const minutes = Math.floor(diff / 60000);
    const hours = Math.floor(minutes / 60);
    const days = Math.floor(hours / 24);

    if (days > 0) {
      return `${days}일 전`;
    } else if (hours > 0) {
      return `${hours}시간 전`;
    } else if (minutes > 0) {
      return `${minutes}분 전`;
    } else {
      return '방금 전';
    }
  };

  // 개별 알림 클릭 핸들러
  const handleNotificationClick = async (notification: NotificationData) => {
    if (!notification.isRead) {
      await markAsRead([notification.id]);
    }
    
    // 알림 타입별 액션 처리
    switch (notification.type) {
      case NotificationType.REVIEW_REMINDER:
      case NotificationType.OVERDUE_REVIEW:
      case NotificationType.SMART_REVIEW_REMINDER:
      case NotificationType.FORGETTING_CURVE_WARNING:
        // 복습 페이지로 이동
        window.location.href = '/review';
        break;
      case NotificationType.PROGRESS_UPDATE:
      case NotificationType.LEARNING_PATTERN_ANALYSIS:
        // 진도율 대시보드로 이동
        window.location.href = '/dashboard';
        break;
      case NotificationType.ACHIEVEMENT:
      case NotificationType.MASTERY_MILESTONE:
        // 성취 페이지로 이동
        window.location.href = '/achievements';
        break;
      case NotificationType.MOTIVATION_BOOST:
      case NotificationType.OPTIMAL_TIME_REMINDER:
        // 특별한 액션 없이 단순 메시지 표시
        break;
      default:
        break;
    }
  };

  // 설정 업데이트 핸들러
  const handleSettingsUpdate = async (newSettings: any) => {
    try {
      await updateSettings(newSettings);
    } catch (error) {
      console.error('Failed to update notification settings:', error);
    }
  };

  return (
    <div className={`notification-center ${className}`} ref={dropdownRef}>
      {/* 알림 버튼 */}
      <button 
        className={`notification-button ${unreadCount > 0 ? 'has-unread' : ''}`}
        onClick={() => setIsOpen(!isOpen)}
        aria-label={`알림 ${unreadCount > 0 ? `(${unreadCount}개의 새 알림)` : ''}`}
      >
        🔔
        {unreadCount > 0 && (
          <span className="notification-badge">
            {unreadCount > 99 ? '99+' : unreadCount}
          </span>
        )}
      </button>

      {/* 드롭다운 메뉴 */}
      {isOpen && (
        <div className="notification-dropdown">
          {/* 헤더 */}
          <div className="notification-header">
            <h3>알림</h3>
            <div className="notification-actions">
              <button 
                className="refresh-btn"
                onClick={refreshNotifications}
                disabled={loading.notifications}
                title="새로고침"
              >
                🔄
              </button>
              <button 
                className="settings-btn"
                onClick={() => setShowSettings(!showSettings)}
                title="알림 설정"
              >
                ⚙️
              </button>
              {unreadCount > 0 && (
                <button 
                  className="mark-all-read-btn"
                  onClick={markAllAsRead}
                  title="모두 읽음으로 표시"
                >
                  ✓
                </button>
              )}
            </div>
          </div>

          {/* 설정 패널 */}
          {showSettings && settings && (
            <div className="notification-settings">
              <h4>알림 설정</h4>
              <div className="settings-group">
                <label className="setting-item">
                  <input 
                    type="checkbox"
                    checked={settings.enableInAppNotifications}
                    onChange={(e) => handleSettingsUpdate({
                      enableInAppNotifications: e.target.checked
                    })}
                  />
                  <span>앱 내 알림</span>
                </label>
                <label className="setting-item">
                  <input 
                    type="checkbox"
                    checked={settings.reviewReminders}
                    onChange={(e) => handleSettingsUpdate({
                      reviewReminders: e.target.checked
                    })}
                  />
                  <span>복습 알림</span>
                </label>
                <label className="setting-item">
                  <input 
                    type="checkbox"
                    checked={settings.studyStreakReminders}
                    onChange={(e) => handleSettingsUpdate({
                      studyStreakReminders: e.target.checked
                    })}
                  />
                  <span>연속 학습 알림</span>
                </label>
                <label className="setting-item">
                  <input 
                    type="checkbox"
                    checked={settings.achievementNotifications}
                    onChange={(e) => handleSettingsUpdate({
                      achievementNotifications: e.target.checked
                    })}
                  />
                  <span>성취 알림</span>
                </label>
                <label className="setting-item">
                  <input 
                    type="checkbox"
                    checked={settings.dailyGoalReminders}
                    onChange={(e) => handleSettingsUpdate({
                      dailyGoalReminders: e.target.checked
                    })}
                  />
                  <span>일일 목표 알림</span>
                </label>
                
                {/* 새로운 스마트 알림 설정들 */}
                <div className="settings-section">
                  <h5>🤖 스마트 알림</h5>
                  <label className="setting-item">
                    <input 
                      type="checkbox"
                      checked={settings.smartReviewReminders}
                      onChange={(e) => handleSettingsUpdate({
                        smartReviewReminders: e.target.checked
                      })}
                    />
                    <span>개인화된 복습 알림</span>
                  </label>
                  <label className="setting-item">
                    <input 
                      type="checkbox"
                      checked={settings.motivationBoosts}
                      onChange={(e) => handleSettingsUpdate({
                        motivationBoosts: e.target.checked
                      })}
                    />
                    <span>동기부여 메시지</span>
                  </label>
                  <label className="setting-item">
                    <input 
                      type="checkbox"
                      checked={settings.optimalTimeReminders}
                      onChange={(e) => handleSettingsUpdate({
                        optimalTimeReminders: e.target.checked
                      })}
                    />
                    <span>최적 학습시간 알림</span>
                  </label>
                  <label className="setting-item">
                    <input 
                      type="checkbox"
                      checked={settings.masteryMilestones}
                      onChange={(e) => handleSettingsUpdate({
                        masteryMilestones: e.target.checked
                      })}
                    />
                    <span>숙련도 마일스톤 알림</span>
                  </label>
                  <label className="setting-item">
                    <input 
                      type="checkbox"
                      checked={settings.learningPatternAnalysis}
                      onChange={(e) => handleSettingsUpdate({
                        learningPatternAnalysis: e.target.checked
                      })}
                    />
                    <span>학습 패턴 분석</span>
                  </label>
                  <label className="setting-item">
                    <input 
                      type="checkbox"
                      checked={settings.forgettingCurveWarnings}
                      onChange={(e) => handleSettingsUpdate({
                        forgettingCurveWarnings: e.target.checked
                      })}
                    />
                    <span>망각곞선 경고</span>
                  </label>
                </div>
              </div>

              {/* 조용한 시간 설정 */}
              <div className="quiet-hours-settings">
                <label className="setting-item">
                  <input 
                    type="checkbox"
                    checked={settings.quietHours.enabled}
                    onChange={(e) => handleSettingsUpdate({
                      quietHours: {
                        ...settings.quietHours,
                        enabled: e.target.checked
                      }
                    })}
                  />
                  <span>조용한 시간 설정</span>
                </label>
                {settings.quietHours.enabled && (
                  <div className="time-inputs">
                    <input 
                      type="time"
                      value={settings.quietHours.startTime}
                      onChange={(e) => handleSettingsUpdate({
                        quietHours: {
                          ...settings.quietHours,
                          startTime: e.target.value
                        }
                      })}
                    />
                    <span>~</span>
                    <input 
                      type="time"
                      value={settings.quietHours.endTime}
                      onChange={(e) => handleSettingsUpdate({
                        quietHours: {
                          ...settings.quietHours,
                          endTime: e.target.value
                        }
                      })}
                    />
                  </div>
                )}
              </div>
            </div>
          )}

          {/* 알림 목록 */}
          <div className="notification-list">
            {loading.notifications ? (
              <div className="notification-loading">
                <div className="loading-spinner"></div>
                <p>알림을 불러오는 중...</p>
              </div>
            ) : error.notifications ? (
              <div className="notification-error">
                <p>⚠️ 알림을 불러올 수 없습니다</p>
                <button onClick={refreshNotifications} className="retry-btn">
                  다시 시도
                </button>
              </div>
            ) : notifications.length === 0 ? (
              <div className="no-notifications">
                <p>🔕 새로운 알림이 없습니다</p>
              </div>
            ) : (
              notifications.slice(0, maxDisplayCount).map((notification) => (
                <div
                  key={notification.id}
                  className={`notification-item ${getPriorityClass(notification.priority)} ${
                    notification.isRead ? 'read' : 'unread'
                  }`}
                  onClick={() => handleNotificationClick(notification)}
                >
                  <div className="notification-icon">
                    {getNotificationIcon(notification.type)}
                  </div>
                  <div className="notification-content">
                    <div className="notification-title">
                      {notification.title}
                      {!notification.isRead && <span className="unread-dot"></span>}
                    </div>
                    <div className="notification-message">
                      {notification.message}
                    </div>
                    <div className="notification-time">
                      {formatRelativeTime(notification.createdAt)}
                    </div>
                  </div>
                  {notification.priority === NotificationPriority.URGENT && (
                    <div className="urgent-indicator">!</div>
                  )}
                </div>
              ))
            )}
          </div>

          {/* 푸터 */}
          {notifications.length > maxDisplayCount && (
            <div className="notification-footer">
              <button className="view-all-btn">
                모든 알림 보기 ({notifications.length}개)
              </button>
            </div>
          )}
        </div>
      )}
    </div>
  );
};

export default NotificationCenter;