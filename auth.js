// 接口地址：独立的 Cloudflare Worker，已绑定自有子域名（国内可直连，不需要翻墙）
// 如果你以后换了域名，只改这一行即可。留空字符串表示"同域 /api"。
const API_BASE = 'https://api.jacksjz.qzz.io';

// 供体检页等其他脚本复用同一个接口地址
window.API_BASE = API_BASE;

// 与 Worker 里的 REGISTRATION_OPEN 保持一致：
const REGISTRATION_OPEN = false;

let currentUser = null;

function escapeHtml(text) {
    const div = document.createElement('div');
    div.textContent = text;
    return div.innerHTML;
}

function timeAgo(timestamp) {
    const seconds = Math.floor(Date.now() / 1000) - timestamp;
    if (seconds < 60) return '刚刚';
    if (seconds < 3600) return Math.floor(seconds / 60) + '分钟前';
    if (seconds < 86400) return Math.floor(seconds / 3600) + '小时前';
    if (seconds < 604800) return Math.floor(seconds / 86400) + '天前';
    return new Date(timestamp * 1000).toLocaleDateString('zh-CN');
}

async function api(endpoint, options = {}) {
    const token = localStorage.getItem('auth_token');
    const headers = {
        'Content-Type': 'application/json',
        ...options.headers,
    };
    if (token) {
        headers['Authorization'] = `Bearer ${token}`;
    }
    const response = await fetch(API_BASE + endpoint, {
        ...options,
        headers,
    });
    let data = {};
    try {
        data = await response.json();
    } catch (e) {
        data = {};
    }
    if (!response.ok) {
        const err = new Error(data.error || '请求失败 (' + response.status + ')');
        err.status = response.status;
        err.data = data;
        throw err;
    }
    return data;
}

async function checkAuth() {
    const token = localStorage.getItem('auth_token');
    if (!token) {
        currentUser = null;
        updateAuthUI();
        return;
    }
    try {
        const data = await api('/api/me');
        currentUser = data;
        updateAuthUI();
    } catch (e) {
        // 只有服务器明确告知"未登录 / 令牌无效"才清除本地凭证。
        // 网络异常、CORS 抖动、接口 500 等情况一律保留 token，
        // 否则一次临时故障就会把用户踢下线（刷新后就"登录没了"）。
        if (e && (e.status === 401 || e.status === 403)) {
            localStorage.removeItem('auth_token');
            window.__authError = null;
        } else {
            window.__authError = (e && e.message) || '登录状态校验失败';
        }
        currentUser = null;
        updateAuthUI();
    }
}

