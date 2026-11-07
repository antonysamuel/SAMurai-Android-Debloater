#!/bin/bash
cd "$(dirname "$0")"

echo ""
echo "  ╔══════════════════════════════════╗"
echo "  ║          SAMurai v3.0            ║"
echo "  ╚══════════════════════════════════╝"
echo ""

# Check Python
if ! command -v python3 &> /dev/null; then
    echo "  ✗ Python 3 not found."
    echo "  Install from: https://www.python.org/downloads/"
    echo ""
    read -p "  Press Enter to exit..."
    exit 1
fi
echo "  ✓ Python 3 found"

# Check ADB
if ! command -v adb &> /dev/null; then
    echo "  ✗ ADB not found."
    echo ""
    if command -v brew &> /dev/null; then
        echo "  Install with Homebrew:"
        echo "    brew install android-platform-tools"
    elif command -v apt &> /dev/null; then
        echo "  Install with apt:"
        echo "    sudo apt install adb"
    elif command -v dnf &> /dev/null; then
        echo "  Install with dnf:"
        echo "    sudo dnf install android-tools"
    elif command -v pacman &> /dev/null; then
        echo "  Install with pacman:"
        echo "    sudo pacman -S android-tools"
    fi
    echo ""
    echo "  Or download from:"
    echo "    https://developer.android.com/tools/releases/platform-tools"
    echo ""
    read -p "  Press Enter to exit..."
    exit 1
fi
echo "  ✓ ADB found"

# Start ADB server
adb start-server &> /dev/null
echo "  ✓ ADB server running"
echo ""
echo "  Starting web UI..."
echo "  Press Ctrl+C to stop"
echo ""

python3 debloater.py
