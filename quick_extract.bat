@echo off
chcp 65001 >nul
echo.
set /p url="请输入B站视频链接或BV号: "
echo.
python extract.py "%url%"
echo.
pause
