import { useEffect, useMemo, useState } from 'react';
import { useQuery } from '@tanstack/react-query';
import { CustomerSelect, type PickedCustomer } from '@/components/agency/CustomerSelect';
import { SuggestBox } from '@/components/listing/SuggestBox';
import { Button } from '@/components/ui/Button';
import { Field, inputClass, selectClass } from '@/components/ui/Field';
import { ISRAELI_CITIES } from '@/data/cities';
import { splitPlace } from '@/lib/address-line';
import { MEETING_TITLES } from '@/lib/meetingTitles';
import { qk } from '@/queries/keys';
import { fetchMyListings } from '@/services/agency';
import type { Meeting, MeetingInput } from '@/services/calendar';
import { fetchAddressSuggestions, fetchStreetsIn } from '@/services/search';

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

const MAX_PLACES = 8;

/** The top of the next hour — the fallback when no day was chosen. */
function nextHour(): string {
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
  /**
   * Where to start a new booking, as a `datetime-local` value.
   *
   * The calendar passes the day that was clicked: somebody who picked the 12th means
   * the 12th, and being handed "an hour from now" instead is the form second-guessing
   * a choice they have already made.
   */
  defaultStart?: string;
  onSubmit: (input: MeetingInput) => void;
  onCancel: () => void;
  /** Cancelling the meeting itself, as opposed to closing the form. */
  onDelete?: () => void;
  busy?: boolean;
}

