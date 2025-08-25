import React, { Component, ErrorInfo, ReactNode } from 'react';
import { AlertTriangle, RefreshCcw, Home } from 'lucide-react';

interface Props {
  children: ReactNode;
  fallback?: ReactNode;
}

interface State {
  hasError: boolean;
  error?: Error;
  errorInfo?: ErrorInfo;
}

export class ErrorBoundary extends Component<Props, State> {
  constructor(props: Props) {
    super(props);
    this.state = { hasError: false };
  }

  static getDerivedStateFromError(error: Error): State {
    return { hasError: true, error };
  }

  componentDidCatch(error: Error, errorInfo: ErrorInfo) {
    this.setState({
      error,
      errorInfo,
    });

    // Log error to monitoring service
    console.error('ErrorBoundary caught an error:', error, errorInfo);
    
    // TODO: Send to error reporting service
    // errorReportingService.captureException(error, {
    //   extra: errorInfo,
    //   tags: { boundary: 'react' },
    // });
  }

  handleReset = () => {
    this.setState({ hasError: false, error: undefined, errorInfo: undefined });
  };

  handleReload = () => {
    window.location.reload();
  };

  handleGoHome = () => {
    window.location.href = '/';
  };

  render() {
    if (this.state.hasError) {
      if (this.props.fallback) {
        return this.props.fallback;
      }

      return (
        <div className="min-h-screen flex items-center justify-center bg-gray-50 px-4">
          <div className="max-w-md w-full">
            <div className="bg-white rounded-lg shadow-lg p-6 text-center">
              <div className="flex justify-center mb-4">
                <div className="bg-error-100 rounded-full p-3">
                  <AlertTriangle className="h-8 w-8 text-error-600" />
                </div>
              </div>
              
              <h1 className="text-xl font-semibold text-gray-900 mb-2">
                앗! 문제가 발생했습니다
              </h1>
              
              <p className="text-gray-600 mb-6">
                예상치 못한 오류가 발생했습니다. 잠시 후 다시 시도해주세요.
              </p>

              {process.env.NODE_ENV === 'development' && this.state.error && (
                <div className="bg-gray-100 rounded-lg p-4 mb-6 text-left">
                  <h3 className="text-sm font-medium text-gray-900 mb-2">
                    오류 정보 (개발 모드)
                  </h3>
                  <pre className="text-xs text-gray-700 overflow-auto max-h-40">
                    {this.state.error.toString()}
                    {this.state.errorInfo?.componentStack}
                  </pre>
                </div>
              )}

              <div className="flex flex-col sm:flex-row gap-3">
                <button
                  onClick={this.handleReset}
                  className="btn btn-primary btn-md flex-1 inline-flex items-center justify-center"
                >
                  <RefreshCcw className="h-4 w-4 mr-2" />
                  다시 시도
                </button>
                
                <button
                  onClick={this.handleGoHome}
                  className="btn btn-outline btn-md flex-1 inline-flex items-center justify-center"
                >
                  <Home className="h-4 w-4 mr-2" />
                  홈으로
                </button>
              </div>
              
              <button
                onClick={this.handleReload}
                className="text-sm text-gray-500 hover:text-gray-700 mt-4 transition-colors"
              >
                페이지 새로고침
              </button>
            </div>
          </div>
        </div>
      );
    }

    return this.props.children;
  }
}