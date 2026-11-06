import { useState } from 'react';
import { Button } from '@/components/ui/Button';
import { Field, inputClass, selectClass } from '@/components/ui/Field';
import { PhoneField } from '@/components/ui/PhoneField';
import { errorMessageOf } from '@/lib/apiError';
import { ENQUIRY_REASONS, submitAgencyEnquiry, type EnquiryReason } from '@/services/publicAgencies';

/**
 * The contact form on an agency's public page.
 *
 * It lands in that agency's פניות inbox. The agency is the one in the URL, read
 * again on the server — nothing here says which agency the lead belongs to.
 */
export function AgencyEnquiryForm({ agencyKey }: { agencyKey: string }) {
  const [form, setForm] = useState({ name: '', phone: '', email: '', message: '', reason: '' });
  const [state, setState] = useState<'idle' | 'sending' | 'sent'>('idle');
  const [error, setError] = useState<string | null>(null);

  const set = (key: keyof typeof form, value: string) => setForm((current) => ({ ...current, [key]: value }));
  const reachable = form.phone.trim() !== '' || form.email.trim() !== '';

  const submit = async () => {
    setState('sending');
    setError(null);

    try {
      await submitAgencyEnquiry(agencyKey, {
        name: form.name.trim(),
        phone: form.phone.trim() || undefined,
        email: form.email.trim() || undefined,
        message: form.message.trim() || undefined,
        reason: (ENQUIRY_REASONS as readonly string[]).includes(form.reason)
          ? (form.reason as EnquiryReason)
          : undefined,
      });
      setState('sent');
    } catch (e) {
      setError(errorMessageOf(e, 'השליחה נכשלה. נסו שוב.'));
      setState('idle');
    }
  };

  if (state === 'sent') {
    return (
      <div className="rounded-xl border border-green-200 bg-green-50 p-4 text-center text-sm text-green-800">
        הפנייה נשלחה. הסוכנות תחזור אליכם.
      </div>
    );
  }

  return (
    <form
      className="flex flex-col gap-3 rounded-xl border border-slate-200 bg-white p-4 shadow-sm"
      onSubmit={(e) => {
        e.preventDefault();
        void submit();
      }}
    >
      <h2 className="text-base font-semibold text-slate-900">יצירת קשר</h2>
      {error && <p className="text-xs text-red-700">{error}</p>}

      <Field label="סיבת פנייה" htmlFor="agency-enquiry-reason">
        <select
          id="agency-enquiry-reason"
          className={selectClass}
          value={form.reason}
          onChange={(e) => set('reason', e.target.value)}
        >
          <option value="">בחרו סיבה</option>
          {ENQUIRY_REASONS.map((reason) => (
            <option key={reason} value={reason}>
              {reason}
            </option>
          ))}
        </select>
      </Field>

      <Field label="שם" htmlFor="agency-enquiry-name" required>
        <input
          id="agency-enquiry-name"
          required
          className={inputClass}
          value={form.name}
          onChange={(e) => set('name', e.target.value)}
        />
      </Field>

      <Field label="טלפון" htmlFor="agency-enquiry-phone">
        <PhoneField id="agency-enquiry-phone" value={form.phone} onChange={(value) => set('phone', value)} />
      </Field>

      <Field
        label="אימייל"
        htmlFor="agency-enquiry-email"
        error={!reachable && form.name !== '' && 'צריך טלפון או אימייל'}
      >
        <input
          id="agency-enquiry-email"
          type="email"
          className={inputClass}
          value={form.email}
          onChange={(e) => set('email', e.target.value)}
        />
      </Field>

      <Field label="הודעה" htmlFor="agency-enquiry-message">
        <textarea
          id="agency-enquiry-message"
          rows={3}
          className={inputClass}
          value={form.message}
          onChange={(e) => set('message', e.target.value)}
          placeholder="איך אפשר לעזור?"
        />
      </Field>

      <Button type="submit" disabled={state === 'sending' || !form.name.trim() || !reachable}>
        {state === 'sending' ? 'שולח…' : 'שליחה'}
      </Button>
    </form>
  );
}
