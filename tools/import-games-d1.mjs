// �?games-data.js 里的游戏灌进 D1（一次性导入）
import fs from 'node:fs';
import https from 'node:https';

const ROOT = 'C:\\Users\\qq318\\Documents\\trae\\新建文件夹\\blog';
const TOKEN = process.env.CLOUDFLARE_API_TOKEN || '';
const EMAIL = process.env.CLOUDFLARE_EMAIL || '';
const ACCOUNT = process.env.CF_ACCOUNT_ID || '087ef4652e34b588528f89387535ab13';
const DB = process.env.CF_D1_ID || 'bd66ebe6-4575-4b98-9a26-bbf5b4456ddf';
const IP = '104.17.111.184';

if (!TOKEN) {
    console.error('缺少 token');
    process.exit(1);
}

function cf(path, method = 'GET', body = null) {
    return new Promise((resolve, reject) => {
        const payload = body ? JSON.stringify(body) : null;
        const headers = { Host: 'api.cloudflare.com', 'User-Agent': 'd1-loader', 'Content-Type': 'application/json' };
        if (TOKEN.startsWith('cfk_')) {
            headers['X-Auth-Email'] = EMAIL;
            headers['X-Auth-Key'] = TOKEN;
        } else {
            headers.Authorization = 'Bearer ' + TOKEN;
        }
        if (payload) headers['Content-Length'] = Buffer.byteLength(payload);
        const req = https.request(
            { host: IP, port: 443, servername: 'api.cloudflare.com', path, method, headers, timeout: 30000 },
            (res) => {
                const chunks = [];
                res.on('data', (c) => chunks.push(c));
                res.on('end', () => {
                    const text = Buffer.concat(chunks).toString('utf8');
                    let json = null;
                    try {
                        json = JSON.parse(text);
                    } catch (e) {
                        json = { raw: text.slice(0, 300) };
                    }
                    resolve({ status: res.statusCode, json });
                });
            }
        );
        req.on('error', reject);
        req.on('timeout', () => req.destroy(new Error('timeout')));
        if (payload) req.write(payload);
        req.end();
    });
}

// 读本地游戏文�?const src = fs.readFileSync(ROOT + '\\games-data.js', 'utf8');
const arrText = src.match(/var\s+games\s*=\s*(\[[\s\S]*?\]);/)[1];
const games = new Function('return ' + arrText)();
console.log('本地游戏数：' + games.length);

const d1Path = '/client/v4/accounts/' + ACCOUNT + '/d1/database/' + DB + '/query';

// 先建表（幂等�?const ddl = await cf(d1Path, 'POST', {
    sql: `CREATE TABLE IF NOT EXISTS games (
        id TEXT PRIMARY KEY,
        name TEXT NOT NULL,
        size REAL DEFAULT 0,
        sort_order INTEGER DEFAULT 100,
        created_at INTEGER DEFAULT (strftime('%s','now'))
    )`,
});
console.log('建表：HTTP ' + ddl.status + (ddl.json.success ? ' �? : ' ' + JSON.stringify(ddl.json).slice(0, 150)));

// 分批插入
const CHUNK = 15;
let inserted = 0;
for (let i = 0; i < games.length; i += CHUNK) {
    const slice = games.slice(i, i + CHUNK);
    const values = [];
    const params = [];
    slice.forEach((g, idx) => {
        values.push('(?, ?, ?, ?)');
        params.push(String(g.id), String(g.name).slice(0, 80), Number(g.size) || 0, 100);
    });
    const sql = 'INSERT OR REPLACE INTO games (id, name, size, sort_order) VALUES ' + values.join(', ');
    const res = await cf(d1Path, 'POST', { sql, params });
    if (res.status === 200 && res.json.success) {
        inserted += slice.length;
        process.stdout.write('.');
    } else {
        console.log('\n�?' + i + ' 失败�? + JSON.stringify(res.json).slice(0, 200));
        break;
    }
}
console.log('\n已写�?' + inserted + ' �?);

const count = await cf(d1Path, 'POST', { sql: 'SELECT COUNT(*) AS n FROM games' });
const n = count.json && count.json.result && count.json.result[0] && count.json.result[0].results && count.json.result[0].results[0];
console.log('数据库里现在有：' + (n ? n.n : '未知') + ' 个游�?);
