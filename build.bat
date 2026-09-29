@echo off
chcp 65001 >nul
echo ======================================================================
echo   TransFiler 制造业文档双语智能转换系统 - 全流程一键打包与安装包制作
echo ======================================================================
echo.

echo [1/4] 检查 Python 环境...
python --version >nul 2>&1
if errorlevel 1 (
    echo [错误] 未检测到 Python，请先安装 Python 并添加至 PATH。
    pause
    exit /b 1
)

echo [2/4] 正在编译 TransFiler 主程序 (TransFiler.exe)...
python -m PyInstaller --clean transfiler.spec
if errorlevel 1 (
    echo [错误] 主程序打包失败！
    pause
    exit /b 1
)

echo.
echo [3/4] 正在编译独立卸载程序 (uninstall.exe)...
python -m PyInstaller --onefile --noconsole --name "uninstall" --icon "app_icon.ico" --distpath "dist" installer/uninstall_gui.py
if errorlevel 1 (
    echo [错误] 卸载程序编译失败！
    pause
    exit /b 1
)

echo.
echo [4/4] 正在生成完整 Windows 图形化安装向导 (TransFiler_v1.2.6_Setup.exe)...
python -m PyInstaller --clean --distpath "dist_installer" installer_build.spec
if errorlevel 1 (
    echo [错误] 安装包生成失败！
    pause
    exit /b 1
)

echo.
echo ======================================================================
echo   🎉 全部编译完成！成果物清单：
echo.
echo   1. 完整安装向导包: dist_installer\TransFiler_v1.2.6_Setup.exe
echo   2. 单文件绿色免安装版: dist\TransFiler.exe
echo   3. 独立卸载程序: dist\uninstall.exe
echo ======================================================================
echo.
pause
