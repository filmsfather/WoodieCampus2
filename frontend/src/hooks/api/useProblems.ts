import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import apiService from '../../services/api';

export function useProblems(params?: {
  page?: number;
  limit?: number;
  categoryId?: string;
  difficulty?: string;
  search?: string;
}) {
  return useQuery({
    queryKey: ['problems', params],
    queryFn: () => apiService.getProblems(params),
    select: (data) => data.success ? data.data : null,
  });
}

export function useProblem(id: string) {
  return useQuery({
    queryKey: ['problem', id],
    queryFn: () => apiService.getProblem(id),
    select: (data) => data.success ? data.data : null,
    enabled: !!id,
  });
}

export function useCreateProblem() {
  const queryClient = useQueryClient();
  
  return useMutation({
    mutationFn: (data: any) => apiService.createProblem(data),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['problems'] });
    },
  });
}

export function useUpdateProblem() {
  const queryClient = useQueryClient();
  
  return useMutation({
    mutationFn: ({ id, data }: { id: string; data: any }) => 
      apiService.updateProblem(id, data),
    onSuccess: (_, variables) => {
      queryClient.invalidateQueries({ queryKey: ['problems'] });
      queryClient.invalidateQueries({ queryKey: ['problem', variables.id] });
    },
  });
}

export function useDeleteProblem() {
  const queryClient = useQueryClient();
  
  return useMutation({
    mutationFn: (id: string) => apiService.deleteProblem(id),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['problems'] });
    },
  });
}

export function useSubmitAnswer() {
  const queryClient = useQueryClient();
  
  return useMutation({
    mutationFn: ({ problemId, answer }: { problemId: string; answer: string }) =>
      apiService.submitAnswer(problemId, answer),
    onSuccess: (data, variables) => {
      // Invalidate analytics and progress data
      queryClient.invalidateQueries({ queryKey: ['analytics'] });
      queryClient.invalidateQueries({ queryKey: ['progress'] });
      queryClient.invalidateQueries({ queryKey: ['problem', variables.problemId] });
    },
  });
}

export function useCategories() {
  return useQuery({
    queryKey: ['categories'],
    queryFn: () => apiService.getCategories(),
    select: (data) => data.success ? data.data : [],
    staleTime: 1000 * 60 * 15, // 15 minutes
  });
}