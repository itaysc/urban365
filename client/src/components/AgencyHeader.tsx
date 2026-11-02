import type { AgencySummary } from '@/types/yad2';

const Count = ({ label, value }: { label: string; value: number | null }) => (
  <div className="text-center">
    <div className="text-2xl font-bold text-slate-900">{value ?? '—'}</div>
    <div className="text-sm text-slate-500">{label}</div>
  </div>
);

export function AgencyHeader({ agency }: { agency: AgencySummary }) {
  return (
    <section className="rounded-xl border border-slate-200 bg-white p-6">
      <div className="flex flex-wrap items-center gap-5">
        {agency.logoUrl && (
          <img src={agency.logoUrl} alt={agency.name} className="h-20 w-20 rounded-lg object-contain" />
        )}

        <div className="flex-1">
          <h1 className="text-3xl font-bold text-slate-900">{agency.name}</h1>
          <p className="text-slate-500">מס׳ רישיון {agency.licenseNumber}</p>
          <a
            href={agency.agencyUrl}
            target="_blank"
            rel="noreferrer"
            className="text-sm text-blue-700 hover:underline"
          >
            הצגה ביד2 ↗
          </a>
        </div>

        <div className="flex gap-8">
          <Count label="נכסים למכירה" value={agency.counts.forSale} />
          <Count label="נכסים להשכרה" value={agency.counts.forRent} />
          <Count label="נכסים מסחריים" value={agency.counts.commercial} />
        </div>
      </div>

      {agency.description && (
        <p className="mt-5 whitespace-pre-line border-t border-slate-100 pt-4 text-sm leading-relaxed text-slate-600">
          {agency.description}
        </p>
      )}

      {agency.openingHours.length > 0 && (
        <p className="mt-3 text-xs text-slate-500">
          {agency.openingHours.map((h) => `${h.day} ${h.open}–${h.close}`).join(' · ')}
        </p>
      )}
    </section>
  );
}