function updateAuthUI() {
    const loginBtn = document.getElementById('authLoginBtn');
    const registerBtn = document.getElementById('authRegisterBtn');
    const userMenu = document.getElementById('authUserMenu');
    const userNickname = document.getElementById('authUserNickname');
    const customerBadge = document.getElementById('authCustomerBadge');
    const userKeys = document.getElementById('authUserKeys');
    const activateBtn = document.getElementById('authActivateBtn');
    const dropdown = document.getElementById('userDropdown');
    const commentForm = document.getElementById('commentForm');
    const activateSection = document.getElementById('activateSection');
    const loginHint = document.getElementById('loginHint');
    const hiddenContent = document.querySelectorAll('.customer-content');

    if (currentUser) {
        // 角色：admin 管理员 / premium 资深玩家 / player 游戏玩家
        const role = currentUser.role || (currentUser.is_admin ? 'admin' : '');
        const roleLabel = { admin: '管理员', premium: '资深玩家', player: '游戏玩家' }[role] || '';
        // 高级分区权限：管理员、资深玩家、已激活客户
        const hasAccess = !!currentUser.is_premium || role === 'admin' || role === 'premium' || !!currentUser.is_customer;
        // 这些人不需要（也不应该看到）订单激活入口
        const noActivate = role === 'admin' || role === 'premium';

        if (loginBtn) loginBtn.style.display = 'none';
        if (registerBtn) registerBtn.style.display = 'none';
        if (userMenu) {
            userMenu.style.display = 'flex';
            if (userNickname) userNickname.textContent = currentUser.nickname || currentUser.email;
            if (customerBadge) {
                if (roleLabel) {
                    customerBadge.textContent = roleLabel;
                    customerBadge.style.display = 'inline';
                } else if (currentUser.is_customer) {
                    customerBadge.textContent = '';
            customerBadge.style.display = 'none';
                } else {
                    customerBadge.style.display = 'none';
                }
            }
            if (userKeys) {
                if (currentUser.is_customer && currentUser.serial_numbers) {
                    userKeys.style.display = 'block';
                    userKeys.innerHTML = `<span class="key-label">密钥:</span> <span class="key-value">${currentUser.serial_numbers}</span>`;
                } else {
                    userKeys.style.display = 'none';
                }
            }
            if (activateBtn) {
                const serialCount = currentUser.serial_numbers ? currentUser.serial_numbers.split(',').length : 0;
                activateBtn.style.display = noActivate || serialCount >= 3 ? 'none' : 'block';
                activateBtn.textContent = currentUser.is_customer ? '添加密钥' : '激活订单';
            }
            if (dropdown) {
                dropdown.style.display = 'none';
            }
        }
        if (commentForm) commentForm.style.display = 'block';
        if (loginHint) loginHint.style.display = 'none';
        if (activateSection) {
            activateSection.style.display = 'none';
        }
        hiddenContent.forEach(el => {
            el.style.display = hasAccess ? 'block' : 'none';
        });
    } else {
        if (loginBtn) loginBtn.style.display = 'inline-block';
        if (registerBtn) registerBtn.style.display = 'inline-block';
        if (userMenu) userMenu.style.display = 'none';
        if (commentForm) commentForm.style.display = 'none';
        if (loginHint) loginHint.style.display = 'block';
        if (activateSection) activateSection.style.display = 'none';
        hiddenContent.forEach(el => {
            el.style.display = 'none';
        });
    }
}

function recoverPassword() {
        var account = prompt('请输入账号（手机号 或 邮箱）');
        if (!account) return;
        var orderNo = prompt('请输入淘宝订单号');
        if (!orderNo) return;
        var newPass = prompt('请设置新密码（至少 6 位）');
        if (!newPass) return;
        fetch((window.API_BASE || '') + '/api/recover', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ account: account.trim(), order_no: orderNo.trim(), new_password: newPass }),
        })
            .then(function (r) { return r.json().then(function (d) { return { ok: r.ok, d: d }; }); })
            .then(function (res) {
                alert(res.ok ? '密码已重置，请用新密码登录' : (res.d && res.d.error) || '重置失败');
            })
            .catch(function () { alert('网络错误，请稍后再试'); });
    }

    function loadTurnstile() {
        if (document.getElementById('cfTurnstileScript')) return;
        var s = document.createElement('script');
        s.id = 'cfTurnstileScript';
        s.src = 'https://challenges.cloudflare.com/turnstile/v0/api.js';
        s.async = true;
        s.defer = true;
        document.head.appendChild(s);
    }

    function showAuthModal(type = 'login') {
    let modal = document.getElementById('authModal');
    if (modal) modal.remove();

    modal = document.createElement('div');
    modal.id = 'authModal';
    modal.className = 'auth-modal';
    modal.innerHTML = `
        <div class="auth-modal-content">
            <button class="auth-close" onclick="closeAuthModal()">&times;</button>
            <h2 id="authModalTitle">${type === 'login' ? '登录' : '注册'}</h2>
            <form id="authForm" onsubmit="handleAuthSubmit(event, '${type}')">
                ${type === 'register' ? `
                    <div class="auth-field">
                        <label>昵称（可选）</label>
                        <input type="text" id="authNickname" placeholder="给自己起个名字">
                    </div>
                ` : ''}
                <div class="auth-field">
                    <label>${type === 'register' ? '手机号' : '手机号 / 邮箱'}</label>
                    <input type="text" id="authEmail" placeholder="手机号或邮箱" required autocomplete="username">
                </div>
                <div class="auth-field">
                    ${type === 'register' ? '<div class="auth-field"><label>淘宝订单号</label><input type="text" id="authOrderNo" placeholder="请填写淘宝订单号" required></div>' : ''}
            <label>密码</label>
                    <input type="password" id="authPassword" placeholder="请输入密码" required minlength="6">
                </div>
                ${type === 'register' ? '<div class="cf-turnstile" data-sitekey="0x4AAAAAAF2qWq_WUxV1UGUl" data-theme="auto" data-size="flexible" style="margin:12px 0"></div>' : ''}
        <button type="submit" class="btn btn-primary auth-submit">${type === 'login' ? '登录' : '注册'}</button>
            </form>
            <div style="text-align:center;margin-top:10px"><a href="#" onclick="recoverPassword(); return false;" style="font-size:13px;color:var(--label-2)">忘记密码？</a></div>
        <div class="auth-switch">
                ${type === 'login'
                    ? '没有账号？<a href="#" onclick="showAuthModal(\'register\'); return false;">注册</a>'
                    : '已有账号？<a href="#" onclick="showAuthModal(\'login\'); return false;">登录</a>'}
            </div>
        </div>
    `;
    document.body.appendChild(modal);
    if (typeof type !== 'undefined' && type === 'register') { loadTurnstile(); }
}

