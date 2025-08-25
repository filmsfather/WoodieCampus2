import { QueryErrorResetBoundary } from '@tanstack/react-query';
import { ReactNode } from 'react';
import { ErrorBoundary } from './ErrorBoundary';
import { AlertTriangle, RefreshCcw } from 'lucide-react';

interface QueryErrorBoundaryProps {
  children: ReactNode;
}

export function QueryErrorBoundary({ children }: QueryErrorBoundaryProps) {
  return (
    <QueryErrorResetBoundary>
      {({ reset }) => (
        <ErrorBoundary
          fallback={
            <div className="flex items-center justify-center min-h-[400px] px-4">
              <div className="text-center max-w-md">
                <div className="flex justify-center mb-4">
                  <div className="bg-error-100 rounded-full p-3">
                    <AlertTriangle className="h-8 w-8 text-error-600" />
                  </div>
                </div>
                
                <h2 className="text-lg font-semibold text-gray-900 mb-2">
                  데이터를 불러오는 중 오류가 발생했습니다
                </h2>
                
                <p className="text-gray-600 mb-6">
                  네트워크 연결을 확인하고 다시 시도해주세요.
                </p>
                
                <button
                  onClick={reset}
                  className="btn btn-primary btn-md inline-flex items-center"
                >
                  <RefreshCcw className="h-4 w-4 mr-2" />
                  다시 시도
                </button>
              </div>
            </div>
          }
        >
          {children}
        </ErrorBoundary>
      )}
    </QueryErrorResetBoundary>
  );
}