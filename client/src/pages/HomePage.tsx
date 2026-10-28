import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { Link, useNavigate, useParams, useSearchParams } from 'react-router-dom';
import { AgencyHeader } from '@/components/AgencyHeader';
import { AssetCard } from '@/components/AssetCard';
import { AssetModal } from '@/components/AssetModal';
import { CsvDownloads } from '@/components/CsvDownloads';
import { Pagination } from '@/components/Pagination';
import { ScrapeErrorPanel } from '@/components/ScrapeError';
import { ScrapeProgressBar } from '@/components/ScrapeProgressBar';
import { SearchForm } from '@/components/SearchForm';
import { TeamStrip } from '@/components/TeamStrip';
import { useAgency } from '@/hooks/useAgency';
import { formatDate } from '@/lib/format';
import { isSection, parseAgencyInput } from '@/lib/yad2Input';
import type { Asset, Section } from '@/types/yad2';

const PAGE_SIZE = 12;

export function HomePage() {
  const { agencyId } = useParams<{ agencyId: string }>();
  const [params, setParams] = useSearchParams();
  const navigate = useNavigate();

  const sectionParam = params.get('section');
  const section: Section = isSection(sectionParam) ? sectionParam : 'forsale';
  const listingToken = params.get('listing');

  const { status, result, progress, error, errorCode, load, reset } = useAgency();
  const [inputError, setInputError] = useState<string | null>(null);

  // Which agency the hook currently holds, so paging or opening a listing — both of
  // which only change the query string — never refetches.
  const loadedKey = useRef<string | null>(null);

  useEffect(() => {
    if (!agencyId) {
      loadedKey.current = null;
      reset();
      return;
    }

    const key = `${agencyId}/${section}`;
    if (loadedKey.current === key) return;
    loadedKey.current = key;
    void load(agencyId, section);
  }, [agencyId, section, load, reset]);

  const assets = result?.assets ?? [];
  const totalPages = Math.max(1, Math.ceil(assets.length / PAGE_SIZE));
  const page = Math.min(Math.max(1, Number(params.get('page') ?? 1) || 1), totalPages);
  const visible = useMemo(() => assets.slice((page - 1) * PAGE_SIZE, page * PAGE_SIZE), [assets, page]);

  // The modal is derived from the URL, so Back simply drops the param and closes it.
  const selected = useMemo(
    () => (listingToken ? (assets.find((a) => a.token === listingToken) ?? null) : null),
    [assets, listingToken],
  );

  // True when this page instance pushed the listing onto the history stack, so closing
  // can step back rather than stacking another entry. False when the modal URL was
  // opened directly, where there is nothing of ours to go back to.
  const pushedListing = useRef(false);

  const onSearch = (input: string, refresh: boolean) => {
    let parsed: { agencyId: string; section: Section | null };
    try {
      parsed = parseAgencyInput(input);
    } catch (e) {
      setInputError(e instanceof Error ? e.message : String(e));
      return;
    }

    setInputError(null);
    const nextSection = parsed.section ?? 'forsale';
    navigate(`/agency/${parsed.agencyId}?section=${nextSection}`);

    // Refreshing the agency already on screen does not change the URL, so trigger it here.
    if (refresh) {
      loadedKey.current = `${parsed.agencyId}/${nextSection}`;
      void load(parsed.agencyId, nextSection, true);
    }
  };

  const goToPage = (next: number) => {
    setParams(
      (p) => {
        p.set('page', String(next));
        p.delete('listing');
        return p;
      },
      { preventScrollReset: true },
    );
    window.scrollTo({ top: 0, behavior: 'smooth' });
  };

  const openListing = useCallback(
    (asset: Asset) => {
      pushedListing.current = true;
      setParams(
        (p) => {
          p.set('listing', asset.token);
          return p;
        },
        { preventScrollReset: true },
      );
    },
    [setParams],
  );

  const closeListing = useCallback(() => {
    if (pushedListing.current) {
      pushedListing.current = false;
      navigate(-1);
      return;
    }

    setParams(
      (p) => {
        p.delete('listing');
        return p;
      },
      { replace: true, preventScrollReset: true },
    );
  }, [navigate, setParams]);

  // Back while the modal is open drops the param; keep the flag in step with the URL.
  useEffect(() => {
    if (!listingToken) pushedListing.current = false;
  }, [listingToken]);

  return (
    <div className="min-h-screen bg-slate-50">
      <div className="mx-auto flex max-w-6xl flex-col gap-6 p-4 sm:p-8">
        <header className="flex flex-wrap items-baseline justify-between gap-3">
          <div>
            <h1 className="text-2xl font-bold text-slate-900">נדל״ן</h1>
            <p className="text-sm text-slate-500">ייבוא סוכנות נדל״ן מיד2</p>
          </div>
          <Link to="/" className="text-sm text-blue-700 hover:underline">
            חיפוש בכל הנכסים ←
          </Link>
        </header>

        <SearchForm
          onSearch={onSearch}
          loading={status === 'loading'}
          initialValue={agencyId ?? ''}
          error={inputError}
        />

        {status === 'loading' && <ScrapeProgressBar progress={progress} />}

        {status === 'error' && <ScrapeErrorPanel code={errorCode} message={error} />}

        {status === 'done' && result && (
          <>
            <AgencyHeader agency={result.agency} />
            <TeamStrip team={result.team} agencyName={result.agency.name} />

            <section className="flex flex-col gap-4">
              <div className="flex flex-wrap items-baseline justify-between gap-3">
                <h2 className="text-lg font-semibold text-slate-900">{result.meta.total} נכסים</h2>
                <CsvDownloads agencyId={result.meta.agencyId} section={result.meta.section} />
                <p className="w-full text-xs text-slate-400 sm:w-auto">
                  {result.meta.source === 'cache' ? 'מתוך מטמון' : 'נסרק עכשיו'} ·{' '}
                  {formatDate(result.meta.scrapedAt)}
                  {result.meta.listingsWithoutDetails > 0 &&
                    ` · ${result.meta.listingsWithoutDetails} ללא פרטים מלאים`}
                </p>
              </div>

              <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
                {visible.map((asset) => (
                  <AssetCard key={asset.token} asset={asset} onOpen={openListing} />
                ))}
              </div>

              <Pagination page={page} totalPages={totalPages} onChange={goToPage} />
            </section>
          </>
        )}
      </div>

      {selected && <AssetModal asset={selected} onClose={closeListing} />}
    </div>
  );
}