function closeAuthModal() {
    const modal = document.getElementById('authModal');
    if (modal) modal.remove();
}

async function handleAuthSubmit(event, type) {
    event.preventDefault();
    const email = document.getElementById('authEmail').value.trim();
    const isPhoneNo = /^1\d{10}$/.test(email);
    const isMail = /^[^@\s]+@[^@\s]+\.[^@\s]+$/.test(email);
    if (!isPhoneNo && !isMail) {
        alert('手机号或邮箱格式不正确');
        return;
    }
    const password = document.getElementById('authPassword').value;
    const nickname = document.getElementById('authNickname')?.value;
    const tsEl = document.querySelector('[name="cf-turnstile-response"]');
    const turnstileToken = tsEl ? tsEl.value : '';

    const submitBtn = document.querySelector('.auth-submit');
    submitBtn.disabled = true;
    submitBtn.textContent = '处理中...';

    try {
        if (type === 'register') {
            await api('/api/register', {
                method: 'POST',
                body: JSON.stringify({ email, phone: email, password, nickname, turnstile_token: turnstileToken, order_no: (document.getElementById('authOrderNo') || {}).value || '' }),
            });
            alert('注册成功！请登录');
            showAuthModal('login');
        } else {
            const data = await api('/api/login', {
                method: 'POST',
                body: JSON.stringify({ email, password }),
            });
            localStorage.setItem('auth_token', data.token);
            currentUser = data.user;
            closeAuthModal();
            updateAuthUI();
            loadComments();
        }
    } catch (e) {
        alert(e.message);
    } finally {
        submitBtn.disabled = false;
        submitBtn.textContent = type === 'login' ? '登录' : '注册';
    }
}

function logout() {
    localStorage.removeItem('auth_token');
    currentUser = null;
    updateAuthUI();
    loadComments();
}

