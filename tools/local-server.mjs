// 本地接口服务：用 node:sqlite 当数据库，直接跑 worker-dist/index.js
// 不需要 wrangler、不需要登录 Cloudflare，适合在自己电脑上测试后台
import http from 'node:http';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { DatabaseSync } from 'node:sqlite';
import { fileURLToPath } from 'node:url';

process.removeAllListeners('warning');

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const DATA_DIR = path.join(ROOT, '.local-data');
const DEFAULT_PORT = Number(process.env.PORT || 8787);
// 默认监听 0.0.0.0，手机才能通过局域网 IP 访问；想只允许本机就设 HOST=127.0.0.1
const DEFAULT_HOST = process.env.HOST || '0.0.0.0';

/** 找出本机的局域网 IPv4 地址 */
function lanAddresses() {
    const result = [];
    const ifaces = os.networkInterfaces();
    for (const name of Object.keys(ifaces)) {
        for (const info of ifaces[name] || []) {
            if (info.family === 'IPv4' && !info.internal) result.push(info.address);
        }
    }
    return result;
}

const CORS = {
    'Access-Control-Allow-Origin': '*',
    'Access-Control-Allow-Methods': 'GET, POST, PATCH, PUT, DELETE, OPTIONS',
    'Access-Control-Allow-Headers': 'Content-Type, Authorization, X-Admin-Key',
};

const MIME = {
    '.html': 'text/html; charset=utf-8',
    '.css': 'text/css; charset=utf-8',
    '.js': 'application/javascript; charset=utf-8',
    '.mjs': 'application/javascript; charset=utf-8',
    '.json': 'application/json; charset=utf-8',
    '.txt': 'text/plain; charset=utf-8',
    '.svg': 'image/svg+xml',
    '.png': 'image/png',
    '.jpg': 'image/jpeg',
    '.jpeg': 'image/jpeg',
    '.webp': 'image/webp',
    '.ico': 'image/x-icon',
    '.woff2': 'font/woff2',
};

/* ---------------- D1 适配器（真实 SQLite） ---------------- */
function makeDB(sqliteDb) {
    return {
        prepare(sql) {
            const stmt = {
                _args: [],
                bind(...args) {
                    this._args = args;
                    return this;
                },
                async first() {
                    const row = sqliteDb.prepare(sql).get(...this._args);
                    return row === undefined ? null : row;
                },
                async all() {
                    const rows = sqliteDb.prepare(sql).all(...this._args);
                    return { results: rows, success: true, meta: {} };
                },
                async run() {
                    const info = sqliteDb.prepare(sql).run(...this._args);
                    return {
                        success: true,
                        meta: { changes: info.changes, last_row_id: Number(info.lastInsertRowid || 0) },
                    };
                },
            };
            return stmt;
        },
    };
}

/**
 * 启动一个本地接口实例
 * @param {{ port?: number, dbFile?: string, quiet?: boolean }} options
 */
