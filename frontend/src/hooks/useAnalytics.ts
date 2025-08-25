import { useState, useEffect, useCallback } from 'react';

// 망각곡선 분석 데이터 타입
export interface ForgettingCurveAnalytics {
  userId: string;
  totalReviews: number;
  successRate: number;
  retentionRate: number;
  averageResponseTime: number;
  memoryStrength: number;
  difficultyAdjustment: number;
  levelDistribution: {
    [key: string]: number;
  };
  reviewPerformance: {
    date: string;
    successRate: number;
    totalReviews: number;
    averageResponseTime: number;
    retentionScore: number;
  }[];
  categoryAnalysis: {
    category: string;
    successRate: number;
    averageLevel: number;
    totalReviews: number;
    retentionRate: number;
  }[];
  timeAnalysis: {
    hour: number;
    successRate: number;
    averageResponseTime: number;
    reviewCount: number;
  }[];
  levelProgressionFlow: {
    from: string;
    to: string;
    count: number;
    successRate: number;
  }[];
  retentionCurve: {
    level: string;
    daysSinceReview: number;
    retentionRate: number;
    sampleSize: number;
  }[];
}

// 학습 효율성 메트릭 타입
export interface LearningEfficiencyMetrics {
  userId: string;
  overallEfficiency: number;
  strengths: string[];
  weaknesses: string[];
  recommendations: string[];
  timeToMastery: {
    category: string;
    averageDays: number;
    currentProgress: number;
  }[];
  forgettingRateByCategory: {
    category: string;
    forgettingRate: number;
    optimalInterval: number;
  }[];
  learningPattern: {
    bestTimeOfDay: string;
    consistencyScore: number;
    streakAnalysis: {
      averageStreakLength: number;
      longestStreak: number;
      breakPatterns: string[];
    };
  };
}

// 분석 요약 데이터 타입
export interface AnalyticsSummary {
  userId: string;
  period: string;
  overallStats: {
    totalReviews: number;
    successRate: number;
    retentionRate: number;
    averageResponseTime: number;
    efficiencyScore: number;
  };
  topCategories: {
    category: string;
    successRate: number;
    totalReviews: number;
  }[];
  weakCategories: {
    category: string;
    successRate: number;
    totalReviews: number;
  }[];
  levelDistribution: {
    [key: string]: number;
  };
  bestStudyTime: string;
  consistencyScore: number;
  recommendations: string[];
}

// API 호출 유틸리티
const fetchAnalyticsData = async <T>(endpoint: string, params: Record<string, string> = {}): Promise<T> => {
  const url = new URL(`/api/analytics${endpoint}`, window.location.origin);
  Object.entries(params).forEach(([key, value]) => {
    url.searchParams.append(key, value);
  });

  const response = await fetch(url.toString(), {
    headers: {
      'Authorization': `Bearer ${localStorage.getItem('accessToken')}`
    }
  });

  if (!response.ok) {
    throw new Error(`Failed to fetch analytics data: ${response.statusText}`);
  }

  const result = await response.json();
  if (!result.success) {
    throw new Error(result.message || 'API request failed');
  }

  return result.data;
};

// 망각곡선 분석 Hook
export const useForgettingCurveAnalytics = (days: number = 30, autoRefresh: boolean = false) => {
  const [data, setData] = useState<ForgettingCurveAnalytics | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  const fetchData = useCallback(async () => {
    try {
      setError(null);
      setLoading(true);
      const analytics = await fetchAnalyticsData<ForgettingCurveAnalytics>('/forgetting-curve', {
        days: days.toString()
      });
      setData(analytics);
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Unknown error');
    } finally {
      setLoading(false);
    }
  }, [days]);

  useEffect(() => {
    fetchData();
  }, [fetchData]);

  // 자동 새로고침
  useEffect(() => {
    if (autoRefresh) {
      const interval = setInterval(fetchData, 5 * 60 * 1000); // 5분마다
      return () => clearInterval(interval);
    }
  }, [autoRefresh, fetchData]);

  return {
    data,
    loading,
    error,
    refresh: fetchData
  };
};

