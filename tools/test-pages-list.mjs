// pages.html 列表页测试：验证渲染、空状态、错误状态
import fs from 'node:fs';
import vm from 'node:vm';

const DIR = 'C:\\Users\\qq318\\Documents\\trae\\新建文件夹\\blog\\';
const html = fs.readFileSync(DIR + 'pages.html', 'utf8');
const script = [...html.matchAll(/<script(?![^>]*\bsrc=)[^>]*>([\s\S]*?)<\/script>/g)]
    .map((m) => m[1])
    .filter((s) => s.trim())
    .join('\n');

function makeEl(id) {
    return {
        id,
        textContent: '',
        innerHTML: '',
        style: {},
        children: [],
        appendChild(c) {
            this.children.push(c);
        },
    };
}

async function render(payload) {
    const ids = [...new Set([...html.matchAll(/id="([^"]+)"/g)].map((m) => m[1]))];
    const elements = new Map(ids.map((id) => [id, makeEl(id)]));
    const document = {
        readyState: 'complete',
        getElementById(id) {
            if (!elements.has(id)) elements.set(id, makeEl(id));
            return elements.get(id);
        },
        addEventListener() {},
        querySelectorAll() {
            return [];
        },
        createElement: () => makeEl('div'),
    };
    const sandbox = {
        document,
        window: { API_BASE: 'https://api.example.com' },
        fetch: () =>
            Promise.resolve({
                ok: payload.ok !== false,
                status: payload.status || 200,
                json: () => Promise.resolve(payload.data),
            }),
        console,
        setTimeout,
        clearTimeout,
        URLSearchParams,
        encodeURIComponent,
        Date,
        Math,
        JSON,
        Array,
        Object,
        String,
        Number,
        RegExp,
        Error,
        Promise,
        location: { origin: 'https://site.example.com' },
    };
    sandbox.globalThis = sandbox;
    vm.createContext(sandbox);
    vm.runInContext(script, sandbox, { timeout: 5000 });
    await new Promise((r) => setTimeout(r, 120));
    return {
        state: document.getElementById('pagesState'),
        list: document.getElementById('pagesList'),
    };
}

let pass = 0;
let fail = 0;
function check(name, cond, extra) {
    if (cond) {
        pass++;
        console.log('✔ ' + name);
    } else {
        fail++;
        console.log('✘ ' + name + (extra ? '  → ' + String(extra).slice(0, 200) : ''));
    }
}

console.log('=== 有数据 ===');
{
    const { state, list } = await render({
        data: {
            pages: [
                { slug: 'guide-basic', title: '新手入门', subtitle: '从零开始', updated_at: 1700000000 },
                { slug: 'video-guide', title: '视频教程', subtitle: '', updated_at: 1700000000 },
            ],
        },
    });
    check('状态提示隐藏', state.style.display === 'none', JSON.stringify(state.style));
    check('列表显示', list.style.display === 'block', JSON.stringify(list.style));
    check('渲染两个条目', (list.innerHTML.match(/class="list-row"/g) || []).length === 2, list.innerHTML.slice(0, 200));
    check('包含标题', /新手入门/.test(list.innerHTML) && /视频教程/.test(list.innerHTML));
    check('链接指向 page.html', /href="page\.html\?slug=guide-basic"/.test(list.innerHTML), list.innerHTML.slice(0, 200));
    check('有副标题用副标题', /从零开始/.test(list.innerHTML));
    check('无副标题回退为更新日期', /更新于/.test(list.innerHTML));
    check('包含图标与箭头结构', /row-icon/.test(list.innerHTML) && /row-text/.test(list.innerHTML));
}
{
    const { state } = await render({ data: { pages: [{ slug: 'a"b', title: '<script>x</script>', subtitle: 'x', updated_at: 0 }] } });
    const { list } = await render({ data: { pages: [{ slug: 'a"b', title: '<b>x</b>', subtitle: 'y', updated_at: 0 }] } });
    check('标题做 HTML 转义', /&lt;b&gt;x&lt;\/b&gt;/.test(list.innerHTML), list.innerHTML.slice(0, 200));
}

console.log('\n=== 空列表 ===');
{
    const { state, list } = await render({ data: { pages: [] } });
    check('提示"还没有发布的页面"', /还没有发布的页面/.test(state.textContent), state.textContent);
    check('列表保持隐藏', list.style.display !== 'block');
}

console.log('\n=== 接口异常 ===');
{
    const { state } = await render({ ok: false, status: 500, data: { error: '数据库还没建表' } });
    check('显示接口错误', /读取失败/.test(state.textContent) && /数据库还没建表/.test(state.textContent), state.textContent);
}

console.log('\n结果：通过 ' + pass + ' 项，失败 ' + fail + ' 项');
if (fail > 0) process.exitCode = 1;
