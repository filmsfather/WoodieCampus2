import { create } from 'zustand';
import { subscribeWithSelector, persist } from 'zustand/middleware';

interface User {
  id: string;
  name: string;
  email: string;
  role: 'STUDENT' | 'INSTRUCTOR' | 'ADMIN' | 'SUPER_ADMIN';
  createdAt: string;
  lastLoginAt?: string;
  isActive: boolean;
}

interface UserPreferences {
  language: string;
  timezone: string;
  emailNotifications: boolean;
  pushNotifications: boolean;
  studyReminders: boolean;
  difficultyPreference: 'EASY' | 'MEDIUM' | 'HARD' | 'MIXED';
  dailyGoal: number; // problems per day
}

interface UserState {
  // User data
  user: User | null;
  isAuthenticated: boolean;
  preferences: UserPreferences;
  
  // Study session
  currentSession: {
    startTime?: number;
    problemsSolved: number;
    timeSpent: number;
    accuracyRate: number;
  } | null;
  
  // Recent activity
  recentProblems: string[]; // problem IDs
  studyStreak: number;
  
  // Actions
  setUser: (user: User | null) => void;
  updatePreferences: (preferences: Partial<UserPreferences>) => void;
  startStudySession: () => void;
  endStudySession: () => void;
  updateSession: (data: Partial<NonNullable<UserState['currentSession']>>) => void;
  addRecentProblem: (problemId: string) => void;
  setStudyStreak: (streak: number) => void;
  clearUserData: () => void;
}

const defaultPreferences: UserPreferences = {
  language: 'ko',
  timezone: 'Asia/Seoul',
  emailNotifications: true,
  pushNotifications: true,
  studyReminders: true,
  difficultyPreference: 'MIXED',
  dailyGoal: 10,
};

export const useUserStore = create<UserState>()(
  subscribeWithSelector(
    persist(
      (set, get) => ({
        // Initial state
        user: null,
        isAuthenticated: false,
        preferences: defaultPreferences,
        currentSession: null,
        recentProblems: [],
        studyStreak: 0,
        
        // Actions
        setUser: (user) => {
          set({
            user,
            isAuthenticated: !!user,
          });
        },
        
        updatePreferences: (newPreferences) => {
          set(state => ({
            preferences: {
              ...state.preferences,
              ...newPreferences
            }
          }));
        },
        
        startStudySession: () => {
          set({
            currentSession: {
              startTime: Date.now(),
              problemsSolved: 0,
              timeSpent: 0,
              accuracyRate: 0,
            }
          });
        },
        
        endStudySession: () => {
          const session = get().currentSession;
          if (session) {
            // Could save session data to backend here
            set({ currentSession: null });
          }
        },
        
        updateSession: (data) => {
          const currentSession = get().currentSession;
          if (currentSession) {
            set({
              currentSession: {
                ...currentSession,
                ...data,
                timeSpent: data.startTime 
                  ? Date.now() - data.startTime 
                  : currentSession.timeSpent
              }
            });
          }
        },
        
        addRecentProblem: (problemId) => {
          set(state => ({
            recentProblems: [
              problemId,
              ...state.recentProblems.filter(id => id !== problemId)
            ].slice(0, 20) // Keep only last 20 problems
          }));
        },
        
        setStudyStreak: (streak) => set({ studyStreak: streak }),
        
        clearUserData: () => {
          set({
            user: null,
            isAuthenticated: false,
            currentSession: null,
            recentProblems: [],
            studyStreak: 0,
            preferences: defaultPreferences,
          });
        },
      }),
      {
        name: 'user-store',
        partialize: (state) => ({
          user: state.user,
          isAuthenticated: state.isAuthenticated,
          preferences: state.preferences,
          recentProblems: state.recentProblems,
          studyStreak: state.studyStreak,
        }),
      }
    )
  )
);