// 학습 효율성 분석 Hook
export const useLearningEfficiencyMetrics = (autoRefresh: boolean = false) => {
  const [data, setData] = useState<LearningEfficiencyMetrics | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  const fetchData = useCallback(async () => {
    try {
      setError(null);
      setLoading(true);
      const metrics = await fetchAnalyticsData<LearningEfficiencyMetrics>('/learning-efficiency');
      setData(metrics);
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Unknown error');
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    fetchData();
  }, [fetchData]);

  // 자동 새로고침
  useEffect(() => {
    if (autoRefresh) {
      const interval = setInterval(fetchData, 10 * 60 * 1000); // 10분마다
      return () => clearInterval(interval);
    }
  }, [autoRefresh, fetchData]);

  return {
    data,
    loading,
    error,
    refresh: fetchData
  };
};

// 분석 요약 Hook
export const useAnalyticsSummary = (days: number = 30, autoRefresh: boolean = false) => {
  const [data, setData] = useState<AnalyticsSummary | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  const fetchData = useCallback(async () => {
    try {
      setError(null);
      setLoading(true);
      const summary = await fetchAnalyticsData<AnalyticsSummary>('/summary', {
        days: days.toString()
      });
      setData(summary);
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Unknown error');
    } finally {
      setLoading(false);
    }
  }, [days]);

  useEffect(() => {
    fetchData();
  }, [fetchData]);

  // 자동 새로고침
  useEffect(() => {
    if (autoRefresh) {
      const interval = setInterval(fetchData, 5 * 60 * 1000); // 5분마다
      return () => clearInterval(interval);
    }
  }, [autoRefresh, fetchData]);

  return {
    data,
    loading,
    error,
    refresh: fetchData
  };
};

// 보존율 곡선 Hook
export const useRetentionCurve = () => {
  const [data, setData] = useState<{
    retentionCurve: any[];
    levelProgression: any[];
  } | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  const fetchData = useCallback(async () => {
    try {
      setError(null);
      setLoading(true);
      const curveData = await fetchAnalyticsData<{
        retentionCurve: any[];
        levelProgression: any[];
      }>('/retention-curve');
      setData(curveData);
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Unknown error');
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    fetchData();
  }, [fetchData]);

  return {
    data,
    loading,
    error,
    refresh: fetchData
  };
};

// 시간 패턴 분석 Hook
export const useTimePatterns = (days: number = 30) => {
  const [data, setData] = useState<{
    timeAnalysis: any[];
    dailyPerformance: any[];
  } | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  const fetchData = useCallback(async () => {
    try {
      setError(null);
      setLoading(true);
      const patterns = await fetchAnalyticsData<{
        timeAnalysis: any[];
        dailyPerformance: any[];
      }>('/time-patterns', {
        days: days.toString()
      });
      setData(patterns);
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Unknown error');
    } finally {
      setLoading(false);
    }
  }, [days]);

  useEffect(() => {
    fetchData();
  }, [fetchData]);

  return {
    data,
    loading,
    error,
    refresh: fetchData
  };
};

// 카테고리 성능 분석 Hook
export const useCategoryPerformance = (days: number = 30) => {
  const [data, setData] = useState<{
    categoryAnalysis: any[];
    forgettingRateByCategory: any[];
    timeToMastery: any[];
  } | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  const fetchData = useCallback(async () => {
    try {
      setError(null);
      setLoading(true);
      const performance = await fetchAnalyticsData<{
        categoryAnalysis: any[];
        forgettingRateByCategory: any[];
        timeToMastery: any[];
      }>('/category-performance', {
        days: days.toString()
      });
      setData(performance);
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Unknown error');
    } finally {
      setLoading(false);
    }
  }, [days]);

  useEffect(() => {
    fetchData();
  }, [fetchData]);

  return {
    data,
    loading,
    error,
    refresh: fetchData
  };
};

// 캐시 무효화 Hook
export const useAnalyticsCache = () => {
  const [invalidating, setInvalidating] = useState(false);

  const invalidateCache = useCallback(async () => {
    try {
      setInvalidating(true);
      await fetch('/api/analytics/invalidate-cache', {
        method: 'POST',
        headers: {
          'Authorization': `Bearer ${localStorage.getItem('accessToken')}`
        }
      });
    } catch (error) {
      console.error('Failed to invalidate analytics cache:', error);
    } finally {
      setInvalidating(false);
    }
  }, []);

  return {
    invalidateCache,
    invalidating
  };
};

// 통합 분석 Hook
export const useAnalyticsDashboard = (options: {
  days?: number;
  autoRefresh?: boolean;
} = {}) => {
  const { days = 30, autoRefresh = false } = options;

  const summaryHook = useAnalyticsSummary(days, autoRefresh);
  const forgettingCurveHook = useForgettingCurveAnalytics(days, autoRefresh);
  const efficiencyHook = useLearningEfficiencyMetrics(autoRefresh);
  const retentionHook = useRetentionCurve();
  const timePatternsHook = useTimePatterns(days);
  const categoryHook = useCategoryPerformance(days);
  const cacheHook = useAnalyticsCache();

  // 전체 새로고침 함수
  const refreshAll = useCallback(() => {
    summaryHook.refresh();
    forgettingCurveHook.refresh();
    efficiencyHook.refresh();
    retentionHook.refresh();
    timePatternsHook.refresh();
    categoryHook.refresh();
  }, [summaryHook, forgettingCurveHook, efficiencyHook, retentionHook, timePatternsHook, categoryHook]);

  // 복습 완료 후 호출할 함수
  const onReviewComplete = useCallback(async () => {
    // 캐시 무효화 후 데이터 새로고침
    await cacheHook.invalidateCache();
    // 약간의 지연 후 새로고침
    setTimeout(refreshAll, 2000);
  }, [cacheHook, refreshAll]);

  return {
    // 데이터
    summary: summaryHook.data,
    forgettingCurve: forgettingCurveHook.data,
    efficiency: efficiencyHook.data,
    retention: retentionHook.data,
    timePatterns: timePatternsHook.data,
    categoryPerformance: categoryHook.data,
    
    // 로딩 상태
    loading: {
      summary: summaryHook.loading,
      forgettingCurve: forgettingCurveHook.loading,
      efficiency: efficiencyHook.loading,
      retention: retentionHook.loading,
      timePatterns: timePatternsHook.loading,
      categoryPerformance: categoryHook.loading,
      cache: cacheHook.invalidating
    },
    
    // 에러 상태
    error: {
      summary: summaryHook.error,
      forgettingCurve: forgettingCurveHook.error,
      efficiency: efficiencyHook.error,
      retention: retentionHook.error,
      timePatterns: timePatternsHook.error,
      categoryPerformance: categoryHook.error
    },
    
    // 액션 함수들
    refreshAll,
    onReviewComplete,
    invalidateCache: cacheHook.invalidateCache
  };
};

export default useAnalyticsDashboard;