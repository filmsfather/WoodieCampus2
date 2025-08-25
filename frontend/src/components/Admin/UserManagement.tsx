import { useState, useEffect } from 'react';
import {
  Users,
  Search,
  Filter,
  Edit3,
  Trash2,
  UserPlus,
  Shield,
  Calendar,
  MoreVertical,
} from 'lucide-react';
import apiService from '../../services/api';
import { useAuth } from '../../contexts/AuthContext';

interface User {
  id: string;
  name: string;
  email: string;
  role: 'STUDENT' | 'INSTRUCTOR' | 'ADMIN' | 'SUPER_ADMIN';
  createdAt: string;
  lastLoginAt?: string;
  isActive: boolean;
}

export function UserManagement() {
  const { isAdmin } = useAuth();
  const [users, setUsers] = useState<User[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');
  const [filters, setFilters] = useState({
    search: '',
    role: '',
    status: '',
  });
  const [currentPage, setCurrentPage] = useState(1);
  const [totalPages, setTotalPages] = useState(1);
  const [selectedUser, setSelectedUser] = useState<User | null>(null);
  const [showRoleModal, setShowRoleModal] = useState(false);
  const [newRole, setNewRole] = useState('');

  useEffect(() => {
    loadUsers();
  }, [filters, currentPage]);

  const loadUsers = async () => {
    if (!isAdmin) return;

    try {
      setLoading(true);
      setError('');
      
      const params: any = {
        page: currentPage,
        limit: 20,
      };
      
      if (filters.role) params.role = filters.role;
      if (filters.search) params.search = filters.search;

      const response = await apiService.getUsers(params);
      if (response.success && response.data) {
        setUsers(response.data.users);
        setTotalPages(response.data.totalPages);
      }
    } catch (err) {
      setError(err instanceof Error ? err.message : '사용자 목록을 불러오는데 실패했습니다');
    } finally {
      setLoading(false);
    }
  };

  const handleRoleChange = async (userId: string, role: string) => {
    try {
      const response = await apiService.updateUserRole(userId, role);
      if (response.success) {
        await loadUsers();
        setShowRoleModal(false);
        setSelectedUser(null);
      } else {
        throw new Error(response.message || '역할 변경에 실패했습니다');
      }
    } catch (err) {
      alert(err instanceof Error ? err.message : '역할 변경에 실패했습니다');
    }
  };

  const handleDeleteUser = async (userId: string) => {
    if (!confirm('정말로 이 사용자를 삭제하시겠습니까?')) return;

    try {
      const response = await apiService.deleteUser(userId);
      if (response.success) {
        await loadUsers();
      } else {
        throw new Error(response.message || '사용자 삭제에 실패했습니다');
      }
    } catch (err) {
      alert(err instanceof Error ? err.message : '사용자 삭제에 실패했습니다');
    }
  };

  const getRoleBadgeColor = (role: string) => {
    switch (role) {
      case 'SUPER_ADMIN':
        return 'bg-purple-100 text-purple-800';
      case 'ADMIN':
        return 'bg-error-100 text-error-800';
      case 'INSTRUCTOR':
        return 'bg-warning-100 text-warning-800';
      case 'STUDENT':
        return 'bg-primary-100 text-primary-800';
      default:
        return 'bg-gray-100 text-gray-800';
    }
  };

  const getRoleLabel = (role: string) => {
    switch (role) {
      case 'SUPER_ADMIN':
        return '최고 관리자';
      case 'ADMIN':
        return '관리자';
      case 'INSTRUCTOR':
        return '강사';
      case 'STUDENT':
        return '학생';
      default:
        return role;
    }
  };

  if (!isAdmin) {
    return (
      <div className="text-center py-12">
        <Shield className="h-12 w-12 text-gray-400 mx-auto mb-4" />
        <h3 className="text-lg font-medium text-gray-900 mb-2">접근 권한이 없습니다</h3>
        <p className="text-gray-600">관리자만 사용자 관리에 접근할 수 있습니다.</p>
      </div>
    );
  }

  return (
    <div className="max-w-7xl mx-auto">
      {/* 헤더 */}
      <div className="mb-8">
        <div className="flex items-center justify-between">
          <div>
            <h1 className="text-3xl font-bold text-gray-900">사용자 관리</h1>
            <p className="mt-2 text-gray-600">시스템의 모든 사용자를 관리합니다.</p>
          </div>
          <button className="btn btn-primary btn-md inline-flex items-center">
            <UserPlus className="h-4 w-4 mr-2" />
            새 사용자 초대
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
                placeholder="이름 또는 이메일 검색..."
                className="input pl-10"
                value={filters.search}
                onChange={(e) => setFilters({ ...filters, search: e.target.value })}
              />
            </div>

            {/* 역할 필터 */}
            <select
              className="input"
              value={filters.role}
              onChange={(e) => setFilters({ ...filters, role: e.target.value })}
            >
              <option value="">모든 역할</option>
              <option value="STUDENT">학생</option>
              <option value="INSTRUCTOR">강사</option>
              <option value="ADMIN">관리자</option>
              <option value="SUPER_ADMIN">최고 관리자</option>
            </select>

            {/* 상태 필터 */}
            <select
              className="input"
              value={filters.status}
              onChange={(e) => setFilters({ ...filters, status: e.target.value })}
            >
              <option value="">모든 상태</option>
              <option value="active">활성</option>
              <option value="inactive">비활성</option>
            </select>

            {/* 필터 초기화 */}
            <button
              className="btn btn-outline btn-md"
              onClick={() => {
                setFilters({ search: '', role: '', status: '' });
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

      {/* 사용자 테이블 */}
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
                  사용자
                </th>
                <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">
                  역할
                </th>
                <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">
                  가입일
                </th>
                <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">
                  마지막 로그인
                </th>
                <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">
                  상태
                </th>
                <th className="relative px-6 py-3">
                  <span className="sr-only">Actions</span>
                </th>
              </tr>
            </thead>
            <tbody className="bg-white divide-y divide-gray-200">
              {users.map((user) => (
                <tr key={user.id} className="hover:bg-gray-50">
                  <td className="px-6 py-4 whitespace-nowrap">
                    <div className="flex items-center">
                      <div className="flex-shrink-0 h-10 w-10">
                        <div className="h-10 w-10 rounded-full bg-gray-300 flex items-center justify-center">
                          <Users className="h-5 w-5 text-gray-600" />
                        </div>
                      </div>
                      <div className="ml-4">
                        <div className="text-sm font-medium text-gray-900">{user.name}</div>
                        <div className="text-sm text-gray-500">{user.email}</div>
                      </div>
                    </div>
                  </td>
                  <td className="px-6 py-4 whitespace-nowrap">
                    <span className={`inline-flex px-2 py-1 text-xs font-medium rounded-full ${getRoleBadgeColor(user.role)}`}>
                      {getRoleLabel(user.role)}
                    </span>
                  </td>
                  <td className="px-6 py-4 whitespace-nowrap text-sm text-gray-500">
                    <div className="flex items-center">
                      <Calendar className="h-4 w-4 mr-1" />
                      {new Date(user.createdAt).toLocaleDateString()}
                    </div>
                  </td>
                  <td className="px-6 py-4 whitespace-nowrap text-sm text-gray-500">
                    {user.lastLoginAt
                      ? new Date(user.lastLoginAt).toLocaleDateString()
                      : '로그인한 적 없음'}
                  </td>
                  <td className="px-6 py-4 whitespace-nowrap">
                    <span className={`inline-flex px-2 py-1 text-xs font-medium rounded-full ${
                      user.isActive
                        ? 'bg-success-100 text-success-800'
                        : 'bg-gray-100 text-gray-800'
                    }`}>
                      {user.isActive ? '활성' : '비활성'}
                    </span>
                  </td>
                  <td className="px-6 py-4 whitespace-nowrap text-right text-sm font-medium">
                    <div className="flex items-center space-x-2">
                      <button
                        onClick={() => {
                          setSelectedUser(user);
                          setNewRole(user.role);
                          setShowRoleModal(true);
                        }}
                        className="text-primary-600 hover:text-primary-900"
                      >
                        <Edit3 className="h-4 w-4" />
                      </button>
                      <button
                        onClick={() => handleDeleteUser(user.id)}
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

          {users.length === 0 && !loading && (
            <div className="text-center py-12">
              <Users className="h-12 w-12 text-gray-400 mx-auto mb-4" />
              <h3 className="text-lg font-medium text-gray-900 mb-2">사용자가 없습니다</h3>
              <p className="text-gray-600">다른 필터 조건을 시도해보세요.</p>
            </div>
          )}

          {/* 페이지네이션 */}
          {totalPages > 1 && (
            <div className="bg-white px-4 py-3 flex items-center justify-between border-t border-gray-200 sm:px-6">
              <div className="flex-1 flex justify-between sm:hidden">
                <button
                  onClick={() => setCurrentPage(Math.max(1, currentPage - 1))}
                  disabled={currentPage === 1}
                  className="btn btn-outline btn-sm"
                >
                  이전
                </button>
                <button
                  onClick={() => setCurrentPage(Math.min(totalPages, currentPage + 1))}
                  disabled={currentPage === totalPages}
                  className="btn btn-outline btn-sm"
                >
                  다음
                </button>
              </div>
              <div className="hidden sm:flex-1 sm:flex sm:items-center sm:justify-between">
                <div>
                  <p className="text-sm text-gray-700">
                    페이지 <span className="font-medium">{currentPage}</span> / {' '}
                    <span className="font-medium">{totalPages}</span>
                  </p>
                </div>
                <div>
                  <nav className="relative z-0 inline-flex rounded-md shadow-sm -space-x-px">
                    <button
                      onClick={() => setCurrentPage(Math.max(1, currentPage - 1))}
                      disabled={currentPage === 1}
                      className="btn btn-outline btn-sm"
                    >
                      이전
                    </button>
                    <button
                      onClick={() => setCurrentPage(Math.min(totalPages, currentPage + 1))}
                      disabled={currentPage === totalPages}
                      className="btn btn-outline btn-sm"
                    >
                      다음
                    </button>
                  </nav>
                </div>
              </div>
            </div>
          )}
        </div>
      )}

      {/* 역할 변경 모달 */}
      {showRoleModal && selectedUser && (
        <div className="fixed inset-0 bg-gray-600 bg-opacity-50 overflow-y-auto h-full w-full z-50">
          <div className="relative top-20 mx-auto p-5 border w-96 shadow-lg rounded-md bg-white">
            <div className="mt-3">
              <h3 className="text-lg font-medium text-gray-900 mb-4">
                사용자 역할 변경
              </h3>
              <p className="text-sm text-gray-600 mb-4">
                {selectedUser.name}님의 역할을 변경합니다.
              </p>
              
              <select
                value={newRole}
                onChange={(e) => setNewRole(e.target.value)}
                className="input w-full mb-4"
              >
                <option value="STUDENT">학생</option>
                <option value="INSTRUCTOR">강사</option>
                <option value="ADMIN">관리자</option>
                <option value="SUPER_ADMIN">최고 관리자</option>
              </select>

              <div className="flex space-x-3">
                <button
                  onClick={() => handleRoleChange(selectedUser.id, newRole)}
                  className="btn btn-primary btn-md flex-1"
                >
                  변경
                </button>
                <button
                  onClick={() => setShowRoleModal(false)}
                  className="btn btn-outline btn-md flex-1"
                >
                  취소
                </button>
              </div>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}