// Query key factories for consistent cache management
export const queryKeys = {
  // Authentication
  user: ['user'] as const,
  profile: (id: string) => ['profile', id] as const,
  
  // Problems
  problems: (params?: Record<string, any>) => ['problems', params] as const,
  problem: (id: string) => ['problem', id] as const,
  categories: ['categories'] as const,
  
  // Analytics
  analytics: (params?: Record<string, any>) => ['analytics', params] as const,
  progress: (userId?: string) => ['progress', userId] as const,
  leaderboard: (params?: Record<string, any>) => ['leaderboard', params] as const,
  studyStreaks: ['studyStreaks'] as const,
  
  // Admin
  users: (params?: Record<string, any>) => ['users', params] as const,
  userDetail: (id: string) => ['user', id] as const,
} as const;

// Cache invalidation utilities
export const cacheUtils = {
  // Invalidate all user-related data
  invalidateUserData: (queryClient: any, userId?: string) => {
    queryClient.invalidateQueries({ queryKey: queryKeys.user });
    queryClient.invalidateQueries({ queryKey: queryKeys.analytics() });
    queryClient.invalidateQueries({ queryKey: queryKeys.progress() });
    queryClient.invalidateQueries({ queryKey: queryKeys.studyStreaks });
    if (userId) {
      queryClient.invalidateQueries({ queryKey: queryKeys.profile(userId) });
    }
  },
  
  // Invalidate problem-related data
  invalidateProblemsData: (queryClient: any) => {
    queryClient.invalidateQueries({ queryKey: ['problems'] });
    queryClient.invalidateQueries({ queryKey: queryKeys.categories });
  },
  
  // Invalidate analytics data
  invalidateAnalyticsData: (queryClient: any) => {
    queryClient.invalidateQueries({ queryKey: ['analytics'] });
    queryClient.invalidateQueries({ queryKey: ['progress'] });
    queryClient.invalidateQueries({ queryKey: queryKeys.leaderboard() });
  },
  
  // Clear all cache
  clearAllCache: (queryClient: any) => {
    queryClient.clear();
  },
};

// Local storage utilities for offline data
export const offlineCache = {
  set: (key: string, data: any, expiry?: number) => {
    const item = {
      data,
      timestamp: Date.now(),
      expiry: expiry ? Date.now() + expiry : null,
    };
    localStorage.setItem(`cache_${key}`, JSON.stringify(item));
  },
  
  get: (key: string) => {
    const item = localStorage.getItem(`cache_${key}`);
    if (!item) return null;
    
    try {
      const parsed = JSON.parse(item);
      
      // Check if expired
      if (parsed.expiry && Date.now() > parsed.expiry) {
        localStorage.removeItem(`cache_${key}`);
        return null;
      }
      
      return parsed.data;
    } catch {
      localStorage.removeItem(`cache_${key}`);
      return null;
    }
  },
  
  remove: (key: string) => {
    localStorage.removeItem(`cache_${key}`);
  },
  
  clear: () => {
    const keys = Object.keys(localStorage).filter(key => key.startsWith('cache_'));
    keys.forEach(key => localStorage.removeItem(key));
  },
};

// Optimistic update utilities
export const optimisticUpdates = {
  // Update problem list when creating a new problem
  updateProblemsList: (queryClient: any, newProblem: any, params?: any) => {
    queryClient.setQueryData(
      queryKeys.problems(params),
      (oldData: any) => {
        if (!oldData?.data?.problems) return oldData;
        
        return {
          ...oldData,
          data: {
            ...oldData.data,
            problems: [newProblem, ...oldData.data.problems],
            total: oldData.data.total + 1,
          },
        };
      }
    );
  },
  
  // Update user list when updating user role
  updateUserInList: (queryClient: any, userId: string, updates: any, params?: any) => {
    queryClient.setQueryData(
      queryKeys.users(params),
      (oldData: any) => {
        if (!oldData?.data?.users) return oldData;
        
        return {
          ...oldData,
          data: {
            ...oldData.data,
            users: oldData.data.users.map((user: any) =>
              user.id === userId ? { ...user, ...updates } : user
            ),
          },
        };
      }
    );
  },
  
  // Update analytics after problem submission
  updateAnalyticsAfterSubmission: (queryClient: any, isCorrect: boolean) => {
    queryClient.setQueryData(
      queryKeys.progress(),
      (oldData: any) => {
        if (!oldData?.data) return oldData;
        
        const newCorrectAnswers = isCorrect 
          ? oldData.data.correctAnswers + 1 
          : oldData.data.correctAnswers;
        const newTotalProblems = oldData.data.totalProblems + 1;
        const newAvgAccuracy = (newCorrectAnswers / newTotalProblems) * 100;
        
        return {
          ...oldData,
          data: {
            ...oldData.data,
            totalProblems: newTotalProblems,
            correctAnswers: newCorrectAnswers,
            avgAccuracy: newAvgAccuracy,
          },
        };
      }
    );
  },
};