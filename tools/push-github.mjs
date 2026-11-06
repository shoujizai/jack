// 用 GitHub Git Data API 推送（不依赖 git 命令 / 不依赖 SSH）
// 只上传内容有变化的文件，多个文件合成一个提交
// 用法：$env:GITHUB_TOKEN="ghp_xxx"; node tools/push-github.mjs
import crypto from 'node:crypto';
import fs from 'node:fs';
import path from 'node:path';

const ROOT = 'C:\\Users\\qq318\\Documents\\trae\\新建文件夹\\blog';
const OWNER = 'shoujizai';
const REPO = 'jack';
const TOKEN = process.env.GITHUB_TOKEN || process.env.GH_TOKEN || '';
const MESSAGE = process.env.COMMIT_MESSAGE || 'feat: 可安装为电脑/安卓程序（PWA）+ 后台体验与诊断改进';

if (!TOKEN) {
    console.error('缺少 GITHUB_TOKEN');
    process.exit(1);
}

const API = 'https://api.github.com';
const HEADERS = {
    Authorization: 'Bearer ' + TOKEN,
    Accept: 'application/vnd.github+json',
    'X-GitHub-Api-Version': '2022-11-28',
    'User-Agent': 'blog-pusher',
};

const SKIP_DIRS = new Set(['.git', 'node_modules', '.local-data', '.wrangler', 'api/node_modules', 'api/.wrangler', '.preview']);
const SKIP_FILES = [/\.log$/i, /^\.DS_Store$/];

async function gh(method, apiPath, body) {
    const res = await fetch(API + apiPath, {
        method,
        headers: Object.assign({ 'Content-Type': 'application/json' }, HEADERS),
        body: body === undefined ? undefined : JSON.stringify(body),
    });
    let data = null;
    try {
        data = await res.json();
    } catch (e) {
        data = null;
    }
    if (res.status >= 400) {
        console.log('   HTTP ' + res.status + ' ' + apiPath + '  ' + JSON.stringify(data).slice(0, 200));
    }
    return { status: res.status, data };
}

/* ---------- 1. 身份 ---------- */
console.log('=== 1. 校验 Token ===');
const me = await gh('GET', '/user');
if (me.status !== 200) {
    console.log('✘ Token 无效：HTTP ' + me.status);
    process.exit(1);
}
console.log('✔ 身份：' + me.data.login);

const repo = await gh('GET', '/repos/' + OWNER + '/' + REPO);
if (repo.status !== 200) {
    console.log('✘ 读不到仓库：HTTP ' + repo.status);
    process.exit(1);
}
const branch = repo.data.default_branch || 'main';
console.log('✔ 仓库：' + repo.data.full_name + '（' + branch + '）');

/* ---------- 2. 远端现状 ---------- */
console.log('\n=== 2. 读取远端文件树 ===');
const ref = await gh('GET', '/repos/' + OWNER + '/' + REPO + '/git/ref/heads/' + branch);
if (ref.status !== 200) {
    console.log('✘ 读不到分支：HTTP ' + ref.status);
    process.exit(1);
}
const headSha = ref.data.object.sha;
const headCommit = await gh('GET', '/repos/' + OWNER + '/' + REPO + '/git/commits/' + headSha);
const baseTree = headCommit.data.tree.sha;
console.log('   当前提交：' + headSha.slice(0, 7) + '（tree ' + baseTree.slice(0, 7) + '）');

const remoteTree = await gh('GET', '/repos/' + OWNER + '/' + REPO + '/git/trees/' + baseTree + '?recursive=1');
const remoteFiles = new Map();
for (const node of (remoteTree.data && remoteTree.data.tree) || []) {
    if (node.type === 'blob') remoteFiles.set(node.path, node.sha);
}
console.log('   远端文件数：' + remoteFiles.size);

/* ---------- 3. 对比本地 ---------- */
function gitBlobSha(buf) {
    const header = Buffer.from('blob ' + buf.length + '\0', 'utf8');
    return crypto.createHash('sha1').update(header).update(buf).digest('hex');
}

function walk(dir, prefix = '') {
    const out = [];
    for (const entry of fs.readdirSync(path.join(ROOT, dir), { withFileTypes: true })) {
        const rel = prefix ? prefix + '/' + entry.name : entry.name;
        if (entry.isDirectory()) {
            if (SKIP_DIRS.has(rel) || SKIP_DIRS.has(entry.name)) continue;
            out.push(...walk(path.join(dir, entry.name), rel));
        } else {
            if (SKIP_FILES.some((re) => re.test(rel))) continue;
            out.push(rel);
        }
    }
    return out;
}

console.log('\n=== 3. 对比差异 ===');
const localFiles = walk('');
const changed = [];
for (const rel of localFiles) {
    const abs = path.join(ROOT, rel);
    let buf;
    try {
        buf = fs.readFileSync(abs);
    } catch (e) {
        continue;
    }
    const sha = gitBlobSha(buf);
    if (remoteFiles.get(rel) !== sha) {
        changed.push({ rel, buf, sha });
    }
}
console.log('   本地文件数：' + localFiles.length + '，需要更新：' + changed.length);
changed.forEach((c) => console.log('     ' + c.rel));

if (!changed.length) {
    console.log('\n没有差异，无需提交。');
    process.exit(0);
}

/* ---------- 4. 上传 blob ---------- */
console.log('\n=== 4. 上传变更文件 ===');
const treeEntries = [];
for (const item of changed) {
    const blob = await gh('POST', '/repos/' + OWNER + '/' + REPO + '/git/blobs', {
        content: item.buf.toString('base64'),
        encoding: 'base64',
    });
    if (blob.status !== 201) {
        console.log('✘ 上传失败：' + item.rel);
        process.exit(1);
    }
    treeEntries.push({ path: item.rel, mode: '100644', type: 'blob', sha: blob.data.sha });
    console.log('   ✔ ' + item.rel);
}

/* ---------- 5. 建树 + 提交 + 移动分支 ---------- */
console.log('\n=== 5. 创建提交 ===');
const tree = await gh('POST', '/repos/' + OWNER + '/' + REPO + '/git/trees', { base_tree: baseTree, tree: treeEntries });
if (tree.status !== 201) {
    console.log('✘ 创建 tree 失败');
    process.exit(1);
}
const commit = await gh('POST', '/repos/' + OWNER + '/' + REPO + '/git/commits', {
    message: MESSAGE,
    tree: tree.data.sha,
    parents: [headSha],
});
if (commit.status !== 201) {
    console.log('✘ 创建提交失败');
    process.exit(1);
}
const update = await gh('PATCH', '/repos/' + OWNER + '/' + REPO + '/git/refs/heads/' + branch, { sha: commit.data.sha });
if (update.status !== 200) {
    console.log('✘ 更新分支失败');
    process.exit(1);
}

console.log('✔ 已推送 ' + changed.length + ' 个文件');
console.log('  提交：' + commit.data.sha.slice(0, 7));
console.log('  https://github.com/' + OWNER + '/' + REPO + '/commit/' + commit.data.sha);
