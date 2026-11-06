// 用 Cloudflare REST API 部署 Worker（不依赖 wrangler / 不需要 esbuild）
// 用法：$env:CLOUDFLARE_API_TOKEN="xxx"; node tools/deploy-cf.mjs
import fs from 'node:fs';
import https from 'node:https';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const TOKEN = process.env.CLOUDFLARE_API_TOKEN || process.env.CF_API_TOKEN || '';
const EMAIL = process.env.CLOUDFLARE_EMAIL || process.env.CF_EMAIL || '';
const SCRIPT_NAME = process.env.CF_SCRIPT_NAME || 'blog';
const FORCE_ACCOUNT = process.env.CF_ACCOUNT_ID || '';
let AUTH_MODE = 'bearer'; // 自动探测后可能变成 'global-key'

if (!TOKEN) {
    console.error('缺少 CLOUDFLARE_API_TOKEN');
    process.exit(1);
}

/* api.cloudflare.com 在本机 DNS 受限，改用 Cloudflare 的 anycast IP + SNI 访问 */
const CF_HOSTS = ['104.17.111.184', '104.16.0.0', '104.17.0.0', '104.18.0.0', '104.19.0.0'];

function authHeaders() {
    if (AUTH_MODE === 'global-key') {
        return { 'X-Auth-Email': EMAIL, 'X-Auth-Key': TOKEN };
    }
    return { Authorization: 'Bearer ' + TOKEN };
}

function request(method, apiPath, body, headers = {}) {
    return new Promise((resolve, reject) => {
        const payload = body || null;
        const send = (ip, attempt) => {
            const req = https.request(
                {
                    host: ip,
                    port: 443,
                    servername: 'api.cloudflare.com',
                    path: apiPath,
                    method,
                    headers: Object.assign(
                        {
                            Host: 'api.cloudflare.com',
                            'User-Agent': 'blog-admin-deployer',
                        },
                        authHeaders(),
                        payload ? { 'Content-Length': Buffer.byteLength(payload) } : {},
                        headers
                    ),
                    timeout: 20000,
                },
                (res) => {
                    const chunks = [];
                    res.on('data', (c) => chunks.push(c));
                    res.on('end', () => {
                        const text = Buffer.concat(chunks).toString('utf8');
                        let json = null;
                        try {
                            json = JSON.parse(text);
                        } catch (e) {
                            json = { raw: text.slice(0, 400) };
                        }
                        resolve({ status: res.statusCode, json });
                    });
                }
            );
            req.on('error', (e) => {
                if (attempt + 1 < CF_HOSTS.length) return send(CF_HOSTS[attempt + 1], attempt + 1);
                reject(e);
            });
            req.on('timeout', () => {
                req.destroy();
                if (attempt + 1 < CF_HOSTS.length) return send(CF_HOSTS[attempt + 1], attempt + 1);
                reject(new Error('timeout'));
            });
            if (payload) req.write(payload);
            req.end();
        };
        send(CF_HOSTS[0], 0);
    });
}

function say(ok, label, detail) {
    console.log((ok ? '✔ ' : '✘ ') + label + (detail ? '  ' + detail : ''));
    if (!ok) process.exitCode = 1;
}

/* ---------- 1. 验证 token（自动识别 Bearer / Global Key 两种方式） ---------- */
console.log('=== 1. 验证凭据 ===');
let verify = await request('GET', '/client/v4/user/tokens/verify');
if (!(verify.status === 200 && verify.json && verify.json.success)) {
    // 可能是 Global API Key：改用邮箱 + X-Auth-Key
    if (EMAIL) {
        AUTH_MODE = 'global-key';
        verify = await request('GET', '/client/v4/user');
        if (verify.status === 200) {
            console.log('✔ 使用 Global API Key 认证（' + EMAIL + '）');
        } else {
            console.log('✘ Global Key 验证失败：HTTP ' + verify.status + ' ' + JSON.stringify(verify.json).slice(0, 160));
            process.exit(1);
        }
    } else {
        console.log('✘ Token 无效：' + JSON.stringify(verify.json).slice(0, 200));
        console.log('  如果这是 Global API Key，请同时设置 CLOUDFLARE_EMAIL 环境变量。');
        process.exit(1);
    }
} else {
    console.log('✔ API Token 有效（Bearer 方式）');
}

/* ---------- 2. 找 Account ID ---------- */
console.log('\n=== 2. 定位账号 ===');
let accountId = FORCE_ACCOUNT;
if (!accountId) {
    const accounts = await request('GET', '/client/v4/accounts');
    const list = (accounts.json && accounts.json.result) || [];
    if (!list.length) {
        say(false, '读取账号列表失败', JSON.stringify(accounts.json).slice(0, 200));
        process.exit(1);
    }
    accountId = list[0].id;
    console.log('   账号：' + (list[0].name || '(无名)') + ' / ' + accountId);
} else {
    console.log('   使用指定的 account id：' + accountId);
}
say(!!accountId, '拿到 Account ID', accountId.slice(0, 8) + '…');

