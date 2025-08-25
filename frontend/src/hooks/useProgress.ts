import { useState, useEffect, useCallback } from 'react';
import { useSocket } from './useSocket';

// 진도율 통계 인터페이스
export interface UserProgressStats {
  userId: string;
  totalProblems: number;
  completedProblems: number;
  completionRate: number;
  averageAccuracy: number;
  totalStudyTime: number; // minutes
  todayStudyTime: number; // minutes
  currentStreak: number; // days
  longestStreak: number; // days
  weeklyProgress: number; // problems completed this week
  monthlyProgress: number; // problems completed this month
  levelDistribution: {
    [key: string]: number;
  };
  categoryProgress: {
    category: string;
    completed: number;
    total: number;
    accuracy: number;
  }[];
}

// 일별 진도 데이터
export interface DailyProgressData {
  date: string;
  problemsCompleted: number;
  studyTime: number;
  accuracy: number;
  streak: number;
}

// 실시간 진도 요약
export interface RealtimeProgress {
  completionRate: number;
  todayProgress: number;
  currentStreak: number;
  studyTime: number;
}

// 주제별 숙련도 인터페이스
export interface SubjectMastery {
  subject: string;
  masteryLevel: number; // 0-100
  totalProblems: number;
  masteredProblems: number;
  averageAccuracy: number;
  estimatedTimeToMaster: number; // 분
}

// 실시간 진도율 업데이트 인터페이스
export interface ProgressUpdate {
  userId: string;
  timestamp: string;
  completionRate: number;
  todayProgress: number;
  currentStreak: number;
  studyTime: number;
  lastReview: {
    problemId: string;
    isCorrect: boolean;
    responseTime: number;
    difficulty: number;
  };
}

// 세션 진도 인터페이스
export interface SessionProgress {
  sessionId: string;
  userId: string;
  timestamp: string;
  stats: {
    problemsAttempted: number;
    problemsCorrect: number;
    accuracy: number;
    totalTime: number;
    averageTimePerProblem: number;
    difficulty: number;
  };
}

// 종합 진도 통계
export interface LiveStats {
  overall: RealtimeProgress;
  subjectMastery: SubjectMastery[];
  weeklyTrend: DailyProgressData[];
  summary: {
    totalSubjects: number;
    masteredSubjects: number;
    averageMastery: number;
    weakestSubject: string | null;
  };
}

// API 호출 유틸리티
const fetchProgressData = async <T>(endpoint: string): Promise<T> => {
  const response = await fetch(`/api/progress${endpoint}`, {
    headers: {
      'Authorization': `Bearer ${localStorage.getItem('accessToken')}`
    }
  });

  if (!response.ok) {
    throw new Error(`Failed to fetch progress data: ${response.statusText}`);
  }

  return response.json();
};

