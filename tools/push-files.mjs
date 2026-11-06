// 逐文件推送（Contents API），用于 Git Data API 被拒时的兜底
import fs from 'node:fs';
import path from 'node:path';

const ROOT = 'C:\\Users\\qq318\\Documents\\trae\\新建文件夹\\blog';
const OWNER = 'shoujizai';
const REPO = 'jack';
const TOKEN = process.env.GITHUB_TOKEN || '';
const MESSAGE = process.env.COMMIT_MESSAGE || 'chore: 更新文件';
const FILES = (process.env.PUSH_FILES || '').split(',').map((s) => s.trim()).filter(Boolean);

if (!TOKEN || !FILES.length) {
    console.error('用法：$env:GITHUB_TOKEN=...; $env:PUSH_FILES="a,b"; node tools/push-files.mjs');
    process.exit(1);
}

const HEADERS = {
    Authorization: 'Bearer ' + TOKEN,
    Accept: 'application/vnd.github+json',
    'X-GitHub-Api-Version': '2022-11-28',
    'User-Agent': 'blog-pusher',
};

async function gh(method, url, body) {
    const res = await fetch('https://api.github.com' + url, {
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
    return { status: res.status, data };
}

let ok = 0;
for (const file of FILES) {
    const abs = path.join(ROOT, file);
    const content = fs.readFileSync(abs).toString('base64');
    const encodedPath = file.split('/').map(encodeURIComponent).join('/');
    const existing = await gh('GET', '/repos/' + OWNER + '/' + REPO + '/contents/' + encodedPath);
    const sha = existing.status === 200 && existing.data && existing.data.sha ? existing.data.sha : undefined;
    const put = await gh('PUT', '/repos/' + OWNER + '/' + REPO + '/contents/' + encodedPath, {
        message: MESSAGE,
        content,
        ...(sha ? { sha } : {}),
    });
    if (put.status === 200 || put.status === 201) {
        ok++;
        console.log('✔ ' + file + '  → ' + (put.data.commit ? put.data.commit.sha.slice(0, 7) : 'ok'));
    } else {
        console.log('✘ ' + file + '  HTTP ' + put.status + ' ' + JSON.stringify(put.data).slice(0, 140));
    }
    await new Promise((r) => setTimeout(r, 300));
}
console.log('\n成功 ' + ok + ' / ' + FILES.length);
if (ok !== FILES.length) process.exitCode = 1;
