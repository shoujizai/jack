@echo off
chcp 65001 >nul
title 微修的Blog - 一键上线
cd /d "%~dp0"

echo ============================================================
echo   一键上线：提交 + 推送 + 部署接口
echo ============================================================
echo.

REM ---------- 第 1 步：提交 ----------
echo [1/3] 提交本地改动...
git add -A
git commit -m "feat: 后台管理系统（页面方块编辑 / 用户 / 评论）+ 安全加固 + 自动部署工作流" 2>nul
if errorlevel 1 (
    echo       没有需要提交的改动，跳过
) else (
    echo       已提交
)
echo.

REM ---------- 第 2 步：推送 ----------
echo [2/3] 推送到 GitHub...
git push
if errorlevel 1 (
    echo.
    echo       ✗ 推送失败。常见原因：
    echo         - 没联网
    echo         - SSH 密钥没配置（可以改用 GitHub Desktop 推送）
    echo       推送成功后再手动双击 部署后台.cmd
    echo.
    pause
    exit /b 1
)
echo       已推送
echo.

REM ---------- 第 3 步：部署接口 ----------
echo [3/3] 部署接口 Worker（需要 Cloudflare 登录）...
cd api
if not exist "node_modules\wrangler" (
    echo       首次运行，正在安装依赖，请稍等...
    call npm install --no-audit --no-fund
)
call .\node_modules\.bin\wrangler.cmd deploy
set DEPLOY_RESULT=%errorlevel%
cd ..
echo.

if %DEPLOY_RESULT% neq 0 (
    echo       ✗ 部署失败，可能是登录过期。给出两个办法：
    echo         A. 再双击一次本脚本，浏览器弹授权时点 Allow
    echo         B. 用网页粘贴：Cloudflare → Workers ^& Pages → blog
    echo            → 编辑代码 → 全选删除 → 粘贴 worker-dist\index.js → Deploy
    echo.
) else (
    echo       ✓ 部署成功
    echo.
)

echo ============================================================
echo   接下来：
echo   1) 若刚才是第一次推送，等 1 分钟让网页同步
echo   2) 打开 https://jacksjz.qzz.io/check.html 看是否全绿
echo   3) 打开 https://jacksjz.qzz.io/admin.html 进后台
echo ============================================================
pause
