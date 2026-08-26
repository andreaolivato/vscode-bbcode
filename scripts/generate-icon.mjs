import { deflateSync } from 'node:zlib';
import { writeFileSync } from 'node:fs';

const SIZE = 256;
const SS = 4; // supersampling factor, for smooth edges

const hex = (value) => [
    parseInt(value.slice(1, 3), 16),
    parseInt(value.slice(3, 5), 16),
    parseInt(value.slice(5, 7), 16),
];

const BG_TOP = hex('#2a3348');
const BG_BOTTOM = hex('#171c27');
const ACCENT = hex('#4c8eff');
const LINE = hex('#e8edf5');
const LINE_DIM = hex('#98a4ba');

const RADIUS = 52;

function insideRoundedRect(x, y) {
    if (x < 0 || y < 0 || x > SIZE || y > SIZE) return false;
    const cx = Math.min(Math.max(x, RADIUS), SIZE - RADIUS);
    const cy = Math.min(Math.max(y, RADIUS), SIZE - RADIUS);
    const dx = x - cx;
    const dy = y - cy;
    return dx * dx + dy * dy <= RADIUS * RADIUS;
}

const rect = (x, y, x0, y0, x1, y1) => x >= x0 && x < x1 && y >= y0 && y < y1;

/** Returns [r, g, b, a] for a point in icon space, or null for transparent. */
function shade(x, y) {
    if (!insideRoundedRect(x, y)) return null;

    // Square brackets.
    const bracket =
        rect(x, y, 34, 56, 50, 200) ||
        rect(x, y, 34, 56, 86, 72) ||
        rect(x, y, 34, 184, 86, 200) ||
        rect(x, y, 206, 56, 222, 200) ||
        rect(x, y, 170, 56, 222, 72) ||
        rect(x, y, 170, 184, 222, 200);
    if (bracket) return ACCENT;

    // The three "lines of a rendered post" between the brackets.
    if (rect(x, y, 92, 84, 164, 100)) return LINE;
    if (rect(x, y, 92, 120, 164, 136)) return LINE;
    if (rect(x, y, 92, 156, 138, 172)) return LINE_DIM;

    const t = y / SIZE;
    return [
        Math.round(BG_TOP[0] + (BG_BOTTOM[0] - BG_TOP[0]) * t),
        Math.round(BG_TOP[1] + (BG_BOTTOM[1] - BG_TOP[1]) * t),
        Math.round(BG_TOP[2] + (BG_BOTTOM[2] - BG_TOP[2]) * t),
    ];
}

// ------------------------------------------------------------- rasterisation

const pixels = Buffer.alloc(SIZE * SIZE * 4);
for (let py = 0; py < SIZE; py++) {
    for (let px = 0; px < SIZE; px++) {
        let r = 0;
        let g = 0;
        let b = 0;
        let a = 0;
        for (let sy = 0; sy < SS; sy++) {
            for (let sx = 0; sx < SS; sx++) {
                const color = shade(px + (sx + 0.5) / SS, py + (sy + 0.5) / SS);
                if (color) {
                    r += color[0];
                    g += color[1];
                    b += color[2];
                    a += 255;
                }
            }
        }
        const samples = SS * SS;
        const alpha = a / samples;
        const offset = (py * SIZE + px) * 4;
        // Premultiplied averaging would darken the edge; average over covered
        // samples only and keep the coverage as alpha.
        const covered = a / 255 || 1;
        pixels[offset] = Math.round(r / covered);
        pixels[offset + 1] = Math.round(g / covered);
        pixels[offset + 2] = Math.round(b / covered);
        pixels[offset + 3] = Math.round(alpha);
    }
}

// ------------------------------------------------------------- PNG encoding

function chunk(type, data) {
    const length = Buffer.alloc(4);
    length.writeUInt32BE(data.length);
    const body = Buffer.concat([Buffer.from(type, 'ascii'), data]);
    const crc = Buffer.alloc(4);
    crc.writeUInt32BE(crc32(body) >>> 0);
    return Buffer.concat([length, body, crc]);
}

let CRC_TABLE = null;
function crc32(buffer) {
    if (!CRC_TABLE) {
        CRC_TABLE = new Int32Array(256);
        for (let n = 0; n < 256; n++) {
            let c = n;
            for (let k = 0; k < 8; k++) {
                c = c & 1 ? 0xedb88320 ^ (c >>> 1) : c >>> 1;
            }
            CRC_TABLE[n] = c;
        }
    }
    let crc = -1;
    for (const byte of buffer) {
        crc = CRC_TABLE[(crc ^ byte) & 0xff] ^ (crc >>> 8);
    }
    return crc ^ -1;
}

function encodePng(width, height, rgba) {
    const raw = Buffer.alloc(height * (width * 4 + 1));
    for (let y = 0; y < height; y++) {
        raw[y * (width * 4 + 1)] = 0; // filter: none
        rgba.copy(raw, y * (width * 4 + 1) + 1, y * width * 4, (y + 1) * width * 4);
    }

    const ihdr = Buffer.alloc(13);
    ihdr.writeUInt32BE(width, 0);
    ihdr.writeUInt32BE(height, 4);
    ihdr[8] = 8; // bit depth
    ihdr[9] = 6; // colour type: RGBA
    ihdr[10] = 0;
    ihdr[11] = 0;
    ihdr[12] = 0;

    return Buffer.concat([
        Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]),
        chunk('IHDR', ihdr),
        chunk('IDAT', deflateSync(raw, { level: 9 })),
        chunk('IEND', Buffer.alloc(0)),
    ]);
}

writeFileSync('images/icon.png', encodePng(SIZE, SIZE, pixels));
console.log('icon.png written');
