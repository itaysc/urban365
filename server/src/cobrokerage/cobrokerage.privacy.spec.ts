import { describe, expect, it } from 'vitest';
import { HOLDER_FIELDS, SEEKER_FIELDS } from './projections.js';

/**
 * The wall between the two agencies, asserted rather than described.
 *
 * Row-level security has no column dimension: the request row is legitimately the
 * holding agency's to read, so nothing in the database stops the buyer's id coming
 * back with it. The service's projection is what stops it, and a projection is one
 * careless edit from leaking — hence a test that fails loudly rather than a comment
 * that asks nicely.
 */
describe('what crosses between agencies', () => {
  it('never sends the buyer to the agency being asked', () => {
    expect(HOLDER_FIELDS).not.toContain('customer');
    expect(HOLDER_FIELDS).not.toContain('customerId');
  });

  it('does send the brief, which is what makes the request judgeable', () => {
    expect(HOLDER_FIELDS).toContain('briefSummary');
  });

  it('tells the agency being asked who is asking, so they can answer', () => {
    expect(HOLDER_FIELDS).toContain('seekingAgency');
  });

  it('does not send the asking agency anything about who else has asked', () => {
    // Deliberately one request at a time: neither side learns about the other's wider
    // dealings from this row.
    expect(SEEKER_FIELDS).not.toContain('holdingAgencyRequests');
  });

  it('does show the asking agency its own customer', () => {
    expect(SEEKER_FIELDS).toContain('customer');
  });
});
