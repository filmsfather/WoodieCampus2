import { Link } from 'react-router-dom';
import { BookOpen, BarChart3, Users, Target, ArrowRight } from 'lucide-react';
import { useAuth } from '../../contexts/AuthContext';

export function HomePage() {
  const { user } = useAuth();

  if (!user) {
    return (
      <div className="min-h-screen bg-gradient-to-br from-primary-50 to-blue-100">
        <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8">
          {/* Hero Section */}
          <div className="pt-20 pb-16 text-center">
            <div className="max-w-4xl mx-auto">
              <h1 className="text-5xl md:text-6xl font-bold text-gray-900 mb-6">
                <span className="text-primary-600">WoodieCampus</span>
                <br />
                스마트 학습 플랫폼
              </h1>
              <p className="text-xl text-gray-600 mb-8 max-w-3xl mx-auto">
                망각곡선 알고리즘 기반의 개인화된 학습 경험을 제공합니다. 
                효율적인 반복 학습으로 장기 기억을 강화하세요.
              </p>
              <div className="flex flex-col sm:flex-row gap-4 justify-center">
                <Link
                  to="/register"
                  className="btn btn-primary btn-lg inline-flex items-center"
                >
                  무료로 시작하기
                  <ArrowRight className="ml-2 h-5 w-5" />
                </Link>
                <Link
                  to="/login"
                  className="btn btn-outline btn-lg"
                >
                  로그인
                </Link>
              </div>
            </div>
          </div>

          {/* Features Section */}
          <div className="py-16">
            <div className="max-w-4xl mx-auto">
              <h2 className="text-3xl font-bold text-center text-gray-900 mb-12">
                왜 WoodieCampus인가요?
              </h2>
              
              <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-8">
                <div className="text-center">
                  <div className="bg-primary-100 rounded-full w-16 h-16 flex items-center justify-center mx-auto mb-4">
                    <Target className="h-8 w-8 text-primary-600" />
                  </div>
                  <h3 className="text-xl font-semibold text-gray-900 mb-2">
                    개인화된 학습
                  </h3>
                  <p className="text-gray-600">
                    망각곡선 알고리즘으로 개인의 학습 패턴을 분석하여 
                    최적의 복습 타이밍을 제공합니다.
                  </p>
                </div>

                <div className="text-center">
                  <div className="bg-success-100 rounded-full w-16 h-16 flex items-center justify-center mx-auto mb-4">
                    <BarChart3 className="h-8 w-8 text-success-600" />
                  </div>
                  <h3 className="text-xl font-semibold text-gray-900 mb-2">
                    실시간 진도 추적
                  </h3>
                  <p className="text-gray-600">
                    학습 진행 상황을 실시간으로 확인하고, 
                    데이터 기반의 학습 인사이트를 제공합니다.
                  </p>
                </div>

                <div className="text-center">
                  <div className="bg-warning-100 rounded-full w-16 h-16 flex items-center justify-center mx-auto mb-4">
                    <BookOpen className="h-8 w-8 text-warning-600" />
                  </div>
                  <h3 className="text-xl font-semibold text-gray-900 mb-2">
                    다양한 문제 유형
                  </h3>
                  <p className="text-gray-600">
                    객관식, 단답형, 서술형 등 다양한 문제 유형으로 
                    종합적인 학습 능력을 향상시킵니다.
                  </p>
                </div>
              </div>
            </div>
          </div>

          {/* CTA Section */}
          <div className="py-16 bg-gray-900 rounded-2xl text-white text-center">
            <div className="max-w-3xl mx-auto px-8">
              <h2 className="text-3xl font-bold mb-4">
                지금 바로 시작하세요!
              </h2>
              <p className="text-xl text-gray-300 mb-8">
                수천 명의 학습자가 이미 WoodieCampus와 함께 
                효과적인 학습을 경험하고 있습니다.
              </p>
              <Link
                to="/register"
                className="btn btn-primary btn-lg inline-flex items-center"
              >
                무료 회원가입
                <ArrowRight className="ml-2 h-5 w-5" />
              </Link>
            </div>
          </div>
        </div>
      </div>
    );
  }

  // Authenticated user dashboard redirect
  return (
    <div className="text-center py-16">
      <div className="max-w-2xl mx-auto">
        <h1 className="text-3xl font-bold text-gray-900 mb-6">
          환영합니다, {user.name}님!
        </h1>
        <p className="text-lg text-gray-600 mb-8">
          오늘도 효과적인 학습을 시작해보세요.
        </p>
        
        <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
          <Link
            to="/dashboard"
            className="card hover:shadow-md transition-shadow p-6 text-left"
          >
            <div className="flex items-center mb-4">
              <div className="bg-primary-100 rounded-full w-12 h-12 flex items-center justify-center mr-4">
                <BarChart3 className="h-6 w-6 text-primary-600" />
              </div>
              <div>
                <h3 className="text-lg font-semibold text-gray-900">대시보드</h3>
                <p className="text-sm text-gray-600">학습 진도를 확인하세요</p>
              </div>
            </div>
            <ArrowRight className="h-5 w-5 text-gray-400" />
          </Link>

          <Link
            to="/problems"
            className="card hover:shadow-md transition-shadow p-6 text-left"
          >
            <div className="flex items-center mb-4">
              <div className="bg-success-100 rounded-full w-12 h-12 flex items-center justify-center mr-4">
                <BookOpen className="h-6 w-6 text-success-600" />
              </div>
              <div>
                <h3 className="text-lg font-semibold text-gray-900">문제 풀이</h3>
                <p className="text-sm text-gray-600">새로운 문제에 도전하세요</p>
              </div>
            </div>
            <ArrowRight className="h-5 w-5 text-gray-400" />
          </Link>
        </div>
      </div>
    </div>
  );
}