// 전체 진도율 통계 Hook
export const useProgressStats = () => {
  const [stats, setStats] = useState<UserProgressStats | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  const fetchStats = useCallback(async () => {
    try {
      setLoading(true);
      setError(null);
      const data = await fetchProgressData<UserProgressStats>('/stats');
      setStats(data);
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Unknown error');
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    fetchStats();
  }, [fetchStats]);

  const refreshStats = useCallback(() => {
    fetchStats();
  }, [fetchStats]);

  return {
    stats,
    loading,
    error,
    refreshStats
  };
};

// 일별 진도 데이터 Hook
export const useDailyProgress = (days: number = 30) => {
  const [dailyData, setDailyData] = useState<DailyProgressData[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  const fetchDailyData = useCallback(async () => {
    try {
      setLoading(true);
      setError(null);
      const data = await fetchProgressData<DailyProgressData[]>(`/daily?days=${days}`);
      setDailyData(data);
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Unknown error');
    } finally {
      setLoading(false);
    }
  }, [days]);

  useEffect(() => {
    fetchDailyData();
  }, [fetchDailyData]);

  return {
    dailyData,
    loading,
    error,
    refresh: fetchDailyData
  };
};

// 실시간 진도 Hook
export const useRealtimeProgress = (refreshInterval: number = 30000) => {
  const [progress, setProgress] = useState<RealtimeProgress | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  const fetchRealtimeData = useCallback(async () => {
    try {
      setError(null);
      const data = await fetchProgressData<RealtimeProgress>('/realtime');
      setProgress(data);
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Unknown error');
    } finally {
      setLoading(false);
    }
  }, []);

  // 초기 로드
  useEffect(() => {
    fetchRealtimeData();
  }, [fetchRealtimeData]);

  // 정기적 업데이트
  useEffect(() => {
    if (refreshInterval > 0) {
      const interval = setInterval(fetchRealtimeData, refreshInterval);
      return () => clearInterval(interval);
    }
  }, [fetchRealtimeData, refreshInterval]);

  const refreshProgress = useCallback(() => {
    fetchRealtimeData();
  }, [fetchRealtimeData]);

  return {
    progress,
    loading,
    error,
    refreshProgress
  };
};

// 진도율 캐시 무효화 Hook
export const useProgressInvalidation = () => {
  const [invalidating, setInvalidating] = useState(false);

  const invalidateCache = useCallback(async () => {
    try {
      setInvalidating(true);
      await fetch('/api/progress/invalidate', {
        method: 'POST',
        headers: {
          'Authorization': `Bearer ${localStorage.getItem('accessToken')}`
        }
      });
    } catch (error) {
      console.error('Failed to invalidate progress cache:', error);
    } finally {
      setInvalidating(false);
    }
  }, []);

  return {
    invalidateCache,
    invalidating
  };
};

// 실시간 진도율 업데이트 Hook (WebSocket 기반)
export const useRealtimeProgressUpdates = () => {
  const [progressUpdate, setProgressUpdate] = useState<ProgressUpdate | null>(null);
  const [sessionProgress, setSessionProgress] = useState<SessionProgress | null>(null);
  const { socket, isConnected } = useSocket();

  useEffect(() => {
    if (!socket || !isConnected) return;

    // 진도율 업데이트 이벤트 리스너
    const handleProgressUpdate = (update: ProgressUpdate) => {
      setProgressUpdate(update);
      console.log('Real-time progress update received:', update);
    };

    // 세션 진도 업데이트 이벤트 리스너
    const handleSessionProgress = (progress: SessionProgress) => {
      setSessionProgress(progress);
      console.log('Session progress update received:', progress);
    };

    // 이벤트 리스너 등록
    socket.on('progress-updated', handleProgressUpdate);
    socket.on('session-progress', handleSessionProgress);

    // 진도율 업데이트 구독
    socket.emit('subscribe-progress', { subscriptionType: 'own' });

    // 정리 함수
    return () => {
      socket.off('progress-updated', handleProgressUpdate);
      socket.off('session-progress', handleSessionProgress);
      socket.emit('unsubscribe-progress', { subscriptionType: 'own' });
    };
  }, [socket, isConnected]);

  // 실시간 진도율 업데이트 전송
  const updateProgress = useCallback(async (reviewData: {
    problemId: string;
    isCorrect: boolean;
    responseTime: number;
    difficulty?: number;
  }) => {
    try {
      const response = await fetch('/api/progress/update-realtime', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'Authorization': `Bearer ${localStorage.getItem('accessToken')}`
        },
        body: JSON.stringify(reviewData)
      });

      if (!response.ok) {
        console.error('Failed to update progress in real-time');
      }
    } catch (error) {
      console.error('Error updating progress:', error);
    }
  }, []);

  // 학습 세션 추적 시작
  const startSession = useCallback((sessionData: {
    sessionId: string;
    problemSetId?: string;
    difficulty?: number;
  }) => {
    if (socket && isConnected) {
      socket.emit('start-learning-session', sessionData);
    }
  }, [socket, isConnected]);

  // 학습 세션 진도 업데이트
  const updateSessionProgress = useCallback((sessionData: {
    sessionId: string;
    problemId: string;
    isCorrect: boolean;
    responseTime: number;
    difficulty: number;
    currentIndex: number;
    totalProblems: number;
  }) => {
    if (socket && isConnected) {
      socket.emit('update-learning-progress', sessionData);
    }
  }, [socket, isConnected]);

  // 학습 세션 완료
  const completeSession = useCallback((sessionData: {
    sessionId: string;
    totalProblems: number;
    correctAnswers: number;
    totalTime: number;
    averageResponseTime: number;
  }) => {
    if (socket && isConnected) {
      socket.emit('complete-learning-session', sessionData);
    }
  }, [socket, isConnected]);

  return {
    progressUpdate,
    sessionProgress,
    isConnected,
    updateProgress,
    startSession,
    updateSessionProgress,
    completeSession
  };
};

