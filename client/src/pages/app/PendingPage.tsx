import { useState } from 'react';
import { Navigate } from 'react-router-dom';
import { useAuth } from '@/auth/auth-context';
import { AgencyPicker } from '@/components/auth/AgencyPicker';
import { Button } from '@/components/ui/Button';
import { Field, inputClass } from '@/components/ui/Field';
import { PhoneField } from '@/components/ui/PhoneField';
import { errorMessageOf } from '@/lib/apiError';
import { resubmitAgency, type AgencyLookupResult } from '@/services/auth';
import type { AuthUser } from '@/types/auth';

/**
 * Where `RequireAuth({ requireAgency })` sends a user whose membership is not active
 * yet. A request still in the queue waits here. One that was turned down can correct
 * the agency and send it again, or ask for a different office.
 */
export function PendingPage() {
  const { user, recheck, refresh } = useAuth();

  // No agency at all is not "waiting for approval", it is "never asked" — which is
  // where a Google sign-in from the agency pages leaves someone, since no agency name
  // survives the redirect. Telling them a request is being reviewed would be a lie they
  // could wait on for a long time.
  if (user && !user.agency) return <Navigate to="/agency/claim" replace />;

  if (user?.agency && user.agency.resubmit !== 'waiting' && user.agency.resubmit !== 'closed') {
    return <Declined agency={user.agency} onSent={() => refresh()} />;
  }

  return (
    <div className="mx-auto max-w-lg rounded-xl border border-slate-200 bg-white p-6 text-center">
      <h1 className="text-lg font-bold text-slate-900">החשבון ממתין לאישור</h1>
      <p className="mt-2 text-sm text-slate-600">
        {user?.agency
          ? `הבקשה שלך לנהל את ${user.agency.name} נשלחה לבדיקה. נעדכן אותך באימייל ברגע שהיא תאושר.`
          : 'הבקשה שלך נשלחה לבדיקה. נעדכן אותך באימייל ברגע שהיא תאושר.'}
      </p>
      <Button variant="secondary" className="mt-5" onClick={() => void recheck()}>
        בדוק שוב
      </Button>
    </div>
  );
}

function Declined({
  agency,
  onSent,
}: {
  agency: NonNullable<AuthUser['agency']>;
  onSent: () => Promise<void>;
}) {
  const [name, setName] = useState(agency?.name ?? '');
  const [phone, setPhone] = useState(agency?.phone ?? '');
  const [contactEmail, setContactEmail] = useState(agency?.contactEmail ?? '');
  const [description, setDescription] = useState(agency?.description ?? '');
  const [claimed, setClaimed] = useState<AgencyLookupResult | null>(null);
  const [otherName, setOtherName] = useState('');
  const [error, setError] = useState<string | null>(null);
  const [submitting, setSubmitting] = useState(false);

  const send = async (mode: 'revise' | 'reask' | 'switch') => {
    setError(null);
    if (mode === 'revise' && name.trim() === '') {
      setError('צריך שם לסוכנות.');
      return;
    }
    if (mode === 'switch' && !claimed && otherName.trim() === '') {
      setError('צריך לבחור סוכנות קיימת או להזין שם סוכנות חדשה.');
      return;
    }

    setSubmitting(true);
    try {
      await resubmitAgency(
        mode === 'revise'
          ? {
              mode,
              agencyName: name.trim(),
              phone: phone.trim() || undefined,
              contactEmail: contactEmail.trim() || undefined,
              description: description.trim() || undefined,
            }
          : mode === 'reask'
            ? { mode }
            : {
                mode,
                claimAgencyId: claimed?.id,
                agencyName: claimed ? undefined : otherName.trim(),
              },
      );
      await onSent();
    } catch (err) {
      setError(errorMessageOf(err, 'לא הצלחנו לשלוח את הבקשה.'));
      setSubmitting(false);
    }
  };

  return (
    <div className="mx-auto flex max-w-lg flex-col gap-4 rounded-xl border border-slate-200 bg-white p-6">
      <div>
        <h1 className="text-lg font-bold text-slate-900">הבקשה לא אושרה</h1>
        <p className="mt-2 text-sm text-slate-600">
          הבקשה לנהל את {agency.name} לא אושרה.
          {agency.rejectionReason ? ` ${agency.rejectionReason}` : ''}
        </p>
      </div>

      {agency.resubmit === 'revise' && (
        <form
          className="flex flex-col gap-4"
          onSubmit={(e) => {
            e.preventDefault();
            void send('revise');
          }}
        >
          <p className="text-sm text-slate-600">אפשר לעדכן את הפרטים ולשלוח את הבקשה שוב.</p>
          <Field label="שם הסוכנות" htmlFor="resubmit-name" required>
            <input
              id="resubmit-name"
              className={inputClass}
              value={name}
              onChange={(e) => setName(e.target.value)}
            />
          </Field>
          <Field label="טלפון" htmlFor="resubmit-phone">
            <PhoneField id="resubmit-phone" value={phone} onChange={setPhone} />
          </Field>
          <Field label="אימייל ליצירת קשר" htmlFor="resubmit-email">
            <input
              id="resubmit-email"
              type="email"
              dir="ltr"
              className={inputClass}
              value={contactEmail}
              onChange={(e) => setContactEmail(e.target.value)}
            />
          </Field>
          <Field label="תיאור" htmlFor="resubmit-description">
            <textarea
              id="resubmit-description"
              rows={4}
              className={inputClass}
              value={description}
              onChange={(e) => setDescription(e.target.value)}
              placeholder="באילו אזורים אתם פועלים, במה אתם מתמחים."
            />
          </Field>
          <Button type="submit" disabled={submitting}>
            {submitting ? 'שולח…' : 'שליחה מחדש'}
          </Button>
        </form>
      )}

      {agency.resubmit === 'reask' && (
        <div>
          <Button disabled={submitting} onClick={() => void send('reask')}>
            {submitting ? 'שולח…' : `שליחה מחדש עבור ${agency.name}`}
          </Button>
        </div>
      )}

      <div className="flex flex-col gap-4 border-t border-slate-100 pt-4">
        <p className="text-sm text-slate-600">
          {agency.resubmit === 'switch' ? 'אפשר לבקש סוכנות אחרת.' : 'או לבקש סוכנות אחרת.'}
        </p>
        <AgencyPicker
          claimed={claimed}
          onClaimedChange={setClaimed}
          agencyName={otherName}
          onAgencyNameChange={setOtherName}
        />
        <Button variant="secondary" disabled={submitting} onClick={() => void send('switch')}>
          {submitting ? 'שולח…' : 'שליחת בקשה לסוכנות אחרת'}
        </Button>
      </div>

      {error && <p className="rounded-lg bg-red-50 px-3 py-2 text-sm text-red-800">{error}</p>}
    </div>
  );
}
