/* 后台管理 PWA 的 Service Worker
 * 目标：让"装到桌面/手机"后的程序能秒开、断网也能打开外壳
 * 原则：绝不缓存 /api/ 接口数据（内容必须实时）
 */
const CACHE = 'blog-admin-v1';

const SHELL = [
    '/admin.html',
    '/styles.css',
    '/auth.js',
    '/app.js',
    '/manifest.webmanifest',
    '/icons/icon-192.png',
    '/icons/icon-512.png',
    '/icons/icon-maskable-512.png',
    '/icons/apple-touch-icon.png',
];

self.addEventListener('install', (event) => {
    event.waitUntil(
        caches
            .open(CACHE)
            .then((cache) =>
                Promise.all(
                    SHELL.map((url) =>
                        cache.add(url).catch(() => {
                            /* 单个文件失败不影响整体安装 */
                        })
                    )
                )
            )
            .then(() => self.skipWaiting())
    );
});

self.addEventListener('activate', (event) => {
    event.waitUntil(
        caches
            .keys()
            .then((keys) => Promise.all(keys.filter((k) => k !== CACHE).map((k) => caches.delete(k))))
            .then(() => self.clients.claim())
    );
});

self.addEventListener('fetch', (event) => {
    const req = event.request;
    const url = new URL(req.url);

    // 接口请求一律走网络，不缓存、不拦截
    if (url.pathname.startsWith('/api/')) return;
    // 只处理同源 GET
    if (req.method !== 'GET' || url.origin !== self.location.origin) return;

    // 页面导航：网络优先（保证拿到最新的后台页面），失败时用缓存
    if (req.mode === 'navigate' || (req.headers.get('accept') || '').includes('text/html')) {
        event.respondWith(
            fetch(req)
                .then((res) => {
                    const copy = res.clone();
                    caches.open(CACHE).then((c) => c.put(req, copy)).catch(() => {});
                    return res;
                })
                .catch(() =>
                    caches.match(req).then((hit) => hit || caches.match('/admin.html'))
                )
        );
        return;
    }

    // 静态资源：缓存优先，同时后台更新
    event.respondWith(
        caches.match(req).then((hit) => {
            const network = fetch(req)
                .then((res) => {
                    if (res && res.status === 200) {
                        const copy = res.clone();
                        caches.open(CACHE).then((c) => c.put(req, copy)).catch(() => {});
                    }
                    return res;
                })
                .catch(() => hit);
            return hit || network;
        })
    );
});
