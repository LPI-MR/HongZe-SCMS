@echo off
chcp 65001 >nul
title HongZe-SCMS 本地预览服务器
cd /d "%~dp0"
echo ================================================
echo    HongZe-SCMS 本地预览服务器
echo    地址: http://localhost:8000
echo    请保持本窗口开启，关闭窗口即停止服务器
echo ================================================
npx serve -l 8000 .
pause
