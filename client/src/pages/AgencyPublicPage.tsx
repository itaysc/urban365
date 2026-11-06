import { useCallback, useEffect, useRef, useState } from 'react';
import { useParams, useSearchParams } from 'react-router-dom';
import { useQuery } from '@tanstack/react-query';
import { Building2, Phone } from 'lucide-react';
import { AgencyBreadcrumbs } from '@/components/agency/AgencyBreadcrumbs';
import { AgencyEnquiryForm } from '@/components/agency/AgencyEnquiryForm';
import { AssetModal } from '@/components/AssetModal';
import { ListingCard } from '@/components/ListingCard';
import { Pagination } from '@/components/Pagination';
import { SiteFooter } from '@/components/SiteFooter';
import { SiteHeader } from '@/components/SiteHeader';
import { Button } from '@/components/ui/Button';
import { formatDay } from '@/lib/format';
import { useDocumentTitle } from '@/hooks/useDocumentTitle';
import { qk } from '@/queries/keys';
import { fetchSavedAmong } from '@/services/saved';
import { fetchListing, searchListings } from '@/services/search';
import { fetchPublicAgency, type PublicAgency, type PublicBroker, type PublicOffice } from '@/services/publicAgencies';
import { EMPTY_FILTERS, SECTION_LABELS, type SearchListing } from '@/types/search';
import type { Asset, Section } from '@/types/yad2';

const SECTIONS: Section[] = ['forsale', 'rent', 'commercial'];

function isSection(value: string | null): value is Section {
  return value === 'forsale' || value === 'rent' || value === 'commercial';
}

function officeLine(office: PublicOffice): string {
  const street = [office.street, office.houseNumber].filter((part) => part !== null && part !== '').join(' ');
  return [office.label, street, office.city].filter(Boolean).join(', ');
}

function initials(name: string): string {
  return name
    .split(/\s+/)
    .filter(Boolean)
    .slice(0, 2)
    .map((word) => word[0])
    .join('');
}

function Stat({ value, label }: { value: number; label: string }) {
  return (
    <div className="rounded-xl border border-slate-200 bg-white px-4 py-3 text-center">
      <div className="text-2xl font-bold tabular-nums text-slate-900">{value.toLocaleString('he-IL')}</div>
      <div className="text-xs text-slate-500">{label}</div>
    </div>
  );
}

function Team({ brokers, agencyName }: { brokers: PublicBroker[]; agencyName: string }) {
  if (brokers.length === 0) return null;

  return (
    <section>
      <h2 className="mb-3 text-lg font-semibold text-slate-900">צוות {agencyName}</h2>
      <ul className="flex gap-6 overflow-x-auto pb-2">
        {brokers.map((broker) => (
          <li key={broker.id} className="w-32 flex-none text-center">
            {broker.avatarUrl ? (
              <img src={broker.avatarUrl} alt="" className="mx-auto h-20 w-20 rounded-full object-cover" />
            ) : (
              <div className="mx-auto flex h-20 w-20 items-center justify-center rounded-full bg-slate-100 text-lg font-semibold text-slate-500">
                {initials(broker.name)}
              </div>
            )}
            <div className="mt-2 text-sm font-semibold text-slate-900">{broker.name}</div>
            {broker.licenseNumber && (
              <div className="text-xs text-slate-500">מס׳ רישיון {broker.licenseNumber}</div>
            )}
            {broker.specialization && <div className="mt-1 text-xs text-blue-700">{broker.specialization}</div>}
          </li>
        ))}
      </ul>
    </section>
  );
}

