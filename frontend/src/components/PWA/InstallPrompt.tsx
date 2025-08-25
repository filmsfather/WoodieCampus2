import { useState, useEffect } from 'react';
import { X, Download, Smartphone } from 'lucide-react';
import { pwaManager } from '../../utils/pwa';
import { useAppStore } from '../../stores/useAppStore';

export function InstallPrompt() {
  const [showPrompt, setShowPrompt] = useState(false);
  const [isInstalling, setIsInstalling] = useState(false);
  const { addNotification } = useAppStore();

  useEffect(() => {
    const handleInstallable = () => {
      // Show install prompt after a delay
      setTimeout(() => {
        setShowPrompt(true);
      }, 2000);
    };

    const handleInstalled = () => {
      setShowPrompt(false);
      addNotification({
        type: 'success',
        title: 'WoodieCampus 설치 완료!',
        message: '이제 홈 화면에서 바로 접근할 수 있습니다.',
      });
    };

    window.addEventListener('pwa-installable', handleInstallable);
    window.addEventListener('pwa-installed', handleInstalled);

    return () => {
      window.removeEventListener('pwa-installable', handleInstallable);
      window.removeEventListener('pwa-installed', handleInstalled);
    };
  }, [addNotification]);

  const handleInstall = async () => {
    setIsInstalling(true);
    try {
      const success = await pwaManager.installPWA();
      if (success) {
        setShowPrompt(false);
      }
    } catch (error) {
      console.error('Install failed:', error);
      addNotification({
        type: 'error',
        title: '설치 실패',
        message: '앱 설치 중 문제가 발생했습니다.',
      });
    } finally {
      setIsInstalling(false);
    }
  };

  const handleDismiss = () => {
    setShowPrompt(false);
    localStorage.setItem('pwa-install-dismissed', Date.now().toString());
  };

  // Don't show if already dismissed recently
  useEffect(() => {
    const dismissed = localStorage.getItem('pwa-install-dismissed');
    if (dismissed) {
      const dismissedTime = parseInt(dismissed);
      const daysSinceDismissed = (Date.now() - dismissedTime) / (1000 * 60 * 60 * 24);
      if (daysSinceDismissed < 7) {
        setShowPrompt(false);
      }
    }
  }, []);

  if (!showPrompt || pwaManager.isPWA()) {
    return null;
  }

  return (
    <div className="fixed bottom-4 left-4 right-4 md:left-auto md:right-4 md:max-w-sm z-40">
      <div className="bg-white rounded-lg shadow-lg border p-4 transition-all duration-300 transform">
        <div className="flex items-start">
          <div className="flex-shrink-0">
            <div className="bg-primary-100 rounded-full p-2">
              <Smartphone className="h-5 w-5 text-primary-600" />
            </div>
          </div>
          
          <div className="ml-3 flex-1">
            <h3 className="text-sm font-semibold text-gray-900">
              앱으로 설치하기
            </h3>
            <p className="mt-1 text-sm text-gray-600">
              홈 화면에 WoodieCampus를 추가하여 더 빠르게 접근하세요!
            </p>
            
            <div className="mt-4 flex space-x-3">
              <button
                onClick={handleInstall}
                disabled={isInstalling}
                className="btn btn-primary btn-sm inline-flex items-center"
              >
                {isInstalling ? (
                  <>
                    <div className="animate-spin rounded-full h-3 w-3 border-b border-white mr-2"></div>
                    설치 중...
                  </>
                ) : (
                  <>
                    <Download className="h-3 w-3 mr-2" />
                    설치
                  </>
                )}
              </button>
              
              <button
                onClick={handleDismiss}
                className="btn btn-outline btn-sm"
              >
                나중에
              </button>
            </div>
          </div>
          
          <div className="ml-4">
            <button
              onClick={handleDismiss}
              className="text-gray-400 hover:text-gray-600"
            >
              <X className="h-4 w-4" />
            </button>
          </div>
        </div>
      </div>
    </div>
  );
}

// Network status indicator
export function NetworkStatus() {
  const [isOnline, setIsOnline] = useState(navigator.onLine);

  useEffect(() => {
    const handleOnline = () => setIsOnline(true);
    const handleOffline = () => setIsOnline(false);

    window.addEventListener('online', handleOnline);
    window.addEventListener('offline', handleOffline);

    return () => {
      window.removeEventListener('online', handleOnline);
      window.removeEventListener('offline', handleOffline);
    };
  }, []);

  if (isOnline) {
    return null;
  }

  return (
    <div className="fixed top-0 left-0 right-0 bg-warning-600 text-white text-center py-2 text-sm font-medium z-50">
      오프라인 상태입니다. 일부 기능이 제한될 수 있습니다.
    </div>
  );
}