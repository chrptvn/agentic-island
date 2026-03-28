/**
 * Minimal PNG encoder using only Node.js built-ins.
 * Produces an unfiltered, deflate-compressed RGB PNG from a raw pixel buffer.
 */

import { deflateSync } from "node:zlib";

// Pre-computed CRC32 lookup table
const crcTable: Uint32Array = (() => {
  const table = new Uint32Array(256);
  for (let n = 0; n < 256; n++) {
    let c = n;
    for (let k = 0; k < 8; k++) {
      c = c & 1 ? 0xedb88320 ^ (c >>> 1) : c >>> 1;
    }
    table[n] = c;
  }
  return table;
})();

function crc32(buf: Uint8Array): number {
  let crc = 0xffffffff;
  for (let i = 0; i < buf.length; i++) {
    crc = crcTable[(crc ^ buf[i]) & 0xff] ^ (crc >>> 8);
  }
  return (crc ^ 0xffffffff) >>> 0;
}

function writeUint32BE(buf: Uint8Array, offset: number, value: number): void {
  buf[offset] = (value >>> 24) & 0xff;
  buf[offset + 1] = (value >>> 16) & 0xff;
  buf[offset + 2] = (value >>> 8) & 0xff;
  buf[offset + 3] = value & 0xff;
}

function makeChunk(type: string, data: Uint8Array): Uint8Array {
  const chunk = new Uint8Array(4 + 4 + data.length + 4);
  // Length
  writeUint32BE(chunk, 0, data.length);
  // Type
  for (let i = 0; i < 4; i++) chunk[4 + i] = type.charCodeAt(i);
  // Data
  chunk.set(data, 8);
  // CRC over type + data
  const crcBuf = new Uint8Array(4 + data.length);
  for (let i = 0; i < 4; i++) crcBuf[i] = type.charCodeAt(i);
  crcBuf.set(data, 4);
  writeUint32BE(chunk, 8 + data.length, crc32(crcBuf));
  return chunk;
}

const PNG_SIGNATURE = new Uint8Array([137, 80, 78, 71, 13, 10, 26, 10]);

/**
 * Encode an RGB pixel buffer as a PNG image.
 *
 * @param width  Image width in pixels
 * @param height Image height in pixels
 * @param rgb    Raw RGB pixel data (length must be width × height × 3)
 * @returns PNG file as a Buffer
 */
export function encodePNG(
  width: number,
  height: number,
  rgb: Uint8Array,
): Buffer {
  // IHDR: width(4) + height(4) + bitDepth(1) + colorType(1) + compression(1) + filter(1) + interlace(1)
  const ihdrData = new Uint8Array(13);
  writeUint32BE(ihdrData, 0, width);
  writeUint32BE(ihdrData, 4, height);
  ihdrData[8] = 8; // 8-bit depth
  ihdrData[9] = 2; // RGB color type
  ihdrData[10] = 0; // deflate compression
  ihdrData[11] = 0; // adaptive filtering
  ihdrData[12] = 0; // no interlace

  // Raw image data: each row gets a filter byte (0 = None) prepended
  const rowLen = width * 3;
  const raw = new Uint8Array(height * (1 + rowLen));
  for (let y = 0; y < height; y++) {
    const rowOffset = y * (1 + rowLen);
    raw[rowOffset] = 0; // filter: None
    raw.set(rgb.subarray(y * rowLen, y * rowLen + rowLen), rowOffset + 1);
  }

  const compressed = deflateSync(Buffer.from(raw));

  const ihdr = makeChunk("IHDR", ihdrData);
  const idat = makeChunk("IDAT", new Uint8Array(compressed));
  const iend = makeChunk("IEND", new Uint8Array(0));

  const png = Buffer.alloc(
    PNG_SIGNATURE.length + ihdr.length + idat.length + iend.length,
  );
  let offset = 0;
  png.set(PNG_SIGNATURE, offset);
  offset += PNG_SIGNATURE.length;
  png.set(ihdr, offset);
  offset += ihdr.length;
  png.set(idat, offset);
  offset += idat.length;
  png.set(iend, offset);

  return png;
}
