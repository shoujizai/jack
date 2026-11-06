import fs from 'node:fs';

const DIR = 'C:\\Users\\qq318\\Documents\\trae\\新建文件夹\\blog\\';
let pass = 0;
let fail = 0;
function check(name, cond, extra) {
    if (cond) {
        pass++;
        console.log('✔ ' + name);
    } else {
        fail++;
        console.log('✘ ' + name + (extra ? '  → ' + String(extra).slice(0, 160) : ''));
    }
}

for (const file of ['一键上线.cmd', '部署后台.cmd']) {
    const text = fs.readFileSync(DIR + file, 'utf8');
    const lines = text.split('\n');
    console.log('\n=== ' + file + ' ===');

    check('文件非空', text.trim().length > 0);
    check('有 @echo off', /^@echo off/m.test(text));
    check('用 chcp 65001（中文不乱码）', /chcp 65001/.test(text));
    check('切到脚本所在目录', /cd \/d "%~dp0/.test(text));

    const badQuotes = lines
        .map((l, i) => ({ l, i: i + 1 }))
        .filter(({ l }) => {
            const q = (l.match(/"/g) || []).length;
            return q % 2 !== 0;
        });
    check('每行双引号成对', badQuotes.length === 0, badQuotes.map((x) => x.i).join(','));

    // echo 中的 & 必须转义为 ^&
    const badAmp = lines.filter((l) => /^\s*echo /i.test(l) && /(?<!\^)&(?!&)/.test(l));
    check('echo 里的 & 已转义', badAmp.length === 0, badAmp.join(' | '));

    check('结尾有 pause', /pause\s*$/im.test(text.trim()));
    check('有入口提示（打开哪个地址）', /jacksjz\.qzz\.io/.test(text));

    // 关键命令
    if (file === '一键上线.cmd') {
        check('包含 git add -A', /git add -A/.test(text));
        check('包含 git commit', /git commit -m/.test(text));
        check('包含 git push', /git push/.test(text));
        check('包含 wrangler deploy', /wrangler\.cmd deploy/.test(text));
        check('缺依赖时自动 npm install', /npm install/.test(text));
        check('部署失败给出兜底方案', /worker-dist\\index\.js/.test(text));
    } else {
        check('包含 wrangler login', /wrangler\.cmd login/.test(text));
        check('包含 wrangler deploy', /wrangler\.cmd deploy/.test(text));
    }
}

console.log('\n结果：通过 ' + pass + ' 项，失败 ' + fail + ' 项');
if (fail > 0) process.exitCode = 1;
