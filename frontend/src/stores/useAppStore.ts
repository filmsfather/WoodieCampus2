import { create } from 'zustand';
import { subscribeWithSelector } from 'zustand/middleware';

interface Notification {
  id: string;
  type: 'success' | 'error' | 'warning' | 'info';
  title: string;
  message?: string;
  duration?: number;
  action?: {
    label: string;
    onClick: () => void;
  };
}

interface AppState {
  // UI State
  sidebarOpen: boolean;
  theme: 'light' | 'dark' | 'system';
  
  // Notifications
  notifications: Notification[];
  
  // Loading states
  globalLoading: boolean;
  loadingStates: Record<string, boolean>;
  
  // Actions
  setSidebarOpen: (open: boolean) => void;
  toggleSidebar: () => void;
  setTheme: (theme: 'light' | 'dark' | 'system') => void;
  
  addNotification: (notification: Omit<Notification, 'id'>) => void;
  removeNotification: (id: string) => void;
  clearNotifications: () => void;
  
  setGlobalLoading: (loading: boolean) => void;
  setLoadingState: (key: string, loading: boolean) => void;
  getLoadingState: (key: string) => boolean;
}

export const useAppStore = create<AppState>()(
  subscribeWithSelector((set, get) => ({
    // Initial state
    sidebarOpen: false,
    theme: 'system',
    notifications: [],
    globalLoading: false,
    loadingStates: {},
    
    // UI Actions
    setSidebarOpen: (open) => set({ sidebarOpen: open }),
    toggleSidebar: () => set(state => ({ sidebarOpen: !state.sidebarOpen })),
    setTheme: (theme) => {
      set({ theme });
      localStorage.setItem('theme', theme);
    },
    
    // Notification Actions
    addNotification: (notification) => {
      const id = Math.random().toString(36).substr(2, 9);
      const newNotification = {
        ...notification,
        id,
        duration: notification.duration ?? 5000,
      };
      
      set(state => ({
        notifications: [...state.notifications, newNotification]
      }));
      
      // Auto remove notification after duration
      if (newNotification.duration > 0) {
        setTimeout(() => {
          get().removeNotification(id);
        }, newNotification.duration);
      }
    },
    
    removeNotification: (id) => set(state => ({
      notifications: state.notifications.filter(n => n.id !== id)
    })),
    
    clearNotifications: () => set({ notifications: [] }),
    
    // Loading Actions
    setGlobalLoading: (loading) => set({ globalLoading: loading }),
    setLoadingState: (key, loading) => set(state => ({
      loadingStates: {
        ...state.loadingStates,
        [key]: loading
      }
    })),
    getLoadingState: (key) => get().loadingStates[key] || false,
  }))
);

// Initialize theme from localStorage
if (typeof window !== 'undefined') {
  const savedTheme = localStorage.getItem('theme') as 'light' | 'dark' | 'system' | null;
  if (savedTheme) {
    useAppStore.getState().setTheme(savedTheme);
  }
}