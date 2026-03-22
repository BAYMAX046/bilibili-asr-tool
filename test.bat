@echo off
chcp 65001 >nul
echo 正在测试Python环境...
echo.
echo 1. 检查Python版本：
python --version
echo.
echo 2. 检查Flask安装：
python -c "import flask; print('Flask已安装，版本:', flask.__version__)"
echo.
echo 3. 检查requests安装：
python -c "import requests; print('requests已安装，版本:', requests.__version__)"
echo.
echo ============================================================
echo 如果以上都显示正常，请运行 start.bat 启动服务
echo ============================================================
pause
