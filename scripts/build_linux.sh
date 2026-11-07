#!/usr/bin/env bash
# ==============================================================================
# Build Linux standalone binary and AppImage for SAMurai
# ==============================================================================
set -e

cd "$(dirname "$0")/.."

echo "==> Verifying Python and dependencies..."
python3 -m pip install --upgrade pyinstaller pywebview

echo "==> Cleaning previous builds..."
rm -rf build dist AppDir

echo "==> Running PyInstaller build..."
pyinstaller --clean --noconfirm samurai.spec

echo "==> Constructing AppDir structure for AppImage..."
mkdir -p AppDir/usr/bin
mkdir -p AppDir/usr/share/icons/hicolor/256x256/apps
mkdir -p AppDir/usr/share/applications

cp -R dist/SAMurai/* AppDir/usr/bin/

# Create AppRun script
cat << 'EOF' > AppDir/AppRun
#!/bin/sh
HERE="$(dirname "$(readlink -f "${0}")")"
exec "${HERE}/usr/bin/SAMurai" "$@"
EOF
chmod +x AppDir/AppRun

# Desktop integration entry
cat << 'EOF' > AppDir/samurai.desktop
[Desktop Entry]
Name=SAMurai
Comment=AI-Powered Android Debloater & Optimizer
Exec=SAMurai
Icon=samurai
Terminal=false
Type=Application
Categories=Utility;System;
EOF
cp AppDir/samurai.desktop AppDir/usr/share/applications/

# Placeholder icon if assets doesn't have an icon yet
if [ -f "assets/icon.png" ]; then
    cp assets/icon.png AppDir/samurai.png
    cp assets/icon.png AppDir/usr/share/icons/hicolor/256x256/apps/samurai.png
else
    # Copy any preview image as fallback icon
    cp assets/dashboard.png AppDir/samurai.png
fi

# Download appimagetool if not locally available
if ! command -v appimagetool >/dev/null 2>&1; then
    echo "==> Downloading appimagetool..."
    curl -Ls -o appimagetool https://github.com/AppImage/AppImageKit/releases/download/13/appimagetool-x86_64.AppImage
    chmod +x appimagetool
    ARCH=x86_64 ./appimagetool --appimage-extract-and-run AppDir dist/SAMurai-x86_64.AppImage
    rm -f appimagetool
else
    ARCH=x86_64 appimagetool AppDir dist/SAMurai-x86_64.AppImage
fi

echo ""
echo "✓ Build complete!"
echo "  Linux AppImage: dist/SAMurai-x86_64.AppImage"
