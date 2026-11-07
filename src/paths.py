"""Centralized application and user data path resolution.

Handles path resolution for:
1. Normal source runs (`python3 debloater.py`)
2. Frozen binary runs (PyInstaller `_MEIPASS` or standalone bundle)
3. User-writable data directories (Application Support / XDG_DATA_HOME / APPDATA)
"""
import os
import sys
from pathlib import Path

# Detect if running as a compiled PyInstaller bundle
IS_FROZEN = getattr(sys, "frozen", False)

if IS_FROZEN:
    # PyInstaller extracts resources to _MEIPASS
    APP_DIR = Path(getattr(sys, "_MEIPASS", os.path.dirname(os.path.abspath(__file__))))
else:
    # Standard repository layout: parent of src/
    APP_DIR = Path(__file__).resolve().parent.parent

WEB_DIR = APP_DIR / "web"
STATIC_DATA_DIR = APP_DIR / "data"

# Determine user-writable data directory
def _resolve_user_data_dir() -> Path:
    if sys.platform == "darwin":
        base = Path.home() / "Library" / "Application Support" / "SAMurai"
    elif sys.platform == "win32":
        appdata = os.environ.get("APPDATA")
        base = Path(appdata) / "SAMurai" if appdata else Path.home() / ".samurai"
    else:
        # Linux / BSD (XDG specification)
        xdg_data = os.environ.get("XDG_DATA_HOME")
        if xdg_data:
            base = Path(xdg_data) / "samurai"
        else:
            base = Path.home() / ".local" / "share" / "samurai"
    return base

USER_DATA_DIR = _resolve_user_data_dir()


def get_data_file_path(filename: str) -> Path:
    """Return path to data file, checking user data dir first, then static bundled fallback."""
    # If a user modified version exists in user data, prefer it
    user_file = USER_DATA_DIR / filename
    if user_file.exists():
        return user_file

    # If running from source and local repo has file, use local repo
    if not IS_FROZEN:
        local_file = STATIC_DATA_DIR / filename
        if local_file.exists():
            return local_file

    # In frozen bundle, fall back to bundled asset
    bundled_file = STATIC_DATA_DIR / filename
    if bundled_file.exists():
        return bundled_file

    # Fallback to user location even if not yet created
    return user_file


def save_data_file(filename: str, content: str) -> Path:
    """Save user data file into writable user directory (or local repo if in dev mode)."""
    if not IS_FROZEN:
        # In development mode from git clone, save to local data/ directory if writable
        try:
            STATIC_DATA_DIR.mkdir(parents=True, exist_ok=True)
            target = STATIC_DATA_DIR / filename
            target.write_text(content, encoding="utf-8")
            return target
        except (PermissionError, OSError):
            pass

    # In packaged mode (or read-only clone), write to user data dir
    USER_DATA_DIR.mkdir(parents=True, exist_ok=True)
    target = USER_DATA_DIR / filename
    target.write_text(content, encoding="utf-8")
    return target


def get_ai_config_path() -> Path:
    """Return path for .ai_config.json."""
    if not IS_FROZEN:
        local_config = APP_DIR / ".ai_config.json"
        if local_config.exists() or os.access(APP_DIR, os.W_OK):
            return local_config

    user_config = USER_DATA_DIR / ".ai_config.json"
    return user_config
