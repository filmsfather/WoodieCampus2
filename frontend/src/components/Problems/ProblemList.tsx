import { useState, useEffect } from 'react';
import { Link } from 'react-router-dom';
import { Filter, Search, BookOpen, Clock, Star } from 'lucide-react';
import apiService from '../../services/api';

interface Problem {
  id: string;
  title: string;
  description: string;
  difficulty: 'EASY' | 'MEDIUM' | 'HARD';
  categoryId: string;
  category?: {
    id: string;
    name: string;
  };
  problemType: string;
  createdAt: string;
}

interface Category {
  id: string;
  name: string;
}

export function ProblemList() {
  const [problems, setProblems] = useState<Problem[]>([]);
  const [categories, setCategories] = useState<Category[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');
  const [filters, setFilters] = useState({
    search: '',
    categoryId: '',
    difficulty: '',
  });
  const [currentPage, setCurrentPage] = useState(1);
  const [totalPages, setTotalPages] = useState(1);

  useEffect(() => {
    loadCategories();
  }, []);

  useEffect(() => {
    loadProblems();
  }, [filters, currentPage]);

  const loadCategories = async () => {
    try {
      const response = await apiService.getCategories();
      if (response.success && response.data) {
        setCategories(response.data);
      }
    } catch (err) {
      console.error('Failed to load categories:', err);
    }
  };

  const loadProblems = async () => {
    try {
      setLoading(true);
      setError('');
      
      const params: any = {
        page: currentPage,
        limit: 12,
      };
      
      if (filters.categoryId) params.categoryId = filters.categoryId;
      if (filters.difficulty) params.difficulty = filters.difficulty;
      if (filters.search) params.search = filters.search;

      const response = await apiService.getProblems(params);
      if (response.success && response.data) {
        setProblems(response.data.problems);
        setTotalPages(response.data.totalPages);
      }
    } catch (err) {
      setError(err instanceof Error ? err.message : '문제를 불러오는데 실패했습니다');
    } finally {
      setLoading(false);
    }
  };

  const getDifficultyColor = (difficulty: string) => {
    switch (difficulty) {
      case 'EASY':
        return 'bg-success-100 text-success-800';
      case 'MEDIUM':
        return 'bg-warning-100 text-warning-800';
      case 'HARD':
        return 'bg-error-100 text-error-800';
      default:
        return 'bg-gray-100 text-gray-800';
    }
  };

  const getDifficultyLabel = (difficulty: string) => {
    switch (difficulty) {
      case 'EASY':
        return '쉬움';
      case 'MEDIUM':
        return '보통';
      case 'HARD':
        return '어려움';
      default:
        return difficulty;
    }
  };

  return (
    <div className="max-w-6xl mx-auto">
      {/* 헤더 */}
      <div className="mb-8">
        <h1 className="text-3xl font-bold text-gray-900">문제 목록</h1>
        <p className="mt-2 text-gray-600">다양한 문제를 풀어보며 실력을 향상시키세요.</p>
      </div>

      {/* 필터 및 검색 */}
      <div className="bg-white shadow rounded-lg p-6 mb-8">
        <div className="flex items-center space-x-4">
          <Filter className="h-5 w-5 text-gray-400" />
          <div className="flex-1 grid grid-cols-1 md:grid-cols-4 gap-4">
            {/* 검색 */}
            <div className="relative">
              <Search className="absolute left-3 top-1/2 transform -translate-y-1/2 h-4 w-4 text-gray-400" />
              <input
                type="text"
                placeholder="문제 제목 검색..."
                className="input pl-10"
                value={filters.search}
                onChange={(e) => setFilters({ ...filters, search: e.target.value })}
              />
            </div>

            {/* 카테고리 필터 */}
            <select
              className="input"
              value={filters.categoryId}
              onChange={(e) => setFilters({ ...filters, categoryId: e.target.value })}
            >
              <option value="">모든 카테고리</option>
              {categories.map((category) => (
                <option key={category.id} value={category.id}>
                  {category.name}
                </option>
              ))}
            </select>

            {/* 난이도 필터 */}
            <select
              className="input"
              value={filters.difficulty}
              onChange={(e) => setFilters({ ...filters, difficulty: e.target.value })}
            >
              <option value="">모든 난이도</option>
              <option value="EASY">쉬움</option>
              <option value="MEDIUM">보통</option>
              <option value="HARD">어려움</option>
            </select>

            {/* 필터 초기화 */}
            <button
              className="btn btn-outline btn-md"
              onClick={() => {
                setFilters({ search: '', categoryId: '', difficulty: '' });
                setCurrentPage(1);
              }}
            >
              초기화
            </button>
          </div>
        </div>
      </div>

      {/* 에러 표시 */}
      {error && (
        <div className="bg-error-50 border border-error-200 rounded-md p-4 mb-6">
          <p className="text-error-600">{error}</p>
        </div>
      )}

      {/* 로딩 상태 */}
      {loading ? (
        <div className="flex items-center justify-center py-12">
          <div className="animate-spin rounded-full h-8 w-8 border-b-2 border-primary-600"></div>
        </div>
      ) : (
        <>
          {/* 문제 목록 */}
          <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6 mb-8">
            {problems.map((problem) => (
              <div key={problem.id} className="card hover:shadow-md transition-shadow">
                <div className="card-header">
                  <div className="flex items-start justify-between">
                    <div className="flex-1">
                      <h3 className="text-lg font-semibold text-gray-900 mb-2">
                        {problem.title}
                      </h3>
                      <p className="text-sm text-gray-600 line-clamp-2">
                        {problem.description}
                      </p>
                    </div>
                    <div className="ml-2">
                      <span className={`inline-flex items-center px-2.5 py-0.5 rounded-full text-xs font-medium ${getDifficultyColor(problem.difficulty)}`}>
                        {getDifficultyLabel(problem.difficulty)}
                      </span>
                    </div>
                  </div>
                </div>

                <div className="card-content">
                  <div className="flex items-center space-x-4 text-sm text-gray-500 mb-4">
                    <div className="flex items-center">
                      <BookOpen className="h-4 w-4 mr-1" />
                      {problem.category?.name || '카테고리 없음'}
                    </div>
                    <div className="flex items-center">
                      <Clock className="h-4 w-4 mr-1" />
                      {new Date(problem.createdAt).toLocaleDateString()}
                    </div>
                  </div>

                  <Link
                    to={`/problems/${problem.id}`}
                    className="btn btn-primary btn-md w-full"
                  >
                    문제 풀기
                  </Link>
                </div>
              </div>
            ))}
          </div>

          {/* 문제가 없을 때 */}
          {problems.length === 0 && !loading && (
            <div className="text-center py-12">
              <BookOpen className="h-12 w-12 text-gray-400 mx-auto mb-4" />
              <h3 className="text-lg font-medium text-gray-900 mb-2">문제가 없습니다</h3>
              <p className="text-gray-600">다른 필터 조건을 시도해보세요.</p>
            </div>
          )}

          {/* 페이지네이션 */}
          {totalPages > 1 && (
            <div className="flex items-center justify-center space-x-2">
              <button
                className="btn btn-outline btn-sm"
                disabled={currentPage === 1}
                onClick={() => setCurrentPage(currentPage - 1)}
              >
                이전
              </button>
              
              {Array.from({ length: Math.min(5, totalPages) }, (_, i) => {
                const pageNum = currentPage - 2 + i;
                if (pageNum < 1 || pageNum > totalPages) return null;
                
                return (
                  <button
                    key={pageNum}
                    className={`btn btn-sm ${
                      pageNum === currentPage ? 'btn-primary' : 'btn-outline'
                    }`}
                    onClick={() => setCurrentPage(pageNum)}
                  >
                    {pageNum}
                  </button>
                );
              }).filter(Boolean)}
              
              <button
                className="btn btn-outline btn-sm"
                disabled={currentPage === totalPages}
                onClick={() => setCurrentPage(currentPage + 1)}
              >
                다음
              </button>
            </div>
          )}
        </>
      )}
    </div>
  );
}