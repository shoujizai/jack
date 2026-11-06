// 触发一次接口部署并跟踪结果
const OWNER = 'shoujizai';
const REPO = 'jack';
const WF = '409339263';
const TOKEN = process.env.GITHUB_TOKEN || '';

const H = {
    Accept: 'application/vnd.github+json',
    'X-GitHub-Api-Version': '2022-11-28',
    'User-Agent': 'deploy-now',
    ...(TOKEN ? { Authorization: 'Bearer ' + TOKEN } : {}),
};

async function gh(method, url, body) {
    const res = await fetch('https://api.github.com' + url, {
        method,
        headers: Object.assign({ 'Content-Type': 'application/json' }, H),
        body: body ? JSON.stringify(body) : undefined,
    });
    let data = null;
    try {
        data = await res.json();
    } catch (e) {
        data = null;
    }
    return { status: res.status, data };
}

const before = await gh('GET', `/repos/${OWNER}/${REPO}/actions/workflows/${WF}/runs?per_page=1`);
const beforeId = ((before.data && before.data.workflow_runs) || [])[0];
console.log('触发前最新运行：' + (beforeId ? '#' + beforeId.run_number + ' ' + beforeId.conclusion : '无'));

const dispatch = await gh('POST', `/repos/${OWNER}/${REPO}/actions/workflows/${WF}/dispatches`, { ref: 'main' });
console.log('触发请求：HTTP ' + dispatch.status + (dispatch.status === 204 ? '（已提交）' : ' ' + JSON.stringify(dispatch.data).slice(0, 160)));

if (dispatch.status !== 204) {
    console.log('\n无法自动触发（token 缺 Actions 权限）。请手动：Actions → Deploy Worker API → Run workflow');
    process.exit(0);
}

for (let i = 0; i < 30; i++) {
    await new Promise((r) => setTimeout(r, 6000));
    const list = await gh('GET', `/repos/${OWNER}/${REPO}/actions/workflows/${WF}/runs?per_page=1`);
    const run = ((list.data && list.data.workflow_runs) || [])[0];
    if (!run) continue;
    const state = run.conclusion || run.status;
    console.log(`[${i * 6 + 6}s] #${run.run_number} 状态：${state}`);
    if (run.status === 'completed') {
        if (run.conclusion === 'success') {
            console.log('\n✅ 自动部署成功');
        } else {
            console.log('\n❌ 部署失败，请到 Actions 页面看「部署」步骤的日志');
        }
        break;
    }
}
