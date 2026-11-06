// 部署后验证：PWA 文件是否已上线、后台界面是否已精简
const SITE = 'https://jacksjz.qzz.io';

async function probe(p) {
    try {
        const res = await fetch(SITE + p);
        return { path: p, status: res.status, text: res.ok ? await res.text() : '' };
    } catch (e) {
        return { path: p, status: 0, text: '', error: e.message };
    }
}

console.log('=== 静态文件 ===');
for (const p of ['/manifest.webmanifest', '/icons/icon-192.png', '/icons/icon-512.png', '/sw.js', '/admin.html']) {
    const r = await probe(p);
    console.log('  ' + p.padEnd(26) + ' ' + (r.status || '错误 ' + r.error));
}

console.log('\n=== 后台页面 ===');
const admin = await probe('/admin.html');
const html = admin.text || '';
console.log('  调试条已移除：' + (html.includes('apiBanner') ? '✘ 仍在' : '✔ 已移除'));
console.log('  诊断按钮已移除：' + (html.includes('diagBtn') ? '✘ 仍在' : '✔ 已移除'));
console.log('  接入 PWA：' + (/rel="manifest"/.test(html) ? '✔ 是' : '✘ 否'));
console.log('  安装 App 按钮：' + (html.includes('installBtn') ? '✔ 有' : '✘ 无'));

console.log('\n=== manifest 内容 ===');
try {
    const m = JSON.parse((await probe('/manifest.webmanifest')).text);
    console.log('  名称：' + m.name);
    console.log('  显示模式：' + m.display);
    console.log('  图标数：' + (m.icons || []).length);
} catch (e) {
    console.log('  ✘ manifest 解析失败：' + e.message);
}
