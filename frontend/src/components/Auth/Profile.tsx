import { useState } from 'react';
import { useForm } from 'react-hook-form';
import { zodResolver } from '@hookform/resolvers/zod';
import { z } from 'zod';
import { User, Mail, Calendar, Shield, Save } from 'lucide-react';
import { useAuth } from '../../contexts/AuthContext';

const profileSchema = z.object({
  name: z.string().min(2, '이름은 최소 2자 이상이어야 합니다'),
  email: z.string().email('유효한 이메일 주소를 입력해주세요'),
});

type ProfileFormData = z.infer<typeof profileSchema>;

export function Profile() {
  const { user, updateProfile } = useAuth();
  const [isLoading, setIsLoading] = useState(false);
  const [message, setMessage] = useState<{ type: 'success' | 'error'; text: string } | null>(null);

  const {
    register,
    handleSubmit,
    formState: { errors, isDirty },
  } = useForm<ProfileFormData>({
    resolver: zodResolver(profileSchema),
    defaultValues: {
      name: user?.name || '',
      email: user?.email || '',
    },
  });

  const onSubmit = async (data: ProfileFormData) => {
    try {
      setIsLoading(true);
      setMessage(null);
      await updateProfile(data);
      setMessage({ type: 'success', text: '프로필이 성공적으로 업데이트되었습니다.' });
    } catch (err) {
      setMessage({
        type: 'error',
        text: err instanceof Error ? err.message : '프로필 업데이트에 실패했습니다',
      });
    } finally {
      setIsLoading(false);
    }
  };

  const getRoleBadgeColor = (role: string) => {
    switch (role) {
      case 'ADMIN':
      case 'SUPER_ADMIN':
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
      case 'ADMIN':
        return '관리자';
      case 'SUPER_ADMIN':
        return '최고 관리자';
      case 'INSTRUCTOR':
        return '강사';
      case 'STUDENT':
        return '학생';
      default:
        return role;
    }
  };

  if (!user) {
    return (
      <div className="flex items-center justify-center min-h-[400px]">
        <div className="animate-spin rounded-full h-8 w-8 border-b-2 border-primary-600"></div>
      </div>
    );
  }

  return (
    <div className="max-w-2xl mx-auto">
      <div className="bg-white shadow rounded-lg">
        <div className="px-4 py-5 sm:p-6">
          <div className="flex items-center mb-6">
            <div className="flex-shrink-0">
              <div className="h-20 w-20 rounded-full bg-primary-100 flex items-center justify-center">
                <User className="h-10 w-10 text-primary-600" />
              </div>
            </div>
            <div className="ml-6">
              <h3 className="text-lg font-medium text-gray-900">{user.name}</h3>
              <p className="text-sm text-gray-500">{user.email}</p>
              <div className="mt-2 flex items-center space-x-2">
                <span className={`inline-flex items-center px-2.5 py-0.5 rounded-full text-xs font-medium ${getRoleBadgeColor(user.role)}`}>
                  <Shield className="h-3 w-3 mr-1" />
                  {getRoleLabel(user.role)}
                </span>
                <span className="inline-flex items-center text-xs text-gray-500">
                  <Calendar className="h-3 w-3 mr-1" />
                  가입일: {new Date(user.createdAt).toLocaleDateString()}
                </span>
              </div>
            </div>
          </div>

          {message && (
            <div className={`mb-6 rounded-md p-4 ${
              message.type === 'success' ? 'bg-success-50' : 'bg-error-50'
            }`}>
              <p className={`text-sm ${
                message.type === 'success' ? 'text-success-600' : 'text-error-600'
              }`}>
                {message.text}
              </p>
            </div>
          )}

          <form onSubmit={handleSubmit(onSubmit)} className="space-y-6">
            <div>
              <label htmlFor="name" className="block text-sm font-medium text-gray-700">
                이름
              </label>
              <div className="mt-1 relative">
                <User className="absolute left-3 top-1/2 transform -translate-y-1/2 h-4 w-4 text-gray-400" />
                <input
                  id="name"
                  type="text"
                  className="input pl-10"
                  placeholder="이름을 입력하세요"
                  {...register('name')}
                />
              </div>
              {errors.name && (
                <p className="mt-1 text-sm text-error-600">{errors.name.message}</p>
              )}
            </div>

            <div>
              <label htmlFor="email" className="block text-sm font-medium text-gray-700">
                이메일 주소
              </label>
              <div className="mt-1 relative">
                <Mail className="absolute left-3 top-1/2 transform -translate-y-1/2 h-4 w-4 text-gray-400" />
                <input
                  id="email"
                  type="email"
                  className="input pl-10"
                  placeholder="이메일을 입력하세요"
                  {...register('email')}
                />
              </div>
              {errors.email && (
                <p className="mt-1 text-sm text-error-600">{errors.email.message}</p>
              )}
            </div>

            <div className="pt-4 border-t border-gray-200">
              <button
                type="submit"
                disabled={!isDirty || isLoading}
                className="btn btn-primary btn-md inline-flex items-center"
              >
                {isLoading ? (
                  <>
                    <div className="animate-spin rounded-full h-4 w-4 border-b-2 border-white mr-2"></div>
                    업데이트 중...
                  </>
                ) : (
                  <>
                    <Save className="h-4 w-4 mr-2" />
                    프로필 저장
                  </>
                )}
              </button>
            </div>
          </form>
        </div>
      </div>

      {/* 추가 정보 섹션 */}
      <div className="mt-8 bg-white shadow rounded-lg">
        <div className="px-4 py-5 sm:p-6">
          <h3 className="text-lg font-medium text-gray-900 mb-4">계정 설정</h3>
          <div className="space-y-4">
            <div className="flex items-center justify-between">
              <div>
                <p className="text-sm font-medium text-gray-900">비밀번호 변경</p>
                <p className="text-sm text-gray-500">보안을 위해 정기적으로 비밀번호를 변경하세요</p>
              </div>
              <button className="btn btn-outline btn-sm">
                변경
              </button>
            </div>
            <div className="flex items-center justify-between">
              <div>
                <p className="text-sm font-medium text-gray-900">이메일 알림</p>
                <p className="text-sm text-gray-500">학습 진도 및 복습 알림을 이메일로 받기</p>
              </div>
              <label className="flex items-center">
                <input
                  type="checkbox"
                  defaultChecked
                  className="h-4 w-4 text-primary-600 focus:ring-primary-500 border-gray-300 rounded"
                />
              </label>
            </div>
            <div className="flex items-center justify-between">
              <div>
                <p className="text-sm font-medium text-gray-900">계정 삭제</p>
                <p className="text-sm text-gray-500">계정과 모든 데이터를 영구적으로 삭제합니다</p>
              </div>
              <button className="btn text-error-600 hover:text-error-700 hover:bg-error-50 btn-sm">
                삭제
              </button>
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}