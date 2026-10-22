const fs = require('node:fs');
const zlib = require('node:zlib');
const path = require('node:path');

const size = 1024;
const pixels = Buffer.alloc(size * (size * 4 + 1));
const dark = [23, 34, 27];
const lime = [199, 243, 106];
const barTops = [458, 338, 410, 254, 365];
const barXs = [220, 344, 468, 592, 716];

function insideRoundRect(x, y, left, top, right, bottom, radius) {
  const cx = Math.max(left + radius, Math.min(right - radius, x));
  const cy = Math.max(top + radius, Math.min(bottom - radius, y));
  return (x - cx) ** 2 + (y - cy) ** 2 <= radius ** 2;
}

for (let y = 0; y < size; y++) {
  const row = y * (size * 4 + 1);
  for (let x = 0; x < size; x++) {
    const offset = row + 1 + x * 4;
    if (!insideRoundRect(x, y, 58, 58, 966, 966, 180)) continue;
    let color = lime;
    const skewX = x + (y - 512) * 0.075;
    for (let bar = 0; bar < barXs.length; bar++) {
      if (insideRoundRect(skewX, y, barXs[bar], barTops[bar], barXs[bar] + 72, 760, 29)) {
        color = dark;
        break;
      }
    }
    pixels[offset] = color[0];
    pixels[offset + 1] = color[1];
    pixels[offset + 2] = color[2];
    pixels[offset + 3] = 255;
  }
}

const crcTable = Array.from({ length: 256 }, (_, n) => {
  let crc = n;
  for (let bit = 0; bit < 8; bit++) crc = crc & 1 ? 0xedb88320 ^ (crc >>> 1) : crc >>> 1;
  return crc >>> 0;
});
function chunk(type, data) {
  const name = Buffer.from(type);
  const content = Buffer.concat([name, data]);
  let crc = 0xffffffff;
  for (const byte of content) crc = crcTable[(crc ^ byte) & 255] ^ (crc >>> 8);
  const output = Buffer.alloc(8 + data.length + 4);
  output.writeUInt32BE(data.length, 0);
  content.copy(output, 4);
  output.writeUInt32BE((crc ^ 0xffffffff) >>> 0, output.length - 4);
  return output;
}
const header = Buffer.alloc(13);
header.writeUInt32BE(size, 0);
header.writeUInt32BE(size, 4);
header[8] = 8;
header[9] = 6;
const png = Buffer.concat([
  Buffer.from([137, 80, 78, 71, 13, 10, 26, 10]),
  chunk('IHDR', header),
  chunk('IDAT', zlib.deflateSync(pixels, { level: 9 })),
  chunk('IEND', Buffer.alloc(0))
]);
const output = path.join(__dirname, '..', 'build', 'icon.png');
fs.mkdirSync(path.dirname(output), { recursive: true });
fs.writeFileSync(output, png);
console.log(`Generated ${output}`);
