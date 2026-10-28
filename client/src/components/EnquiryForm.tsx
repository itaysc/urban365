import { useState } from 'react';
import { Button } from '@/components/ui/Button';
import { Field, inputClass } from '@/components/ui/Field';
import { errorMessageOf } from '@/lib/apiError';
import { submitEnquiry } from '@/services/crm';

/**
 * The visitor-facing enquiry form. It lands in the owning agency's inbox — the agency is
 * read off the listing server-side, never sent from here.
 */
export function EnquiryForm({ listingId }: { listingId: string }) {
  const [form, setForm] = useState({ name: '', phone: '', email: '', message: '' });
  const [state, setState] = useState<'idle' | 'sending' | 'sent'>('idle');
  const [error, setError] = useState<string | null>(null);

  const set = (key: keyof typeof form, value: string) => setForm((f) => ({ ...f, [key]: value }));

  // The server requires one of the two; saying so up front beats a 400.
  const reachable = form.phone.trim() !== '' || form.email.trim() !== '';

  const submit = async () => {
    setState('sending');
    setError(null);

    try {
      await submitEnquiry(listingId, {
        name: form.name.trim(),
        phone: form.phone.trim() || undefined,
        email: form.email.trim() || undefined,
        message: form.message.trim() || undefined,
      });
      setState('sent');
    } catch (e) {
      setError(errorMessageOf(e, 'השליחה נכשלה. נסו שוב.'));
      setState('idle');
    }
  };

  if (state === 'sent') {
    return (
      <div className="rounded-lg border border-green-200 bg-green-50 p-4 text-center text-sm text-green-800">
        הפנייה נשלחה. הסוכנות תחזור אליכם.
      </div>
    );
  }

  return (
    <form
      className="flex flex-col gap-3 rounded-lg border border-slate-200 p-4"
      onSubmit={(e) => {
        e.preventDefault();
        void submit();
      }}
    >
      <h3 className="text-sm font-semibold text-slate-900">יצירת קשר על הנכס</h3>

      {error && <p className="text-xs text-red-700">{error}</p>}

      <div className="grid gap-3 sm:grid-cols-2">
        <Field label="שם" htmlFor="enquiry-name" required>
          <input id="enquiry-name" required className={inputClass} value={form.name}
                 onChange={(e) => set('name', e.target.value)} />
        </Field>

        <Field label="טלפון" htmlFor="enquiry-phone">
          <input id="enquiry-phone" type="tel" className={inputClass} value={form.phone}
                 onChange={(e) => set('phone', e.target.value)} />
        </Field>
      </div>

      <Field label="אימייל" htmlFor="enquiry-email" error={!reachable && form.name !== '' && 'צריך טלפון או אימייל'}>
        <input id="enquiry-email" type="email" className={inputClass} value={form.email}
               onChange={(e) => set('email', e.target.value)} />
      </Field>

      <Field label="הודעה" htmlFor="enquiry-message">
        <textarea id="enquiry-message" rows={3} className={inputClass} value={form.message}
                  onChange={(e) => set('message', e.target.value)}
                  placeholder="מתי אפשר לראות את הנכס?" />
      </Field>

      <Button type="submit" disabled={state === 'sending' || !form.name.trim() || !reachable}>
        {state === 'sending' ? 'שולח…' : 'שלח פנייה'}
      </Button>
    </form>
  );
}
