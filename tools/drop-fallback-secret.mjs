// 去掉源码里的旧密钥兜底值（真实密钥只从环境变量来）
import fs from 'node:fs';

const file = 'C:\\Users\\qq318\\Documents\\trae\\新建文件夹\\blog\\api\\src\\index.ts';
let src = fs.readFileSync(file, 'utf8');
const before = src.length;

src = src.replace(
    /JWT_SECRET:\s*env\.JWT_SECRET\s*\|\|\s*'[^']*'/,
    "JWT_SECRET: env.JWT_SECRET || ''  // 不再内置兜底密钥：密钥只在 Cloudflare 变量里"
);

fs.writeFileSync(file, src, 'utf8');
console.log('长度 ' + before + ' -> ' + src.length);
console.log('旧密钥是否还在：' + (src.includes('sjz-blog-2024') ? '✘ 仍在' : '✔ 已清除'));
src.split('\n')
    .filter((l) => l.includes('JWT_SECRET'))
    .forEach((l) => console.log('  ' + l.trim()));
