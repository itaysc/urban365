/**
 * A hand-check of the valuation against real places.
 *
 *   npm run try:valuation
 *
 * Not a test — a way to look at what the thing actually says before trusting it.
 * The three cases are the density extremes the method has to survive: a dense city,
 * a thin one, and a village where the only right answer is to refuse.
 */
import { NestFactory } from '@nestjs/core';
import { AppModule } from '../app.module.js';
import { ValuationService, type ValuationRequest } from '../valuation/valuation.service.js';

const BLANK = {
  floor: null, topFloor: null, hasLift: null, condition: null, hasParking: null,
  hasStorage: null, hasBalcony: null, hasMamad: null, aspect: null,
  buildingState: null, renewal: null,
} as const;

const CASES: { label: string; request: ValuationRequest }[] = [
  {
    label: 'תל אביב — 6108/730, 3 rooms 75 m² (dense)',
    request: {
      city: 'תל אביב יפו', latitude: 32.087667, longitude: 34.797374,
      gush: 6108, chelka: 730, settlementCode: 5000,
      rooms: 3, area: 75, attributes: { ...BLANK }, market: 'balanced',
    },
  },
  {
    label: 'רמלה — 5932/37, 4 rooms 95 m² (135 recorded sales on the parcel)',
    request: {
      city: 'רמלה', latitude: 31.917175, longitude: 34.867042,
      gush: 5932, chelka: 37, settlementCode: 8500,
      rooms: 4, area: 95, attributes: { ...BLANK }, market: 'buyers',
    },
  },
  {
    label: 'דימונה — 4 rooms 100 m² (thin, and the exponent inverts)',
    request: {
      city: 'דימונה', latitude: 31.0686, longitude: 35.0325,
      gush: null, chelka: null, settlementCode: 2200,
      rooms: 4, area: 100, attributes: { ...BLANK }, market: 'buyers',
    },
  },
  {
    label: 'יבנאל — 4 rooms 110 m² (must refuse)',
    request: {
      city: 'יבנאל', latitude: 32.7049, longitude: 35.5024,
      gush: null, chelka: null, settlementCode: 61,
      rooms: 4, area: 110, attributes: { ...BLANK }, market: 'balanced',
    },
  },
  {
    label: 'רמלה — same flat, fully specified and well equipped',
    request: {
      city: 'רמלה', latitude: 31.917175, longitude: 34.867042,
      gush: 5932, chelka: 37, settlementCode: 8500,
      rooms: 4, area: 95, market: 'buyers',
      attributes: {
        floor: 5, topFloor: 8, hasLift: true, condition: 'renovated',
        hasParking: true, hasStorage: true, hasBalcony: true, hasMamad: true,
        aspect: 'open', buildingState: 'well-kept', renewal: 'none',
      },
    },
  },
];

const nis = (n: number | null) => (n === null ? '—' : `₪${n.toLocaleString('en-US')}`);

async function main() {
  const app = await NestFactory.createApplicationContext(AppModule, { logger: ['error'] });
  const service = app.get(ValuationService);

  try {
    for (const { label, request } of CASES) {
      const started = Date.now();
      const result = await service.value(request);
      const took = Date.now() - started;
      const w = result.workings;

      console.log(`\n── ${label}`);
      console.log(`   verdict ${result.verdict}  (${took} ms)`);

      if (result.range) {
        console.log(`   ${nis(result.range.low)} – ${nis(result.range.high)}   ` +
          `width ${(result.range.widthFromFloor * 100).toFixed(1)}% from the floor`);
        console.log(`   expected ${nis(result.range.expected)} · advertise ${nis(result.range.asking)}`);
      }

      console.log(`   rate ${w.pooledRate ? Math.round(w.pooledRate).toLocaleString() : '—'}/m²` +
        ` · b ${w.elasticity.b.toFixed(3)} (${w.elasticity.source})` +
        ` · era ${w.reference?.yearBuilt ?? '—'}` +
        ` · Q ${w.quality ? w.quality.q.toFixed(3) : '—'}${w.quality?.clamped ? ' (clamped)' : ''}`);
      console.log(`   comps ${w.comps.length} · effN ${w.effective.toFixed(1)}` +
        ` · Σw ${w.weightSum.toFixed(1)} · spread ${(w.spread * 100).toFixed(1)}%`);

      const byTier = new Map<string, number>();
      for (const c of w.comps) byTier.set(c.tier, (byTier.get(c.tier) ?? 0) + 1);
      if (byTier.size) console.log(`   tiers ${[...byTier].map(([t, n]) => `${t}:${n}`).join(' ')} · reached ${w.reachedTier}`);

      const why = new Map<string, number>();
      for (const r of w.rejected) why.set(r.reason, (why.get(r.reason) ?? 0) + 1);
      if (why.size) console.log(`   rejected ${[...why].map(([r, n]) => `${r}:${n}`).join(' ')}`);
    }
  } finally {
    await app.close();
  }
}

main().catch((e) => { console.error(e); process.exit(1); });
