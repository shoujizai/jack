// 生成 PWA 图标（纯 Node，无第三方依赖）：512 / 192 / maskable
import fs from 'node:fs';
import path from 'node:path';
import zlib from 'node:zlib';
import { fileURLToPath } from 'node:url';

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const OUT = path.join(ROOT, 'icons');
fs.mkdirSync(OUT, { recursive: true });

/* ---------- 最小 PNG 编码器 ---------- */
const CRC_TABLE = (() => {
    const table = new Int32Array(256);
    for (let n = 0; n < 256; n++) {
        let c = n;
        for (let k = 0; k < 8; k++) c = c & 1 ? 0xedb88320 ^ (c >>> 1) : c >>> 1;
        table[n] = c;
    }
    return table;
})();

function crc32(buf) {
    let c = 0xffffffff;
    for (let i = 0; i < buf.length; i++) c = CRC_TABLE[(c ^ buf[i]) & 0xff] ^ (c >>> 8);
    return (c ^ 0xffffffff) >>> 0;
}

function chunk(type, data) {
    const len = Buffer.alloc(4);
    len.writeUInt32BE(data.length, 0);
    const typeBuf = Buffer.from(type, 'ascii');
    const crcBuf = Buffer.alloc(4);
    crcBuf.writeUInt32BE(crc32(Buffer.concat([typeBuf, data])), 0);
    return Buffer.concat([len, typeBuf, data, crcBuf]);
}

function encodePng(width, height, rgba) {
    const ihdr = Buffer.alloc(13);
    ihdr.writeUInt32BE(width, 0);
    ihdr.writeUInt32BE(height, 4);
    ihdr[8] = 8; // bit depth
    ihdr[9] = 6; // RGBA
    ihdr[10] = 0;
    ihdr[11] = 0;
    ihdr[12] = 0;

    const raw = Buffer.alloc((width * 4 + 1) * height);
    for (let y = 0; y < height; y++) {
        raw[y * (width * 4 + 1)] = 0; // filter: none
        rgba.copy(raw, y * (width * 4 + 1) + 1, y * width * 4, (y + 1) * width * 4);
    }
    const idat = zlib.deflateSync(raw, { level: 9 });
    return Buffer.concat([
        Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]),
        chunk('IHDR', ihdr),
        chunk('IDAT', idat),
        chunk('IEND', Buffer.alloc(0)),
    ]);
}

/* ---------- 画图：蓝色圆角方块 + 三条白色横线（列表/页面） ---------- */
const BLUE = [0, 122, 255];
const WHITE = [255, 255, 255];

function draw(size, opts = {}) {
    const padding = opts.maskable ? 0.18 : 0.1; // maskable 需要更大内边距（安全区）
    const radius = opts.maskable ? 0 : 0.22;
    const buf = Buffer.alloc(size * size * 4);

    const bgRadius = radius * size;
    const inner = size * (1 - padding * 2);

    for (let y = 0; y < size; y++) {
        for (let x = 0; x < size; x++) {
            const i = (y * size + x) * 4;

            // 背景：圆角矩形（maskable 用满幅纯色，系统会自己裁切）
            let inBg = true;
            if (radius > 0) {
                const r = bgRadius;
                const insideX = x >= r && x <= size - r;
                const insideY = y >= r && y <= size - r;
                if (!insideX && !insideY) {
                    const cx = x < r ? r : size - r;
                    const cy = y < r ? r : size - r;
                    const dx = x - cx;
                    const dy = y - cy;
                    inBg = dx * dx + dy * dy <= r * r;
                }
            }

            if (!inBg) {
                buf[i] = 0;
                buf[i + 1] = 0;
                buf[i + 2] = 0;
                buf[i + 3] = 0;
                continue;
            }

            buf[i] = BLUE[0];
            buf[i + 1] = BLUE[1];
            buf[i + 2] = BLUE[2];
            buf[i + 3] = 255;

            // 三条白色横线
            const barW = inner * 0.52;
            const barH = inner * 0.085;
            const gap = inner * 0.105;
            const startY = size / 2 - (barH * 3 + gap * 2) / 2;
            const startX = size / 2 - barW / 2;
            const barHits = [0, 1, 2].some((k) => {
                const y0 = startY + k * (barH + gap);
                return y >= y0 && y < y0 + barH && x >= startX && x < startX + barW;
            });
            // 第一行做得短一点，像标题 + 段落
            const titleHits =
                y >= startY - barH * 1.6 &&
                y < startY - barH * 1.6 + barH * 1.15 &&
                x >= startX &&
                x < startX + barW * 0.62;

            if (barHits || titleHits) {
                buf[i] = WHITE[0];
                buf[i + 1] = WHITE[1];
                buf[i + 2] = WHITE[2];
            }
        }
    }
    return buf;
}

const targets = [
    { file: 'icon-192.png', size: 192, maskable: false },
    { file: 'icon-512.png', size: 512, maskable: false },
    { file: 'icon-maskable-512.png', size: 512, maskable: true },
    { file: 'apple-touch-icon.png', size: 180, maskable: false },
];

for (const t of targets) {
    const png = encodePng(t.size, t.size, draw(t.size, { maskable: t.maskable }));
    fs.writeFileSync(path.join(OUT, t.file), png);
    console.log('生成 ' + t.file + '  ' + t.size + 'x' + t.size + '  ' + (png.length / 1024).toFixed(1) + ' KB');
}

console.log('\n完成，输出目录：' + OUT);
