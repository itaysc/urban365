import { useAuth } from '@/auth/auth-context';
import { Button } from '@/components/ui/Button';

/**
 * Where `RequireAuth({ requireAgency })` sends a user whose membership is not active
 * yet — the claim is sitting in the moderation queue.
 */
export function PendingPage() {
  const { user, recheck } = useAuth();

  return (
    <div className="mx-auto max-w-lg rounded-xl border border-slate-200 bg-white p-6 text-center">
      <h1 className="text-lg font-bold text-slate-900">החשבון ממתין לאישור</h1>
      <p className="mt-2 text-sm text-slate-600">
        {user?.agency
          ? `הבקשה שלך לנהל את ${user.agency.name} נשלחה לבדיקה. נעדכן אותך באימייל ברגע שהיא תאושר.`
          : 'הבקשה שלך נשלחה לבדיקה. נעדכן אותך באימייל ברגע שהיא תאושר.'}
      </p>
      <Button variant="secondary" className="mt-5" onClick={() => void recheck()}>
        בדוק שוב
      </Button>
    </div>
  );
}
