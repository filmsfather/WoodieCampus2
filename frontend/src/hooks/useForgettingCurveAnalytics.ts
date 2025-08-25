import { useState, useEffect, useCallback } from 'react';

// 망각곡선 분석 인터페이스들
export interface ForgettingCurveData {
  userId: string;
  totalReviews: number;
  successRate: number;
  retentionRate: number;
  averageResponseTime: number;
  retentionCurve: {
    day: number;
    retention: number;
    retentionRate: number;
  }[];
  categoryAnalysis: {
    category: string;
    totalReviews: number;
    successRate: number;
    averageResponseTime: number;
    retentionScore: number;
  }[];
  levelDistribution: {
    [key: string]: number;
  };
  timeAnalysis: {
    hourly: {
      hour: number;
      totalReviews: number;
      successRate: number;
      averageResponseTime: number;
    }[];
    daily: {
      dayOfWeek: number;
      totalReviews: number;
      successRate: number;
    }[];
  };
  reviewPerformance: {
    date: string;
    totalReviews: number;
    successRate: number;
    averageResponseTime: number;
  }[];
}

export interface LearningEfficiencyData {
  userId: string;
  overallEfficiency: number;
  forgettingRateByCategory: {
    [category: string]: {
      forgettingRate: number;
      category: string;
    };
  };
  learningPattern: {
    bestTimeOfDay: string;
    consistencyScore: number;
    averageSessionLength: number;
    preferredDifficulty: string;
  };
  timeToMastery: {
    [category: string]: {
      estimatedDays: number;
      currentProgress: number;
    };
  };
  recommendations: string[];
}

export interface RetentionCurveData {
  retentionCurve: {
    day: number;
    retention: number;
    retentionRate: number;
  }[];
  levelProgression: {
    [level: string]: number;
  };
}

export interface CategoryPerformanceData {
  categoryAnalysis: ForgettingCurveData['categoryAnalysis'];
  forgettingRateByCategory: LearningEfficiencyData['forgettingRateByCategory'];
  timeToMastery: LearningEfficiencyData['timeToMastery'];
}

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

// API 호출 유틸리티 함수
const apiRequest = async <T>(endpoint: string): Promise<T> => {
  const response = await fetch(`/api/analytics${endpoint}`, {
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
export const useForgettingCurveAnalytics = (days: number = 30) => {
  const [data, setData] = useState<ForgettingCurveData | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  const fetchData = useCallback(async () => {
    try {
      setLoading(true);
      setError(null);
      const result = await apiRequest<ForgettingCurveData>(`/forgetting-curve?days=${days}`);
      setData(result);
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

// 학습 효율성 분석 Hook
export const useLearningEfficiency = () => {
  const [data, setData] = useState<LearningEfficiencyData | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  const fetchData = useCallback(async () => {
    try {
      setLoading(true);
      setError(null);
      const result = await apiRequest<LearningEfficiencyData>('/learning-efficiency');
      setData(result);
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

// 보존율 곡선 Hook
export const useRetentionCurve = () => {
  const [data, setData] = useState<RetentionCurveData | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  const fetchData = useCallback(async () => {
    try {
      setLoading(true);
      setError(null);
      const result = await apiRequest<RetentionCurveData>('/retention-curve');
      setData(result);
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

// 카테고리 성능 분석 Hook
export const useCategoryPerformance = (days: number = 30) => {
  const [data, setData] = useState<CategoryPerformanceData | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  const fetchData = useCallback(async () => {
    try {
      setLoading(true);
      setError(null);
      const result = await apiRequest<CategoryPerformanceData>(`/category-performance?days=${days}`);
      setData(result);
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

// 분석 요약 Hook
export const useAnalyticsSummary = (days: number = 30) => {
  const [data, setData] = useState<AnalyticsSummary | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  const fetchData = useCallback(async () => {
    try {
      setLoading(true);
      setError(null);
      const result = await apiRequest<AnalyticsSummary>(`/summary?days=${days}`);
      setData(result);
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

// 통합 망각곡선 분석 Hook
export const useForgettingCurveDashboard = (options: {
  days?: number;
  enableRetentionCurve?: boolean;
  enableCategoryAnalysis?: boolean;
  enableEfficiencyAnalysis?: boolean;
} = {}) => {
  const {
    days = 30,
    enableRetentionCurve = true,
    enableCategoryAnalysis = true,
    enableEfficiencyAnalysis = true
  } = options;

  const forgettingCurveHook = useForgettingCurveAnalytics(days);
  const summaryHook = useAnalyticsSummary(days);
  const retentionCurveHook = enableRetentionCurve ? useRetentionCurve() : null;
  const categoryPerformanceHook = enableCategoryAnalysis ? useCategoryPerformance(days) : null;
  const efficiencyHook = enableEfficiencyAnalysis ? useLearningEfficiency() : null;

  // 전체 새로고침 함수
  const refreshAll = useCallback(() => {
    forgettingCurveHook.refresh();
    summaryHook.refresh();
    retentionCurveHook?.refresh();
    categoryPerformanceHook?.refresh();
    efficiencyHook?.refresh();
  }, [forgettingCurveHook, summaryHook, retentionCurveHook, categoryPerformanceHook, efficiencyHook]);

  // 캐시 무효화 함수
  const invalidateCache = useCallback(async () => {
    try {
      await apiRequest('/invalidate-cache');
      // 약간의 지연 후 새로고침
      setTimeout(refreshAll, 1000);
    } catch (error) {
      console.error('Failed to invalidate cache:', error);
    }
  }, [refreshAll]);

  return {
    // 분석 데이터
    forgettingCurveData: forgettingCurveHook.data,
    summaryData: summaryHook.data,
    retentionCurveData: retentionCurveHook?.data || null,
    categoryPerformanceData: categoryPerformanceHook?.data || null,
    efficiencyData: efficiencyHook?.data || null,
    
    // 로딩 상태
    loading: {
      forgettingCurve: forgettingCurveHook.loading,
      summary: summaryHook.loading,
      retentionCurve: retentionCurveHook?.loading || false,
      categoryPerformance: categoryPerformanceHook?.loading || false,
      efficiency: efficiencyHook?.loading || false
    },
    
    // 에러 상태
    error: {
      forgettingCurve: forgettingCurveHook.error,
      summary: summaryHook.error,
      retentionCurve: retentionCurveHook?.error || null,
      categoryPerformance: categoryPerformanceHook?.error || null,
      efficiency: efficiencyHook?.error || null
    },
    
    // 액션 함수들
    refreshAll,
    invalidateCache
  };
};

export default useForgettingCurveDashboard;