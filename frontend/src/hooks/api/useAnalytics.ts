import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import apiService from '../../services/api';

export function useAnalytics(params?: { period?: string }) {
  return useQuery({
    queryKey: ['analytics', params],
    queryFn: () => apiService.getAnalytics(params),
    select: (data) => data.success ? data.data : null,
    staleTime: 1000 * 60 * 5, // 5 minutes
  });
}

export function useProgress() {
  return useQuery({
    queryKey: ['progress'],
    queryFn: () => apiService.getProgress(),
    select: (data) => data.success ? data.data : null,
    staleTime: 1000 * 60 * 5, // 5 minutes
  });
}

export function useUserProgress(userId?: string) {
  return useQuery({
    queryKey: ['userProgress', userId],
    queryFn: () => apiService.getUserProgress(userId),
    select: (data) => data.success ? data.data : null,
    enabled: !!userId,
    staleTime: 1000 * 60 * 5,
  });
}

export function useLeaderboard(params?: { period?: string; limit?: number }) {
  return useQuery({
    queryKey: ['leaderboard', params],
    queryFn: () => apiService.getLeaderboard(params),
    select: (data) => data.success ? data.data : [],
    staleTime: 1000 * 60 * 10, // 10 minutes
  });
}

export function useStudyStreaks() {
  return useQuery({
    queryKey: ['studyStreaks'],
    queryFn: () => apiService.getStudyStreaks(),
    select: (data) => data.success ? data.data : null,
    staleTime: 1000 * 60 * 15, // 15 minutes
  });
}