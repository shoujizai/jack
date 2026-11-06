// 真实 SQLite 端到端测试：用 node:sqlite 充当 D1，跑完整业务流程
import { DatabaseSync } from 'node:sqlite';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

process.removeAllListeners('warning'); // 屏蔽 experimental 警告

const DIR = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const worker = (await import('../worker-dist/index.js')).default;

/* ---------------- D1 适配器（真实 SQLite） ---------------- */
function makeDB(sqlite) {
    return {
        prepare(sql) {
            const stmt = {
                _args: [],
                bind(...args) {
                    this._args = args;
                    return this;
                },
                async first() {
                    const row = sqlite.prepare(sql).get(...this._args);
                    return row === undefined ? null : row;
                },
                async all() {
                    const rows = sqlite.prepare(sql).all(...this._args);
                    return { results: rows, success: true, meta: {} };
                },
                async run() {
                    const info = sqlite.prepare(sql).run(...this._args);
                    return {
                        success: true,
                        meta: { changes: info.changes, last_row_id: Number(info.lastInsertRowid || 0) },
                    };
                },
            };
            return stmt;
        },
    };
}

const sqlite = new DatabaseSync(':memory:');
const env = {
    DB: makeDB(sqlite),
    JWT_SECRET: 'test-secret',
    ORDER_JSON_URL: 'https://example.com/orders.json',
};

let pass = 0;
let fail = 0;
function check(name, cond, extra) {
    if (cond) {
        pass++;
        console.log('✔ ' + name);
    } else {
        fail++;
        console.log('✘ ' + name + (extra !== undefined ? '  → ' + String(JSON.stringify(extra)).slice(0, 220) : ''));
    }
}

async function call(pathname, init = {}, envOverride) {
    const req = new Request('https://local.test' + pathname, init);
    const res = await worker.fetch(req, envOverride || env, {});
    const text = await res.text();
    let data = null;
    try {
        data = JSON.parse(text);
    } catch (e) {
        data = text;
    }
    return { status: res.status, data, headers: res.headers };
}

const ADMIN = '318886406@qq.com';
let token = '';
const auth = () => ({ Authorization: 'Bearer ' + token });
const jsonHeaders = { 'Content-Type': 'application/json' };

/* ---------------- 1. 自动建表 ---------------- */
console.log('=== 1. 首次请求自动建表（真实 SQLite） ===');
{
    const r = await call('/api/health');
    check('health 200', r.status === 200, r.data);
    check('自动建表：tables 含 pages', (r.data.tables || []).indexOf('pages') !== -1, r.data.tables);
    check('has_pages_table=true', r.data.features && r.data.features.has_pages_table === true);
    const tables = sqlite.prepare("select name from sqlite_master where type='table' order by name").all().map((x) => x.name);
    check('真实库里有 5 张表（含 login_failures）', tables.length >= 5, tables);
    const cols = sqlite.prepare('pragma table_info(users)').all().map((x) => x.name);
    check('users 有 banned_until 字段', cols.indexOf('banned_until') !== -1, cols);
}

/* ---------------- 2. 注册 / 登录 ---------------- */
console.log('\n=== 2. 注册与登录 ===');
{
    const r = await call('/api/register', {
        method: 'POST',
        headers: jsonHeaders,
        body: JSON.stringify({ email: ADMIN, password: 'admin-pass', nickname: '站长' }),
    });
    check('管理员邮箱注册成功', r.status === 200, r.data);

    const r2 = await call('/api/register', {
        method: 'POST',
        headers: jsonHeaders,
        body: JSON.stringify({ email: 'stranger@qq.com', password: '123456' }),
    });
    check('名单外邮箱注册被拒', r2.status === 403, r2.data);

    const r3 = await call('/api/login', {
        method: 'POST',
        headers: jsonHeaders,
        body: JSON.stringify({ email: ADMIN, password: 'admin-pass' }),
    });
    check('登录成功并返回 token', r3.status === 200 && !!r3.data.token, r3.data);
    check('返回 is_admin/role=admin', r3.data.user && r3.data.user.is_admin === true && r3.data.user.role === 'admin', r3.data.user);
    token = r3.data.token;

    const me = await call('/api/me', { headers: auth() });
    check('/api/me 可用', me.status === 200 && me.data.email === ADMIN, me.data);
}

