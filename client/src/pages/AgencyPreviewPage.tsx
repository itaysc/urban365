import { useEffect, useMemo } from 'react';
import { useQuery } from '@tanstack/react-query';
import { Link, useParams } from 'react-router-dom';
import { ImageOff, Phone } from 'lucide-react';
import { formatPrice } from '@/lib/format';
import { fetchAgencyPreview, type PreviewListing } from '@/services/preview';
import { SECTION_LABELS } from '@/types/search';

const SECTIONS = ['forsale', 'rent', 'commercial'] as const;

function facts(listing: PreviewListing): string {
  const parts: string[] = [];
  if (listing.rooms !== null) parts.push(`${listing.rooms} חדרים`);
  if (listing.squareMeter !== null) parts.push(`${listing.squareMeter} מ״ר`);
  if (listing.floor !== null) {
    parts.push(
      listing.buildingTopFloor !== null
        ? `קומה ${listing.floor} מתוך ${listing.buildingTopFloor}`
        : `קומה ${listing.floor}`,
    );
  }
  if (listing.propertyType) parts.push(listing.propertyType);
  return parts.join(' · ');
}

function place(listing: PreviewListing): string {
  return [listing.street, listing.neighborhood, listing.city].filter(Boolean).join(', ');
}

/** A link that has been handed around must not end up in an index. */
function useNoIndex() {
  useEffect(() => {
    const meta = document.createElement('meta');
    meta.name = 'robots';
    meta.content = 'noindex, nofollow';
    document.head.appendChild(meta);
    return () => meta.remove();
  }, []);
}

/**
 * Where an invited office sees what it would look like here, before agreeing to it.
 *
 * Nothing on this page is on the site. The token in the address is the only way in,
 * and the listings show facts only: the photos and the office's own text stay with
 * Yad2 until they say yes.
 */
export function AgencyPreviewPage() {
  const { token = '' } = useParams();
  useNoIndex();

  const { data, isPending, error } = useQuery({
    queryKey: ['agency-preview', token],
    queryFn: () => fetchAgencyPreview(token),
    retry: false,
  });

  const bySection = useMemo(
    () =>
      SECTIONS.map((section) => ({
        section,
        listings: (data?.listings ?? []).filter((listing) => listing.section === section),
      })).filter((group) => group.listings.length > 0),
    [data],
  );

  const claimPath = `/agency/signup?claim=${encodeURIComponent(token)}`;

  return (
    <div className="min-h-screen bg-slate-50">
      <div className="mx-auto max-w-5xl px-4 py-8">
        <p className="mb-6 text-xl font-extrabold tracking-tight text-blue-700">
          Urban<span className="text-blue-500">365</span>
        </p>

        {isPending && <p className="text-sm text-slate-500">טוען…</p>}

        {error && (
          <p className="rounded-2xl border border-slate-200 bg-white p-6 text-sm text-slate-600">
            הקישור אינו תקף. אם קיבלתם אותו מאיתנו, השיבו למייל ונשלח קישור חדש.
          </p>
        )}

        {data && (
          <>
            <section className="rounded-2xl border border-slate-200 bg-white p-6 shadow-sm">
              <h1 className="text-2xl font-bold text-slate-900">{data.agency.name} ב-Urban365</h1>

              {data.live ? (
                <p className="mt-2 text-slate-700">
                  הנכסים של המשרד כבר באתר.{' '}
                  {data.publicPath && (
                    <Link to={data.publicPath} className="font-medium text-blue-700 hover:underline">
                      לעמוד המשרד
                    </Link>
                  )}
                </p>
              ) : (
                <>
                  <p className="mt-2 text-slate-700">
                    זו תצוגה מקדימה פרטית. היא לא מופיעה באתר, לא בחיפוש ולא בגוגל, ורק מי שיש לו את
                    הקישור יכול לראות אותה.
                  </p>
                  <p className="mt-2 text-slate-700">
                    אלה הנכסים שהמשרד מפרסם היום. אחרי האישור שלכם הם עולים לאתר עם הטלפון של המשרד,
                    ואנחנו מוסיפים את התמונות.
                  </p>

                  {data.agency.phone && (
                    <p className="mt-3 flex items-center gap-2 text-sm text-slate-600">
                      <Phone className="h-4 w-4 text-slate-500" aria-hidden />
                      הטלפון שיופיע במודעות:{' '}
                      <span dir="ltr" className="font-medium text-slate-800">
                        {data.agency.phone}
                      </span>
                    </p>
                  )}

                  {data.pending ? (
                    <p className="mt-4 rounded-lg bg-amber-50 px-3 py-2 text-sm text-amber-900">
                      הבקשה התקבלה ומחכה לאישור שלנו. כשנאשר, הנכסים יעלו לאתר.
                    </p>
                  ) : (
                    <div className="mt-5 flex flex-wrap items-center gap-3">
                      <Link
                        to={claimPath}
                        className="inline-flex items-center justify-center rounded-lg bg-blue-600 px-5 py-2.5 text-sm font-semibold text-white hover:bg-blue-700"
                      >
                        אישור ופתיחת חשבון
                      </Link>
                      <span className="text-sm text-slate-500">
                        לא מעוניינים? השיבו למייל ונמחק את הדף.
                      </span>
                    </div>
                  )}
                </>
              )}
            </section>

            {bySection.length === 0 && (
              <p className="mt-6 text-sm text-slate-600">אין כרגע נכסים להצגה.</p>
            )}

            {bySection.map(({ section, listings }) => (
              <section key={section} className="mt-8">
                <h2 className="mb-3 text-lg font-semibold text-slate-900">
                  {SECTION_LABELS[section]} ({listings.length.toLocaleString('he-IL')})
                </h2>
                <ul className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
                  {listings.map((listing) => (
                    <li
                      key={listing.id}
                      className="overflow-hidden rounded-xl border border-slate-200 bg-white shadow-sm"
                    >
                      <div className="flex aspect-[16/9] flex-col items-center justify-center gap-1 bg-slate-100 text-slate-400">
                        <ImageOff className="h-6 w-6" aria-hidden />
                        <span className="text-xs">התמונות יתווספו אחרי האישור</span>
                      </div>
                      <div className="p-4">
                        <p className="text-lg font-bold text-slate-900">{formatPrice(listing.price)}</p>
                        {facts(listing) && <p className="mt-1 text-sm text-slate-700">{facts(listing)}</p>}
                        {place(listing) && <p className="mt-1 text-sm text-slate-500">{place(listing)}</p>}
                      </div>
                    </li>
                  ))}
                </ul>
              </section>
            ))}
          </>
        )}
      </div>
    </div>
  );
}
