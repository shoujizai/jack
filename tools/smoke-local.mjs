// 本地接口服务冒烟测试：验证 HTTP 层 + 真实数据库的完整流程
const BASE = 'http://127.0.0.1:8787';
let pass = 0;
let fail = 0;
const check = (name, cond, extra) => {
    if (cond) {
        pass++;
        console.log('✔ ' + name);
    } else {
        fail++;
        console.log('✘ ' + name + (extra !== undefined ? '  → ' + String(JSON.stringify(extra)).slice(0, 200) : ''));
    }
};

async function call(pathname, options) {
    const res = await fetch(BASE + pathname, options);
    const text = await res.text();
    let data = null;
    try {
        data = JSON.parse(text);
    } catch (e) {
        data = text;
    }
    return { status: res.status, data, headers: res.headers };
}

const J = { 'Content-Type': 'application/json' };

console.log('=== 本地接口冒烟 ===');
const health = await call('/api/health');
check('health 200', health.status === 200, health.data);
check('后台接口已启用', health.data.features.has_admin_api === true);
check('页面表已就绪', health.data.features.has_pages_table === true);

const reg = await call('/api/register', { method: 'POST', headers: J, body: JSON.stringify({ email: '318886406@qq.com', password: 'localtest123', nickname: '本地站长' }) });
check('注册（或已存在）', reg.status === 200 || /已被注册/.test(reg.data.error || ''), reg.data);

const login = await call('/api/login', { method: 'POST', headers: J, body: JSON.stringify({ email: '318886406@qq.com', password: 'localtest123' }) });
check('登录成功', login.status === 200 && !!login.data.token, login.data);
const token = login.data.token;
const auth = { ...J, Authorization: 'Bearer ' + token };

const stats = await call('/api/admin/stats', { headers: auth });
check('概览接口可用', stats.status === 200 && typeof stats.data.users === 'number', stats.data);

const created = await call('/api/pages', { method: 'POST', headers: auth, body: JSON.stringify({ title: '本地测试页', subtitle: '验证用', published: true, blocks: [{ type: 'heading', text: '你好' }, { type: 'paragraph', text: '正文 **加粗** 测试' }] }) });
check('新建页面成功', created.status === 200 && !!created.data.slug, created.data);

const page = await call('/api/pages?slug=' + created.data.slug);
check('页面可读', page.status === 200 && page.data.title === '本地测试页', page.data);

const list = await call('/api/admin/pages', { headers: auth });
check('管理列表包含该页面', list.status === 200 && list.data.pages.some((p) => p.slug === created.data.slug), list.data.pages && list.data.pages.length);

const comments = await call('/api/admin/comments', { headers: auth });
check('评论管理接口可用', comments.status === 200 && Array.isArray(comments.data.comments), comments.data);

const users = await call('/api/admin/users', { headers: auth });
check('用户管理接口可用', users.status === 200 && users.data.users.length >= 1, users.data.users && users.data.users.length);

const cors = health.headers.get('access-control-allow-origin');
check('CORS 头存在（本地页面可跨端口调用）', cors === '*', cors);

console.log('\n结果：通过 ' + pass + ' 项，失败 ' + fail + ' 项');
if (fail > 0) process.exitCode = 1;
