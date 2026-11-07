/**
 * Renders every icon the site serves from the two source marks, and writes them down.
 *
 *   node scripts/make-icons.mjs
 *
 * Two sources, one family. `client/public/favicon.svg` is the small cut — a roofline
 * over a lone U — and is served as-is, because an SVG favicon is sharp at any size a
 * browser asks for. `client/brand/lockup.svg` is the large cut — the same roof over
 * "U365" — and only ever leaves this script as a PNG: at 16 px four characters are
 * noise, at 180 px they are the name.
 *
 * What comes out, and who asks for it:
 *
 *   favicon.ico              16/32/48    old browsers, and every tool that still reads /favicon.ico
 *   favicon-48.png           48          Google's result icon wants a multiple of 48
 *   apple-touch-icon.png     180         iOS home screen; square corners, iOS rounds them
 *   icon-192.png, icon-512   192/512     Android and the install prompt, via the manifest
 *   icon-512-maskable.png    512         Android's own crop; the mark sits in the safe centre
 *   og-image.png             1200×630    the picture on a shared link, everywhere
 *
 * Rendered with qlmanage, which is QuickLook — on every Mac, and the same thing the
 * previous one-off recipe used. It draws with WebKit, so the text in the lockup is set
 * in whatever "Arial Bold" resolves to on the rendering machine; the outputs are
 * committed, so a visitor's machine never needs it. No npm dependency on purpose: the
 * scripts in this folder have none, and an image pipeline is a lot of install for six
 * files that change once a year.
 *
 * The ICO is written by hand. The format is a six-byte header, a sixteen-byte entry per
 * image and then the images, and since 2008 the images may simply be PNGs — which is
 * thirty lines, against a dependency.
 *
 * One quirk: qlmanage makes thumbnails, and a thumbnail is square. Given a wide SVG it
 * scales and crops as it pleases; given a square one it draws it 1:1. So og-image.svg is
 * a 1200×1200 canvas with the 1200×630 composition in its middle band, and sips — also
 * on every Mac — cuts that band out afterwards.
 */
import { execFileSync } from 'node:child_process';
import { mkdtempSync, readFileSync, renameSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const brand = path.join(root, 'client', 'brand');
const out = path.join(root, 'client', 'public');

const FAVICON = path.join(out, 'favicon.svg');
const LOCKUP = path.join(brand, 'lockup.svg');
const OG = path.join(brand, 'og-image.svg');

/** Rasterise one SVG at `size` px on its longest edge, into `dest`. */
function render(svgPath, size, dest) {
  const dir = mkdtempSync(path.join(tmpdir(), 'make-icons-'));
  try {
    execFileSync('qlmanage', ['-t', '-s', String(size), '-o', dir, svgPath], { stdio: 'ignore' });
    renameSync(path.join(dir, `${path.basename(svgPath)}.png`), dest);
  } finally {
    rmSync(dir, { recursive: true, force: true });
  }
  console.log(`  ${path.relative(root, dest).padEnd(38)} ${size}`);
}

/**
 * The same artwork with square corners, for platforms that shape the icon themselves.
 *
 * iOS rounds a home-screen icon and paints anything transparent black; Android's
 * maskable icon is cut to a circle or a squircle by the launcher. A tile that is already
 * rounded inside either leaves a dark sliver at each corner, so these get the full-bleed
 * square — the same trick the original one-off recipe did with sed.
 */
function squared(svgPath) {
  const dir = mkdtempSync(path.join(tmpdir(), 'make-icons-'));
  const dest = path.join(dir, path.basename(svgPath));
  writeFileSync(dest, readFileSync(svgPath, 'utf8').replace(/ rx="14"/, ''));
  return { path: dest, dispose: () => rmSync(dir, { recursive: true, force: true }) };
}

/** PNGs in, one .ico out. Entries are PNG-compressed, which every browser since IE9 reads. */
function ico(images) {
  const header = Buffer.alloc(6);
  header.writeUInt16LE(0, 0); // reserved
  header.writeUInt16LE(1, 2); // 1 = icon
  header.writeUInt16LE(images.length, 4);

  let offset = 6 + 16 * images.length;
  const entries = images.map(({ size, png }) => {
    const entry = Buffer.alloc(16);
    entry.writeUInt8(size === 256 ? 0 : size, 0); // width; 0 means 256
    entry.writeUInt8(size === 256 ? 0 : size, 1); // height
    entry.writeUInt8(0, 2); // palette: none
    entry.writeUInt8(0, 3); // reserved
    entry.writeUInt16LE(1, 4); // colour planes
    entry.writeUInt16LE(32, 6); // bits per pixel
    entry.writeUInt32LE(png.length, 8);
    entry.writeUInt32LE(offset, 12);
    offset += png.length;
    return entry;
  });

  return Buffer.concat([header, ...entries, ...images.map((i) => i.png)]);
}

console.log('Rendering from favicon.svg (the tab cut):');
const icoSizes = [16, 32, 48];
const icoImages = [];
for (const size of icoSizes) {
  const dest = path.join(out, `favicon-${size}.png`);
  render(FAVICON, size, dest);
  icoImages.push({ size, png: readFileSync(dest) });
}
writeFileSync(path.join(out, 'favicon.ico'), ico(icoImages));
console.log(`  ${'client/public/favicon.ico'.padEnd(38)} ${icoSizes.join('/')}`);
// Only the 48 stays as a PNG, for Google; the others live inside the .ico.
for (const size of icoSizes.filter((s) => s !== 48)) rmSync(path.join(out, `favicon-${size}.png`));

console.log('Rendering from brand/lockup.svg (the large cut):');
render(LOCKUP, 192, path.join(out, 'icon-192.png'));
render(LOCKUP, 512, path.join(out, 'icon-512.png'));

const square = squared(LOCKUP);
try {
  render(square.path, 180, path.join(out, 'apple-touch-icon.png'));
  render(square.path, 512, path.join(out, 'icon-512-maskable.png'));
} finally {
  square.dispose();
}

console.log('Rendering from brand/og-image.svg:');
const og = path.join(out, 'og-image.png');
render(OG, 1200, og);
// Cut the 1200×630 band out of the square canvas; see the note in og-image.svg.
execFileSync('sips', ['-c', '630', '1200', '--cropOffset', '285', '0', og], { stdio: 'ignore' });

console.log('\nDone. Commit client/public; the sources are the two SVGs and this script.');
