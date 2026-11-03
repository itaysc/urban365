import { createReadStream } from 'node:fs';
import { open } from 'node:fs/promises';

/**
 * Just enough of the shapefile format to read the parcels layer.
 *
 * A dependency would also have done, but the format is thirty years old and frozen,
 * this reads two shape types out of the fourteen that exist, and the file is 1.1 GB —
 * which rules out every library that hands back an array. What is here streams.
 *
 * The parts used: `.shp` holds the geometry records back to back, `.dbf` holds one
 * fixed-width attribute row each in the same order, and the two are joined by
 * position. `.shx` is an index we do not need for a full pass.
 */

const POLYGON = 5;
const POLYGON_Z = 15;

export interface DbfField {
  name: string;
  length: number;
  offset: number;
}

export interface ShapefileRecord {
  /** Attribute values, already decoded. Hebrew arrives as CP1255. */
  attributes: Record<string, string>;
  /** Rings in file order, each a list of [x, y] in the file's own projection. */
  rings: number[][][];
}

/** The dBase header: how many rows, how wide, and where each field sits in one. */
export async function readDbfHeader(path: string): Promise<{
  count: number;
  headerLength: number;
  recordLength: number;
  fields: DbfField[];
}> {
  const file = await open(path, 'r');
  try {
    const head = Buffer.alloc(32);
    await file.read(head, 0, 32, 0);

    const count = head.readUInt32LE(4);
    const headerLength = head.readUInt16LE(8);
    const recordLength = head.readUInt16LE(10);

    const descriptors = Buffer.alloc(headerLength - 32);
    await file.read(descriptors, 0, descriptors.length, 32);

    const fields: DbfField[] = [];
    // The first byte of a record is the deletion flag, so fields start at 1.
    let offset = 1;
    for (let at = 0; at + 32 <= descriptors.length; at += 32) {
      if (descriptors[at] === 0x0d || descriptors[at] === 0) break;
      const name = descriptors.subarray(at, at + 11).toString('latin1').replace(/\0.*$/, '');
      const length = descriptors[at + 16];
      fields.push({ name, length, offset });
      offset += length;
    }

    return { count, headerLength, recordLength, fields };
  } finally {
    await file.close();
  }
}

/**
 * Every record, streamed, with its attributes.
 *
 * The two files advance in lockstep: one `.shp` record and one `.dbf` row per
 * feature, matched by position and nothing else. There is no key to join on, which
 * is why both are read in one pass rather than separately.
 */
export async function* readShapefile(base: string): AsyncGenerator<ShapefileRecord> {
  const header = await readDbfHeader(`${base}.dbf`);

  const dbf = createReadStream(`${base}.dbf`, { start: header.headerLength });
  const shp = createReadStream(`${base}.shp`, { start: 100 });

  const rows = chunks(dbf, header.recordLength);

  for await (const shape of shapes(shp)) {
    const { value: row, done } = await rows.next();
    if (done) break;

    const attributes: Record<string, string> = {};
    for (const field of header.fields) {
      attributes[field.name] = row
        .subarray(field.offset, field.offset + field.length)
        // CP1255 is the Hebrew code page dBase files from here are written in; read
        // as latin1 or utf8 every Hebrew name comes out as mojibake.
        .toString('latin1')
        .trim();
      // Node has no CP1255 decoder built in, so Hebrew is mapped below.
      attributes[field.name] = fromCp1255(attributes[field.name]);
    }

    yield { attributes, rings: shape };
  }
}

/**
 * CP1255 → Unicode for the Hebrew range.
 *
 * Node's `Buffer` knows latin1 and utf8 and not this, and `TextDecoder('windows-1255')`
 * is not in the Node build either. The only bytes that differ from latin1 in the data
 * are 0xE0–0xFA, which map straight onto א–ת.
 */
function fromCp1255(latin1: string): string {
  let out = '';
  for (const char of latin1) {
    const code = char.charCodeAt(0);
    out += code >= 0xe0 && code <= 0xfa ? String.fromCharCode(code - 0xe0 + 0x05d0) : char;
  }
  return out;
}

/** Fixed-width records out of a stream. */
async function* chunks(stream: NodeJS.ReadableStream, size: number): AsyncGenerator<Buffer> {
  let held = Buffer.alloc(0);

  for await (const piece of stream) {
    held = Buffer.concat([held, piece as Buffer]);
    while (held.length >= size) {
      yield held.subarray(0, size);
      held = held.subarray(size);
    }
  }
}

/** Polygon rings out of the `.shp` stream, one array per record. */
async function* shapes(stream: NodeJS.ReadableStream): AsyncGenerator<number[][][]> {
  let held = Buffer.alloc(0);

  for await (const piece of stream) {
    held = Buffer.concat([held, piece as Buffer]);

    for (;;) {
      // Record header: 8 bytes, the second word being the content length.
      if (held.length < 8) break;
      const contentWords = held.readInt32BE(4);
      const total = 8 + contentWords * 2;
      if (held.length < total) break;

      yield rings(held.subarray(8, total));
      held = held.subarray(total);
    }
  }
}

function rings(record: Buffer): number[][][] {
  const type = record.readInt32LE(0);
  if (type !== POLYGON && type !== POLYGON_Z) return [];

  const partCount = record.readInt32LE(36);
  const pointCount = record.readInt32LE(40);

  const starts: number[] = [];
  for (let i = 0; i < partCount; i += 1) starts.push(record.readInt32LE(44 + i * 4));

  const pointsAt = 44 + partCount * 4;
  const out: number[][][] = [];

  for (let part = 0; part < partCount; part += 1) {
    const from = starts[part];
    const to = part + 1 < partCount ? starts[part + 1] : pointCount;

    const ring: number[][] = [];
    for (let i = from; i < to; i += 1) {
      const at = pointsAt + i * 16;
      ring.push([record.readDoubleLE(at), record.readDoubleLE(at + 8)]);
    }
    out.push(ring);
  }

  return out;
}
