@echo off
chcp 65001 >nul
cd /d "%~dp0"
where node >nul 2>nul
if errorlevel 1 (
  echo 请先安装 Node.js 22.13 或更高版本，然后重新打开本文件。
  pause
  exit /b 1
)
if not exist node_modules\typescript\bin\tsc (
  echo 首次启动，正在安装依赖...
  call npm install --no-audit --no-fund
  if errorlevel 1 (
    echo 依赖安装失败。请检查网络后重试。
    pause
    exit /b 1
  )
)
echo 即将启动 Lecture2Notes。请在浏览器打开 http://127.0.0.1:5173/notes
echo 保持此窗口运行；关闭窗口会停止本地服务。
call npm run dev
pause
