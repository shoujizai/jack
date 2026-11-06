// 本地接口测试：用 mock D1 直接执行 worker-dist/index.js，验证路由与鉴权
import worker from '../worker-dist/index.js';

const SECRET = 'test-secret';

function makeDB(options = {}) {
    const tables = [...(options.tables || ['users', 'comments', 'sessions'])];
    const columns = new Set(['id', 'email', 'password_hash', 'nickname', 'is_customer', 'order_id', 'serial_numbers', 'created_at', 'last_login']);
    const users = options.users || [];
    const pages = options.pages || [];
    const failures = options.failures || [];
    return {
        prepare(sql) {
            const stmt = {
                _sql: sql.replace(/\s+/g, ' ').trim(),
                _args: [],
                bind(...args) {
                    this._args = args;
                    return this;
                },
                async first() {
                    if (/sqlite_master/i.test(sql)) {
                        return tables.includes(this._args[0]) ? { name: this._args[0] } : null;
                    }
                    if (/FROM login_failures/i.test(sql)) {
                        const [email, since] = this._args;
                        const n = failures.filter((f) => f.email === email && f.ts > since).length;
                        return { n };
                    }
                    if (/FROM pages WHERE slug = \?/i.test(sql)) {
                        return pages.find((p) => p.slug === this._args[0]) || null;
                    }
                    if (/FROM users WHERE id = \?/i.test(sql)) {
                        return users.find((u) => u.id === this._args[0]) || null;
                    }
                    if (/FROM users WHERE email = \? AND password_hash = \?/i.test(sql)) {
                        return users.find((u) => u.email === this._args[0] && u.password_hash === this._args[1]) || null;
                    }
                    if (/COUNT\(\*\)/i.test(sql)) return { n: 0, customers: 0, published: 0 };
                    return null;
                },
                async all() {
                    if (/sqlite_master/i.test(sql)) {
                        return { results: tables.map((name) => ({ name })) };
                    }
                    if (/FROM pages/i.test(sql)) {
                        const onlyPublished = /published = 1/i.test(sql);
                        const withBlocks = /blocks/i.test(sql);
                        const rows = pages.filter((p) => (onlyPublished ? p.published === 1 : true));
                        return {
                            results: rows.map((p) => {
                                const base = { slug: p.slug, title: p.title, subtitle: p.subtitle, updated_at: p.updated_at, published: p.published, sort_order: p.sort_order };
                                if (withBlocks) base.blocks = p.blocks;
                                return base;
                            }),
                        };
                    }
                    return { results: [] };
                },
                async run() {
                    // 模拟 DDL：建表 / 建索引 / 加字段
                    const create = this._sql.match(/CREATE TABLE IF NOT EXISTS (\w+)/i);
                    if (create && !tables.includes(create[1])) tables.push(create[1]);
                    const alter = this._sql.match(/ALTER TABLE users ADD COLUMN (\w+)/i);
                    if (alter) {
                        if (columns.has(alter[1])) throw new Error('duplicate column name: ' + alter[1]);
                        columns.add(alter[1]);
                    }
                    if (/INSERT INTO login_failures/i.test(this._sql)) {
                        failures.push({ email: this._args[0], ts: this._args[1] });
                    }
                    if (/DELETE FROM login_failures/i.test(this._sql)) {
                        const email = this._args[0];
                        for (let i = failures.length - 1; i >= 0; i--) {
                            if (failures[i].email === email) failures.splice(i, 1);
                        }
                    }
                    return { success: true, meta: { changes: 1 }, tables, columns };
                },
            };
            return stmt;
        },
        _tables: tables,
        _columns: columns,
    };
}

async function call(path, init = {}, dbOptions = {}, envExtra = {}) {
    const env = {
        DB: makeDB(dbOptions),
        JWT_SECRET: SECRET,
        ORDER_JSON_URL: 'https://example.com/orders.json',
        ...envExtra,
    };
    const req = new Request('https://api.test' + path, init);
    const res = await worker.fetch(req, env, {});
    let body = null;
    const text = await res.text();
    try {
        body = JSON.parse(text);
    } catch (e) {
        body = text.slice(0, 120);
    }
    return { status: res.status, body, headers: res.headers };
}

