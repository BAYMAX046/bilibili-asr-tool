@echo off
chcp 65001 >nul
echo ============================================================
echo B站视频ASR文本提取工具
echo ============================================================
echo.
echo 正在检查Python环境...
where python
echo.
echo 正在启动服务...
echo.
python app.py
if errorlevel 1 (
    echo.
    echo ============================================================
    echo 错误：服务启动失败！
    echo ============================================================
    echo 请检查：
    echo 1. 是否已安装Python
    echo 2. Python是否在环境变量中
    echo 3. 是否已安装依赖：pip install -r requirements.txt
    echo ============================================================
)
pause



