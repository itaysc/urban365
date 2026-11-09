import { describe, expect, it } from 'vitest';
import { MIX_PRESETS, rebalance } from '@/lib/mortgage';
import { dropMix, keepMix, loadSavedMixes, mixSignature, storeSavedMixes } from '@/lib/mortgage-mixes';

function memory(): Storage {
  const values = new Map<string, string>();
  return {
    get length() {
      return values.size;
    },
    clear: () => values.clear(),
    getItem: (key) => values.get(key) ?? null,
    key: (index) => [...values.keys()][index] ?? null,
    removeItem: (key) => values.delete(key),
    setItem: (key, value) => values.set(key, value),
  };
}

describe('keepMix', () => {
  const preset = MIX_PRESETS[0].build(1_000_000, 25);

  it('keeps a mix and refuses a copy of it', () => {
    const first = keepMix([], preset);
    expect(first.status).toBe('saved');
    expect(first.mixes).toHaveLength(1);

    const again = keepMix(first.mixes, rebalance(preset, 1_800_000));
    expect(again.status).toBe('duplicate');
    expect(again.mixes).toHaveLength(1);
  });

  it('stops at three', () => {
    let mixes = keepMix([], MIX_PRESETS[0].build(1_000_000, 25)).mixes;
    mixes = keepMix(mixes, MIX_PRESETS[1].build(1_000_000, 25)).mixes;
    mixes = keepMix(mixes, MIX_PRESETS[2].build(1_000_000, 25)).mixes;
    const fourth = keepMix(mixes, [{ key: 'fixed', amount: 1_000_000, annualRate: 5, years: 20 }]);
    expect(fourth.status).toBe('full');
    expect(fourth.mixes).toHaveLength(3);
  });

  it('drops by id', () => {
    const kept = keepMix([], preset).mixes;
    expect(dropMix(kept, kept[0].id)).toEqual([]);
  });

  it('treats an empty mix as nothing to keep', () => {
    expect(keepMix([], []).status).toBe('empty');
  });
});

describe('saved mixes in storage', () => {
  it('round-trips, and ignores a store it cannot read', () => {
    const box = memory();
    const kept = keepMix([], MIX_PRESETS[1].build(900_000, 20)).mixes;
    storeSavedMixes(kept, box);
    expect(loadSavedMixes(box)).toEqual(kept);

    box.setItem('urban365.mortgageMixes', '{');
    expect(loadSavedMixes(box)).toEqual([]);
  });

  it('uses the split, not the shekel amounts, as identity', () => {
    const built = MIX_PRESETS[2].build(1_000_000, 25);
    expect(mixSignature(built)).toBe(mixSignature(rebalance(built, 2_500_000)));
  });
});
