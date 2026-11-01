/**
 * The card for a city we have no usable photograph of.
 *
 * Seven of thirty-three, today. A run of identical grey boxes in a grid reads as
 * something broken, so each gets a colour of its own — chosen from the city's name, so
 * it is the same colour every time the page is built rather than something that shifts
 * between reloads.
 *
 * The palette is deliberately narrow and all of it sits beside the brand's blue. The
 * point is a grid that looks composed, not a city identified by its colour: nobody can
 * learn that חריש is teal, and nothing on the page asks them to.
 */
const TILES: [string, string][] = [
  ['#1d4ed8', '#60a5fa'],
  ['#0f766e', '#5eead4'],
  ['#7c3aed', '#c4b5fd'],
  ['#b45309', '#fcd34d'],
  ['#be123c', '#fda4af'],
  ['#1e40af', '#93c5fd'],
  ['#065f46', '#6ee7b7'],
  ['#475569', '#cbd5e1'],
];

/**
 * A small stable hash of the name.
 *
 * Not a cryptographic one and not trying to be — all it has to do is spread a few
 * hundred Hebrew names across eight buckets and give the same answer tomorrow.
 */
function hash(text: string): number {
  let h = 0;
  for (let i = 0; i < text.length; i += 1) {
    h = (h * 31 + text.charCodeAt(i)) | 0;
  }
  return Math.abs(h);
}

/** The CSS gradient for a city's tile. */
export function tileGradient(city: string): string {
  const [from, to] = TILES[hash(city) % TILES.length];
  return `linear-gradient(135deg,${from},${to})`;
}