function showActivateModal() {
    let modal = document.getElementById('activateModal');
    if (modal) modal.remove();

    const isCustomer = currentUser && currentUser.is_customer;
    const serialCount = currentUser?.serial_numbers ? currentUser.serial_numbers.split(',').length : 0;
    const title = isCustomer ? '添加密钥' : '订单激活';
    const currentOrderId = currentUser?.order_id || '';
    const currentSerial = currentUser?.serial_numbers || '';

    modal = document.createElement('div');
    modal.id = 'activateModal';
    modal.className = 'auth-modal';
    modal.innerHTML = `
        <div class="auth-modal-content">
            <button class="auth-close" onclick="closeActivateModal()">&times;</button>
            <h2>${title}</h2>
            <p style="color: var(--label-2); margin-bottom: 20px; font-size: 0.9rem;">
                输入您的订单号和Switch序列号后4位，激活后可查看专属内容。<br>
                一个订单最多绑定3个序列号。${isCustomer ? `<br>当前已有 ${serialCount} 个密钥。` : ''}
            </p>
            <form id="activateForm" onsubmit="handleActivateSubmit(event)">
                <div class="auth-field">
                    <label>订单号</label>
                    <input type="text" id="activateOrderId" placeholder="请输入订单号" value="${currentOrderId}" required>
                </div>
                <div class="auth-field">
                    <label>序列号后4位（多个用逗号分隔，最多3个）</label>
                    <input type="text" id="activateSerial" placeholder="如：XKJ7 或 XKJ7,AB12,3F09" value="${currentSerial}" required>
                </div>
                <button type="submit" class="btn btn-primary auth-submit">${isCustomer ? '保存' : '激活'}</button>
            </form>
        </div>
    `;
    document.body.appendChild(modal);
}

function closeActivateModal() {
    const modal = document.getElementById('activateModal');
    if (modal) modal.remove();
}

async function handleActivateSubmit(event) {
    event.preventDefault();
    const orderId = document.getElementById('activateOrderId').value.trim();
    const serialNumbers = document.getElementById('activateSerial').value.trim().toUpperCase();

    const submitBtn = document.querySelector('#activateForm .auth-submit');
    submitBtn.disabled = true;
    submitBtn.textContent = '验证中...';

    try {
        const data = await api('/api/activate', {
            method: 'POST',
            body: JSON.stringify({ order_id: orderId, serial_numbers: serialNumbers }),
        });
        alert(currentUser.is_customer ? '密钥更新成功！' : '激活成功！');
        currentUser.is_customer = true;
        currentUser.order_id = orderId;
        currentUser.serial_numbers = data.serial_numbers || serialNumbers;
        closeActivateModal();
        updateAuthUI();
    } catch (e) {
        alert(e.message);
    } finally {
        submitBtn.disabled = false;
        submitBtn.textContent = '激活';
    }
}

async function loadComments() {
    const container = document.getElementById('commentsList');
    if (!container) return;

    // 直接双击 HTML 文件预览时没有后端，给出友好提示
    if (window.location.protocol === 'file:') {
        container.innerHTML = '<p style="color: var(--label-3);">本地预览模式：评论功能需部署到 Cloudflare 后使用</p>';
        return;
    }

    const pageId = document.body.dataset.pageId || window.location.pathname.replace('/', '') || 'index';

    try {
        const data = await api(`/api/comments?page=${pageId}`);
        renderComments(data.comments);
    } catch (e) {
        container.innerHTML = '<p style="color: var(--label-2);">加载评论失败</p>';
    }
}

function renderComments(comments) {
    const container = document.getElementById('commentsList');
    if (!container) return;

    if (!comments || comments.length === 0) {
        container.innerHTML = '<p style="color: var(--label-2);">暂无评论，快来抢沙发吧！</p>';
        return;
    }

    container.innerHTML = comments.map(c => `
        <div class="comment-item">
            <div class="comment-header">
                <span class="comment-author">${escapeHtml(c.nickname || c.email.split('@')[0])}</span>
                <span class="comment-time">${timeAgo(c.created_at)}</span>
                ${currentUser && currentUser.id === c.user_id ? 
                    `<button class="comment-delete" onclick="deleteComment(${c.id})">删除</button>` : ''}
            </div>
            <div class="comment-content">${escapeHtml(c.content)}</div>
        </div>
    `).join('');
}

