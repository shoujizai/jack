// 端到端验证：admin.html 真实脚本 + 真实本地接口 + 真实 SQLite（独立临时库，自给自足）
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import vm from 'node:vm';
import { startServer } from './local-server.mjs';

const ROOT = 'C:\\Users\\qq318\\Documents\\trae\\新建文件夹\\blog';
const ADMIN_HTML = path.join(ROOT, 'admin.html');
const PORT = 8791;
const BASE = 'http://127.0.0.1:' + PORT;
const UI_ORIGIN = 'http://127.0.0.1:8848/';
const EMAIL = '318886406@qq.com';
const PASSWORD = 'e2e-pass-123456';

let pass = 0;
let fail = 0;
const check = (name, cond, extra) => {
    if (cond) {
        pass++;
        console.log('✔ ' + name);
    } else {
        fail++;
        console.log('✘ ' + name + (extra !== undefined ? '  → ' + String(JSON.stringify(extra)).slice(0, 300) : ''));
    }
};

// 独立临时数据库
const tmpDb = path.join(os.tmpdir(), 'blog-e2e-' + Date.now() + '.db');
const srv = await startServer({ port: PORT, dbFile: tmpDb, quiet: true });
console.log('测试用接口已启动：' + BASE + '（临时库 ' + path.basename(tmpDb) + '）\n');

