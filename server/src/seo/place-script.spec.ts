import { describe, expect, it } from 'vitest';
import { placeScriptHash, placeSearchScript } from './place-script.js';

const script = placeSearchScript('https://api.example');

describe('placeSearchScript', () => {
  it('asks the API for places and never writes a suggestion as HTML', () => {
    expect(script).toContain('"https://api.example/api/v1"');
    expect(script).toContain('"/listings/suggest?q="');
    expect(script).toContain('textContent');
    expect(script).not.toContain('innerHTML');
    expect(script).not.toContain('</script>');
  });

  it('names itself by the bytes that will actually run', () => {
    expect(placeScriptHash(script)).toMatch(/^sha256-[A-Za-z0-9+/]+=*$/);
    expect(placeScriptHash(`${script}\n`)).not.toBe(placeScriptHash(script));
  });
});
