import { RouterProvider } from 'react-router-dom';
import { QueryClientProvider } from '@tanstack/react-query';
import { AuthProvider } from '@/auth/AuthProvider';
import { ToastProvider } from '@/components/ui/Toast';
import { queryClient } from '@/queries/client';
import { router } from '@/router';

export default function App() {
  // Query outermost: AuthProvider is now a reader of the cache, so the client has to
  // exist before it mounts. The session is still hydrated once for the whole app, and
  // neither provider uses router hooks, so both sit outside the router.
  return (
    <QueryClientProvider client={queryClient}>
      <ToastProvider>
        <AuthProvider>
          <RouterProvider router={router} />
        </AuthProvider>
      </ToastProvider>
    </QueryClientProvider>
  );
}
