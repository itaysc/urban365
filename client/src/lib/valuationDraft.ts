import {
  ASPECTS,
  BUILDING_STATES,
  CONDITIONS,
  RENEWALS,
  type Aspect,
  type BuildingState,
  type Condition,
  type Renewal,
} from '@/lib/propertyCondition';

/**
 * The valuation form, and remembering it between visits.
 *
 * The data sheet runs to twenty questions and the map pin has to be placed by hand, so
 * coming back to a blank form is a real cost — most people filling this in are pricing
 * one flat over several sittings, not twenty flats in one.
 *
 * In localStorage rather than on the account, for the same reason as
 * {@link readRecentPlaces}: the page is open to people who have never signed in, which
 * is most of them, and a round trip to read back someone's own half-finished form
 * would be a poor trade. Nothing here is sent anywhere until the form is submitted.
 */

export interface ValuationForm {
  city: string;
  street: string;
  neighborhood: string;
  rooms: number | undefined;
  area: string;
  gush: string;
  chelka: string;
  floor: string;
  topFloor: string;
  hasLift: boolean | undefined;
  condition: Condition | undefined;
  hasParking: boolean | undefined;
  hasStorage: boolean | undefined;
  hasBalcony: boolean | undefined;
  hasMamad: boolean | undefined;
  aspect: Aspect | undefined;
  buildingState: BuildingState | undefined;
  renewal: Renewal | undefined;
}

/** Where the marker was left, and what it was placed relative to. */
export interface ValuationPin {
  latitude: number;
  longitude: number;
  /** The town-and-street the pin belongs to; see `ValuationPage`'s own note. */
  where: string;
}

export interface ValuationDraft {
  form: ValuationForm;
  pin: ValuationPin | null;
}

export const EMPTY_FORM: ValuationForm = {
  city: '',
  street: '',
  neighborhood: '',
  rooms: undefined,
  area: '',
  gush: '',
  chelka: '',
  floor: '',
  topFloor: '',
  hasLift: undefined,
  condition: undefined,
  hasParking: undefined,
  hasStorage: undefined,
  hasBalcony: undefined,
  hasMamad: undefined,
  aspect: undefined,
  buildingState: undefined,
  renewal: undefined,
};

const KEY = 'nadlan:valuation-draft';

/**
 * Bumped when the shape changes, which throws away older drafts rather than trying to
 * read them. A half-understood draft is worse than a blank form: it puts answers in
 * front of someone who will assume they are the ones they gave.
 */
const VERSION = 1;

/** Israel and the territories, the same box the geocoder is bounded to. */
const BOUNDS = { minLat: 29.45, maxLat: 33.35, minLng: 34.2, maxLng: 35.95 };

/**
 * Every field is checked rather than trusted.
 *
 * This is text from the person's own machine: another tab, an older build of this app
 * or anyone with the console open may have written it. A string where a number belongs
 * would reach the API as one, and a condition nobody has heard of would reach the
 * adjustment table.
 */
export function readValuationDraft(): ValuationDraft {
  try {
    const raw = window.localStorage.getItem(KEY);
    if (!raw) return { form: EMPTY_FORM, pin: null };

    const parsed: unknown = JSON.parse(raw);
    if (!isRecord(parsed) || parsed.v !== VERSION) return { form: EMPTY_FORM, pin: null };

    const stored = isRecord(parsed.form) ? parsed.form : {};

    return {
      form: {
        city: text(stored.city),
        street: text(stored.street),
        neighborhood: text(stored.neighborhood),
        rooms: roomCount(stored.rooms),
        area: digits(stored.area),
        gush: digits(stored.gush),
        chelka: digits(stored.chelka),
        floor: digits(stored.floor),
        topFloor: digits(stored.topFloor),
        hasLift: flag(stored.hasLift),
        condition: oneOf(CONDITIONS, stored.condition),
        hasParking: flag(stored.hasParking),
        hasStorage: flag(stored.hasStorage),
        hasBalcony: flag(stored.hasBalcony),
        hasMamad: flag(stored.hasMamad),
        aspect: oneOf(ASPECTS, stored.aspect),
        buildingState: oneOf(BUILDING_STATES, stored.buildingState),
        renewal: oneOf(RENEWALS, stored.renewal),
      },
      pin: pinIn(parsed.pin),
    };
  } catch {
    // Storage throws outright in a private window and wherever site data is blocked.
    return { form: EMPTY_FORM, pin: null };
  }
}

/**
 * Nothing filled in is nothing to remember.
 *
 * Without this, opening the page and leaving would store an empty draft — and the
 * form would hold a key in everyone's browser whether or not they ever used it. It is
 * also what the clear control relies on: putting the form back to empty removes the
 * draft rather than storing a blank one.
 */
export const isBlankValuationDraft = (draft: ValuationDraft): boolean =>
  draft.pin === null &&
  (Object.keys(EMPTY_FORM) as (keyof ValuationForm)[]).every(
    (field) => draft.form[field] === EMPTY_FORM[field],
  );

export function rememberValuationDraft(draft: ValuationDraft): void {
  if (isBlankValuationDraft(draft)) {
    forgetValuationDraft();
    return;
  }

  try {
    window.localStorage.setItem(KEY, JSON.stringify({ v: VERSION, ...draft }));
  } catch {
    // Full, or blocked. The form still works for this visit.
  }
}

export function forgetValuationDraft(): void {
  try {
    window.localStorage.removeItem(KEY);
  } catch {
    // Nothing to do — see above.
  }
}

const isRecord = (value: unknown): value is Record<string, unknown> =>
  typeof value === 'object' && value !== null;

/** Capped so a stored string cannot grow past what the API would accept anyway. */
const text = (value: unknown): string => (typeof value === 'string' ? value.slice(0, 120) : '');

/** The numeric boxes hold digits only — that is what their own onChange enforces. */
const digits = (value: unknown): string =>
  typeof value === 'string' ? value.replace(/\D/g, '').slice(0, 9) : '';

const flag = (value: unknown): boolean | undefined =>
  typeof value === 'boolean' ? value : undefined;

const oneOf = <T extends string>(allowed: readonly T[], value: unknown): T | undefined =>
  typeof value === 'string' && (allowed as readonly string[]).includes(value)
    ? (value as T)
    : undefined;

const roomCount = (value: unknown): number | undefined =>
  typeof value === 'number' && Number.isFinite(value) && value >= 1 && value <= 15
    ? value
    : undefined;

function pinIn(value: unknown): ValuationPin | null {
  if (!isRecord(value)) return null;

  const { latitude, longitude, where } = value;
  if (typeof latitude !== 'number' || typeof longitude !== 'number') return null;
  if (typeof where !== 'string') return null;

  // A pin outside the country is not a pin this form ever produced.
  const inside =
    latitude >= BOUNDS.minLat &&
    latitude <= BOUNDS.maxLat &&
    longitude >= BOUNDS.minLng &&
    longitude <= BOUNDS.maxLng;

  return inside ? { latitude, longitude, where: where.slice(0, 200) } : null;
}
