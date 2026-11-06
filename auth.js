// 接口地址：独立的 Cloudflare Worker（名字：blog）。
// 如果你以后改了 Worker 名字或换了域名，只改这一行即可。
// 留空字符串则表示"同域 /api"（适合 API 和页面在同一个 Worker 的情况）。
const API_BASE = 'https://blog.318886406.workers.dev';

// 供体检页等其他脚本复用同一个接口地址
window.API_BASE = API_BASE;

// 与 Worker 里的 REGISTRATION_OPEN 保持一致：
// false = 只允许管理员邮箱登录、注册对外关闭
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
        // 角色：admin 管理员 / premium 高级用户 / player 游戏玩家
        const role = currentUser.role || (currentUser.is_admin ? 'admin' : '');
        const roleLabel = { admin: '管理员', premium: '高级用户', player: '游戏玩家' }[role] || '';
        // 高级分区权限：管理员、高级用户、已激活客户
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
                    customerBadge.textContent = '客户';
                    customerBadge.style.display = 'inline';
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
            ${!REGISTRATION_OPEN ? '<p class="auth-note">邀请制：仅名单内的邮箱可注册 / 登录</p>' : ''}
            <form id="authForm" onsubmit="handleAuthSubmit(event, '${type}')">
                ${type === 'register' ? `
                    <div class="auth-field">
                        <label>昵称（可选）</label>
                        <input type="text" id="authNickname" placeholder="给自己起个名字">
                    </div>
                ` : ''}
                <div class="auth-field">
                    <label>邮箱</label>
                    <input type="email" id="authEmail" placeholder="请输入邮箱" required>
                </div>
                <div class="auth-field">
                    <label>密码</label>
                    <input type="password" id="authPassword" placeholder="请输入密码" required minlength="6">
                </div>
                <button type="submit" class="btn btn-primary auth-submit">${type === 'login' ? '登录' : '注册'}</button>
            </form>
            <div class="auth-switch">
                ${type === 'login'
                    ? '没有账号？<a href="#" onclick="showAuthModal(\'register\'); return false;">注册</a>'
                    : '已有账号？<a href="#" onclick="showAuthModal(\'login\'); return false;">登录</a>'}
            </div>
        </div>
    `;
    document.body.appendChild(modal);
}

function closeAuthModal() {
    const modal = document.getElementById('authModal');
    if (modal) modal.remove();
}

async function handleAuthSubmit(event, type) {
    event.preventDefault();
    const email = document.getElementById('authEmail').value;
    const password = document.getElementById('authPassword').value;
    const nickname = document.getElementById('authNickname')?.value;

    const submitBtn = document.querySelector('.auth-submit');
    submitBtn.disabled = true;
    submitBtn.textContent = '处理中...';

    try {
        if (type === 'register') {
            await api('/api/register', {
                method: 'POST',
                body: JSON.stringify({ email, password, nickname }),
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
