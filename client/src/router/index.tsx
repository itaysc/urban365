import { createBrowserRouter } from 'react-router-dom';
import { RequireAdmin, RequireAuth } from '@/auth/RequireAuth';
import { HomePage } from '@/pages/HomePage';
import { SearchPage } from '@/pages/SearchPage';
import { ForgotPasswordPage } from '@/pages/auth/ForgotPasswordPage';
import { LoginPage } from '@/pages/auth/LoginPage';
import { ResetPasswordPage } from '@/pages/auth/ResetPasswordPage';
import { SignupPage } from '@/pages/auth/SignupPage';
import { AppLayout } from '@/pages/app/AppLayout';
import { DashboardPage } from '@/pages/app/DashboardPage';
import { MyListingsPage } from '@/pages/app/MyListingsPage';
import { PendingPage } from '@/pages/app/PendingPage';
import { ModerationPage } from '@/pages/admin/ModerationPage';

export const router = createBrowserRouter([
  // ── public ──────────────────────────────────────────────────────────────────
  // The agency, the page and the open listing all live in the URL, so any view —
  // including an open listing modal — can be linked to and survives a reload.
  { path: '/', element: <HomePage /> },
  { path: '/agency/:agencyId', element: <HomePage /> },
  // Search filters live in the query string too, so a filtered search is shareable.
  { path: '/search', element: <SearchPage /> },

  // Email verification has no page of its own: the server's redirect consumes the token
  // and lands on /login?verified=1, which LoginPage reports.
  { path: '/login', element: <LoginPage /> },
  { path: '/signup', element: <SignupPage /> },
  { path: '/forgot-password', element: <ForgotPasswordPage /> },
  { path: '/reset-password', element: <ResetPasswordPage /> },

  // ── signed in ───────────────────────────────────────────────────────────────
  // RequireAuth is a layout route, so the check runs once for the whole subtree
  // rather than being repeated — and forgotten — on each page.
  {
    element: <RequireAuth />,
    children: [
      {
        element: <AppLayout />,
        children: [
          // Reachable while the agency claim is still pending, which is the point.
          { path: '/app/pending', element: <PendingPage /> },
          {
            element: <RequireAuth requireAgency />,
            children: [
              { path: '/app', element: <DashboardPage /> },
              { path: '/app/listings', element: <MyListingsPage /> },
            ],
          },
        ],
      },
    ],
  },

  // ── platform staff ──────────────────────────────────────────────────────────
  {
    element: <RequireAdmin />,
    children: [
      {
        element: <AppLayout />,
        children: [{ path: '/admin/moderation', element: <ModerationPage /> }],
      },
    ],
  },
]);
