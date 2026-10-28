import { useEffect, useRef, useState } from 'react';
import { Button } from '@/components/ui/Button';
import { Field, inputClass } from '@/components/ui/Field';
import { errorMessageOf } from '@/lib/apiError';
import { fetchImportJob, startYad2Import, type ImportJob } from '@/services/agency';

const SECTIONS = [
  { value: 'forsale', label: 'למכירה' },
  { value: 'rent', label: 'להשכרה' },
  { value: 'commercial', label: 'מסחרי' },
];

/**
 * Onboarding shortcut: pull this agency's own listings across from yad2 rather than
 * retyping them. It writes into *this* agency only — the server links the yad2 id to
 * the caller's row first and refuses a page another agency already holds.
 */
export function Yad2ImportPanel({ onImported }: { onImported: () => void }) {
  const [input, setInput] = useState('');
  const [section, setSection] = useState('forsale');
  const [job, setJob] = useState<ImportJob | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [starting, setStarting] = useState(false);
  const poll = useRef<number | null>(null);

  // A scrape outlives any single request, so the job is polled. Cleared on unmount so
  // leaving the page does not leave a timer running.
  useEffect(() => {
    return () => {
      if (poll.current) window.clearInterval(poll.current);
    };
  }, []);

  const start = async () => {
    setStarting(true);
    setError(null);
    setJob(null);

    try {
      const { jobId } = await startYad2Import(input.trim(), section);

      poll.current = window.setInterval(() => {
        void fetchImportJob(jobId)
          .then((next) => {
            setJob(next);
            if (next.status === 'running') return;

            if (poll.current) window.clearInterval(poll.current);
            poll.current = null;
            if (next.status === 'done') onImported();
          })
          .catch(() => {
            if (poll.current) window.clearInterval(poll.current);
            poll.current = null;
            setError('איבדנו את הקשר עם הייבוא.');
          });
      }, 1500);
    } catch (e) {
      setError(errorMessageOf(e, 'לא הצלחנו להתחיל את הייבוא.'));
    } finally {
      setStarting(false);
    }
  };

  const running = job?.status === 'running' || starting;

  return (
    <section className="flex flex-col gap-3 rounded-xl border border-slate-200 bg-white p-4">
      <div>
        <h2 className="text-sm font-semibold text-slate-900">ייבוא מיד2</h2>
        <p className="mt-1 text-xs text-slate-500">
          מייבא את הנכסים של הסוכנות שלך מעמוד היד2 שלה, כדי שלא תצטרכו להזין אותם מחדש.
        </p>
      </div>

      {error && (
        <p className="rounded-lg border border-red-200 bg-red-50 p-2 text-xs text-red-700">{error}</p>
      )}

      {job?.status === 'error' && (
        <p className="rounded-lg border border-red-200 bg-red-50 p-2 text-xs text-red-700">
          {job.errorCode === 'BOT_CHECK'
            ? 'יד2 חסם את הבקשה. נסו שוב מאוחר יותר.'
            : (job.error ?? 'הייבוא נכשל.')}
        </p>
      )}

      {job?.status === 'done' && (
        <p className="rounded-lg border border-green-200 bg-green-50 p-2 text-xs text-green-800">
          הייבוא הושלם. הנכסים מופיעים תחת «הנכסים שלי».
        </p>
      )}

      <div className="grid gap-3 sm:grid-cols-[1fr_auto_auto] sm:items-end">
        <Field label="מספר סוכנות או קישור ליד2" htmlFor="yad2-input">
          <input
            id="yad2-input"
            className={inputClass}
            value={input}
            onChange={(e) => setInput(e.target.value)}
            placeholder="6816047 או https://www.yad2.co.il/realestate/agency/6816047/forsale"
            disabled={running}
          />
        </Field>

        <Field label="סוג" htmlFor="yad2-section">
          <select
            id="yad2-section"
            className={inputClass}
            value={section}
            onChange={(e) => setSection(e.target.value)}
            disabled={running}
          >
            {SECTIONS.map((s) => (
              <option key={s.value} value={s.value}>
                {s.label}
              </option>
            ))}
          </select>
        </Field>

        <Button disabled={running || !input.trim()} onClick={() => void start()}>
          {running ? 'מייבא…' : 'ייבא'}
        </Button>
      </div>

      {job?.status === 'running' && job.progress && (
        <p className="text-xs text-slate-500">
          {job.progress.phase} · {job.progress.done}/{job.progress.total || '?'}
        </p>
      )}
    </section>
  );
}
