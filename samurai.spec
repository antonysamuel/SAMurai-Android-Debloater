# -*- mode: python ; coding: utf-8 -*-
"""PyInstaller build specification for SAMurai.

Produces:
- On macOS: SAMurai.app (GUI bundle)
- On Linux / Windows: Standalone directory / binary executable
"""
import os
import sys

block_cipher = None

# Bundle static assets (HTML/CSS/JS) and default package databases
datas = [
    ('web', 'web'),
    ('data', 'data'),
]

hiddenimports = [
    'src',
    'src.paths',
    'src.adb',
    'src.ai',
    'src.battery',
    'src.database',
    'src.devices',
    'src.packages',
    'src.security',
    'src.server',
    'src.settings',
    'http.server',
    'urllib.request',
    'json',
    'ssl',
    'threading',
    'webbrowser',
    'socket',
    'shutil',
    'subprocess',
]

# Check if pywebview is installed and collect its GUI backends
try:
    from PyInstaller.utils.hooks import collect_submodules
    import webview
    hiddenimports += collect_submodules('webview')
except ImportError:
    pass

# Select appropriate platform icon
icon_file = None
if sys.platform == 'darwin' and os.path.exists('assets/icon.icns'):
    icon_file = 'assets/icon.icns'
elif os.path.exists('assets/icon_256.png'):
    icon_file = 'assets/icon_256.png'
elif os.path.exists('assets/icon.png'):
    icon_file = 'assets/icon.png'

a = Analysis(
    ['debloater.py'],
    pathex=[],
    binaries=[],
    datas=datas,
    hiddenimports=hiddenimports,
    hookspath=[],
    hooksconfig={},
    runtime_hooks=[],
    excludes=['tkinter', 'matplotlib', 'numpy', 'scipy', 'pandas'],
    win_no_prefer_redirects=False,
    win_private_assemblies=False,
    cipher=block_cipher,
    noarchive=False,
)

pyz = PYZ(a.pure, a.zipped_data, cipher=block_cipher)

exe = EXE(
    pyz,
    a.scripts,
    [],
    exclude_binaries=True,
    name='SAMurai',
    debug=False,
    bootloader_ignore_signals=False,
    strip=False,
    upx=True,
    console=False,
    icon=icon_file,
    disable_windowed_traceback=False,
    argv_emulation=False,
    target_arch=None,
    codesign_identity=None,
    entitlements_file=None,
)

coll = COLLECT(
    exe,
    a.binaries,
    a.zipfiles,
    a.datas,
    strip=False,
    upx=True,
    upx_exclude=[],
    name='SAMurai',
)

if sys.platform == 'darwin':
    app = BUNDLE(
        coll,
        name='SAMurai.app',
        icon=icon_file,
        bundle_identifier='com.antonysamuel.samurai',
        info_plist={
            'CFBundleName': 'SAMurai',
            'CFBundleDisplayName': 'SAMurai',
            'CFBundleIdentifier': 'com.antonysamuel.samurai',
            'CFBundleVersion': '3.2.0',
            'CFBundleShortVersionString': '3.2.0',
            'NSHighResolutionCapable': True,
            'LSApplicationCategoryType': 'public.app-category.utilities',
        },
    )
