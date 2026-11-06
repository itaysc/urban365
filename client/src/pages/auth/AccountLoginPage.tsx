import { Link, Navigate, useLocation, useNavigate, useSearchParams } from 'react-router-dom';
import { useAuth } from '@/auth/auth-context';
import { useSiteClosed } from '@/hooks/useSiteClosed';
import { AccountLoginForm } from '@/components/auth/AccountLoginForm';
import { safeReturnTo } from '@/lib/returnTo';
import { AuthLayout } from '@/pages/auth/AuthLayout';

/**
 * The front door for buyers, which is most people — so it is `/login`, and the agency
 * sign-in is a link from it rather than the other way round. Same shape yad2 uses.
 */
export function AccountLoginPage() {
  const { user, loading } = useAuth();
  const navigate = useNavigate();
  const location = useLocation();
  const [params] = useSearchParams();

  const { closed } = useSiteClosed();
  const returnTo = safeReturnTo((location.state as { from?: string } | null)?.from, '/');
  // Set by the OAuth callback when it bounced someone back rather than signing them in.
  const googleError = params.get('googleError');

  if (!loading && user) return <Navigate to={returnTo} replace />;

  return (
    <AuthLayout
      title="כניסה"
      subtitle="כדי לשמור נכסים ולקבל עדכונים"
      footer={
        closed ? (
          <>ההרשמה סגורה. כניסה בהזמנה בלבד.</>
        ) : (
          <>
            אין לך חשבון?{' '}
            <Link to="/signup" className="text-blue-700 hover:underline">
              הרשמה
            </Link>
          </>
        )
      }
    >
      <AccountLoginForm
        returnTo={returnTo}
        notice={googleError}
        onSuccess={() => navigate(returnTo, { replace: true })}
      />

      {/* The crossing to the other side of the product, as yad2 does with
          "כניסה למתווכים". A buyer never needs it; an agent always looks for it. */}
      <div className="mt-6 border-t border-slate-200 pt-4 text-center">
        <Link to="/agency/login" className="text-sm text-slate-600 hover:text-slate-900 hover:underline">
          כניסה לסוכנויות נדל״ן ←
        </Link>
      </div>
    </AuthLayout>
  );
}
