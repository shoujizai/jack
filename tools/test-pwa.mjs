// PWA 检查：manifest / service worker / 图标 / 安装入口 / 桌面启动器
import fs from 'node:fs';
import path from 'node:path';

const ROOT = 'C:\\Users\\qq318\\Documents\\trae\\新建文件夹\\blog';
let pass = 0;
let fail = 0;
const check = (name, cond, extra) => {
    if (cond) {
        pass++;
        console.log('✔ ' + name);
    } else {
        fail++;
        console.log('✘ ' + name + (extra !== undefined ? '  → ' + String(JSON.stringify(extra)).slice(0, 200) : ''));
    }
};

const read = (f) => fs.readFileSync(path.join(ROOT, f), 'utf8');

console.log('=== 1. manifest（安装成程序的核心） ===');
const manifest = JSON.parse(read('manifest.webmanifest'));
check('name 与 short_name 都有', !!manifest.name && !!manifest.short_name, manifest.name);
check('start_url 指向后台', manifest.start_url === '/admin.html', manifest.start_url);
check('display 为 standalone（独立窗口）', manifest.display === 'standalone', manifest.display);
check('有 theme_color / background_color', !!manifest.theme_color && !!manifest.background_color);
check('图标至少 2 个尺寸', (manifest.icons || []).length >= 2, (manifest.icons || []).length);
check('包含 192 尺寸', (manifest.icons || []).some((i) => i.sizes === '192x192'));
check('包含 512 尺寸', (manifest.icons || []).some((i) => i.sizes === '512x512'));
check('包含 maskable 图标（安卓自适应）', (manifest.icons || []).some((i) => (i.purpose || '').includes('maskable')));
check('有快捷方式（新建页面 / 用户）', (manifest.shortcuts || []).length >= 2, (manifest.shortcuts || []).length);

console.log('\n=== 2. 图标文件 ===');
for (const icon of manifest.icons || []) {
    const file = path.join(ROOT, icon.src.replace(/^\//, ''));
    let ok = false;
    let size = '';
    try {
        const buf = fs.readFileSync(file);
        const isPng = buf.slice(0, 8).toString('hex') === '89504e470d0a1a0a';
        const w = buf.readUInt32BE(16);
        const h = buf.readUInt32BE(20);
        ok = isPng && w + 'x' + h === icon.sizes;
        size = w + 'x' + h;
    } catch (e) {
        ok = false;
        size = '缺失';
    }
    check('图标存在且尺寸正确：' + icon.src, ok, size);
}

console.log('\n=== 3. Service Worker ===');
const sw = read('sw.js');
check('有缓存名（便于升级）', /const CACHE = '/.test(sw), (sw.match(/const CACHE = '([^']+)'/) || [])[1]);
check('预缓存后台页面', /'\/admin.html'/.test(sw));
check('预缓存样式与脚本', /'\/styles\.css'/.test(sw) && /'\/auth\.js'/.test(sw));
check('不缓存接口（/api/ 直接跳过）', /startsWith\('\/api\/'\)/.test(sw));
check('页面导航用网络优先', /req\.mode === 'navigate'/.test(sw));
check('有 install / activate / fetch 三个事件', /addEventListener\('install'/.test(sw) && /addEventListener\('activate'/.test(sw) && /addEventListener\('fetch'/.test(sw));
check('激活时清理旧缓存', /caches\.delete/.test(sw));

console.log('\n=== 4. 后台页面接入 ===');
const admin = read('admin.html');
check('引用 manifest', /rel="manifest" href="manifest\.webmanifest"/.test(admin));
check('引用 apple-touch-icon（iOS 主屏图标）', /rel="apple-touch-icon"/.test(admin));
check('声明 iOS 可全屏', /apple-mobile-web-app-capable"\s+content="yes"/.test(admin));
check('注册 Service Worker', /navigator\.serviceWorker\.register\('sw\.js'\)/.test(admin));
check('有"安装 App"按钮', /id="installBtn"/.test(admin) && /function installApp/.test(admin));
check('监听 beforeinstallprompt', /beforeinstallprompt/.test(admin));
check('独立模式隐藏安装按钮', /function isStandalone/.test(admin));
check('支持快捷方式 ?go=pages', /get\('go'\)/.test(admin));

console.log('\n=== 5. 电脑端启动器 ===');
const launcher = read('后台管理-电脑版.cmd');
check('存在电脑版启动器', launcher.length > 0);
check('用 --app 打开（独立窗口）', /--app=%URL%/.test(launcher));
check('地址指向线上后台', /https:\/\/jacksjz\.qzz\.io\/admin\.html/.test(launcher));
check('优先 Edge、其次 Chrome、最后默认浏览器', /msedge\.exe/.test(launcher) && /chrome\.exe/.test(launcher) && /start "" "%URL%"/.test(launcher));

console.log('\n结果：通过 ' + pass + ' 项，失败 ' + fail + ' 项');
if (fail > 0) process.exitCode = 1;
