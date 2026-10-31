import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { Database, Trash2 } from 'lucide-react';
import { Button } from '@/components/ui/Button';
import { ConfirmDialog } from '@/components/ui/ConfirmDialog';
import { useToast } from '@/components/ui/Toast';
import { errorMessageOf } from '@/lib/apiError';
import { clearDemoData, fetchDemoStatus, seedDemoData } from '@/services/demo';
import { useState } from 'react';

/**
 * Filling the agency with something to look at, and emptying it again.
 *
 * Rendered only in a development build, and refused by the server outside one. Two
 * independent checks for the same thing, because they fail differently: the first keeps
 * it off a screen somebody is demoing, the second keeps it off a database somebody is
 * working in.
 *
 * The clear asks first. It deletes rows, and "only the ones it created" is a promise
 * worth stating in the dialog rather than trusting people to remember.
 */
export function DemoDataPanel() {
  const toast = useToast();
  const queryClient = useQueryClient();
  const [confirming, setConfirming] = useState(false);

  const { data } = useQuery({ queryKey: ['demo-data'], queryFn: fetchDemoStatus });

  // Everything on screen could have changed, so the simplest correct thing is to drop
  // the lot — this is a development tool and a refetch costs nothing.
  const refreshAll = () => queryClient.invalidateQueries();

  const seed = useMutation({
    mutationFn: seedDemoData,
    onSuccess: (result) => {
      void refreshAll();
      toast.success(
        `נוספו ${result.customers} לקוחות, ${result.listings} נכסים, ${result.leads} פניות ו-${result.meetings} פגישות.`,
      );
    },
    onError: (e) => toast.error(errorMessageOf(e, 'לא הצלחנו להוסיף נתוני הדגמה.')),
  });

  const clear = useMutation({
    mutationFn: clearDemoData,
    onSuccess: (result) => {
      void refreshAll();
      setConfirming(false);
      toast.success(`נמחקו ${result.customers + result.listings + result.leads + result.meetings} רשומות הדגמה.`);
    },
    onError: (e) => toast.error(errorMessageOf(e, 'לא הצלחנו למחוק את נתוני ההדגמה.')),
  });

  const seeded = data?.records ?? 0;

  return (
    <section className="flex flex-col gap-3 rounded-xl border border-dashed border-amber-300 bg-amber-50/50 p-4">
      <div>
        <h2 className="flex items-center gap-2 text-sm font-semibold text-amber-900">
          <Database className="h-4 w-4" aria-hidden />
          נתוני הדגמה — סביבת פיתוח בלבד
        </h2>
        <p className="mt-1 text-xs text-amber-800">
          {seeded > 0
            ? `${seeded} רשומות הדגמה רשומות כרגע. המחיקה מוחקת רק אותן.`
            : 'לקוחות, נכסים, פניות ופגישות לדוגמה, כדי שיהיה מה לבדוק.'}
        </p>
      </div>

      <div className="flex flex-wrap items-center gap-3">
        <Button variant="secondary" disabled={seed.isPending} onClick={() => seed.mutate()}>
          {seed.isPending ? 'מוסיף…' : 'הוספת נתוני הדגמה'}
        </Button>

        {seeded > 0 && (
          <button
            type="button"
            onClick={() => setConfirming(true)}
            disabled={clear.isPending}
            className="flex items-center gap-1 text-sm text-red-700 hover:underline disabled:opacity-50"
          >
            <Trash2 className="h-4 w-4" aria-hidden />
            מחיקת נתוני ההדגמה
          </button>
        )}
      </div>

      <ConfirmDialog
        open={confirming}
        onOpenChange={setConfirming}
        title="למחוק את נתוני ההדגמה?"
        description={`יימחקו ${seeded} הרשומות שנוצרו על ידי כפתור ההדגמה בלבד. לקוחות, נכסים ופגישות שהוספתם בעצמכם לא ייגעו.`}
        confirmLabel="מחיקה"
        busy={clear.isPending}
        onConfirm={() => clear.mutate()}
      />
    </section>
  );
}
