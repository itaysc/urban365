import { HttpException } from '@nestjs/common';
import { WAKE_PAGE_LIMIT, wakePage, wakeShown } from './wake-page.js';

const browser = {
  method: 'GET',
  accept: 'text/html,application/xhtml+xml',
  error: new Error('Connection terminated unexpectedly'),
  headersSent: false,
  originalUrl: '/',
};

describe('wakePage', () => {
  it('reloads a browser that was about to read the generic 500', () => {
    const page = wakePage(browser);

    expect(page?.shown).toBe(1);
    expect(page?.html).toContain('האתר מתעורר, עוד רגע…');
    expect(page?.html).toContain('content="2;url=/?wake=1"');
  });

  it('stops reloading after a few tries', () => {
    const page = wakePage({ ...browser, originalUrl: `/?wake=${WAKE_PAGE_LIMIT}` });

    expect(page?.shown).toBe(WAKE_PAGE_LIMIT + 1);
    expect(page?.html).not.toContain('http-equiv="refresh"');
    expect(page?.html).toContain('האתר לא עלה');
  });

  it('leaves an API client, a write, and a handler answer on the JSON path', () => {
    expect(wakePage({ ...browser, accept: 'application/json' })).toBeNull();
    expect(wakePage({ ...browser, method: 'POST' })).toBeNull();
    expect(wakePage({ ...browser, error: new HttpException('העיר חסרה', 400) })).toBeNull();
    expect(wakePage({ ...browser, headersSent: true })).toBeNull();
  });
});

describe('wakeShown', () => {
  it('reads the count from the address and ignores junk', () => {
    expect(wakeShown('/?wake=2')).toBe(2);
    expect(wakeShown('/nadlan?city=חיפה&wake=2')).toBe(2);
    expect(wakeShown('/?wake=nope')).toBe(0);
    expect(wakeShown('/')).toBe(0);
    expect(wakeShown(undefined)).toBe(0);
    expect(wakeShown('/?wake=99')).toBe(WAKE_PAGE_LIMIT + 1);
  });
});
