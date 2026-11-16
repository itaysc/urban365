import sharp from 'sharp';

/**
 * A small "Urban365" in the bottom-right corner.
 *
 * The fill is mostly see-through, so the photo stays the photo. White, because a
 * listing photo is rarely white in that corner, and a dark stroke at the same low
 * opacity keeps the word readable when the corner is light.
 */
export async function withWatermark(buffer: Buffer): Promise<Buffer> {
  const image = sharp(buffer, { failOn: 'none' }).rotate();
  const { width = 0, height = 0 } = await image.metadata();
  if (width < 80 || height < 80) return image.toBuffer();

  const fontSize = Math.round(Math.min(28, Math.max(13, width * 0.028)));
  const pad = Math.round(fontSize * 0.75);
  const svg = Buffer.from(
    `<svg width="${width}" height="${height}" xmlns="http://www.w3.org/2000/svg">
      <text x="${width - pad}" y="${height - pad}" text-anchor="end"
        font-family="Helvetica, Arial, sans-serif" font-size="${fontSize}" font-weight="700"
        fill="#ffffff" fill-opacity="0.32" stroke="#000000" stroke-opacity="0.18" stroke-width="0.6"
      >Urban365</text>
    </svg>`,
  );

  return image.composite([{ input: svg, top: 0, left: 0 }]).toBuffer();
}
