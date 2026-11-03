/**
 * Putting comparable sales onto the subject's size.
 *
 * Price does not scale with floor area. A 120 m² flat is not worth a third more than a
 * 90 m² one in the same building, and the guide says so in words: *"דירות קטנות יותר
 * נמכרות בדרך כלל במחיר גבוה יותר למ״ר, וגדולות יותר במחיר נמוך יותר."* Written as
 * arithmetic, the rate per metre bends with size:
 *
 *     ppsqm ∝ area^b          →  price ∝ area^(1+b)
 *
 * With the national b of −0.19 that 120 m² flat is worth about 1.26× the 90 m² one,
 * not 1.33×. Skipping this does not add noise — it adds a *slope*, over-pricing small
 * flats and under-pricing large ones at both ends of every market, and that is the one
 * kind of error a valuation cannot have.
 *
 * ## It is a curve, not a number
 *
 * A single slope is the wrong shape for it. Measured on place-adjusted rates — each
 * sale against its own town's level, so the geography cannot do the talking — the
 * rate per metre falls steeply across the small sizes, sits flat through the middle
 * of the market, and resumes falling at the top:
 *
 * | area | 40 | 50 | 60 | 70 | 85 | 100 | 120 | 145 | 175 | 210 |
 * |---|---|---|---|---|---|---|---|---|---|---|
 * | local b | −0.46 | −0.40 | −0.27 | −0.12 | −0.03 | 0.00 | −0.01 | −0.07 | −0.15 | −0.24 |
 *
 * A 50 m² flat lives on a slope two and a half times steeper than the national
 * average, so that average under-corrects it badly — which is exactly what the
 * back-test found, with flats under 60 m² coming out six per cent low while the rest
 * of the book sat on one. A quadratic was tried first and is the wrong curve: it fits
 * the small end and then bends back upward past 110 m², predicting that very large
 * flats cost *more* per metre, which the data plainly denies.
 *
 * So the shape is carried as measured — a table of local slopes, interpolated in log
 * area and held flat outside it — and each slope is fitted over exactly the size
 * window its comparables are drawn from, 0.65 to 1.55 times the knot, the same band
 * `comps.ts` accepts.
 *
 * ## And the curve is national, though the towns are not
 *
 * Markets genuinely differ in how size is priced, and not by a little. Measured on
 * the 60–120 m² band, where the national curve is flat enough that whatever a town
 * shows is the town's own, settlements run from more than half a point steeper than
 * the country to almost half a point shallower, and a few change sign outright:
 *
 * | | n | own slope, less the national |
 * |---|---|---|
 * | אלעד | 505 | −0.614 |
 * | מודיעין | 1,179 | −0.428 |
 * | ירושלים | 8,487 | −0.143 |
 * | חיפה | 7,800 | **+0.175** |
 * | **דימונה** | 1,639 | **+0.463** |
 *
 * An earlier version of this file used figures like those, one exponent per
 * settlement. They were taken out, and the reason is worth keeping: back-tested
 * against 1,178 held-out sales they made the model very slightly **worse** — 49.9% of
 * estimates within ±10% against 51.0% without them — and worst of all in Haifa, the
 * one well-tested town with a large one, which fell from 58.6% to 50.0%.
 *
 * Haifa is also the explanation. A town-wide slope is not purely a fact about size;
 * it is partly a fact about where the large flats are. Haifa's are up the Carmel and
 * its small ones are in the lower city, so a slope fitted across the whole
 * municipality is reading a view off a floor plan. The comparables already hold
 * location still — that is what the tiers in `comps.ts` are for — so applying it
 * again on top prices the same thing twice. The national curve does not have that
 * problem: averaged over every town, one town's geography is another's noise.
 *
 * So a settlement contributes its sales to the shape rather than a slope of its own.
 * If someone wants the local term back, the burden is the back-test, not the table
 * above.
 */

/** Wide enough for a genuinely inverted market, tight enough to contain a bad fit. */
export const B_MIN = -0.5;
export const B_MAX = 0.3;

/** The single national slope. Kept as the fallback for when no shape has been fitted. */
export const NATIONAL_B = -0.193;

export interface Elasticity {
  /** The exponent actually used. */
  b: number;
  /** 'curve' is the fitted shape; 'national' means there was no shape to read. */
  source: 'curve' | 'national';
}

/** One fitted point on the national size curve. */
export interface SizeKnot {
  /** The floor area, in m², the slope was fitted around. */
  area: number;
  /** The local exponent there. */
  b: number;
  n: number;
}

export interface FittedParams {
  nationalB: number;
  /** The national shape, ascending by area. Empty falls back to `nationalB`. */
  byArea: SizeKnot[];
}

/**
 * The national slope at a given size, interpolated between the fitted knots.
 *
 * Linear in log area, which is the space the slopes were fitted in. Outside the
 * fitted range it holds at the end knot rather than running on: the curve is measured,
 * not modelled, and a measurement says nothing past where it was taken.
 */
export function shapeAt(knots: SizeKnot[], area: number): number | null {
  if (knots.length === 0) return null;

  const first = knots[0];
  const last = knots[knots.length - 1];
  if (area <= first.area) return first.b;
  if (area >= last.area) return last.b;

  for (let at = 1; at < knots.length; at += 1) {
    const above = knots[at];
    if (area > above.area) continue;

    const below = knots[at - 1];
    const span = Math.log(above.area) - Math.log(below.area);
    if (span <= 0) return above.b;

    const along = (Math.log(area) - Math.log(below.area)) / span;
    return below.b + along * (above.b - below.b);
  }

  return last.b;
}

/**
 * Which exponent applies to a flat of this size.
 *
 * The national shape, read at the subject's own area. A settlement term used to be
 * added here and is not, for the reason in this file's header: it cost accuracy
 * rather than buying it.
 */
export function elasticityFor(area: number, params: FittedParams): Elasticity {
  const shape = shapeAt(params.byArea, area);

  if (shape === null) return { b: clamp(params.nationalB), source: 'national' };

  return { b: clamp(shape), source: 'curve' };
}

export const clamp = (b: number): number => Math.min(B_MAX, Math.max(B_MIN, b));

/**
 * A comp's rate, restated as though its flat were the subject's size.
 *
 * The only size adjustment in the system. Rooms are deliberately not adjusted for as
 * well: rooms and area measure nearly the same thing, and correcting for both counts
 * it twice. Rooms earn their keep as a filter — a comp more than a room away is a
 * different property — and that is all they are asked to do.
 */
export function normaliseToSize(
  compPricePerSqm: number,
  compArea: number,
  subjectArea: number,
  b: number,
): number {
  if (compArea <= 0 || subjectArea <= 0) return compPricePerSqm;
  return compPricePerSqm * (subjectArea / compArea) ** b;
}
