@echo off
chcp 65001 >nul
echo ============================================================
echo B站视频ASR文本提取工具 - Node.js版
echo ============================================================
echo.

REM 检查Node.js是否安装
where node >nul 2>&1
if errorlevel 1 (
    echo ❌ 未检测到Node.js
    echo.
    echo 请先安装Node.js：https://nodejs.org/
    echo 安装完成后重新运行此脚本
    pause
    exit /b 1
)

echo ✓ Node.js已安装
node --version
echo.

REM 检查是否已安装依赖
if not exist "node_modules" (
    echo 📦 首次运行，正在安装依赖...
    echo.
    call npm install
    echo.
)

echo 🚀 正在启动服务...
echo.
node server.js
pause