async function submitComment(event) {
    event.preventDefault();
    const textarea = document.getElementById('commentInput');
    const content = textarea.value.trim();
    if (!content) return;

    const submitBtn = document.querySelector('#commentForm .btn');
    submitBtn.disabled = true;
    submitBtn.textContent = '发送中...';

    const pageId = document.body.dataset.pageId || window.location.pathname.replace('/', '') || 'index';

    try {
        await api('/api/comments', {
            method: 'POST',
            body: JSON.stringify({ page_id: pageId, content }),
        });
        textarea.value = '';
        loadComments();
    } catch (e) {
        alert(e.message);
    } finally {
        submitBtn.disabled = false;
        submitBtn.textContent = '发送';
    }
}

async function deleteComment(commentId) {
    if (!confirm('确定删除这条评论吗？')) return;
    try {
        await api(`/api/comments?id=${commentId}`, { method: 'DELETE' });
        loadComments();
    } catch (e) {
        alert(e.message);
    }
}

function toggleUserDropdown() {
    const dropdown = document.getElementById('userDropdown');
    const arrow = document.querySelector('.dropdown-arrow');
    if (dropdown) {
        if (dropdown.style.display === 'none') {
            dropdown.style.display = 'flex';
            if (arrow) arrow.style.transform = 'rotate(180deg)';
        } else {
            dropdown.style.display = 'none';
            if (arrow) arrow.style.transform = 'rotate(0deg)';
        }
    }
}

document.addEventListener('click', function(e) {
    const userMenu = document.getElementById('authUserMenu');
    const dropdown = document.getElementById('userDropdown');
    if (dropdown && userMenu && !userMenu.contains(e.target)) {
        dropdown.style.display = 'none';
        const arrow = document.querySelector('.dropdown-arrow');
        if (arrow) arrow.style.transform = 'rotate(0deg)';
    }
});

function initAuth() {
    checkAuth();
    loadComments();
}

document.addEventListener('DOMContentLoaded', initAuth);



