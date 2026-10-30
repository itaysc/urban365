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
  const [local, setLocal] = useState<{ saved: boolean; count: number } | null>(null);

  const current = local ?? { saved, count };

  const toggle = useMutation({
    mutationFn: () => (current.saved ? unsaveListing(listingId) : saveListing(listingId)),
    onMutate: () => {
      // Optimistic, and floored: a count that has drifted must not render as -1.
      setLocal({
        saved: !current.saved,
        count: Math.max(0, current.count + (current.saved ? -1 : 1)),
      });
    },
    onSuccess: (result) => {
      setLocal({ saved: result.saved, count: result.savedCount });
      void queryClient.invalidateQueries({ queryKey: qk.saved.all });
    },
    // Put back what it was. The click did not happen as far as the server is concerned.
    onError: () => setLocal({ saved, count }),
  });

  const box = size === 'sm' ? 'h-8 w-8' : 'h-9 w-9';
  const icon = size === 'sm' ? 'h-4 w-4' : 'h-5 w-5';

  return (
    <div className="flex items-center gap-1">
      <button
        type="button"
        onClick={(e) => {
          // The card around it is itself a button that opens the listing.
          e.stopPropagation();
          e.preventDefault();
          toggle.mutate();
        }}
        aria-pressed={current.saved}
        aria-label={current.saved ? 'הסרה מהשמורים' : 'שמירת הנכס'}
        className={`${box} flex items-center justify-center rounded-full bg-white/90 shadow-sm transition hover:bg-white`}
      >
        <Heart
          className={`${icon} ${current.saved ? 'fill-orange-600 text-orange-600' : 'text-slate-500'}`}
        />
      </button>

      {current.count > 0 && (
        <span className="rounded-full bg-white/90 px-1.5 py-0.5 text-xs font-medium text-slate-700 shadow-sm">
          {current.count}
        </span>
      )}
    </div>
  );
}
