import { useMutation, useQueryClient } from '@tanstack/react-query';
import { Heart } from 'lucide-react';
import { saveListing, unsaveListing } from '@/services/saved';
import { qk } from '@/queries/keys';

interface Props {
  listingId: string;
  saved: boolean;
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
export function SaveButton({ listingId, saved, size = 'md' }: Props) {
  const queryClient = useQueryClient();
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
      return { saved };
    },
    onSuccess: (result) => {
      setSavedInCache(result.saved);
      // The list and the header's total, but not the `among` sets this just wrote —
      // invalidating those would ask the server a question we already have the answer
      // to, and a slow reply would flip the heart back on the way.
      void queryClient.invalidateQueries({ queryKey: qk.saved.list });
      void queryClient.invalidateQueries({ queryKey: qk.saved.count });
    },
    onError: (_e, _vars, previous) => {
      // Put back exactly what was there. The click did not happen, as far as the
      // server is concerned.
      if (previous) setSavedInCache(previous.saved);
    },
  });

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

    </div>
  );
}
