// Genera icon-192.png e icon-512.png (pelota de pádel sobre fondo oscuro) sin dependencias.
const zlib = require('zlib');
const fs = require('fs');

const crcTable = [];
for (let n = 0; n < 256; n++) {
  let c = n;
  for (let k = 0; k < 8; k++) c = c & 1 ? 0xEDB88320 ^ (c >>> 1) : c >>> 1;
  crcTable[n] = c >>> 0;
}
function crc32(buf) {
  let c = 0xFFFFFFFF;
  for (const b of buf) c = crcTable[(c ^ b) & 0xFF] ^ (c >>> 8);
  return (c ^ 0xFFFFFFFF) >>> 0;
}
function chunk(type, data) {
  const len = Buffer.alloc(4);
  len.writeUInt32BE(data.length);
  const td = Buffer.concat([Buffer.from(type, 'ascii'), data]);
  const crc = Buffer.alloc(4);
  crc.writeUInt32BE(crc32(td));
  return Buffer.concat([len, td, crc]);
}
function png(S, pixels) {
  const sig = Buffer.from([137, 80, 78, 71, 13, 10, 26, 10]);
  const ihdr = Buffer.alloc(13);
  ihdr.writeUInt32BE(S, 0);
  ihdr.writeUInt32BE(S, 4);
  ihdr[8] = 8;  // bit depth
  ihdr[9] = 6;  // RGBA
  const raw = Buffer.alloc(S * (S * 4 + 1));
  for (let y = 0; y < S; y++) {
    raw[y * (S * 4 + 1)] = 0; // filtro: none
    pixels.copy(raw, y * (S * 4 + 1) + 1, y * S * 4, (y + 1) * S * 4);
  }
  const idat = zlib.deflateSync(raw, { level: 9 });
  return Buffer.concat([sig, chunk('IHDR', ihdr), chunk('IDAT', idat), chunk('IEND', Buffer.alloc(0))]);
}

const clamp01 = v => (v < 0 ? 0 : v > 1 ? 1 : v);
const byte = v => Math.max(0, Math.min(255, Math.round(v)));

function drawIcon(S) {
  const px = Buffer.alloc(S * S * 4);
  const cx = S * 0.5, cy = S * 0.5, R = S * 0.33;
  const aa = Math.max(1.2, S / 180);          // ancho de antialias en px
  const cov = d => clamp01(0.5 - d / aa);     // cobertura: d<0 adentro

  for (let y = 0; y < S; y++) {
    const t = y / S;
    const bgR = 21 + (11 - 21) * t, bgG = 36 + (18 - 36) * t, bgB = 63 + (32 - 63) * t;
    for (let x = 0; x < S; x++) {
      let r = bgR, g = bgG, b = bgB;
      const dx = x - cx, dy = y - cy;
      const d1 = Math.hypot(dx, dy) - R;
      const aBall = cov(d1);
      if (aBall > 0) {
        // pelota teal con brillo arriba-izquierda
        const h = clamp01(1 - ((dx + dy) / (2.2 * R) + 0.5));
        let br = 45 + h * 60, bgc = 212 + h * 25, bb = 191 + h * 30;
        // costuras: dos arcos blancos
        const sw = S * 0.04;
        const sR = R * 1.10, off = R * 1.30;
        const dL = Math.abs(Math.hypot(x - (cx - off), dy) - sR) - sw / 2;
        const dRt = Math.abs(Math.hypot(x - (cx + off), dy) - sR) - sw / 2;
        const aSeam = Math.max(cov(dL), cov(dRt)) * clamp01(-d1 / sw);
        br += (232 - br) * aSeam; bgc += (238 - bgc) * aSeam; bb += (252 - bb) * aSeam;
        r += (br - r) * aBall; g += (bgc - g) * aBall; b += (bb - b) * aBall;
      }
      const i = (y * S + x) * 4;
      px[i] = byte(r); px[i + 1] = byte(g); px[i + 2] = byte(b); px[i + 3] = 255;
    }
  }
  return px;
}

for (const S of [192, 512]) {
  fs.writeFileSync(`${__dirname}/icon-${S}.png`, png(S, drawIcon(S)));
  console.log(`icon-${S}.png listo`);
}
