// 一键跑完三套测试（同一进程内依次加载，避免子进程限制）
const suites = [
    ['Worker 接口', './test-worker.mjs'],
    ['后台界面', './test-admin.mjs'],
    ['前台渲染', './test-page.mjs'],
    ['页面列表', './test-pages-list.mjs'],
    ['内置内容包', './test-seed.mjs'],
    ['部署工作流', './verify-workflow.mjs'],
    ['部署脚本', './verify-cmd.mjs'],
    ['真实数据库', './test-sqlite.mjs'],
    ['端到端界面', './test-e2e-ui.mjs'],
];

for (const [name, file] of suites) {
    console.log('\n' + '='.repeat(48));
    console.log('▶ ' + name + '  (' + file.replace('./', '') + ')');
    console.log('='.repeat(48));
    try {
        await import(file);
    } catch (e) {
        console.log('✘ 运行失败: ' + e.message);
        process.exitCode = 1;
    }
}

console.log('\n' + '='.repeat(48));
console.log(process.exitCode ? '有测试未通过 ✘' : '全部测试通过 ✔');
