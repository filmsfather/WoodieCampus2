import { useState, useEffect } from 'react';
import {
  Chart as ChartJS,
  CategoryScale,
  LinearScale,
  PointElement,
  LineElement,
  Title,
  Tooltip,
  Legend,
  ArcElement,
  BarElement,
} from 'chart.js';
import { Line, Doughnut, Bar } from 'react-chartjs-2';
import {
  TrendingUp,
  BookOpen,
  Target,
  Clock,
  Calendar,
  Award,
  Activity,
  Users,
} from 'lucide-react';
import apiService from '../../services/api';
import { useAuth } from '../../contexts/AuthContext';

ChartJS.register(
  CategoryScale,
  LinearScale,
  PointElement,
  LineElement,
  Title,
  Tooltip,
  Legend,
  ArcElement,
  BarElement
);

interface DashboardData {
  overallStats: {
    totalStudyTime: number;
    totalProblems: number;
    correctAnswers: number;
    currentStreak: number;
    avgAccuracy: number;
  };
  progressData: {
    date: string;
    accuracy: number;
    problemsSolved: number;
  }[];
  categoryStats: {
    categoryName: string;
    totalProblems: number;
    correctAnswers: number;
    accuracy: number;
  }[];
  weeklyActivity: {
    day: string;
    studyTime: number;
    problemsSolved: number;
  }[];
}