export function MeetingForm({
  meeting,
  customerId,
  defaultStart,
  onSubmit,
  onCancel,
  onDelete,
  busy = false,
}: Props) {
  const opensAt = defaultStart ?? nextHour();

  const [title, setTitle] = useState(meeting?.title ?? '');
  const [startsAt, setStartsAt] = useState(meeting ? toLocalInput(meeting.startsAt) : opensAt);
  const [endsAt, setEndsAt] = useState(
    meeting ? toLocalInput(meeting.endsAt) : plusHour(opensAt),
  );
  const [location, setLocation] = useState(meeting?.location ?? '');
  const [notes, setNotes] = useState(meeting?.notes ?? '');
  const [customer, setCustomer] = useState<PickedCustomer | null>(
    meeting?.customer
      ? { id: meeting.customer.id, name: meeting.customer.name, phone: meeting.customer.phone }
      : null,
  );
  const [listing, setListing] = useState(meeting?.listingId ?? '');
  const [error, setError] = useState<string | null>(null);

  // Naming the property is what turns a diary entry into a viewing: it is the only
  // reason the listing can later say who came to see it.
  const { data: listings } = useQuery({
    queryKey: qk.listings.mine('published', 1),
    queryFn: () => fetchMyListings({ status: 'published', page: 1 }),
  });

  const { street, house, city: cityTerm, separated, loose } = splitPlace(location);
  const knownCity = (ISRAELI_CITIES as readonly string[]).includes(cityTerm) ? cityTerm : '';
  // A bare word is tried as a street too. Once it is exactly a town, the streets of
  // that town take over, which is a different query.
  const streetLookup = separated || house !== '' ? street : knownCity ? '' : cityTerm;
  // "הרצל" is the start of הרצליה, and it is also how "שדרות הרצל" is written.
  const looseLookup = loose ? location.trim() : '';
  const [streetQuery, setStreetQuery] = useState('');
  const [looseQuery, setLooseQuery] = useState('');

  useEffect(() => {
    const timer = window.setTimeout(() => setStreetQuery(streetLookup), 200);
    return () => window.clearTimeout(timer);
  }, [streetLookup]);

  useEffect(() => {
    const timer = window.setTimeout(() => setLooseQuery(looseLookup), 200);
    return () => window.clearTimeout(timer);
  }, [looseLookup]);

  const cityOptions = useMemo(() => {
    if (cityTerm === '') return [];
    const starts: string[] = [];
    const contains: string[] = [];
    for (const city of ISRAELI_CITIES) {
      if (!separated && city === cityTerm) continue;
      if (city.startsWith(cityTerm)) starts.push(city);
      else if (city.includes(cityTerm)) contains.push(city);
      if (starts.length >= MAX_PLACES) break;
    }
    return [...starts, ...contains].slice(0, MAX_PLACES);
  }, [cityTerm, separated]);

  const { data: streets } = useQuery({
    queryKey: qk.listings.streets(knownCity, separated ? streetQuery : ''),
    queryFn: () => fetchStreetsIn(knownCity, separated ? streetQuery : ''),
    enabled: knownCity !== '' && (!separated || streetQuery !== ''),
    staleTime: 5 * 60_000,
  });

  // The same street exists in a lot of towns, so each hit is the whole line.
  const { data: anywhere } = useQuery({
    queryKey: qk.listings.addressSuggestions(streetQuery, separated ? cityTerm : ''),
    queryFn: () => fetchAddressSuggestions(streetQuery, separated ? cityTerm : ''),
    enabled: streetQuery.length >= 2 && knownCity === '',
    staleTime: 5 * 60_000,
  });

  const { data: asWritten } = useQuery({
    queryKey: qk.listings.addressSuggestions(looseQuery, ''),
    queryFn: () => fetchAddressSuggestions(looseQuery),
    enabled: looseQuery.length >= 2,
    staleTime: 5 * 60_000,
  });

  // A city, until the line is one — then the streets of that city, written back into
  // the same line with the house number kept if it was already typed.
  const places = useMemo(() => {
    const fromStreets = (streets ?? [])
      .filter((name) => name !== street)
      .map((name) => {
        const road = house ? `${name} ${house}` : name;
        return `${road}, ${knownCity}`;
      });
    const fromAnywhere = (anywhere ?? []).map((row) => {
      const road = house ? `${row.street} ${house}` : row.street;
      return `${road}, ${row.city}`;
    });
    if (!separated && knownCity) return fromStreets.slice(0, MAX_PLACES);
    if (!separated) {
      // Towns first: "תל" is תל אביב long before it is a street. Whatever is left
      // of the eight slots is streets, so "סוקולוב" — which is no town — still shows.
      const towns = cityOptions.slice(0, 4);
      const roads = fromAnywhere.filter((option) => !towns.includes(option));
      return [...towns, ...roads].filter((option) => option !== location.trim()).slice(0, MAX_PLACES);
    }
    const head = house ? `${street} ${house}` : street;
    const fromCities = cityOptions.map((city) => (head ? `${head}, ${city}` : city));
    const fromWritten = (asWritten ?? []).map((row) => {
      const road = house ? `${row.street} ${house}` : row.street;
      return `${road}, ${row.city}`;
    });
    return [...fromAnywhere, ...fromStreets, ...fromCities, ...fromWritten]
      .filter((option, index, all) => option !== location.trim() && all.indexOf(option) === index)
      .slice(0, MAX_PLACES);
  }, [separated, cityOptions, house, street, streets, anywhere, asWritten, knownCity, location]);

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
      customerId: customerId ?? customer?.id ?? '',
      listingId: listing,
    });
  };

  return (
    <form onSubmit={submit} className="flex flex-col gap-4">
      {/*
        The whole list on focus, before a letter is typed: a diary is nine kinds of
        meeting repeated, so the common case should be one click rather than a sentence
        typed on a phone. Anything else is still just typed — the suggestions narrow as
        you go and never take what you wrote.
      */}
      <Field label="נושא" htmlFor="meeting-title" required>
        <SuggestBox
          id="meeting-title"
          required
          value={title}
          onChange={setTitle}
          term={title.trim()}
          options={MEETING_TITLES.filter(
            (option) => option !== title.trim() && option.includes(title.trim()),
          )}
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
          <CustomerSelect id="meeting-customer" value={customer} onChange={setCustomer} />
        </Field>
      )}

      <Field label="הנכס" htmlFor="meeting-listing">
        <select
          id="meeting-listing"
          className={selectClass}
          value={listing}
          onChange={(e) => {
            setListing(e.target.value);
            // The property's address is the place, unless somebody has already written
            // one — picking a flat should not overwrite a correction.
            const chosen = (listings?.items ?? []).find((l) => l.id === e.target.value);
            if (chosen && location.trim() === '') {
              setLocation([chosen.street, chosen.city].filter(Boolean).join(', '));
            }
          }}
        >
          <option value="">ללא נכס</option>
          {(listings?.items ?? []).map((l) => (
            <option key={l.id} value={l.id}>
              {[l.street, l.city].filter(Boolean).join(', ') || 'נכס ללא כתובת'}
            </option>
          ))}
        </select>
      </Field>

      <Field label="מיקום" htmlFor="meeting-location">
        <SuggestBox
          id="meeting-location"
          value={location}
          onChange={setLocation}
          options={places}
          term={separated ? street || cityTerm : cityTerm}
          placeholder="סוקולוב 12, חולון — או המשרד, שיחת וידאו"
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
        {meeting && onDelete && (
          <button
            type="button"
            onClick={onDelete}
            disabled={busy}
            className="ms-auto text-sm text-slate-500 transition hover:text-red-700 disabled:opacity-40"
          >
            ביטול הפגישה
          </button>
        )}
      </div>
    </form>
  );
}
