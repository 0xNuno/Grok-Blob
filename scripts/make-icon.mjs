/**
 * Build macOS app icons from a procedural Blob mark (brown circle on dark).
 * Writes:
 *   build/icon.png          (1024)
 *   build/icon.icns         (via iconutil on macOS)
 *   build/icons/icon.iconset
 * Also refreshes tray templates via make-tray logic (black template).
 */
import { deflateSync } from "node:zlib";
import { existsSync, mkdirSync, rmSync, writeFileSync, cpSync } from "node:fs";
import { join, dirname } from "node:path";
import { fileURLToPath } from "node:url";
import { execFileSync } from "node:child_process";

const root = join(dirname(fileURLToPath(import.meta.url)), "..");
const buildDir = join(root, "build");
const iconset = join(buildDir, "icon.iconset");

function crc32(buf) {
  let c = ~0;
  for (let i = 0; i < buf.length; i++) {
    c ^= buf[i];
    for (let k = 0; k < 8; k++) c = (c >>> 1) ^ (c & 1 ? 0xedb88320 : 0);
  }
  return ~c >>> 0;
}

function chunk(type, data) {
  const typeBuf = Buffer.from(type);
  const len = Buffer.alloc(4);
  len.writeUInt32BE(data.length);
  const crcBuf = Buffer.alloc(4);
  crcBuf.writeUInt32BE(crc32(Buffer.concat([typeBuf, data])));
  return Buffer.concat([len, typeBuf, data, crcBuf]);
}

/** App icon: warm sand blob (#d4b48a) on deep brown (#141210). */
function pngColor(size) {
  const raw = [];
  const cx = (size - 1) / 2;
  const r = size * 0.38;
  const bg = [0x14, 0x12, 0x10, 255];
  const fill = [0xd4, 0xb4, 0x8a, 255];
  const hi = [0xf0, 0xe2, 0xc8, 255];
  for (let y = 0; y < size; y++) {
    raw.push(0);
    for (let x = 0; x < size; x++) {
      const dx = x - cx;
      const dy = y - cx;
      const d = Math.hypot(dx, dy);
      let px = bg;
      if (d < r + 0.8) {
        let a = 255;
        if (d > r - 0.8) a = Math.round(255 * (1 - (d - (r - 0.8)) / 1.6));
        // soft highlight toward top-left
        const t = Math.max(0, 1 - Math.hypot(dx + r * 0.25, dy + r * 0.3) / (r * 1.1));
        const fr = Math.round(fill[0] + (hi[0] - fill[0]) * t * 0.55);
        const fg = Math.round(fill[1] + (hi[1] - fill[1]) * t * 0.55);
        const fb = Math.round(fill[2] + (hi[2] - fill[2]) * t * 0.55);
        if (a >= 255) px = [fr, fg, fb, 255];
        else {
          const inv = 1 - a / 255;
          px = [
            Math.round(fr * (a / 255) + bg[0] * inv),
            Math.round(fg * (a / 255) + bg[1] * inv),
            Math.round(fb * (a / 255) + bg[2] * inv),
            255,
          ];
        }
      }
      raw.push(px[0], px[1], px[2], px[3]);
    }
  }
  const ihdr = Buffer.alloc(13);
  ihdr.writeUInt32BE(size, 0);
  ihdr.writeUInt32BE(size, 4);
  ihdr[8] = 8;
  ihdr[9] = 6;
  const sig = Buffer.from([137, 80, 78, 71, 13, 10, 26, 10]);
  return Buffer.concat([
    sig,
    chunk("IHDR", ihdr),
    chunk("IDAT", deflateSync(Buffer.from(raw), { level: 9 })),
    chunk("IEND", Buffer.alloc(0)),
  ]);
}

mkdirSync(buildDir, { recursive: true });
mkdirSync(join(root, "assets"), { recursive: true });

const master = pngColor(1024);
writeFileSync(join(buildDir, "icon.png"), master);
console.log("wrote build/icon.png");

if (existsSync(iconset)) rmSync(iconset, { recursive: true, force: true });
mkdirSync(iconset, { recursive: true });

const sizes = [
  [16, "icon_16x16.png"],
  [32, "icon_16x16@2x.png"],
  [32, "icon_32x32.png"],
  [64, "icon_32x32@2x.png"],
  [128, "icon_128x128.png"],
  [256, "icon_128x128@2x.png"],
  [256, "icon_256x256.png"],
  [512, "icon_256x256@2x.png"],
  [512, "icon_512x512.png"],
  [1024, "icon_512x512@2x.png"],
];

for (const [size, name] of sizes) {
  writeFileSync(join(iconset, name), pngColor(size));
}

const icns = join(buildDir, "icon.icns");
try {
  execFileSync("iconutil", ["-c", "icns", iconset, "-o", icns], { stdio: "inherit" });
  console.log("wrote build/icon.icns");
} catch {
  console.warn("iconutil failed — electron-builder can still use build/icon.png");
}

// Keep tray templates in sync (black template for menu bar).
try {
  await import("./make-tray.mjs");
} catch (err) {
  console.warn("make-tray skipped:", err instanceof Error ? err.message : err);
}

console.log("blob icons ready");
