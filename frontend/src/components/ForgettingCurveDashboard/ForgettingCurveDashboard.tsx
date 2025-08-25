import React, { useState } from 'react';
import {
  Chart as ChartJS,
  CategoryScale,
  LinearScale,
  PointElement,
  LineElement,
  BarElement,
  Title,
  Tooltip,
  Legend,
  ArcElement,
  RadialLinearScale,
  Filler
} from 'chart.js';
import { Line, Bar, Doughnut, Radar } from 'react-chartjs-2';
import useForgettingCurveDashboard from '../../hooks/useForgettingCurveAnalytics';
import './ForgettingCurveDashboard.css';

// Chart.js 플러그인 등록
ChartJS.register(
  CategoryScale,
  LinearScale,
  PointElement,
  LineElement,
  BarElement,
  Title,
  Tooltip,
  Legend,
  ArcElement,
  RadialLinearScale,
  Filler
);

interface ForgettingCurveDashboardProps {
  userId?: string;
  period?: number;
  showAdminFeatures?: boolean;
}

export const ForgettingCurveDashboard: React.FC<ForgettingCurveDashboardProps> = ({
  userId,
  period = 30,
  showAdminFeatures = false
}) => {
  const [selectedPeriod, setSelectedPeriod] = useState(period);
  const [activeTab, setActiveTab] = useState<'overview' | 'retention' | 'categories' | 'efficiency'>('overview');

  const {
    forgettingCurveData,
    summaryData,
    retentionCurveData,
    categoryPerformanceData,
    efficiencyData,
    loading,
    error,
    refreshAll,
    invalidateCache
  } = useForgettingCurveDashboard({
    days: selectedPeriod,
    enableRetentionCurve: true,
    enableCategoryAnalysis: true,
    enableEfficiencyAnalysis: true
  });

  // 망각곡선 차트 데이터
  const forgettingCurveChartData = {
    labels: retentionCurveData?.retentionCurve.map(point => `${point.day}일`) || [],
    datasets: [
      {
        label: '기억 유지율 (%)',
        data: retentionCurveData?.retentionCurve.map(point => point.retentionRate) || [],
        borderColor: 'rgb(255, 99, 132)',
        backgroundColor: 'rgba(255, 99, 132, 0.1)',
        tension: 0.4,
        fill: true,
        pointRadius: 4,
        pointHoverRadius: 6,
      },
    ],
  };

  const forgettingCurveOptions = {
    responsive: true,
    plugins: {
      title: {
        display: true,
        text: '🧠 개인별 망각곡선 분석',
        font: {
          size: 16,
          weight: 'bold' as const
        }
      },
      tooltip: {
        callbacks: {
          label: function(context: any) {
            return `${context.dataset.label}: ${context.parsed.y.toFixed(1)}%`;
          }
        }
      }
    },
    scales: {
      x: {
        title: {
          display: true,
          text: '시간 경과'
        }
      },
      y: {
        title: {
          display: true,
          text: '기억 유지율 (%)'
        },
        min: 0,
        max: 100
      }
    }
  };

  // 카테고리별 성능 차트 데이터
  const categoryPerformanceChartData = {
    labels: categoryPerformanceData?.categoryAnalysis.map(cat => cat.category) || [],
    datasets: [
      {
        label: '정답률 (%)',
        data: categoryPerformanceData?.categoryAnalysis.map(cat => cat.successRate) || [],
        backgroundColor: [
          'rgba(54, 162, 235, 0.8)',
          'rgba(255, 99, 132, 0.8)',
          'rgba(255, 205, 86, 0.8)',
          'rgba(75, 192, 192, 0.8)',
          'rgba(153, 102, 255, 0.8)',
          'rgba(255, 159, 64, 0.8)',
        ],
        borderColor: [
          'rgba(54, 162, 235, 1)',
          'rgba(255, 99, 132, 1)',
          'rgba(255, 205, 86, 1)',
          'rgba(75, 192, 192, 1)',
          'rgba(153, 102, 255, 1)',
          'rgba(255, 159, 64, 1)',
        ],
        borderWidth: 2
      }
    ]
  };

  // 시간대별 학습 패턴 차트 데이터
  const timePatternChartData = {
    labels: forgettingCurveData?.timeAnalysis.hourly.map(hour => `${hour.hour}시`) || [],
    datasets: [
      {
        label: '정답률 (%)',
        data: forgettingCurveData?.timeAnalysis.hourly.map(hour => hour.successRate) || [],
        borderColor: 'rgb(75, 192, 192)',
        backgroundColor: 'rgba(75, 192, 192, 0.2)',
        tension: 0.3,
        fill: true
      },
      {
        label: '학습량 (문제 수)',
        data: forgettingCurveData?.timeAnalysis.hourly.map(hour => hour.totalReviews) || [],
        borderColor: 'rgb(255, 159, 64)',
        backgroundColor: 'rgba(255, 159, 64, 0.2)',
        yAxisID: 'y1',
        tension: 0.3
      }
    ]
  };

  const timePatternOptions = {
    responsive: true,
    interaction: {
      mode: 'index' as const,
      intersect: false,
    },
    plugins: {
      title: {
        display: true,
        text: '⏰ 시간대별 학습 효율 분석'
      }
    },
    scales: {
      x: {
        display: true,
        title: {
          display: true,
          text: '시간대'
        }
      },
      y: {
        type: 'linear' as const,
        display: true,
        position: 'left' as const,
        title: {
          display: true,
          text: '정답률 (%)'
        }
      },
      y1: {
        type: 'linear' as const,
        display: true,
        position: 'right' as const,
        title: {
          display: true,
          text: '학습량 (문제 수)'
        },
        grid: {
          drawOnChartArea: false,
        },
      },
    },
  };

  // 복습 효과성 분석 차트 데이터
  const reviewEffectivenessData = {
    labels: ['즉시 복습', '1일 후', '3일 후', '7일 후', '14일 후', '30일 후'],
    datasets: [
      {
        label: '복습 효과 (%)',
        data: [100, 85, 75, 65, 55, 45], // 실제 데이터로 대체 필요
        backgroundColor: 'rgba(54, 162, 235, 0.6)',
        borderColor: 'rgba(54, 162, 235, 1)',
        borderWidth: 2
      }
    ]
  };

  // 로딩 상태 처리
  if (loading.summary) {
    return (
      <div className="forgetting-curve-dashboard loading">
        <div className="loading-spinner">
          <div className="spinner"></div>
          <p>망각곡선 분석 데이터를 불러오는 중...</p>
        </div>
      </div>
    );
  }

  // 에러 상태 처리
  if (error.summary || error.forgettingCurve) {
    return (
      <div className="forgetting-curve-dashboard error">
        <div className="error-message">
          <h3>⚠️ 데이터를 불러올 수 없습니다</h3>
          <p>{error.summary || error.forgettingCurve}</p>
          <button onClick={refreshAll} className="retry-btn">
            다시 시도
          </button>
        </div>
      </div>
    );
  }

  if (!summaryData || !forgettingCurveData) {
    return (
      <div className="forgetting-curve-dashboard">
        <p>분석 데이터가 없습니다.</p>
      </div>
    );
  }

  return (
    <div className="forgetting-curve-dashboard">
      {/* 헤더 */}
      <div className="dashboard-header">
        <div className="header-left">
          <h2>🧠 망각곡선 데이터 분석 대시보드</h2>
          <div className="period-selector">
            <label>분석 기간:</label>
            <select 
              value={selectedPeriod} 
              onChange={(e) => setSelectedPeriod(parseInt(e.target.value))}
            >
              <option value={7}>7일</option>
              <option value={30}>30일</option>
              <option value={90}>90일</option>
              <option value={365}>1년</option>
            </select>
          </div>
        </div>
        <div className="header-actions">
          <button onClick={invalidateCache} className="cache-btn">
            🔄 캐시 초기화
          </button>
          <button onClick={refreshAll} className="refresh-btn">
            📊 새로고침
          </button>
        </div>
      </div>

      {/* 탭 네비게이션 */}
      <div className="tab-navigation">
        <button 
          className={`tab-btn ${activeTab === 'overview' ? 'active' : ''}`}
          onClick={() => setActiveTab('overview')}
        >
          📋 개요
        </button>
        <button 
          className={`tab-btn ${activeTab === 'retention' ? 'active' : ''}`}
          onClick={() => setActiveTab('retention')}
        >
          📈 망각곡선
        </button>
        <button 
          className={`tab-btn ${activeTab === 'categories' ? 'active' : ''}`}
          onClick={() => setActiveTab('categories')}
        >
          📚 카테고리 분석
        </button>
        <button 
          className={`tab-btn ${activeTab === 'efficiency' ? 'active' : ''}`}
          onClick={() => setActiveTab('efficiency')}
        >
          ⚡ 학습 효율성
        </button>
      </div>

      {/* 탭 콘텐츠 */}
      <div className="tab-content">
        {activeTab === 'overview' && (
          <div className="overview-tab">
            {/* 주요 지표 요약 */}
            <div className="summary-cards">
              <div className="summary-card success-rate">
                <div className="card-icon">🎯</div>
                <div className="card-content">
                  <span className="card-value">{summaryData.overallStats.successRate}%</span>
                  <span className="card-label">전체 정답률</span>
                </div>
              </div>
              
              <div className="summary-card retention-rate">
                <div className="card-icon">🧠</div>
                <div className="card-content">
                  <span className="card-value">{summaryData.overallStats.retentionRate}%</span>
                  <span className="card-label">기억 유지율</span>
                </div>
              </div>
              
              <div className="summary-card efficiency-score">
                <div className="card-icon">⚡</div>
                <div className="card-content">
                  <span className="card-value">{summaryData.overallStats.efficiencyScore}</span>
                  <span className="card-label">학습 효율성</span>
                </div>
              </div>
              
              <div className="summary-card total-reviews">
                <div className="card-icon">📝</div>
                <div className="card-content">
                  <span className="card-value">{summaryData.overallStats.totalReviews}</span>
                  <span className="card-label">총 복습 횟수</span>
                </div>
              </div>
            </div>

            {/* 최고/취약 카테고리 */}
            <div className="category-insights">
              <div className="insight-section top-categories">
                <h3>🏆 우수한 카테고리</h3>
                <div className="category-list">
                  {summaryData.topCategories.map((category, index) => (
                    <div key={index} className="category-item top">
                      <span className="category-name">{category.category}</span>
                      <span className="category-score">{category.successRate}%</span>
                      <span className="category-count">({category.totalReviews}문제)</span>
                    </div>
                  ))}
                </div>
              </div>
              
              <div className="insight-section weak-categories">
                <h3>🎯 개선이 필요한 카테고리</h3>
                <div className="category-list">
                  {summaryData.weakCategories.map((category, index) => (
                    <div key={index} className="category-item weak">
                      <span className="category-name">{category.category}</span>
                      <span className="category-score">{category.successRate}%</span>
                      <span className="category-count">({category.totalReviews}문제)</span>
                    </div>
                  ))}
                </div>
              </div>
            </div>

            {/* AI 추천사항 */}
            <div className="recommendations">
              <h3>🤖 AI 학습 추천</h3>
              <div className="recommendation-list">
                {summaryData.recommendations.map((rec, index) => (
                  <div key={index} className="recommendation-item">
                    <span className="recommendation-icon">💡</span>
                    <span className="recommendation-text">{rec}</span>
                  </div>
                ))}
              </div>
            </div>
          </div>
        )}

        {activeTab === 'retention' && (
          <div className="retention-tab">
            {/* 망각곡선 차트 */}
            <div className="chart-container large">
              <Line data={forgettingCurveChartData} options={forgettingCurveOptions} />
            </div>

            {/* 복습 효과성 분석 */}
            <div className="chart-container">
              <Bar 
                data={reviewEffectivenessData} 
                options={{
                  responsive: true,
                  plugins: {
                    title: {
                      display: true,
                      text: '📊 복습 시점별 효과성 분석'
                    }
                  },
                  scales: {
                    y: {
                      beginAtZero: true,
                      max: 100,
                      title: {
                        display: true,
                        text: '복습 효과 (%)'
                      }
                    }
                  }
                }}
              />
            </div>
          </div>
        )}

        {activeTab === 'categories' && (
          <div className="categories-tab">
            {/* 카테고리별 성능 */}
            <div className="chart-container">
              <Bar 
                data={categoryPerformanceChartData} 
                options={{
                  responsive: true,
                  plugins: {
                    title: {
                      display: true,
                      text: '📚 카테고리별 학습 성과 분석'
                    }
                  },
                  scales: {
                    y: {
                      beginAtZero: true,
                      max: 100,
                      title: {
                        display: true,
                        text: '정답률 (%)'
                      }
                    }
                  }
                }}
              />
            </div>

            {/* 카테고리별 상세 통계 */}
            <div className="category-detailed-stats">
              <h3>📊 카테고리별 상세 분석</h3>
              <div className="stats-table">
                <div className="table-header">
                  <span>카테고리</span>
                  <span>정답률</span>
                  <span>복습 횟수</span>
                  <span>평균 응답시간</span>
                  <span>유지 점수</span>
                </div>
                {categoryPerformanceData?.categoryAnalysis.map((category, index) => (
                  <div key={index} className="table-row">
                    <span className="category-name">{category.category}</span>
                    <span className={`success-rate ${category.successRate >= 80 ? 'good' : category.successRate >= 60 ? 'average' : 'poor'}`}>
                      {category.successRate.toFixed(1)}%
                    </span>
                    <span className="total-reviews">{category.totalReviews}</span>
                    <span className="response-time">{category.averageResponseTime.toFixed(1)}초</span>
                    <span className="retention-score">{category.retentionScore.toFixed(1)}</span>
                  </div>
                ))}
              </div>
            </div>
          </div>
        )}

        {activeTab === 'efficiency' && (
          <div className="efficiency-tab">
            {/* 시간대별 학습 패턴 */}
            <div className="chart-container large">
              <Line data={timePatternChartData} options={timePatternOptions} />
            </div>

            {/* 학습 패턴 인사이트 */}
            <div className="efficiency-insights">
              <div className="insight-card">
                <div className="insight-icon">🕐</div>
                <div className="insight-content">
                  <h4>최적 학습 시간</h4>
                  <p>{summaryData.bestStudyTime}</p>
                </div>
              </div>
              
              <div className="insight-card">
                <div className="insight-icon">📈</div>
                <div className="insight-content">
                  <h4>학습 일관성</h4>
                  <p>{summaryData.consistencyScore}점</p>
                </div>
              </div>
              
              <div className="insight-card">
                <div className="insight-icon">⏱️</div>
                <div className="insight-content">
                  <h4>평균 응답시간</h4>
                  <p>{summaryData.overallStats.averageResponseTime.toFixed(1)}초</p>
                </div>
              </div>
            </div>

            {/* 효율성 개선 제안 */}
            {efficiencyData && (
              <div className="efficiency-recommendations">
                <h3>🚀 학습 효율성 개선 방안</h3>
                <div className="recommendation-grid">
                  {efficiencyData.recommendations.map((recommendation, index) => (
                    <div key={index} className="efficiency-recommendation-card">
                      <div className="recommendation-header">
                        <span className="recommendation-number">{index + 1}</span>
                        <span className="recommendation-priority">우선순위 {index === 0 ? '높음' : index === 1 ? '중간' : '낮음'}</span>
                      </div>
                      <p className="recommendation-content">{recommendation}</p>
                    </div>
                  ))}
                </div>
              </div>
            )}
          </div>
        )}
      </div>
    </div>
  );
};

export default ForgettingCurveDashboard;