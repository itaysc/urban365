interface Props {
  page: number;
  totalPages: number;
  onChange: (page: number) => void;
}

/** First/last page always shown, with an ellipsis around the current window. */
function pageNumbers(page: number, totalPages: number): (number | '…')[] {
  if (totalPages <= 7) return Array.from({ length: totalPages }, (_, i) => i + 1);

  const window = new Set([1, totalPages, page, page - 1, page + 1]);
  const pages = [...window].filter((p) => p >= 1 && p <= totalPages).sort((a, b) => a - b);

  return pages.flatMap((p, i) => (i > 0 && p - pages[i - 1] > 1 ? ['…' as const, p] : [p]));
}

export function Pagination({ page, totalPages, onChange }: Props) {
  if (totalPages <= 1) return null;

  const button = 'min-w-9 rounded-lg border px-3 py-1.5 text-sm disabled:opacity-40';

  return (
    <nav className="flex items-center justify-center gap-1.5" aria-label="עימוד">
      <button className={`${button} border-slate-300`} onClick={() => onChange(page - 1)} disabled={page === 1}>
        הקודם
      </button>

      {pageNumbers(page, totalPages).map((p, i) =>
        p === '…' ? (
          <span key={`gap-${i}`} className="px-1 text-slate-400">
            …
          </span>
        ) : (
          <button
            key={p}
            onClick={() => onChange(p)}
            aria-current={p === page ? 'page' : undefined}
            className={`${button} ${p === page ? 'border-slate-900 bg-slate-900 text-white' : 'border-slate-300'}`}
          >
            {p}
          </button>
        ),
      )}

      <button
        className={`${button} border-slate-300`}
        onClick={() => onChange(page + 1)}
        disabled={page === totalPages}
      >
        הבא
      </button>
    </nav>
  );
}
