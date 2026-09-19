@echo off
chcp 65001 >nul
title 热区校正服务
cd /d "%~dp0"
echo ============================================
echo  热区校正服务（自动加载素材，脱离原始数据）
echo  浏览器将自动打开；Ctrl+C 停止
echo ============================================
echo.
python hotzone_serve.py --book 四年级_上册
echo.
pause
