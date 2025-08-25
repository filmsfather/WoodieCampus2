import React, { useState } from 'react';
import { useAnalyticsDashboard } from '../../hooks/useAnalytics';
import './AnalyticsDashboard.css';

interface AnalyticsDashboardProps {
  userId: string;
  className?: string;
}

// 레벨 이름을 한글로 변환하는 함수
const getLevelName = (level: string): string => {
  const levelMap: { [key: string]: string } = {
    'LEVEL_1': '초급 (20분)',
    'LEVEL_2': '기초 (1시간)',
    'LEVEL_3': '발전 (8시간)',
    'LEVEL_4': '중급 (1일)',
    'LEVEL_5': '숙련 (3일)',
    'LEVEL_6': '고급 (7일)',
    'LEVEL_7': '전문 (14일)',
    'LEVEL_8': '마스터 (30일)'
  };
  return levelMap[level] || level;
};

export const AnalyticsDashboard: React.FC<AnalyticsDashboardProps> = ({
  userId,
  className = ''
}) => {
  const [selectedPeriod, setSelectedPeriod] = useState(30);
  const [activeTab, setActiveTab] = useState<'overview' | 'detailed' | 'patterns'>('overview');

  const {
    summary,
    forgettingCurve,
    efficiency,
    timePatterns,
    categoryPerformance,
    loading,
    error,
    refreshAll
  } = useAnalyticsDashboard({
    days: selectedPeriod,
    autoRefresh: true
  });

  // 로딩 상태일 때
  if (loading.summary) {
    return (
      <div className={`analytics-dashboard loading ${className}`}>
        <div className="loading-container">
          <div className="loading-spinner"></div>
          <h3>📊 학습 데이터 분석 중...</h3>
          <p>망각곡선과 학습 패턴을 분석하고 있습니다</p>
        </div>
      </div>
    );
  }

  // 에러 상태일 때
  if (error.summary) {
    return (
      <div className={`analytics-dashboard error ${className}`}>
        <div className="error-container">
          <h3>⚠️ 분석 데이터를 불러올 수 없습니다</h3>
          <p>{error.summary}</p>
          <button onClick={refreshAll} className="retry-btn">
            🔄 다시 시도
          </button>
        </div>
      </div>
    );
  }

  if (!summary) {
    return (
      <div className={`analytics-dashboard ${className}`}>
        <div className="no-data">
          <h3>📈 분석할 데이터가 부족합니다</h3>
          <p>더 많은 복습을 완료한 후에 상세한 분석을 확인할 수 있습니다.</p>
        </div>
      </div>
    );
  }

  return (
    <div className={`analytics-dashboard ${className}`}>
      {/* 대시보드 헤더 */}
      <div className="dashboard-header">
        <div className="header-content">
          <h2>🧠 망각곡선 분석 대시보드</h2>
          <p>AI가 분석한 나만의 학습 패턴을 확인해보세요</p>
        </div>
        
        <div className="header-controls">
          {/* 기간 선택 */}
          <div className="period-selector">
            <label>분석 기간:</label>
            <select 
              value={selectedPeriod} 
              onChange={(e) => setSelectedPeriod(Number(e.target.value))}
            >
              <option value={7}>최근 7일</option>
              <option value={30}>최근 30일</option>
              <option value={90}>최근 90일</option>
            </select>
          </div>
          
          {/* 새로고침 버튼 */}
          <button 
            onClick={refreshAll}
            className="refresh-btn"
            disabled={loading.summary}
          >
            {loading.summary ? '분석 중...' : '🔄 새로고침'}
          </button>
        </div>
      </div>

      {/* 탭 네비게이션 */}
      <div className="tab-navigation">
        <button 
          className={`tab-btn ${activeTab === 'overview' ? 'active' : ''}`}
          onClick={() => setActiveTab('overview')}
        >
          📊 종합 분석
        </button>
        <button 
          className={`tab-btn ${activeTab === 'detailed' ? 'active' : ''}`}
          onClick={() => setActiveTab('detailed')}
        >
          📈 상세 분석
        </button>
        <button 
          className={`tab-btn ${activeTab === 'patterns' ? 'active' : ''}`}
          onClick={() => setActiveTab('patterns')}
        >
          🕒 학습 패턴
        </button>
      </div>

      {/* 탭 콘텐츠 */}
      <div className="tab-content">
        {activeTab === 'overview' && (
          <div className="overview-tab">
            {/* 전체 성과 요약 */}
            <div className="summary-cards">
              <div className="summary-card primary">
                <div className="card-header">
                  <h3>🎯 학습 효율성</h3>
                  <span className="period-badge">{summary.period}</span>
                </div>
                <div className="efficiency-score">
                  <span className="score-value">{summary.overallStats.efficiencyScore}</span>
                  <span className="score-label">점</span>
                </div>
                <div className="score-description">
                  {summary.overallStats.efficiencyScore >= 80 ? '매우 우수한 학습 효율성!' :
                   summary.overallStats.efficiencyScore >= 60 ? '좋은 학습 패턴을 보이고 있어요' :
                   summary.overallStats.efficiencyScore >= 40 ? '학습 방법을 개선해보세요' :
                   '더 체계적인 복습이 필요해요'}
                </div>
              </div>

              <div className="summary-card">
                <div className="card-icon">📚</div>
                <div className="card-content">
                  <span className="card-value">{summary.overallStats.totalReviews}</span>
                  <span className="card-label">총 복습 횟수</span>
                </div>
              </div>

              <div className="summary-card">
                <div className="card-icon">✅</div>
                <div className="card-content">
                  <span className="card-value">{summary.overallStats.successRate}%</span>
                  <span className="card-label">전체 정답률</span>
                </div>
              </div>

              <div className="summary-card">
                <div className="card-icon">🧠</div>
                <div className="card-content">
                  <span className="card-value">{summary.overallStats.retentionRate}%</span>
                  <span className="card-label">기억 보존률</span>
                </div>
              </div>

              <div className="summary-card">
                <div className="card-icon">⏱️</div>
                <div className="card-content">
                  <span className="card-value">{summary.overallStats.averageResponseTime}초</span>
                  <span className="card-label">평균 응답시간</span>
                </div>
              </div>

              <div className="summary-card">
                <div className="card-icon">⏰</div>
                <div className="card-content">
                  <span className="card-value">{summary.bestStudyTime}</span>
                  <span className="card-label">최적 학습시간</span>
                </div>
              </div>
            </div>

            {/* 강점과 약점 분석 */}
            <div className="strengths-weaknesses">
              <div className="analysis-section">
                <h3>💪 잘하는 분야 (Top 3)</h3>
                <div className="category-list">
                  {summary.topCategories.map((category, index) => (
                    <div key={index} className="category-item strong">
                      <div className="category-rank">#{index + 1}</div>
                      <div className="category-info">
                        <span className="category-name">{category.category}</span>
                        <span className="category-stats">
                          정답률 {category.successRate}% ({category.totalReviews}회)
                        </span>
                      </div>
                      <div className="category-badge success">강점</div>
                    </div>
                  ))}
                </div>
              </div>

              <div className="analysis-section">
                <h3>📈 개선 필요 분야 (Bottom 3)</h3>
                <div className="category-list">
                  {summary.weakCategories.map((category, index) => (
                    <div key={index} className="category-item weak">
                      <div className="category-rank">#{index + 1}</div>
                      <div className="category-info">
                        <span className="category-name">{category.category}</span>
                        <span className="category-stats">
                          정답률 {category.successRate}% ({category.totalReviews}회)
                        </span>
                      </div>
                      <div className="category-badge warning">개선필요</div>
                    </div>
                  ))}
                </div>
              </div>
            </div>

            {/* AI 추천사항 */}
            <div className="recommendations">
              <h3>🤖 AI 맞춤 추천</h3>
              <div className="recommendation-list">
                {summary.recommendations.map((recommendation, index) => (
                  <div key={index} className="recommendation-item">
                    <div className="recommendation-icon">💡</div>
                    <div className="recommendation-text">{recommendation}</div>
                  </div>
                ))}
              </div>
            </div>
          </div>
        )}

        {activeTab === 'detailed' && (
          <div className="detailed-tab">
            {/* 레벨 분포 차트 */}
            <div className="chart-section">
              <h3>📊 망각곡선 레벨 분포</h3>
              <div className="level-distribution-chart">
                {Object.entries(summary.levelDistribution).map(([level, count]) => {
                  const total = Object.values(summary.levelDistribution).reduce((sum, c) => sum + c, 0);
                  const percentage = total > 0 ? (count / total) * 100 : 0;
                  
                  return (
                    <div key={level} className="level-bar">
                      <div className="level-info">
                        <span className="level-name">{getLevelName(level)}</span>
                        <span className="level-count">{count}개 ({Math.round(percentage)}%)</span>
                      </div>
                      <div className="bar-container">
                        <div 
                          className="bar-fill"
                          style={{ 
                            width: `${percentage}%`,
                            backgroundColor: `hsl(${parseInt(level.replace('LEVEL_', '')) * 35}, 65%, 55%)`
                          }}
                        />
                      </div>
                    </div>
                  );
                })}
              </div>
            </div>

            {/* 카테고리별 상세 성능 */}
            {categoryPerformance?.data && (
              <div className="chart-section">
                <h3>📚 카테고리별 학습 성과</h3>
                <div className="category-performance-grid">
                  {categoryPerformance.data.categoryAnalysis.map((category, index) => (
                    <div key={index} className="category-performance-card">
                      <div className="category-header">
                        <h4>{category.category}</h4>
                        <div className="performance-score">
                          <span className={`score ${category.successRate >= 80 ? 'excellent' : 
                                                   category.successRate >= 60 ? 'good' : 'needs-improvement'}`}>
                            {Math.round(category.successRate)}%
                          </span>
                        </div>
                      </div>
                      <div className="category-metrics">
                        <div className="metric">
                          <span className="metric-label">복습 횟수</span>
                          <span className="metric-value">{category.totalReviews}회</span>
                        </div>
                        <div className="metric">
                          <span className="metric-label">평균 레벨</span>
                          <span className="metric-value">{category.averageLevel.toFixed(1)}</span>
                        </div>
                        <div className="metric">
                          <span className="metric-label">보존률</span>
                          <span className="metric-value">{Math.round(category.retentionRate)}%</span>
                        </div>
                      </div>
                    </div>
                  ))}
                </div>
              </div>
            )}

            {/* 망각률 분석 */}
            {categoryPerformance?.data?.forgettingRateByCategory && (
              <div className="chart-section">
                <h3>🧠 카테고리별 망각률 분석</h3>
                <div className="forgetting-rate-chart">
                  {categoryPerformance.data.forgettingRateByCategory.map((item, index) => (
                    <div key={index} className="forgetting-item">
                      <div className="item-header">
                        <span className="category-name">{item.category}</span>
                        <span className={`forgetting-rate ${item.forgettingRate <= 20 ? 'low' : 
                                                            item.forgettingRate <= 40 ? 'medium' : 'high'}`}>
                          망각률 {Math.round(item.forgettingRate)}%
                        </span>
                      </div>
                      <div className="optimal-interval">
                        <span>💡 권장 복습 간격: {Math.round(item.optimalInterval)}시간</span>
                      </div>
                    </div>
                  ))}
                </div>
              </div>
            )}
          </div>
        )}

        {activeTab === 'patterns' && (
          <div className="patterns-tab">
            {/* 시간대별 학습 패턴 */}
            {timePatterns?.data && (
              <div className="chart-section">
                <h3>🕒 시간대별 학습 효율</h3>
                <div className="time-analysis-chart">
                  <div className="time-chart-grid">
                    {timePatterns.data.timeAnalysis.map((timeData, index) => {
                      const maxSuccessRate = Math.max(...timePatterns.data.timeAnalysis.map(t => t.successRate));
                      const relativeHeight = maxSuccessRate > 0 ? (timeData.successRate / maxSuccessRate) * 100 : 0;
                      
                      return (
                        <div key={index} className="time-slot">
                          <div className="time-bar-container">
                            <div 
                              className="time-bar"
                              style={{ 
                                height: `${relativeHeight}%`,
                                backgroundColor: timeData.successRate >= 80 ? '#4CAF50' : 
                                                timeData.successRate >= 60 ? '#FF9800' : '#F44336'
                              }}
                              title={`${timeData.hour}시: 성공률 ${Math.round(timeData.successRate)}%`}
                            />
                          </div>
                          <div className="time-label">{timeData.hour}시</div>
                          <div className="time-stats">
                            <div className="success-rate">{Math.round(timeData.successRate)}%</div>
                            <div className="review-count">{timeData.reviewCount}회</div>
                          </div>
                        </div>
                      );
                    })}
                  </div>
                  <div className="chart-legend">
                    <div className="legend-item">
                      <div className="legend-color excellent"></div>
                      <span>우수 (80% 이상)</span>
                    </div>
                    <div className="legend-item">
                      <div className="legend-color good"></div>
                      <span>양호 (60~80%)</span>
                    </div>
                    <div className="legend-item">
                      <div className="legend-color poor"></div>
                      <span>개선 필요 (60% 미만)</span>
                    </div>
                  </div>
                </div>
              </div>
            )}

            {/* 일별 성과 추이 */}
            {timePatterns?.data?.dailyPerformance && (
              <div className="chart-section">
                <h3>📅 일별 학습 성과 추이</h3>
                <div className="daily-performance-chart">
                  {timePatterns.data.dailyPerformance.slice(-14).map((day, index) => {
                    const date = new Date(day.date);
                    const dayName = date.toLocaleDateString('ko-KR', { 
                      month: 'short', 
                      day: 'numeric',
                      weekday: 'short'
                    });
                    
                    return (
                      <div key={index} className="daily-item">
                        <div className="day-info">
                          <span className="day-name">{dayName}</span>
                          <span className="day-reviews">{day.totalReviews}회</span>
                        </div>
                        <div className="day-metrics">
                          <div className="metric">
                            <span className="metric-label">정답률</span>
                            <span className={`metric-value ${day.successRate >= 80 ? 'excellent' : 
                                                           day.successRate >= 60 ? 'good' : 'poor'}`}>
                              {Math.round(day.successRate)}%
                            </span>
                          </div>
                          <div className="metric">
                            <span className="metric-label">응답시간</span>
                            <span className="metric-value">{Math.round(day.averageResponseTime)}초</span>
                          </div>
                        </div>
                      </div>
                    );
                  })}
                </div>
              </div>
            )}

            {/* 학습 일관성 분석 */}
            {efficiency && (
              <div className="chart-section">
                <h3>📈 학습 패턴 분석</h3>
                <div className="consistency-analysis">
                  <div className="consistency-card">
                    <div className="consistency-header">
                      <h4>🔥 학습 일관성</h4>
                      <span className={`consistency-score ${efficiency.learningPattern.consistencyScore >= 80 ? 'excellent' : 
                                                           efficiency.learningPattern.consistencyScore >= 60 ? 'good' : 'poor'}`}>
                        {Math.round(efficiency.learningPattern.consistencyScore)}점
                      </span>
                    </div>
                    <div className="consistency-description">
                      {efficiency.learningPattern.consistencyScore >= 80 ? '매우 꾸준한 학습 습관을 보이고 있어요!' :
                       efficiency.learningPattern.consistencyScore >= 60 ? '꽤 일관된 학습 패턴을 보이고 있어요' :
                       '더 꾸준한 학습 습관을 만들어보세요'}
                    </div>
                  </div>

                  <div className="pattern-insights">
                    <div className="insight-item">
                      <span className="insight-label">🕐 최적 학습 시간</span>
                      <span className="insight-value">{efficiency.learningPattern.bestTimeOfDay}</span>
                    </div>
                    <div className="insight-item">
                      <span className="insight-label">💪 강점 영역</span>
                      <span className="insight-value">{efficiency.strengths.length}개 분야</span>
                    </div>
                    <div className="insight-item">
                      <span className="insight-label">📈 개선 영역</span>
                      <span className="insight-value">{efficiency.weaknesses.length}개 분야</span>
                    </div>
                  </div>
                </div>
              </div>
            )}
          </div>
        )}
      </div>

      {/* 데이터 업데이트 시간 표시 */}
      <div className="dashboard-footer">
        <span className="last-updated">
          마지막 업데이트: {new Date().toLocaleString('ko-KR')}
        </span>
        <span className="data-info">
          💡 데이터는 복습 완료 시 자동으로 업데이트됩니다
        </span>
      </div>
    </div>
  );
};

export default AnalyticsDashboard;