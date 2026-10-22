const fs = require('node:fs');
const zlib = require('node:zlib');
const path = require('node:path');

const size = 1024;
const pixels = Buffer.alloc(size * (size * 4 + 1));
const shell = [41, 51, 61];
const border = [123, 143, 150];
const screen = [10, 27, 28];
const green = [178, 234, 112];
const barTops = [482, 378, 438, 315, 405];
const barXs = [252, 354, 456, 558, 660];

for (let y = 0; y < size; y++) {
  const row = y * (size * 4 + 1);
  for (let x = 0; x < size; x++) {
    const offset = row + 1 + x * 4;
    if (x < 78 || x > 946 || y < 78 || y > 946) continue;
    let color = shell;
    if (x < 106 || x > 918 || y < 106 || y > 918) color = border;
    if (x >= 170 && x <= 854 && y >= 218 && y <= 782) color = screen;
    for (let bar = 0; bar < barXs.length; bar++) {
      if (x >= barXs[bar] && x < barXs[bar] + 62 && y >= barTops[bar] && y < 700) {
        color = green;
        break;
      }
    }
    if (y >= 838 && y <= 856 && x >= 170 && x <= 438) color = green;
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
