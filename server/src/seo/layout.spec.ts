import { afterEach, describe, expect, it } from 'vitest';
import { page, seoCsp, setSessionApi } from './layout.js';

const html = () =>
  page({
    title: 't',
    description: 'd',
    canonical: 'https://urban365.co.il/nadlan',
    indexable: true,
    appUrl: 'https://urban365.co.il',
    body: '<p>x</p>',
  });

describe('session check', () => {
  afterEach(() => setSessionApi('/api/v1'));

  it('asks the API host, because /api on the public site is the app', () => {
    setSessionApi('https://api.urban365.co.il');
    const pageHtml = html();

    expect(pageHtml).toContain('<meta name="u365-api" content="https://api.urban365.co.il/api/v1">');
    expect(pageHtml).toContain('credentials:"include"');
    expect(pageHtml).not.toContain('fetch("/api/v1/auth/me"');
    expect(pageHtml).toContain('replace(/\\/app\\/profile$/,"/account")');
    expect(pageHtml).toContain('u.avatarUrl');
    expect(pageHtml).toContain('data-leave');
    expect(pageHtml).toContain('"/auth/logout"');
  });

  it('refuses to embed an address that is not an http URL', () => {
    expect(() => setSessionApi('javascript:alert(1)')).toThrow(/API URL/);
  });

  it('lets the session check reach the API', () => {
    expect(seoCsp('https://api.urban365.co.il')).toContain(
      "connect-src 'self' https://api.urban365.co.il",
    );
  });
});