/* ===== 前台权限拦截（GATE_VERSION 1）：普通玩家不能评论 / 下载 ===== */
(function () {
    function apiBase() {
        if (window.__LOCAL_API_SAME_ORIGIN__) return location.origin;
        return String(window.API_BASE || '').replace(/\/+$/, '');
    }
    function getToken() {
        try { return localStorage.getItem('auth_token') || ''; } catch (e) { return ''; }
    }
    function hint(text) {
        var d = document.createElement('div');
        d.textContent = text;
        d.style.cssText =
            'position:fixed;left:50%;bottom:80px;transform:translateX(-50%);z-index:6000;' +
            'background:rgba(0,0,0,.82);color:#fff;padding:10px 16px;border-radius:10px;font-size:14px;max-width:82vw;text-align:center;';
        document.body.appendChild(d);
        setTimeout(function () { d.remove(); }, 2200);
    }

    var access = null; // null=未知，true=有权限，false=普通玩家

    function checkAccess() {
        var token = getToken();
        if (!token) { access = false; return Promise.resolve(false); }
        return fetch(apiBase() + '/api/me', { headers: { Authorization: 'Bearer ' + token } })
            .then(function (r) { return r.ok ? r.json() : null; })
            .then(function (u) {
                if (!u) { access = false; return false; }
                access = !!(u.is_admin || u.role === 'admin' || u.role === 'premium' || u.is_customer);
                return access;
            })
            .catch(function () { access = null; return null; });
    }

    /* 评论区 */
    function lockComments() {
        var nodes = document.querySelectorAll('textarea, input[type="text"]');
        var done = 0;
        for (var i = 0; i < nodes.length; i++) {
            var n = nodes[i];
            var sig = ((n.id || '') + ' ' + (n.className || '') + ' ' + (n.placeholder || '')).toLowerCase();
            if (sig.indexOf('comment') === -1 && sig.indexOf('评论') === -1 && sig.indexOf('留言') === -1) continue;
            n.setAttribute('placeholder', '激活后才能评论');
            n.setAttribute('disabled', 'disabled');
            n.style.opacity = '0.6';
            n.style.cursor = 'not-allowed';
            n.addEventListener('click', function () { hint('激活后才能评论'); });
            done++;
        }
        // 评论提交按钮
        var btns = document.querySelectorAll('button, a');
        for (var j = 0; j < btns.length; j++) {
            var b = btns[j];
            var txt = (b.textContent || '').trim();
            if (txt.indexOf('发表评论') !== -1 || txt.indexOf('发送评论') !== -1 || txt.indexOf('提交评论') !== -1) {
                b.style.opacity = '0.55';
                b.addEventListener('click', function (e) {
                    e.preventDefault();
                    e.stopPropagation();
                    hint('激活后才能评论');
                }, true);
                done++;
            }
        }
        return done;
    }

    /* 下载链接 */
    var DOWNLOAD_HINTS = ['pan.', 'quark', 'lanzou', 'lanzoux', 'aliyundrive', '123pan', 'ctfile', '.zip', '.apk', '.rar', '.7z', '.exe', '.iso'];

    function isDownloadLike(a) {
        if (!a || !a.tagName) return false;
        var href = (a.getAttribute('href') || '').toLowerCase();
        var cls = ((a.className || '') + ' ' + (a.id || '')).toLowerCase();
        if (a.hasAttribute('download')) return true;
        if (cls.indexOf('download') !== -1) return true;
        for (var i = 0; i < DOWNLOAD_HINTS.length; i++) {
            if (href.indexOf(DOWNLOAD_HINTS[i]) !== -1) return true;
        }
        return false;
    }

    function lockDownloads() {
        document.addEventListener('click', function (e) {
            var a = e.target && e.target.closest ? e.target.closest('a,button') : null;
            if (!a) return;
            if (!isDownloadLike(a)) return;
            if (access === null) return; // 未知时放行，避免误伤
            if (access) return;
            e.preventDefault();
            e.stopPropagation();
            hint(getToken() ? '激活后才能下载' : '请先登录');
        }, true);
    }

    function boot() {
        if (!getToken()) return;
        checkAccess().then(function (ok) {
            if (ok === false) {
                lockComments();
                // 稍后再扫一次，等评论区渲染完
                setTimeout(lockComments, 1200);
            }
        });
        lockDownloads();
    }

    if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', boot);
    else boot();
})();

