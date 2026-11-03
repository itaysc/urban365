import { beforeEach, describe, expect, it } from 'vitest';

import {
  EMPTY_FORM,
  forgetValuationDraft,
  isBlankValuationDraft,
  readValuationDraft,
  rememberValuationDraft,
  type ValuationForm,
} from './valuationDraft';

const KEY = 'nadlan:valuation-draft';

/**
 * These tests run in node, so there is no `window`. The store below is the one the
 * browser would provide — and the point of most of what follows is that what comes
 * back out of it is never trusted: another tab, an older build of this app or anyone
 * with the console open can write whatever they like to that key.
 */
function useStorage(): Map<string, string> {
  const store = new Map<string, string>();

  (globalThis as { window?: unknown }).window = {
    localStorage: {
      getItem: (key: string) => store.get(key) ?? null,
      setItem: (key: string, value: string) => void store.set(key, value),
      removeItem: (key: string) => void store.delete(key),
    },
  };

  return store;
}

const FILLED: ValuationForm = {
  ...EMPTY_FORM,
  city: 'תל אביב-יפו',
  street: 'דיזנגוף',
  rooms: 3,
  area: '75',
  floor: '4',
  topFloor: '8',
  condition: 'renovated',
  hasLift: true,
  hasMamad: false,
};

const PIN = { latitude: 32.0754, longitude: 34.7752, where: '5000|דיזנגוף' };

describe('the valuation draft', () => {
  let store: Map<string, string>;

  beforeEach(() => {
    store = useStorage();
  });

  it('is empty before anything has been filled in', () => {
    expect(readValuationDraft()).toEqual({ form: EMPTY_FORM, pin: null });
  });

  it('gives back what was put in it, pin and all', () => {
    rememberValuationDraft({ form: FILLED, pin: PIN });

    expect(readValuationDraft()).toEqual({ form: FILLED, pin: PIN });
  });

  /*
   * Opening the page and leaving must not put anything in anyone's browser, and the
   * clear control gets its behaviour from this rather than from a separate path:
   * putting the form back to empty is what removes the draft.
   */
  it('stores nothing at all for a form nobody has filled in', () => {
    rememberValuationDraft({ form: EMPTY_FORM, pin: null });

    expect(store.has(KEY)).toBe(false);
  });

  it('removes an earlier draft when the form goes back to empty', () => {
    rememberValuationDraft({ form: FILLED, pin: PIN });
    rememberValuationDraft({ form: EMPTY_FORM, pin: null });

    expect(store.has(KEY)).toBe(false);
    expect(readValuationDraft()).toEqual({ form: EMPTY_FORM, pin: null });
  });

  it('knows a blank draft from one with a single answer in it', () => {
    expect(isBlankValuationDraft({ form: EMPTY_FORM, pin: null })).toBe(true);
    expect(isBlankValuationDraft({ form: { ...EMPTY_FORM, city: 'חולון' }, pin: null })).toBe(
      false,
    );
    // A pin alone counts: it is the answer that took the most effort to give.
    expect(isBlankValuationDraft({ form: EMPTY_FORM, pin: PIN })).toBe(false);
  });

  it('forgets on request', () => {
    rememberValuationDraft({ form: FILLED, pin: PIN });
    forgetValuationDraft();

    expect(readValuationDraft().form).toEqual(EMPTY_FORM);
  });

  it('ignores a draft written by a different version of this file', () => {
    store.set(KEY, JSON.stringify({ v: 99, form: FILLED, pin: PIN }));

    expect(readValuationDraft()).toEqual({ form: EMPTY_FORM, pin: null });
  });

  it('ignores anything that is not a draft at all', () => {
    for (const junk of ['not json', '[]', 'null', '{"v":1}', '"a string"']) {
      store.set(KEY, junk);
      expect(readValuationDraft().form, junk).toEqual(EMPTY_FORM);
    }
  });

  /*
   * The one that matters. A condition the adjustment table has never heard of would
   * be sent to the API and looked up there, and a string where a number belongs would
   * travel just as far.
   */
  it('drops a value that is not one of the answers the form offers', () => {
    store.set(
      KEY,
      JSON.stringify({
        v: 1,
        form: { ...FILLED, condition: 'immaculate', aspect: 42, renewal: null },
        pin: null,
      }),
    );

    const { form } = readValuationDraft();

    expect(form.condition).toBeUndefined();
    expect(form.aspect).toBeUndefined();
    expect(form.renewal).toBeUndefined();
    // The rest of the draft survives one bad field.
    expect(form.city).toBe(FILLED.city);
  });

  it('keeps the numeric boxes holding digits, whatever was stored', () => {
    store.set(
      KEY,
      JSON.stringify({ v: 1, form: { ...FILLED, area: '75; drop', floor: 4, rooms: 'three' } }),
    );

    const { form } = readValuationDraft();

    expect(form.area).toBe('75');
    expect(form.floor).toBe('');
    expect(form.rooms).toBeUndefined();
  });

  it('refuses a room count no flat has', () => {
    for (const rooms of [0, -3, 40, Number.NaN, Infinity]) {
      store.set(KEY, JSON.stringify({ v: 1, form: { ...FILLED, rooms } }));
      expect(readValuationDraft().form.rooms, String(rooms)).toBeUndefined();
    }
  });

  /*
   * A pin is the single most consequential answer on the form — the comparables are
   * chosen around it — so one that could not have come from this map is thrown away
   * rather than restored and quietly submitted.
   */
  it('refuses a pin that is not in the country', () => {
    for (const pin of [
      { latitude: 51.5, longitude: -0.12, where: '5000|' },
      { latitude: '32.07', longitude: 34.77, where: '5000|' },
      { latitude: 32.07, longitude: 34.77 },
      'somewhere',
    ]) {
      store.set(KEY, JSON.stringify({ v: 1, form: FILLED, pin }));
      expect(readValuationDraft().pin, JSON.stringify(pin)).toBeNull();
    }
  });

  it('says nothing when storage itself is unavailable', () => {
    (globalThis as { window?: unknown }).window = undefined;

    expect(() => rememberValuationDraft({ form: FILLED, pin: PIN })).not.toThrow();
    expect(readValuationDraft()).toEqual({ form: EMPTY_FORM, pin: null });
  });
});
