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