// 주제별 숙련도 Hook
export const useSubjectMastery = () => {
  const [masteryData, setMasteryData] = useState<SubjectMastery[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  const fetchMasteryData = useCallback(async () => {
    try {
      setLoading(true);
      setError(null);
      const response = await fetchProgressData<{ success: boolean; data: SubjectMastery[] }>('/subject-mastery');
      setMasteryData(response.data);
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Unknown error');
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    fetchMasteryData();
  }, [fetchMasteryData]);

  return {
    masteryData,
    loading,
    error,
    refresh: fetchMasteryData
  };
};

// 종합 진도 통계 Hook
export const useLiveStats = () => {
  const [liveStats, setLiveStats] = useState<LiveStats | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  const fetchLiveStats = useCallback(async () => {
    try {
      setLoading(true);
      setError(null);
      const response = await fetchProgressData<{ success: boolean; data: LiveStats }>('/live-stats');
      setLiveStats(response.data);
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Unknown error');
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    fetchLiveStats();
  }, [fetchLiveStats]);

  return {
    liveStats,
    loading,
    error,
    refresh: fetchLiveStats
  };
};

// 통합 진도율 Hook (모든 기능을 하나로)
export const useProgress = (options: {
  enableRealtime?: boolean;
  enableWebSocket?: boolean;
  realtimeInterval?: number;
  dailyDataDays?: number;
  enableSubjectMastery?: boolean;
  enableLiveStats?: boolean;
} = {}) => {
  const {
    enableRealtime = true,
    enableWebSocket = true,
    realtimeInterval = 30000,
    dailyDataDays = 30,
    enableSubjectMastery = false,
    enableLiveStats = false
  } = options;

  const statsHook = useProgressStats();
  const dailyHook = useDailyProgress(dailyDataDays);
  const realtimeHook = useRealtimeProgress(enableRealtime ? realtimeInterval : 0);
  const invalidationHook = useProgressInvalidation();
  
  // 실시간 WebSocket 업데이트 (선택적)
  const realtimeUpdatesHook = useRealtimeProgressUpdates();
  
  // 주제별 숙련도 (선택적)
  const masteryHook = enableSubjectMastery ? useSubjectMastery() : null;
  
  // 종합 진도 통계 (선택적)
  const liveStatsHook = enableLiveStats ? useLiveStats() : null;

  // 전체 새로고침 함수
  const refreshAll = useCallback(() => {
    statsHook.refreshStats();
    dailyHook.refresh();
    realtimeHook.refreshProgress();
    masteryHook?.refresh();
    liveStatsHook?.refresh();
  }, [statsHook, dailyHook, realtimeHook, masteryHook, liveStatsHook]);

  // 복습 완료 후 호출할 함수 (실시간 업데이트 포함)
  const onReviewComplete = useCallback(async (reviewData?: {
    problemId: string;
    isCorrect: boolean;
    responseTime: number;
    difficulty?: number;
  }) => {
    // 실시간 진도율 업데이트 (WebSocket 사용 시)
    if (enableWebSocket && reviewData) {
      await realtimeUpdatesHook.updateProgress(reviewData);
    }
    
    // 캐시 무효화 후 데이터 새로고침
    await invalidationHook.invalidateCache();
    
    // 약간의 지연 후 새로고침 (캐시 무효화 반영 대기)
    setTimeout(refreshAll, 1000);
  }, [enableWebSocket, realtimeUpdatesHook, invalidationHook, refreshAll]);

  return {
    // 통계 데이터
    stats: statsHook.stats,
    dailyData: dailyHook.dailyData,
    realtimeProgress: realtimeHook.progress,
    subjectMastery: masteryHook?.masteryData,
    liveStats: liveStatsHook?.liveStats,
    
    // 실시간 업데이트 데이터
    progressUpdate: enableWebSocket ? realtimeUpdatesHook.progressUpdate : null,
    sessionProgress: enableWebSocket ? realtimeUpdatesHook.sessionProgress : null,
    isSocketConnected: enableWebSocket ? realtimeUpdatesHook.isConnected : false,
    
    // 로딩 상태
    loading: {
      stats: statsHook.loading,
      daily: dailyHook.loading,
      realtime: realtimeHook.loading,
      mastery: masteryHook?.loading || false,
      liveStats: liveStatsHook?.loading || false,
      invalidating: invalidationHook.invalidating
    },
    
    // 에러 상태
    error: {
      stats: statsHook.error,
      daily: dailyHook.error,
      realtime: realtimeHook.error,
      mastery: masteryHook?.error || null,
      liveStats: liveStatsHook?.error || null
    },
    
    // 액션 함수들
    refreshAll,
    onReviewComplete,
    invalidateCache: invalidationHook.invalidateCache,
    
    // 실시간 세션 관련 함수들 (WebSocket 사용 시)
    ...(enableWebSocket && {
      startSession: realtimeUpdatesHook.startSession,
      updateSessionProgress: realtimeUpdatesHook.updateSessionProgress,
      completeSession: realtimeUpdatesHook.completeSession,
      updateProgress: realtimeUpdatesHook.updateProgress
    })
  };
};

export default useProgress;