const API_BASE_URL = import.meta.env.VITE_API_BASE_URL || 'http://localhost:3000/api';

interface ApiResponse<T = any> {
  success: boolean;
  data?: T;
  message?: string;
  error?: string;
}

class ApiService {
  private baseURL: string;

  constructor(baseURL: string) {
    this.baseURL = baseURL;
  }

  private getAuthHeaders(): HeadersInit {
    const token = localStorage.getItem('authToken');
    const headers: HeadersInit = {
      'Content-Type': 'application/json',
    };
    
    if (token) {
      headers.Authorization = `Bearer ${token}`;
    }
    
    return headers;
  }

  private async request<T>(
    endpoint: string,
    options: RequestInit = {}
  ): Promise<ApiResponse<T>> {
    const url = `${this.baseURL}${endpoint}`;
    
    const config: RequestInit = {
      headers: this.getAuthHeaders(),
      ...options,
    };

    try {
      const response = await fetch(url, config);
      
      if (!response.ok) {
        if (response.status === 401) {
          localStorage.removeItem('authToken');
          window.location.href = '/login';
          throw new Error('Authentication required');
        }
        
        const errorData = await response.json().catch(() => ({}));
        throw new Error(errorData.message || `HTTP ${response.status}`);
      }

      const data = await response.json();
      return data;
    } catch (error) {
      console.error('API Request failed:', error);
      throw error;
    }
  }

  // Auth endpoints
  async login(email: string, password: string): Promise<ApiResponse<{ token: string; user: any }>> {
    return this.request('/auth/login', {
      method: 'POST',
      body: JSON.stringify({ email, password }),
    });
  }

  async register(userData: {
    email: string;
    password: string;
    name: string;
    role?: string;
  }): Promise<ApiResponse<{ token: string; user: any }>> {
    return this.request('/auth/register', {
      method: 'POST',
      body: JSON.stringify(userData),
    });
  }

  async refreshToken(): Promise<ApiResponse<{ token: string }>> {
    return this.request('/auth/refresh', {
      method: 'POST',
    });
  }

  async logout(): Promise<ApiResponse> {
    return this.request('/auth/logout', {
      method: 'POST',
    });
  }

  // User endpoints
  async getCurrentUser(): Promise<ApiResponse<any>> {
    return this.request('/users/me');
  }

  async updateProfile(userData: Partial<any>): Promise<ApiResponse<any>> {
    return this.request('/users/me', {
      method: 'PUT',
      body: JSON.stringify(userData),
    });
  }

  // Problems endpoints
  async getProblems(params?: {
    categoryId?: string;
    difficulty?: string;
    page?: number;
    limit?: number;
  }): Promise<ApiResponse<{ problems: any[]; total: number; page: number; totalPages: number }>> {
    const searchParams = new URLSearchParams();
    if (params) {
      Object.entries(params).forEach(([key, value]) => {
        if (value !== undefined) {
          searchParams.append(key, value.toString());
        }
      });
    }
    
    const query = searchParams.toString() ? `?${searchParams.toString()}` : '';
    return this.request(`/problems${query}`);
  }

  async getProblem(id: string): Promise<ApiResponse<any>> {
    return this.request(`/problems/${id}`);
  }

  async submitAnswer(problemId: string, answer: string): Promise<ApiResponse<{
    isCorrect: boolean;
    explanation: string;
    nextReviewDate?: string;
  }>> {
    return this.request('/reviews', {
      method: 'POST',
      body: JSON.stringify({
        problemId,
        userAnswer: answer,
        responseTime: Date.now(), // This should be calculated properly
      }),
    });
  }

  // Categories endpoints
  async getCategories(): Promise<ApiResponse<any[]>> {
    return this.request('/categories');
  }

  // Progress endpoints
  async getProgress(): Promise<ApiResponse<any>> {
    return this.request('/progress/me');
  }

  async getProgressByCategory(categoryId: string): Promise<ApiResponse<any>> {
    return this.request(`/progress/category/${categoryId}`);
  }

  // Analytics endpoints
  async getAnalytics(params?: {
    period?: string;
    categoryId?: string;
  }): Promise<ApiResponse<any>> {
    const searchParams = new URLSearchParams();
    if (params) {
      Object.entries(params).forEach(([key, value]) => {
        if (value !== undefined) {
          searchParams.append(key, value.toString());
        }
      });
    }
    
    const query = searchParams.toString() ? `?${searchParams.toString()}` : '';
    return this.request(`/analytics/summary${query}`);
  }

  async getForgettingCurveData(days?: number): Promise<ApiResponse<any>> {
    const query = days ? `?days=${days}` : '';
    return this.request(`/analytics/forgetting-curve${query}`);
  }

  // Admin endpoints
  async getUsers(params?: {
    page?: number;
    limit?: number;
    role?: string;
  }): Promise<ApiResponse<{ users: any[]; total: number; page: number; totalPages: number }>> {
    const searchParams = new URLSearchParams();
    if (params) {
      Object.entries(params).forEach(([key, value]) => {
        if (value !== undefined) {
          searchParams.append(key, value.toString());
        }
      });
    }
    
    const query = searchParams.toString() ? `?${searchParams.toString()}` : '';
    return this.request(`/users${query}`);
  }

  async updateUserRole(userId: string, role: string): Promise<ApiResponse<any>> {
    return this.request(`/users/${userId}/role`, {
      method: 'PUT',
      body: JSON.stringify({ role }),
    });
  }

  async deleteUser(userId: string): Promise<ApiResponse> {
    return this.request(`/users/${userId}`, {
      method: 'DELETE',
    });
  }

  async createProblem(problemData: any): Promise<ApiResponse<any>> {
    return this.request('/problems', {
      method: 'POST',
      body: JSON.stringify(problemData),
    });
  }

  async updateProblem(id: string, problemData: any): Promise<ApiResponse<any>> {
    return this.request(`/problems/${id}`, {
      method: 'PUT',
      body: JSON.stringify(problemData),
    });
  }

  async deleteProblem(id: string): Promise<ApiResponse> {
    return this.request(`/problems/${id}`, {
      method: 'DELETE',
    });
  }
}

export const apiService = new ApiService(API_BASE_URL);
export default apiService;