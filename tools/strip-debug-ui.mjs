// 移除后台里的"调试模式/接口条/诊断"相关代码（用户不需要）
import fs from 'node:fs';

const file = 'C:\\Users\\qq318\\Documents\\trae\\新建文件夹\\blog\\admin.html';
let src = fs.readFileSync(file, 'utf8');
const before = src.length;

/* ---------- 1. 删除整段函数（按大括号配对） ---------- */
function removeFunction(text, name) {
    const marker = 'function ' + name + '(';
    const start = text.indexOf(marker);
    if (start === -1) return text;
    // 从 function 关键字前的位置开始（包含缩进）
    let lineStart = text.lastIndexOf('\n', start);
    lineStart = lineStart === -1 ? 0 : lineStart + 1;
    // 找到函数体的第一个 {
    const braceStart = text.indexOf('{', start);
    if (braceStart === -1) return text;
    let depth = 0;
    let i = braceStart;
    let inStr = null;
    for (; i < text.length; i++) {
        const ch = text[i];
        const prev = text[i - 1];
        if (inStr) {
            if (ch === inStr && prev !== '\\') inStr = null;
            continue;
        }
        if (ch === '"' || ch === "'" || ch === '`') {
            inStr = ch;
            continue;
        }
        if (ch === '{') depth++;
        else if (ch === '}') {
            depth--;
            if (depth === 0) {
                i++;
                break;
            }
        }
    }
    let end = i;
    while (text[end] === '\n' || text[end] === ' ' || text[end] === '\r') end++;
    return text.slice(0, lineStart) + text.slice(end);
}

for (const fn of ['toggleDiag', 'updateApiBanner', 'showApiProblem', 'toggleApiTarget', 'isDebugMode', 'warnIfOldApi']) {
    const len = src.length;
    src = removeFunction(src, fn);
    console.log((src.length !== len ? '✔ ' : '· ') + '删除函数 ' + fn + '（' + (len - src.length) + ' 字符）');
}

/* ---------- 2. 删除调用点 ---------- */
// api() 里 404 分支
src = src.replace(
    /\s*\} else if \(res\.status === 404\) \{[\s\S]*?\n\s*\}\n(\s*)throw err;/,
    '\n$1throw err;'
);

// api() 网络失败分支里的红色提示
src = src.replace(
    /\s*\/\/ 网络层失败[\s\S]*?showApiProblem\('[^']*'\);\n?\s*\}\n?\s*\}\n(\s*)throw e;/,
    '\n$1throw e;'
);

// boot() 里的版本检查与接口条刷新
src = src.replace(/\s*var fresh = warnIfOldApi\([^)]*\);\s*\n/g, '\n');
src = src.replace(/\s*bootStep\('health 完成[^']*'[^;]*;\s*\n/g, '\n');
src = src.replace(/\s*if \(fresh && h[\s\S]*?\n\s*\}\n/g, '\n');
src = src.replace(/\s*updateApiBanner\(\);\s*\n/g, '\n');

// boot() 里 health 失败的红色提示（改为直接继续）
src = src.replace(/\s*showApiProblem\([^;]*\);\s*\n/g, '\n');

// 其它零散调用
src = src.replace(/\s*sandbox\.updateApiBanner\(\);?/g, '');

fs.writeFileSync(file, src, 'utf8');

console.log('\n文件 ' + before + ' -> ' + src.length + ' 字符（减少 ' + (before - src.length) + '）');
for (const dead of ['apiBanner', 'diagPanel', 'diagBtn', 'toggleDiag', 'showApiProblem', 'updateApiBanner', 'warnIfOldApi', 'toggleApiTarget']) {
    console.log('  残留 ' + dead.padEnd(18) + (src.includes(dead) ? '✘ 仍存在' : '✔ 已清除'));
}
