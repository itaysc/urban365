import type { ReactNode } from 'react';
import * as Dialog from '@radix-ui/react-dialog';
import { useQuery } from '@tanstack/react-query';
import { ArchiveRestore, X } from 'lucide-react';
import { Button } from '@/components/ui/Button';
import { useToast } from '@/components/ui/Toast';
import { errorMessageOf } from '@/lib/apiError';
import { formatDate } from '@/lib/format';

interface Archived {
  id: string;
  deletedAt: string;
}

interface Props<T extends Archived> {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  /** What this is an archive of, e.g. "פניות". */
  title: string;
  /** Re-run each time the dialog opens, so a restore elsewhere is reflected next time. */
  queryKey: readonly unknown[];
  fetchArchive: () => Promise<T[]>;
  onRestore: (id: string) => Promise<unknown>;
  /** The row's own identity — a name, a title — the archive adds the removal date to. */
  renderRow: (item: T) => ReactNode;
  /** Reloads whatever list this archive sits beside, once a restore lands. */
  onRestored: () => void;
}

/**
 * What was removed, and the one way back: a list, newest removal first, each row one
 * click from its ordinary list again.
 *
 * Shared by every CRM resource that soft-deletes — leads, customers, deals, mortgage
 * cases, banker contacts — rather than five copies of the same dialog, since the shape
 * is the same list-and-restore pattern everywhere and only the row itself differs.
 */
export function ArchivePanel<T extends Archived>({
  open,
  onOpenChange,
  title,
  queryKey,
  fetchArchive,
  onRestore,
  renderRow,
  onRestored,
}: Props<T>) {
  const toast = useToast();
  const { data, isPending, refetch } = useQuery({ queryKey, queryFn: fetchArchive, enabled: open });

  const restore = async (id: string) => {
    try {
      await onRestore(id);
      toast.success('שוחזר.');
      await refetch();
      onRestored();
    } catch (e) {
      toast.error(errorMessageOf(e, 'השחזור נכשל.'));
    }
  };

  return (
    <Dialog.Root open={open} onOpenChange={onOpenChange}>
      <Dialog.Portal>
        <Dialog.Overlay className="fixed inset-0 z-50 bg-slate-900/40 backdrop-blur-sm" />

        <Dialog.Content className="fixed start-1/2 top-1/2 z-50 max-h-[80vh] w-[min(34rem,calc(100vw-2rem))] -translate-x-1/2 -translate-y-1/2 overflow-y-auto rounded-2xl bg-white p-6 shadow-xl rtl:translate-x-1/2">
          <header className="mb-4 flex items-start justify-between gap-4">
            <div>
              <Dialog.Title className="text-lg font-bold text-slate-900">ארכיון {title}</Dialog.Title>
              <Dialog.Description className="mt-0.5 text-sm text-slate-500">
                מה שהוסר מהרשימה הרגילה. אפשר להחזיר כל שורה בלחיצה.
              </Dialog.Description>
            </div>

            <Dialog.Close
              aria-label="סגירה"
              className="rounded-lg p-1.5 text-slate-500 transition hover:bg-slate-100 hover:text-slate-700"
            >
              <X className="h-5 w-5" />
            </Dialog.Close>
          </header>

          {isPending && <p className="text-sm text-slate-500">טוען…</p>}

          {data && data.length === 0 && (
            <p className="rounded-xl border border-dashed border-slate-300 p-6 text-center text-sm text-slate-500">
              הארכיון ריק.
            </p>
          )}

          {data && data.length > 0 && (
            <ul className="flex flex-col gap-2">
              {data.map((item) => (
                <li
                  key={item.id}
                  className="flex items-center justify-between gap-3 rounded-lg border border-slate-200 p-2.5"
                >
                  <div className="min-w-0">
                    {renderRow(item)}
                    <p className="text-xs text-slate-400">הוסר {formatDate(item.deletedAt)}</p>
                  </div>

                  <Button
                    variant="secondary"
                    onClick={() => void restore(item.id)}
                    className="shrink-0"
                  >
                    <ArchiveRestore className="h-4 w-4" aria-hidden />
                    שחזור
                  </Button>
                </li>
              ))}
            </ul>
          )}
        </Dialog.Content>
      </Dialog.Portal>
    </Dialog.Root>
  );
}
