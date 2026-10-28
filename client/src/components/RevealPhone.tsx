import { useState } from 'react';
import { errorMessageOf } from '@/lib/apiError';
import { revealPhone } from '@/services/crm';

/**
 * "Show number", the way a listings site does it: the number is not in the page until
 * the visitor asks, so there is nothing to harvest from the listing payload.
 *
 * Once revealed it becomes a `tel:` link, which is what the button is for on a phone.
 */
export function RevealPhone({ listingId }: { listingId: string }) {
  const [phone, setPhone] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const reveal = async () => {
    setLoading(true);
    setError(null);
    try {
      setPhone(await revealPhone(listingId));
    } catch (e) {
      setError(errorMessageOf(e, 'לא הצלחנו להציג את המספר.'));
    } finally {
      setLoading(false);
    }
  };

  if (phone) {
    return (
      <a
        href={`tel:${phone.replace(/[^\d+]/g, '')}`}
        className="flex items-center justify-center gap-2 rounded-lg bg-slate-900 px-6 py-3 text-center text-lg font-semibold text-white"
      >
        <svg viewBox="0 0 24 24" className="h-5 w-5" fill="none" stroke="currentColor" strokeWidth="1.8" aria-hidden="true">
          <path d="M5 4h3l2 5-2 1a11 11 0 0 0 5 5l1-2 5 2v3a1 1 0 0 1-1 1A16 16 0 0 1 4 5a1 1 0 0 1 1-1z" strokeLinejoin="round" />
        </svg>
        {/* LTR so a number with a leading 0 or + is not reordered by the RTL page. */}
        <span dir="ltr">{phone}</span>
      </a>
    );
  }

  return (
    <div className="flex flex-col gap-1">
      <button
        type="button"
        onClick={() => void reveal()}
        disabled={loading}
        className="rounded-lg bg-slate-900 px-6 py-3 text-center font-medium text-white transition hover:bg-slate-800 disabled:opacity-50"
      >
        {loading ? 'טוען…' : 'הצגת מספר טלפון'}
      </button>
      {error && <p className="text-center text-xs text-red-700">{error}</p>}
    </div>
  );
}
