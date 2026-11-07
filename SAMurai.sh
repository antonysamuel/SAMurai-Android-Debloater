#!/usr/bin/env bash
# ==============================================================================
# SAMurai — Universal Startup & Launcher Script
# Auto-detects OS, resolves ADB & Python/uv, and launches the web interface.
# ==============================================================================

set -e

# Change directory to script location
cd "$(dirname "$0")"

# Configure Colors if running in a terminal
if [ -t 1 ]; then
    CYAN='\033[0;36m'
    GREEN='\033[0;32m'
    YELLOW='\033[1;33m'
    RED='\033[0;31m'
    BOLD='\033[1m'
    DIM='\033[2m'
    RESET='\033[0m'
else
    CYAN=''
    GREEN=''
    YELLOW=''
    RED=''
    BOLD=''
    DIM=''
    RESET=''
fi

# ── 1. OS & Architecture Detection ──────────────────────────────────────────
UNAME_S="$(uname -s 2>/dev/null || echo "Unknown")"
UNAME_M="$(uname -m 2>/dev/null || echo "unknown")"

case "$UNAME_S" in
    Darwin*) OS_TYPE="macOS" ;;
    Linux*)  OS_TYPE="Linux" ;;
    MINGW*|MSYS*|CYGWIN*) OS_TYPE="Windows (Emulated/Bash)" ;;
    *)       OS_TYPE="$UNAME_S" ;;
esac

echo ""
echo -e "${CYAN}${BOLD}  ╔══════════════════════════════════════════════════════╗${RESET}"
echo -e "${CYAN}${BOLD}  ║          SAMurai v3.2 — Android Debloater            ║${RESET}"
echo -e "${CYAN}${BOLD}  ╚══════════════════════════════════════════════════════╝${RESET}"
echo -e "${DIM}  Platform: ${OS_TYPE} (${UNAME_M})${RESET}"
echo ""

# ── 2. Smart ADB Discovery ──────────────────────────────────────────────────
FOUND_ADB=""

if command -v adb >/dev/null 2>&1; then
    FOUND_ADB="$(command -v adb)"
    echo -e "  ${GREEN}✓${RESET} ADB found in PATH ${DIM}(${FOUND_ADB})${RESET}"
else
    # Search common Android SDK locations
    POSSIBLE_ADB_PATHS=(
        "$HOME/Library/Android/sdk/platform-tools/adb"
        "/opt/homebrew/bin/adb"
        "/usr/local/bin/adb"
        "$HOME/Android/Sdk/platform-tools/adb"
        "$HOME/.android-sdk/platform-tools/adb"
        "/usr/lib/android-sdk/platform-tools/adb"
        "/usr/bin/adb"
        "$LOCALAPPDATA/Android/Sdk/platform-tools/adb.exe"
        "/mnt/c/Users/$USER/AppData/Local/Android/Sdk/platform-tools/adb.exe"
    )

    for CANDIDATE in "${POSSIBLE_ADB_PATHS[@]}"; do
        if [ -n "$CANDIDATE" ] && [ -f "$CANDIDATE" ] && [ -x "$CANDIDATE" ]; then
            FOUND_ADB="$CANDIDATE"
            ADB_DIR="$(dirname "$CANDIDATE")"
            export PATH="$ADB_DIR:$PATH"
            echo -e "  ${GREEN}✓${RESET} ADB auto-discovered in Android SDK: ${DIM}${FOUND_ADB}${RESET}"
            break
        fi
    done
fi

