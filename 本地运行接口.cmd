@echo off
chcp 65001 >nul
title 微修的Blog - 本地接口（测试后台）
cd /d "%~dp0"

echo ============================================================
echo   本地接口（只在你电脑上跑，不需要 Cloudflare 登录）
echo ============================================================
echo.
echo   接口地址：http://127.0.0.1:8787
echo   后台地址：http://127.0.0.1:8848/admin.html?api=http://127.0.0.1:8787
echo.
echo   说明：
echo   - 数据存在 .local-data\admin.db（独立数据库，不动线上）
echo   - 第一次用：在后台登录框填管理员邮箱+密码，点「首次使用：注册」
echo   - 表会自动创建；想清空就删掉 .local-data 目录
echo   - 关掉这个窗口就停止
echo.

where node >nul 2>nul
if errorlevel 1 (
    echo   ✗ 没检测到 Node.js，请先安装：https://nodejs.org
    pause
    exit /b 1
)

node tools\local-server.mjs

echo.
echo   本地接口已停止。
pause
