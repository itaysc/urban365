import { Link } from 'react-router-dom';
import { useQuery } from '@tanstack/react-query';
import { Building2 } from 'lucide-react';
import { AgencyBreadcrumbs } from '@/components/agency/AgencyBreadcrumbs';
import { SiteFooter } from '@/components/SiteFooter';
import { SiteHeader } from '@/components/SiteHeader';
import { qk } from '@/queries/keys';
import { agencyPublicPath, fetchAgencyDirectory, type PublicAgencyCard } from '@/services/publicAgencies';

function listingCount(count: number): string {
  if (count === 0) return 'אין נכסים בלוח';
  if (count === 1) return 'נכס אחד';
  return `${count.toLocaleString('he-IL')} נכסים`;
}

function AgencyCard({ agency }: { agency: PublicAgencyCard }) {
  return (
    <Link
      to={agencyPublicPath(agency)}
      className="flex flex-col overflow-hidden rounded-xl border border-slate-200 bg-white transition hover:border-slate-400 hover:shadow-md"
    >
      <div className="relative h-28 bg-slate-200">
        {agency.coverImageUrl ? (
          <img src={agency.coverImageUrl} alt="" className="h-full w-full object-cover" />
        ) : (
          <div className="h-full w-full bg-gradient-to-l from-slate-700 to-slate-500" />
        )}
        <div className="absolute bottom-2 start-3 flex h-12 w-12 items-center justify-center overflow-hidden rounded-lg border-2 border-white bg-white">
          {agency.logoUrl ? (
            <img src={agency.logoUrl} alt="" className="h-full w-full object-contain" />
          ) : (
            <Building2 className="h-5 w-5 text-slate-400" aria-hidden />
          )}
        </div>
      </div>

      <div className="flex flex-col gap-0.5 p-3">
        <span className="font-semibold text-slate-900">{agency.name}</span>
        <span className="text-xs text-slate-500">
          {[agency.city, listingCount(agency.listingCount)].filter(Boolean).join(' · ')}
        </span>
      </div>
    </Link>
  );
}

/**
 * The agencies, filed by the region most of their listings sit in.
 */
export function AgenciesPage() {
  const { data, isPending, isError } = useQuery({
    queryKey: qk.publicAgencies.directory,
    queryFn: fetchAgencyDirectory,
    staleTime: 60_000,
  });

  const regions = data?.regions ?? [];

  return (
    <div className="min-h-screen bg-slate-50">
      <SiteHeader />

      <main id="main" tabIndex={-1} className="mx-auto w-full max-w-7xl px-4 py-8 sm:px-8">
        <AgencyBreadcrumbs />
        <h1 className="mt-3 text-2xl font-extrabold text-slate-900">סוכנויות נדל״ן</h1>
        <p className="mt-1 text-sm text-slate-500">לפי האזור שבו רוב הנכסים שלהן מוצעים.</p>

        {regions.length > 1 && (
          <nav className="mt-4 flex flex-wrap gap-2" aria-label="אזורים">
            {regions.map((region) => (
              <a
                key={region.name}
                href={`#region-${encodeURIComponent(region.name)}`}
                className="rounded-full border border-slate-200 bg-white px-3 py-1 text-sm text-slate-700 transition hover:border-slate-400"
              >
                {region.name}
                <span className="ms-1 text-xs text-slate-400">{region.agencies.length}</span>
              </a>
            ))}
          </nav>
        )}

        {isPending && <p className="mt-8 text-sm text-slate-500">טוען…</p>}

        {isError && (
          <p className="mt-8 rounded-xl border border-red-200 bg-red-50 p-4 text-sm text-red-800">
            לא הצלחנו לטעון את הסוכנויות.
          </p>
        )}

        {!isPending && !isError && regions.length === 0 && (
          <p className="mt-8 rounded-xl border border-dashed border-slate-300 bg-white p-8 text-center text-sm text-slate-500">
            אין סוכנויות להצגה.
          </p>
        )}

        <div className="mt-8 flex flex-col gap-10">
          {regions.map((region) => (
            <section key={region.name} id={`region-${encodeURIComponent(region.name)}`} className="scroll-mt-24">
              <h2 className="mb-3 text-lg font-bold text-slate-900">
                {region.name}
                <span className="ms-2 text-sm font-normal text-slate-500">{region.agencies.length}</span>
              </h2>
              <ul className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
                {region.agencies.map((agency) => (
                  <li key={agency.id}>
                    <AgencyCard agency={agency} />
                  </li>
                ))}
              </ul>
            </section>
          ))}
        </div>
      </main>

      <SiteFooter />
    </div>
  );
}