if [ -z "$FOUND_ADB" ]; then
    echo -e "  ${RED}✗ ADB (Android Debug Bridge) not found.${RESET}"
    echo ""
    if [ "$OS_TYPE" = "macOS" ] && command -v brew >/dev/null 2>&1; then
        echo -e "  ${YELLOW}→ Recommended install for macOS:${RESET}"
        echo -e "    ${BOLD}brew install android-platform-tools${RESET}"
        echo ""
        if [ -t 0 ]; then
            read -p "  Would you like to install it now via Homebrew? (y/N): " -r INSTALL_BREW_ADB
            if [[ "$INSTALL_BREW_ADB" =~ ^[Yy]$ ]]; then
                echo -e "  Running: brew install android-platform-tools..."
                brew install android-platform-tools
                FOUND_ADB="$(command -v adb || true)"
            fi
        fi
    elif [ "$OS_TYPE" = "Linux" ]; then
        echo -e "  ${YELLOW}→ Install ADB via your distribution's package manager:${RESET}"
        if command -v apt >/dev/null 2>&1; then
            echo -e "    ${BOLD}sudo apt update && sudo apt install -y adb${RESET}"
        elif command -v dnf >/dev/null 2>&1; then
            echo -e "    ${BOLD}sudo dnf install -y android-tools${RESET}"
        elif command -v pacman >/dev/null 2>&1; then
            echo -e "    ${BOLD}sudo pacman -S --noconfirm android-tools${RESET}"
        else
            echo -e "    Install ${BOLD}android-tools${RESET} or ${BOLD}adb${RESET} package."
        fi
    fi

    if [ -z "$FOUND_ADB" ] && ! command -v adb >/dev/null 2>&1; then
        echo ""
        echo -e "  Or manually download Android Platform Tools from:"
        echo -e "  ${CYAN}https://developer.android.com/tools/releases/platform-tools${RESET}"
        echo ""
        if [ -t 0 ]; then
            read -p "  Press Enter to exit..." -r
        fi
        exit 1
    fi
fi

# ── 3. Smart Python & uv Auto-Resolution ────────────────────────────────────
PYTHON_EXEC=""
PYTHON_DESC=""

# Check 1: python3
if command -v python3 >/dev/null 2>&1; then
    PY_VER="$(python3 -c 'import sys; print(f"{sys.version_info.major}.{sys.version_info.minor}")' 2>/dev/null || echo "")"
    if [ -n "$PY_VER" ]; then
        PY_MAJOR="${PY_VER%%.*}"
        PY_MINOR="${PY_VER##*.}"
        if [ "$PY_MAJOR" -ge 3 ] && [ "$PY_MINOR" -ge 6 ]; then
            PYTHON_EXEC="python3"
            PYTHON_DESC="Python 3 (v$PY_VER via $(command -v python3))"
        fi
    fi
fi

# Check 2: python (if python3 wasn't viable)
if [ -z "$PYTHON_EXEC" ] && command -v python >/dev/null 2>&1; then
    PY_VER="$(python -c 'import sys; print(f"{sys.version_info.major}.{sys.version_info.minor}")' 2>/dev/null || echo "")"
    if [ -n "$PY_VER" ]; then
        PY_MAJOR="${PY_VER%%.*}"
        if [ "$PY_MAJOR" -ge 3 ]; then
            PYTHON_EXEC="python"
            PYTHON_DESC="Python (v$PY_VER via $(command -v python))"
        fi
    fi
fi

# Check 3: uv (Astral's fast Python runner)
if [ -z "$PYTHON_EXEC" ]; then
    POSSIBLE_UV=(
        "uv"
        "$HOME/.local/bin/uv"
        "$HOME/.cargo/bin/uv"
        "/opt/homebrew/bin/uv"
        "/usr/local/bin/uv"
    )

    for UV_CANDIDATE in "${POSSIBLE_UV[@]}"; do
        if command -v "$UV_CANDIDATE" >/dev/null 2>&1; then
            UV_BIN="$(command -v "$UV_CANDIDATE")"
            PYTHON_EXEC="$UV_BIN run python"
            PYTHON_DESC="uv (Auto-provisioned Python via $UV_BIN)"
            break
        fi
    done
fi

