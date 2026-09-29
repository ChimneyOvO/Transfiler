# -*- mode: python ; coding: utf-8 -*-
import os
import sys

block_cipher = None

# 打包安装所需的所有组件
datas = [
    ('dist/TransFiler.exe', '.'),
    ('dist/uninstall.exe', '.'),
    ('app_icon.ico', '.'),
    ('更新日志.md', '.'),
]

hiddenimports = [
    'winreg',
    'subprocess',
    'threading',
    'shutil',
    'tkinter',
    'tkinter.ttk',
    'tkinter.filedialog',
    'tkinter.messagebox',
]

a = Analysis(
    ['installer/setup_gui.py'],
    pathex=['.'],
    binaries=[],
    datas=datas,
    hiddenimports=hiddenimports,
    hookspath=[],
    hooksconfig={},
    runtime_hooks=[],
    excludes=['matplotlib', 'numpy', 'scipy', 'pandas', 'IPython', 'notebook'],
    win_no_prefer_redirects=False,
    win_private_assemblies=False,
    cipher=block_cipher,
    noarchive=False,
)

pyz = PYZ(a.pure, a.zipped_data, cipher=block_cipher)

exe = EXE(
    pyz,
    a.scripts,
    a.binaries,
    a.zipfiles,
    a.datas,
    [],
    name='TransFiler_v1.2.6_Setup',
    debug=False,
    bootloader_ignore_signals=False,
    strip=False,
    upx=False,
    upx_exclude=[],
    runtime_tmpdir=None,
    console=False,
    disable_windowed_traceback=False,
    argv_emulation=False,
    target_arch=None,
    codesign_identity=None,
    entitlements_file=None,
    icon='app_icon.ico',
)
