import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import apiService from '../../services/api';

export function useLogin() {
  const queryClient = useQueryClient();
  
  return useMutation({
    mutationFn: ({ email, password }: { email: string; password: string }) =>
      apiService.login(email, password),
    onSuccess: (data) => {
      if (data.success && data.data) {
        localStorage.setItem('token', data.data.token);
        localStorage.setItem('user', JSON.stringify(data.data.user));
        queryClient.setQueryData(['user'], data.data.user);
        queryClient.invalidateQueries({ queryKey: ['user'] });
      }
    },
    onError: (error) => {
      console.error('Login error:', error);
    },
  });
}

export function useRegister() {
  const queryClient = useQueryClient();
  
  return useMutation({
    mutationFn: ({ name, email, password }: { name: string; email: string; password: string }) =>
      apiService.register(name, email, password),
    onSuccess: (data) => {
      if (data.success && data.data) {
        localStorage.setItem('token', data.data.token);
        localStorage.setItem('user', JSON.stringify(data.data.user));
        queryClient.setQueryData(['user'], data.data.user);
        queryClient.invalidateQueries({ queryKey: ['user'] });
      }
    },
    onError: (error) => {
      console.error('Register error:', error);
    },
  });
}

export function useLogout() {
  const queryClient = useQueryClient();
  
  return useMutation({
    mutationFn: () => apiService.logout(),
    onSuccess: () => {
      localStorage.removeItem('token');
      localStorage.removeItem('user');
      queryClient.setQueryData(['user'], null);
      queryClient.clear();
    },
    onError: (error) => {
      // Clear local storage even if logout fails
      localStorage.removeItem('token');
      localStorage.removeItem('user');
      queryClient.setQueryData(['user'], null);
      queryClient.clear();
      console.error('Logout error:', error);
    },
  });
}

export function useCurrentUser() {
  return useQuery({
    queryKey: ['user'],
    queryFn: () => {
      const user = localStorage.getItem('user');
      return user ? JSON.parse(user) : null;
    },
    staleTime: Infinity, // User data doesn't change often
  });
}

export function useUpdateProfile() {
  const queryClient = useQueryClient();
  
  return useMutation({
    mutationFn: (data: { name?: string; email?: string }) =>
      apiService.updateProfile(data),
    onSuccess: (data) => {
      if (data.success && data.data) {
        localStorage.setItem('user', JSON.stringify(data.data));
        queryClient.setQueryData(['user'], data.data);
        queryClient.invalidateQueries({ queryKey: ['user'] });
      }
    },
  });
}