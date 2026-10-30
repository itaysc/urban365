import { extractJsonText, parseJsonFromLlm } from './parse-json.js';

describe('parseJsonFromLlm', () => {
  it('parses a plain object', () => {
    expect(parseJsonFromLlm('{"a": 1}')).toEqual({ a: 1 });
  });

  it('parses one inside a markdown fence', () => {
    expect(parseJsonFromLlm('```json\n{"a": 1}\n```')).toEqual({ a: 1 });
  });

  it('parses one with prose around it', () => {
    expect(parseJsonFromLlm('Sure! {"a": 1} Hope that helps.')).toEqual({ a: 1 });
  });

  it('keeps a brace that is inside a string', () => {
    // A Hebrew description can contain anything, braces included, and cutting at the
    // first one would truncate the object.
    expect(parseJsonFromLlm('{"reason": "לא תקין } כנראה", "legit": false}')).toEqual({
      reason: 'לא תקין } כנראה',
      legit: false,
    });
  });

  it('survives a trailing comma', () => {
    expect(parseJsonFromLlm('{"a": 1,}')).toEqual({ a: 1 });
  });

  it('survives curly quotes', () => {
    expect(parseJsonFromLlm('{“a”: 1}')).toEqual({ a: 1 });
  });

  it('throws on something that is not JSON at all', () => {
    expect(() => parseJsonFromLlm('no json here')).toThrow();
  });
});

describe('extractJsonText', () => {
  it('returns the whole object including nested braces', () => {
    expect(extractJsonText('x {"a": {"b": 1}} y')).toBe('{"a": {"b": 1}}');
  });
});
