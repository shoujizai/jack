/* ==========================================================================
   微修的 Blog — 公共交互脚本
   导航抽屉、返回顶部、图片灯箱、当前页高亮、版权年份
   轻量实现，无依赖，defer 加载
   ========================================================================== */
(function () {
    'use strict';

    var body = document.body;

    /* ---------- 1. 导航抽屉（左上角悬浮面板） ---------- */
    var menuToggle = document.getElementById('menuToggle');
    var navLinks = document.getElementById('navLinks');
    var navBackdrop = null;

    function showNavBackdrop() {
        if (navBackdrop) return;
        navBackdrop = document.createElement('div');
        navBackdrop.className = 'nav-backdrop';
        navBackdrop.addEventListener('click', closeNav);
        document.body.appendChild(navBackdrop);
        requestAnimationFrame(function () {
            if (navBackdrop) navBackdrop.classList.add('visible');
        });
    }

    function hideNavBackdrop() {
        if (!navBackdrop) return;
        var el = navBackdrop;
        navBackdrop = null;
        el.classList.remove('visible');
        window.setTimeout(function () {
            el.remove();
        }, 220);
    }

    function closeNav() {
        hideNavBackdrop();
        if (!navLinks || !navLinks.classList.contains('active')) return;
        navLinks.classList.remove('active');
        if (menuToggle) {
            menuToggle.classList.remove('active');
            menuToggle.setAttribute('aria-expanded', 'false');
            menuToggle.setAttribute('aria-label', '打开菜单');
        }
        body.classList.remove('nav-open');
    }

    function openNav() {
        if (!navLinks) return;
        navLinks.classList.add('active');
        showNavBackdrop();
        if (menuToggle) {
            menuToggle.classList.add('active');
            menuToggle.setAttribute('aria-expanded', 'true');
            menuToggle.setAttribute('aria-label', '关闭菜单');
        }
        body.classList.add('nav-open');
    }

    if (menuToggle && navLinks) {
        menuToggle.addEventListener('click', function (e) {
            e.stopPropagation();
            if (navLinks.classList.contains('active')) {
                closeNav();
            } else {
                openNav();
            }
        });

        // 点击导航项后自动收起（除非点击的是当前页）
        navLinks.addEventListener('click', function (e) {
            var link = e.target.closest('a');
            if (link) closeNav();
        });

        // 点击空白区域收起
        document.addEventListener('click', function (e) {
            if (!navLinks.classList.contains('active')) return;
            if (navLinks.contains(e.target) || menuToggle.contains(e.target)) return;
            closeNav();
        });

        // ESC 收起
        document.addEventListener('keydown', function (e) {
            if (e.key === 'Escape') {
                closeNav();
                closeLightbox();
            }
        });

        // 转横屏或放大窗口时复位
        window.addEventListener('resize', function () {
            if (window.innerWidth > 1080) closeNav();
        });
    }

    /* ---------- 2. 当前页高亮 ---------- */
    (function highlightCurrent() {
        var path = window.location.pathname.split('/').pop() || 'index.html';
        var links = document.querySelectorAll('#navLinks a');
        var hasActive = document.querySelector('#navLinks a.active');
        if (hasActive || !links.length) return;
        for (var i = 0; i < links.length; i++) {
            var href = (links[i].getAttribute('href') || '').split('/').pop();
            if (href && href === path) {
                links[i].classList.add('active');
                break;
            }
        }
    })();

    /* ---------- 3. 返回顶部 ---------- */
    var backToTop = document.getElementById('backToTop');
    if (backToTop) {
        var onScroll = function () {
            if (window.scrollY > 400) {
                backToTop.classList.add('visible');
            } else {
                backToTop.classList.remove('visible');
            }
        };
        window.addEventListener('scroll', onScroll, { passive: true });
        onScroll();
        backToTop.addEventListener('click', function () {
            window.scrollTo({ top: 0, behavior: 'smooth' });
        });
    }

    /* ---------- 4. 图片灯箱 ---------- */
    var lightbox = null;

    function closeLightbox() {
        if (!lightbox) return;
        lightbox.remove();
        lightbox = null;
        document.documentElement.style.overflow = '';
    }

    function openLightbox(src, alt) {
        closeLightbox();
        lightbox = document.createElement('div');
        lightbox.className = 'lightbox';
        lightbox.innerHTML =
            '<button class="lightbox-close" aria-label="关闭">&times;</button>' +
            '<img alt="' + (alt || '') + '" src="' + src + '">';
        lightbox.addEventListener('click', function (e) {
            if (e.target === lightbox || e.target.classList.contains('lightbox-close')) {
                closeLightbox();
            }
        });
        body.appendChild(lightbox);
        document.documentElement.style.overflow = 'hidden';
    }

    // 兼容旧页面的 onclick="openModal(this.src)"
    window.openModal = function (src) {
        openLightbox(src, '');
    };
    window.closeModal = closeLightbox;

    // 正文里的图片默认支持点击放大
    document.querySelectorAll('.content-section img').forEach(function (img) {
        if (img.dataset.noZoom === 'true') return;
        img.style.cursor = 'zoom-in';
        img.addEventListener('click', function () {
            openLightbox(img.dataset.full || img.currentSrc || img.src, img.alt || '');
        });
    });

    /* ---------- 5. FAQ 手风琴 ---------- */
    document.querySelectorAll('.faq-question').forEach(function (question) {
        var item = question.closest('.faq-item');
        var answer = item ? item.querySelector('.faq-answer') : null;
        if (!item || !answer) return;

        var setOpen = function (open) {
            item.classList.toggle('open', open);
            answer.classList.toggle('active', open);
            question.setAttribute('aria-expanded', open ? 'true' : 'false');
        };

        question.setAttribute('role', 'button');
        question.setAttribute('tabindex', '0');
        question.setAttribute('aria-expanded', 'false');

        question.addEventListener('click', function () {
            setOpen(!item.classList.contains('open'));
        });

        question.addEventListener('keydown', function (e) {
            if (e.key === 'Enter' || e.key === ' ') {
                e.preventDefault();
                setOpen(!item.classList.contains('open'));
            }
        });
    });

    /* ---------- 6. 版权年份 ---------- */
    var yearEls = document.querySelectorAll('[data-current-year]');
    yearEls.forEach(function (el) {
        el.textContent = new Date().getFullYear();
    });

    /* ---------- 7. 图片加载失败降级 ---------- */
    document.addEventListener(
        'error',
        function (e) {
            var el = e.target;
            if (el && el.tagName === 'IMG' && !el.dataset.fallback) {
                el.dataset.fallback = '1';
                el.style.opacity = '0.4';
            }
        },
        true
    );
})();

