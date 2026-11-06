// 把现有静态页面提取成"方块"数据，生成 seed-pages.json 供后台一键导入
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const PAGES = ['getting-started', 'tutorial', 'download', 'install', 'plugins', 'update', 'faq'];

const VOID = new Set(['area', 'base', 'br', 'col', 'embed', 'hr', 'img', 'input', 'link', 'meta', 'param', 'source', 'track', 'wbr']);
const AUTO_CLOSE = {
    li: ['li'],
    p: ['p'],
    td: ['td', 'th'],
    th: ['td', 'th'],
    tr: ['tr', 'td', 'th'],
    option: ['option'],
    dt: ['dt', 'dd'],
    dd: ['dt', 'dd'],
};

/* ---------------- 词法 ---------------- */
function tokenize(html) {
    const tokens = [];
    let i = 0;
    while (i < html.length) {
        const lt = html.indexOf('<', i);
        if (lt === -1) {
            tokens.push({ type: 'text', text: html.slice(i) });
            break;
        }
        if (lt > i) tokens.push({ type: 'text', text: html.slice(i, lt) });

        if (html.startsWith('<!--', lt)) {
            const end = html.indexOf('-->', lt + 4);
            i = end === -1 ? html.length : end + 3;
            continue;
        }
        if (html.startsWith('<!', lt) || html.startsWith('<?', lt)) {
            const end = html.indexOf('>', lt);
            i = end === -1 ? html.length : end + 1;
            continue;
        }
        const gt = html.indexOf('>', lt);
        if (gt === -1) {
            tokens.push({ type: 'text', text: html.slice(lt) });
            break;
        }
        let raw = html.slice(lt + 1, gt).trim();
        const selfClose = raw.endsWith('/');
        if (selfClose) raw = raw.slice(0, -1).trim();

        if (raw.startsWith('/')) {
            tokens.push({ type: 'close', name: raw.slice(1).trim().toLowerCase() });
        } else {
            const m = raw.match(/^([a-zA-Z0-9-]+)/);
            const name = m ? m[1].toLowerCase() : '';
            const attrs = {};
            const re = /([a-zA-Z_:][-a-zA-Z0-9_:.]*)\s*=\s*(?:"([^"]*)"|'([^']*)'|([^\s"'>]+))/g;
            let a;
            while ((a = re.exec(raw))) attrs[a[1].toLowerCase()] = a[2] !== undefined ? a[2] : a[3] !== undefined ? a[3] : a[4];
            tokens.push({ type: 'open', name, attrs, selfClose });
        }
        i = gt + 1;
    }
    return tokens;
}

/* ---------------- 语法 ---------------- */
function parse(html) {
    const tokens = tokenize(html);
    const root = { tag: '#root', attrs: {}, children: [], parent: null };
    const stack = [root];

    for (const t of tokens) {
        const top = stack[stack.length - 1];
        if (t.type === 'text') {
            if (t.text.trim()) top.children.push({ tag: '#text', text: t.text, children: [] });
            continue;
        }
        if (t.type === 'open') {
            const auto = AUTO_CLOSE[t.name];
            if (auto && auto.includes(top.tag)) stack.pop();
            const el = { tag: t.name, attrs: t.attrs, children: [], parent: stack[stack.length - 1] };
            stack[stack.length - 1].children.push(el);
            if (!VOID.has(t.name) && !t.selfClose) stack.push(el);
            continue;
        }
        // close
        let idx = stack.length - 1;
        while (idx > 0 && stack[idx].tag !== t.name) idx--;
        if (idx > 0) stack.length = idx;
    }
    return root;
}

/* ---------------- 工具 ---------------- */
function cls(el) {
    return (el.attrs && el.attrs.class ? el.attrs.class : '').split(/\s+/).filter(Boolean);
}

function has(el, name) {
    return cls(el).includes(name);
}

function clean(s) {
    return String(s || '')
        .replace(/\u00a0/g, ' ')
        .replace(/[ \t]+/g, ' ')
        .replace(/ *\n */g, '\n')
        .replace(/\n{2,}/g, '\n')
        .trim();
}

function inline(node) {
    let out = '';
    for (const c of node.children || []) {
        if (c.tag === '#text') {
            out += c.text.replace(/\s+/g, ' ');
        } else if (c.tag === 'br') {
            out += '\n';
        } else if (c.tag === 'strong' || c.tag === 'b') {
            const inner = clean(inline(c));
            if (inner) out += '**' + inner + '**';
        } else if (c.tag === 'script' || c.tag === 'style') {
            /* skip */
        } else if (c.tag === 'img') {
            /* skip inline images */
        } else {
            out += inline(c);
        }
    }
    return out;
}

