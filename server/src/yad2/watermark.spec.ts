import sharp from 'sharp';
import { withWatermark } from './watermark.js';

const average = (buffer: Buffer) => {
  let sum = 0;
  for (const byte of buffer) sum += byte;
  return sum / buffer.length;
};

describe('withWatermark', () => {
  it('changes the bottom-right corner and leaves the middle alone', async () => {
    const plain = await sharp({
      create: { width: 400, height: 240, channels: 3, background: { r: 180, g: 30, b: 30 } },
    })
      .jpeg()
      .toBuffer();

    const marked = await withWatermark(plain);
    const middle = await sharp(marked).extract({ left: 40, top: 40, width: 40, height: 40 }).raw().toBuffer();
    const corner = await sharp(marked).extract({ left: 300, top: 190, width: 90, height: 40 }).raw().toBuffer();
    const plainCorner = await sharp(plain).extract({ left: 300, top: 190, width: 90, height: 40 }).raw().toBuffer();

    expect(average(middle)).toBeGreaterThan(70);
    expect(average(middle)).toBeLessThan(90);
    expect(average(corner)).not.toBeCloseTo(average(plainCorner), 0);
  });
});
