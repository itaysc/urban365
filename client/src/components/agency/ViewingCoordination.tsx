import { MailCheck } from 'lucide-react';
import {
  BUYER_RESPONSE_LABEL,
  RESPONSE_CLASS,
  SELLER_RESPONSE_LABEL,
} from '@/lib/coordination';
import type { AttendeeResponse, Meeting } from '@/services/calendar';

interface SideProps {
  who: string;
  response: AttendeeResponse;
  /** This side's words for yes and no. */
  labels: Record<Exclude<AttendeeResponse, 'pending'>, string>;
  /** When they were asked. Null means nobody has, which is not the same as no answer. */
  askedAt: string | null;
  /** Null when there is nobody to ask, with the reason in `missing`. */
  onAsk: (() => void) | null;
  missing?: string;
  busy: boolean;
}

function Side({ who, response, labels, askedAt, onAsk, missing, busy }: SideProps) {
  const state =
    response !== 'pending' ? labels[response] : askedAt ? 'ממתין לתשובה' : 'טרם נשאל';

  return (
    <div className="flex min-w-0 flex-1 flex-wrap items-center gap-2">
      <span className="text-slate-500">{who}</span>
      <span className={`rounded px-2 py-0.5 text-xs ${RESPONSE_CLASS[response]}`}>{state}</span>

      {onAsk ? (
        <button
          type="button"
          onClick={onAsk}
          disabled={busy}
          className="flex items-center gap-1 text-blue-700 hover:underline disabled:opacity-50"
        >
          <MailCheck className="h-3.5 w-3.5" aria-hidden />
          {askedAt ? 'שליחה מחדש' : 'בקשת אישור'}
        </button>
      ) : (
        // Why the button is not there, rather than no button and no explanation.
        missing && <span className="text-xs text-slate-500">{missing}</span>
      )}
    </div>
  );
}

interface Props {
  meeting: Meeting;
  onAskBuyer: () => void;
  onAskSeller: () => void;
  busy: boolean;
}

/**
 * The two people who both have to agree before a viewing is real.
 *
 * Kept as one strip rather than two chips in different places: an agent's actual
 * question is "is this viewing on?", and the answer is the pair. "The buyer confirmed
 * and the owner has not been asked" is the state that most often turns into somebody
 * standing outside a locked door, and it only reads as a problem when both halves are
 * side by side.
 */
export function ViewingCoordination({ meeting, onAskBuyer, onAskSeller, busy }: Props) {
  // A meeting with neither is an internal one — a team catch-up needs no coordinating.
  if (!meeting.customerId && !meeting.listingId) return null;

  const seller = meeting.listing?.sellerCustomer;

  return (
    <div className="mt-2 flex flex-col gap-1 rounded-lg bg-slate-50 px-3 py-2 text-sm">
      <div className="flex flex-wrap items-center gap-x-6 gap-y-1">
        <Side
          who="הלקוח"
          response={meeting.attendeeResponse}
          labels={BUYER_RESPONSE_LABEL}
          askedAt={meeting.confirmationSentAt}
          onAsk={meeting.customerId ? onAskBuyer : null}
          missing="אין לקוח משויך"
          busy={busy}
        />

        {/* Only for a viewing. A meeting at the office has no owner to ask. */}
        {meeting.listingId && (
          <Side
            who={seller ? `בעל הנכס · ${seller.name}` : 'בעל הנכס'}
            response={meeting.sellerResponse}
            labels={SELLER_RESPONSE_LABEL}
            askedAt={meeting.sellerAskedAt}
            // A private seller's listing has no CRM record, and is still askable — the
            // server finds them through the account that published it.
            onAsk={seller || meeting.listing?.ownerUserId ? onAskSeller : null}
            missing="לא רשום בעל נכס"
            busy={busy}
          />
        )}
      </div>

      {/* The one line that saves a phone call, so it is not hidden behind anything. */}
      {meeting.sellerNote && (
        <p className="text-slate-600">
          <span className="text-slate-500">בעל הנכס: </span>
          {meeting.sellerNote}
        </p>
      )}
    </div>
  );
}
