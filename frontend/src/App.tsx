import { BrowserRouter as Router, Routes, Route, Navigate } from 'react-router-dom';
import { QueryClientProvider } from '@tanstack/react-query';
import { ReactQueryDevtools } from '@tanstack/react-query-devtools';
import { AuthProvider } from './contexts/AuthContext';
import { MainLayout } from './components/Layout/MainLayout';
import { ProtectedRoute } from './components/Auth/ProtectedRoute';
import { ErrorBoundary } from './components/ErrorBoundary/ErrorBoundary';
import { QueryErrorBoundary } from './components/ErrorBoundary/QueryErrorBoundary';
import { NotificationCenter } from './components/Notifications/NotificationCenter';
import { InstallPrompt, NetworkStatus } from './components/PWA/InstallPrompt';
import { HomePage } from './components/Home/HomePage';
import { LoginForm } from './components/Auth/LoginForm';
import { RegisterForm } from './components/Auth/RegisterForm';
import { 
  LazyProfile as Profile,
  LazyLearningDashboard as LearningDashboard,
  LazyProblemList as ProblemList,
  LazyProblemSolver as ProblemSolver,
  LazyProblemManagement as ProblemManagement,
  LazyUserManagement as UserManagement
} from './components/Lazy/LazyComponents';
import SocketDemo from './components/SocketDemo';
import { queryClient } from './lib/queryClient';

function App() {
  return (
    <ErrorBoundary>
      <QueryClientProvider client={queryClient}>
        <AuthProvider>
          <Router>
            <QueryErrorBoundary>
              <Routes>
                {/* Public routes */}
                <Route path="/" element={<HomePage />} />
                <Route path="/login" element={<LoginForm />} />
                <Route path="/register" element={<RegisterForm />} />
                <Route path="/socket-demo" element={<SocketDemo />} />
                
                {/* Protected routes with layout */}
                <Route path="/dashboard" element={
                  <ProtectedRoute>
                    <MainLayout>
                      <LearningDashboard />
                    </MainLayout>
                  </ProtectedRoute>
                } />
                
                <Route path="/profile" element={
                  <ProtectedRoute>
                    <MainLayout>
                      <Profile />
                    </MainLayout>
                  </ProtectedRoute>
                } />
                
                <Route path="/problems" element={
                  <ProtectedRoute>
                    <MainLayout>
                      <ProblemList />
                    </MainLayout>
                  </ProtectedRoute>
                } />
                
                <Route path="/problems/:id" element={
                  <ProtectedRoute>
                    <MainLayout>
                      <ProblemSolver />
                    </MainLayout>
                  </ProtectedRoute>
                } />
                
                {/* Admin routes */}
                <Route path="/admin/problems" element={
                  <ProtectedRoute requireAnyRole={['ADMIN', 'INSTRUCTOR']}>
                    <MainLayout>
                      <ProblemManagement />
                    </MainLayout>
                  </ProtectedRoute>
                } />
                
                <Route path="/admin/users" element={
                  <ProtectedRoute requireRole="ADMIN">
                    <MainLayout>
                      <UserManagement />
                    </MainLayout>
                  </ProtectedRoute>
                } />
                
                {/* Fallback route */}
                <Route path="*" element={<Navigate to="/" replace />} />
              </Routes>
            </QueryErrorBoundary>
            
            {/* Global components */}
            <NetworkStatus />
            <NotificationCenter />
            <InstallPrompt />
          </Router>
        </AuthProvider>
        
        {/* React Query Devtools in development */}
        {process.env.NODE_ENV === 'development' && (
          <ReactQueryDevtools initialIsOpen={false} />
        )}
      </QueryClientProvider>
    </ErrorBoundary>
  );
}

export default App
