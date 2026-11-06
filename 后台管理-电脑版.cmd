@echo off
chcp 65001 >nul
title 微修 Blog - 后台管理（电脑版）

REM 用 Edge/Chrome 的"应用模式"打开：独立窗口、没有地址栏、没有标签页
REM 相当于一个桌面程序；想更彻底可以点脚本里的说明在浏览器里"安装应用"

set "URL=https://jacksjz.qzz.io/admin.html"

set "EDGE=%ProgramFiles(x86)%\Microsoft\Edge\Application\msedge.exe"
if not exist "%EDGE%" set "EDGE=%ProgramFiles%\Microsoft\Edge\Application\msedge.exe"
if exist "%EDGE%" (
    start "" "%EDGE%" --app=%URL%
    exit /b
)

set "CHROME=%ProgramFiles%\Google\Chrome\Application\chrome.exe"
if not exist "%CHROME%" set "CHROME=%ProgramFiles(x86)%\Google\Chrome\Application\chrome.exe"
if exist "%CHROME%" (
    start "" "%CHROME%" --app=%URL%
    exit /b
)

echo 没找到 Edge 或 Chrome，用默认浏览器打开。
start "" "%URL%"
