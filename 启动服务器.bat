@echo off
chcp 65001 >nul
title HongZe-SCMS 服务器（含数据同步）
cd /d "%~dp0"
echo ================================================
echo    HongZe-SCMS 服务器（含数据同步）
echo    地址: http://localhost:8000
echo    局域网访问: http://本机IP:8000
echo    同步数据: server\data.json（合同/模板全量落盘）
echo    请保持本窗口开启，关闭窗口即停止服务器
echo ================================================
node server\server.js
pause