/* ===== 站内消息收件箱（INBOX_VERSION 4：徽章变信封 + 显示时间） ===== */
(function () {
    var BADGE_SELECTORS = ['#authCustomerBadge', '#authRoleBadge', '.role-badge'];

    function apiBase() {
        if (window.__LOCAL_API_SAME_ORIGIN__) return location.origin;
        return String(window.API_BASE || '').replace(/\/+$/, '');
    }
    function getToken() {
        try { return localStorage.getItem('auth_token') || ''; } catch (e) { return ''; }
    }
    function fmtTime(ts) {
        try {
            var d = new Date(Number(ts) * 1000);
            var p = function (n) { return n < 10 ? '0' + n : '' + n; };
            return d.getFullYear() + '-' + p(d.getMonth() + 1) + '-' + p(d.getDate()) + ' ' + p(d.getHours()) + ':' + p(d.getMinutes());
        } catch (e) { return ''; }
    }
    function injectStyle() {
        if (document.getElementById('inboxStyle')) return;
        var css = document.createElement('style');
        css.id = 'inboxStyle';
        css.textContent =
            '@keyframes msgBlink{0%,100%{opacity:1}50%{opacity:.35}}' +
            '.msg-envelope{display:inline-block;animation:msgBlink 1.1s ease-in-out infinite;}' +
            '.msg-time{font-size:11px;color:#8E8E93;margin-top:4px;}';
        document.head.appendChild(css);
    }

    function findBadge() {
        for (var i = 0; i < BADGE_SELECTORS.length; i++) {
            var el = document.querySelector(BADGE_SELECTORS[i]);
            if (el) return el;
        }
        return null;
    }

    var savedHtml = null;

    var badgeOriginalCss = null;

    function setBadgeEnvelope(count) {
        var el = findBadge();
        if (!el) return;
        var cur = el.getAttribute('data-inbox-env');
        if (count > 0) {
            if (cur !== String(count)) {
                if (savedHtml === null) {
                    savedHtml = el.innerHTML;
                    badgeOriginalCss = el.style.cssText;
                }
                el.setAttribute('data-inbox-env', String(count));
                el.innerHTML = '<span class="msg-envelope" style="display:inline-block"><svg width="17" height="17" viewBox="0 0 24 24" style="vertical-align:-3px"><rect x="2" y="5" width="20" height="14" rx="3" fill="#FFC107"/><path d="M2.8 6.6 12 13l9.2-6.4" fill="none" stroke="#8A5A00" stroke-width="1.6" stroke-linecap="round"/></svg></span>' +
                    '<span style="font-size:12px;color:#FF3B30;font-weight:600;margin-left:3px;vertical-align:2px;">' + count + '</span>';
                el.title = count + ' 条未读消息';
                // 去掉徽章原本的背景、内边距、圆角
                el.style.background = 'none';
                el.style.backgroundColor = 'transparent';
                el.style.padding = '0';
                el.style.border = 'none';
                el.style.boxShadow = 'none';
                el.style.display = 'inline-block';
            }
        } else if (cur !== null) {
            el.removeAttribute('data-inbox-env');
            if (savedHtml) el.innerHTML = savedHtml;
            el.style.cssText = badgeOriginalCss || '';
            el.title = '';
            savedHtml = null;
            badgeOriginalCss = null;
        }
    }

    function refresh() {
        if (!getToken()) return;
        fetch(apiBase() + '/api/messages', { headers: { Authorization: 'Bearer ' + getToken() } })
            .then(function (r) { return r.ok ? r.json() : null; })
            .then(function (d) { window.__inboxUnread = (d && d.unread) || 0; setBadgeEnvelope(window.__inboxUnread); })
            .catch(function () {});
    }

    function openInbox() {
        var old = document.getElementById('inboxOverlay');
        if (old) { old.remove(); return; }
        injectStyle();
        var overlay = document.createElement('div');
        overlay.id = 'inboxOverlay';
        overlay.style.cssText = 'position:fixed;inset:0;z-index:5000;background:rgba(0,0,0,.35);display:flex;align-items:flex-end;justify-content:center;';
        var panel = document.createElement('div');
        panel.style.cssText = 'width:100%;max-width:560px;max-height:76vh;overflow:auto;background:#F2F2F7;border-radius:16px 16px 0 0;padding:16px;box-shadow:0 -8px 30px rgba(0,0,0,.18);';

        var head = document.createElement('div');
        head.style.cssText = 'display:flex;align-items:center;gap:8px;margin-bottom:12px;font-size:16px;';
        var icon = document.createElement('span'); icon.textContent = '✉️'; icon.style.fontSize = '20px';
        var title = document.createElement('b'); title.textContent = '我的消息';
        var countEl = document.createElement('span'); countEl.style.cssText = 'color:#8E8E93;font-size:13px;';
        var spacer = document.createElement('div'); spacer.style.flex = '1';
        var close = document.createElement('button'); close.className = 'btn btn-secondary btn-sm'; close.textContent = '关闭';
        close.onclick = function () { overlay.remove(); };
        head.appendChild(icon); head.appendChild(title); head.appendChild(countEl); head.appendChild(spacer); head.appendChild(close);
        panel.appendChild(head);

        var body = document.createElement('div'); body.textContent = '加载中…';
        panel.appendChild(body);
        overlay.appendChild(panel);
        overlay.onclick = function (e) { if (e.target === overlay) overlay.remove(); };
        document.body.appendChild(overlay);

        fetch(apiBase() + '/api/messages', { headers: { Authorization: 'Bearer ' + getToken() } })
            .then(function (r) { return r.ok ? r.json() : null; })
            .then(function (d) {
                var list = (d && d.messages) || [];
                var unread = (d && d.unread) || 0;
                countEl.textContent = unread ? '（' + unread + ' 条未读）' : '';
                body.textContent = '';
                if (!list.length) { body.appendChild(document.createTextNode('暂时没有消息。')); return; }
                list.sort(function (a, b) { return (a.read_at ? 1 : 0) - (b.read_at ? 1 : 0); });
                list.forEach(function (m) {
                    var card = document.createElement('div');
                    card.style.cssText = 'padding:10px 12px;margin-bottom:8px;border-radius:10px;background:#fff;cursor:pointer;' +
                        (m.read_at ? 'opacity:.6;' : 'border-left:3px solid #FF3B30;');
                    var t = document.createElement('div');
                    t.textContent = (m.read_at ? '' : '✉️ ') + (m.title || '通知');
                    t.style.cssText = 'font-weight:' + (m.read_at ? '400' : '600') + ';margin-bottom:4px;';
                    var c = document.createElement('div');
                    c.textContent = m.content;
                    c.style.cssText = 'font-size:14px;color:#3A3A3C;white-space:pre-wrap;';
                    var time = document.createElement('div');
                    time.className = 'msg-time';
                    time.textContent = fmtTime(m.created_at);
                    card.appendChild(t); card.appendChild(c); card.appendChild(time);
                    var del = document.createElement('button');
                    del.className = 'msg-delete';
                    del.textContent = '删除';
                    del.style.cssText = 'float:right;margin-top:-46px;background:rgba(255,59,48,.12);color:#FF3B30;border:none;border-radius:8px;padding:4px 10px;font-size:12px;cursor:pointer;';
                    del.onclick = function (ev) {
                        ev.preventDefault();
                        ev.stopPropagation();
                        if (!confirm('删除这条消息？')) return;
                        fetch(apiBase() + '/api/messages?id=' + encodeURIComponent(m.id), {
                            method: 'DELETE',
                            headers: { Authorization: 'Bearer ' + getToken() },
                        }).then(function (r) {
                            if (r.ok) {
                                card.remove();
                                refresh();
                            } else {
                                alert('删除失败');
                            }
                        }).catch(function () { alert('删除失败'); });
                    };
                    card.appendChild(del);
                    card.onclick = function () {
                        fetch(apiBase() + '/api/messages/read', {
                            method: 'POST',
                            headers: { 'Content-Type': 'application/json', Authorization: 'Bearer ' + getToken() },
                            body: JSON.stringify({ id: m.id }),
                        }).then(function () {
                            card.style.opacity = '.6';
                            card.style.borderLeft = 'none';
                            t.textContent = m.title || '通知';
                            refresh();
                        }).catch(function () {});
                    };
                    body.appendChild(card);
                });
            })
            .catch(function () { body.textContent = '读取失败，请稍后再试。'; });
    }

    /* 把「我的消息」插进用户面板（激活 / 退出 之间） */
    
    var injecting = false;

function boot() {
        // 后台管理页不显示收件箱
        if (/admin\.html/i.test(location.pathname)) return;
        if (!getToken()) return;
        refresh();

        /* 徽章校正：防止登录渲染把信封覆盖掉 */
        setInterval(function () {
            if (window.__inboxUnread > 0) setBadgeEnvelope(window.__inboxUnread);
        }, 2000);
        setInterval(refresh, 60000);
    }
    if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', boot);
    else boot();
    window.refreshInboxBadge = refresh;
    window.__openInbox = openInbox;
    window.openMyMessages = openInbox;
})();