let pass = 0;
let fail = 0;

function check(name, cond, extra) {
    if (cond) {
        pass++;
        console.log('✔ ' + name);
    } else {
        fail++;
        console.log('✘ ' + name + (extra ? '  → ' + JSON.stringify(extra).slice(0, 200) : ''));
    }
}

console.log('=== 公开接口 ===');
{
    const r = await call('/api/health');
    check('GET /api/health → 200', r.status === 200, r);
    check('  db=connected', r.body && r.body.db === 'connected', r.body);
    check('  首次请求自动建表，tables 至少 4 张', r.body && Array.isArray(r.body.tables) && r.body.tables.length >= 4, r.body && r.body.tables);
    check('  has_pages_table=true（自动建表生效）', r.body && r.body.features && r.body.features.has_pages_table === true, r.body);
    check('  has_admin_api=true', r.body && r.body.features && r.body.features.has_admin_api === true, r.body);
}
{
    const r = await call('/api/pages?slug=test');
    check('全新库首次 GET /api/pages → 自动建表后 404（页面不存在，不是 500）', r.status === 404, r);
}
{
    const r = await call('/api/pages', {}, { tables: ['users', 'comments', 'sessions'] });
    check('全新库首次 GET /api/pages（列表）→ 200 空列表', r.status === 200 && Array.isArray(r.body.pages) && r.body.pages.length === 0, r);
}
{
    // 模拟建表失败（例如数据库只读）→ 应返回友好提示
    const brokenDB = {
        prepare() {
            const s = {
                bind() {
                    return s;
                },
                async first() {
                    throw new Error('boom');
                },
                async all() {
                    throw new Error('boom');
                },
                async run() {
                    throw new Error('boom');
                },
            };
            return s;
        },
    };
    const req = new Request('https://api.test/api/pages', { method: 'GET' });
    const res = await worker.fetch(req, { DB: brokenDB, JWT_SECRET: SECRET, ORDER_JSON_URL: 'x' }, {});
    const body = await res.text();
    check('建表失败时返回 500 + 友好提示', res.status === 500 && /数据库还没建表/.test(body), body.slice(0, 160));
}
{
    const r = await call('/api/nope');
    check('未知路径 → 404', r.status === 404, r);
}
{
    const r = await call('/api/health', { method: 'OPTIONS' });
    check('OPTIONS 预检 → 200 且带 CORS', r.status === 200 && /PATCH/.test(r.headers.get('Access-Control-Allow-Methods') || ''), {
        status: r.status,
        methods: r.headers.get('Access-Control-Allow-Methods'),
    });
}

console.log('\n=== 鉴权（未登录） ===');
for (const [path, method] of [
    ['/api/admin/pages', 'GET'],
    ['/api/admin/users', 'GET'],
    ['/api/admin/comments', 'GET'],
    ['/api/admin/stats', 'GET'],
    ['/api/pages', 'POST'],
]) {
    const r = await call(path, { method });
    check(`${method} ${path} → 401`, r.status === 401, r);
}

console.log('\n=== 邀请制 ===');
{
    const r = await call('/api/register', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ email: 'stranger@qq.com', password: '123456' }),
    });
    check('名单外邮箱注册 → 403', r.status === 403 && /不在邀请名单/.test(r.body.error || ''), r);
}
{
    const r = await call('/api/register', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ email: '123@qq.com', password: '123456' }),
    });
    check('白名单邮箱注册 → 200', r.status === 200, r);
}
{
    const r = await call('/api/login', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ email: 'stranger@qq.com', password: '123456' }),
    });
    check('名单外邮箱登录 → 403', r.status === 403 && /不在邀请名单/.test(r.body.error || ''), r);
}
{
    const r = await call('/api/login', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ email: '123@qq.com', password: 'wrong' }),
    });
    check('白名单 + 密码错误 → 400', r.status === 400 && /邮箱或密码错误/.test(r.body.error || ''), r);
}

