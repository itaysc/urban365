import { useState } from 'react';
import { useQuery, useQueryClient } from '@tanstack/react-query';
import { Button } from '@/components/ui/Button';
import { ConfirmDialog } from '@/components/ui/ConfirmDialog';
import { qk } from '@/queries/keys';
import {
  deleteAgency,
  fetchAgencyDirectory,
  restoreAgency,
  suspendAgency,
  type ManagedAgency,
} from '@/services/admin';

const STATUS_LABEL: Record<ManagedAgency['status'], string> = {
  active: 'פעילה',
  unclaimed: 'לא שויכה',
  suspended: 'מושעית',
};

type Pending =
  | { kind: 'suspend' | 'delete'; agency: ManagedAgency }
  | null;

/**
 * Agencies a platform admin can take off the site.
 *
 * Suspension hides the listings and leaves them published, so lifting it brings them
 * back. Deletion marks every listing removed, which is permanent.
 */
export function AgencyDirectory() {
  const queryClient = useQueryClient();
  const [term, setTerm] = useState('');
  const [submitted, setSubmitted] = useState('');
  const [busy, setBusy] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [pending, setPending] = useState<Pending>(null);

  const { data: agencies = null } = useQuery({
    queryKey: qk.admin.directory(submitted),
    queryFn: () => fetchAgencyDirectory(submitted),
  });

  const run = async (id: string, action: () => Promise<unknown>) => {
    setBusy(id);
    setError(null);
    try {
      await action();
      await queryClient.invalidateQueries({ queryKey: qk.admin.all });
    } catch {
      setError('הפעולה נכשלה.');
    } finally {
      setBusy(null);
    }
  };

  return (
    <section className="flex flex-col gap-3">
      <div>
        <h1 className="text-xl font-bold text-slate-900">סוכנויות</h1>
        <p className="mt-1 text-sm text-slate-500">
          השעיה מסתירה את הנכסים מהאתר. מחיקה מסמנת אותם כנמחקים והם לא יוצגו שוב.
        </p>
      </div>

      <form
        className="flex gap-2"
        onSubmit={(event) => {
          event.preventDefault();
          setSubmitted(term.trim());
        }}
      >
        <input
          value={term}
          onChange={(event) => setTerm(event.target.value)}
          placeholder="חיפוש לפי שם"
          aria-label="חיפוש סוכנות"
          className="w-full max-w-sm rounded-lg border border-slate-300 px-3 py-2 text-sm"
        />
        <Button type="submit" variant="secondary">
          חיפוש
        </Button>
      </form>

      {error && (
        <p className="rounded-lg border border-red-200 bg-red-50 p-3 text-sm text-red-700">{error}</p>
      )}

      {agencies === null && <p className="text-sm text-slate-500">טוען…</p>}

      {agencies?.length === 0 && (
        <p className="rounded-xl border border-dashed border-slate-300 bg-white p-8 text-center text-sm text-slate-500">
          אין סוכנויות להצגה.
        </p>
      )}

      {agencies?.map((agency) => (
        <article
          key={agency.id}
          className="flex flex-wrap items-center justify-between gap-3 rounded-xl border border-slate-200 bg-white p-4"
        >
          <div className="min-w-0">
            <p className="font-semibold text-slate-900">{agency.name}</p>
            <p className="text-xs text-slate-500">
              {STATUS_LABEL[agency.status]}
              {agency.yad2Id ? ` · יד2 ${agency.yad2Id}` : ''} · {agency.publishedCount} נכסים בפרסום
            </p>
          </div>
          <div className="flex flex-wrap gap-2">
            {agency.status === 'suspended' ? (
              <Button
                variant="secondary"
                disabled={busy !== null}
                onClick={() => void run(agency.id, () => restoreAgency(agency.id))}
              >
                {busy === agency.id ? 'מעדכן…' : 'ביטול השעיה'}
              </Button>
            ) : (
              <Button variant="secondary" disabled={busy !== null} onClick={() => setPending({ kind: 'suspend', agency })}>
                השעיה
              </Button>
            )}
            <Button variant="danger" disabled={busy !== null} onClick={() => setPending({ kind: 'delete', agency })}>
              מחיקה
            </Button>
          </div>
        </article>
      ))}

      <ConfirmDialog
        open={pending !== null}
        title={pending?.kind === 'delete' ? 'למחוק את הסוכנות?' : 'להשעות את הסוכנות?'}
        description={
          pending?.kind === 'delete'
            ? `הנכסים של ${pending.agency.name} יסומנו כנמחקים ולא יוצגו באתר. אי אפשר לבטל את זה.`
            : pending
              ? `הנכסים של ${pending.agency.name} לא יוצגו באתר כל עוד ההשעיה בתוקף.`
              : ''
        }
        confirmLabel={pending?.kind === 'delete' ? 'מחיקה' : 'השעיה'}
        busy={busy !== null}
        onConfirm={() => {
          const target = pending;
          setPending(null);
          if (!target) return;
          void run(target.agency.id, () =>
            target.kind === 'delete' ? deleteAgency(target.agency.id) : suspendAgency(target.agency.id),
          );
        }}
        onOpenChange={(open) => !open && setPending(null)}
      />
    </section>
  );
}
