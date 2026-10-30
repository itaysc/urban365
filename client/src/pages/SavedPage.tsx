import { useCallback, useState } from 'react';
import { Link } from 'react-router-dom';
import { useQuery } from '@tanstack/react-query';
import { Heart } from 'lucide-react';
import { AssetModal } from '@/components/AssetModal';
import { ListingCard } from '@/components/ListingCard';
import { qk } from '@/queries/keys';
import { fetchSavedListings } from '@/services/saved';
import { fetchListing } from '@/services/search';
import type { SearchListing } from '@/types/search';
import type { Asset } from '@/types/yad2';

/**
 * The listings somebody kept.
 *
 * No sign-in required, because saving did not require one either: the server answers
 * from the visitor cookie when there is no account behind the request. Someone who
 * saved four flats and has not signed up still has four flats here.
 */
export function SavedPage() {
  const [selected, setSelected] = useState<Asset | null>(null);

  const { data: items, isPending } = useQuery({
    queryKey: qk.saved.list,
    queryFn: fetchSavedListings,
  });

  const open = useCallback(async (listing: SearchListing) => {
    try {
      setSelected((await fetchListing(listing.id)) as unknown as Asset);
    } catch {
      setSelected(null);
    }
  }, []);

  return (
    <div className="min-h-screen bg-slate-50">
      <div className="mx-auto flex max-w-5xl flex-col gap-6 p-4 sm:p-8">
        <header className="flex flex-wrap items-baseline justify-between gap-3">
          <div>
            <h1 className="text-2xl font-bold text-slate-900">הנכסים ששמרתי</h1>
            <p className="text-sm text-slate-500">
              {isPending ? 'טוען…' : `${items?.length ?? 0} נכסים`}
            </p>
          </div>

          <Link to="/" className="text-sm text-blue-700 hover:underline">
            ← חזרה לחיפוש
          </Link>
        </header>

        {!isPending && (items?.length ?? 0) === 0 && (
          <div className="flex flex-col items-center gap-3 rounded-xl border border-slate-200 bg-white p-12 text-center">
            <Heart className="h-8 w-8 text-slate-300" aria-hidden />
            <p className="font-medium text-slate-800">עדיין לא שמרתם נכסים</p>
            <p className="max-w-sm text-sm text-slate-500">
              לחיצה על הלב שעל תמונת הנכס תשמור אותו כאן. אין צורך בחשבון — אם תפתחו
              אחד מאוחר יותר, הנכסים ששמרתם יעברו אליו.
            </p>
            <Link
              to="/"
              className="mt-2 rounded-lg bg-slate-900 px-4 py-2 text-sm font-medium text-white"
            >
              לחיפוש נכסים
            </Link>
          </div>
        )}

        <div className="grid gap-4 sm:grid-cols-2">
          {(items ?? []).map((listing) => (
            // Everything here is saved by definition, so the heart starts filled and
            // unsaving removes it from the list on the next load.
            <ListingCard key={listing.id} listing={listing} onOpen={open} saved />
          ))}
        </div>
      </div>

      {selected && <AssetModal asset={selected} onClose={() => setSelected(null)} />}
    </div>
  );
}
