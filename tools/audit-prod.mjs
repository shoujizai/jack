// 生产就绪审计：检查 Worker 产物是否适合 Cloudflare、前后端配置是否对得上
import fs from 'node:fs';
import path from 'node:path';

const ROOT = 'C:\\Users\\qq318\\Documents\\trae\\新建文件夹\\blog';
const API = path.join(ROOT, 'api');

let pass = 0;
let fail = 0;
const check = (name, cond, extra) => {
    if (cond) {
        pass++;
        console.log('✔ ' + name);
    } else {
        fail++;
        console.log('✘ ' + name + (extra !== undefined ? '  → ' + String(JSON.stringify(extra)).slice(0, 240) : ''));
    }
};

const bundle = fs.readFileSync(path.join(ROOT, 'worker-dist', 'index.js'), 'utf8');
const wrangler = fs.readFileSync(path.join(API, 'wrangler.toml'), 'utf8');
const authJs = fs.readFileSync(path.join(ROOT, 'auth.js'), 'utf8');

console.log('=== 1. Worker 产物是否适合 Cloudflare ===');
check('是 ES 模块（export default）', /export\s+default\s*\{/.test(bundle) || /export\s*\{[^}]*default/.test(bundle), '');
check('没有 require()', !/\brequire\s*\(/.test(bundle), (bundle.match(/\brequire\s*\(/g) || []).length + ' 处');
check('没有 import node: 内置模块', !/from\s+['"]node:/.test(bundle), '');
check('没有 fs / path / os 引用', !/\brequire\(['"]fs['"]\)|from\s+['"]fs['"]/.test(bundle), '');
check('没有 process.env', !/process\.env/.test(bundle), (bundle.match(/process\.env/g) || []).length + ' 处');
check('没有 Buffer', !/\bBuffer\./.test(bundle), (bundle.match(/\bBuffer\./g) || []).length + ' 处');
check('没有 console 打印敏感信息', !/console\.log\(.*(password|token|secret)/i.test(bundle), '');
const size = (bundle.length / 1024).toFixed(1);
check('体积合理（< 1MB）', bundle.length < 1024 * 1024, size + ' KB');

console.log('\n=== 2. 路由完整性 ===');
for (const route of ['/api/health', '/api/register', '/api/login', '/api/me', '/api/activate', '/api/comments', '/api/pages', '/api/admin/gate', '/api/admin/pages', '/api/admin/users', '/api/admin/comments', '/api/admin/stats', '/api/verify-order']) {
    check('包含路由 ' + route, bundle.indexOf(route) !== -1, '');
}
check('包含页面地址自动生成', /slugFromTitle|p-/.test(bundle), '');
check('包含版本标记', /admin-10/.test(bundle), (bundle.match(/admin-\d+/) || [''])[0]);

console.log('\n=== 3. wrangler.toml 配置 ===');
check('name = "blog"', /name\s*=\s*"blog"/.test(wrangler), '');
check('main 指向 src/index.ts', /main\s*=\s*"src\/index\.ts"/.test(wrangler), '');
check('D1 绑定名 DB', /binding\s*=\s*"DB"/.test(wrangler), '');
check('D1 库名 jack-sjz', /database_name\s*=\s*"jack-sjz"/.test(wrangler), '');
check('D1 id 正确', /database_id\s*=\s*"bd66ebe6-4575-4b98-9a26-bbf5b4456ddf"/.test(wrangler), '');
check('有 JWT_SECRET 变量', /JWT_SECRET/.test(wrangler), '');
check('没有把密钥写进仓库', !/ADMIN_GATE_KEY\s*=\s*"[^"]+"/.test(wrangler), '（可选变量不应硬编码）');
check('workers_dev = true（保留 workers.dev 域名）', /workers_dev\s*=\s*true/.test(wrangler), '');

console.log('\n=== 4. 前端与接口是否对得上 ===');
check('前端 API 指向自定义域名', /API_BASE\s*=\s*'https:\/\/api\.jacksjz\.qzz\.io'/.test(authJs), (authJs.match(/API_BASE\s*=\s*'([^']+)'/) || [])[1]);
check('前端注册开关为邀请制', /REGISTRATION_OPEN\s*=\s*false/.test(authJs), '');
check('健康检查允许跨域（CORS）', /Access-Control-Allow-Origin/.test(bundle), '');
check('CORS 允许 X-Admin-Key 头', /X-Admin-Key/.test(bundle), '');
check('CORS 允许 PATCH', /PATCH/.test(bundle), '');

console.log('\n=== 5. 数据安全 ===');
check('密码只存哈希（不存明文）', !/INSERT INTO users[^;]*password\s*,/i.test(bundle), '');
check('使用 SHA-256 哈希', /SHA-256|subtle\.digest/.test(bundle), '');
check('token 带签名校验', /JWT_SECRET|createHmac|hashToken|signature/i.test(bundle), '');
check('后台口令走 header 校验', /X-Admin-Key/.test(bundle) && /gate/i.test(bundle), '');
check('登录失败计数防爆破', /login_failures/.test(bundle), '');
check('SQL 全部使用参数绑定（无字符串拼接）', !/prepare\(\s*['"`][^'"`]*\$\{/.test(bundle), '');

console.log('\n结果：通过 ' + pass + ' 项，失败 ' + fail + ' 项');
if (fail > 0) process.exitCode = 1;
