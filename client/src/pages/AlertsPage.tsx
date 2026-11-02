import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { Link } from 'react-router-dom';
import { Bell, BellOff, Trash2 } from 'lucide-react';
import { SavedTabs } from '@/components/SavedTabs';
import { SiteFooter } from '@/components/SiteFooter';
import { SiteHeader } from '@/components/SiteHeader';
import { useToast } from '@/components/ui/Toast';
import { errorMessageOf } from '@/lib/apiError';
import { formatPrice } from '@/lib/format';
import { qk } from '@/queries/keys';
import {
  deleteSavedSearch,
  fetchSavedSearches,
  updateSavedSearch,
  type SavedSearch,
} from '@/services/searches';

const SECTION_LABEL: Record<string, string> = {
  forsale: 'למכירה',
  rent: 'להשכרה',
  commercial: 'מסחרי',
};

/** The criteria as a sentence, so somebody can check it is what they meant. */
function describe(search: SavedSearch): string {
  const parts: string[] = [];

  if (search.section) parts.push(SECTION_LABEL[search.section] ?? search.section);
  if (search.propertyTypes.length > 0) parts.push(search.propertyTypes.join(' / '));

  if (search.minRooms !== null || search.maxRooms !== null) {
    parts.push(
      search.minRooms !== null && search.maxRooms !== null
        ? `${search.minRooms}–${search.maxRooms} חדרים`
        : search.minRooms !== null
          ? `${search.minRooms} חדרים ומעלה`
          : `עד ${search.maxRooms} חדרים`,
    );
  }

  if (search.minPrice !== null || search.maxPrice !== null) {
    parts.push(
      search.minPrice !== null && search.maxPrice !== null
        ? `${formatPrice(search.minPrice)}–${formatPrice(search.maxPrice)}`
        : search.minPrice !== null
          ? `מ-${formatPrice(search.minPrice)}`
          : `עד ${formatPrice(search.maxPrice)}`,
    );
  }

  if (search.minSquareMeter !== null) parts.push(`מ-${search.minSquareMeter} מ״ר`);
  if (search.cities.length > 0) parts.push(`ב${search.cities.join(' / ')}`);

  return parts.join(' · ') || 'כל הנכסים';
}

/** The link back to the search that produced it, with the same filters. */
function searchHref(search: SavedSearch): string {
  const params = new URLSearchParams();
  if (search.section) params.set('section', search.section);
  /*
    Comma-separated, which is what the search page reads. Appending the key once per
    value produced `?city=A&city=B`, and the parser takes the first — so a saved search
    across two cities showed the results for one of them and looked like the search had
    been saved wrong.
  */
  if (search.cities.length > 0) params.set('city', search.cities.join(','));
  if (search.propertyTypes.length > 0) params.set('propertyType', search.propertyTypes.join(','));
  if (search.minRooms !== null) params.set('minRooms', String(search.minRooms));
  if (search.maxRooms !== null) params.set('maxRooms', String(search.maxRooms));
  if (search.minPrice !== null) params.set('minPrice', String(search.minPrice));
  if (search.maxPrice !== null) params.set('maxPrice', String(search.maxPrice));
  if (search.minSquareMeter !== null) params.set('minSquareMeter', String(search.minSquareMeter));

  return `/search?${params}`;
}

/**
 * A buyer's saved searches, and whether each one writes to them.
 *
 * The switch and the deletion are separate on purpose: wanting to keep a search and
 * wanting to be emailed about it are different wishes, and collapsing them into one
 * control means the only way to stop the post is to throw away the search.
 */
