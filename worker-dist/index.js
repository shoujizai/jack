/* ------------------------------------------------------------------
 * 代码版本标记：每次改动后端就 +1，方便一眼看出线上/本地跑的是不是最新代码
 * ------------------------------------------------------------------ */
const CODE_VERSION = 'admin-10';
/* ------------------------------------------------------------------
 * 访问开关（想开放给所有人时，把 REGISTRATION_OPEN 改成 true 即可）
 * ------------------------------------------------------------------ */
const REGISTRATION_OPEN = false;
const ROLE_BY_EMAIL = {
    '318886406@qq.com': 'admin',
    '1258528471@qq.com': 'premium',
    '123@qq.com': 'premium',
    '456@qq.com': 'player',
    '789@qq.com': 'player',
    '147@qq.com': 'player',
};
function normalizeEmail(email) {
    return email ? String(email).trim().toLowerCase() : '';
}
function getRole(email) {
    const key = normalizeEmail(email);
    return ROLE_BY_EMAIL[key] || null;
}
function isAdminEmail(email) {
    return getRole(email) === 'admin';
}
// 能看高级分区的人：管理员、高级用户，以及在后台激活过订单的客户
function hasPremiumAccess(user) {
    const role = getRole(user.email);
    return role === 'admin' || role === 'premium' || user.is_customer === 1;
}
async function hashPassword(password) {
    const encoder = new TextEncoder();
    const data = encoder.encode(password);
    const hashBuffer = await crypto.subtle.digest('SHA-256', data);
    const hashArray = Array.from(new Uint8Array(hashBuffer));
    return hashArray.map(b => b.toString(16).padStart(2, '0')).join('');
}
async function generateToken(userId, secret) {
    const timestamp = Math.floor(Date.now() / 1000);
    const payload = `${userId}:${timestamp}:${Math.random().toString(36).substring(7)}`;
    const encoder = new TextEncoder();
    const data = encoder.encode(payload + secret);
    const hashBuffer = await crypto.subtle.digest('SHA-256', data);
    const hashArray = Array.from(new Uint8Array(hashBuffer));
    const hash = hashArray.map(b => b.toString(16).padStart(2, '0')).join('');
    return `${payload}:${hash.substring(0, 16)}`;
}
async function verifyToken(token, secret) {
    const parts = token.split(':');
    if (parts.length !== 4)
        return null;
    const [userId, timestamp, random, hash] = parts;
    const expectedPayload = `${userId}:${timestamp}:${random}`;
    const encoder = new TextEncoder();
    const data = encoder.encode(expectedPayload + secret);
    const hashBuffer = await crypto.subtle.digest('SHA-256', data);
    const hashArray = Array.from(new Uint8Array(hashBuffer));
    const expectedHash = hashArray.map(b => b.toString(16).padStart(2, '0')).join('');
    if (hash !== expectedHash.substring(0, 16))
        return null;
    const tokenAge = Math.floor(Date.now() / 1000) - parseInt(timestamp);
    if (tokenAge > 7 * 24 * 60 * 60)
        return null;
    return parseInt(userId);
}
async function fetchOrderList(url) {
    const response = await fetch(url);
    if (!response.ok) {
        throw new Error('Failed to fetch order list');
    }
    return await response.json();
}
function jsonResponse(data, status = 200) {
    return new Response(JSON.stringify(data), {
        status,
        headers: {
            'Content-Type': 'application/json',
            'Access-Control-Allow-Origin': '*',
            'Access-Control-Allow-Methods': 'GET, POST, PATCH, PUT, DELETE, OPTIONS',
            'Access-Control-Allow-Headers': 'Content-Type, Authorization, X-Admin-Key',
        },
    });
}
function errorResponse(message, status = 400) {
    return jsonResponse({ error: message }, status);
}
// 管理员鉴权：返回 User，或直接返回错误 Response
async function requireAdmin(request, env) {
    const user = await getUserFromRequest(request, env);
    if (!user)
        return errorResponse('请先登录', 401);
    if (!isAdminEmail(user.email))
        return errorResponse('需要管理员权限', 403);
    return user;
}
// 判断某张表是否存在（用于给出友好的"还没建表"提示）
async function hasTable(env, name) {
    try {
        const row = await env.DB.prepare("SELECT name FROM sqlite_master WHERE type='table' AND name = ?")
            .bind(name)
            .first();
        return !!row;
    }
    catch (e) {
        return false;
    }
}
const NO_PAGES_TABLE = '数据库还没建表：请在 api 目录执行 wrangler d1 execute jack-sjz --remote --file=./schema-admin.sql';
/* ------------------------------------------------------------------
 * 由标题生成页面地址（slug）
 * - 纯英文标题 → 直接用英文（如 "Install Games" → install-games）
 * - 中文/其他标题 → p- 加 6 位随机字符（如 p-3f8k2m），保证短、可读、不重复
 * ------------------------------------------------------------------ */