/* ---------- 3. 读取代码与配置 ---------- */
console.log('\n=== 3. 准备部署内容 ===');
const scriptPath = path.join(ROOT, 'worker-dist', 'index.js');
const code = fs.readFileSync(scriptPath, 'utf8');
const version = (code.match(/CODE_VERSION = '([^']+)'/) || [])[1] || '未知';
console.log('   代码版本：' + version);
console.log('   体积：' + (Buffer.byteLength(code) / 1024).toFixed(1) + ' KB');
say(/export\s+default/.test(code), '代码是 ES Module 格式');

const toml = fs.readFileSync(path.join(ROOT, 'api', 'wrangler.toml'), 'utf8');
const strVar = (name) => {
    const m = toml.match(new RegExp('^\\s*' + name + '\\s*=\\s*"([^"]*)"', 'm'));
    return m ? m[1] : '';
};
const dbId = (toml.match(/database_id\s*=\s*"([^"]+)"/) || [])[1] || '';
// 密钥优先来自环境变量；否则沿用线上现有绑定值（避免重置登录状态）
let jwtSecret = process.env.JWT_SECRET_VALUE || strVar('JWT_SECRET');
const orderUrl = strVar('ORDER_JSON_URL');
const gateKey = process.env.ADMIN_GATE_KEY || strVar('ADMIN_GATE_KEY');

// 仓库里没有密钥时，沿用线上已配置的值（否则会把登录密钥覆盖成空）
if (!jwtSecret && accountId) {
    const settings = await request('GET', '/client/v4/accounts/' + accountId + '/workers/scripts/' + SCRIPT_NAME + '/settings');
    const existing = ((settings.json && settings.json.result && settings.json.result.bindings) || []).find((b) => b.name === 'JWT_SECRET');
    if (existing && existing.text) {
        jwtSecret = existing.text;
        console.log('   沿用线上现有 JWT_SECRET（长度 ' + jwtSecret.length + '，不打印内容）');
    }
}
if (!jwtSecret) {
    console.error('✘ 拿不到 JWT_SECRET：请设置环境变量 JWT_SECRET_VALUE，或先在 Cloudflare 后台配置该变量。');
    process.exit(1);
}
say(!!dbId, 'D1 数据库 id', dbId.slice(0, 8) + '…');
say(!!jwtSecret, 'JWT_SECRET 已配置');

const bindings = [];
if (dbId) bindings.push({ type: 'd1', name: 'DB', id: dbId });
if (jwtSecret) bindings.push({ type: 'plain_text', name: 'JWT_SECRET', text: jwtSecret });
if (orderUrl) bindings.push({ type: 'plain_text', name: 'ORDER_JSON_URL', text: orderUrl });
if (gateKey) bindings.push({ type: 'plain_text', name: 'ADMIN_GATE_KEY', text: gateKey });

const metadata = {
    main_module: 'index.js',
    compatibility_date: '2024-11-01',
    bindings,
};

/* ---------- 4. 上传（multipart） ---------- */
console.log('\n=== 4. 上传并部署 ===');
const boundary = '----blogdeploy' + Date.now().toString(16);
const parts = [];
parts.push(
    Buffer.from(
        '--' + boundary + '\r\n' +
            'Content-Disposition: form-data; name="metadata"\r\n' +
            'Content-Type: application/json\r\n\r\n' +
            JSON.stringify(metadata) + '\r\n'
    )
);
parts.push(
    Buffer.from(
        '--' + boundary + '\r\n' +
            'Content-Disposition: form-data; name="index.js"; filename="index.js"\r\n' +
            'Content-Type: application/javascript+module\r\n\r\n'
    )
);
parts.push(Buffer.from(code, 'utf8'));
parts.push(Buffer.from('\r\n--' + boundary + '--\r\n'));
const body = Buffer.concat(parts);

const upload = await request(
    'PUT',
    '/client/v4/accounts/' + accountId + '/workers/scripts/' + SCRIPT_NAME,
    body,
    { 'Content-Type': 'multipart/form-data; boundary=' + boundary }
);
say(upload.status === 200 && upload.json && upload.json.success, '部署请求成功', upload.status === 200 ? '' : JSON.stringify(upload.json).slice(0, 300));
if (!(upload.status === 200 && upload.json && upload.json.success)) process.exit(1);

/* ---------- 5. 外部验收 ---------- */
console.log('\n=== 5. 等 5 秒后从外部验收 ===');
await new Promise((r) => setTimeout(r, 5000));
try {
    const res = await fetch('https://api.jacksjz.qzz.io/api/health');
    const health = await res.json();
    const okVersion = health.code_version === version;
    say(okVersion, '线上代码版本 = ' + version, health.code_version || '(无)');
    say(health.features && health.features.has_admin_api === true, 'has_admin_api = true');
    say(health.features && health.features.has_pages_table === true, 'has_pages_table = true');
    say((health.tables || []).indexOf('pages') !== -1, 'pages 表已就绪', (health.tables || []).join(','));
    const pages = await fetch('https://api.jacksjz.qzz.io/api/pages');
    say(pages.status === 200, 'GET /api/pages = 200', 'HTTP ' + pages.status);
    const admin = await fetch('https://api.jacksjz.qzz.io/api/admin/pages');
    say(admin.status === 401 || admin.status === 403, '未登录访问管理接口被拒', 'HTTP ' + admin.status);
    console.log('\n完成。');
} catch (e) {
    say(false, '外部验收失败', e.message);
}
