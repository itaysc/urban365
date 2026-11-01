import { useState } from 'react';
import { useMutation, useQueryClient } from '@tanstack/react-query';
import { Handshake } from 'lucide-react';
import { Button } from '@/components/ui/Button';
import { inputClass } from '@/components/ui/Field';
import { useToast } from '@/components/ui/Toast';
import { errorMessageOf } from '@/lib/apiError';
import { qk } from '@/queries/keys';
import { requestCoBrokerage } from '@/services/cobrokerage';

interface Props {
  listingId: string;
  customerId: string;
  /** So the agent can see whose deal they are about to share before they share it. */
  customerName: string;
}

/** The usual arrangement, and the only one worth defaulting to. */
const DEFAULT_SPLIT = 50;

/**
 * Offering another agency a deal.
 *
 * The one thing this screen must make obvious is what leaves the building. An agent
 * clicking a button labelled "co-brokerage" deserves to know, before they click it,
 * that their customer's name stays here and their requirements do not — so it says so,
 * next to the button, rather than in a help page nobody opens.
 */
export function CoBrokerageOffer({ listingId, customerId, customerName }: Props) {
  const toast = useToast();
  const queryClient = useQueryClient();
  const [open, setOpen] = useState(false);
  const [message, setMessage] = useState('');
  const [split, setSplit] = useState(DEFAULT_SPLIT);

  const send = useMutation({
    mutationFn: () => requestCoBrokerage({ listingId, customerId, message, commissionSplit: split }),
    onSuccess: () => {
      void queryClient.invalidateQueries({ queryKey: qk.cobrokerage.all });
      void queryClient.invalidateQueries({ queryKey: qk.suggestions.all });
      setOpen(false);
      toast.success('הבקשה נשלחה לסוכנות.');
    },
    onError: (e) => toast.error(errorMessageOf(e, 'לא הצלחנו לשלוח את הבקשה.')),
  });

  if (!open) {
    return (
      <button
        type="button"
        onClick={() => setOpen(true)}
        className="mt-2 flex items-center gap-1 text-sm text-blue-700 hover:underline"
      >
        <Handshake className="h-3.5 w-3.5" aria-hidden />
        הצעת שיתוף פעולה
      </button>
    );
  }

  return (
    <div className="mt-2 flex flex-col gap-3 rounded-lg bg-slate-50 p-3">
      <p className="text-sm text-slate-700">
        הצעה לסוכנות שמחזיקה בנכס, עבור <strong>{customerName}</strong>.
      </p>

      {/* Said before they send, not after. */}
      <p className="rounded bg-white px-3 py-2 text-xs text-slate-600">
        הסוכנות השנייה תראה מה הלקוח מחפש, את שם הסוכנות שלכם ואת ההודעה שתכתבו. היא
        לא תראה את שם הלקוח, את הטלפון שלו ולא את התקציב.
      </p>

      <label className="text-sm text-slate-700" htmlFor={`cobroke-message-${listingId}`}>
        הודעה לסוכנות (לא חובה)
      </label>
      <textarea
        id={`cobroke-message-${listingId}`}
        rows={2}
        className={inputClass}
        value={message}
        onChange={(e) => setMessage(e.target.value)}
        placeholder="למשל: הלקוח שלי ראה כבר שלושה נכסים באזור, רציני ומוכן לסגור החודש."
      />

      <label className="text-sm text-slate-700" htmlFor={`cobroke-split-${listingId}`}>
        חלוקת עמלה — החלק שלנו
      </label>
      <div className="flex items-center gap-3">
        <input
          id={`cobroke-split-${listingId}`}
          type="number"
          min={10}
          max={90}
          step={5}
          dir="ltr"
          className={`${inputClass} w-24`}
          value={split}
          onChange={(e) => setSplit(Number(e.target.value))}
        />
        <span className="text-sm text-slate-500">% — להם {100 - split}%</span>
      </div>

      {/* It is a record of what was said, and saying otherwise would be worse than
          saying nothing. */}
      <p className="text-xs text-slate-400">
        החלוקה נרשמת כאן כתיעוד של מה שסוכם, ואינה הסכם משפטי.
      </p>

      <div className="flex items-center gap-3">
        <Button disabled={send.isPending} onClick={() => send.mutate()}>
          {send.isPending ? 'שולח…' : 'שליחת ההצעה'}
        </Button>
        <button
          type="button"
          onClick={() => setOpen(false)}
          className="text-sm text-slate-500 hover:text-slate-900"
        >
          ביטול
        </button>
      </div>
    </div>
  );
}
