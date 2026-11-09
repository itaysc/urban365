import { useEffect, useState } from 'react';
import { useMutation, useQueryClient } from '@tanstack/react-query';
import { Heart } from 'lucide-react';
import { saveListing, unsaveListing } from '@/services/saved';
import { qk } from '@/queries/keys';

interface Props {
  listingId: string;
  saved: boolean;
  /** How many people have saved this listing. */
  savedCount?: number;
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
export function SaveButton({ listingId, saved, savedCount = 0, size = 'md' }: Props) {
  const queryClient = useQueryClient();
  const [count, setCount] = useState(savedCount);

  // The card is given the count with the listing. A click then keeps its own copy,
  // until a fresh listing arrives and replaces it.
  useEffect(() => {
    setCount(savedCount);
  }, [savedCount]);
  // Whether it is saved lives in the query cache, so every heart for the same listing
  // — card, map popup, saved page — reads one answer, and a card that remounts picks
  // that answer back up instead of reverting to whatever prop it last rendered with.

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
      setSavedInCache(!saved);
      setCount((current) => Math.max(0, current + (saved ? -1 : 1)));
      return { saved, count };
    },
    onSuccess: (result) => {
      setSavedInCache(result.saved);
      setCount(result.savedCount);
      // The list and the header's total, but not the `among` sets this just wrote —
      // invalidating those would ask the server a question we already have the answer
      // to, and a slow reply would flip the heart back on the way.
      void queryClient.invalidateQueries({ queryKey: qk.saved.list });
      void queryClient.invalidateQueries({ queryKey: qk.saved.count });
    },
    onError: (_e, _vars, previous) => {
      // Put back exactly what was there. The click did not happen, as far as the
      // server is concerned.
      if (previous) {
        setSavedInCache(previous.saved);
        setCount(previous.count);
      }
    },
  });

  const icon = size === 'sm' ? 'h-4 w-4' : 'h-5 w-5';
  const text = size === 'sm' ? 'text-xs' : 'text-sm';
  const shown = count.toLocaleString('he-IL');

  return (
    <button
      type="button"
      onClick={(e) => {
        // The card around it opens the listing; this must not.
        e.stopPropagation();
        e.preventDefault();
        toggle.mutate();
      }}
      aria-pressed={saved}
      aria-label={saved ? `הסרה מהשמורים, ${shown} שמרו` : `שמירת הנכס, ${shown} שמרו`}
      className="flex items-center gap-1 rounded-full bg-white/90 px-2 py-1 shadow-sm transition hover:bg-white"
    >
      <Heart
        className={`${icon} ${saved ? 'fill-blue-600 text-blue-600' : 'text-slate-500'}`}
        aria-hidden
      />
      <span className={`${text} font-semibold tabular-nums text-slate-700`}>{shown}</span>
    </button>
  );
}
