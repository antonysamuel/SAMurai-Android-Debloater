#!/usr/bin/env bash
# ==============================================================================
# Build macOS .app bundle and standalone .dmg installer for SAMurai
# ==============================================================================
set -e

cd "$(dirname "$0")/.."

echo "==> Verifying Python environment..."
python3 -m pip install --upgrade pyinstaller pywebview

echo "==> Cleaning previous build artifacts..."
rm -rf build dist

echo "==> Running PyInstaller build with samurai.spec..."
pyinstaller --clean --noconfirm samurai.spec

if [ ! -d "dist/SAMurai.app" ]; then
    echo "Error: dist/SAMurai.app was not created!"
    exit 1
fi

echo "==> Packaging SAMurai.dmg..."
DMG_NAME="dist/SAMurai-macOS.dmg"
rm -f "$DMG_NAME"

# Create disk image containing SAMurai.app and a link to /Applications
mkdir -p dist/dmg_staging
cp -R dist/SAMurai.app dist/dmg_staging/
ln -s /Applications dist/dmg_staging/Applications

hdiutil create -volname "SAMurai" -srcfolder dist/dmg_staging -ov -format UDZO "$DMG_NAME"
rm -rf dist/dmg_staging

echo ""
echo "✓ Build complete!"
echo "  Application bundle: dist/SAMurai.app"
echo "  DMG Installer:      dist/SAMurai-macOS.dmg"
