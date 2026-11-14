import { deflateSync } from "node:zlib";

/**
 * Builds small PNG files for tests, so no binary fixtures are committed.
 * Format: https://www.w3.org/TR/png-3/ (signature, then length-type-data-CRC chunks).
 */

const SIGNATURE = [0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a];

function chunk(type: string, data: Uint8Array): Uint8Array {
  const typeBytes = new TextEncoder().encode(type);
  const out = new Uint8Array(12 + data.length);
  const view = new DataView(out.buffer);
  view.setUint32(0, data.length);
  out.set(typeBytes, 4);
  out.set(data, 8);
  const crcInput = new Uint8Array(typeBytes.length + data.length);
  crcInput.set(typeBytes);
  crcInput.set(data, typeBytes.length);
  view.setUint32(8 + data.length, Bun.hash.crc32(crcInput));
  return out;
}

function header(width: number, height: number): Uint8Array {
  const data = new Uint8Array(13);
  const view = new DataView(data.buffer);
  view.setUint32(0, width);
  view.setUint32(4, height);
  data[8] = 8; // bit depth
  data[9] = 2; // colour type: truecolour (RGB)
  return data;
}

function concat(parts: Uint8Array[]): Uint8Array {
  const out = new Uint8Array(parts.reduce((sum, part) => sum + part.length, 0));
  let offset = 0;
  for (const part of parts) {
    out.set(part, offset);
    offset += part.length;
  }
  return out;
}

export interface PngOptions {
  /** A `tEXt` chunk, standing in for metadata such as a camera's location. */
  text?: string;
}

/** A `width` × `height` RGB PNG in a gradient. */
export function png(
  width: number,
  height: number,
  { text }: PngOptions = {},
): Uint8Array {
  const rows = new Uint8Array(height * (1 + width * 3));
  for (let y = 0; y < height; y += 1) {
    const row = y * (1 + width * 3);
    rows[row] = 0; // filter: none
    for (let x = 0; x < width; x += 1) {
      const pixel = row + 1 + x * 3;
      rows[pixel] = (x * 255) / Math.max(1, width - 1);
      rows[pixel + 1] = (y * 255) / Math.max(1, height - 1);
      rows[pixel + 2] = 128;
    }
  }
  return concat([
    Uint8Array.from(SIGNATURE),
    chunk("IHDR", header(width, height)),
    ...(text ? [chunk("tEXt", new TextEncoder().encode(`Comment\0${text}`))] : []),
    chunk("IDAT", deflateSync(rows)),
    chunk("IEND", new Uint8Array()),
  ]);
}

/** A PNG whose header claims `width` × `height` but carries almost no pixels. */
export function pngClaiming(width: number, height: number): Uint8Array {
  return concat([
    Uint8Array.from(SIGNATURE),
    chunk("IHDR", header(width, height)),
    chunk("IDAT", deflateSync(new Uint8Array(16))),
    chunk("IEND", new Uint8Array()),
  ]);
}
