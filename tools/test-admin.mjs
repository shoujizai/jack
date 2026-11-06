// admin.html 界面逻辑冒烟测试：用极简 DOM 桩执行内联脚本，验证渲染与交互
import fs from 'node:fs';
import vm from 'node:vm';

const DIR = 'C:\\Users\\qq318\\Documents\\trae\\新建文件夹\\blog\\';
const html = fs.readFileSync(DIR + 'admin.html', 'utf8');

// 1. 取出内联脚本
const script = [...html.matchAll(/<script(?![^>]*\bsrc=)[^>]*>([\s\S]*?)<\/script>/g)]
    .map((m) => m[1])
    .filter((s) => s.trim())
    .join('\n');

// 2. 收集 HTML 里出现的 id，造出对应元素
const ids = [...new Set([...html.matchAll(/id="([^"]+)"/g)].map((m) => m[1]))];

function makeEl(id) {
    const el = {
        id,
        value: '',
        textContent: '',
        innerHTML: '',
        style: {},
        dataset: {},
        children: [],
        classList: {
            _set: new Set(),
            add(c) { this._set.add(c); },
            remove(c) { this._set.delete(c); },
            toggle(c, on) { on ? this._set.add(c) : this._set.delete(c); },
            contains(c) { return this._set.has(c); },
        },
        appendChild(c) { this.children.push(c); return c; },
        removeChild(c) { const i = this.children.indexOf(c); if (i >= 0) this.children.splice(i, 1); },
        click() { this.clicked = true; },
        addEventListener() {},
        remove() {},
        focus() {},
        setAttribute() {},
        getAttribute() { return null; },
        removeAttribute() {},
    };
    return el;
}

const store = new Map();
const elements = new Map(ids.map((id) => [id, makeEl(id)]));

const document = {
    readyState: 'complete',
    getElementById(id) {
        if (!elements.has(id)) elements.set(id, makeEl(id));
        return elements.get(id);
    },
    querySelectorAll(sel) {
        return [];
    },
    querySelector() {
        return null;
    },
    addEventListener() {},
    createElement(tag) {
        return makeEl(tag);
    },
    body: makeEl('body'),
    documentElement: makeEl('html'),
};

// 3. fetch 桩：按路径返回假数据
const calls = [];
function json(body, status = 200) {
    return Promise.resolve({
        ok: status >= 200 && status < 300,
        status,
        text: () => Promise.resolve(JSON.stringify(body)),
        json: () => Promise.resolve(body),
    });
}

const fakePages = [{ slug: 'guide-basic', title: '新手入门', subtitle: '一句话说明', published: 1, sort_order: 100, updated_at: 1700000000 }];
const seedPayload = [
    { slug: 'getting-started', title: '入坑指南', subtitle: '新手必看', published: false, blocks: [{ type: 'paragraph', text: 'a' }] },
    { slug: 'faq', title: '常见问题', subtitle: 'FAQ', published: false, blocks: [{ type: 'faq', items: [{ q: 'q', a: 'a' }] }] },
];
const fakePage = {
    slug: 'guide-basic',
    title: '新手入门',
    subtitle: '一句话说明',
    published: 1,
    sort_order: 100,
    blocks: [
        { type: 'heading', text: '第一步' },
        { type: 'paragraph', text: '正文内容' },
        { type: 'list', items: ['a', 'b'] },
    ],
};

const fetchStub = (url, opts = {}) => {
    const u = String(url);
    calls.push((opts.method || 'GET') + ' ' + u.replace(/^.*\/api/, '/api'));
    if (u.includes('/api/health')) return json({ ok: true, code_version: 'admin-10', features: { admin_gate: false, has_admin_api: true } });
    if (u.includes('/api/me')) return json({ id: 1, email: '318886406@qq.com', is_admin: true, role: 'admin', registration_open: false });
    if (u.includes('/api/login')) return json({ token: 'tok-123', user: { id: 1, email: '318886406@qq.com', is_admin: true, role: 'admin' } });
    if (u.includes('/api/register')) return json({ success: true, message: '注册成功' });
    if (u.includes('/api/admin/stats')) return json({ users: 3, customers: 1, comments: 5, pages: 2, published_pages: 1 });
    if (u.includes('/api/admin/pages')) return json({ pages: fakePages });
    if (u.includes('/api/admin/comments'))
        return json({
            comments: [{ id: 9, page_id: 'index', content: '你好', created_at: 1700000000, email: '123@qq.com', nickname: '小明' }],
        });
    if (u.includes('/api/admin/users'))
        return json({
            users: [
                { id: 1, email: '318886406@qq.com', nickname: '站长', is_customer: 0, role: 'admin', created_at: 1700000000, banned_until: null },
                { id: 2, email: '123@qq.com', nickname: '高级', is_customer: 1, role: 'premium', created_at: 1700000000, banned_until: null },
            ],
        });
    if (u.includes('/api/pages?slug=')) return json(fakePage);
    if (u.includes('seed-pages.json')) return json(seedPayload);
    if (u.includes('/api/pages')) return json({ success: true, slug: 'guide-basic' });
    return json({ error: 'Not Found' }, 404);
};

const sandbox = {
    document,
    window: { API_BASE: 'https://api.example.com', scrollTo() {}, open() {}, prompt: () => null },
    navigator: {
        clipboard: {
            written: [],
            writeText(text) {
                this.written.push(text);
                return Promise.resolve();
            },
        },
    },
    localStorage: {
        getItem: (k) => (store.has(k) ? store.get(k) : null),
        setItem: (k, v) => store.set(k, String(v)),
        removeItem: (k) => store.delete(k),
    },
    fetch: fetchStub,
    Blob: class Blob {
        constructor(parts) {
            this.parts = parts;
            this.text = () => Promise.resolve(parts.join(''));
        }
    },
    URL: {
        _urls: [],
        createObjectURL(blob) {
            this._urls.push(blob);
            return 'blob:mock/' + this._urls.length;
        },
        revokeObjectURL() {},
    },
    FileReader: class FileReader {
        readAsText() {}
    },
    console,
    setTimeout,
    clearTimeout,
    alert() {},
    confirm: () => true,
    location: { origin: 'https://site.example.com', pathname: '/admin.html', href: 'https://site.example.com/admin.html', reload() {}, search: '' },
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

// 4. 预置登录态，然后执行脚本（应自动进入后台）
store.set('auth_token', 'tok-123');

try {
    vm.createContext(sandbox);
    vm.runInContext(script, sandbox, { timeout: 8000 });
    check('内联脚本执行无异常', true);
} catch (e) {
    check('内联脚本执行无异常', false, e.message);
}

// 5. 等异步 fetch 链走完
await new Promise((r) => setTimeout(r, 250));

const el = (id) => document.getElementById(id);

check('退出按钮已显示', el('logoutBtn').style.display === 'inline-block', el('logoutBtn').style.display);
check('登录页已隐藏', el('loginView').style.display === 'none', el('loginView').style.display);
check('主体已显示', el('appView').style.display === 'block', el('appView').style.display);

check('概览渲染了用户数 3', /<b>3<\/b>/.test(el('statGrid').innerHTML), el('statGrid').innerHTML.slice(0, 120));
check('概览渲染了页面数 2', /<b>2<\/b>/.test(el('statGrid').innerHTML));
check('页面列表渲染了标题', /新手入门/.test(el('pageList').innerHTML), el('pageList').innerHTML.slice(0, 120));
check('页面列表含编辑按钮', /openEditor\('guide-basic'\)/.test(el('pageList').innerHTML));

// 6. 切标签页
try {
    sandbox.switchTab('comments');
    check('switchTab(comments) 正常', el('tabComments').style.display === 'block');
} catch (e) {
    check('switchTab(comments) 正常', false, e.message);
}
await new Promise((r) => setTimeout(r, 100));
check('评论列表渲染了内容', /你好/.test(el('commentList').innerHTML), el('commentList').innerHTML.slice(0, 120));
check('评论显示作者昵称', /小明/.test(el('commentList').innerHTML));

try {
    sandbox.switchTab('users');
    check('switchTab(users) 正常', el('tabUsers').style.display === 'block');
} catch (e) {
    check('switchTab(users) 正常', false, e.message);
}
await new Promise((r) => setTimeout(r, 100));
check('用户列表渲染邮箱', /318886406@qq\.com/.test(el('userList').innerHTML), el('userList').innerHTML.slice(0, 120));
check('用户列表显示角色徽章', /管理员/.test(el('userList').innerHTML) && /高级用户/.test(el('userList').innerHTML));
check('用户列表有封禁按钮', /toggleBan\(/.test(el('userList').innerHTML));

// 7. 方块编辑器
try {
    sandbox.newPage();
    check('newPage() 打开编辑器', el('editorView').style.display === 'block');
} catch (e) {
    check('newPage() 打开编辑器', false, e.message);
}
check('添加方块按钮渲染 10 种', (el('addBar').innerHTML.match(/addBlock\(/g) || []).length === 10, el('addBar').innerHTML.slice(0, 200));
check('初始有一个段落方块', /段落/.test(el('blockList').innerHTML), el('blockList').innerHTML.slice(0, 120));

try {
    sandbox.addBlock('faq');
    sandbox.addBlock('table');
    sandbox.addBlock('video');
    check('addBlock 后列表包含问答/表格/视频', /问答/.test(el('blockList').innerHTML) && /表格/.test(el('blockList').innerHTML) && /视频按钮/.test(el('blockList').innerHTML));
} catch (e) {
    check('addBlock 后列表包含问答/表格/视频', false, e.message);
}

try {
    sandbox.setField(0, 'text', '新的段落内容');
    check('setField 写入 state', sandbox.state.blocks[0].text === '新的段落内容', JSON.stringify(sandbox.state.blocks[0]));
} catch (e) {
    check('setField 写入 state', false, e.message);
}

try {
    sandbox.setField(1, 'faqText', '问题一|答案一\n问题二|答案二');
    const faq = sandbox.state.blocks[1];
    check('问答解析正确', Array.isArray(faq.items) && faq.items.length === 2 && faq.items[0].q === '问题一' && faq.items[1].a === '答案二', JSON.stringify(faq));
} catch (e) {
    check('问答解析正确', false, e.message);
}

try {
    sandbox.setField(2, 'tableText', 'A|B\n1|2\n3|4');
    const t = sandbox.state.blocks[2];
    check('表格解析正确', JSON.stringify(t.head) === '["A","B"]' && t.rows.length === 2, JSON.stringify(t));
} catch (e) {
    check('表格解析正确', false, e.message);
}

// 8. 排序 / 删除
try {
    const first = sandbox.state.blocks[0].type;
    sandbox.moveBlock(0, 1);
    check('moveBlock 交换顺序', sandbox.state.blocks[1].type === first, JSON.stringify(sandbox.state.blocks.map((b) => b.type)));
} catch (e) {
    check('moveBlock 交换顺序', false, e.message);
}

try {
    const before = sandbox.state.blocks.length;
    sandbox.delBlock(0);
    check('delBlock 删除方块', sandbox.state.blocks.length === before - 1);
} catch (e) {
    check('delBlock 删除方块', false, e.message);
}

// 9. 页面地址自动生成
console.log('\n=== 页面地址自动生成 ===');
{
    try {
        sandbox.newPage();
        el('fTitle').value = '新手入门';
        el('fSlug').value = '';
        sandbox.savePage();
        await new Promise((r) => setTimeout(r, 200));
        check('保存后地址被自动回填', el('fSlug').value === 'guide-basic', el('fSlug').value);
    } catch (e) {
        check('保存后地址被自动回填', false, e.message);
    }
}

// 10. 预览浮层 / 复制链接
console.log('\n=== 预览与复制链接 ===');
{
    try {
        sandbox.newPage();
        el('fSlug').value = 'demo-page';
        sandbox.previewPage();
        check('预览浮层已打开', el('previewOverlay').classList.contains('show'));
        check('预览 iframe 指向页面', /page\.html\?slug=demo-page/.test(el('previewFrame').src || ''), el('previewFrame').src);
        check('预览标题显示地址', /demo-page/.test(el('previewTitle').textContent), el('previewTitle').textContent);
        sandbox.closePreview();
        check('关闭后浮层隐藏', !el('previewOverlay').classList.contains('show'));
        check('关闭后 iframe 清空', el('previewFrame').src === 'about:blank', el('previewFrame').src);
    } catch (e) {
        check('预览浮层已打开', false, e.message);
    }
}
{
    try {
        sandbox.navigator.clipboard.written.length = 0;
        sandbox.copyPageLink('guide-basic');
        await new Promise((r) => setTimeout(r, 50));
        const written = sandbox.navigator.clipboard.written[0] || '';
        check('复制链接写入剪贴板', /page\.html\?slug=guide-basic$/.test(written), written);
        check('链接是完整地址', written.indexOf('https://site.example.com/') === 0, written);
    } catch (e) {
        check('复制链接写入剪贴板', false, e.message);
    }
}
{
    check('页面列表含复制链接按钮', /copyPageLink\('guide-basic'\)/.test(el('pageList').innerHTML), el('pageList').innerHTML.slice(0, 200));
    check('页面列表显示地址', /地址：<code>guide-basic<\/code>/.test(el('pageList').innerHTML), el('pageList').innerHTML.slice(0, 200));
}

// 11. 导出 / 导入 JSON
console.log('\n=== 导出 / 导入 JSON ===');
{
    try {
        // 导出：stub 里 /api/admin/pages?full=1 命中 /api/admin/pages 分支，返回 1 个页面
        sandbox.exportPages();
        await new Promise((r) => setTimeout(r, 200));
        check('导出后状态栏提示成功', /已导出|还没有页面/.test(el('importStatus').textContent), el('importStatus').textContent);
    } catch (e) {
        check('导出流程可用', false, e.message);
    }
}
{
    try {
        const before = calls.filter((c) => c.startsWith('POST /api/pages')).length;
        sandbox.importJsonPages([
            { slug: 'a', title: '页面A', blocks: [{ type: 'paragraph', text: 'x' }] },
            { slug: 'b', title: '页面B', blocks: [] },
        ]);
        await new Promise((r) => setTimeout(r, 300));
        const after = calls.filter((c) => c.startsWith('POST /api/pages')).length;
        check('导入 JSON 发起 2 次 POST', after - before === 2, String(after - before));
        check('导入完成提示成功', /已导入 2 个页面/.test(el('importStatus').textContent), el('importStatus').textContent);
    } catch (e) {
        check('导入 JSON 发起 2 次 POST', false, e.message);
    }
}
{
    try {
        sandbox.importJsonPages([]);
        check('空数组给出错误提示', /没有页面数据/.test(el('importStatus').textContent), el('importStatus').textContent);
        sandbox.importJsonPages({ notArray: true });
        check('非数组给出错误提示', /没有页面数据/.test(el('importStatus').textContent), el('importStatus').textContent);
    } catch (e) {
        check('空数组给出错误提示', false, e.message);
    }
}

{
    // 接口版本检测
    try {
        const freshOk = sandbox.warnIfOldApi('admin-10');
        check('有版本号时视为最新', freshOk === true);
        check('横幅显示代码版本', /代码 admin-10/.test(el('apiBannerText').textContent), el('apiBannerText').textContent);
        check('最新版本不显示红色', !el('apiBanner').classList.contains('err'));

        const oldOk = sandbox.warnIfOldApi('');
        check('无版本号时判定为旧版', oldOk === false);
        check('提示重启本地接口', /关掉/.test(el('apiBannerText').textContent) && /重新双击/.test(el('apiBannerText').textContent), el('apiBannerText').textContent);
        check('旧版提示为红色', el('apiBanner').classList.contains('err'));

        sandbox.warnIfOldApi('admin-10');
    } catch (e) {
        check('有版本号时视为最新', false, e.message);
    }
}

// 12. 诊断面板
console.log('\n=== 诊断面板 ===');
{
    try {
        sandbox.toggleDiag();
        const text = el('diagPanel').textContent;
        check('诊断面板打开', el('diagPanel').style.display === 'block');
        check('显示接口地址', /接口地址：https:\/\/api\.example\.com/.test(text), text.slice(0, 120));
        check('显示代码版本', /代码版本：admin-10/.test(text), text.slice(0, 160));
        check('显示登录凭证状态', /登录凭证：/.test(text));
        check('记录过健康检查请求', /GET https:\/\/api\.example\.com\/api\/health/.test(text), text.slice(-200));
        sandbox.toggleDiag();
        check('再点一次收起', el('diagPanel').style.display === 'none');
    } catch (e) {
        check('诊断面板打开', false, e.message);
    }
}
{
    // 失败请求也要进日志
    try {
        const original = sandbox.fetch;
        sandbox.fetch = () => Promise.reject(new TypeError('Failed to fetch'));
        try {
            await sandbox.api('/api/admin/stats');
        } catch (e) {
            /* 预期 */
        }
        sandbox.fetch = original;
        sandbox.toggleDiag();
        const text = el('diagPanel').textContent;
        check('失败请求记录到日志', /POST|GET https:\/\/api\.example\.com\/api\/admin\/stats/.test(text), text.slice(-260));
        check('日志里带错误原因', /Failed to fetch/.test(text), text.slice(-260));
        sandbox.toggleDiag();
    } catch (e) {
        check('失败请求记录到日志', false, e.message);
    }
}

// 13. 本地接口切换
console.log('\n=== 本地接口切换 ===');
{
    try {
        store.set('admin_api_base', 'http://127.0.0.1:8787/');
        check('apiBase 使用自定义接口并去掉末尾斜杠', sandbox.apiBase() === 'http://127.0.0.1:8787', sandbox.apiBase());
        sandbox.updateApiBanner();
        check('提示条显示', el('apiBanner').classList.contains('show'));
        check('提示条含地址', /127\.0\.0\.1:8787/.test(el('apiBannerText').textContent), el('apiBannerText').textContent);
        check('按钮文案为「切回线上」', el('apiBannerBtn').textContent === '切回线上', el('apiBannerBtn').textContent);
        sandbox.clearApiOverride();
        check('切回线上后清除记录', !store.has('admin_api_base'), [...store.keys()].join(','));
        check('切回线上后 apiBase 回落到线上', sandbox.apiBase() === 'https://api.example.com', sandbox.apiBase());

        sandbox.updateApiBanner();
        check('线上时也显示当前接口', /api\.example\.com/.test(el('apiBannerText').textContent), el('apiBannerText').textContent);
        check('线上时按钮文案为「用本地接口」', el('apiBannerBtn').textContent === '用本地接口', el('apiBannerBtn').textContent);
    } catch (e) {
        check('apiBase 使用自定义接口并去掉末尾斜杠', false, e.message);
    }
}
{
    // 一键切到本地
    try {
        store.delete('admin_api_base');
        sandbox.toggleApiTarget();
        check('点按钮后切到本地 8787', store.get('admin_api_base') === 'http://127.0.0.1:8787', store.get('admin_api_base'));
        sandbox.toggleApiTarget();
        check('再点一次切回线上', !store.has('admin_api_base'));
    } catch (e) {
        check('点按钮后切到本地 8787', false, e.message);
    }
}
{
    // 地址规范化：粘贴了带 /api/health 的地址要自动纠正
    try {
        check('规范化去掉 /api/health', sandbox.normalizeApiBase('http://127.0.0.1:8787/api/health') === 'http://127.0.0.1:8787', sandbox.normalizeApiBase('http://127.0.0.1:8787/api/health'));
        check('规范化去掉末尾斜杠', sandbox.normalizeApiBase('http://127.0.0.1:8787/') === 'http://127.0.0.1:8787');
        check('规范化保留 https 域名', sandbox.normalizeApiBase('https://api.example.com/api/pages') === 'https://api.example.com');

        // 已存的错误值在启动时被修正
        store.set('admin_api_base', 'http://127.0.0.1:8787/api/health');
        sandbox.applyApiOverride();
        check('启动时修正已存的错误地址', store.get('admin_api_base') === 'http://127.0.0.1:8787', store.get('admin_api_base'));
        check('修正后 apiBase 正确', sandbox.apiBase() === 'http://127.0.0.1:8787', sandbox.apiBase());

        // 从 ?api= 传入时也修正
        store.delete('admin_api_base');
        sandbox.location.search = '?api=http://127.0.0.1:8787/api/health';
        sandbox.applyApiOverride();
        check('?api= 带多余路径时被修正', store.get('admin_api_base') === 'http://127.0.0.1:8787', store.get('admin_api_base'));
        sandbox.location.search = '';
        store.delete('admin_api_base');
    } catch (e) {
        check('规范化去掉 /api/health', false, e.message);
    }
}
{
    // 手机上访问：127.0.0.1 要自动换成电脑的局域网地址
    try {
        sandbox.location.hostname = '192.168.0.104';
        store.set('admin_api_base', 'http://127.0.0.1:8787');
        check('手机上自动换成局域网 IP', sandbox.apiBase() === 'http://192.168.0.104:8787', sandbox.apiBase());
        check('localApiBase 用页面主机', sandbox.localApiBase() === 'http://192.168.0.104:8787', sandbox.localApiBase());

        store.delete('admin_api_base');
        sandbox.toggleApiTarget();
        check('切本地时存的是局域网地址', store.get('admin_api_base') === 'http://192.168.0.104:8787', store.get('admin_api_base'));
        store.delete('admin_api_base');

        // 电脑上仍然是 127.0.0.1
        sandbox.location.hostname = '127.0.0.1';
        check('电脑上仍是 127.0.0.1', sandbox.localApiBase() === 'http://127.0.0.1:8787', sandbox.localApiBase());
    } catch (e) {
        check('手机上自动换成局域网 IP', false, e.message);
    }
}
{
    // 接口 404 时的红色提示
    try {
        sandbox.showApiProblem('接口返回 404：线上是旧版');
        check('显示红色接口报错', el('apiBanner').classList.contains('err') && /404/.test(el('apiBannerText').textContent), el('apiBannerText').textContent);
        sandbox.updateApiBanner();
        check('刷新横幅会清掉红色状态', !el('apiBanner').classList.contains('err'));
    } catch (e) {
        check('显示红色接口报错', false, e.message);
    }
}
{
    // 连不上本地接口时的提示
    try {
        store.set('admin_api_base', 'http://127.0.0.1:8787');
        const original = sandbox.fetch;
        sandbox.fetch = function () {
            return Promise.reject(new TypeError('Failed to fetch'));
        };
        let threw = false;
        try {
            await sandbox.api('/api/admin/stats');
        } catch (e) {
            threw = true;
        }
        check('网络失败仍抛出错误', threw);
        check('提示条变为连不上本地接口', /连不上本地接口/.test(el('apiBannerText').textContent), el('apiBannerText').textContent);
        check('提示里给出启动方法', /本地运行接口\.cmd/.test(el('apiBannerText').textContent));
        sandbox.fetch = original;
        store.delete('admin_api_base');
        sandbox.updateApiBanner();
    } catch (e) {
        check('提示条变为连不上本地接口', false, e.message);
    }
}

// 12. 注册入口
console.log('\n=== 注册入口 ===');
{
    try {
        sandbox.doLogout();
        el('loginEmail').value = '318886406@qq.com';
        el('loginPassword').value = 'abc123456';
        const before = calls.length;
        sandbox.doRegister();
        await new Promise((r) => setTimeout(r, 250));
        const after = calls.slice(before);
        check('调用了注册接口', after.some((c) => /POST \/api\/register/.test(c)), after.join(' | '));
        check('注册后自动登录', after.some((c) => /POST \/api\/login/.test(c)), after.join(' | '));
    } catch (e) {
        check('调用了注册接口', false, e.message);
    }
}
{
    // 密码太短应被前端拦下
    try {
        sandbox.doLogout();
        el('loginEmail').value = 'a@b.com';
        el('loginPassword').value = '123';
        const before = calls.length;
        sandbox.doRegister();
        await new Promise((r) => setTimeout(r, 100));
        check('密码过短不发请求', calls.length === before, String(calls.length - before));
    } catch (e) {
        check('密码过短不发请求', false, e.message);
    }
}

// 13. 导入内置内容（两步确认 + 状态栏）
console.log('\n=== 导入内置内容 ===');
{
    try {
        const before = calls.filter((c) => c.startsWith('POST /api/pages')).length;
        // 第一次点击：只提示，不发请求
        sandbox.importSeed();
        await new Promise((r) => setTimeout(r, 50));
        const afterFirst = calls.filter((c) => c.startsWith('POST /api/pages')).length;
        check('第一次点击只提示不发请求', afterFirst === before, String(afterFirst - before));
        check('状态栏提示再点一次', /再点一次/.test(el('importStatus').textContent), el('importStatus').textContent);
        check('按钮文案变为确认', /确认导入/.test(el('importBtn').textContent), el('importBtn').textContent);

        // 第二次点击：真正导入
        sandbox.importSeed();
        await new Promise((r) => setTimeout(r, 400));
        const afterSecond = calls.filter((c) => c.startsWith('POST /api/pages')).length;
        check('第二次点击导入 2 个页面', afterSecond - before === 2, String(afterSecond - before));
        check('状态栏显示导入成功', /已导入 2 个页面/.test(el('importStatus').textContent), el('importStatus').textContent);
        check('状态栏样式为成功', /ok/.test(el('importStatus').className), el('importStatus').className);
    } catch (e) {
        check('导入流程可用', false, e.message);
    }
}
{
    // 读取失败时要有明确错误提示
    try {
        const originalFetch = sandbox.fetch;
        sandbox.fetch = function (url, opts) {
            if (String(url).indexOf('seed-pages.json') !== -1) {
                return Promise.resolve({ ok: false, status: 404, text: () => Promise.resolve(''), json: () => Promise.reject(new Error('no json')) });
            }
            return originalFetch(url, opts);
        };
        sandbox.importSeed();
        sandbox.importSeed();
        await new Promise((r) => setTimeout(r, 200));
        check('读取失败有红色错误提示', /导入失败/.test(el('importStatus').textContent) && /err/.test(el('importStatus').className), el('importStatus').textContent);
        sandbox.fetch = originalFetch;
    } catch (e) {
        check('读取失败有红色错误提示', false, e.message);
    }
}

console.log('\n结果：通过 ' + pass + ' 项，失败 ' + fail + ' 项');
console.log('发起过的请求：');
[...new Set(calls)].forEach((c) => console.log('  ' + c));
if (fail > 0) process.exitCode = 1;
