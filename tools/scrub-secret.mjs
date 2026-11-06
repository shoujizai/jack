// 把仓库里泄露的 JWT_SECRET 清掉（真实值改由 Cloudflare 变量提供）
import fs from 'node:fs';

const file = 'C:\\Users\\qq318\\Documents\\trae\\新建文件夹\\blog\\api\\wrangler.toml';
let text = fs.readFileSync(file, 'utf8');
const before = text.length;

const replacement = [
    '# 重要：JWT_SECRET 不要写进仓库（这是签发登录令牌的密钥，仓库是公开的）',
    '# 设置方式：Cloudflare 控制台 → Workers → blog → 设置 → 变量 → 添加 JWT_SECRET',
    '#           或命令行：cd api && npx wrangler secret put JWT_SECRET',
    'JWT_SECRET = ""  # 真实值只在 Cloudflare 后台配置',
].join('\n');

text = text.replace(/^[ \t]*JWT_SECRET[ \t]*=[ \t]*".*"[ \t]*$/m, replacement);
fs.writeFileSync(file, text, 'utf8');

const leaked = text.includes('sjz-blog-2024-secret-key-x9k2m7p4q1');
console.log('文件 ' + before + ' -> ' + text.length + ' 字节');
console.log('旧密钥是否还在：' + (leaked ? '✘ 仍在' : '✔ 已清除'));
console.log('\n当前 JWT_SECRET 行：');
text.split('\n').filter((l) => l.includes('JWT_SECRET')).forEach((l) => console.log('  ' + l.trim()));
