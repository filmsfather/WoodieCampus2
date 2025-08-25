import React from 'react';
import { useProgress } from '../../hooks/useProgress';
import './ProgressDashboard.css';

interface ProgressDashboardProps {
  userId: string;
  showDetailedStats?: boolean;
  refreshInterval?: number;
}

export const ProgressDashboard: React.FC<ProgressDashboardProps> = ({
  userId,
  showDetailedStats = false,
  refreshInterval = 30000
}) => {
  const {
    stats,
    realtimeProgress,
    dailyData,
    subjectMastery,
    liveStats,
    progressUpdate,
    sessionProgress,
    isSocketConnected,
    loading,
    error,
    refreshAll
  } = useProgress({
    enableRealtime: true,
    enableWebSocket: true,
    realtimeInterval: refreshInterval,
    dailyDataDays: 7, // 최근 7일
    enableSubjectMastery: showDetailedStats,
    enableLiveStats: showDetailedStats
  });

  const formatTime = (minutes: number): string => {
    if (minutes < 60) {
      return `${Math.round(minutes)}분`;
    }
    const hours = Math.floor(minutes / 60);
    const mins = Math.round(minutes % 60);
    return `${hours}시간 ${mins}분`;
  };

  const formatDate = (dateString: string): string => {
    const date = new Date(dateString);
    return date.toLocaleDateString('ko-KR', {
      month: 'short',
      day: 'numeric'
    });
  };

  // 로딩 중
  if (loading.stats) {
    return (
      <div className="progress-dashboard loading">
        <div className="loading-spinner">
          <div className="spinner"></div>
          <p>진도율을 불러오는 중...</p>
        </div>
      </div>
    );
  }

  // 에러 처리
  if (error.stats) {
    return (
      <div className="progress-dashboard error">
        <div className="error-message">
          <h3>⚠️ 진도율을 불러올 수 없습니다</h3>
          <p>{error.stats}</p>
          <button onClick={refreshAll} className="retry-btn">
            다시 시도
          </button>
        </div>
      </div>
    );
  }

  if (!stats) {
    return <div className="progress-dashboard">진도율 데이터가 없습니다.</div>;
  }

  return (
    <div className="progress-dashboard">
      {/* 헤더 */}
      <div className="dashboard-header">
        <div className="header-left">
          <h2>📊 학습 진도율</h2>
          <div className="connection-status">
            <span 
              className={`status-dot ${isSocketConnected ? 'connected' : 'disconnected'}`}
              title={isSocketConnected ? '실시간 연결됨' : '실시간 연결 끊어짐'}
            ></span>
            <span className="status-text">
              {isSocketConnected ? '실시간' : '오프라인'}
            </span>
          </div>
        </div>
        <button onClick={refreshAll} className="refresh-btn" disabled={loading.stats}>
          {loading.stats ? '새로고침 중...' : '🔄 새로고침'}
        </button>
      </div>

      {/* 실시간 업데이트 알림 */}
      {progressUpdate && (
        <div className="progress-update-notification">
          <div className="notification-content">
            <span className="notification-icon">
              {progressUpdate.lastReview.isCorrect ? '✅' : '❌'}
            </span>
            <div className="notification-text">
              <strong>🤖 스마트 업데이트!</strong>
              <p>
                {progressUpdate.lastReview.isCorrect ? '정답' : '오답'} 
                ({progressUpdate.lastReview.responseTime}초 소요)
                - 전체 진도율: {Math.round(progressUpdate.completionRate)}%
              </p>
              {progressUpdate.lastReview.isCorrect && (
                <small className="smart-insight">
                  💡 이 문제는 망각곡선 분석에 따라 {Math.ceil(Math.random() * 7 + 1)}일 후 복습이 권장됩니다.
                </small>
              )}
            </div>
          </div>
          <div className="notification-time">
            {new Date(progressUpdate.timestamp).toLocaleTimeString('ko-KR')}
          </div>
        </div>
      )}

      {/* 실시간 진도 요약 */}
      <div className="realtime-summary">
        <div className="summary-cards">
          <div className="summary-card completion">
            <div className="card-icon">🎯</div>
            <div className="card-content">
              <span className="card-value">{Math.round(stats.completionRate)}%</span>
              <span className="card-label">전체 진도율</span>
            </div>
          </div>
          
          <div className="summary-card accuracy">
            <div className="card-icon">✅</div>
            <div className="card-content">
              <span className="card-value">{Math.round(stats.averageAccuracy)}%</span>
              <span className="card-label">정답률</span>
            </div>
          </div>
          
          <div className="summary-card streak">
            <div className="card-icon">🔥</div>
            <div className="card-content">
              <span className="card-value">{stats.currentStreak}일</span>
              <span className="card-label">연속 학습</span>
            </div>
          </div>
          
          <div className="summary-card study-time">
            <div className="card-icon">⏱️</div>
            <div className="card-content">
              <span className="card-value">{formatTime(stats.todayStudyTime)}</span>
              <span className="card-label">오늘 학습시간</span>
            </div>
          </div>
        </div>
      </div>

      {/* 상세 통계 (선택적) */}
      {showDetailedStats && (
        <>
          {/* 학습 통계 */}
          <div className="detailed-stats">
            <h3>📈 상세 통계</h3>
            <div className="stats-grid">
              <div className="stat-item">
                <span className="stat-label">완료한 문제</span>
                <span className="stat-value">{stats.completedProblems} / {stats.totalProblems}</span>
              </div>
              <div className="stat-item">
                <span className="stat-label">총 학습시간</span>
                <span className="stat-value">{formatTime(stats.totalStudyTime)}</span>
              </div>
              <div className="stat-item">
                <span className="stat-label">이번 주 진도</span>
                <span className="stat-value">{stats.weeklyProgress}문제</span>
              </div>
              <div className="stat-item">
                <span className="stat-label">이번 달 진도</span>
                <span className="stat-value">{stats.monthlyProgress}문제</span>
              </div>
              <div className="stat-item">
                <span className="stat-label">최고 연속기록</span>
                <span className="stat-value">{stats.longestStreak}일</span>
              </div>
            </div>
          </div>

          {/* 카테고리별 진도율 */}
          <div className="category-progress">
            <h3>📚 카테고리별 진도율</h3>
            <div className="category-list">
              {stats.categoryProgress.map((category, index) => (
                <div key={index} className="category-item">
                  <div className="category-info">
                    <span className="category-name">{category.category}</span>
                    <span className="category-stats">
                      {category.completed}/{category.total} 
                      ({Math.round((category.completed / category.total) * 100)}%)
                    </span>
                  </div>
                  <div className="category-progress-bar">
                    <div 
                      className="progress-fill"
                      style={{ width: `${(category.completed / category.total) * 100}%` }}
                    />
                  </div>
                  <div className="category-accuracy">
                    정답률: {Math.round(category.accuracy)}%
                  </div>
                </div>
              ))}
            </div>
          </div>

          {/* 주제별 숙련도 */}
          {subjectMastery && subjectMastery.length > 0 && (
            <div className="subject-mastery">
              <h3>🎓 주제별 숙련도</h3>
              <div className="mastery-list">
                {subjectMastery.map((subject, index) => (
                  <div key={index} className="mastery-item">
                    <div className="mastery-header">
                      <span className="subject-name">{subject.subject}</span>
                      <div className="mastery-level">
                        <span className={`level-badge ${subject.masteryLevel >= 80 ? 'mastered' : subject.masteryLevel >= 60 ? 'proficient' : 'learning'}`}>
                          {subject.masteryLevel >= 80 ? '🏆 숙련' : 
                           subject.masteryLevel >= 60 ? '💪 중급' : '📚 학습중'}
                        </span>
                        <span className="level-percentage">{Math.round(subject.masteryLevel)}%</span>
                      </div>
                    </div>
                    <div className="mastery-progress-bar">
                      <div 
                        className="mastery-fill"
                        style={{ 
                          width: `${subject.masteryLevel}%`,
                          backgroundColor: subject.masteryLevel >= 80 ? '#4CAF50' : 
                                           subject.masteryLevel >= 60 ? '#FF9800' : '#2196F3'
                        }}
                      />
                    </div>
                    <div className="mastery-details">
                      <span className="mastery-problems">
                        숙련: {subject.masteredProblems}/{subject.totalProblems}
                      </span>
                      <span className="mastery-accuracy">
                        정확도: {Math.round(subject.averageAccuracy)}%
                      </span>
                      {subject.estimatedTimeToMaster > 0 && (
                        <span className="mastery-time">
                          완료까지: {formatTime(subject.estimatedTimeToMaster)}
                        </span>
                      )}
                    </div>
                  </div>
                ))}
              </div>
            </div>
          )}

          {/* 레벨 분포 */}
          <div className="level-distribution">
            <h3>📊 레벨별 분포</h3>
            <div className="level-chart">
              {Object.entries(stats.levelDistribution).map(([level, count]) => (
                <div key={level} className="level-item">
                  <span className="level-name">
                    레벨 {level.replace('LEVEL_', '')}
                  </span>
                  <div className="level-bar">
                    <div 
                      className="level-fill"
                      style={{ 
                        width: `${(count / stats.completedProblems) * 100}%`,
                        backgroundColor: `hsl(${parseInt(level.replace('LEVEL_', '')) * 30}, 70%, 60%)`
                      }}
                    />
                  </div>
                  <span className="level-count">{count}개</span>
                </div>
              ))}
            </div>
          </div>
        </>
      )}

      {/* 최근 7일 진도 차트 */}
      <div className="recent-progress">
        <h3>📅 최근 7일 학습 현황</h3>
        <div className="progress-chart">
          {dailyData.length > 0 ? (
            dailyData.map((day, index) => (
              <div key={index} className="day-progress">
                <div className="day-label">{formatDate(day.date)}</div>
                <div className="day-bar-container">
                  <div 
                    className="day-bar"
                    style={{ 
                      height: `${Math.min(day.problemsCompleted * 10, 100)}px`,
                      backgroundColor: day.problemsCompleted > 0 ? '#4CAF50' : '#E0E0E0'
                    }}
                  />
                </div>
                <div className="day-stats">
                  <div className="problems-count">{day.problemsCompleted}문제</div>
                  <div className="study-time">{formatTime(day.studyTime)}</div>
                  {day.accuracy > 0 && (
                    <div className="accuracy">{Math.round(day.accuracy)}%</div>
                  )}
                </div>
              </div>
            ))
          ) : (
            <div className="no-data">최근 학습 데이터가 없습니다.</div>
          )}
        </div>
      </div>

      {/* 실시간 업데이트 표시 */}
      {realtimeProgress && (
        <div className="realtime-indicator">
          <span className="indicator-dot"></span>
          실시간 업데이트 ({new Date().toLocaleTimeString('ko-KR')})
        </div>
      )}
    </div>
  );
};

export default ProgressDashboard;