function Listings({ agency }: { agency: PublicAgency }) {
  const [params, setParams] = useSearchParams();
  const requested = params.get('section');
  const fallback = SECTIONS.find((section) => agency.counts[section] > 0) ?? 'forsale';
  const section: Section = isSection(requested) ? requested : fallback;
  const page = Math.max(1, Number(params.get('page') ?? 1) || 1);
  const listingId = params.get('listing');

  const setQuery = useCallback(
    (next: { section?: Section; page?: number; listing?: string | null }) => {
      setParams(
        (prev) => {
          const params = new URLSearchParams(prev);
          if (next.section) params.set('section', next.section);
          if (next.page && next.page > 1) params.set('page', String(next.page));
          else if (next.page !== undefined) params.delete('page');
          if (next.listing) params.set('listing', next.listing);
          else if (next.listing === null) params.delete('listing');
          return params;
        },
        { preventScrollReset: true },
      );
    },
    [setParams],
  );

  const { data, isPending, isError } = useQuery({
    queryKey: qk.listings.search({ ...EMPTY_FILTERS, agencyId: agency.id, section, page }),
    queryFn: () => searchListings({ ...EMPTY_FILTERS, agencyId: agency.id, section, page }),
    placeholderData: (previous) => previous,
  });

  const ids = data?.items.map((item) => item.id) ?? [];
  const { data: saved } = useQuery({
    queryKey: qk.saved.among(ids),
    queryFn: () => fetchSavedAmong(ids),
    enabled: ids.length > 0,
  });

  const [selected, setSelected] = useState<{ id: string; asset: Asset } | null>(null);
  const fetched = useRef<string | null>(null);

  useEffect(() => {
    if (!listingId) {
      fetched.current = null;
      return;
    }
    if (fetched.current === listingId) return;
    fetched.current = listingId;

    void fetchListing(listingId)
      .then((full) => setSelected({ id: listingId, asset: full as unknown as Asset }))
      .catch(() => setQuery({ listing: null }));
  }, [listingId, setQuery]);

  const shown = selected?.id === listingId ? selected.asset : null;
  const open = (listing: SearchListing) => setQuery({ listing: listing.id });

  return (
    <section className="mt-10">
      <h2 className="text-lg font-semibold text-slate-900">הנכסים שלנו</h2>

      <div className="mt-3 flex flex-wrap gap-2">
        {SECTIONS.map((value) => (
          <button
            key={value}
            type="button"
            onClick={() => setQuery({ section: value, page: 1 })}
            className={`rounded-full px-3 py-1 text-sm ${
              section === value ? 'bg-slate-900 text-white' : 'border border-slate-300 bg-white text-slate-700'
            }`}
          >
            {SECTION_LABELS[value]} ({agency.counts[value].toLocaleString('he-IL')})
          </button>
        ))}
      </div>

      {isError && <p className="mt-4 text-sm text-red-700">לא הצלחנו לטעון את הנכסים.</p>}

      {!isError && !isPending && (data?.items.length ?? 0) === 0 && (
        <p className="mt-4 rounded-xl border border-dashed border-slate-300 bg-white p-8 text-center text-sm text-slate-500">
          אין נכסים להצגה.
        </p>
      )}

      <ul className={`mt-4 grid gap-4 sm:grid-cols-2 ${isPending ? 'opacity-60' : ''}`}>
        {data?.items.map((listing) => (
          <li key={listing.id}>
            <ListingCard listing={listing} onOpen={open} saved={saved?.has(listing.id) ?? false} />
          </li>
        ))}
      </ul>

      {data && data.totalPages > 1 && (
        <div className="mt-4">
          <Pagination page={data.page} totalPages={data.totalPages} onChange={(next) => setQuery({ page: next })} />
        </div>
      )}

      {shown && <AssetModal asset={shown} onClose={() => setQuery({ listing: null })} />}
    </section>
  );
}

/**
 * One agency, the way a buyer meets it: the banner they uploaded, what we know
 * about them, their listings, and a form that arrives in their inbox.
 */
