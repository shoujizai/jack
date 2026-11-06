import https from 'node:https';

const TOKEN = process.env.CLOUDFLARE_API_TOKEN || '';
const EMAIL = process.env.CLOUDFLARE_EMAIL || '';
const ACCOUNT = '087ef4652e34b588528f89387535ab13';
const DB = 'bd66ebe6-4575-4b98-9a26-bbf5b4456ddf';

function q(sql) {
    return new Promise((resolve) => {
        const body = JSON.stringify({ sql });
        const req = https.request(
            {
                host: '104.17.111.184',
                port: 443,
                servername: 'api.cloudflare.com',
                path: '/client/v4/accounts/' + ACCOUNT + '/d1/database/' + DB + '/query',
                method: 'POST',
                headers: {
                    Host: 'api.cloudflare.com',
                    'X-Auth-Email': EMAIL,
                    'X-Auth-Key': TOKEN,
                    'Content-Type': 'application/json',
                    'Content-Length': Buffer.byteLength(body),
                },
            },
            (res) => {
                let text = '';
                res.on('data', (c) => (text += c));
                res.on('end', () => {
                    try {
                        resolve(JSON.parse(text));
                    } catch (e) {
                        resolve({ raw: text.slice(0, 200) });
                    }
                });
            }
        );
        req.on('error', (e) => resolve({ err: e.message }));
        req.write(body);
        req.end();
    });
}

const count = await q('SELECT COUNT(*) AS n FROM games');
const rows = count.result && count.result[0] && count.result[0].results;
console.log('D1 库里游戏数：' + JSON.stringify(rows));

const sample = await q('SELECT id, name, size FROM games LIMIT 2');
console.log('示例：' + JSON.stringify(sample.result && sample.result[0] && sample.result[0].results));

try {
    const api = await (await fetch('https://api.jacksjz.qzz.io/api/games', { signal: AbortSignal.timeout(15000) })).json();
    console.log('接口 /api/games 返回：' + (api.total !== undefined ? api.total : '?'));
} catch (e) {
    console.log('接口请求失败：' + e.message);
}