export function AlertsPage() {
  const toast = useToast();
  const queryClient = useQueryClient();

  const { data, isPending } = useQuery({ queryKey: qk.searches, queryFn: fetchSavedSearches });
  const refresh = () => queryClient.invalidateQueries({ queryKey: qk.searches });

  const toggle = useMutation({
    mutationFn: ({ id, alert }: { id: string; alert: boolean }) =>
      updateSavedSearch(id, { alert }),
    onSuccess: (_r, vars) => {
      void refresh();
      toast.show(vars.alert ? 'ההתראה הופעלה.' : 'ההתראה כובתה. החיפוש נשמר.');
    },
    onError: (e) => toast.error(errorMessageOf(e, 'לא הצלחנו לעדכן.')),
  });

  const remove = useMutation({
    mutationFn: (id: string) => deleteSavedSearch(id),
    onSuccess: () => {
      void refresh();
      toast.show('החיפוש נמחק.');
    },
    onError: (e) => toast.error(errorMessageOf(e, 'לא הצלחנו למחוק.')),
  });

  const searches = data ?? [];

  return (
    <div className="min-h-screen bg-slate-50">
      <SiteHeader />

      <main id="main" tabIndex={-1} className="mx-auto flex w-full max-w-3xl flex-col gap-5 p-4 sm:p-6">
        <SavedTabs />

        <header>
          <h1 className="text-xl font-bold text-slate-900">חיפושים שמורים</h1>
          <p className="text-sm text-slate-500">
            נעדכן אתכם במייל כשייכנס נכס חדש שמתאים — לכל היותר פעם ביום לכל חיפוש.
          </p>
        </header>

        {isPending && <p className="text-sm text-slate-500">טוען…</p>}

        {!isPending && searches.length === 0 && (
          <div className="flex flex-col items-center gap-2 rounded-xl border border-slate-200 bg-white p-8 text-center">
            <p className="text-sm text-slate-600">עוד לא שמרתם חיפושים.</p>
            <p className="text-sm text-slate-500">
              אפשר לשמור חיפוש מעמוד החיפוש, אחרי שבוחרים עיר ומה שחשוב לכם.
            </p>
            <Link to="/" className="text-sm text-blue-700 hover:underline">
              לחיפוש
            </Link>
          </div>
        )}

        <ul className="flex flex-col gap-3">
          {searches.map((search) => (
            <li
              key={search.id}
              className="flex flex-wrap items-start justify-between gap-3 rounded-xl border border-slate-200 bg-white p-4"
            >
              <div className="min-w-0 flex-1">
                {/* State belongs in a chip and the action in the button. Before this
                    the button carried both and could only manage one: "התראה פעילה"
                    told you where you stood and not what pressing it would do. */}
                <p className="flex flex-wrap items-center gap-2 font-semibold text-slate-900">
                  {search.name}
                  <span
                    className={`rounded px-2 py-0.5 text-xs font-normal ${
                      search.alert ? 'bg-blue-50 text-blue-800' : 'bg-slate-100 text-slate-500'
                    }`}
                  >
                    {search.alert ? 'התראה פעילה' : 'התראה כבויה'}
                  </span>
                </p>
                <p className="mt-1 text-sm text-slate-500">{describe(search)}</p>

                <Link
                  to={searchHref(search)}
                  className="mt-2 inline-block text-sm text-blue-700 hover:underline"
                >
                  הצגת התוצאות
                </Link>
              </div>

              <div className="flex flex-wrap items-center gap-x-4 gap-y-1 text-sm [&_button]:py-1.5">
                <button
                  type="button"
                  onClick={() => toggle.mutate({ id: search.id, alert: !search.alert })}
                  disabled={toggle.isPending}
                  className="flex items-center gap-1 text-blue-700 hover:underline disabled:opacity-50"
                >
                  {/* The icon shows what the press leads to, like the words beside it. */}
                  {search.alert ? (
                    <BellOff className="h-4 w-4" aria-hidden />
                  ) : (
                    <Bell className="h-4 w-4" aria-hidden />
                  )}
                  {search.alert ? 'כיבוי ההתראה' : 'הפעלת ההתראה'}
                </button>

                <button
                  type="button"
                  onClick={() => remove.mutate(search.id)}
                  disabled={remove.isPending}
                  className="flex items-center gap-1 text-slate-500 hover:text-red-700 disabled:opacity-50"
                >
                  <Trash2 className="h-4 w-4" aria-hidden />
                  מחיקה
                </button>
              </div>
            </li>
          ))}
        </ul>
      </main>

      <SiteFooter />
    </div>
  );
}
