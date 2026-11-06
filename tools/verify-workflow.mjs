// GitHub Actions 工作流的结构校验（不依赖第三方 YAML 库）
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const file = path.join(ROOT, '.github', 'workflows', 'deploy-api.yml');
const raw = fs.readFileSync(file, 'utf8');

let pass = 0;
let fail = 0;
function check(name, cond, extra) {
    if (cond) {
        pass++;
        console.log('✔ ' + name);
    } else {
        fail++;
        console.log('✘ ' + name + (extra ? '  → ' + String(extra).slice(0, 200) : ''));
    }
}

check('文件存在', fs.existsSync(file));

const lines = raw.split('\n');
check('无 Tab 缩进', !lines.some((l) => /\t/.test(l)));
check('UTF-8 无 BOM', !raw.startsWith('\uFEFF'));

// 行级结构校验
const badLines = [];
lines.forEach((line, i) => {
    if (!line.trim()) return;
    if (/^\s*#/.test(line)) return;
    const ok =
        /^(\s*)(-\s+)?[A-Za-z0-9_.${{}}'"[\]-]+:\s*.*$/.test(line) || // key: value
        /^(\s*)-\s+.*$/.test(line) || // - item
        /^(\s*)\S+\s*$/.test(line); // 续行/表达式
    if (!ok) badLines.push(i + 1 + ': ' + line);
});
check('每行结构合法', badLines.length === 0, badLines.join(' | '));

// 缩进都应为 2 的倍数
const badIndent = [];
lines.forEach((line, i) => {
    if (!line.trim()) return;
    const n = line.match(/^ */)[0].length;
    if (n % 2 !== 0) badIndent.push(i + 1 + ':' + n);
});
check('缩进为 2 的倍数', badIndent.length === 0, badIndent.join(','));

// 关键字段
check('有 name', /^name:\s*\S+/m.test(raw));
check('有 on.push', /^on:\s*$/m.test(raw) && /push:/.test(raw));
check('有 branches: [main]', /branches:\s*\[main\]/.test(raw));
check('有 workflow_dispatch', /workflow_dispatch:/.test(raw));
check('有 jobs.deploy', /^\s{2}deploy:/m.test(raw));
check('runs-on: ubuntu-latest', /runs-on:\s*ubuntu-latest/.test(raw));
check('使用 secrets.CLOUDFLARE_API_TOKEN', /\$\{\{\s*secrets\.CLOUDFLARE_API_TOKEN\s*\}\}/.test(raw));
check('使用 wrangler-action', /cloudflare\/wrangler-action@v3/.test(raw));
check('workingDirectory 指向 api', /workingDirectory:\s*api/.test(raw));
check('deploy 前有类型检查', /npx tsc --noEmit/.test(raw));

// 步骤数量
const steps = (raw.match(/^\s{6}- name:/gm) || []).length;
check('步骤数 >= 4', steps >= 4, steps);
console.log('步骤数:', steps);

// 与仓库实际情况一致性
check('api/package.json 存在', fs.existsSync(path.join(ROOT, 'api', 'package.json')));
check('api/wrangler.toml 存在', fs.existsSync(path.join(ROOT, 'api', 'wrangler.toml')));
const wranglerToml = fs.readFileSync(path.join(ROOT, 'api', 'wrangler.toml'), 'utf8');
check('wrangler.toml 有 name = blog', /name\s*=\s*"blog"/.test(wranglerToml));
check('wrangler.toml 有 D1 绑定', /\[\[d1_databases\]\]/.test(wranglerToml));

// .assetsignore 不应把工作流上传
const assetsIgnore = fs.readFileSync(path.join(ROOT, '.assetsignore'), 'utf8');
check('.github/ 已加入 .assetsignore', /^\.github\//m.test(assetsIgnore));

console.log('\n结果：通过 ' + pass + ' 项，失败 ' + fail + ' 项');
if (fail > 0) process.exitCode = 1;
