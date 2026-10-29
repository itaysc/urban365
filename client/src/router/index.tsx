import { PrivacyPage, TermsPage } from '@/pages/LegalPage';
import { Navigate, createBrowserRouter } from 'react-router-dom';
import { RequireAdmin, RequireAuth } from '@/auth/RequireAuth';
import { HomePage } from '@/pages/HomePage';
import { SearchPage } from '@/pages/SearchPage';
import { ForgotPasswordPage } from '@/pages/auth/ForgotPasswordPage';
import { LoginPage } from '@/pages/auth/LoginPage';
import { ResetPasswordPage } from '@/pages/auth/ResetPasswordPage';
import { SignupPage } from '@/pages/auth/SignupPage';
import { AcceptInvitePage } from '@/pages/auth/AcceptInvitePage';
import { AccountLoginPage } from '@/pages/auth/AccountLoginPage';
import { AccountSignupPage } from '@/pages/auth/AccountSignupPage';
import { AppLayout } from '@/pages/app/AppLayout';
import { DashboardPage } from '@/pages/app/DashboardPage';
import { MyListingsPage } from '@/pages/app/MyListingsPage';
import { PendingPage } from '@/pages/app/PendingPage';
import { AgencyProfilePage } from '@/pages/app/AgencyProfilePage';
import { MyProfilePage } from '@/pages/app/MyProfilePage';
import { TeamPage } from '@/pages/app/TeamPage';
import { DealsPage } from '@/pages/app/DealsPage';
import { LeadsPage } from '@/pages/app/LeadsPage';
import { ListingEditorPage } from '@/pages/app/ListingEditorPage';
import { ModerationPage } from '@/pages/admin/ModerationPage';

export const router = createBrowserRouter([
  // ── public ──────────────────────────────────────────────────────────────────
  // Search is the front door. Filters live in the query string, so a filtered search
  // is shareable.
  { path: '/', element: <SearchPage /> },
  // Kept so links minted while search lived here keep working.
  { path: '/search', element: <Navigate to="/" replace /> },
  // An agency's public page. The yad2 importer used to sit on this component for
  // anyone to run; it now lives in the agency's own dashboard.
  { path: '/agency/:agencyId', element: <HomePage /> },

  // Email verification has no page of its own: the server's redirect consumes the token
  // and lands on /login?verified=1, which LoginPage reports.
  // Buyers are most people, so they get the short paths. The agency sign-in is a link
  // from them rather than the other way round — the same arrangement yad2 uses.
  { path: '/terms', element: <TermsPage /> },
  { path: '/privacy', element: <PrivacyPage /> },
  { path: '/login', element: <AccountLoginPage /> },
  { path: '/signup', element: <AccountSignupPage /> },
  { path: '/agency/login', element: <LoginPage /> },
  { path: '/agency/signup', element: <SignupPage /> },
  { path: '/forgot-password', element: <ForgotPasswordPage /> },
  { path: '/reset-password', element: <ResetPasswordPage /> },
  // Public: whoever follows the emailed link may not have an account yet.
  { path: '/accept-invite', element: <AcceptInvitePage /> },

  // ── signed in ───────────────────────────────────────────────────────────────
  // RequireAuth is a layout route, so the check runs once for the whole subtree
  // rather than being repeated — and forgotten — on each page.
  {
    element: <RequireAuth />,
    children: [
      {
        element: <AppLayout />,
        children: [
          // Both reachable while the agency claim is still pending: waiting for
          // approval should not stop you filling in your own details.
          { path: '/app/pending', element: <PendingPage /> },
          { path: '/app/profile', element: <MyProfilePage /> },
          {
            element: <RequireAuth requireAgency />,
            children: [
              { path: '/app', element: <DashboardPage /> },
              { path: '/app/listings', element: <MyListingsPage /> },
              // `new` before `:listingId` so the literal wins over the parameter.
              { path: '/app/listings/new', element: <ListingEditorPage /> },
              { path: '/app/listings/:listingId', element: <ListingEditorPage /> },
              { path: '/app/leads', element: <LeadsPage /> },
              { path: '/app/deals', element: <DealsPage /> },
              { path: '/app/agency', element: <AgencyProfilePage /> },
              { path: '/app/team', element: <TeamPage /> },
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
