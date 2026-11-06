@echo off
chcp 65001 >nul
title 微修的Blog - 部署后台
cd /d "%~dp0api"

echo ============================================
echo   微修的Blog 后台部署（自动完成两步）
echo ============================================
echo.
echo 数据库表会在 Worker 第一次被访问时自动创建，
echo 所以这里不需要手动跑任何 SQL。
echo.

echo [1/2] 登录 Cloudflare（会打开浏览器，点 Allow / 允许）
echo       已经登录过的话会直接跳过
call .\node_modules\.bin\wrangler.cmd login
echo.

echo [2/2] 部署 Worker（上线后台管理接口）
call .\node_modules\.bin\wrangler.cmd deploy
echo.

echo ============================================
echo   完成！接下来：
echo   1) GitHub Desktop 里 Commit + Push（上传 admin.html / page.html 等）
echo   2) 打开 https://jacksjz.qzz.io/check.html 看是否全绿
echo   3) 打开 https://jacksjz.qzz.io/admin.html 登录后台
echo ============================================
pause
