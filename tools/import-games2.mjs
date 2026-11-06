// 把 games-data.js 的游戏导入 D1（分批，每批 15 条，避开 SQL 变量上限）
import fs from 'node:fs';
import https from 'node:https';

const ROOT = 'C:\\Users\\qq318\\Documents\\trae\\新建文件夹\\blog';
const TOKEN = process.env.CLOUDFLARE_API_TOKEN || '';
const EMAIL = process.env.CLOUDFLARE_EMAIL || '';
const ACCOUNT = '087ef4652e34b588528f89387535ab13';
const DB = 'bd66ebe6-4575-4b98-9a26-bbf5b4456ddf';
const IP = '104.17.111.184';

function cf(path, method, body) {
    return new Promise((resolve, reject) => {
        const payload = body ? JSON.stringify(body) : null;
        const headers = { Host: 'api.cloudflare.com', 'User-Agent': 'd1', 'Content-Type': 'application/json' };
        if (TOKEN.startsWith('cfk_')) {
            headers['X-Auth-Email'] = EMAIL;
            headers['X-Auth-Key'] = TOKEN;
        } else {
            headers.Authorization = 'Bearer ' + TOKEN;
        }
        if (payload) headers['Content-Length'] = Buffer.byteLength(payload);
        const req = https.request({ host: IP, port: 443, servername: 'api.cloudflare.com', path, method, headers, timeout: 30000 }, (res) => {
            const chunks = [];
            res.on('data', (c) => chunks.push(c));
            res.on('end', () => {
                const text = Buffer.concat(chunks).toString('utf8');
                let json;
                try {
                    json = JSON.parse(text);
                } catch (e) {
                    json = { raw: text.slice(0, 200) };
                }
                resolve({ status: res.statusCode, json });
            });
        });
        req.on('error', reject);
        req.on('timeout', () => req.destroy(new Error('timeout')));
        if (payload) req.write(payload);
        req.end();
    });
}

const src = fs.readFileSync(ROOT + '\\games-data.js', 'utf8');
const arr = src.match(/var\s+games\s*=\s*(\[[\s\S]*?\]);/)[1];
const games = new Function('return ' + arr)();
console.log('本地游戏数：' + games.length);

const d1 = '/client/v4/accounts/' + ACCOUNT + '/d1/database/' + DB + '/query';
const CHUNK = 15;
let done = 0;
for (let i = 0; i < games.length; i += CHUNK) {
    const slice = games.slice(i, i + CHUNK);
    const values = [];
    const params = [];
    for (const g of slice) {
        values.push('(?, ?, ?, ?)');
        params.push(String(g.id), String(g.name).slice(0, 80), Number(g.size) || 0, 100);
    }
    const res = await cf(d1, 'POST', {
        sql: 'INSERT OR REPLACE INTO games (id, name, size, sort_order) VALUES ' + values.join(', '),
        params,
    });
    if (res.status === 200 && res.json.success) {
        done += slice.length;
        process.stdout.write('.');
    } else {
        console.log('\n第 ' + i + ' 批失败：' + JSON.stringify(res.json).slice(0, 200));
        break;
    }
}
console.log('\n写入 ' + done + '/' + games.length);

const check = await cf(d1, 'POST', { sql: 'SELECT COUNT(*) AS n FROM games' });
const row = check.json.result && check.json.result[0] && check.json.result[0].results && check.json.result[0].results[0];
console.log('库里现有：' + (row ? row.n : '?') + ' 个游戏');
