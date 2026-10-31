import { useState } from 'react';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { Link } from 'react-router-dom';
import { Check, RefreshCw, Sparkles, X } from 'lucide-react';
import { useAuth } from '@/auth/auth-context';
import { MessageDraft } from '@/components/agency/MessageDraft';
import { Button } from '@/components/ui/Button';
import { selectClass } from '@/components/ui/Field';
import { useToast } from '@/components/ui/Toast';
import { errorMessageOf } from '@/lib/apiError';
import { formatPrice } from '@/lib/format';
import { KIND_HINT, KIND_LABEL, KIND_ORDER } from '@/lib/suggestionKind';
import { qk } from '@/queries/keys';
import {
  dismissSuggestion,
  draftSuggestionMessage,
  fetchSuggestions,
  markSuggestionDone,
  refreshSuggestions,
  saveSuggestionDraft,
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

  /**
   * Grouped by kind, in `KIND_ORDER` rather than by score.
   *
   * A viewing tomorrow that nobody has confirmed outranks a very strong match, because
   * one has a deadline this week and the other is still true on Friday. One list sorted
   * by score alone mixes them and loses that. Within a section the server's order
   * stands, which is strongest first.
   */
  const sections = KIND_ORDER.map((kind) => ({
    kind,
    rows: (suggestions ?? []).filter((s) => s.kind === kind),
  })).filter((section) => section.rows.length > 0);

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

  const write = useMutation({
    mutationFn: (id: string) => draftSuggestionMessage(id),
    onSuccess: () => void invalidate(),
    onError: (e) => toast.error(errorMessageOf(e, 'לא הצלחנו לכתוב טיוטה.')),
  });

  const keep = useMutation({
    mutationFn: ({ id, draft }: { id: string; draft: string }) => saveSuggestionDraft(id, draft),
    onSuccess: () => void invalidate(),
    onError: (e) => toast.error(errorMessageOf(e, 'לא הצלחנו לשמור את ההודעה.')),
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

      {sections.map((section) => (
        <section key={section.kind} className="flex flex-col gap-3">
          <div>
            <h2 className="text-sm font-semibold text-slate-900">
              {KIND_LABEL[section.kind]} ({section.rows.length})
            </h2>
            <p className="text-xs text-slate-500">{KIND_HINT[section.kind]}</p>
          </div>

          <ul className="flex flex-col gap-3">
        {section.rows.map((suggestion) => (
          <li
            key={suggestion.id}
            className="flex flex-wrap items-start justify-between gap-4 rounded-xl border border-slate-200 bg-white p-4"
          >
            <div className="min-w-0 flex-1">
              <p className="flex flex-wrap items-center gap-2 font-semibold text-slate-900">
                {/* Who this is about. A match and a quiet enquiry are about a person; a
                    listing nobody asks about is about the property, and its address is
                    on the next line rather than repeated here. */}
                {suggestion.customer?.name ?? suggestion.lead?.name ?? 'הנכס'}
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

              {/* Where to go to do something about it. One link per kind: a row that
                  tells you about a problem and leaves you to find it is half a row. */}
              {suggestion.meeting && (
                <Link
                  to={`/app/calendar?day=${suggestion.meeting.startsAt.slice(0, 10)}`}
                  className="mt-1 inline-block text-sm text-blue-700 hover:underline"
                >
                  ליומן
                </Link>
              )}
              {suggestion.lead && (
                <Link to="/app/leads" className="mt-1 inline-block text-sm text-blue-700 hover:underline">
                  לפניות
                </Link>
              )}

              {(suggestion.customer?.phone || suggestion.lead?.phone) && (
                <a
                  href={`tel:${suggestion.customer?.phone ?? suggestion.lead?.phone}`}
                  dir="ltr"
                  className="mt-1 inline-block text-sm text-slate-500 hover:text-slate-900 ms-3"
                >
                  {suggestion.customer?.phone ?? suggestion.lead?.phone}
                </a>
              )}

              {/* Only for a match. "Your listing is getting no enquiries" is a
                  conversation with the seller, not a message we can write for you. */}
              {suggestion.kind === 'new_match' && (
                <MessageDraft
                  draft={suggestion.draft}
                  phone={suggestion.customer?.phone ?? null}
                  busy={write.isPending && write.variables === suggestion.id}
                  onWrite={() => write.mutate(suggestion.id)}
                  onSave={(draft) => keep.mutate({ id: suggestion.id, draft })}
                />
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
        </section>
      ))}
    </div>
  );
}
