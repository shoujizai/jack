const OWNER = 'shoujizai';
const REPO = 'jack';
const TOKEN = process.env.GITHUB_TOKEN || '';
const H = {
    Accept: 'application/vnd.github+json',
    'X-GitHub-Api-Version': '2022-11-28',
    'User-Agent': 'v',
    ...(TOKEN ? { Authorization: 'Bearer ' + TOKEN } : {}),
};

const runs = await (await fetch(`https://api.github.com/repos/${OWNER}/${REPO}/actions/runs?per_page=3`, { headers: H })).json();
console.log('=== 最近运行 ===');
for (const r of runs.workflow_runs || []) {
    console.log('  ' + (r.name || '').padEnd(20) + '#' + r.run_number + '  ' + (r.conclusion || r.status) + '  ' + r.created_at);
}

console.log('\n=== 线上接口 ===');
try {
    const health = await (await fetch('https://api.jacksjz.qzz.io/api/health')).json();
    console.log('  代码版本：' + health.code_version);
    console.log('  后台接口：' + (health.features.has_admin_api ? '就绪' : '缺失'));
    console.log('  pages 表：' + (health.features.has_pages_table ? '有' : '无'));
    console.log('  JWT 密钥：' + (health.env.hasSecret ? '已配置' : '缺失'));
    console.log('  数据表：' + (health.tables || []).join(', '));
} catch (e) {
    console.log('  失败：' + e.message);
}

console.log('\n=== 线上后台页 ===');
try {
    const html = await (await fetch('https://jacksjz.qzz.io/admin.html')).text();
    console.log('  游戏标签：' + (html.includes('data-tab="games"') ? '有' : '没有'));
    console.log('  游戏生成器：' + (html.includes('buildGamesFile') ? '有' : '没有'));
    console.log('  安装 App：' + (html.includes('installBtn') ? '有' : '没有'));
    console.log('  调试条残留：' + (html.includes('id="apiBanner"') ? '有' : '已清除'));
} catch (e) {
    console.log('  失败：' + e.message);
}
