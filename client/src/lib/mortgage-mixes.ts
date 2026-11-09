import { TRACKS, type MixPart, type TrackKey } from '@/lib/mortgage';

/** How many of the borrower's own mixes the comparison will hold. */
export const MAX_SAVED_MIXES = 3;

const STORAGE_KEY = 'urban365.mortgageMixes';

export interface SavedMix {
  id: string;
  parts: MixPart[];
}

/**
 * The shape of a mix, ignoring the loan it was sized to.
 *
 * Two mixes that split the same way, at the same rates and terms, are the same mix
 * even when the price — and so every amount — has changed. A per-mille share is
 * coarse enough that a shekel of rounding does not look like a new decision.
 */
export function mixSignature(parts: MixPart[]): string {
  const total = parts.reduce((sum, part) => sum + part.amount, 0);
  return parts
    .map((part) => {
      const share = total > 0 ? Math.round((part.amount / total) * 1000) : 0;
      return `${part.key}@${part.annualRate}@${part.years}@${share}`;
    })
    .join('|');
}

export function sameMix(a: MixPart[], b: MixPart[]): boolean {
  return mixSignature(a) === mixSignature(b);
}

export type KeepMixStatus = 'saved' | 'duplicate' | 'full' | 'empty';

/**
 * Adds a mix to the ones already kept, or explains why it was not added.
 *
 * A fourth is refused rather than quietly dropping the oldest: the list is what the
 * comparison is made of, and a row disappearing because a new one arrived is a
 * change the reader did not ask for.
 */
export function keepMix(
  existing: SavedMix[],
  parts: MixPart[],
): { status: KeepMixStatus; mixes: SavedMix[] } {
  const amount = parts.reduce((sum, part) => sum + part.amount, 0);
  if (parts.length === 0 || amount <= 0) return { status: 'empty', mixes: existing };
  if (existing.some((saved) => sameMix(saved.parts, parts))) {
    return { status: 'duplicate', mixes: existing };
  }
  if (existing.length >= MAX_SAVED_MIXES) return { status: 'full', mixes: existing };

  return {
    status: 'saved',
    mixes: [
      ...existing,
      { id: crypto.randomUUID(), parts: parts.map((part) => ({ ...part })) },
    ],
  };
}

export function dropMix(existing: SavedMix[], id: string): SavedMix[] {
  return existing.filter((saved) => saved.id !== id);
}

const TRACK_KEYS = new Set<string>(Object.keys(TRACKS));

function isPart(value: unknown): value is MixPart {
  if (!value || typeof value !== 'object') return false;
  const part = value as Partial<MixPart>;
  return (
    typeof part.key === 'string' &&
    TRACK_KEYS.has(part.key) &&
    typeof part.amount === 'number' &&
    Number.isFinite(part.amount) &&
    typeof part.annualRate === 'number' &&
    Number.isFinite(part.annualRate) &&
    typeof part.years === 'number' &&
    Number.isFinite(part.years)
  );
}

function isSaved(value: unknown): value is SavedMix {
  if (!value || typeof value !== 'object') return false;
  const saved = value as Partial<SavedMix>;
  return typeof saved.id === 'string' && Array.isArray(saved.parts) && saved.parts.every(isPart);
}

/** What this browser has kept. Anything unreadable is an empty list, not an error. */
export function loadSavedMixes(storage: Pick<Storage, 'getItem'> = localStorage): SavedMix[] {
  try {
    const raw = storage.getItem(STORAGE_KEY);
    if (!raw) return [];
    const parsed: unknown = JSON.parse(raw);
    if (!Array.isArray(parsed)) return [];
    return parsed.filter(isSaved).slice(0, MAX_SAVED_MIXES).map((saved) => ({
      id: saved.id,
      parts: saved.parts.map((part) => ({ ...part, key: part.key as TrackKey })),
    }));
  } catch {
    return [];
  }
}

export function storeSavedMixes(
  mixes: SavedMix[],
  storage: Pick<Storage, 'setItem'> = localStorage,
): void {
  try {
    storage.setItem(STORAGE_KEY, JSON.stringify(mixes));
  } catch {
    // A full or blocked store means the comparison lasts for this visit only.
  }
}
