// 检查 admin.html 内联脚本语法 + 调试 UI 是否已移除
import fs from 'node:fs';
import vm from 'node:vm';

const html = fs.readFileSync('C:\\Users\\qq318\\Documents\\trae\\新建文件夹\\blog\\admin.html', 'utf8');
const scripts = [...html.matchAll(/<script(?![^>]*\bsrc=)[^>]*>([\s\S]*?)<\/script>/g)].map((m) => m[1]).filter((s) => s.trim());
const code = scripts.join('\n');

try {
    new vm.Script(code);
    console.log('内联脚本语法 ✔（' + scripts.length + ' 段，' + code.length + ' 字符）');
} catch (e) {
    console.log('内联脚本语法 ✘ ' + e.message);
    process.exitCode = 1;
}

const leftovers = ['id="apiBanner"', 'id="diagPanel"', 'id="diagBtn"'];
for (const l of leftovers) {
    console.log('界面残留 ' + l.padEnd(18) + (html.includes(l) ? '✘ 仍存在' : '✔ 已移除'));
}

const features = [
    ['导入内置内容', /导入内置内容/],
    ['导出/导入 JSON', /导出 JSON/],
    ['保存页面', /function savePage/],
    ['地址自动生成', /res\.generated/],
    ['安装 App', /installBtn/],
    ['PWA manifest', /manifest\.webmanifest/],
    ['注册入口', /function doRegister/],
];
for (const [name, re] of features) console.log('功能 ' + name.padEnd(20) + (re.test(html) ? '✔' : '✘'));