/* ===== 悬浮 AI 助手（AI_FLOAT_V1） ===== */
(function () {
    if (location.pathname.indexOf('admin') !== -1) return;

    var API = (window.API_BASE || 'https://api.jacksjz.qzz.io');
    var history = [];
    var panel = null;
    var box = null;
    var input = null;

    function build() {
        var btn = document.createElement('button');
        btn.id = 'aiFloatBtn';
        btn.type = 'button';
        btn.textContent = '💬';
        btn.title = '问 AI';
        btn.style.cssText =
            'position:fixed;right:16px;bottom:calc(18px + env(safe-area-inset-bottom));z-index:4000;' +
            'width:52px;height:52px;border-radius:50%;border:none;cursor:pointer;font-size:22px;' +
            'background:linear-gradient(160deg,#007AFF,#5856D6);color:#fff;box-shadow:0 8px 24px rgba(0,122,255,.35);';
        btn.onclick = toggle;
        document.body.appendChild(btn);

        panel = document.createElement('div');
        panel.id = 'aiFloatPanel';
        panel.style.cssText =
            'position:fixed;right:16px;bottom:calc(80px + env(safe-area-inset-bottom));z-index:4000;' +
            'width:min(360px,calc(100vw - 32px));height:min(480px,70vh);display:none;flex-direction:column;' +
            'background:#FFFFFF;border:1px solid rgba(0,0,0,.10);border-radius:16px;box-shadow:0 16px 48px rgba(0,0,0,.28);overflow:hidden;';
        panel.innerHTML =
            '<div style="display:flex;align-items:center;gap:8px;padding:12px 14px;border-bottom:.5px solid var(--separator,#e5e5ea);">' +
            '<b style="flex:1;font-size:15px;">AI 助手</b>' +
            '<button id="aiFloatClose" style="border:none;background:transparent;font-size:18px;cursor:pointer;color:var(--label-2,#8e8e93);">✕</button>' +
            '</div>' +
            '<div id="aiFloatMsgs" style="flex:1;overflow-y:auto;padding:12px;display:flex;flex-direction:column;gap:8px;background:#F7F7FA;"></div>' +
            '<div style="display:flex;gap:6px;padding:10px;border-top:.5px solid var(--separator,#e5e5ea);">' +
            '<input id="aiFloatInput" placeholder="输入问题…" style="flex:1;border:none;background:var(--fill-2,#f2f2f7);border-radius:10px;padding:9px 11px;font:inherit;font-size:14px;color:var(--label,#000);" />' +
            '<button id="aiFloatSend" style="border:none;background:var(--blue,#007AFF);color:#fff;border-radius:10px;padding:0 14px;cursor:pointer;font-size:14px;">发送</button>' +
            '</div>';
        document.body.appendChild(panel);

        box = panel.querySelector('#aiFloatMsgs');
        input = panel.querySelector('#aiFloatInput');
        panel.querySelector('#aiFloatClose').onclick = toggle;
        panel.querySelector('#aiFloatSend').onclick = send;
        input.addEventListener('keydown', function (e) {
            if (e.key === 'Enter' && !e.shiftKey) { e.preventDefault(); send(); }
        });
    }

    function bubble(text, mine) {
        var d = document.createElement('div');
        d.textContent = text;
        d.style.cssText =
            'max-width:82%;padding:8px 11px;border-radius:13px;font-size:14px;line-height:1.5;white-space:pre-wrap;word-break:break-word;' +
            (mine
                ? 'align-self:flex-end;background:var(--blue,#007AFF);color:#fff;border-bottom-right-radius:4px;'
                : 'align-self:flex-start;background:#FFFFFF;border:1px solid rgba(0,0,0,.10);color:#1C1C1E;border-bottom-left-radius:4px;');
        box.appendChild(d);
        box.scrollTop = box.scrollHeight;
        return d;
    }

    function send() {
        var text = (input.value || '').trim();
        if (!text) return;
        input.value = '';
        bubble(text, true);
        history.push({ role: 'user', content: text });
        var loading = bubble('正在思考…', false);
        fetch(API + '/api/ai', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ messages: history }),
        })
            .then(function (r) { return r.json().then(function (d) { return { ok: r.ok, d: d }; }); })
            .then(function (res) {
                loading.remove();
                if (res.ok && res.d.reply) {
                    bubble(res.d.reply, false);
                    history.push({ role: 'assistant', content: res.d.reply });
                } else {
                    bubble((res.d && res.d.error) || 'AI 暂时不可用', false);
                }
            })
            .catch(function () { loading.remove(); bubble('网络错误，请稍后再试', false); });
    }

    function toggle() {
        if (!panel) return;
        if (panel.style.display === 'none' || !panel.style.display) {
            panel.style.display = 'flex';
            if (!box.childElementCount) bubble('你好，有什么想问的？安装、大气层、模拟器都可以。', false);
            setTimeout(function () { input.focus(); }, 50);
        } else {
            panel.style.display = 'none';
        }
    }

    if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', build);
    else build();
})();

/* ===== 访问上报（VISIT_HIT_V1）===== */
(function () {
    try {
        var key = 'hit_sent_' + new Date().toISOString().slice(0, 10);
        if (sessionStorage.getItem(key)) return;
        sessionStorage.setItem(key, '1');
        fetch((window.API_BASE || 'https://api.jacksjz.qzz.io') + '/api/hit', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ source: 'web' }),
        }).catch(function () {});
    } catch (e) {}
})();
