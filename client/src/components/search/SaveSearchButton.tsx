import { useRef, useState } from 'react';
import { useMutation, useQueryClient } from '@tanstack/react-query';
import { BellPlus } from 'lucide-react';
import { useAuth } from '@/auth/auth-context';
import { LoginDialog } from '@/components/auth/LoginDialog';
import { Button } from '@/components/ui/Button';
import { inputClass } from '@/components/ui/Field';
import { useToast } from '@/components/ui/Toast';
import { errorMessageOf } from '@/lib/apiError';
import { qk } from '@/queries/keys';
import { alertableFilters, droppedFromAlert, saveSearch } from '@/services/searches';
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
 */
export function SaveSearchButton({ filters }: { filters: SearchFilters }) {
  const { user } = useAuth();
  const toast = useToast();
  const queryClient = useQueryClient();
  const trigger = useRef<HTMLButtonElement>(null);

  const [signIn, setSignIn] = useState(false);
  const [open, setOpen] = useState(false);
  const [name, setName] = useState('');

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

      {open && (
        <div className="mt-2 flex flex-col gap-2 rounded-xl border border-slate-200 bg-white p-3">
          <label className="text-sm text-slate-700" htmlFor="save-search-name">
            שם לחיפוש
          </label>
          <input
            id="save-search-name"
            className={inputClass}
            value={name}
            onChange={(e) => setName(e.target.value)}
            placeholder={suggestName(filters)}
          />

          <p className="text-xs text-slate-500">
            נשלח לכם מייל כשייכנס נכס חדש שמתאים — לכל היותר פעם ביום.
          </p>

          {dropped.length > 0 && (
            <p className="text-xs text-amber-700">
              בהתראה לא ייכללו: {dropped.join(', ')}. החיפוש באתר עצמו לא משתנה.
            </p>
          )}

          <div className="flex items-center gap-3">
            <Button disabled={save.isPending} onClick={() => save.mutate()}>
              {save.isPending ? 'שומר…' : 'שמירה'}
            </Button>
            <button
              type="button"
              onClick={() => setOpen(false)}
              className="text-sm text-slate-500 hover:text-slate-900"
            >
              ביטול
            </button>
          </div>
        </div>
      )}

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
