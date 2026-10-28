import type { ScrapeProgress } from '@/types/yad2';

function label(progress: ScrapeProgress): string {
  switch (progress.phase) {
    case 'starting':
      return 'מתחבר ליד2…';
    case 'feed':
      return `אוסף מודעות — עמוד ${progress.pagesDone} מתוך ${progress.pagesTotal}`;
    case 'listings':
      return `מעתיק פריט ${progress.itemsDone} מתוך ${progress.itemsTotal}`;
    case 'done':
      return 'מסיים…';
  }
}

export function ScrapeProgressBar({ progress }: { progress: ScrapeProgress | null }) {
  // Until the first page is read there is no total, so the bar sweeps instead of filling.
  const indeterminate = !progress || progress.total === 0;
  const percent = indeterminate ? 0 : Math.round((progress.done / progress.total) * 100);

  return (
    <div className="rounded-xl border border-slate-200 bg-white p-6 text-center">
      <p className="font-medium text-slate-800">{progress ? label(progress) : 'מתחבר ליד2…'}</p>

      <div
        className="mx-auto mt-3 h-2 w-full max-w-md overflow-hidden rounded-full bg-slate-100"
        role="progressbar"
        aria-valuemin={0}
        aria-valuemax={100}
        aria-valuenow={indeterminate ? undefined : percent}
      >
        <div
          className={
            indeterminate
              ? 'h-full w-1/3 animate-sweep rounded-full bg-slate-400'
              : 'h-full rounded-full bg-slate-900 transition-all duration-300'
          }
          style={indeterminate ? undefined : { width: `${percent}%` }}
        />
      </div>

      <p className="mt-2 text-sm text-slate-500">
        {indeterminate ? 'פותח דפדפן' : `${percent}%`}
      </p>
    </div>
  );
}