console.log('\n=== 封禁逻辑 ===');
{
    const future = Math.floor(Date.now() / 1000) + 86400;
    const crypto = await import('node:crypto');
    // 让 mock 用户密码哈希与服务端一致（sha256）
    const hash = crypto.createHash('sha256').update('123456').digest('hex');
    const r = await call(
        '/api/login',
        {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ email: '318886406@qq.com', password: '123456' }),
        },
        { users: [{ id: 1, email: '318886406@qq.com', password_hash: hash, is_customer: 0, banned_until: future }] }
    );
    check('被封禁账号登录 → 403', r.status === 403 && /封禁/.test(r.body.error || ''), r);
}

console.log('\n=== 已建表时的页面接口 ===');
{
    const r = await call('/api/pages', {}, { tables: ['users', 'comments', 'sessions', 'pages'] });
    check('GET /api/pages（无数据）→ 200 + 空列表', r.status === 200 && Array.isArray(r.body.pages) && r.body.pages.length === 0, r);
}
{
    const r = await call('/api/pages?slug=none', {}, { tables: ['users', 'comments', 'sessions', 'pages'] });
    check('GET /api/pages?slug=不存在 → 404', r.status === 404, r);
}

/* ================= 管理员完整链路 ================= */
console.log('\n=== 管理员令牌链路 ===');

const crypto2 = await import('node:crypto');
const hashOf = (pwd) => crypto2.createHash('sha256').update(pwd).digest('hex');
const adminUser = { id: 1, email: '318886406@qq.com', password_hash: hashOf('admin-pass'), nickname: '站长', is_customer: 0 };
const premiumUser = { id: 2, email: '123@qq.com', password_hash: hashOf('prem-pass'), nickname: '高级', is_customer: 0 };
const dbOpts = { tables: ['users', 'comments', 'sessions', 'pages'], users: [adminUser, premiumUser] };

async function loginAs(email, password) {
    const r = await call(
        '/api/login',
        { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ email, password }) },
        dbOpts
    );
    return { ...r, token: r.body && r.body.token, user: r.body && r.body.user };
}

const adminLogin = await loginAs('318886406@qq.com', 'admin-pass');
check('管理员登录 → 200 并返回 token', adminLogin.status === 200 && !!adminLogin.token, adminLogin.body);
check('  返回 is_admin=true', adminLogin.user && adminLogin.user.is_admin === true, adminLogin.user);
check('  返回 role=admin', adminLogin.user && adminLogin.user.role === 'admin', adminLogin.user);

const auth = { Authorization: 'Bearer ' + adminLogin.token };

{
    const r = await call('/api/me', { headers: auth }, dbOpts);
    check('带 token GET /api/me → 200', r.status === 200 && r.body.email === '318886406@qq.com', r.body);
}
for (const [path, method] of [
    ['/api/admin/pages', 'GET'],
    ['/api/admin/users', 'GET'],
    ['/api/admin/comments', 'GET'],
    ['/api/admin/stats', 'GET'],
]) {
    const r = await call(path, { method, headers: auth }, dbOpts);
    check(`管理员 ${method} ${path} → 200`, r.status === 200, r);
}

