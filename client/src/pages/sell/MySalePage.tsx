import { Link } from 'react-router-dom';
import { useQuery } from '@tanstack/react-query';
import { Plus } from 'lucide-react';
import { SiteFooter } from '@/components/SiteFooter';
import { SiteHeader } from '@/components/SiteHeader';
import { SellerListings } from '@/components/seller/SellerListings';
import { qk } from '@/queries/keys';
import { fetchMyListings } from '@/services/seller';

/**
 * What a private seller has published, and how each one is doing.
 *
 * The figures are counts of people, not of page loads — the labels say so, because
 * "47 views" means something quite different depending on which it is, and a seller
 * deciding whether to drop the price deserves the one that is true.
 */
export function MySalePage() {
  const { data: listings, isPending } = useQuery({
    queryKey: qk.mySale.list,
    queryFn: fetchMyListings,
  });

  return (
    <div className="min-h-screen bg-slate-50">
      <SiteHeader />

      <main id="main" tabIndex={-1} className="mx-auto flex max-w-4xl flex-col gap-6 p-4 sm:p-8">
        <header className="flex flex-wrap items-baseline justify-between gap-3">
          <div>
            <h1 className="text-2xl font-bold text-slate-900">הנכסים שלי למכירה</h1>
            <p className="text-sm text-slate-500">
              {isPending ? 'טוען…' : `${listings?.length ?? 0} נכסים`}
            </p>
          </div>

          <div className="flex items-center gap-3">
            <Link to="/" className="text-sm text-slate-600 hover:text-slate-900">
              לחיפוש
            </Link>
            <Link
              to="/sell/new"
              className="flex items-center gap-1.5 rounded-lg bg-slate-900 px-4 py-2 text-sm font-medium text-white"
            >
              <Plus className="h-4 w-4" aria-hidden />
              פרסום נכס
            </Link>
          </div>
        </header>

        <SellerListings />
      </main>

      <SiteFooter />
    </div>
  );
}