export async function startServer(options = {}) {
    const port = options.port || DEFAULT_PORT;
    const quiet = !!options.quiet;
    const host = options.host || (options.port ? '127.0.0.1' : DEFAULT_HOST);

    let dbFile = options.dbFile;
    if (!dbFile) {
        fs.mkdirSync(DATA_DIR, { recursive: true });
        dbFile = path.join(DATA_DIR, 'admin.db');
    }

    const sqliteDb = new DatabaseSync(dbFile);
    const db = makeDB(sqliteDb);

    const worker = (await import('../worker-dist/index.js')).default;
    const env = {
        DB: db,
        JWT_SECRET: 'local-dev-secret',
        ORDER_JSON_URL: 'https://raw.gitcode.com/jack-sjz/sjz-aio/raw/main/resources/list.json',
    };

    const server = http.createServer(async (req, res) => {
        const rawPath = (req.url || '/').split('?')[0].split('#')[0];

        // 静态文件：让同一个服务同时提供网页和接口，页面与接口同源
        if (!rawPath.startsWith('/api/')) {
            let rel = decodeURIComponent(rawPath);
            if (rel === '/' || rel === '') rel = '/index.html';
            const filePath = path.join(ROOT, path.normalize(rel).replace(/^([/\\])+/, ''));
            if (!filePath.startsWith(ROOT)) {
                res.statusCode = 403;
                res.end('forbidden');
                return;
            }
            let content;
            try {
                content = fs.readFileSync(filePath);
            } catch (e) {
                res.statusCode = 404;
                res.setHeader('Content-Type', 'text/plain; charset=utf-8');
                res.end('404 Not Found: ' + rel);
                return;
            }
            const ext = path.extname(filePath).toLowerCase();
            res.setHeader('Content-Type', MIME[ext] || 'application/octet-stream');
            if (ext === '.html') {
                // 关键：禁止缓存 + 让页面知道"接口就在同一个域名下"
                res.setHeader('Cache-Control', 'no-store, no-cache, must-revalidate');
                let html = content.toString('utf8');
                const marker = '<script>window.__LOCAL_API_SAME_ORIGIN__=true;</script>';
                if (html.indexOf('</head>') !== -1) {
                    html = html.replace('</head>', marker + '</head>');
                } else {
                    html = marker + html;
                }
                content = Buffer.from(html, 'utf8');
            } else {
                res.setHeader('Cache-Control', 'no-cache');
            }
            res.statusCode = 200;
            res.end(content);
            return;
        }

        const chunks = [];
        for await (const chunk of req) chunks.push(chunk);
        const body = chunks.length ? Buffer.concat(chunks) : undefined;

        const url = 'http://127.0.0.1:' + port + req.url;
        const headers = {};
        for (const [k, v] of Object.entries(req.headers)) {
            if (typeof v === 'string') headers[k] = v;
        }

        try {
            const request = new Request(url, {
                method: req.method,
                headers,
                body: req.method === 'GET' || req.method === 'HEAD' ? undefined : body,
            });
            const response = await worker.fetch(request, env, {});
            res.statusCode = response.status;
            response.headers.forEach((value, key) => {
                if (key.toLowerCase() === 'content-type') res.setHeader(key, value);
            });
            for (const [k, v] of Object.entries(CORS)) res.setHeader(k, v);
            const text = await response.text();
            res.end(text);
            if (!quiet) {
                console.log(new Date().toLocaleTimeString('zh-CN'), req.method, req.url, '->', response.status);
            }
        } catch (e) {
            res.statusCode = 500;
            for (const [k, v] of Object.entries(CORS)) res.setHeader(k, v);
            res.setHeader('Content-Type', 'application/json');
            res.end(JSON.stringify({ error: e.message }));
            if (!quiet) {
                console.log(new Date().toLocaleTimeString('zh-CN'), req.method, req.url, '-> 500', e.message);
            }
        }
    });

    await new Promise((resolve, reject) => {
        server.once('error', reject);
        server.listen(port, host, resolve);
    });

    let codeVersion = '';
    let built = '';
    try {
        const bundle = fs.readFileSync(path.join(ROOT, 'worker-dist', 'index.js'), 'utf8');
        codeVersion = (bundle.match(/CODE_VERSION = '([^']+)'/) || [])[1] || (bundle.match(/admin-\d+/) || [''])[0];
        built = fs.statSync(path.join(ROOT, 'worker-dist', 'index.js')).mtime.toLocaleString('zh-CN');
    } catch (e) {
        built = '未知';
    }

    if (!quiet) {
        console.log('='.repeat(56));
        console.log('  本地接口已启动（不需要 Cloudflare 登录）');
        console.log('='.repeat(56));
        console.log('  接口地址：http://127.0.0.1:' + port);
        const lan = lanAddresses();
        lan.forEach((ip) => {
            console.log('  手机可用：http://' + ip + ':' + port);
        });
        console.log('  数据库：  ' + dbFile);
        console.log('  代码版本：' + (codeVersion || '未知'));
        console.log('  构建时间：' + built);
        console.log('');
        console.log('  电脑上打开：http://127.0.0.1:8848/admin.html?api=http://127.0.0.1:' + port);
        if (lan.length) {
            console.log('  手机上打开：http://' + lan[0] + ':8848/admin.html?api=http://' + lan[0] + ':' + port);
        }
        console.log('');
        console.log('  第一次用：在后台登录框填管理员邮箱+密码，点「首次使用：注册」');
        console.log('  Ctrl+C 停止；想清空数据就删掉 .local-data 目录');
        console.log('='.repeat(56));
    }

    return {
        server,
        port,
        dbFile,
        codeVersion,
        close: () =>
            new Promise((resolve) => {
                server.close(() => {
                    try {
                        sqliteDb.close();
                    } catch (e) {
                        /* 忽略 */
                    }
                    resolve();
                });
            }),
    };
}

/* ---------------- 直接运行时启动 ---------------- */
const isMain = process.argv[1] && path.resolve(process.argv[1]) === fileURLToPath(import.meta.url);
if (isMain) {
    try {
        await startServer({ port: DEFAULT_PORT, host: DEFAULT_HOST });
    } catch (e) {
        if (e && e.code === 'EADDRINUSE') {
            console.log('');
            console.log('!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!');
            console.log('  启动失败：端口 ' + DEFAULT_PORT + ' 已被占用');
            console.log('!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!');
            console.log('  最可能是「之前启动的接口窗口」还开着，它跑的是旧代码。');
            console.log('  处理办法：');
            console.log('    1) 找到之前那个黑窗口，按 Ctrl+C 关掉它');
            console.log('    2) 或者关掉全部 node 窗口后重新双击本脚本');
            console.log('    3) 查看谁占用：netstat -ano | findstr :' + DEFAULT_PORT);
            console.log('');
            process.exit(1);
        }
        console.log('服务出错：', e && e.message);
        process.exit(1);
    }
}
