import { useState } from 'react';
import { useQuery } from '@tanstack/react-query';
import { Button } from '@/components/ui/Button';
import { Field, inputClass, selectClass } from '@/components/ui/Field';
import { qk } from '@/queries/keys';
import { fetchCustomers } from '@/services/crm';
import type { Meeting, MeetingInput } from '@/services/calendar';

/**
 * A `datetime-local` input wants `YYYY-MM-DDTHH:mm` in **local** time, while everything
 * on the wire is an ISO instant. These two convert between them, and neither does it by
 * slicing the ISO string — that is UTC, and in Israel it would move every meeting two or
 * three hours depending on the season.
 */
function toLocalInput(iso: string): string {
  const at = new Date(iso);
  const pad = (n: number) => String(n).padStart(2, '0');
  return `${at.getFullYear()}-${pad(at.getMonth() + 1)}-${pad(at.getDate())}T${pad(at.getHours())}:${pad(at.getMinutes())}`;
}

const toIso = (local: string): string => new Date(local).toISOString();

/** An hour from the top of the next one, which is what most bookings are. */
function defaultStart(): string {
  const at = new Date();
  at.setMinutes(0, 0, 0);
  at.setHours(at.getHours() + 1);
  return toLocalInput(at.toISOString());
}

function plusHour(local: string): string {
  const at = new Date(local);
  at.setHours(at.getHours() + 1);
  return toLocalInput(at.toISOString());
}

interface Props {
  meeting: Meeting | null;
  /** Fixed when the form is opened from a customer's own page. */
  customerId?: string;
  onSubmit: (input: MeetingInput) => void;
  onCancel: () => void;
  busy?: boolean;
}

export function MeetingForm({ meeting, customerId, onSubmit, onCancel, busy = false }: Props) {
  const [title, setTitle] = useState(meeting?.title ?? '');
  const [startsAt, setStartsAt] = useState(
    meeting ? toLocalInput(meeting.startsAt) : defaultStart(),
  );
  const [endsAt, setEndsAt] = useState(
    meeting ? toLocalInput(meeting.endsAt) : plusHour(defaultStart()),
  );
  const [location, setLocation] = useState(meeting?.location ?? '');
  const [notes, setNotes] = useState(meeting?.notes ?? '');
  const [customer, setCustomer] = useState(meeting?.customerId ?? customerId ?? '');
  const [error, setError] = useState<string | null>(null);

  // Only when the customer is the agent's to choose. On a customer's own page it is
  // already decided, and a list of everybody else would be noise.
  const { data: customers } = useQuery({
    queryKey: qk.customers.list('', undefined, 1),
    queryFn: () => fetchCustomers({ page: 1 }),
    enabled: customerId === undefined,
  });

  const submit = (e: React.FormEvent) => {
    e.preventDefault();

    if (new Date(endsAt) <= new Date(startsAt)) {
      setError('שעת הסיום צריכה להיות אחרי שעת ההתחלה.');
      return;
    }

    setError(null);
    onSubmit({
      title: title.trim(),
      startsAt: toIso(startsAt),
      endsAt: toIso(endsAt),
      location: location.trim(),
      notes: notes.trim(),
      customerId: customer || undefined,
    });
  };

  return (
    <form onSubmit={submit} className="flex flex-col gap-4">
      <Field label="נושא" htmlFor="meeting-title" required>
        <input
          id="meeting-title"
          required
          className={inputClass}
          value={title}
          onChange={(e) => setTitle(e.target.value)}
          placeholder="ביקור בנכס, פגישת הערכה, חתימה"
        />
      </Field>

      <div className="grid gap-4 sm:grid-cols-2">
        <Field label="מתי" htmlFor="meeting-start" required>
          <input
            id="meeting-start"
            type="datetime-local"
            required
            className={inputClass}
            value={startsAt}
            onChange={(e) => {
              setStartsAt(e.target.value);
              // Carry the end along, so moving a meeting does not silently make it
              // negative and reject on submit.
              if (new Date(endsAt) <= new Date(e.target.value)) setEndsAt(plusHour(e.target.value));
            }}
          />
        </Field>

        <Field label="עד" htmlFor="meeting-end" required>
          <input
            id="meeting-end"
            type="datetime-local"
            required
            className={inputClass}
            value={endsAt}
            onChange={(e) => setEndsAt(e.target.value)}
          />
        </Field>
      </div>

      {customerId === undefined && (
        <Field label="לקוח" htmlFor="meeting-customer">
          <select
            id="meeting-customer"
            className={selectClass}
            value={customer}
            onChange={(e) => setCustomer(e.target.value)}
          >
            <option value="">ללא לקוח</option>
            {(customers?.items ?? []).map((c) => (
              <option key={c.id} value={c.id}>
                {c.name}
              </option>
            ))}
          </select>
        </Field>
      )}

      <Field label="מיקום" htmlFor="meeting-location">
        <input
          id="meeting-location"
          className={inputClass}
          value={location}
          onChange={(e) => setLocation(e.target.value)}
          placeholder="כתובת הנכס, המשרד, טלפון"
        />
      </Field>

      <Field label="הערות" htmlFor="meeting-notes">
        <textarea
          id="meeting-notes"
          rows={3}
          className={inputClass}
          value={notes}
          onChange={(e) => setNotes(e.target.value)}
        />
      </Field>

      {error && <p className="rounded-lg bg-red-50 px-3 py-2 text-sm text-red-800">{error}</p>}

      <div className="flex items-center gap-3">
        <Button type="submit" disabled={busy || title.trim() === ''}>
          {busy ? 'שומר…' : meeting ? 'שמירת שינויים' : 'קביעת פגישה'}
        </Button>
        <button
          type="button"
          onClick={onCancel}
          className="text-sm text-slate-500 transition hover:text-slate-900"
        >
          ביטול
        </button>
      </div>
    </form>
  );
}
