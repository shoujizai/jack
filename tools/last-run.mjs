const OWNER = 'shoujizai';
const REPO = 'jack';
const TOKEN = process.env.GITHUB_TOKEN || '';
const H = { Accept: 'application/vnd.github+json', 'X-GitHub-Api-Version': '2022-11-28', 'User-Agent': 'v', ...(TOKEN ? { Authorization: 'Bearer ' + TOKEN } : {}) };

const runs = await (await fetch(`https://api.github.com/repos/${OWNER}/${REPO}/actions/workflows/409339263/runs?per_page=1`, { headers: H, signal: AbortSignal.timeout(20000) })).json();
const run = (runs.workflow_runs || [])[0];
if (!run) {
    console.log('读不到运行记录');
    process.exit(0);
}
console.log('#'.repeat(4) + ' 最近运行 #' + run.run_number + '  ' + (run.conclusion || run.status) + '  提交 ' + run.head_sha.slice(0, 7));
console.log('   ' + (run.head_commit ? run.head_commit.message.split('\n')[0] : ''));

const jobs = await (await fetch(`https://api.github.com/repos/${OWNER}/${REPO}/actions/runs/${run.id}/jobs`, { headers: H, signal: AbortSignal.timeout(20000) })).json();
for (const job of jobs.jobs || []) {
    console.log('\n任务 ' + job.name + ' → ' + job.conclusion);
    for (const s of job.steps || []) {
        console.log('  [' + s.conclusion + '] ' + s.name);
    }
}