try {
    const health = await fetch(BASE + '/api/health').then((r) => r.json());
    check('接口在线且版本正确', health.code_version === 'admin-10', health.code_version);
    check('首次访问已自动建表', (health.tables || []).indexOf('pages') !== -1, health.tables);

    // ---------- 构造 DOM 桩，执行 admin.html 的真实脚本 ----------
    const html = fs.readFileSync(ADMIN_HTML, 'utf8');
    const script = [...html.matchAll(/<script(?![^>]*\bsrc=)[^>]*>([\s\S]*?)<\/script>/g)]
        .map((m) => m[1])
        .filter((s) => s.trim())
        .join('\n');
    const ids = [...new Set([...html.matchAll(/id="([^"]+)"/g)].map((m) => m[1]))];

    function makeEl(id) {
        return {
            id,
            value: '',
            textContent: '',
            innerHTML: '',
            className: '',
            style: {},
            dataset: {},
            files: [],
            children: [],
            classList: {
                _s: new Set(),
                add(c) { this._s.add(c); },
                remove(c) { this._s.delete(c); },
                toggle(c, on) { on ? this._s.add(c) : this._s.delete(c); },
                contains(c) { return this._s.has(c); },
            },
            appendChild(c) { this.children.push(c); return c; },
            removeChild(c) { const i = this.children.indexOf(c); if (i >= 0) this.children.splice(i, 1); },
            click() {},
            focus() {},
            setAttribute() {},
            getAttribute() { return null; },
            addEventListener() {},
            remove() {},
        };
    }

    const store = new Map();
    const elements = new Map(ids.map((id) => [id, makeEl(id)]));
    const document = {
        readyState: 'complete',
        getElementById(id) {
            if (!elements.has(id)) elements.set(id, makeEl(id));
            return elements.get(id);
        },
        querySelectorAll: () => [],
        querySelector: () => null,
        createElement: (tag) => makeEl(tag),
        addEventListener() {},
        body: makeEl('body'),
        documentElement: makeEl('html'),
    };

    const sandbox = {
        document,
        window: { API_BASE: BASE, scrollTo() {}, open() {}, addEventListener() {} },
        navigator: { clipboard: { writeText: () => Promise.resolve() } },
        localStorage: {
            getItem: (k) => (store.has(k) ? store.get(k) : null),
            setItem: (k, v) => store.set(k, String(v)),
            removeItem: (k) => store.delete(k),
        },
        // 浏览器里相对路径会按页面地址解析，这里模拟一下
        fetch: (url, opts) => fetch(new URL(String(url), UI_ORIGIN), opts),
        Blob: class { constructor(p) { this.p = p; } },
        URL: Object.assign(function (u, b) { return new URL(u, b); }, {
            createObjectURL: () => 'blob:x',
            revokeObjectURL() {},
        }),
        URLSearchParams,
        FileReader: class { readAsText() {} },
        console,
        setTimeout,
        clearTimeout,
        alert() {},
        confirm: () => true,
        location: { origin: 'http://127.0.0.1:8848', pathname: '/admin.html', href: UI_ORIGIN + 'admin.html', search: '', reload() {} },
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
    };
    sandbox.globalThis = sandbox;
    store.set('admin_api_base', BASE);

    vm.createContext(sandbox);
    vm.runInContext(script, sandbox, { timeout: 10000 });
    await new Promise((r) => setTimeout(r, 700));

    const el = (id) => document.getElementById(id);

    console.log('=== 1. 启动 ===');
    check('横幅显示接口与版本', /代码 admin-10/.test(el('apiBannerText').textContent), el('apiBannerText').textContent);
    check('未登录显示登录页', el('loginView').style.display === 'block', el('loginView').style.display);
    check('没有红色报错', !el('apiBanner').classList.contains('err'), el('apiBannerText').textContent);

    console.log('\n=== 2. 注册 + 登录 ===');
    el('loginEmail').value = EMAIL;
    el('loginPassword').value = PASSWORD;
    sandbox.doRegister();
    await new Promise((r) => setTimeout(r, 1200));
    check('注册后自动进入后台', el('appView').style.display === 'block', el('appView').style.display);
    check('拿到 token', !!store.get('auth_token'));
    check('退出按钮可见', el('logoutBtn').style.display === 'inline-block');

    console.log('\n=== 3. 概览 ===');
    sandbox.loadStats();
    await new Promise((r) => setTimeout(r, 600));
    check('概览渲染', /注册用户/.test(el('statGrid').innerHTML), el('statGrid').innerHTML.slice(0, 120));

    console.log('\n=== 4. 导入内置内容 ===');
    sandbox.switchTab('pages');
    await new Promise((r) => setTimeout(r, 400));
    sandbox.importSeed();
    await new Promise((r) => setTimeout(r, 120));
    check('第一次点击进入确认', /确认导入/.test(el('importBtn').textContent), el('importBtn').textContent);
    sandbox.importSeed();
    await new Promise((r) => setTimeout(r, 5000));
    const statusText = el('importStatus').textContent;
    check('导入成功 7 个页面', /已导入 7 个页面/.test(statusText), statusText);
    check('状态栏是绿色', /ok/.test(el('importStatus').className), el('importStatus').className);

    console.log('\n=== 5. 页面列表与内容 ===');
    check('列表渲染出入坑指南', /入坑指南/.test(el('pageList').innerHTML), el('pageList').innerHTML.slice(0, 160));
    check('列表显示草稿标记', /草稿/.test(el('pageList').innerHTML));
    check('列表有复制链接按钮', /copyPageLink/.test(el('pageList').innerHTML));

    const token = store.get('auth_token');
    const auth = { Authorization: 'Bearer ' + token };
    const faq = await fetch(BASE + '/api/pages?slug=faq', { headers: auth }).then((r) => r.json());
    check('faq 页面可读', faq.title === '常见问题', faq.title);
    check('faq 含问答方块', Array.isArray(faq.blocks) && faq.blocks.some((b) => b.type === 'faq'), faq.blocks && faq.blocks.length);
    const anon = await fetch(BASE + '/api/pages?slug=faq');
    check('草稿对匿名 404', anon.status === 404, anon.status);

    console.log('\n=== 6. 新建页面（自动地址） ===');
    sandbox.newPage();
    el('fTitle').value = '端到端测试页';
    el('fSlug').value = '';
    sandbox.savePage();
    await new Promise((r) => setTimeout(r, 900));
    check('地址自动生成并回填', /^p-[a-z0-9]{6}$/.test(el('fSlug').value), el('fSlug').value);
    check('保存提示', /已保存/.test(el('toast').textContent), el('toast').textContent);

    console.log('\n=== 7. 编辑已有页面并保存 ===');
    sandbox.openEditor('faq');
    await new Promise((r) => setTimeout(r, 700));
    check('打开编辑器并载入标题', el('fTitle').value === '常见问题', el('fTitle').value);
    check('方块被载入（>=8 个）', sandbox.state.blocks.length >= 8, sandbox.state.blocks.length);
    el('fTitle').value = '常见问题（改）';
    el('fPublished').value = '1';
    sandbox.savePage();
    await new Promise((r) => setTimeout(r, 900));
    const updated = await fetch(BASE + '/api/pages?slug=faq', { headers: auth }).then((r) => r.json());
    check('修改已保存到数据库', updated.title === '常见问题（改）', updated.title);
    check('发布后匿名可读', (await fetch(BASE + '/api/pages?slug=faq')).status === 200);

    console.log('\n=== 8. 用户 / 评论 ===');
    sandbox.switchTab('users');
    await new Promise((r) => setTimeout(r, 600));
    check('用户列表显示管理员', /管理员/.test(el('userList').innerHTML), el('userList').innerHTML.slice(0, 160));
    sandbox.switchTab('comments');
    await new Promise((r) => setTimeout(r, 600));
    check('评论页可用', /还没有评论|删除/.test(el('commentList').innerHTML), el('commentList').innerHTML.slice(0, 160));

    console.log('\n=== 9. 导出 JSON ===');
    sandbox.switchTab('pages');
    await new Promise((r) => setTimeout(r, 400));
    sandbox.exportPages();
    await new Promise((r) => setTimeout(r, 800));
    check('导出成功提示', /已导出/.test(el('importStatus').textContent), el('importStatus').textContent);
} finally {
    await srv.close();
    try {
        fs.rmSync(tmpDb, { force: true });
    } catch (e) {
        /* 忽略 */
    }
}

console.log('\n结果：通过 ' + pass + ' 项，失败 ' + fail + ' 项');
if (fail > 0) process.exitCode = 1;
