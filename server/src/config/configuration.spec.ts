import { afterEach, beforeEach, describe, expect, it } from 'vitest';

import configuration from './configuration.js';

/**
 * The one rule in here worth pinning down.
 *
 * `SCHEDULERS_ENABLED` decides whether the reminder, matching and alert sweeps run at
 * all, and its failure mode is silent: mail that never goes out looks like a mail
 * problem, not a setting. So it is deliberately not a general truthiness check —
 * nothing but an explicit "false" turns the sweeps off, and a typo leaves them on.
 */
describe('schedulersEnabled', () => {
  const before = process.env.SCHEDULERS_ENABLED;

  beforeEach(() => {
    delete process.env.SCHEDULERS_ENABLED;
  });

  afterEach(() => {
    if (before === undefined) delete process.env.SCHEDULERS_ENABLED;
    else process.env.SCHEDULERS_ENABLED = before;
  });

  it('runs the sweeps when nothing is set', () => {
    expect(configuration().app.schedulersEnabled).toBe(true);
  });

  it('stops them on an explicit false, whatever the case', () => {
    for (const value of ['false', 'FALSE', 'False']) {
      process.env.SCHEDULERS_ENABLED = value;
      expect(configuration().app.schedulersEnabled, value).toBe(false);
    }
  });

  /*
   * The important half. "0", "no" and "off" read as off to a person and are not, which
   * is the safe direction: a mistyped flag leaves reminders working rather than
   * quietly swallowing them.
   */
  it('keeps them running for anything else, including near-misses', () => {
    for (const value of ['true', '0', 'no', 'off', '', 'flase']) {
      process.env.SCHEDULERS_ENABLED = value;
      expect(configuration().app.schedulersEnabled, JSON.stringify(value)).toBe(true);
    }
  });
});

/**
 * The opposite failure mode from the sweeps. Closing the site by accident is worse
 * than leaving it open, so nothing but an explicit "true" engages it.
 */
describe('siteClosed', () => {
  const before = process.env.SITE_CLOSED;

  beforeEach(() => {
    delete process.env.SITE_CLOSED;
  });

  afterEach(() => {
    if (before === undefined) delete process.env.SITE_CLOSED;
    else process.env.SITE_CLOSED = before;
  });

  it('stays open when nothing is set', () => {
    expect(configuration().app.siteClosed).toBe(false);
  });

  it('closes on an explicit true, whatever the case', () => {
    for (const value of ['true', 'TRUE', 'True']) {
      process.env.SITE_CLOSED = value;
      expect(configuration().app.siteClosed, value).toBe(true);
    }
  });

  it('stays open for false and for near-misses', () => {
    for (const value of ['false', 'FALSE', '1', 'yes', 'on', '', 'ture']) {
      process.env.SITE_CLOSED = value;
      expect(configuration().app.siteClosed, JSON.stringify(value)).toBe(false);
    }
  });
});

describe('listingReview', () => {
  const before = process.env.LISTING_REVIEW;

  beforeEach(() => {
    delete process.env.LISTING_REVIEW;
  });

  afterEach(() => {
    if (before === undefined) delete process.env.LISTING_REVIEW;
    else process.env.LISTING_REVIEW = before;
  });

  it('publishes immediately when nothing is set', () => {
    expect(configuration().app.listingReview).toBe(false);
  });

  it('holds listings on an explicit true, whatever the case', () => {
    for (const value of ['true', 'TRUE', 'True']) {
      process.env.LISTING_REVIEW = value;
      expect(configuration().app.listingReview, value).toBe(true);
    }
  });

  it('stays off for false and for near-misses', () => {
    for (const value of ['false', 'FALSE', '1', 'yes', 'on', '', 'ture']) {
      process.env.LISTING_REVIEW = value;
      expect(configuration().app.listingReview, JSON.stringify(value)).toBe(false);
    }
  });
});