export function LearningDashboard() {
  const { user } = useAuth();
  const [data, setData] = useState<DashboardData | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');
  const [timeRange, setTimeRange] = useState('30'); // days

  useEffect(() => {
    loadDashboardData();
  }, [timeRange]);

  const loadDashboardData = async () => {
    try {
      setLoading(true);
      setError('');

      const [analyticsResponse, progressResponse] = await Promise.all([
        apiService.getAnalytics({ period: timeRange }),
        apiService.getProgress(),
      ]);

      if (analyticsResponse.success && progressResponse.success) {
        // 실제 API 응답 구조에 맞게 조정 필요
        setData({
          overallStats: {
            totalStudyTime: progressResponse.data?.totalStudyTime || 0,
            totalProblems: progressResponse.data?.totalProblems || 0,
            correctAnswers: progressResponse.data?.correctAnswers || 0,
            currentStreak: progressResponse.data?.currentStreak || 0,
            avgAccuracy: progressResponse.data?.avgAccuracy || 0,
          },
          progressData: analyticsResponse.data?.progressData || [],
          categoryStats: analyticsResponse.data?.categoryStats || [],
          weeklyActivity: analyticsResponse.data?.weeklyActivity || [],
        });
      }
    } catch (err) {
      setError(err instanceof Error ? err.message : '데이터를 불러오는데 실패했습니다');
    } finally {
      setLoading(false);
    }
  };

  const progressChartData = {
    labels: data?.progressData.map(d => new Date(d.date).toLocaleDateString()) || [],
    datasets: [
      {
        label: '정확도 (%)',
        data: data?.progressData.map(d => d.accuracy) || [],
        borderColor: 'rgb(59, 130, 246)',
        backgroundColor: 'rgba(59, 130, 246, 0.1)',
        tension: 0.3,
      },
    ],
  };

  const categoryChartData = {
    labels: data?.categoryStats.map(c => c.categoryName) || [],
    datasets: [
      {
        data: data?.categoryStats.map(c => c.accuracy) || [],
        backgroundColor: [
          '#3B82F6',
          '#10B981',
          '#F59E0B',
          '#EF4444',
          '#8B5CF6',
          '#EC4899',
        ],
      },
    ],
  };

  const activityChartData = {
    labels: data?.weeklyActivity.map(a => a.day) || [],
    datasets: [
      {
        label: '학습 시간 (분)',
        data: data?.weeklyActivity.map(a => a.studyTime) || [],
        backgroundColor: 'rgba(59, 130, 246, 0.8)',
      },
      {
        label: '해결한 문제 수',
        data: data?.weeklyActivity.map(a => a.problemsSolved) || [],
        backgroundColor: 'rgba(16, 185, 129, 0.8)',
      },
    ],
  };

  const StatCard = ({ icon: Icon, title, value, subtitle, color = 'primary' }: {
    icon: any;
    title: string;
    value: string | number;
    subtitle?: string;
    color?: string;
  }) => {
    const colorClasses = {
      primary: 'bg-primary-50 text-primary-600',
      success: 'bg-success-50 text-success-600',
      warning: 'bg-warning-50 text-warning-600',
      error: 'bg-error-50 text-error-600',
    };

    return (
      <div className="bg-white p-6 rounded-lg shadow">
        <div className="flex items-center">
          <div className={`p-3 rounded-full ${colorClasses[color as keyof typeof colorClasses] || colorClasses.primary}`}>
            <Icon className="h-6 w-6" />
          </div>
          <div className="ml-4">
            <h3 className="text-sm font-medium text-gray-900">{title}</h3>
            <p className="text-2xl font-bold text-gray-900">{value}</p>
            {subtitle && <p className="text-sm text-gray-500">{subtitle}</p>}
          </div>
        </div>
      </div>
    );
  };

  if (loading) {
    return (
      <div className="flex items-center justify-center min-h-[400px]">
        <div className="animate-spin rounded-full h-8 w-8 border-b-2 border-primary-600"></div>
      </div>
    );
  }

  if (error) {
    return (
      <div className="bg-error-50 border border-error-200 rounded-md p-4">
        <p className="text-error-600">{error}</p>
        <button
          onClick={loadDashboardData}
          className="btn btn-primary btn-sm mt-2"
        >
          다시 시도
        </button>
      </div>
    );
  }

  return (
    <div className="max-w-7xl mx-auto space-y-8">
      {/* 헤더 */}
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-3xl font-bold text-gray-900">학습 대시보드</h1>
          <p className="mt-2 text-gray-600">
            안녕하세요, {user?.name}님! 학습 진도를 확인해보세요.
          </p>
        </div>
        
        <select
          value={timeRange}
          onChange={(e) => setTimeRange(e.target.value)}
          className="input w-32"
        >
          <option value="7">7일</option>
          <option value="30">30일</option>
          <option value="90">90일</option>
        </select>
      </div>

      {/* 통계 카드 */}
      <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-6">
        <StatCard
          icon={BookOpen}
          title="총 문제 수"
          value={data?.overallStats.totalProblems || 0}
          subtitle="해결한 문제"
        />
        <StatCard
          icon={Target}
          title="평균 정확도"
          value={`${Math.round(data?.overallStats.avgAccuracy || 0)}%`}
          color="success"
        />
        <StatCard
          icon={Clock}
          title="학습 시간"
          value={`${Math.round((data?.overallStats.totalStudyTime || 0) / 60)}시간`}
          subtitle="누적 학습 시간"
          color="warning"
        />
        <StatCard
          icon={Award}
          title="연속 학습일"
          value={data?.overallStats.currentStreak || 0}
          subtitle="일"
          color="error"
        />
      </div>

      {/* 차트 영역 */}
      <div className="grid grid-cols-1 lg:grid-cols-2 gap-8">
        {/* 진도 추이 */}
        <div className="bg-white p-6 rounded-lg shadow">
          <div className="flex items-center justify-between mb-4">
            <h2 className="text-lg font-semibold text-gray-900">학습 진도 추이</h2>
            <TrendingUp className="h-5 w-5 text-gray-400" />
          </div>
          {data?.progressData.length ? (
            <Line
              data={progressChartData}
              options={{
                responsive: true,
                scales: {
                  y: {
                    beginAtZero: true,
                    max: 100,
                  },
                },
                plugins: {
                  legend: {
                    display: false,
                  },
                },
              }}
            />
          ) : (
            <div className="flex items-center justify-center h-64 text-gray-500">
              데이터가 없습니다
            </div>
          )}
        </div>

        {/* 카테고리별 성과 */}
        <div className="bg-white p-6 rounded-lg shadow">
          <div className="flex items-center justify-between mb-4">
            <h2 className="text-lg font-semibold text-gray-900">카테고리별 성과</h2>
            <Activity className="h-5 w-5 text-gray-400" />
          </div>
          {data?.categoryStats.length ? (
            <Doughnut
              data={categoryChartData}
              options={{
                responsive: true,
                plugins: {
                  legend: {
                    position: 'bottom' as const,
                  },
                },
              }}
            />
          ) : (
            <div className="flex items-center justify-center h-64 text-gray-500">
              데이터가 없습니다
            </div>
          )}
        </div>

        {/* 주간 활동 */}
        <div className="bg-white p-6 rounded-lg shadow lg:col-span-2">
          <div className="flex items-center justify-between mb-4">
            <h2 className="text-lg font-semibold text-gray-900">주간 학습 활동</h2>
            <Calendar className="h-5 w-5 text-gray-400" />
          </div>
          {data?.weeklyActivity.length ? (
            <Bar
              data={activityChartData}
              options={{
                responsive: true,
                scales: {
                  y: {
                    beginAtZero: true,
                  },
                },
              }}
            />
          ) : (
            <div className="flex items-center justify-center h-64 text-gray-500">
              데이터가 없습니다
            </div>
          )}
        </div>
      </div>

      {/* 카테고리별 상세 */}
      {data?.categoryStats.length ? (
        <div className="bg-white rounded-lg shadow overflow-hidden">
          <div className="px-6 py-4 border-b border-gray-200">
            <h2 className="text-lg font-semibold text-gray-900">카테고리별 상세 성과</h2>
          </div>
          <div className="overflow-x-auto">
            <table className="min-w-full divide-y divide-gray-200">
              <thead className="bg-gray-50">
                <tr>
                  <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">
                    카테고리
                  </th>
                  <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">
                    총 문제 수
                  </th>
                  <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">
                    정답 수
                  </th>
                  <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">
                    정확도
                  </th>
                  <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">
                    진행률
                  </th>
                </tr>
              </thead>
              <tbody className="bg-white divide-y divide-gray-200">
                {data.categoryStats.map((category, index) => (
                  <tr key={index}>
                    <td className="px-6 py-4 whitespace-nowrap text-sm font-medium text-gray-900">
                      {category.categoryName}
                    </td>
                    <td className="px-6 py-4 whitespace-nowrap text-sm text-gray-500">
                      {category.totalProblems}
                    </td>
                    <td className="px-6 py-4 whitespace-nowrap text-sm text-gray-500">
                      {category.correctAnswers}
                    </td>
                    <td className="px-6 py-4 whitespace-nowrap text-sm text-gray-500">
                      {Math.round(category.accuracy)}%
                    </td>
                    <td className="px-6 py-4 whitespace-nowrap">
                      <div className="w-full bg-gray-200 rounded-full h-2">
                        <div
                          className="bg-primary-600 h-2 rounded-full"
                          style={{ width: `${category.accuracy}%` }}
                        ></div>
                      </div>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </div>
      ) : null}
    </div>
  );
}