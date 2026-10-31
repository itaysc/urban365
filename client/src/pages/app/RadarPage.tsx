import { useState } from 'react';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { Link } from 'react-router-dom';
import { Check, RefreshCw, Sparkles, X } from 'lucide-react';
import { useAuth } from '@/auth/auth-context';
import { Button } from '@/components/ui/Button';
import { selectClass } from '@/components/ui/Field';
import { useToast } from '@/components/ui/Toast';
import { errorMessageOf } from '@/lib/apiError';
import { formatPrice } from '@/lib/format';
import { qk } from '@/queries/keys';
import {
  dismissSuggestion,
  fetchSuggestions,
  markSuggestionDone,
  refreshSuggestions,
  type Suggestion,
} from '@/services/suggestions';

const addressOf = (listing: NonNullable<Suggestion['listing']>): string => {
  const street = [listing.street, listing.houseNumber].filter(Boolean).join(' ');
  return [street, listing.city].filter(Boolean).join(', ') || 'נכס ללא כתובת';
};

/**
 * How sure the system is, as something an agent can read at a glance.
 *
 * A number out of a hundred invites an argument about why it is 70 and not 75. Three
 * bands say the only thing the score is actually good for: whether this is worth doing
 * before the others.
 */
function Strength({ score }: { score: number }) {
  const band = score >= 90 ? 'חזק' : score >= 70 ? 'טוב' : 'אפשרי';
  const tone =
    score >= 90 ? 'bg-green-50 text-green-800' : score >= 70 ? 'bg-blue-50 text-blue-800' : 'bg-slate-100 text-slate-600';

  return <span className={`rounded px-2 py-0.5 text-xs ${tone}`}>{band}</span>;
}

/**
 * The radar: what the system thinks is worth doing today.
 *
 * Every row carries the reason it appeared, because a recommendation an agent cannot
 * check is one they learn to scroll past. The matching behind it is ordinary SQL and
 * arithmetic — nothing here was written by a model, which is why the reason can be
 * trusted as a statement of fact rather than read as a suggestion about a suggestion.
 */
