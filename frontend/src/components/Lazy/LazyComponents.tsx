import { lazy, Suspense, ComponentType } from 'react';
import { LoadingSpinner, CardSkeleton, TableSkeleton } from '../Loading/LoadingSpinner';

// Higher-order component for lazy loading with custom loading UI
function withLazyLoading<T extends ComponentType<any>>(
  Component: () => Promise<{ default: T }>,
  LoadingComponent?: ComponentType
) {
  const LazyComponent = lazy(Component);
  
  return (props: React.ComponentProps<T>) => (
    <Suspense fallback={LoadingComponent ? <LoadingComponent /> : <LoadingSpinner />}>
      <LazyComponent {...props} />
    </Suspense>
  );
}

// Lazy load dashboard components
export const LazyLearningDashboard = withLazyLoading(
  () => import('../Dashboard/LearningDashboard'),
  () => (
    <div className="space-y-6">
      <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-6">
        {Array.from({ length: 4 }).map((_, i) => (
          <CardSkeleton key={i} />
        ))}
      </div>
      <div className="grid grid-cols-1 lg:grid-cols-2 gap-8">
        {Array.from({ length: 3 }).map((_, i) => (
          <CardSkeleton key={i} />
        ))}
      </div>
    </div>
  )
);

// Lazy load problem components
export const LazyProblemList = withLazyLoading(
  () => import('../Problems/ProblemList'),
  () => (
    <div className="space-y-6">
      <CardSkeleton />
      <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6">
        {Array.from({ length: 6 }).map((_, i) => (
          <CardSkeleton key={i} />
        ))}
      </div>
    </div>
  )
);

export const LazyProblemSolver = withLazyLoading(
  () => import('../Problems/ProblemSolver'),
  () => (
    <div className="max-w-4xl mx-auto">
      <div className="mb-6 space-y-4">
        <div className="h-8 bg-gray-200 rounded w-32 animate-pulse"></div>
        <div className="h-6 bg-gray-200 rounded w-64 animate-pulse"></div>
      </div>
      <div className="grid grid-cols-1 lg:grid-cols-3 gap-8">
        <div className="lg:col-span-2">
          <CardSkeleton />
        </div>
        <div className="lg:col-span-1">
          <CardSkeleton />
        </div>
      </div>
    </div>
  )
);

// Lazy load admin components
export const LazyProblemManagement = withLazyLoading(
  () => import('../Admin/ProblemManagement'),
  () => (
    <div className="space-y-6">
      <div className="flex justify-between items-center">
        <div className="space-y-2">
          <div className="h-8 bg-gray-200 rounded w-48 animate-pulse"></div>
          <div className="h-4 bg-gray-200 rounded w-64 animate-pulse"></div>
        </div>
        <div className="h-10 bg-gray-200 rounded w-32 animate-pulse"></div>
      </div>
      <CardSkeleton />
      <TableSkeleton rows={8} cols={5} />
    </div>
  )
);

export const LazyUserManagement = withLazyLoading(
  () => import('../Admin/UserManagement'),
  () => (
    <div className="space-y-6">
      <div className="flex justify-between items-center">
        <div className="space-y-2">
          <div className="h-8 bg-gray-200 rounded w-48 animate-pulse"></div>
          <div className="h-4 bg-gray-200 rounded w-64 animate-pulse"></div>
        </div>
        <div className="h-10 bg-gray-200 rounded w-32 animate-pulse"></div>
      </div>
      <CardSkeleton />
      <TableSkeleton rows={10} cols={6} />
    </div>
  )
);

// Lazy load auth components
export const LazyProfile = withLazyLoading(
  () => import('../Auth/Profile'),
  () => (
    <div className="max-w-2xl mx-auto space-y-6">
      <CardSkeleton />
      <CardSkeleton />
    </div>
  )
);