function textOf(node) {
    return clean(inline(node)).replace(/\*\*/g, '');
}

function stripEmoji(s) {
    return String(s || '')
        .replace(/^[\s\p{Extended_Pictographic}\uFE0F\u200D]+/u, '')
        .trim();
}

function findFirst(root, predicate) {
    const stack = [root];
    while (stack.length) {
        const n = stack.shift();
        if (predicate(n)) return n;
        if (n.children) stack.push(...n.children);
    }
    return null;
}

function findAll(root, predicate, out = []) {
    for (const c of root.children || []) {
        if (predicate(c)) out.push(c);
        findAll(c, predicate, out);
    }
    return out;
}

/* ---------------- 提取方块 ---------------- */
function blocksFrom(container, warn) {
    const blocks = [];

    function push(b) {
        if (!b) return;
        blocks.push(b);
    }

    function walk(node) {
        for (const el of node.children || []) {
            if (el.tag === '#text') continue;
            if (['script', 'style', 'nav', 'footer', 'button'].includes(el.tag)) continue;

            if (has(el, 'faq-item')) {
                const q = findFirst(el, (n) => has(n, 'faq-question') || n.tag === 'h4');
                const a = findFirst(el, (n) => has(n, 'faq-answer'));
                const question = q ? textOf(q.tag === 'h4' ? q : q) : '';
                const answer = a ? clean(inline(a)) : '';
                if (question) push({ type: 'faqItem', q: question, a: answer });
                continue;
            }
            if (has(el, 'step-box') || has(el, 'info-box') || has(el, 'warning-box')) {
                const variant = has(el, 'warning-box') ? 'warning' : has(el, 'info-box') ? 'info' : 'step';
                const h4 = findFirst(el, (n) => n.tag === 'h4');
                const title = h4 ? stripEmoji(textOf(h4)) : '';
                const bodyParts = [];
                for (const c of el.children) {
                    if (c === h4 || has(c, 'x')) continue;
                    if (c.tag === 'h4') continue;
                    if (c.tag === 'p') bodyParts.push(clean(inline(c)));
                    else if (c.tag === 'ul' || c.tag === 'ol') {
                        const items = c.children.filter((x) => x.tag === 'li').map((x) => clean(inline(x)));
                        bodyParts.push(items.map((t) => '• ' + t).join('\n'));
                    } else if (c.tag === 'div' || c.tag === 'span') {
                        const t = clean(inline(c));
                        if (t) bodyParts.push(t);
                    } else if (c.tag === '#text') continue;
                }
                push({ type: 'callout', variant, title, text: bodyParts.join('\n\n') });
                continue;
            }
            if (has(el, 'video-card')) {
                const t = findFirst(el, (n) => has(n, 'video-card-title')) || findFirst(el, (n) => n.tag === 'p');
                const link = findFirst(el, (n) => n.tag === 'a' && (has(n, 'btn-video') || has(n, 'btn')));
                const hint = findFirst(el, (n) => has(n, 'video-card-hint'));
                push({
                    type: 'video',
                    title: t ? textOf(t) : '',
                    url: link && link.attrs.href ? link.attrs.href : '',
                    button: link ? textOf(link) : '观看视频',
                    hint: hint ? textOf(hint) : '',
                });
                continue;
            }
            if (has(el, 'site-card')) {
                const link = findFirst(el, (n) => n.tag === 'a' && n.attrs.href && /^https?:/.test(n.attrs.href));
                const titleEl = findFirst(el, (n) => has(n, 'site-card-title')) || findFirst(el, (n) => n.tag === 'span');
                push({
                    type: 'video',
                    title: titleEl ? textOf(titleEl) : '',
                    url: link ? link.attrs.href : '',
                    button: '访问网站',
                    hint: '',
                });
                continue;
            }
            if (has(el, 'download-item')) {
                const h4 = findFirst(el, (n) => n.tag === 'h4');
                const p = findFirst(el, (n) => n.tag === 'p');
                const metas = findAll(el, (n) => n.tag === 'span').map((n) => textOf(n)).filter(Boolean);
                const line = [h4 ? '**' + textOf(h4) + '**' : '', p ? textOf(p) : '', metas.join(' · ')]
                    .filter(Boolean)
                    .join(' — ');
                if (line) push({ type: 'paragraph', text: line });
                continue;
            }
            if (el.tag === 'h2') {
                const t = stripEmoji(textOf(el));
                if (t) push({ type: 'heading', text: t });
                continue;
            }
            if (el.tag === 'h3' || el.tag === 'h4') {
                const t = stripEmoji(textOf(el));
                if (t) push({ type: 'subheading', text: t });
                continue;
            }
            if (el.tag === 'p') {
                const t = clean(inline(el));
                if (t) push({ type: 'paragraph', text: t });
                continue;
            }
            if (el.tag === 'ul' || el.tag === 'ol') {
                const items = el.children
                    .filter((x) => x.tag === 'li')
                    .map((x) => clean(inline(x)))
                    .filter(Boolean);
                if (items.length) push({ type: 'list', items, ordered: el.tag === 'ol' });
                continue;
            }
            if (el.tag === 'table') {
                const rows = findAll(el, (n) => n.tag === 'tr');
                if (!rows.length) continue;
                const cellsOf = (tr) => tr.children.filter((x) => x.tag === 'td' || x.tag === 'th').map((x) => textOf(x));
                const head = cellsOf(rows[0]);
                const body = rows.slice(1).map(cellsOf).filter((r) => r.length);
                push({ type: 'table', head, rows: body });
                continue;
            }
            if (el.tag === 'img') {
                if (el.attrs.src) {
                    push({ type: 'image', src: el.attrs.src, alt: el.attrs.alt || '', caption: '', full: el.attrs['data-full'] || '' });
                }
                continue;
            }
            if (el.tag === 'hr') {
                push({ type: 'divider' });
                continue;
            }
            const t = el.tag;
            if (t === 'div' || t === 'section' || t === 'span' || t === 'strong' || t === 'b') {
                walk(el);
                continue;
            }
            walk(el);
        }
    }

    walk(container);
    return blocks;
}

