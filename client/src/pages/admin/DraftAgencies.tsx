import { useState } from 'react';
import { useQuery } from '@tanstack/react-query';
import { ChevronDown, ExternalLink } from 'lucide-react';
import { formatAddress, formatDate, formatPrice } from '@/lib/format';
import { qk } from '@/queries/keys';
import { fetchDraftAgencies, fetchDraftListings, type DraftAgency } from '@/services/admin';
import { SECTION_LABELS } from '@/types/search';

const STATUS_LABEL: Record<DraftAgency['status'], string> = {
  unclaimed: 'לא שויכה',
  pending: 'ממתינה לאישור',
};

/**
 * Offices whose Yad2 listings were imported privately, before anyone there agreed.
 * Nothing here is on the site; approving a claim on the office publishes it.
 */
export function DraftAgencies() {
  const [open, setOpen] = useState<string | null>(null);
  const { data: agencies = null, isError } = useQuery({
    queryKey: qk.admin.drafts,
    queryFn: fetchDraftAgencies,
  });

  return (
    <section className="flex flex-col gap-3">
      <div>
        <h2 className="text-xl font-bold text-slate-900">טיוטות</h2>
        <p className="mt-1 text-sm text-slate-500">
          משרדים שהנכסים שלהם יובאו מיד2 ונשמרו כטיוטה. הם לא מופיעים באתר עד שמישהו מהמשרד נרשם ואתם מאשרים אותו.
        </p>
      </div>

      {isError && (
        <p className="rounded-lg border border-red-200 bg-red-50 p-3 text-sm text-red-700">הטעינה נכשלה.</p>
      )}

      {agencies === null && !isError && <p className="text-sm text-slate-500">טוען…</p>}

      {agencies?.length === 0 && (
        <p className="rounded-xl border border-dashed border-slate-300 bg-white p-8 text-center text-sm text-slate-500">
          אין משרדים עם טיוטות.
        </p>
      )}

      {agencies?.map((agency) => {
        const expanded = open === agency.id;
        return (
          <article key={agency.id} className="rounded-xl border border-slate-200 bg-white">
            <div className="flex flex-wrap items-center justify-between gap-3 p-4">
              <button
                type="button"
                aria-expanded={expanded}
                onClick={() => setOpen(expanded ? null : agency.id)}
                className="flex min-w-0 flex-1 items-center gap-2 text-start"
              >
                <ChevronDown
                  className={`h-4 w-4 shrink-0 text-slate-400 transition ${expanded ? 'rotate-180' : ''}`}
                  aria-hidden
                />
                <span className="min-w-0">
                  <span className="block font-semibold text-slate-900">{agency.name}</span>
                  <span className="block text-xs text-slate-500">
                    {STATUS_LABEL[agency.status]}
                    {agency.yad2Id ? ` · יד2 ${agency.yad2Id}` : ''} · {agency.draftCount.toLocaleString('he-IL')}{' '}
                    טיוטות
                    {agency.lastImportedAt ? ` · עודכן ${formatDate(agency.lastImportedAt)}` : ''}
                  </span>
                </span>
              </button>
              {agency.previewPath ? (
                <a
                  href={agency.previewPath}
                  target="_blank"
                  rel="noreferrer"
                  className="inline-flex items-center gap-1 text-sm font-medium text-blue-700 hover:underline"
                >
                  תצוגה מקדימה
                  <ExternalLink className="h-3.5 w-3.5" aria-hidden />
                </a>
              ) : (
                <span className="text-xs text-slate-400">אין תצוגה מקדימה</span>
              )}
            </div>
            {expanded && <DraftListingsTable agencyId={agency.id} />}
          </article>
        );
      })}
    </section>
  );
}

function DraftListingsTable({ agencyId }: { agencyId: string }) {
  const { data: listings = null, isError } = useQuery({
    queryKey: qk.admin.draftListings(agencyId),
    queryFn: () => fetchDraftListings(agencyId),
  });

  if (isError) return <p className="border-t border-slate-100 p-4 text-sm text-red-700">הטעינה נכשלה.</p>;
  if (listings === null) return <p className="border-t border-slate-100 p-4 text-sm text-slate-500">טוען…</p>;
  if (listings.length === 0) {
    return <p className="border-t border-slate-100 p-4 text-sm text-slate-500">אין טיוטות.</p>;
  }

  return (
    <div className="overflow-x-auto border-t border-slate-100">
      <table className="w-full text-sm">
        <thead className="bg-slate-50 text-xs text-slate-500">
          <tr>
            <th className="px-3 py-2 text-start font-medium">סוג</th>
            <th className="px-3 py-2 text-start font-medium">כתובת</th>
            <th className="px-3 py-2 text-start font-medium">נכס</th>
            <th className="px-3 py-2 text-start font-medium">חדרים</th>
            <th className="px-3 py-2 text-start font-medium">מ״ר</th>
            <th className="px-3 py-2 text-start font-medium">קומה</th>
            <th className="px-3 py-2 text-start font-medium">מחיר</th>
            <th className="px-3 py-2 text-start font-medium">יד2</th>
          </tr>
        </thead>
        <tbody className="divide-y divide-slate-100">
          {listings.map((listing) => (
            <tr key={listing.id}>
              <td className="whitespace-nowrap px-3 py-2 text-slate-600">{SECTION_LABELS[listing.section]}</td>
              <td className="px-3 py-2 text-slate-900">
                {formatAddress({
                  street: listing.street ?? '',
                  houseNumber: listing.houseNumber,
                  neighborhood: listing.neighborhood ?? '',
                  city: listing.city ?? '',
                }) || '—'}
              </td>
              <td className="whitespace-nowrap px-3 py-2 text-slate-600">{listing.propertyType ?? '—'}</td>
              <td className="px-3 py-2 text-slate-600">{listing.rooms ?? '—'}</td>
              <td className="px-3 py-2 text-slate-600">{listing.squareMeter ?? '—'}</td>
              <td className="px-3 py-2 text-slate-600">{listing.floor ?? '—'}</td>
              <td className="whitespace-nowrap px-3 py-2 font-medium text-slate-900">{formatPrice(listing.price)}</td>
              <td className="px-3 py-2">
                {listing.listingUrl ? (
                  <a
                    href={listing.listingUrl}
                    target="_blank"
                    rel="noreferrer"
                    className="text-blue-700 hover:underline"
                    aria-label="המודעה ביד2"
                  >
                    <ExternalLink className="h-3.5 w-3.5" aria-hidden />
                  </a>
                ) : (
                  '—'
                )}
              </td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}
