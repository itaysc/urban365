import { describe, expect, it } from 'vitest';
import { snapshot } from '@/pages/sell/formSnapshot';
import type { SellerListingInput } from '@/services/seller';

const base: SellerListingInput = { section: 'forsale', city: 'חולון' };

describe('snapshot', () => {
  it('is equal for the same listing described twice', () => {
    expect(snapshot({ ...base, price: 100 }, ['מעלית'])).toBe(
      snapshot({ ...base, price: 100 }, ['מעלית']),
    );
  });

  it('treats a missing field and an undefined one as the same', () => {
    // What the server sends back as null arrives as undefined, and a field nobody has
    // touched is absent entirely. Telling somebody they have unsaved changes because of
    // that would make the warning worthless.
    expect(snapshot(base, [])).toBe(snapshot({ ...base, street: undefined }, []));
  });

  it('ignores the order amenities were picked in', () => {
    // Removing one and adding it back puts it at the end of the list. The set is the
    // same, so nothing has changed.
    expect(snapshot(base, ['מעלית', 'מרפסת'])).toBe(snapshot(base, ['מרפסת', 'מעלית']));
  });

  it('notices an amenity that was actually removed', () => {
    expect(snapshot(base, ['מעלית', 'מרפסת'])).not.toBe(snapshot(base, ['מעלית']));
  });

  it('notices a changed price, including one cleared back to nothing', () => {
    expect(snapshot({ ...base, price: 100 }, [])).not.toBe(snapshot({ ...base, price: 200 }, []));
    expect(snapshot({ ...base, price: 100 }, [])).not.toBe(snapshot(base, []));
  });

  it('does not confuse a number with the same digits as text', () => {
    // `floor` comes off a number input and `city` off a text one; both end up in the
    // same array, and "3" must not compare equal to 3.
    expect(snapshot({ ...base, floor: 3 }, [])).not.toBe(
      snapshot({ ...base, floor: '3' as unknown as number }, []),
    );
  });
});
