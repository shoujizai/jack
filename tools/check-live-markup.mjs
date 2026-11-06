const html = await (await fetch('https://jacksjz.qzz.io/admin.html')).text();
const rows = [
    ['接口条元素 id="apiBanner"', html.includes('id="apiBanner"')],
    ['诊断面板 id="diagPanel"', html.includes('id="diagPanel"')],
    ['诊断按钮 id="diagBtn"', html.includes('id="diagBtn"')],
    ['字符串 apiBanner（可能只剩死代码）', html.includes('apiBanner')],
    ['字符串 diagBtn（可能只剩死代码）', html.includes('diagBtn')],
    ['「导入内置内容」按钮', html.includes('导入内置内容')],
    ['「安装 App」按钮', html.includes('installBtn')],
];
for (const [name, hit] of rows) console.log('  ' + name.padEnd(36) + (hit ? '存在' : '不存在'));

// 数一下残留引用出现在哪个函数里
const idx = html.indexOf('function updateApiBanner');
console.log('\n  updateApiBanner 函数位置：' + (idx === -1 ? '已删除' : '第 ' + idx + ' 字符（死代码，界面不受影响）'));
const idx2 = html.indexOf('function toggleDiag');
console.log('  toggleDiag 函数位置：' + (idx2 === -1 ? '已删除' : '第 ' + idx2 + ' 字符（死代码）'));
