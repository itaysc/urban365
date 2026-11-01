import { useRef, useState } from 'react';
import * as Dialog from '@radix-ui/react-dialog';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { BellPlus, BellRing, X } from 'lucide-react';
import { Link } from 'react-router-dom';
import { useAuth } from '@/auth/auth-context';
import { LoginDialog } from '@/components/auth/LoginDialog';
import { Button } from '@/components/ui/Button';
import { inputClass } from '@/components/ui/Field';
import { useToast } from '@/components/ui/Toast';
import { errorMessageOf } from '@/lib/apiError';
import { alreadySaved } from '@/lib/savedSearch';
import { qk } from '@/queries/keys';
import {
  alertableFilters,
  droppedFromAlert,
  fetchSavedSearches,
  saveSearch,
} from '@/services/searches';
import type { SearchFilters } from '@/types/search';

/** A name they will recognise in a subject line, from what they actually chose. */
function suggestName(filters: SearchFilters): string {
  const parts: string[] = [];
  if (filters.propertyType.length > 0) parts.push(filters.propertyType.join(' / '));
  if (filters.minRooms !== undefined || filters.maxRooms !== undefined) {
    parts.push(
      filters.minRooms !== undefined && filters.maxRooms !== undefined
        ? `${filters.minRooms}–${filters.maxRooms} חדרים`
        : `${filters.minRooms ?? filters.maxRooms} חדרים`,
    );
  }
  if (filters.city.length > 0) parts.push(`ב${filters.city.join(' / ')}`);

  return parts.join(', ') || 'החיפוש שלי';
}

/**
 * Keeping a search, and being told when something new fits it.
 *
 * Signing in is asked for at the moment it is needed rather than up front: somebody
 * browsing has no reason to have an account until they want to be told something, and
 * the dialog returns them here with their filters intact.
 *
 * What an alert cannot carry is said before they save, not discovered when the email
 * arrives wrong. A free-text query and an amenity list have no column the matcher can
 * compare, so they are dropped — and naming them is the difference between a limitation
 * and a bug.
 *
 * The form is a dialog rather than a panel under the button. It used to open inline,
 * which pushed the sort control about on a wide screen and left no room at all on a
 * phone, where the header is already two rows deep.
 */
export function SaveSearchButton({ filters }: { filters: SearchFilters }) {
  const { user } = useAuth();
  const toast = useToast();
  const queryClient = useQueryClient();
  const trigger = useRef<HTMLButtonElement>(null);

  const [signIn, setSignIn] = useState(false);
  const [open, setOpen] = useState(false);
  const [name, setName] = useState('');

  // Only once there is somebody to have saved anything.
  const { data: searches } = useQuery({
    queryKey: qk.searches,
    queryFn: fetchSavedSearches,
    enabled: Boolean(user),
  });

  const existing = alreadySaved(filters, searches);
  const dropped = droppedFromAlert(filters);

  const save = useMutation({
    mutationFn: () =>
      saveSearch({ name: name.trim() || suggestName(filters), ...alertableFilters(filters) }),
    onSuccess: () => {
      void queryClient.invalidateQueries({ queryKey: qk.searches });
      setOpen(false);
      setName('');
      toast.success('החיפוש נשמר. נעדכן אתכם כשייכנס משהו מתאים.');
    },
    onError: (e) => toast.error(errorMessageOf(e, 'לא הצלחנו לשמור את החיפוש.')),
  });

  const start = () => {
    if (!user) {
      setSignIn(true);
      return;
    }
    setName(suggestName(filters));
    setOpen(true);
  };

  /*
   * Already saved: the button says so and stops, rather than letting somebody make a
   * second copy of the same search and then wonder why one listing produces two
   * emails. It is a link to the alert itself, because the useful thing to do with a
   * search you have already saved is go and look at it.
   */
  if (existing) {
    return (
      <Link
        to="/alerts"
        className="flex items-center gap-1 rounded-lg border border-green-200 bg-green-50 px-3 py-2 text-sm text-green-800"
        title={`שמור בשם "${existing.name}"`}
      >
        <BellRing className="h-4 w-4" aria-hidden />
        החיפוש כבר שמור
      </Link>
    );
  }

  return (
    <>
      <button
        ref={trigger}
        type="button"
        onClick={start}
        className="flex items-center gap-1 rounded-lg border border-slate-300 bg-white px-3 py-2 text-sm text-slate-700 transition hover:border-slate-900"
      >
        <BellPlus className="h-4 w-4" aria-hidden />
        שמירת החיפוש
      </button>

      <Dialog.Root open={open} onOpenChange={setOpen}>
        <Dialog.Portal>
          <Dialog.Overlay className="fixed inset-0 z-50 bg-slate-900/40 backdrop-blur-sm" />

          <Dialog.Content
            onCloseAutoFocus={(e) => {
              if (!trigger.current) return;
              e.preventDefault();
              trigger.current.focus();
            }}
            className="fixed start-1/2 top-1/2 z-50 max-h-[90vh] w-[min(28rem,calc(100vw-2rem))] -translate-x-1/2 -translate-y-1/2 overflow-y-auto rounded-2xl bg-white p-6 shadow-xl rtl:translate-x-1/2"
          >
            <div className="mb-4 flex items-start justify-between gap-4">
              <div>
                <Dialog.Title className="text-lg font-bold text-slate-900">
                  שמירת החיפוש
                </Dialog.Title>
                <Dialog.Description className="mt-1 text-sm text-slate-500">
                  נשלח לכם מייל כשייכנס נכס חדש שמתאים — לכל היותר פעם ביום.
                </Dialog.Description>
              </div>

              <Dialog.Close
                aria-label="סגירה"
                className="rounded-lg p-1.5 text-slate-400 transition hover:bg-slate-100 hover:text-slate-700"
              >
                <X className="h-5 w-5" />
              </Dialog.Close>
            </div>

            <label className="text-sm text-slate-700" htmlFor="save-search-name">
              שם לחיפוש
            </label>
            <input
              id="save-search-name"
              className={`${inputClass} mt-1 w-full`}
              value={name}
              onChange={(e) => setName(e.target.value)}
              placeholder={suggestName(filters)}
            />

            {dropped.length > 0 && (
              <p className="mt-3 rounded-lg bg-amber-50 px-3 py-2 text-xs text-amber-800">
                בהתראה לא ייכללו: {dropped.join(', ')}. החיפוש באתר עצמו לא משתנה.
              </p>
            )}

            <div className="mt-4 flex items-center gap-3">
              <Button disabled={save.isPending} onClick={() => save.mutate()}>
                {save.isPending ? 'שומר…' : 'שמירה'}
              </Button>
              <Dialog.Close className="text-sm text-slate-500 transition hover:text-slate-900">
                ביטול
              </Dialog.Close>
            </div>
          </Dialog.Content>
        </Dialog.Portal>
      </Dialog.Root>

      <LoginDialog
        open={signIn}
        onOpenChange={setSignIn}
        returnFocusTo={trigger}
        description="כדי לשמור חיפוש ולקבל התראות"
        onSignedIn={() => {
          setName(suggestName(filters));
          setOpen(true);
        }}
      />
    </>
  );
}