export function RadarPage() {
  const { user } = useAuth();
  const toast = useToast();
  const queryClient = useQueryClient();
  const isOwner = user?.agency?.role === 'owner' || user?.platformRole === 'admin';
  const [whose, setWhose] = useState('');

  const { data: suggestions, isPending } = useQuery({
    queryKey: qk.suggestions.list(whose),
    queryFn: () => fetchSuggestions(whose || undefined),
  });

  const invalidate = () => queryClient.invalidateQueries({ queryKey: qk.suggestions.all });

  const refresh = useMutation({
    mutationFn: refreshSuggestions,
    onSuccess: (result) => {
      void invalidate();
      // Nothing new is the common answer and a perfectly good one. Said plainly, so
      // nobody presses it a second time wondering whether it worked.
      toast.show(result.raised > 0 ? `נמצאו ${result.raised} התאמות חדשות.` : 'אין התאמות חדשות.');
    },
    onError: (e) => toast.error(errorMessageOf(e, 'לא הצלחנו לרענן.')),
  });

  const answer = useMutation({
    mutationFn: ({ id, done }: { id: string; done: boolean }) =>
      done ? markSuggestionDone(id) : dismissSuggestion(id),
    onSuccess: () => void invalidate(),
    onError: (e) => toast.error(errorMessageOf(e, 'לא הצלחנו לעדכן.')),
  });

  return (
    <div className="flex flex-col gap-5">
      <header className="flex flex-wrap items-center justify-between gap-3">
        <div>
          <h1 className="flex items-center gap-2 text-xl font-bold text-slate-900">
            <Sparkles className="h-5 w-5 text-blue-600" aria-hidden />
            הזדמנויות
          </h1>
          <p className="text-sm text-slate-500">
            {isPending ? 'טוען…' : `${suggestions?.length ?? 0} דברים ששווה לעשות`}
          </p>
        </div>

        <div className="flex items-center gap-3">
          {isOwner && (
            <select
              className={selectClass}
              value={whose}
              onChange={(e) => setWhose(e.target.value)}
              aria-label="הזדמנויות של"
            >
              <option value="">שלי</option>
              <option value="all">כל הצוות</option>
            </select>
          )}

          <Button variant="secondary" onClick={() => refresh.mutate()} disabled={refresh.isPending}>
            <RefreshCw className="h-4 w-4" aria-hidden />
            {refresh.isPending ? 'בודק…' : 'חיפוש התאמות'}
          </Button>
        </div>
      </header>

      {!isPending && (suggestions?.length ?? 0) === 0 && (
        <div className="flex flex-col items-center gap-2 rounded-xl border border-slate-200 bg-white p-8 text-center">
          <p className="text-sm text-slate-600">אין כרגע הזדמנויות פתוחות.</p>
          {/* The likeliest reason the list is empty, said once rather than left to be
              discovered: matching needs somebody to have written down what a customer
              wants. */}
          <p className="text-sm text-slate-400">
            התאמות נוצרות מהבקשות שרשומות בכרטיסי הלקוחות. כדאי למלא מה הם מחפשים.
          </p>
          <Link to="/app/customers" className="text-sm text-blue-700 hover:underline">
            לעמוד הלקוחות
          </Link>
        </div>
      )}

      <ul className="flex flex-col gap-3">
        {suggestions?.map((suggestion) => (
          <li
            key={suggestion.id}
            className="flex flex-wrap items-start justify-between gap-4 rounded-xl border border-slate-200 bg-white p-4"
          >
            <div className="min-w-0 flex-1">
              <p className="flex flex-wrap items-center gap-2 font-semibold text-slate-900">
                {suggestion.customer?.name ?? 'לקוח'}
                <Strength score={suggestion.score} />
                {/* Only on the team view: your own name on every row is noise. */}
                {whose !== '' && suggestion.owner && (
                  <span className="rounded bg-slate-100 px-2 py-0.5 text-xs font-normal text-slate-600">
                    {suggestion.owner.firstName} {suggestion.owner.lastName}
                  </span>
                )}
              </p>

              {suggestion.listing && (
                <p className="mt-1 text-sm text-slate-700">
                  <Link
                    to={`/app/listings/${suggestion.listing.id}`}
                    className="font-medium text-blue-700 hover:underline"
                  >
                    {addressOf(suggestion.listing)}
                  </Link>
                  {suggestion.listing.price !== null && (
                    <span className="text-slate-500"> · {formatPrice(suggestion.listing.price)}</span>
                  )}
                </p>
              )}

              {/* The evidence, not a restatement of the headline. */}
              <p className="mt-1 text-sm text-slate-500">{suggestion.reason}</p>

              {suggestion.customer?.phone && (
                <a
                  href={`tel:${suggestion.customer.phone}`}
                  dir="ltr"
                  className="mt-1 inline-block text-sm text-slate-500 hover:text-slate-900"
                >
                  {suggestion.customer.phone}
                </a>
              )}
            </div>

            <div className="flex shrink-0 items-center gap-3 text-sm">
              <button
                type="button"
                onClick={() => answer.mutate({ id: suggestion.id, done: true })}
                disabled={answer.isPending}
                className="flex items-center gap-1 text-blue-700 hover:underline disabled:opacity-50"
              >
                <Check className="h-4 w-4" aria-hidden />
                טיפלתי
              </button>
              <button
                type="button"
                onClick={() => answer.mutate({ id: suggestion.id, done: false })}
                disabled={answer.isPending}
                className="flex items-center gap-1 text-slate-400 hover:text-slate-700 disabled:opacity-50"
              >
                <X className="h-4 w-4" aria-hidden />
                לא רלוונטי
              </button>
            </div>
          </li>
        ))}
      </ul>
    </div>
  );
}
