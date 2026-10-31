import { useState } from 'react';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { useParams } from 'react-router-dom';
import { Calendar, Check, Home, Phone, X } from 'lucide-react';
import { Button } from '@/components/ui/Button';
import { inputClass } from '@/components/ui/Field';
import { errorMessageOf } from '@/lib/apiError';
import { fetchSellerViewing, respondAsSeller } from '@/services/calendar';

const when = (iso: string) =>
  new Date(iso).toLocaleString('he-IL', {
    weekday: 'long',
    day: 'numeric',
    month: 'long',
    hour: '2-digit',
    minute: '2-digit',
  });

/**
 * Where the link in a coordination email lands: the seller's side of a viewing.
 *
 * The buyer's page answers "are you coming?". This one answers "may we come?", which
 * is a different question and reads differently — nothing here is presented as already
 * decided, because for the person who has to be out of the house by four it is not.
 *
 * It shows their own address and the time. Not the buyer's name: the seller has no use
 * for it before the viewing happens, and a link that leaks who is coming to see a flat
 * is a link worth guessing at.
 */
export function SellerViewingPage() {
  const { token = '' } = useParams();
  const queryClient = useQueryClient();
  const [note, setNote] = useState('');
  const [touched, setTouched] = useState(false);

  const key = ['seller-viewing', token];

  const { data, isPending, error } = useQuery({
    queryKey: key,
    queryFn: () => fetchSellerViewing(token),
    retry: false,
  });

  const respond = useMutation({
    mutationFn: (confirmed: boolean) => respondAsSeller(token, confirmed, note),
    onSuccess: () => queryClient.invalidateQueries({ queryKey: key }),
  });

  // What they wrote last time, until they start typing over it. Without this, somebody
  // who answered yesterday comes back to an empty box beside their own answer.
  const text = touched ? note : (data?.note ?? '');

  return (
    <div className="flex min-h-screen items-center justify-center bg-slate-50 p-4">
      <div className="w-full max-w-md rounded-2xl border border-slate-200 bg-white p-6 shadow-sm">
        <p className="mb-4 text-center text-xl font-extrabold tracking-tight text-blue-700">
          Urban<span className="text-blue-500">365</span>
        </p>

        {isPending && <p className="text-center text-sm text-slate-500">טוען…</p>}

        {error && (
          <p className="text-center text-sm text-slate-600">
            הקישור אינו תקף. אם הביקור עדיין רלוונטי, אפשר ליצור קשר עם הסוכנות.
          </p>
        )}

        {data && (
          <>
            <h1 className="text-lg font-bold text-slate-900">
              {data.firstName ? `שלום ${data.firstName},` : 'שלום,'}
            </h1>
            <p className="mt-1 text-sm text-slate-600">
              {data.agencyName} מבקשים להביא מתעניין לביקור בנכס שלך.
            </p>

            <dl className="mt-4 flex flex-col gap-2 rounded-xl bg-slate-50 p-4 text-sm">
              <div className="flex items-center gap-2 text-slate-800">
                <Calendar className="h-4 w-4 shrink-0 text-slate-400" aria-hidden />
                <span>{when(data.startsAt)}</span>
              </div>
              {data.address && (
                <div className="flex items-center gap-2 text-slate-800">
                  <Home className="h-4 w-4 shrink-0 text-slate-400" aria-hidden />
                  <span>{data.address}</span>
                </div>
              )}
              {data.agencyPhone && (
                <div className="flex items-center gap-2 text-slate-800">
                  <Phone className="h-4 w-4 shrink-0 text-slate-400" aria-hidden />
                  <a href={`tel:${data.agencyPhone}`} dir="ltr" className="hover:underline">
                    {data.agencyPhone}
                  </a>
                </div>
              )}
            </dl>

            {data.cancelled ? (
              <p className="mt-4 rounded-lg bg-amber-50 px-3 py-2 text-sm text-amber-900">
                הביקור בוטל על ידי הסוכנות.
              </p>
            ) : (
              <>
                {data.response !== 'pending' && (
                  <p
                    className={`mt-4 rounded-lg px-3 py-2 text-sm ${
                      data.response === 'confirmed'
                        ? 'bg-green-50 text-green-800'
                        : 'bg-slate-100 text-slate-700'
                    }`}
                  >
                    {data.response === 'confirmed'
                      ? 'אישרת את המועד. הסוכנות עודכנה.'
                      : 'אמרת שהמועד לא מתאים. הסוכנות עודכנה.'}
                  </p>
                )}

                {/* Asked before the buttons rather than after, because the useful half
                    of "no" is when instead — and nobody comes back to add it. */}
                <label className="mt-4 block text-sm text-slate-700" htmlFor="seller-note">
                  משהו שכדאי שידעו? (לא חובה)
                </label>
                <textarea
                  id="seller-note"
                  rows={2}
                  className={`${inputClass} mt-1`}
                  value={text}
                  onChange={(e) => {
                    setTouched(true);
                    setNote(e.target.value);
                  }}
                  placeholder="למשל: לא לפני 17:00, או קוד לשער 1234"
                />

                <div className="mt-4 flex gap-3">
                  <Button
                    onClick={() => respond.mutate(true)}
                    disabled={respond.isPending}
                  >
                    <Check className="h-4 w-4" aria-hidden />
                    המועד מתאים
                  </Button>
                  <Button
                    variant="secondary"
                    onClick={() => respond.mutate(false)}
                    disabled={respond.isPending}
                  >
                    <X className="h-4 w-4" aria-hidden />
                    לא מתאים
                  </Button>
                </div>

                <p className="mt-3 text-xs text-slate-400">
                  אפשר לשנות את התשובה כאן בכל זמן עד הביקור.
                </p>
              </>
            )}

            {respond.isError && (
              <p className="mt-3 rounded-lg bg-red-50 px-3 py-2 text-sm text-red-800">
                {errorMessageOf(respond.error, 'לא הצלחנו לשמור את התשובה.')}
              </p>
            )}
          </>
        )}
      </div>
    </div>
  );
}
