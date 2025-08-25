import { useState, useEffect } from 'react';
import {
  BookOpen,
  Search,
  Filter,
  Edit3,
  Trash2,
  Plus,
  Eye,
  Save,
  X,
} from 'lucide-react';
import { useForm } from 'react-hook-form';
import { zodResolver } from '@hookform/resolvers/zod';
import { z } from 'zod';
import apiService from '../../services/api';
import { useAuth } from '../../contexts/AuthContext';

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
  problemType: 'MULTIPLE_CHOICE' | 'SHORT_ANSWER' | 'ESSAY';
  options?: string[];
  correctAnswer: string;
  explanation: string;
  createdAt: string;
}

interface Category {
  id: string;
  name: string;
}

const problemSchema = z.object({
  title: z.string().min(1, '제목을 입력해주세요'),
  description: z.string().min(10, '문제 설명을 10자 이상 입력해주세요'),
  difficulty: z.enum(['EASY', 'MEDIUM', 'HARD'], {
    required_error: '난이도를 선택해주세요',
  }),
  categoryId: z.string().min(1, '카테고리를 선택해주세요'),
  problemType: z.enum(['MULTIPLE_CHOICE', 'SHORT_ANSWER', 'ESSAY'], {
    required_error: '문제 유형을 선택해주세요',
  }),
  correctAnswer: z.string().min(1, '정답을 입력해주세요'),
  explanation: z.string().min(1, '해설을 입력해주세요'),
  options: z.array(z.string()).optional(),
});

type ProblemFormData = z.infer<typeof problemSchema>;

