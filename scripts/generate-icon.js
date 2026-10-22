const fs = require('node:fs');
const zlib = require('node:zlib');
const path = require('node:path');

const size = 1024;
const canvas = Buffer.alloc(size * size * 4);
const colors = {
  shadow: [1, 8, 3, 210],
  edge: [2, 13, 5, 255],
  highlight: [93, 147, 83, 255],
  metal: [21, 43, 23, 255],
  metalDark: [7, 25, 11, 255],
  screenEdge: [10, 31, 13, 255],
  screen: [2, 14, 5, 255],
  scan: [7, 25, 8, 255],
  glow: [41, 106, 30, 255],
  green: [169, 239, 96, 255],
  greenBright: [220, 255, 157, 255],
  led: [138, 214, 72, 255]
};
function pixel(x, y, color) {
  if (x < 0 || y < 0 || x >= size || y >= size) return;
  const offset = (y * size + x) * 4;
  canvas.set(color, offset);
}
function rect(x, y, width, height, color) {
  for (let row = y; row < y + height; row++) {
    for (let column = x; column < x + width; column++) pixel(column, row, color);
  }
}
function chamfer(x, y, width, height, corner, color) {
  for (let row = 0; row < height; row++) {
    const inset = Math.max(0, corner - row, corner - (height - 1 - row));
    rect(x + inset, y + row, width - inset * 2, 1, color);
  }
}
function stroke(x1, y1, x2, y2, thickness, color) {
  const steps = Math.max(Math.abs(x2 - x1), Math.abs(y2 - y1));
  for (let step = 0; step <= steps; step++) {
    const x = Math.round(x1 + (x2 - x1) * step / steps);
    const y = Math.round(y1 + (y2 - y1) * step / steps);
    rect(x - Math.floor(thickness / 2), y - Math.floor(thickness / 2), thickness, thickness, color);
  }
}

chamfer(82, 96, 860, 860, 74, colors.shadow);
chamfer(70, 70, 860, 860, 70, colors.edge);
chamfer(92, 92, 816, 816, 62, colors.highlight);
chamfer(108, 108, 784, 784, 55, colors.metal);
rect(126, 174, 748, 66, colors.metalDark);
rect(126, 174, 748, 12, colors.highlight);
rect(150, 282, 724, 470, colors.edge);
rect(166, 298, 692, 438, colors.screenEdge);
rect(184, 316, 656, 402, colors.screen);
for (let y = 324; y < 710; y += 13) rect(188, y, 648, 2, colors.scan);
for (let x = 226; x < 816; x += 79) rect(x, 654, 28, 8, colors.glow);
const waveform = [
  [226, 506], [328, 506], [380, 458], [437, 572],
  [520, 383], [593, 506], [786, 506]
];
for (let index = 1; index < waveform.length; index++) {
  stroke(...waveform[index - 1], ...waveform[index], 42, colors.glow);
  stroke(...waveform[index - 1], ...waveform[index], 24, colors.green);
  stroke(...waveform[index - 1], ...waveform[index], 9, colors.greenBright);
}
rect(180, 788, 426, 42, colors.edge);
rect(184, 792, 418, 32, colors.metalDark);
for (let x = 206; x < 580; x += 48) rect(x, 800, 26, 16, colors.highlight);
rect(764, 788, 63, 42, colors.edge);
rect(774, 796, 43, 26, colors.led);

const scanlines = Buffer.alloc(size * (size * 4 + 1));
for (let y = 0; y < size; y++) canvas.copy(scanlines, y * (size * 4 + 1) + 1, y * size * 4, (y + 1) * size * 4);
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
  chunk('IDAT', zlib.deflateSync(scanlines, { level: 9 })),
  chunk('IEND', Buffer.alloc(0))
]);
const output = path.join(__dirname, '..', 'build', 'icon.png');
fs.mkdirSync(path.dirname(output), { recursive: true });
fs.writeFileSync(output, png);
console.log(`Generated ${output}`);
