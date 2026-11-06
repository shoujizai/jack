// page.html 渲染器测试：把 9 种方块喂进去，检查生成的 DOM 结构与样式类
import fs from 'node:fs';
import vm from 'node:vm';

const DIR = 'C:\\Users\\qq318\\Documents\\trae\\新建文件夹\\blog\\';
const html = fs.readFileSync(DIR + 'page.html', 'utf8');

const script = [...html.matchAll(/<script(?![^>]*\bsrc=)[^>]*>([\s\S]*?)<\/script>/g)]
    .map((m) => m[1])
    .filter((s) => s.trim())
    .join('\n');

const ids = [...new Set([...html.matchAll(/id="([^"]+)"/g)].map((m) => m[1]))];

function makeEl(tag) {
    return {
        tagName: tag,
        className: '',
        id: '',
        textContent: '',
        innerHTML: '',
        src: '',
        alt: '',
        href: '',
        target: '',
        rel: '',
        loading: '',
        decoding: '',
        style: {},
        dataset: {},
        children: [],
        appendChild(c) {
            this.children.push(c);
            return c;
        },
        remove() {
            this.removed = true;
        },
        addEventListener() {},
        setAttribute(k, v) {
            this[k] = v;
        },
        classList: {
            add() {},
            remove() {},
            contains() {
                return false;
            },
        },
    };
}

const elements = new Map(ids.map((id) => [id, makeEl('div')]));

const document = {
    readyState: 'complete',
    title: '',
    getElementById(id) {
        if (!elements.has(id)) elements.set(id, makeEl('div'));
        return elements.get(id);
    },
    createElement(tag) {
        return makeEl(tag);
    },
    createTextNode(text) {
        return { tagName: '#text', textContent: text, children: [], style: {}, dataset: {} };
    },
    querySelectorAll() {
        return [];
    },
    addEventListener() {},
    body: makeEl('body'),
    documentElement: makeEl('html'),
};

const pageData = {
    slug: 'demo',
    title: '演示页面',
    subtitle: '副标题文字',
    published: 1,
    blocks: [
        { type: 'heading', text: '第一段标题' },
        { type: 'subheading', text: '小节标题' },
        { type: 'paragraph', text: '普通段落，**加粗内容** 结束' },
        { type: 'list', items: ['项目一', '项目二'], ordered: true },
        { type: 'callout', variant: 'warning', title: '注意', text: '警告内容' },
        { type: 'callout', variant: 'info', title: '提示', text: '提示内容' },
        { type: 'callout', variant: 'step', title: '步骤', text: '步骤内容' },
        { type: 'image', src: 'images/sd1.jpg', alt: '图片', caption: '图注', full: 'images/sd1.jpg' },
        { type: 'video', title: '看视频', url: 'https://v.douyin.com/abc/', button: '点我', hint: '新窗口打开' },
        { type: 'faq', items: [{ q: '问题一', a: '答案一' }, { q: '问题二', a: '答案二' }] },
        { type: 'table', head: ['名称', '说明'], rows: [['A', '甲'], ['B', '乙']] },
        { type: 'divider' },
    ],
};

const fetchStub = () =>
    Promise.resolve({
        ok: true,
        status: 200,
        json: () => Promise.resolve(pageData),
    });

const sandbox = {
    document,
    window: { API_BASE: 'https://api.example.com' },
    fetch: fetchStub,
    console,
    setTimeout,
    clearTimeout,
    URLSearchParams,
    encodeURIComponent,
    decodeURIComponent,
    Date,
    Math,
    JSON,
    Array,
    Object,
    String,
    Number,
    Boolean,
    parseInt,
    parseFloat,
    isNaN,
    RegExp,
    Error,
    Promise,
    location: { search: '?slug=demo', origin: 'https://site.example.com' },
};
sandbox.globalThis = sandbox;

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

try {
    vm.createContext(sandbox);
    vm.runInContext(script, sandbox, { timeout: 8000 });
    check('脚本执行无异常', true);
} catch (e) {
    check('脚本执行无异常', false, e.message);
}

await new Promise((r) => setTimeout(r, 150));

function walk(node, out = []) {
    if (!node || !node.children) return out;
    for (const c of node.children) {
        out.push(c);
        walk(c, out);
    }
    return out;
}

const wrap = document.getElementById('blocksWrap');
const all = walk(wrap);
const classes = all.map((n) => n.className).filter(Boolean);
const text = all.map((n) => n.textContent).join(' ');

check('页面标题已写入', document.getElementById('pageTitle').textContent === '演示页面', document.getElementById('pageTitle').textContent);
check('副标题已写入', document.getElementById('pageSubtitle').textContent === '副标题文字');
check('document.title 已更新', document.title === '演示页面 - 微修的Blog', document.title);
check('加载提示已移除', document.getElementById('pageState').removed === true);

check('生成了卡片容器', classes.filter((c) => c === 'content-section').length >= 1, classes.join(','));
check('一个标题对应一张卡片', classes.filter((c) => c === 'content-section').length === pageData.blocks.filter((b) => b.type === 'heading').length + 0, classes.filter((c) => c === 'content-section').length);
check('标题方块 → h2', all.some((n) => n.tagName === 'h2' && n.textContent === '第一段标题'));
check('小标题方块 → h3', all.some((n) => n.tagName === 'h3' && n.textContent === '小节标题'));
check('段落包含加粗', all.some((n) => n.tagName === 'strong' && n.textContent === '加粗内容'));
check('有序列表', all.some((n) => n.tagName === 'ol'));
check('列表项数量正确', all.filter((n) => n.tagName === 'li').length === 2, all.filter((n) => n.tagName === 'li').length);
check('警告框类名', classes.includes('warning-box'));
check('信息框类名', classes.includes('info-box'));
check('步骤框类名', classes.includes('step-box'));
check('callout 小标题渲染', all.some((n) => n.tagName === 'h4' && n.textContent === '注意'));
check('图片 src 正确', all.some((n) => n.tagName === 'img' && n.src === 'images/sd1.jpg'));
check('图片带 data-full', all.some((n) => n.tagName === 'img' && n.dataset.full === 'images/sd1.jpg'));
check('图片懒加载', all.some((n) => n.tagName === 'img' && n.loading === 'lazy'));
check('图注渲染', /图注/.test(text));
check('视频卡片类名', classes.includes('video-card'));
check('视频按钮链接', all.some((n) => n.className === 'btn-video' && n.href === 'https://v.douyin.com/abc/'));
check('视频按钮文字', all.some((n) => n.className === 'btn-video' && n.textContent === '点我'));
check('问答条目 2 个', classes.filter((c) => c === 'faq-item').length === 2);
check('问答问题渲染', all.some((n) => n.tagName === 'h4' && n.textContent === '问题一'));
check('问答答案渲染', /答案二/.test(text));
check('表格渲染', all.some((n) => n.tagName === 'table' && n.className === 'info-table'));
check('表头 2 列', all.filter((n) => n.tagName === 'th').length === 2);
check('表格数据行 2 行', all.filter((n) => n.tagName === 'td').length === 4);
check('分隔线渲染', all.some((n) => n.tagName === 'hr'));

console.log('\n结果：通过 ' + pass + ' 项，失败 ' + fail + ' 项');
if (fail > 0) process.exitCode = 1;
