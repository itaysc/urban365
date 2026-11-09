import { holdsListingForApproval } from './listing-hold.js';

describe('holdsListingForApproval', () => {
  it('holds a regular user while review mode is on', () => {
    expect(holdsListingForApproval(true, 'buyer')).toBe(true);
  });

  it('lets an agency account publish while review mode is on', () => {
    expect(holdsListingForApproval(true, 'agency')).toBe(false);
  });

  it('publishes everyone when review mode is off', () => {
    expect(holdsListingForApproval(false, 'buyer')).toBe(false);
    expect(holdsListingForApproval(false, 'agency')).toBe(false);
  });
});