export function AgencyPublicPage() {
  const { agencyKey } = useParams<{ agencyKey: string }>();
  const { data, isPending, isError } = useQuery({
    queryKey: qk.publicAgencies.page(agencyKey ?? ''),
    queryFn: () => fetchPublicAgency(agencyKey ?? ''),
    enabled: Boolean(agencyKey),
  });

  useDocumentTitle(data?.name ?? (isPending ? 'סוכנות' : 'הסוכנות לא נמצאה'));

  const [phoneShown, setPhoneShown] = useState(false);

  return (
    <div className="min-h-screen bg-slate-50">
      <SiteHeader />

      <main id="main" tabIndex={-1}>
        {isPending && <p className="mx-auto max-w-6xl px-4 py-10 text-sm text-slate-500">טוען…</p>}

        {isError && (
          <p className="mx-auto max-w-6xl px-4 py-10 text-sm text-slate-600">הסוכנות לא נמצאה.</p>
        )}

        {data && (
          <>
            <div className="relative h-56 sm:h-72">
              {data.coverImageUrl ? (
                <img src={data.coverImageUrl} alt="" className="absolute inset-0 h-full w-full object-cover" />
              ) : (
                <div className="absolute inset-0 bg-gradient-to-l from-slate-800 to-slate-600" />
              )}
              <div className="absolute inset-0 bg-slate-900/45" aria-hidden />

              <div className="absolute inset-x-0 top-0 mx-auto max-w-6xl px-4 pt-4 sm:px-8">
                <AgencyBreadcrumbs current={data.name} onCover />
              </div>

              <div className="absolute inset-x-0 bottom-0 mx-auto flex max-w-6xl items-end gap-4 px-4 pb-5 sm:px-8">
                <div className="flex h-16 w-16 flex-none items-center justify-center overflow-hidden rounded-xl border-2 border-white bg-white sm:h-20 sm:w-20">
                  {data.logoUrl ? (
                    <img src={data.logoUrl} alt="" className="h-full w-full object-contain" />
                  ) : (
                    <Building2 className="h-7 w-7 text-slate-400" aria-hidden />
                  )}
                </div>
                <div className="min-w-0 text-white">
                  <h1 className="truncate text-2xl font-extrabold sm:text-3xl">{data.name}</h1>
                  {data.licenseNumber && <p className="text-sm text-white/90">מס׳ רישיון {data.licenseNumber}</p>}
                </div>
              </div>
            </div>

            <div className="mx-auto grid w-full max-w-6xl gap-8 px-4 py-8 sm:px-8 lg:grid-cols-[18rem_minmax(0,1fr)]">
              <aside className="flex flex-col gap-3 lg:sticky lg:top-24 lg:self-start">
                <AgencyEnquiryForm agencyKey={data.slug ?? data.id} />

                {data.phone &&
                  (phoneShown ? (
                    <a
                      href={`tel:${data.phone}`}
                      className="flex items-center justify-center gap-2 rounded-xl border border-slate-300 bg-white px-4 py-2 text-sm font-medium text-slate-900"
                    >
                      <Phone className="h-4 w-4" aria-hidden />
                      {data.phone}
                    </a>
                  ) : (
                    <Button variant="secondary" onClick={() => setPhoneShown(true)}>
                      הצגת מספר טלפון
                    </Button>
                  ))}
              </aside>

              <div className="flex min-w-0 flex-col gap-8">
                <div className="grid grid-cols-3 gap-3">
                  <Stat value={data.counts.forsale} label="נכסים למכירה" />
                  <Stat value={data.counts.rent} label="נכסים להשכרה" />
                  <Stat value={data.counts.commercial} label="נכסים מסחריים" />
                </div>

                {data.description && (
                  <section>
                    <h2 className="mb-2 text-lg font-semibold text-slate-900">על {data.name}</h2>
                    <p className="whitespace-pre-line text-sm leading-6 text-slate-700">{data.description}</p>
                  </section>
                )}

                {data.offices.length > 0 && (
                  <section>
                    <h2 className="mb-2 text-lg font-semibold text-slate-900">סניפים</h2>
                    <ul className="flex flex-col gap-1 text-sm text-slate-700">
                      {data.offices.map((office) => (
                        <li key={office.id}>{officeLine(office)}</li>
                      ))}
                    </ul>
                  </section>
                )}

                {data.openingHours.length > 0 && (
                  <section>
                    <h2 className="mb-2 text-lg font-semibold text-slate-900">שעות פעילות</h2>
                    <ul className="grid gap-1 text-sm text-slate-700 sm:grid-cols-2">
                      {data.openingHours.map((hour) => (
                        <li key={hour.day}>
                          <span className="font-medium">{formatDay(hour.day)}:</span>
                          {hour.open && hour.close ? ` ${hour.open}–${hour.close}` : ''}
                        </li>
                      ))}
                    </ul>
                  </section>
                )}

                <Team brokers={data.brokers} agencyName={data.name} />
                <Listings agency={data} />
              </div>
            </div>
          </>
        )}
      </main>

      <SiteFooter />
    </div>
  );
}
