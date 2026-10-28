import { csvUrl, type CsvKind } from '@/services/yad2';
import type { Section } from '@/types/yad2';

const FILES: { kind: CsvKind; label: string }[] = [
  { kind: 'assets', label: 'נכסים' },
  { kind: 'team', label: 'צוות' },
  { kind: 'agency', label: 'סוכנות' },
];

/**
 * Plain links — the server sends Content-Disposition: attachment, so the browser
 * downloads them without any JS.
 */
export function CsvDownloads({ agencyId, section }: { agencyId: string; section: Section }) {
  return (
    <div className="flex flex-wrap items-center gap-2">
      <span className="text-sm text-slate-500">הורדת CSV:</span>
      {FILES.map(({ kind, label }) => (
        <a
          key={kind}
          href={csvUrl(agencyId, section, kind)}
          download
          className="rounded-lg border border-slate-300 bg-white px-3 py-1.5 text-sm text-slate-700 hover:border-slate-900 hover:text-slate-900"
        >
          ↓ {label}
        </a>
      ))}
    </div>
  );
}