/* ---------------- 3. 页面 CRUD（真实 SQL upsert） ---------------- */
console.log('\n=== 3. 页面增删改查 ===');
let demoSlug = '';
{
    const r = await call('/api/pages', {
        method: 'POST',
        headers: { ...auth(), ...jsonHeaders },
        body: JSON.stringify({ title: '新手入门', subtitle: '从零开始', published: true, blocks: [{ type: 'heading', text: '第一步' }] }),
    });
    check('新建页面（地址自动生成）', r.status === 200 && /^p-[a-z0-9]{6}$/.test(r.data.slug || ''), r.data);
    demoSlug = r.data.slug;

    const pub = await call('/api/pages?slug=' + demoSlug);
    check('已发布页面匿名可读', pub.status === 200 && pub.data.title === '新手入门', pub.data);
    check('方块 JSON 正确往返', Array.isArray(pub.data.blocks) && pub.data.blocks[0].text === '第一步', pub.data.blocks);

    // upsert 同 slug 改标题
    const up = await call('/api/pages', {
        method: 'POST',
        headers: { ...auth(), ...jsonHeaders },
        body: JSON.stringify({ slug: demoSlug, title: '新手入门 v2', published: true, blocks: [] }),
    });
    check('同地址保存 = 更新（upsert）', up.status === 200, up.data);
    const total = sqlite.prepare('select count(*) as n from pages').get().n;
    check('没有产生重复行', total === 1, total);
    const after = await call('/api/pages?slug=' + demoSlug);
    check('标题已更新', after.data.title === '新手入门 v2', after.data.title);

    // 草稿保护
    const draft = await call('/api/pages', {
        method: 'POST',
        headers: { ...auth(), ...jsonHeaders },
        body: JSON.stringify({ slug: 'my-draft', title: '草稿页', published: false, blocks: [{ type: 'paragraph', text: 'secret' }] }),
    });
    check('新建草稿页面', draft.status === 200, draft.data);
    const anon = await call('/api/pages?slug=my-draft');
    check('匿名读草稿 → 404', anon.status === 404, anon.status);
    const asAdmin = await call('/api/pages?slug=my-draft', { headers: auth() });
    check('管理员读草稿 → 200', asAdmin.status === 200 && asAdmin.data.title === '草稿页', asAdmin.data);

    const list = await call('/api/pages');
    check('公开列表只含已发布', list.data.pages.length === 1 && list.data.pages[0].slug === demoSlug, list.data.pages);

    const adminList = await call('/api/admin/pages', { headers: auth() });
    check('管理列表含草稿（2 个）', adminList.status === 200 && adminList.data.pages.length === 2, adminList.data.pages && adminList.data.pages.length);

    const del = await call('/api/pages?slug=my-draft', { method: 'DELETE', headers: auth() });
    check('删除页面', del.status === 200, del.data);
    const gone = await call('/api/pages?slug=my-draft');
    check('删除后 404', gone.status === 404, gone.status);
}

/* ---------------- 4. 一键导入内容包（真实入库） ---------------- */
console.log('\n=== 4. 导入内置内容包 ===');
{
    const seed = JSON.parse(fs.readFileSync(path.join(DIR, 'seed-pages.json'), 'utf8'));
    let ok = 0;
    for (const p of seed) {
        const r = await call('/api/pages', { method: 'POST', headers: { ...auth(), ...jsonHeaders }, body: JSON.stringify(p) });
        if (r.status === 200) ok++;
    }
    check('7 个教程页全部导入成功', ok === seed.length, ok + '/' + seed.length);
    const n = sqlite.prepare('select count(*) as n from pages').get().n;
    check('库中页面数 = 1 + 7', n === 8, n);
    const one = await call('/api/pages?slug=faq', { headers: auth() });
    check('导入的 faq 页面可读且有问答方块', one.status === 200 && one.data.blocks.some((b) => b.type === 'faq'), one.data && one.data.blocks && one.data.blocks.length);
    const blocksCount = one.data.blocks.length;
    check('faq 页面方块数 >= 8', blocksCount >= 8, blocksCount);
}

/* ---------------- 5. 评论 ---------------- */
console.log('\n=== 5. 评论 ===');
{
    const post = await call('/api/comments', {
        method: 'POST',
        headers: { ...auth(), ...jsonHeaders },
        body: JSON.stringify({ page_id: 'index', content: '第一条评论' }),
    });
    check('发表评论', post.status === 200, post.data);

    const list = await call('/api/comments?page=index');
    check('读取评论列表', list.status === 200 && list.data.comments.length === 1, list.data.comments);
    check('评论带作者昵称', /站长/.test(list.data.comments[0].nickname || ''), list.data.comments[0]);

    const adminList = await call('/api/admin/comments', { headers: auth() });
    check('管理员可看全部评论', adminList.status === 200 && adminList.data.comments.length === 1, adminList.data.comments && adminList.data.comments.length);

    const del = await call('/api/admin/comments?id=' + list.data.comments[0].id, { method: 'DELETE', headers: auth() });
    check('管理员可删任意评论', del.status === 200, del.data);
    const after = await call('/api/comments?page=index');
    check('删除后列表为空', after.data.comments.length === 0, after.data.comments.length);
}