{
    const r = await call(
        '/api/pages',
        {
            method: 'POST',
            headers: { ...auth, 'Content-Type': 'application/json' },
            body: JSON.stringify({ slug: 'guide-basic', title: '新手入门', subtitle: '一句话', published: true, blocks: [{ type: 'paragraph', text: 'hello' }] }),
        },
        dbOpts
    );
    check('管理员 POST /api/pages（新建）→ 200', r.status === 200 && r.body.slug === 'guide-basic', r);
}
{
    const r = await call(
        '/api/pages',
        { method: 'POST', headers: { ...auth, 'Content-Type': 'application/json' }, body: JSON.stringify({ slug: 'Bad Slug!', title: 'x', blocks: [] }) },
        dbOpts
    );
    check('非法 slug → 400', r.status === 400 && /小写字母/.test(r.body.error || ''), r);
}
{
    // 留空 slug + 中文标题 → 自动生成 p-xxxxxx
    const r = await call(
        '/api/pages',
        { method: 'POST', headers: { ...auth, 'Content-Type': 'application/json' }, body: JSON.stringify({ title: '新手入门指南', blocks: [] }) },
        dbOpts
    );
    check('留空地址 + 中文标题 → 自动生成 p- 开头', r.status === 200 && /^p-[a-z0-9]{6}$/.test(r.body.slug || ''), r.body);
    check('  响应标记 generated=true', r.status === 200 && r.body.generated === true, r.body);
}
{
    // 留空 slug + 英文标题 → 用英文转写
    const r = await call(
        '/api/pages',
        { method: 'POST', headers: { ...auth, 'Content-Type': 'application/json' }, body: JSON.stringify({ title: 'Install Games Fast', blocks: [] }) },
        dbOpts
    );
    check('留空地址 + 英文标题 → install-games-fast', r.status === 200 && r.body.slug === 'install-games-fast', r.body);
}
{
    // 显式地址时不做转写
    const r = await call(
        '/api/pages',
        { method: 'POST', headers: { ...auth, 'Content-Type': 'application/json' }, body: JSON.stringify({ slug: 'my-page', title: '随便什么标题', blocks: [] }) },
        dbOpts
    );
    check('显式地址优先 → my-page 且 generated=false', r.status === 200 && r.body.slug === 'my-page' && r.body.generated === false, r.body);
}
{
    const r = await call(
        '/api/pages',
        { method: 'POST', headers: { ...auth, 'Content-Type': 'application/json' }, body: JSON.stringify({ slug: 'no-title', title: '' }) },
        dbOpts
    );
    check('标题为空 → 400', r.status === 400, r);
}
{
    const r = await call('/api/pages?slug=guide-basic', { method: 'DELETE', headers: auth }, dbOpts);
    check('管理员 DELETE /api/pages → 200', r.status === 200, r);
}

const premiumLogin = await loginAs('123@qq.com', 'prem-pass');
check('高级用户登录 → 200', premiumLogin.status === 200, premiumLogin.body);
check('  返回 is_admin=false / role=premium', premiumLogin.user && premiumLogin.user.is_admin === false && premiumLogin.user.role === 'premium', premiumLogin.user);
{
    const r = await call('/api/admin/users', { headers: { Authorization: 'Bearer ' + premiumLogin.token } }, dbOpts);
    check('高级用户访问管理接口 → 403', r.status === 403 && /管理员权限/.test(r.body.error || ''), r);
}
{
    const r = await call('/api/pages', { method: 'POST', headers: { Authorization: 'Bearer ' + premiumLogin.token, 'Content-Type': 'application/json' }, body: JSON.stringify({ slug: 'x', title: 'x' }) }, dbOpts);
    check('高级用户创建页面 → 403', r.status === 403, r);
}
{
    const r = await call('/api/admin/users', { headers: { Authorization: 'Bearer bad-token' } }, dbOpts);
    check('伪造 token → 401', r.status === 401, r);
}

/* ================= 草稿保护 ================= */
console.log('\n=== 草稿保护 ===');

const publishedPage = {
    slug: 'live-page',
    title: '已发布页面',
    subtitle: '公开可见',
    blocks: JSON.stringify([{ type: 'paragraph', text: 'hi' }]),
    published: 1,
    sort_order: 100,
    updated_at: 1700000000,
};
const draftPage = {
    slug: 'draft-page',
    title: '草稿页面',
    subtitle: '还没发布',
    blocks: JSON.stringify([{ type: 'paragraph', text: 'secret' }]),
    published: 0,
    sort_order: 100,
    updated_at: 1700000000,
};
const pageDB = { ...dbOpts, pages: [publishedPage, draftPage] };

{
    const r = await call('/api/pages?slug=live-page', {}, pageDB);
    check('匿名读已发布页面 → 200', r.status === 200 && r.body.title === '已发布页面', r);
}
{
    const r = await call('/api/pages?slug=draft-page', {}, pageDB);
    check('匿名读草稿 → 404（不泄露存在性）', r.status === 404, r);
}
{
    const r = await call('/api/pages?slug=draft-page', { headers: auth }, pageDB);
    check('管理员读草稿 → 200', r.status === 200 && r.body.title === '草稿页面', r);
}
{
    const r = await call('/api/pages?slug=draft-page', { headers: { Authorization: 'Bearer ' + premiumLogin.token } }, pageDB);
    check('高级用户读草稿 → 404', r.status === 404, r);
}
{
    const r = await call('/api/pages', {}, pageDB);
    check('公开列表只含已发布页面', r.status === 200 && r.body.pages.length === 1 && r.body.pages[0].slug === 'live-page', r.body);
    check('公开列表不含 blocks（省流量）', r.body.pages[0].blocks === undefined, r.body.pages[0]);
}
{
    const r = await call('/api/admin/pages', { headers: auth }, pageDB);
    check('管理列表默认不含 blocks', r.status === 200 && r.body.pages[0].blocks === undefined, r.body.pages[0]);
}
{
    const r = await call('/api/admin/pages?full=1', { headers: auth }, pageDB);
    check('?full=1 带出 blocks（供导出）', r.status === 200 && Array.isArray(r.body.pages[0].blocks), r.body.pages[0]);
    check('?full=1 返回 full=true', r.body.full === true, r.body.full);
}