// 把连续 faqItem 合并成一个 faq 方块
function mergeFaq(blocks) {
    const out = [];
    let bucket = null;
    for (const b of blocks) {
        if (b.type === 'faqItem') {
            if (!bucket) {
                bucket = { type: 'faq', items: [] };
                out.push(bucket);
            }
            bucket.items.push({ q: b.q, a: b.a });
        } else {
            bucket = null;
            out.push(b);
        }
    }
    return out;
}

/* ---------------- 主流程 ---------------- */
const result = [];
for (const [index, slug] of PAGES.entries()) {
    const file = path.join(ROOT, slug + '.html');
    const html = fs.readFileSync(file, 'utf8');
    const tree = parse(html);
    const body = findFirst(tree, (n) => n.tag === 'body') || tree;
    const header = findFirst(body, (n) => has(n, 'page-header'));
    const h1 = header ? findFirst(header, (n) => n.tag === 'h1') : null;
    const sub = header ? findFirst(header, (n) => n.tag === 'p') : null;

    const title = stripEmoji(h1 ? textOf(h1) : slug);
    const subtitle = sub ? textOf(sub) : '';

    let blocks = [];
    for (const section of findAll(body, (n) => has(n, 'content-section'))) {
        blocks = blocks.concat(blocksFrom(section, () => {}));
    }
    blocks = mergeFaq(blocks).filter((b) => {
        if (b.type === 'paragraph' || b.type === 'heading' || b.type === 'subheading') return !!String(b.text || '').trim();
        if (b.type === 'list') return Array.isArray(b.items) && b.items.length;
        if (b.type === 'faq') return b.items && b.items.length;
        if (b.type === 'table') return (b.head && b.head.length) || (b.rows && b.rows.length);
        if (b.type === 'image') return !!b.src;
        if (b.type === 'video') return !!(b.url || b.title);
        if (b.type === 'callout') return !!(b.text || b.title);
        return true;
    });

    result.push({
        slug,
        title,
        subtitle,
        published: false,
        sort_order: 100 + index,
        blocks,
    });
}

const outFile = path.join(ROOT, 'seed-pages.json');
fs.writeFileSync(outFile, JSON.stringify(result, null, 2), 'utf8');

console.log('生成 seed-pages.json\n');
for (const p of result) {
    const counts = {};
    for (const b of p.blocks) counts[b.type] = (counts[b.type] || 0) + 1;
    console.log(
        `- ${p.slug.padEnd(15)} 标题「${p.title}」 方块 ${String(p.blocks.length).padStart(2)} 个  ` +
            Object.entries(counts)
                .map(([k, v]) => k + ':' + v)
                .join(' ')
    );
}
console.log('\n总方块数:', result.reduce((n, p) => n + p.blocks.length, 0));