export function ProblemManagement() {
  const { isInstructor } = useAuth();
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
  const [showForm, setShowForm] = useState(false);
  const [editingProblem, setEditingProblem] = useState<Problem | null>(null);
  const [options, setOptions] = useState<string[]>(['', '', '', '']);

  const {
    register,
    handleSubmit,
    reset,
    watch,
    setValue,
    formState: { errors, isSubmitting },
  } = useForm<ProblemFormData>({
    resolver: zodResolver(problemSchema),
    defaultValues: {
      difficulty: 'MEDIUM',
      problemType: 'MULTIPLE_CHOICE',
    },
  });

  const problemType = watch('problemType');

  useEffect(() => {
    loadCategories();
  }, []);

  useEffect(() => {
    loadProblems();
  }, [filters, currentPage]);

  useEffect(() => {
    if (problemType === 'MULTIPLE_CHOICE') {
      setValue('options', options.filter(opt => opt.trim()));
    }
  }, [options, problemType, setValue]);

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
    if (!isInstructor) return;

    try {
      setLoading(true);
      setError('');
      
      const params: any = {
        page: currentPage,
        limit: 20,
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
      setError(err instanceof Error ? err.message : '문제 목록을 불러오는데 실패했습니다');
    } finally {
      setLoading(false);
    }
  };

  const onSubmit = async (data: ProblemFormData) => {
    try {
      const problemData = {
        ...data,
        options: data.problemType === 'MULTIPLE_CHOICE' ? options.filter(opt => opt.trim()) : undefined,
      };

      let response;
      if (editingProblem) {
        response = await apiService.updateProblem(editingProblem.id, problemData);
      } else {
        response = await apiService.createProblem(problemData);
      }

      if (response.success) {
        await loadProblems();
        handleCloseForm();
      } else {
        throw new Error(response.message || '문제 저장에 실패했습니다');
      }
    } catch (err) {
      alert(err instanceof Error ? err.message : '문제 저장에 실패했습니다');
    }
  };

  const handleEdit = (problem: Problem) => {
    setEditingProblem(problem);
    setShowForm(true);
    reset({
      title: problem.title,
      description: problem.description,
      difficulty: problem.difficulty,
      categoryId: problem.categoryId,
      problemType: problem.problemType,
      correctAnswer: problem.correctAnswer,
      explanation: problem.explanation,
    });
    
    if (problem.problemType === 'MULTIPLE_CHOICE' && problem.options) {
      setOptions([...problem.options, ...Array(4 - problem.options.length).fill('')]);
    }
  };

  const handleDelete = async (problemId: string) => {
    if (!confirm('정말로 이 문제를 삭제하시겠습니까?')) return;

    try {
      const response = await apiService.deleteProblem(problemId);
      if (response.success) {
        await loadProblems();
      } else {
        throw new Error(response.message || '문제 삭제에 실패했습니다');
      }
    } catch (err) {
      alert(err instanceof Error ? err.message : '문제 삭제에 실패했습니다');
    }
  };

  const handleCloseForm = () => {
    setShowForm(false);
    setEditingProblem(null);
    reset();
    setOptions(['', '', '', '']);
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

  const getProblemTypeLabel = (type: string) => {
    switch (type) {
      case 'MULTIPLE_CHOICE':
        return '객관식';
      case 'SHORT_ANSWER':
        return '단답형';
      case 'ESSAY':
        return '서술형';
      default:
        return type;
    }
  };

  if (!isInstructor) {
    return (
      <div className="text-center py-12">
        <BookOpen className="h-12 w-12 text-gray-400 mx-auto mb-4" />
        <h3 className="text-lg font-medium text-gray-900 mb-2">접근 권한이 없습니다</h3>
        <p className="text-gray-600">강사 이상만 문제 관리에 접근할 수 있습니다.</p>
      </div>
    );
  }

  return (
    <div className="max-w-7xl mx-auto">
      {/* 헤더 */}
      <div className="mb-8">
        <div className="flex items-center justify-between">
          <div>
            <h1 className="text-3xl font-bold text-gray-900">문제 관리</h1>
            <p className="mt-2 text-gray-600">시스템의 모든 문제를 관리합니다.</p>
          </div>
          <button
            onClick={() => setShowForm(true)}
            className="btn btn-primary btn-md inline-flex items-center"
          >
            <Plus className="h-4 w-4 mr-2" />
            새 문제 등록
          </button>
        </div>
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

      {/* 문제 목록 */}
      {loading ? (
        <div className="flex items-center justify-center py-12">
          <div className="animate-spin rounded-full h-8 w-8 border-b-2 border-primary-600"></div>
        </div>
      ) : (
        <div className="bg-white shadow rounded-lg overflow-hidden">
          <table className="min-w-full divide-y divide-gray-200">
            <thead className="bg-gray-50">
              <tr>
                <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">
                  문제
                </th>
                <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">
                  카테고리
                </th>
                <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">
                  난이도
                </th>
                <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">
                  유형
                </th>
                <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">
                  등록일
                </th>
                <th className="relative px-6 py-3">
                  <span className="sr-only">Actions</span>
                </th>
              </tr>
            </thead>
            <tbody className="bg-white divide-y divide-gray-200">
              {problems.map((problem) => (
                <tr key={problem.id} className="hover:bg-gray-50">
                  <td className="px-6 py-4">
                    <div>
                      <div className="text-sm font-medium text-gray-900 line-clamp-1">
                        {problem.title}
                      </div>
                      <div className="text-sm text-gray-500 line-clamp-2">
                        {problem.description}
                      </div>
                    </div>
                  </td>
                  <td className="px-6 py-4 whitespace-nowrap text-sm text-gray-500">
                    {problem.category?.name || '미분류'}
                  </td>
                  <td className="px-6 py-4 whitespace-nowrap">
                    <span className={`inline-flex px-2 py-1 text-xs font-medium rounded-full ${getDifficultyColor(problem.difficulty)}`}>
                      {getDifficultyLabel(problem.difficulty)}
                    </span>
                  </td>
                  <td className="px-6 py-4 whitespace-nowrap text-sm text-gray-500">
                    {getProblemTypeLabel(problem.problemType)}
                  </td>
                  <td className="px-6 py-4 whitespace-nowrap text-sm text-gray-500">
                    {new Date(problem.createdAt).toLocaleDateString()}
                  </td>
                  <td className="px-6 py-4 whitespace-nowrap text-right text-sm font-medium">
                    <div className="flex items-center space-x-2">
                      <button
                        onClick={() => handleEdit(problem)}
                        className="text-primary-600 hover:text-primary-900"
                      >
                        <Edit3 className="h-4 w-4" />
                      </button>
                      <button
                        onClick={() => handleDelete(problem.id)}
                        className="text-error-600 hover:text-error-900"
                      >
                        <Trash2 className="h-4 w-4" />
                      </button>
                    </div>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}

      {/* 문제 등록/수정 모달 */}
      {showForm && (
        <div className="fixed inset-0 bg-gray-600 bg-opacity-50 overflow-y-auto h-full w-full z-50">
          <div className="relative top-8 mx-auto p-5 border w-full max-w-3xl shadow-lg rounded-md bg-white mb-8">
            <div className="flex items-center justify-between mb-4">
              <h3 className="text-lg font-medium text-gray-900">
                {editingProblem ? '문제 수정' : '새 문제 등록'}
              </h3>
              <button
                onClick={handleCloseForm}
                className="text-gray-400 hover:text-gray-600"
              >
                <X className="h-6 w-6" />
              </button>
            </div>

            <form onSubmit={handleSubmit(onSubmit)} className="space-y-6">
              {/* 기본 정보 */}
              <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
                <div>
                  <label className="block text-sm font-medium text-gray-700">제목</label>
                  <input
                    type="text"
                    className="input mt-1"
                    placeholder="문제 제목을 입력하세요"
                    {...register('title')}
                  />
                  {errors.title && (
                    <p className="mt-1 text-sm text-error-600">{errors.title.message}</p>
                  )}
                </div>

                <div>
                  <label className="block text-sm font-medium text-gray-700">카테고리</label>
                  <select className="input mt-1" {...register('categoryId')}>
                    <option value="">카테고리 선택</option>
                    {categories.map((category) => (
                      <option key={category.id} value={category.id}>
                        {category.name}
                      </option>
                    ))}
                  </select>
                  {errors.categoryId && (
                    <p className="mt-1 text-sm text-error-600">{errors.categoryId.message}</p>
                  )}
                </div>

                <div>
                  <label className="block text-sm font-medium text-gray-700">난이도</label>
                  <select className="input mt-1" {...register('difficulty')}>
                    <option value="EASY">쉬움</option>
                    <option value="MEDIUM">보통</option>
                    <option value="HARD">어려움</option>
                  </select>
                  {errors.difficulty && (
                    <p className="mt-1 text-sm text-error-600">{errors.difficulty.message}</p>
                  )}
                </div>

                <div>
                  <label className="block text-sm font-medium text-gray-700">문제 유형</label>
                  <select className="input mt-1" {...register('problemType')}>
                    <option value="MULTIPLE_CHOICE">객관식</option>
                    <option value="SHORT_ANSWER">단답형</option>
                    <option value="ESSAY">서술형</option>
                  </select>
                  {errors.problemType && (
                    <p className="mt-1 text-sm text-error-600">{errors.problemType.message}</p>
                  )}
                </div>
              </div>

              {/* 문제 설명 */}
              <div>
                <label className="block text-sm font-medium text-gray-700">문제 설명</label>
                <textarea
                  className="input mt-1 min-h-[120px] resize-none"
                  rows={5}
                  placeholder="문제 내용을 자세히 입력하세요"
                  {...register('description')}
                />
                {errors.description && (
                  <p className="mt-1 text-sm text-error-600">{errors.description.message}</p>
                )}
              </div>

              {/* 객관식 선택지 */}
              {problemType === 'MULTIPLE_CHOICE' && (
                <div>
                  <label className="block text-sm font-medium text-gray-700 mb-2">선택지</label>
                  <div className="space-y-2">
                    {options.map((option, index) => (
                      <div key={index} className="flex items-center space-x-2">
                        <span className="text-sm font-medium text-gray-500 w-6">
                          {String.fromCharCode(65 + index)}
                        </span>
                        <input
                          type="text"
                          className="input flex-1"
                          placeholder={`선택지 ${String.fromCharCode(65 + index)}`}
                          value={option}
                          onChange={(e) => {
                            const newOptions = [...options];
                            newOptions[index] = e.target.value;
                            setOptions(newOptions);
                          }}
                        />
                      </div>
                    ))}
                  </div>
                </div>
              )}

              {/* 정답 */}
              <div>
                <label className="block text-sm font-medium text-gray-700">정답</label>
                <input
                  type="text"
                  className="input mt-1"
                  placeholder={
                    problemType === 'MULTIPLE_CHOICE'
                      ? '정답 선택지 (예: A, B, C, D)'
                      : '정답을 입력하세요'
                  }
                  {...register('correctAnswer')}
                />
                {errors.correctAnswer && (
                  <p className="mt-1 text-sm text-error-600">{errors.correctAnswer.message}</p>
                )}
              </div>

              {/* 해설 */}
              <div>
                <label className="block text-sm font-medium text-gray-700">해설</label>
                <textarea
                  className="input mt-1 min-h-[100px] resize-none"
                  rows={4}
                  placeholder="문제에 대한 자세한 해설을 입력하세요"
                  {...register('explanation')}
                />
                {errors.explanation && (
                  <p className="mt-1 text-sm text-error-600">{errors.explanation.message}</p>
                )}
              </div>

              {/* 버튼 */}
              <div className="flex space-x-3 pt-4 border-t">
                <button
                  type="submit"
                  disabled={isSubmitting}
                  className="btn btn-primary btn-md flex-1 inline-flex items-center justify-center"
                >
                  {isSubmitting ? (
                    <>
                      <div className="animate-spin rounded-full h-4 w-4 border-b-2 border-white mr-2"></div>
                      저장 중...
                    </>
                  ) : (
                    <>
                      <Save className="h-4 w-4 mr-2" />
                      {editingProblem ? '수정' : '등록'}
                    </>
                  )}
                </button>
                <button
                  type="button"
                  onClick={handleCloseForm}
                  className="btn btn-outline btn-md flex-1"
                >
                  취소
                </button>
              </div>
            </form>
          </div>
        </div>
      )}
    </div>
  );
}