function slugFromTitle(title) {
    const latin = title
        .toLowerCase()
        .replace(/[^a-z0-9]+/g, '-')
        .replace(/^-+|-+$/g, '')
        .slice(0, 40);
    if (latin.replace(/-/g, '').length >= 3)
        return latin;
    const rand = Math.random().toString(36).slice(2, 8);
    return 'p-' + rand;
}
/* ------------------------------------------------------------------
 * 自动初始化数据库结构
 * 部署后第一次访问时自动建表，用户不需要手动执行任何 SQL。
 * 每个 Worker 实例只执行一次（DDL 都是 IF NOT EXISTS，重复执行无副作用）。
 * ------------------------------------------------------------------ */
let schemaReady = null;
async function ensureSchema(env) {
    if (!schemaReady)
        schemaReady = new WeakSet();
    if (schemaReady.has(env))
        return true;
    const ddl = [
        `CREATE TABLE IF NOT EXISTS users (
            id INTEGER PRIMARY KEY AUTOINCREMENT,
            email TEXT UNIQUE NOT NULL,
            password_hash TEXT NOT NULL,
            nickname TEXT,
            is_customer INTEGER DEFAULT 0,
            order_id TEXT,
            serial_numbers TEXT,
            created_at INTEGER DEFAULT (strftime('%s','now')),
            last_login INTEGER
        )`,
        `CREATE TABLE IF NOT EXISTS comments (
            id INTEGER PRIMARY KEY AUTOINCREMENT,
            user_id INTEGER NOT NULL,
            page_id TEXT NOT NULL,
            content TEXT NOT NULL,
            created_at INTEGER DEFAULT (strftime('%s','now'))
        )`,
        `CREATE TABLE IF NOT EXISTS pages (
            slug TEXT PRIMARY KEY,
            title TEXT NOT NULL,
            subtitle TEXT,
            blocks TEXT NOT NULL DEFAULT '[]',
            published INTEGER DEFAULT 1,
            sort_order INTEGER DEFAULT 100,
            created_at INTEGER DEFAULT (strftime('%s','now')),
            updated_at INTEGER DEFAULT (strftime('%s','now')),
            updated_by TEXT
        )`,
        `CREATE INDEX IF NOT EXISTS idx_pages_published ON pages(published)`,
        `CREATE INDEX IF NOT EXISTS idx_comments_page ON comments(page_id)`,
        `CREATE INDEX IF NOT EXISTS idx_users_email ON users(email)`,
        `CREATE TABLE IF NOT EXISTS login_failures (
            id INTEGER PRIMARY KEY AUTOINCREMENT,
            email TEXT,
            ts INTEGER
        )`,
        `CREATE INDEX IF NOT EXISTS idx_login_failures ON login_failures(email, ts)`,
    ];
    try {
        for (const sql of ddl) {
            await env.DB.prepare(sql).run();
        }
        // 老库补充字段（已存在会报错，忽略即可）
        try {
            await env.DB.prepare('ALTER TABLE users ADD COLUMN banned_until INTEGER').run();
        }
        catch (e) {
            /* duplicate column name，忽略 */
        }
        schemaReady.add(env);
        return true;
    }
    catch (e) {
        return false;
    }
}
async function getUserFromRequest(request, env) {
    const authHeader = request.headers.get('Authorization');
    if (!authHeader || !authHeader.startsWith('Bearer ')) {
        return null;
    }
    const token = authHeader.substring(7);
    const userId = await verifyToken(token, env.JWT_SECRET);
    if (!userId)
        return null;
    const result = await env.DB.prepare('SELECT * FROM users WHERE id = ?').bind(userId).first();
    return result || null;
}
export default {
    async fetch(request, env, ctx) {
        // 兜底：如果在 Cloudflare 后台没有配置 Variables，用默认值保证功能可用
        // （JWT_SECRET 本来就已在仓库里公开过，这里不引入新的泄露）
        env = {
            ...env,
            // 不再内置兜底密钥：真实密钥只从 Cloudflare 变量读取
            JWT_SECRET: env.JWT_SECRET || '',
            ORDER_JSON_URL: env.ORDER_JSON_URL ||
                'https://raw.gitcode.com/jack-sjz/sjz-aio/raw/main/resources/list.json',
        };
        const url = new URL(request.url);
        const path = url.pathname;
        // 首次访问自动建表（不需要手动执行 SQL）
        if (path.startsWith('/api/')) {
            await ensureSchema(env);
        }
        // 后台口令：配置了 ADMIN_GATE_KEY 时，所有管理接口都要带 X-Admin-Key
        if (path.startsWith('/api/admin/') && path !== '/api/admin/gate') {
            const gate = env.ADMIN_GATE_KEY;
            if (gate) {
                const provided = request.headers.get('X-Admin-Key') || '';
                if (provided !== gate) {
                    return jsonResponse({ error: '需要后台口令', code: 'gate' }, 403);
                }
            }
        }
        if (request.method === 'OPTIONS') {
            return new Response(null, {
                headers: {
                    'Access-Control-Allow-Origin': '*',
                    'Access-Control-Allow-Methods': 'GET, POST, PATCH, PUT, DELETE, OPTIONS',
                    'Access-Control-Allow-Headers': 'Content-Type, Authorization',
                },
            });
        }
        try {
            if (path === '/api/register' && request.method === 'POST') {
                const body = await request.json();
                if (!body.email || !body.password) {
                    return errorResponse('邮箱和密码不能为空');
                }
                if (!body.email.includes('@')) {
                    return errorResponse('请输入有效的邮箱地址');
                }
                if (body.password.length < 6) {
                    return errorResponse('密码至少需要6位');
                }
                // 注册开关：当前只允许白名单邮箱注册
                if (!REGISTRATION_OPEN && !getRole(body.email)) {
                    return errorResponse('该邮箱不在邀请名单内，暂不能注册', 403);
                }
                const passwordHash = await hashPassword(body.password);
                try {
                    const result = await env.DB.prepare('INSERT INTO users (email, password_hash, nickname) VALUES (?, ?, ?)').bind(body.email, passwordHash, body.nickname || body.email.split('@')[0]).run();
                    return jsonResponse({ success: true, message: '注册成功' });
                }
                catch (e) {
                    if (e.message?.includes('UNIQUE constraint')) {
                        return errorResponse('该邮箱已被注册');
                    }
                    throw e;
                }
            }
            if (path === '/api/login' && request.method === 'POST') {
                const body = await request.json();
                if (!body.email || !body.password) {
                    return errorResponse('邮箱和密码不能为空');
                }
                // 邀请制期间，只允许白名单邮箱登录
                if (!REGISTRATION_OPEN && !getRole(body.email)) {
                    return errorResponse('该邮箱不在邀请名单内，暂不能登录', 403);
                }
                // 暴力破解保护：同一邮箱 15 分钟内失败 5 次，暂时锁定
                const emailKey = normalizeEmail(body.email);
                const nowSec = Math.floor(Date.now() / 1000);
                const WINDOW = 900;
                const MAX_FAILS = 5;
                try {
                    const fails = await env.DB.prepare('SELECT COUNT(*) AS n FROM login_failures WHERE email = ? AND ts > ?')
                        .bind(emailKey, nowSec - WINDOW)
                        .first();
                    if ((fails?.n || 0) >= MAX_FAILS) {
                        return errorResponse('尝试次数过多，请 15 分钟后再试', 429);
                    }
                }
                catch (e) {
                    /* 表还没建好时不阻塞登录 */
                }
                const passwordHash = await hashPassword(body.password);
                const user = await env.DB.prepare('SELECT * FROM users WHERE email = ? AND password_hash = ?').bind(body.email, passwordHash).first();
                if (!user) {
                    try {
                        await env.DB.prepare('INSERT INTO login_failures (email, ts) VALUES (?, ?)')
                            .bind(emailKey, nowSec)
                            .run();
                    }
                    catch (e) {
                        /* 忽略 */
                    }
                    return errorResponse('邮箱或密码错误');
                }
                // 登录成功：清空失败记录
                try {
                    await env.DB.prepare('DELETE FROM login_failures WHERE email = ?').bind(emailKey).run();
                }
                catch (e) {
                    /* 忽略 */
                }
                // 封禁检查
                if (user.banned_until && user.banned_until > nowSec) {
                    return errorResponse('账号已被封禁，如有疑问请联系站长', 403);
                }
                const token = await generateToken(user.id, env.JWT_SECRET);
                await env.DB.prepare('UPDATE users SET last_login = ? WHERE id = ?')
                    .bind(Math.floor(Date.now() / 1000), user.id).run();
                return jsonResponse({
                    success: true,
                    token,
                    user: {
                        id: user.id,
                        email: user.email,
                        nickname: user.nickname,
                        is_customer: user.is_customer === 1,
                        is_admin: isAdminEmail(user.email),
                        role: getRole(user.email),
                        is_premium: hasPremiumAccess(user),
                    },
                });
            }
            if (path === '/api/me' && request.method === 'GET') {
                const user = await getUserFromRequest(request, env);
                if (!user) {
                    return errorResponse('未登录', 401);
                }
                return jsonResponse({
                    id: user.id,
                    email: user.email,
                    nickname: user.nickname,
                    is_customer: user.is_customer === 1,
                    is_admin: isAdminEmail(user.email),
                    role: getRole(user.email),
                    is_premium: hasPremiumAccess(user),
                    registration_open: REGISTRATION_OPEN,
                    order_id: user.order_id,
                    serial_numbers: user.serial_numbers,
                });
            }
            if (path === '/api/activate' && request.method === 'POST') {
                const user = await getUserFromRequest(request, env);
                if (!user) {
                    return errorResponse('请先登录', 401);
                }
                const body = await request.json();
                if (!body.order_id || !body.serial_numbers) {
                    return errorResponse('订单号和序列号不能为空');
                }
                const serialList = body.serial_numbers.split(',').map(s => s.trim().toUpperCase()).filter(s => s.length === 4);
                if (serialList.length === 0 || serialList.length > 3) {
                    return errorResponse('请输入1-3个序列号后4位');
                }
                const orderList = await fetchOrderList(env.ORDER_JSON_URL);
                const orderValue = orderList[body.order_id];
                if (orderValue === undefined) {
                    return errorResponse('订单号不存在');
                }
                const existingUser = await env.DB.prepare('SELECT id FROM users WHERE order_id = ? AND id != ?').bind(body.order_id, user.id).first();
                if (existingUser) {
                    return errorResponse('该订单号已被其他用户激活');
                }
                if (user.is_customer === 1 && user.order_id && user.order_id !== body.order_id) {
                    return errorResponse('您已激活过其他订单，无法更换');
                }
                // 合并现有序列号和新序列号
                let finalSerialList = serialList;
                if (user.serial_numbers) {
                    const existingSerials = user.serial_numbers.split(',');
                    const mergedSerials = [...new Set([...existingSerials, ...serialList])];
                    if (mergedSerials.length > 3) {
                        return errorResponse('序列号总数不能超过3个');
                    }
                    finalSerialList = mergedSerials;
                }
                await env.DB.prepare('UPDATE users SET is_customer = 1, order_id = ?, serial_numbers = ? WHERE id = ?').bind(body.order_id, finalSerialList.join(','), user.id).run();
                return jsonResponse({
                    success: true,
                    message: '激活成功',
                    serial_numbers: finalSerialList,
                });
            }
            if (path === '/api/comments' && request.method === 'GET') {
                const pageId = url.searchParams.get('page') || 'index';
                const limit = parseInt(url.searchParams.get('limit') || '50');
                const comments = await env.DB.prepare(`
                    SELECT c.id, c.user_id, c.page_id, c.content, c.created_at, u.nickname, u.email
                    FROM comments c
                    JOIN users u ON c.user_id = u.id
                    WHERE c.page_id = ?
                    ORDER BY c.created_at DESC
                    LIMIT ?
                `).bind(pageId, limit).all();
                return jsonResponse({ comments: comments.results });
            }
            if (path === '/api/comments' && request.method === 'POST') {
                const user = await getUserFromRequest(request, env);
                if (!user) {
                    return errorResponse('请先登录', 401);
                }
                const body = await request.json();
                if (!body.page_id || !body.content) {
                    return errorResponse('页面ID和评论内容不能为空');
                }
                if (body.content.length > 500) {
                    return errorResponse('评论内容不能超过500字');
                }
                const result = await env.DB.prepare('INSERT INTO comments (user_id, page_id, content) VALUES (?, ?, ?)').bind(user.id, body.page_id, body.content).run();
                return jsonResponse({ success: true, message: '评论成功' });
            }
            if (path === '/api/comments' && request.method === 'DELETE') {
                const user = await getUserFromRequest(request, env);
                if (!user) {
                    return errorResponse('请先登录', 401);
                }
                const commentId = url.searchParams.get('id');
                if (!commentId) {
                    return errorResponse('评论ID不能为空');
                }
                const comment = await env.DB.prepare('SELECT user_id FROM comments WHERE id = ?').bind(commentId).first();
                if (!comment) {
                    return errorResponse('评论不存在');
                }
                if (comment.user_id !== user.id) {
                    return errorResponse('只能删除自己的评论', 403);
                }
                await env.DB.prepare('DELETE FROM comments WHERE id = ?').bind(commentId).run();
                return jsonResponse({ success: true, message: '删除成功' });
            }
            /* ================= 后台口令 ================= */
            if (path === '/api/admin/gate' && request.method === 'POST') {
                const gate = env.ADMIN_GATE_KEY;
                if (!gate) {
                    return jsonResponse({ ok: true, gate: false, message: '未启用后台口令' });
                }
                const body = (await request.json().catch(() => ({})));
                if (String(body.key || '') !== gate) {
                    return errorResponse('口令不正确', 403);
                }
                return jsonResponse({ ok: true, gate: true });
            }
            /* ================= 页面（方块化内容） ================= */
            // 公开：读取页面（带 slug 取单页，不带则列出已发布页面）
            if (path === '/api/pages' && request.method === 'GET') {
                if (!(await hasTable(env, 'pages')))
                    return errorResponse(NO_PAGES_TABLE, 500);
                const slug = url.searchParams.get('slug');
                if (slug) {
                    const page = await env.DB.prepare('SELECT slug, title, subtitle, blocks, published, updated_at FROM pages WHERE slug = ?').bind(slug).first();
                    if (!page)
                        return errorResponse('页面不存在', 404);
                    // 草稿保护：未发布的页面只有管理员能看到（对其他人一律当作不存在）
                    if (page.published !== 1) {
                        const viewer = await getUserFromRequest(request, env);
                        if (!viewer || !isAdminEmail(viewer.email)) {
                            return errorResponse('页面不存在', 404);
                        }
                    }
                    let blocks = [];
                    try {
                        blocks = JSON.parse(page.blocks);
                    }
                    catch (e) {
                        blocks = [];
                    }
                    return jsonResponse({
                        slug: page.slug,
                        title: page.title,
                        subtitle: page.subtitle,
                        blocks,
                        published: page.published,
                        updated_at: page.updated_at,
                    });
                }
                const list = await env.DB.prepare('SELECT slug, title, subtitle, updated_at FROM pages WHERE published = 1 ORDER BY sort_order, updated_at DESC').all();
                return jsonResponse({ pages: list.results || [] });
            }
            // 管理：所有页面（含草稿）；?full=1 时带上方块内容，用于导出/备份
            if (path === '/api/admin/pages' && request.method === 'GET') {
                const admin = await requireAdmin(request, env);
                if (admin instanceof Response)
                    return admin;
                if (!(await hasTable(env, 'pages')))
                    return errorResponse(NO_PAGES_TABLE, 500);
                const full = url.searchParams.get('full') === '1';
                const list = full
                    ? await env.DB.prepare('SELECT slug, title, subtitle, blocks, published, sort_order, updated_at, updated_by FROM pages ORDER BY sort_order, updated_at DESC').all()
                    : await env.DB.prepare('SELECT slug, title, subtitle, published, sort_order, updated_at, updated_by FROM pages ORDER BY sort_order, updated_at DESC').all();
                let rows = list.results || [];
                if (full) {
                    rows = rows.map((p) => {
                        let blocks = [];
                        try {
                            blocks = JSON.parse(p.blocks);
                        }
                        catch (e) {
                            blocks = [];
                        }
                        return { ...p, blocks };
                    });
                }
                return jsonResponse({ pages: rows, full });
            }
            // 管理：新建 / 更新页面
            if (path === '/api/pages' && (request.method === 'POST' || request.method === 'PUT')) {
                const admin = await requireAdmin(request, env);
                if (admin instanceof Response)
                    return admin;
                const body = await request.json();
                const title = String(body.title || '').trim();
                if (!title)
                    return errorResponse('标题不能为空');
                // 页面地址：留空则自动生成（中文标题生成 p-xxxxxx 形式，且保证不重复）
                let slug = String(body.slug || '').trim().toLowerCase();
                let generated = false;
                if (!slug) {
                    generated = true;
                    const base = slugFromTitle(title);
                    slug = base;
                    for (let i = 0; i < 30; i++) {
                        const taken = await env.DB.prepare('SELECT slug FROM pages WHERE slug = ?').bind(slug).first();
                        if (!taken)
                            break;
                        slug = base + '-' + (i + 2);
                    }
                }
                else if (!/^[a-z0-9_-]{1,64}$/.test(slug)) {
                    return errorResponse('页面地址只能用小写字母、数字、- 和 _（也可以留空由系统生成）');
                }
                const blocks = Array.isArray(body.blocks) ? body.blocks : [];
                if (blocks.length > 300)
                    return errorResponse('方块太多了（上限 300 个）');
                const blocksJson = JSON.stringify(blocks);
                if (blocksJson.length > 400000)
                    return errorResponse('内容太大（上限约 400KB）');
                const now = Math.floor(Date.now() / 1000);
                await env.DB.prepare(`INSERT INTO pages (slug, title, subtitle, blocks, published, sort_order, updated_at, updated_by)
                     VALUES (?, ?, ?, ?, ?, ?, ?, ?)
                     ON CONFLICT(slug) DO UPDATE SET
                        title = excluded.title,
                        subtitle = excluded.subtitle,
                        blocks = excluded.blocks,
                        published = excluded.published,
                        sort_order = excluded.sort_order,
                        updated_at = excluded.updated_at,
                        updated_by = excluded.updated_by`)
                    .bind(slug, title, String(body.subtitle || ''), blocksJson, body.published === false ? 0 : 1, Number(body.sort_order) || 100, now, admin.email)
                    .run();
                return jsonResponse({ success: true, slug, generated, updated_at: now });
            }
            // 管理：删除页面
            if (path === '/api/pages' && request.method === 'DELETE') {
                const admin = await requireAdmin(request, env);
                if (admin instanceof Response)
                    return admin;
                const slug = url.searchParams.get('slug');
                if (!slug)
                    return errorResponse('缺少 slug');
                await env.DB.prepare('DELETE FROM pages WHERE slug = ?').bind(slug).run();
                return jsonResponse({ success: true });
            }
            /* ================= 用户管理 ================= */
            if (path === '/api/admin/users' && request.method === 'GET') {
                const admin = await requireAdmin(request, env);
                if (admin instanceof Response)
                    return admin;
                const rows = await env.DB.prepare('SELECT id, email, nickname, is_customer, order_id, serial_numbers, created_at, last_login, banned_until FROM users ORDER BY id DESC').all();
                const users = (rows.results || []).map((u) => ({ ...u, role: getRole(u.email) }));
                return jsonResponse({ users });
            }
            if (path === '/api/admin/users' && request.method === 'PATCH') {
                const admin = await requireAdmin(request, env);
                if (admin instanceof Response)
                    return admin;
                const id = parseInt(url.searchParams.get('id') || '0');
                if (!id)
                    return errorResponse('缺少用户 id');
                const body = await request.json();
                const has = (k) => typeof body[k] !== 'undefined';
                const nick = has('nickname') ? String(body.nickname).slice(0, 40) : null;
                const isCustomer = typeof body.is_customer === 'boolean' ? (body.is_customer ? 1 : 0) : null;
                const bannedUntil = typeof body.banned_until === 'number' ? body.banned_until : null;
                const orderId = typeof body.order_id === 'string' ? body.order_id.trim() : null;
                const serials = typeof body.serial_numbers === 'string' ? body.serial_numbers.trim() : null;
                if (nick === null && isCustomer === null && bannedUntil === null && orderId === null && serials === null) {
                    return errorResponse('没有需要修改的字段');
                }
                // 单条固定 SQL，用 COALESCE 实现"只改传了的字段"，值全部走参数绑定
                await env.DB.prepare(`UPDATE users SET
                        nickname = COALESCE(?, nickname),
                        is_customer = COALESCE(?, is_customer),
                        banned_until = COALESCE(?, banned_until),
                        order_id = COALESCE(?, order_id),
                        serial_numbers = COALESCE(?, serial_numbers)
                     WHERE id = ?`).bind(nick, isCustomer, bannedUntil, orderId, serials, id).run();
                return jsonResponse({ success: true });
            }
            if (path === '/api/admin/users' && request.method === 'DELETE') {
                const admin = await requireAdmin(request, env);
                if (admin instanceof Response)
                    return admin;
                const id = parseInt(url.searchParams.get('id') || '0');
                if (!id)
                    return errorResponse('缺少用户 id');
                if (id === admin.id)
                    return errorResponse('不能删除自己', 403);
                await env.DB.prepare('DELETE FROM comments WHERE user_id = ?').bind(id).run();
                await env.DB.prepare('DELETE FROM users WHERE id = ?').bind(id).run();
                return jsonResponse({ success: true });
            }
            /* ================= 评论管理 ================= */
            // 管理：查看全部评论（可按页面筛选）
            if (path === '/api/admin/comments' && request.method === 'GET') {
                const admin = await requireAdmin(request, env);
                if (admin instanceof Response)
                    return admin;
                const pageFilter = url.searchParams.get('page');
                const limit = Math.min(parseInt(url.searchParams.get('limit') || '200'), 500);
                // 两条固定 SQL，按是否筛选页面二选一（不拼接字符串）
                const stmt = pageFilter
                    ? env.DB.prepare(`SELECT c.id, c.user_id, c.page_id, c.content, c.created_at, u.email, u.nickname
                           FROM comments c JOIN users u ON c.user_id = u.id
                           WHERE c.page_id = ?
                           ORDER BY c.created_at DESC LIMIT ?`).bind(pageFilter, limit)
                    : env.DB.prepare(`SELECT c.id, c.user_id, c.page_id, c.content, c.created_at, u.email, u.nickname
                           FROM comments c JOIN users u ON c.user_id = u.id
                           ORDER BY c.created_at DESC LIMIT ?`).bind(limit);
                const rows = await stmt.all();
                return jsonResponse({ comments: rows.results || [] });
            }
            // 管理：删除任意评论
            if (path === '/api/admin/comments' && request.method === 'DELETE') {
                const admin = await requireAdmin(request, env);
                if (admin instanceof Response)
                    return admin;
                const commentId = parseInt(url.searchParams.get('id') || '0');
                if (!commentId)
                    return errorResponse('缺少评论 id');
                await env.DB.prepare('DELETE FROM comments WHERE id = ?').bind(commentId).run();
                return jsonResponse({ success: true });
            }
            /* ================= 统计概览 ================= */
            if (path === '/api/admin/stats' && request.method === 'GET') {
                const admin = await requireAdmin(request, env);
                if (admin instanceof Response)
                    return admin;
                const u = await env.DB.prepare('SELECT COUNT(*) AS n, SUM(is_customer) AS customers FROM users').first();
                const c = await env.DB.prepare('SELECT COUNT(*) AS n FROM comments').first();
                const p = await env.DB.prepare('SELECT COUNT(*) AS n, SUM(published) AS published FROM pages').first();
                return jsonResponse({
                    users: u?.n || 0,
                    customers: u?.customers || 0,
                    comments: c?.n || 0,
                    pages: p?.n || 0,
                    published_pages: p?.published || 0,
                });
            }
            if (path === '/api/verify-order' && request.method === 'POST') {
                const body = await request.json();
                if (!body.order_id) {
                    return errorResponse('订单号不能为空');
                }
                const orderList = await fetchOrderList(env.ORDER_JSON_URL);
                const exists = body.order_id in orderList;
                return jsonResponse({ exists });
            }
            if (path === '/api/health' && request.method === 'GET') {
                const result = {
                    ok: true,
                    service: 'jack-blog',
                    code_version: CODE_VERSION,
                    time: Math.floor(Date.now() / 1000),
                    db: 'unknown',
                    tables: [],
                    // 版本指纹：用于确认线上跑的是不是最新代码
                    features: {
                        whitelist_login_only: !REGISTRATION_OPEN,
                        allowed_email_count: Object.keys(ROLE_BY_EMAIL).length,
                        roles: Object.values(ROLE_BY_EMAIL),
                        has_is_admin: true,
                        has_roles: true,
                        has_comment_limit: false,
                        has_admin_api: true,
                        has_pages_table: false,
                        admin_gate: !!env.ADMIN_GATE_KEY,
                        login_lockout: true,
                    },
                    env: {
                        hasDb: !!env.DB,
                        hasSecret: !!env.JWT_SECRET,
                        hasOrderUrl: !!env.ORDER_JSON_URL,
                    },
                };
                try {
                    const tables = await env.DB.prepare("SELECT name FROM sqlite_master WHERE type='table' AND name NOT LIKE 'sqlite_%' AND name NOT LIKE '_cf_%'").all();
                    result.db = 'connected';
                    result.tables = (tables.results || []).map((t) => t.name);
                    result.features.has_pages_table = result.tables.indexOf('pages') !== -1;
                }
                catch (e) {
                    result.ok = false;
                    result.db = 'error';
                    result.error = e.message;
                }
                return jsonResponse(result);
            }
            return errorResponse('Not Found', 404);
        }
        catch (error) {
            console.error('Error:', error);
            return errorResponse('服务器错误: ' + error.message, 500);
        }
    },
};
