import { SavedPage } from '@/pages/SavedPage';
import { AlertsPage } from '@/pages/AlertsPage';
import { SellerViewingPage } from '@/pages/SellerViewingPage';
import { ViewingPage } from '@/pages/ViewingPage';
import { AccessibilityPage, PrivacyPage, TermsPage } from '@/pages/LegalPage';
import { Navigate, Outlet, createBrowserRouter } from 'react-router-dom';
import { RequireAdmin, RequireAuth } from '@/auth/RequireAuth';
import { HomePage } from '@/pages/HomePage';
import { LandingPage } from '@/pages/LandingPage';
import { MortgagePage } from '@/pages/MortgagePage';
import { ValuationPage } from '@/pages/ValuationPage';
import { SearchPage } from '@/pages/SearchPage';
import { ForgotPasswordPage } from '@/pages/auth/ForgotPasswordPage';
import { LoginPage } from '@/pages/auth/LoginPage';
import { ResetPasswordPage } from '@/pages/auth/ResetPasswordPage';
import { SignupPage } from '@/pages/auth/SignupPage';
import { AcceptInvitePage } from '@/pages/auth/AcceptInvitePage';
import { AccountLoginPage } from '@/pages/auth/AccountLoginPage';
import { AccountSignupPage } from '@/pages/auth/AccountSignupPage';
import { AgencyClaimPage } from '@/pages/auth/AgencyClaimPage';
import { AppLayout } from '@/pages/app/AppLayout';
import { DashboardPage } from '@/pages/app/DashboardPage';
import { MyListingsPage } from '@/pages/app/MyListingsPage';
import { PendingPage } from '@/pages/app/PendingPage';
import { AgencyProfilePage } from '@/pages/app/AgencyProfilePage';
import { MyProfilePage } from '@/pages/app/MyProfilePage';
import { TeamPage } from '@/pages/app/TeamPage';
import { DealsPage } from '@/pages/app/DealsPage';
import { LeadsPage } from '@/pages/app/LeadsPage';
import { CustomersPage } from '@/pages/app/CustomersPage';
import { CalendarPage } from '@/pages/app/CalendarPage';
import { RadarPage } from '@/pages/app/RadarPage';
import { CoBrokeragePage } from '@/pages/app/CoBrokeragePage';
import { ListingEditorPage } from '@/pages/app/ListingEditorPage';
import { ModerationPage } from '@/pages/admin/ModerationPage';
import { MySalePage } from '@/pages/sell/MySalePage';
import { PublishPage } from '@/pages/sell/PublishPage';
import { PageTitle } from '@/components/PageTitle';
import { PreviewBanner } from '@/components/PreviewBanner';

export const router = createBrowserRouter([
  {
    /*
      A pathless root, so there is somewhere for things that belong to every route to
      live. `PageTitle` is the first of them: it needs the router's own location, so it
      cannot sit outside the provider, and mounting it here means it survives every
      navigation rather than remounting per page.
    */
    element: (
      <>
        <PreviewBanner />
        <PageTitle />
        <Outlet />
      </>
    ),
    children: [
  // ── public ──────────────────────────────────────────────────────────────────
  /*
   * The front door is a front door now. It used to be the results page, so the site
   * opened on a grid of whatever was newest and a map of the whole country.
   *
   * Every link ever minted at `/` with a query string — shared searches, the city
   * pages, bookmarks — is carried on to `/search` by `LandingPage` rather than landing
   * on a page that ignores it.
   */
  { path: '/', element: <LandingPage /> },
  // Filters live in the query string, so a filtered search is still shareable.
  { path: '/search', element: <SearchPage /> },
  // Takes `?price=` from a listing, so arriving from one opens on that flat's figures.
  { path: '/mortgage', element: <MortgagePage /> },
  { path: '/valuation', element: <ValuationPage /> },
  // An agency's public page. The yad2 importer used to sit on this component for
  // anyone to run; it now lives in the agency's own dashboard.
  { path: '/agency/:agencyId', element: <HomePage /> },

  // Email verification has no page of its own: the server's redirect consumes the token
  // and lands on /login?verified=1, which LoginPage reports.
  // Buyers are most people, so they get the short paths. The agency sign-in is a link
  // from them rather than the other way round — the same arrangement yad2 uses.
  { path: '/saved', element: <SavedPage /> },
  { path: '/alerts', element: <AlertsPage /> },
  // Where a viewing email lands. Public: the customer has never signed in, and the
  // token in the path is the whole of the authorisation.
  // Two segments, so it cannot be mistaken for a buyer's token — and the two links are
  // deliberately different, because the two people are answering different questions.
  { path: '/viewing/seller/:token', element: <SellerViewingPage /> },
  { path: '/viewing/:token', element: <ViewingPage /> },
  { path: '/terms', element: <TermsPage /> },
  { path: '/policy', element: <PrivacyPage /> },
  /*
    Linked from the foot of every page and from the accessibility toolbar's own button,
    both of which pointed here while there was no route — so the regulations' statement
    was a blank screen.
  */
  { path: '/accessibility', element: <AccessibilityPage /> },
  // The earlier spelling, kept so links already in the wild still land somewhere.
  { path: '/privacy', element: <Navigate to="/policy" replace /> },
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
              { path: '/app/radar', element: <RadarPage /> },
              { path: '/app/cobrokerage', element: <CoBrokeragePage /> },
              { path: '/app/listings', element: <MyListingsPage /> },
              // `new` before `:listingId` so the literal wins over the parameter.
              { path: '/app/listings/new', element: <ListingEditorPage /> },
              { path: '/app/listings/:listingId', element: <ListingEditorPage /> },
              { path: '/app/leads', element: <LeadsPage /> },
              { path: '/app/customers', element: <CustomersPage /> },
              { path: '/app/calendar', element: <CalendarPage /> },
              { path: '/app/deals', element: <DealsPage /> },
              { path: '/app/agency', element: <AgencyProfilePage /> },
              { path: '/app/team', element: <TeamPage /> },
            ],
          },
        ],
      },
    ],
  },

  // Signed in with no agency — where a Google agency signup lands, since no agency
  // name survives a redirect through Google. Under the plain guard, not the agency one,
  // which is the whole point: the agency is what is missing.
  {
    element: <RequireAuth />,
    children: [{ path: '/agency/claim', element: <AgencyClaimPage /> }],
  },

  // ── private sellers ─────────────────────────────────────────────────────────
  // Outside /app and outside AppLayout: this is somebody selling their own flat, not an
  // agency using a CRM, and the sidebar full of leads and deals would be furniture they
  // can never open. The guard sends them to the consumer sign-in for the same reason.
  {
    element: <RequireAuth loginPath="/login" />,
    children: [
      { path: '/sell', element: <MySalePage /> },
      // `new` before `:listingId`, so the literal wins over the parameter.
      { path: '/sell/new', element: <PublishPage /> },
      { path: '/sell/:listingId', element: <PublishPage /> },
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
    ],
  },
]);
