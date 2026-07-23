#!/usr/bin/env node
// Hand-rolled PNG icon generator: no rsvg-convert/ImageMagick on this VM, so we
// rasterize a simple flat design (dark rounded-square background, a stylized
// blue route polyline, a violet "ghost" dot) directly onto an RGB pixel buffer
// and encode it as PNG ourselves (zlib for the DEFLATE/IDAT stream, hand-rolled
// CRC32 for chunk checksums). No external deps beyond node's built-in zlib.
//
// Run: node scripts/make-icons.mjs
// Writes public/icons/icon-180.png, icon-192.png, icon-512.png.

import { deflateSync } from 'node:zlib';
import { writeFileSync, mkdirSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import path from 'node:path';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const outDir = path.join(__dirname, '..', 'public', 'icons');
mkdirSync(outDir, { recursive: true });

const BG = [11, 13, 16]; // #0b0d10
const BLUE = [59, 130, 246]; // #3b82f6
const VIOLET = [139, 92, 246]; // #8b5cf6

// Route polyline control points, normalized [0,1] coords (y down).
const ROUTE = [
  [0.16, 0.80],
  [0.30, 0.68],
  [0.38, 0.50],
  [0.58, 0.46],
  [0.66, 0.30],
  [0.84, 0.20]
];
const ROUTE_THICKNESS_FRAC = 0.085;
const GHOST_CENTER = ROUTE[ROUTE.length - 1];
const GHOST_RADIUS_FRAC = 0.11;
const GHOST_OPACITY = 0.82;
const START_DOT_CENTER = ROUTE[0];
const START_DOT_RADIUS_FRAC = 0.055;

function blend(base, color, alpha) {
  return [
    Math.round(base[0] * (1 - alpha) + color[0] * alpha),
    Math.round(base[1] * (1 - alpha) + color[1] * alpha),
    Math.round(base[2] * (1 - alpha) + color[2] * alpha)
  ];
}

function distToSegment(px, py, ax, ay, bx, by) {
  const abx = bx - ax;
  const aby = by - ay;
  const lenSq = abx * abx + aby * aby;
  let t = lenSq === 0 ? 0 : ((px - ax) * abx + (py - ay) * aby) / lenSq;
  t = Math.max(0, Math.min(1, t));
  const cx = ax + t * abx;
  const cy = ay + t * aby;
  const dx = px - cx;
  const dy = py - cy;
  return Math.sqrt(dx * dx + dy * dy);
}

function renderIcon(size) {
  const pixels = new Uint8Array(size * size * 3);
  const thicknessPx = ROUTE_THICKNESS_FRAC * size;
  const ghostRadiusPx = GHOST_RADIUS_FRAC * size;
  const startRadiusPx = START_DOT_RADIUS_FRAC * size;
  const ghostCx = GHOST_CENTER[0] * size;
  const ghostCy = GHOST_CENTER[1] * size;
  const startCx = START_DOT_CENTER[0] * size;
  const startCy = START_DOT_CENTER[1] * size;

  const routePx = ROUTE.map(([x, y]) => [x * size, y * size]);

  for (let y = 0; y < size; y++) {
    for (let x = 0; x < size; x++) {
      let color = BG;

      // Route polyline: thick capsule strokes between consecutive points.
      let minDist = Infinity;
      for (let i = 0; i < routePx.length - 1; i++) {
        const [ax, ay] = routePx[i];
        const [bx, by] = routePx[i + 1];
        const d = distToSegment(x + 0.5, y + 0.5, ax, ay, bx, by);
        if (d < minDist) minDist = d;
      }
      if (minDist <= thicknessPx / 2) {
        color = BLUE;
      }

      // Solid start dot (current-position marker).
      const dStart = Math.hypot(x + 0.5 - startCx, y + 0.5 - startCy);
      if (dStart <= startRadiusPx) {
        color = BLUE;
      }

      // Translucent ghost dot at the route's far end, blended over whatever
      // is beneath it (bg or route line).
      const dGhost = Math.hypot(x + 0.5 - ghostCx, y + 0.5 - ghostCy);
      if (dGhost <= ghostRadiusPx) {
        color = blend(color, VIOLET, GHOST_OPACITY);
      }

      const idx = (y * size + x) * 3;
      pixels[idx] = color[0];
      pixels[idx + 1] = color[1];
      pixels[idx + 2] = color[2];
    }
  }

  return pixels;
}

// ---- Minimal PNG encoder (RGB, 8-bit, filter type 0 per scanline) ----

const CRC_TABLE = (() => {
  const table = new Uint32Array(256);
  for (let n = 0; n < 256; n++) {
    let c = n;
    for (let k = 0; k < 8; k++) {
      c = c & 1 ? 0xedb88320 ^ (c >>> 1) : c >>> 1;
    }
    table[n] = c >>> 0;
  }
  return table;
})();

function crc32(buf) {
  let c = 0xffffffff;
  for (let i = 0; i < buf.length; i++) {
    c = CRC_TABLE[(c ^ buf[i]) & 0xff] ^ (c >>> 8);
  }
  return (c ^ 0xffffffff) >>> 0;
}

function chunk(type, data) {
  const typeBuf = Buffer.from(type, 'ascii');
  const lenBuf = Buffer.alloc(4);
  lenBuf.writeUInt32BE(data.length, 0);
  const crcBuf = Buffer.alloc(4);
  crcBuf.writeUInt32BE(crc32(Buffer.concat([typeBuf, data])), 0);
  return Buffer.concat([lenBuf, typeBuf, data, crcBuf]);
}

function encodePng(pixels, size) {
  const signature = Buffer.from([137, 80, 78, 71, 13, 10, 26, 10]);

  const ihdrData = Buffer.alloc(13);
  ihdrData.writeUInt32BE(size, 0); // width
  ihdrData.writeUInt32BE(size, 4); // height
  ihdrData[8] = 8; // bit depth
  ihdrData[9] = 2; // color type: RGB (truecolor, no alpha)
  ihdrData[10] = 0; // compression
  ihdrData[11] = 0; // filter
  ihdrData[12] = 0; // interlace

  const bytesPerRow = size * 3;
  const raw = Buffer.alloc((bytesPerRow + 1) * size);
  for (let y = 0; y < size; y++) {
    const rowStart = y * (bytesPerRow + 1);
    raw[rowStart] = 0; // filter type 0 (none)
    pixels.copy(raw, rowStart + 1, y * bytesPerRow, (y + 1) * bytesPerRow);
  }

  const idatData = deflateSync(raw, { level: 9 });

  return Buffer.concat([
    signature,
    chunk('IHDR', ihdrData),
    chunk('IDAT', idatData),
    chunk('IEND', Buffer.alloc(0))
  ]);
}

const sizes = [180, 192, 512];
for (const size of sizes) {
  const pixels = renderIcon(size);
  const png = encodePng(Buffer.from(pixels), size);
  const outPath = path.join(outDir, `icon-${size}.png`);
  writeFileSync(outPath, png);
  console.log(`wrote ${outPath} (${png.length} bytes)`);
}