# Fallback: Neither Python 3 nor uv was detected
if [ -z "$PYTHON_EXEC" ]; then
    echo -e "  ${YELLOW}⚠️ Neither Python 3 (>=3.6) nor uv was found on this system.${RESET}"
    echo ""

    INSTALLED_RUNNER=false

    # Offer to auto-install uv (fastest, requires zero sudo/root, works everywhere)
    if command -v curl >/dev/null 2>&1 && [ -t 0 ]; then
        echo -e "  ${CYAN}${BOLD}'uv'${RESET} is a standalone, ultra-fast Python manager from Astral."
        echo -e "  It installs in seconds, requires ${BOLD}no administrator/root privileges${RESET}, and runs SAMurai cleanly."
        echo ""
        read -p "  Would you like to auto-install 'uv' now? (Y/n): " -r INSTALL_UV_CHOICE
        INSTALL_UV_CHOICE=${INSTALL_UV_CHOICE:-Y}
        if [[ "$INSTALL_UV_CHOICE" =~ ^[Yy]$ ]]; then
            echo -e "  Installing uv..."
            curl -LsSf https://astral.sh/uv/install.sh | sh
            # Add to current shell PATH
            export PATH="$HOME/.local/bin:$HOME/.cargo/bin:$PATH"
            if command -v uv >/dev/null 2>&1; then
                PYTHON_EXEC="uv run python"
                PYTHON_DESC="uv (Installed to ~/.local/bin/uv)"
                INSTALLED_RUNNER=true
            fi
        fi
    fi

    # Alternative: Homebrew on macOS
    if [ "$INSTALLED_RUNNER" = false ] && [ "$OS_TYPE" = "macOS" ] && command -v brew >/dev/null 2>&1 && [ -t 0 ]; then
        read -p "  Would you like to install Python 3 via Homebrew? (Y/n): " -r INSTALL_BREW_PY
        INSTALL_BREW_PY=${INSTALL_BREW_PY:-Y}
        if [[ "$INSTALL_BREW_PY" =~ ^[Yy]$ ]]; then
            echo -e "  Running: brew install python3..."
            brew install python3
            if command -v python3 >/dev/null 2>&1; then
                PYTHON_EXEC="python3"
                PYTHON_DESC="Python 3 (Homebrew)"
                INSTALLED_RUNNER=true
            fi
        fi
    fi

    if [ -z "$PYTHON_EXEC" ]; then
        echo ""
        echo -e "  ${RED}✗ Cannot start SAMurai without Python 3 or uv.${RESET}"
        echo -e "  Please install Python 3 from: ${CYAN}https://www.python.org/downloads/${RESET}"
        echo -e "  Or install uv: ${CYAN}curl -LsSf https://astral.sh/uv/install.sh | sh${RESET}"
        echo ""
        if [ -t 0 ]; then
            read -p "  Press Enter to exit..." -r
        fi
        exit 1
    fi
fi

echo -e "  ${GREEN}✓${RESET} Runtime: ${BOLD}${PYTHON_DESC}${RESET}"

# ── 4. Start ADB Server ─────────────────────────────────────────────────────
if command -v adb >/dev/null 2>&1; then
    adb start-server >/dev/null 2>&1 || true
    echo -e "  ${GREEN}✓${RESET} ADB daemon verified & running"
fi

# ── 5. Port 8080 Check ──────────────────────────────────────────────────────
PORT=8080
if command -v lsof >/dev/null 2>&1; then
    if lsof -Pi :$PORT -sTCP:LISTEN -t >/dev/null 2>&1; then
        echo -e "  ${YELLOW}ℹ Note: Port $PORT is already in use.${RESET}"
        echo -e "  ${DIM}If SAMurai is already running, you can access it at http://127.0.0.1:$PORT${RESET}"
    fi
fi

# ── 6. Launch Application ───────────────────────────────────────────────────
echo ""
echo -e "  ${CYAN}Starting SAMurai web dashboard on http://127.0.0.1:$PORT...${RESET}"
echo -e "  ${DIM}Press Ctrl+C in this terminal to stop the server.${RESET}"
echo ""

exec $PYTHON_EXEC debloater.py "$@"
