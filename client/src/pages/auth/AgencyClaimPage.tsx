import { useState } from 'react';
import { Navigate, useNavigate } from 'react-router-dom';
import { useAuth } from '@/auth/auth-context';
import { AgencyPicker } from '@/components/auth/AgencyPicker';
import { TermsCheckbox } from '@/components/auth/TermsCheckbox';
import { Button } from '@/components/ui/Button';
import { Field } from '@/components/ui/Field';
import { errorMessageOf } from '@/lib/apiError';
import { AuthLayout } from '@/pages/auth/AuthLayout';
import { attachAgency, type AgencyLookupResult } from '@/services/auth';
import { PhoneField } from '@/components/ui/PhoneField';
import type { AgencyVertical } from '@/types/auth';

/**
 * The second half of an agency signup that began with Google.
 *
 * Google hands back a name, an address and a picture, and nothing else can survive the
 * redirect — so the account arrives without an agency and this is where it gets one.
 * Reached after a Google sign-up, and from the waiting page for anyone signed in with
 * no agency at all.
 */
export function AgencyClaimPage() {
  const { user, loading, refresh } = useAuth();
  const navigate = useNavigate();

  const [claimed, setClaimed] = useState<AgencyLookupResult | null>(null);
  const [agencyName, setAgencyName] = useState('');
  const [vertical, setVertical] = useState<AgencyVertical>('real_estate');
  const [phone, setPhone] = useState('');
  const [acceptedTerms, setAcceptedTerms] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [submitting, setSubmitting] = useState(false);

  // Already has one, pending or active: there is nothing to do here, and the waiting
  // page is the honest answer for both.
  if (!loading && user && user.agency) return <Navigate to="/app/pending" replace />;

  const submit = async (e: React.FormEvent) => {
    e.preventDefault();
    setError(null);

    if (!claimed && agencyName.trim() === '') {
      setError('צריך לבחור סוכנות קיימת או להזין שם סוכנות חדשה.');
      return;
    }

    setSubmitting(true);
    try {
      await attachAgency({
        claimAgencyId: claimed?.id,
        agencyName: claimed ? undefined : agencyName.trim(),
        vertical: claimed ? undefined : vertical,
        phone: phone.trim() || undefined,
        acceptedTerms,
      });
      // The session's user carries the membership, and the waiting page reads it.
      await refresh();
      navigate('/app/pending', { replace: true });
    } catch (err) {
      setError(errorMessageOf(err, 'לא הצלחנו לשייך את הסוכנות.'));
      setSubmitting(false);
    }
  };

  return (
    <AuthLayout title="פרטי הסוכנות" subtitle="עוד שלב אחד, ואפשר להתחיל">
      <p className="mb-4 rounded-lg bg-slate-50 px-3 py-2 text-sm text-slate-600">
        נכנסתם כ־{user?.email}. נשאר רק לומר לאיזו סוכנות.
      </p>

      <form onSubmit={submit} className="flex flex-col gap-4">
        <AgencyPicker
          claimed={claimed}
          onClaimedChange={setClaimed}
          agencyName={agencyName}
          onAgencyNameChange={setAgencyName}
          vertical={vertical}
          onVerticalChange={setVertical}
        />

        <Field label="טלפון" htmlFor="phone">
          <PhoneField
            id="phone"
            value={phone}
            onChange={setPhone}
            placeholder={user?.phone ?? '050-0000000'}
          />
        </Field>

        <TermsCheckbox
          id="claim-terms"
          checked={acceptedTerms}
          onChange={setAcceptedTerms}
        />

        {error && <p className="rounded-lg bg-red-50 px-3 py-2 text-sm text-red-800">{error}</p>}

        <Button type="submit" disabled={submitting || !acceptedTerms}>
          {submitting ? 'שולח…' : 'שליחת הבקשה'}
        </Button>

        <p className="text-center text-xs text-slate-500">
          הבקשה עוברת לאישור שלנו. עד אז אפשר להשתמש בחשבון כרגיל.
        </p>
      </form>
    </AuthLayout>
  );
}
