/**
 * Pull a JSON object out of whatever the model actually sent.
 *
 * Asking for `response_format: json_object` makes this unnecessary most of the time,
 * which is exactly why it has to exist: the one reply in a thousand that arrives
 * wrapped in a code fence or with a sentence in front of it should not become an
 * exception in a request that was otherwise fine.
 */
export function extractJsonText(raw: string): string {
  let text = raw.trim();
  if (!text) return text;

  const fenced = text.match(/```(?:json|jsonc)?\s*([\s\S]*?)```/i);
  if (fenced) text = fenced[1].trim();

  const start = text.search(/[{[]/);
  if (start === -1) return text;

  const open = text[start];
  const close = open === '{' ? '}' : ']';
  let depth = 0;
  let inString = false;
  let escaped = false;

  // Counting brackets rather than matching the last one: a closing brace inside a
  // string is not the end of the object, and a description field is full of them.
  for (let i = start; i < text.length; i++) {
    const char = text[i];

    if (inString) {
      if (escaped) {
        escaped = false;
      } else if (char === '\\') {
        escaped = true;
      } else if (char === '"') {
        inString = false;
      }
      continue;
    }

    if (char === '"') {
      inString = true;
    } else if (char === open) {
      depth += 1;
    } else if (char === close) {
      depth -= 1;
      if (depth === 0) return text.slice(start, i + 1);
    }
  }

  return text.slice(start).trim();
}

/** Curly quotes, which a model picks up from the text it was given, break `JSON.parse`. */
function normalizeQuotes(text: string): string {
  return text
    .replace(/[“”„‟]/g, '"')
    .replace(/[‘’‚‛]/g, "'");
}

/** A trailing comma before a closing brace is the other mistake models make. */
function dropTrailingCommas(text: string): string {
  return text.replace(/,(\s*[}\]])/g, '$1');
}

/** Parse JSON out of a model's reply, or throw what `JSON.parse` threw. */
export function parseJsonFromLlm<T = unknown>(raw: string): T {
  const text = normalizeQuotes(extractJsonText(raw));

  const attempts = [text, dropTrailingCommas(text)];
  let lastError: unknown;

  for (const attempt of attempts) {
    try {
      return JSON.parse(attempt) as T;
    } catch (error) {
      lastError = error;
    }
  }

  throw lastError instanceof Error ? lastError : new Error('Failed to parse LLM JSON');
}