/* ================= 后台口令 ================= */
console.log('\n=== 后台口令（ADMIN_GATE_KEY）===');
{
    const r = await call('/api/admin/gate', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ key: 'x' }) });
    check('未配置口令时 /api/admin/gate → gate:false', r.status === 200 && r.body.gate === false, r.body);
}
{
    const gateEnv = { ADMIN_GATE_KEY: 'super-secret' };
    const r = await call('/api/admin/gate', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ key: 'wrong' }) }, dbOpts, gateEnv);
    check('口令错误 → 403', r.status === 403, r);
}
{
    const gateEnv = { ADMIN_GATE_KEY: 'super-secret' };
    const r = await call('/api/admin/gate', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ key: 'super-secret' }) }, dbOpts, gateEnv);
    check('口令正确 → 200 gate:true', r.status === 200 && r.body.gate === true, r);
}
{
    const gateEnv = { ADMIN_GATE_KEY: 'super-secret' };
    const r = await call('/api/admin/users', { headers: auth }, dbOpts, gateEnv);
    check('启用口令后，管理接口缺 X-Admin-Key → 403 code=gate', r.status === 403 && r.body.code === 'gate', r.body);
}
{
    const gateEnv = { ADMIN_GATE_KEY: 'super-secret' };
    const r = await call('/api/admin/users', { headers: { ...auth, 'X-Admin-Key': 'super-secret' } }, dbOpts, gateEnv);
    check('带上正确 X-Admin-Key → 200', r.status === 200, r);
}
{
    const gateEnv = { ADMIN_GATE_KEY: 'super-secret' };
    const r = await call('/api/health', {}, dbOpts, gateEnv);
    check('health 反映 admin_gate=true', r.status === 200 && r.body.features.admin_gate === true, r.body.features);
}
{
    const r = await call('/api/health');
    check('未配置时 admin_gate=false', r.body.features.admin_gate === false, r.body.features);
}

/* ================= 登录防爆破 ================= */
console.log('\n=== 登录防爆破 ===');
{
    // 连续 5 次密码错误后，第 6 次应被锁（共享失败记录）
    const failures = [];
    const lockDB = { ...dbOpts, failures };
    let last;
    for (let i = 0; i < 6; i++) {
        last = await call(
            '/api/login',
            { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ email: '318886406@qq.com', password: 'wrong-' + i }) },
            lockDB
        );
    }
    check('连续失败 5 次后返回 429', last.status === 429 && /尝试次数过多/.test(last.body.error || ''), last);
    check('失败记录已写入 5 条', failures.length === 5, failures.length);
}
{
    // 另一个邮箱不受影响
    const r = await call(
        '/api/login',
        { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ email: '123@qq.com', password: 'wrong' }) },
        dbOpts
    );
    check('其他邮箱不受影响（仍是 400）', r.status === 400, r);
}
{
    // 密码正确时清空失败记录
    const failures = [{ email: '318886406@qq.com', ts: Math.floor(Date.now() / 1000) - 10 }];
    const okDB = { ...dbOpts, failures };
    const r = await call(
        '/api/login',
        { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ email: '318886406@qq.com', password: 'admin-pass' }) },
        okDB
    );
    check('登录成功后清空失败记录', r.status === 200 && failures.length === 0, { status: r.status, left: failures.length });
}

console.log('\n结果：通过 ' + pass + ' 项，失败 ' + fail + ' 项');
if (fail > 0) process.exitCode = 1;