/* ---------------- 6. 用户管理 ---------------- */
console.log('\n=== 6. 用户管理 ===');
{
    const users = await call('/api/admin/users', { headers: auth() });
    check('用户列表返回 1 人', users.status === 200 && users.data.users.length === 1, users.data.users && users.data.users.length);
    const uid = users.data.users[0].id;

    const patch = await call('/api/admin/users?id=' + uid, {
        method: 'PATCH',
        headers: { ...auth(), ...jsonHeaders },
        body: JSON.stringify({ is_customer: true, nickname: '站长改名' }),
    });
    check('PATCH 设为客户', patch.status === 200, patch.data);

    const reload = sqlite.prepare('select is_customer, nickname from users where id = ?').get(uid);
    check('数据库已更新（is_customer=1）', reload.is_customer === 1 && reload.nickname === '站长改名', reload);

    const ban = await call('/api/admin/users?id=' + uid, {
        method: 'PATCH',
        headers: { ...auth(), ...jsonHeaders },
        body: JSON.stringify({ banned_until: Math.floor(Date.now() / 1000) + 3600 }),
    });
    check('封禁操作成功', ban.status === 200, ban.data);
    const loginBanned = await call('/api/login', {
        method: 'POST',
        headers: jsonHeaders,
        body: JSON.stringify({ email: ADMIN, password: 'admin-pass' }),
    });
    check('被封禁后无法登录', loginBanned.status === 403 && /封禁/.test(loginBanned.data.error || ''), loginBanned.data);

    // 解封
    await call('/api/admin/users?id=' + uid, {
        method: 'PATCH',
        headers: { ...auth(), ...jsonHeaders },
        body: JSON.stringify({ banned_until: 0 }),
    });
    const loginAgain = await call('/api/login', {
        method: 'POST',
        headers: jsonHeaders,
        body: JSON.stringify({ email: ADMIN, password: 'admin-pass' }),
    });
    check('解封后可正常登录', loginAgain.status === 200, loginAgain.data);
}

/* ---------------- 7. 登录防爆破 ---------------- */
console.log('\n=== 7. 登录防爆破（真实计数） ===');
{
    let last;
    for (let i = 0; i < 6; i++) {
        last = await call('/api/login', {
            method: 'POST',
            headers: jsonHeaders,
            body: JSON.stringify({ email: ADMIN, password: 'wrong-' + i }),
        });
    }
    check('连续失败 6 次后返回 429', last.status === 429, last);
    const fails = sqlite.prepare('select count(*) as n from login_failures').get().n;
    check('失败记录写入数据库（5 条）', fails === 5, fails);
}

/* ---------------- 8. 后台口令 ---------------- */
console.log('\n=== 8. 后台口令（真实环境变量） ===');
{
    const gated = { ...env, ADMIN_GATE_KEY: 'local-secret' };
    const noKey = await call('/api/admin/stats', { headers: auth() }, gated);
    check('启用口令后缺 header → 403 code=gate', noKey.status === 403 && noKey.data.code === 'gate', noKey.data);
    const withKey = await call('/api/admin/stats', { headers: { ...auth(), 'X-Admin-Key': 'local-secret' } }, gated);
    check('带上口令 → 200', withKey.status === 200, withKey.data);
    const wrongKey = await call('/api/admin/gate', {
        method: 'POST',
        headers: jsonHeaders,
        body: JSON.stringify({ key: 'nope' }),
    }, gated);
    check('口令校验接口拒绝错误口令', wrongKey.status === 403, wrongKey.data);
    const rightKey = await call('/api/admin/gate', {
        method: 'POST',
        headers: jsonHeaders,
        body: JSON.stringify({ key: 'local-secret' }),
    }, gated);
    check('口令校验接口接受正确口令', rightKey.status === 200 && rightKey.data.gate === true, rightKey.data);
    const healthGated = await call('/api/health', {}, gated);
    check('health 反映 admin_gate=true', healthGated.data.features.admin_gate === true, healthGated.data.features);
}

console.log('\n结果：通过 ' + pass + ' 项，失败 ' + fail + ' 项');
if (fail > 0) process.exitCode = 1;
