// seed-pages.json 内容质量测试：结构、字段、无空块
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const file = path.join(ROOT, 'seed-pages.json');

let pass = 0;
let fail = 0;
function check(name, cond, extra) {
    if (cond) {
        pass++;
        console.log('✔ ' + name);
    } else {
        fail++;
        console.log('✘ ' + name + (extra ? '  → ' + String(extra).slice(0, 200) : ''));
    }
}

check('seed-pages.json 存在', fs.existsSync(file));
if (!fs.existsSync(file)) {
    console.log('\n结果：通过 ' + pass + ' 项，失败 ' + (fail + 1) + ' 项');
    process.exit(1);
}

const pages = JSON.parse(fs.readFileSync(file, 'utf8'));
const EXPECT = ['getting-started', 'tutorial', 'download', 'install', 'plugins', 'update', 'faq'];

check('共 7 个页面', pages.length === 7, pages.length);
check('slug 齐全', EXPECT.every((s) => pages.some((p) => p.slug === s)), pages.map((p) => p.slug).join(','));
check('每个页面都有标题', pages.every((p) => p.title && p.title.trim().length > 1));
check('每个页面都有副标题', pages.every((p) => typeof p.subtitle === 'string'));
check('全部是草稿（不会影响线上）', pages.every((p) => p.published === false));
check('sort_order 递增', pages.every((p, i) => p.sort_order === 100 + i));
check('每个页面至少 5 个方块', pages.every((p) => p.blocks.length >= 5), pages.map((p) => p.blocks.length).join(','));
check('总方块数 > 100', pages.reduce((n, p) => n + p.blocks.length, 0) > 100, pages.reduce((n, p) => n + p.blocks.length, 0));

// 方块类型合法性
const VALID = ['heading', 'subheading', 'paragraph', 'list', 'callout', 'image', 'video', 'faq', 'table', 'divider'];
const allBlocks = pages.flatMap((p) => p.blocks.map((b) => ({ slug: p.slug, b })));
const invalid = allBlocks.filter(({ b }) => !VALID.includes(b.type));
check('没有非法方块类型', invalid.length === 0, invalid.map((x) => x.b.type).join(','));

// 各类型必填字段
const badField = allBlocks.filter(({ b }) => {
    if (['heading', 'subheading', 'paragraph'].includes(b.type)) return !String(b.text || '').trim();
    if (b.type === 'list') return !Array.isArray(b.items) || !b.items.length;
    if (b.type === 'callout') return !String(b.text || b.title || '').trim();
    if (b.type === 'image') return !b.src;
    if (b.type === 'video') return !b.url;
    if (b.type === 'faq') return !Array.isArray(b.items) || b.items.some((i) => !i.q);
    if (b.type === 'table') return !(b.head && b.head.length) && !(b.rows && b.rows.length);
    return false;
});
check('必填字段完整', badField.length === 0, badField.map((x) => x.slug + ':' + x.b.type).join(','));

// 内容覆盖度：这几类页面应该出现对应方块
const has = (slug, type) => pages.find((p) => p.slug === slug).blocks.some((b) => b.type === type);
check('入坑指南含图片', has('getting-started', 'image'));
check('入坑指南含表格', has('getting-started', 'table'));
check('入坑指南含警告框', has('getting-started', 'callout'));
check('常见问题含问答', has('faq', 'faq'));
check('资源下载含视频按钮', has('download', 'video'));
check('安装游戏含表格', has('install', 'table'));

// 文本质量
const texts = allBlocks.map(({ b }) => [b.text, b.title, b.caption].filter(Boolean).join(' '));
check('没有空加粗', !texts.some((t) => /\*\*\s*\*\*/.test(t)));
check('没有不间断空格', !texts.some((t) => t.includes('\u00a0')));
check('没有残留 HTML 标签', !texts.some((t) => /<\/?[a-z][^>]*>/i.test(t)), texts.find((t) => /<\/?[a-z][^>]*>/i.test(t)));
check('加粗标记成对出现', texts.every((t) => (t.match(/\*\*/g) || []).length % 2 === 0));

// JSON 体积
const kb = (fs.statSync(file).size / 1024).toFixed(1);
check('文件体积 < 400KB（接口上限）', parseFloat(kb) < 400, kb + ' KB');
console.log('内容包大小: ' + kb + ' KB');

console.log('\n结果：通过 ' + pass + ' 项，失败 ' + fail + ' 项');
if (fail > 0) process.exitCode = 1;
