import { useMutation, useQueryClient } from '@tanstack/react-query';
import { Heart } from 'lucide-react';
import { useState } from 'react';
import { saveListing, unsaveListing } from '@/services/saved';
import { qk } from '@/queries/keys';

interface Props {
  listingId: string;
  saved: boolean;
  /** How many people have saved it. Hidden at zero — "0 saves" sells nothing. */
  count: number;
  size?: 'sm' | 'md';
}

/**
 * The heart.
 *
 * Works signed out: the server gives an anonymous browser a cookie the first time it
 * saves anything, and merges those saves into an account if one is ever made. Asking
 * someone to sign up before they can keep track of a flat they liked is how you lose
 * both the flat and the sign-up.
 *
 * The count and the state are held locally after a click rather than waiting for a
 * refetch, because this sits on a card in a grid and a heart that fills a second after
 * you press it feels broken.
 */
export function SaveButton({ listingId, saved, count, size = 'md' }: Props) {
  const queryClient = useQueryClient();
  // Only the count is local. Whether it is saved lives in the query cache, so every
  // heart for the same listing — card, map popup, saved page — reads one answer, and a
  // card that remounts picks the answer back up instead of reverting to whatever prop
  // it was last rendered with.
  const [localCount, setLocalCount] = useState<number | null>(null);

  const setSavedInCache = (next: boolean) => {
    queryClient.setQueriesData<Set<string>>({ queryKey: qk.saved.all }, (old) => {
      if (!(old instanceof Set)) return old;
      const copy = new Set(old);
      if (next) copy.add(listingId);
      else copy.delete(listingId);
      return copy;
    });
  };

  const toggle = useMutation({
    mutationFn: () => (saved ? unsaveListing(listingId) : saveListing(listingId)),
    onMutate: () => {
      const previous = { saved, count: localCount ?? count };
      // Optimistic, and floored: a count that has drifted must not render as -1.
      setSavedInCache(!saved);
      setLocalCount(Math.max(0, previous.count + (saved ? -1 : 1)));
      return previous;
    },
    onSuccess: (result) => {
      setSavedInCache(result.saved);
      setLocalCount(result.savedCount);
      // Refetch the lists, but not the `among` sets this just wrote — invalidating
      // those would ask the server the question we already have the answer to, and a
      // slow reply would flip the heart back on the way.
      void queryClient.invalidateQueries({ queryKey: qk.saved.list });
    },
    onError: (_e, _vars, previous) => {
      // Put back exactly what was there. The click did not happen, as far as the
      // server is concerned.
      if (!previous) return;
      setSavedInCache(previous.saved);
      setLocalCount(previous.count);
    },
  });

  const shownCount = localCount ?? count;
  const box = size === 'sm' ? 'h-8 w-8' : 'h-9 w-9';
  const icon = size === 'sm' ? 'h-4 w-4' : 'h-5 w-5';

  return (
    <div className="relative">
      <button
        type="button"
        onClick={(e) => {
          // The card around it opens the listing; this must not.
          e.stopPropagation();
          e.preventDefault();
          toggle.mutate();
        }}
        aria-pressed={saved}
        aria-label={saved ? 'הסרה מהשמורים' : 'שמירת הנכס'}
        className={`${box} flex items-center justify-center rounded-full bg-white/90 shadow-sm transition hover:bg-white`}
      >
        <Heart
          className={`${icon} ${saved ? 'fill-orange-600 text-orange-600' : 'text-slate-500'}`}
        />
      </button>

      {shownCount > 0 && (
        // A badge on the corner of the heart rather than a pill beside it, so the whole
        // control stays one object. Physically top-right in both directions: it belongs
        // to the heart's shape, not to the reading order.
        //
        // `min-w` with `px` rather than a fixed circle, so three digits widen it into a
        // pill instead of spilling out of a round one.
        <span
          dir="ltr"
          aria-hidden
          className="pointer-events-none absolute -right-1 -top-1 flex min-w-[1.1rem] items-center justify-center rounded-full bg-orange-600 px-1 text-[0.65rem] font-bold leading-[1.1rem] text-white ring-2 ring-white"
        >
          {shownCount > 99 ? '99+' : shownCount}
        </span>
      )}

      {/* The badge is decorative; the number still has to be said out loud somewhere. */}
      {shownCount > 0 && <span className="sr-only">{shownCount} אנשים שמרו את הנכס</span>}
    </div>
  );
}
