import { RouterProvider } from 'react-router-dom';
import { AuthProvider } from '@/auth/AuthProvider';
import { router } from '@/router';

export default function App() {
  // Outside the router on purpose: the session is hydrated once for the whole app, and
  // AuthProvider uses no router hooks, so it does not need to sit inside a route.
  return (
    <AuthProvider>
      <RouterProvider router={router} />
    </AuthProvider>
  );
}
