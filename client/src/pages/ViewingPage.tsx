import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { useParams } from 'react-router-dom';
import { Calendar, Check, MapPin, Phone, X } from 'lucide-react';
import { Button } from '@/components/ui/Button';
import { errorMessageOf } from '@/lib/apiError';
import { fetchViewing, respondToViewing } from '@/services/calendar';

const when = (iso: string) =>
  new Date(iso).toLocaleString('he-IL', {
    weekday: 'long',
    day: 'numeric',
    month: 'long',
    hour: '2-digit',
    minute: '2-digit',
  });

/**
 * Where the link in a viewing email lands.
 *
 * No account, no header, no navigation: whoever opens this has never signed in and is
 * here to answer one question. The token in the url is the whole of the authorisation,
 * so the page shows a time, a place and a first name — enough to recognise the
 * appointment, not enough to be worth guessing at.
 */
export function ViewingPage() {
  const { token = '' } = useParams();
  const queryClient = useQueryClient();

  const key = ['viewing', token];

  const { data, isPending, error } = useQuery({
    queryKey: key,
    queryFn: () => fetchViewing(token),
    retry: false,
  });

  const respond = useMutation({
    mutationFn: (confirmed: boolean) => respondToViewing(token, confirmed),
    onSuccess: () => queryClient.invalidateQueries({ queryKey: key }),
  });

  return (
    <div className="flex min-h-screen items-center justify-center bg-slate-50 p-4">
      <div className="w-full max-w-md rounded-2xl border border-slate-200 bg-white p-6 shadow-sm">
        <p className="mb-4 text-center text-xl font-extrabold tracking-tight text-blue-700">
          Urban<span className="text-blue-500">365</span>
        </p>

        {isPending && <p className="text-center text-sm text-slate-500">טוען…</p>}

        {error && (
          <p className="text-center text-sm text-slate-600">
            הקישור אינו תקף. אם הפגישה עדיין רלוונטית, אפשר ליצור קשר עם הסוכנות.
          </p>
        )}

        {data && (
          <>
            <h1 className="text-lg font-bold text-slate-900">
              {data.firstName ? `שלום ${data.firstName},` : 'שלום,'}
            </h1>
            <p className="mt-1 text-sm text-slate-600">
              {data.agencyName} קבעו איתך פגישה.
            </p>

            <dl className="mt-4 flex flex-col gap-2 rounded-xl bg-slate-50 p-4 text-sm">
              <div className="flex items-center gap-2 text-slate-800">
                <Calendar className="h-4 w-4 shrink-0 text-slate-400" aria-hidden />
                <span>{when(data.startsAt)}</span>
              </div>
              {data.location && (
                <div className="flex items-center gap-2 text-slate-800">
                  <MapPin className="h-4 w-4 shrink-0 text-slate-400" aria-hidden />
                  <span>{data.location}</span>
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
                הפגישה בוטלה על ידי הסוכנות.
              </p>
            ) : (
              <>
                {/* The current answer is stated before the buttons, so somebody who
                    already replied is not left wondering whether it registered. */}
                {data.response !== 'pending' && (
                  <p
                    className={`mt-4 rounded-lg px-3 py-2 text-sm ${
                      data.response === 'confirmed'
                        ? 'bg-green-50 text-green-800'
                        : 'bg-slate-100 text-slate-700'
                    }`}
                  >
                    {data.response === 'confirmed'
                      ? 'אישרת את הפגישה. נתראה!'
                      : 'ביטלת את הפגישה. הסוכנות עודכנה.'}
                  </p>
                )}

                <div className="mt-4 flex gap-3">
                  <Button
                    onClick={() => respond.mutate(true)}
                    disabled={respond.isPending || data.response === 'confirmed'}
                  >
                    <Check className="h-4 w-4" aria-hidden />
                    מאשר/ת
                  </Button>
                  <Button
                    variant="secondary"
                    onClick={() => respond.mutate(false)}
                    disabled={respond.isPending || data.response === 'declined'}
                  >
                    <X className="h-4 w-4" aria-hidden />
                    לא אוכל להגיע
                  </Button>
                </div>

                {/* Changing your mind is normal, and ringing to do it is friction. */}
                <p className="mt-3 text-xs text-slate-400">
                  אפשר לשנות את התשובה כאן בכל זמן עד הפגישה.
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
