import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const pages = JSON.parse(fs.readFileSync(path.join(ROOT, 'seed-pages.json'), 'utf8'));

function preview(b) {
    if (b.type === 'paragraph' || b.type === 'heading' || b.type === 'subheading') return b.text.slice(0, 90);
    if (b.type === 'list') return b.items.length + ' 项: ' + b.items[0].slice(0, 50);
    if (b.type === 'callout') return '[' + b.variant + '] ' + (b.title || '') + ' | ' + (b.text || '').slice(0, 60);
    if (b.type === 'table') return '表头 ' + JSON.stringify(b.head) + ' 行数 ' + b.rows.length;
    if (b.type === 'image') return b.src + ' alt=' + b.alt;
    if (b.type === 'video') return b.title.slice(0, 40) + ' → ' + b.url;
    if (b.type === 'faq') return b.items.map((i) => i.q).join(' / ').slice(0, 80);
    return '';
}

for (const slug of ['getting-started', 'faq', 'download', 'tutorial']) {
    const p = pages.find((x) => x.slug === slug);
    console.log('\n===== ' + slug + ' | ' + p.title + ' | ' + p.subtitle.slice(0, 50) + ' =====');
    p.blocks.slice(0, 14).forEach((b, i) => console.log(String(i).padStart(2) + ' ' + b.type.padEnd(10) + ' ' + preview(b)));
}

console.log('\n===== 质量检查 =====');
let issues = 0;
for (const p of pages) {
    for (const [i, b] of p.blocks.entries()) {
        const texts = [b.text, b.title, b.caption].filter(Boolean).join(' ');
        if (/\*\*\s*\*\*/.test(texts)) {
            console.log('✘ 空加粗', p.slug, i);
            issues++;
        }
        if (b.type === 'paragraph' && b.text.trim().length < 2) {
            console.log('✘ 过短段落', p.slug, i, JSON.stringify(b.text));
            issues++;
        }
        if (b.type === 'image' && !b.src) {
            console.log('✘ 图片缺地址', p.slug, i);
            issues++;
        }
        if (b.type === 'video' && !b.url) {
            console.log('✘ 视频缺链接', p.slug, i, b.title);
            issues++;
        }
        if (b.type === 'faq' && b.items.some((x) => !x.q)) {
            console.log('✘ 问答缺问题', p.slug, i);
            issues++;
        }
        if (texts.includes('\u00a0')) {
            console.log('✘ 含不间断空格', p.slug, i);
            issues++;
        }
    }
}
console.log(issues === 0 ? '✔ 未发现质量问题' : issues + ' 处问题');
console.log('总字数:', pages.reduce((n, p) => n + JSON.stringify(p.blocks).length, 0));
