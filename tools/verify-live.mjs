// 线上验收脚本：检查接口 Worker 与站点是否已经部署到最新版
// 用法：node tools/verify-live.mjs
const API = 'https://api.jacksjz.qzz.io';
const SITE = 'https://jacksjz.qzz.io';
const TIMEOUT = 8000;

let pass = 0;
let fail = 0;
const rows = [];

function record(name, ok, detail) {
    rows.push({ name, ok, detail });
    if (ok) pass++;
    else fail++;
}

async function req(url, options = {}) {
    const ctrl = new AbortController();
    const timer = setTimeout(() => ctrl.abort(), TIMEOUT);
    const started = Date.now();
    try {
        const res = await fetch(url, { ...options, signal: ctrl.signal });
        const text = await res.text();
        let data = null;
        try {
            data = JSON.parse(text);
        } catch (e) {
            data = null;
        }
        return { status: res.status, ok: res.ok, text, data, ms: Date.now() - started, headers: res.headers };
    } catch (e) {
        return { status: 0, ok: false, text: '', data: null, ms: Date.now() - started, error: e.message };
    } finally {
        clearTimeout(timer);
    }
}

console.log('='.repeat(56));
console.log('  线上验收：' + new Date().toLocaleString('zh-CN'));
console.log('='.repeat(56));

/* ---------------- 1. 接口 ---------------- */
console.log('\n【接口】' + API);

const health = await req(API + '/api/health');
record('GET /api/health 返回 200', health.status === 200, 'HTTP ' + health.status);
const f = (health.data && health.data.features) || {};
const hasAdminApi = f.has_admin_api === true;
record('健康检查包含后台接口指纹', hasAdminApi, hasAdminApi ? '' : '缺少 has_admin_api → 线上是旧版 Worker');

if (health.data) {
    record('数据库已连接', health.data.db === 'connected', 'db=' + health.data.db);
    const tables = health.data.tables || [];
    record('数据表齐全（含 pages）', ['users', 'comments', 'sessions', 'pages'].every((t) => tables.indexOf(t) !== -1), tables.join(','));
    record('邀请制生效', f.whitelist_login_only === true && f.allowed_email_count === 6, 'count=' + f.allowed_email_count);
    record('后台口令状态可读', 'admin_gate' in f, 'admin_gate=' + f.admin_gate);
}

const pages = await req(API + '/api/pages');
record('GET /api/pages 可用', pages.status === 200 && pages.data && Array.isArray(pages.data.pages), 'HTTP ' + pages.status);
if (pages.data && Array.isArray(pages.data.pages)) {
    console.log('       已发布页面数：' + pages.data.pages.length);
}

const missing = await req(API + '/api/pages?slug=__definitely_not_exists__');
record('不存在的页面返回 404', missing.status === 404, 'HTTP ' + missing.status);

for (const [path, label] of [
    ['/api/admin/pages', '页面列表'],
    ['/api/admin/users', '用户列表'],
    ['/api/admin/comments', '评论列表'],
    ['/api/admin/stats', '统计'],
]) {
    const r = await req(API + path);
    const ok = r.status === 401 || r.status === 403;
    record('未登录访问' + label + '被拒绝', ok, 'HTTP ' + r.status + (r.status === 404 ? '（未部署）' : ''));
}

const gate = await req(API + '/api/admin/gate', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ key: 'wrong-key' }),
});
record('后台口令接口存在', gate.status === 200 || gate.status === 403, 'HTTP ' + gate.status);

const preflight = await req(API + '/api/admin/pages', { method: 'OPTIONS' });
const methods = (preflight.headers && preflight.headers.get('access-control-allow-methods')) || '';
record('CORS 预检允许 PATCH', preflight.status === 200 && /PATCH/.test(methods), methods);

const outsider = await req(API + '/api/login', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ email: 'nobody-here@qq.com', password: '123456' }),
});
record('名单外邮箱登录被拒', outsider.status === 403, 'HTTP ' + outsider.status);

/* ---------------- 2. 站点 ---------------- */
console.log('\n【站点】' + SITE);

const home = await req(SITE + '/');
record('首页可访问', home.status === 200, 'HTTP ' + home.status);

const adminPage = await req(SITE + '/admin.html');
record('后台页面已部署', adminPage.status === 200, 'HTTP ' + adminPage.status + (adminPage.status === 404 ? '（未推送）' : ''));
if (adminPage.status === 200) {
    record('后台页含口令/登录界面', /后台口令|管理员登录/.test(adminPage.text), '');
    record('后台页不再显示管理员邮箱', !/318886406@qq\.com/.test(adminPage.text), '页面里仍出现邮箱');
    record('后台页不再显示接口地址', !/接口地址：/.test(adminPage.text), '页面里仍显示接口地址');
}

for (const p of ['/page.html', '/pages.html', '/check.html', '/robots.txt']) {
    const r = await req(SITE + p);
    record(p + ' 可访问', r.status === 200, 'HTTP ' + r.status);
}

const robots = await req(SITE + '/robots.txt');
if (robots.status === 200) {
    record('robots 屏蔽后台', /Disallow:\s*\/admin\.html/.test(robots.text), '');
}

/* ---------------- 3. 汇总 ---------------- */
console.log('\n' + '='.repeat(56));
console.log('  结果');
console.log('='.repeat(56));
for (const r of rows) {
    console.log((r.ok ? '✔ ' : '✘ ') + r.name + (r.ok || !r.detail ? '' : '  → ' + r.detail));
}

console.log('\n通过 ' + pass + ' 项，失败 ' + fail + ' 项');

// 结论
const frontReady = adminPage.status === 200;
if (!hasAdminApi && !frontReady) {
    console.log('\n❌ 结论：前端和接口都还是旧版。请先双击 一键上线.cmd（提交+推送+部署）。');
} else if (!hasAdminApi) {
    console.log('\n⚠️ 结论：前端已更新，但接口 Worker 还是旧版（缺 has_admin_api）。');
    console.log('   办法 A：双击 部署后台.cmd');
    console.log('   办法 B：Cloudflare → Workers & Pages → blog → 编辑代码 → 粘贴 worker-dist/index.js → Deploy');
} else if (!frontReady) {
    console.log('\n⚠️ 结论：接口已更新，但后台页面没推送（admin.html 404）。请 Commit + Push。');
} else if (fail === 0) {
    console.log('\n✅ 结论：全部就绪。打开 ' + SITE + '/admin.html 用管理员账号登录即可。');
} else {
    console.log('\n⚠️ 结论：接口和前端都在线，但有 ' + fail + ' 项不符合预期，见上面 ✘ 行。');
}

if (fail > 0) process.exitCode = 1;
