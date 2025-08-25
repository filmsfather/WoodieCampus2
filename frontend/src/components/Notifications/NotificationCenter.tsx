import { useEffect } from 'react';
import { X, CheckCircle, XCircle, AlertTriangle, Info } from 'lucide-react';
import { useAppStore } from '../../stores/useAppStore';

export function NotificationCenter() {
  const { notifications, removeNotification } = useAppStore();

  const getIcon = (type: string) => {
    switch (type) {
      case 'success':
        return <CheckCircle className="h-5 w-5" />;
      case 'error':
        return <XCircle className="h-5 w-5" />;
      case 'warning':
        return <AlertTriangle className="h-5 w-5" />;
      case 'info':
      default:
        return <Info className="h-5 w-5" />;
    }
  };

  const getColors = (type: string) => {
    switch (type) {
      case 'success':
        return 'bg-success-50 border-success-200 text-success-800';
      case 'error':
        return 'bg-error-50 border-error-200 text-error-800';
      case 'warning':
        return 'bg-warning-50 border-warning-200 text-warning-800';
      case 'info':
      default:
        return 'bg-blue-50 border-blue-200 text-blue-800';
    }
  };

  if (notifications.length === 0) {
    return null;
  }

  return (
    <div className="fixed top-4 right-4 z-50 space-y-4 max-w-sm w-full">
      {notifications.map((notification) => (
        <div
          key={notification.id}
          className={`border rounded-lg shadow-lg p-4 transition-all duration-300 transform ${getColors(
            notification.type
          )}`}
        >
          <div className="flex items-start">
            <div className="flex-shrink-0">
              {getIcon(notification.type)}
            </div>
            <div className="ml-3 flex-1">
              <h3 className="text-sm font-medium">
                {notification.title}
              </h3>
              {notification.message && (
                <p className="mt-1 text-sm opacity-90">
                  {notification.message}
                </p>
              )}
              {notification.action && (
                <div className="mt-3">
                  <button
                    onClick={notification.action.onClick}
                    className="text-sm font-medium hover:underline"
                  >
                    {notification.action.label}
                  </button>
                </div>
              )}
            </div>
            <div className="ml-4">
              <button
                onClick={() => removeNotification(notification.id)}
                className="inline-flex text-gray-400 hover:text-gray-600 focus:outline-none"
              >
                <X className="h-4 w-4" />
              </button>
            </div>
          </div>
        </div>
      ))}
    </div>
  );
}

// Hook for easy notification usage
export function useNotifications() {
  const { addNotification, removeNotification, clearNotifications } = useAppStore();

  const notify = {
    success: (title: string, message?: string, options?: { duration?: number; action?: { label: string; onClick: () => void } }) =>
      addNotification({ type: 'success', title, message, ...options }),
    error: (title: string, message?: string, options?: { duration?: number; action?: { label: string; onClick: () => void } }) =>
      addNotification({ type: 'error', title, message, duration: options?.duration ?? 0, ...options }),
    warning: (title: string, message?: string, options?: { duration?: number; action?: { label: string; onClick: () => void } }) =>
      addNotification({ type: 'warning', title, message, ...options }),
    info: (title: string, message?: string, options?: { duration?: number; action?: { label: string; onClick: () => void } }) =>
      addNotification({ type: 'info', title, message, ...options }),
  };

  return {
    notify,
    removeNotification,
    clearNotifications,
  };
}