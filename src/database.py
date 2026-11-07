"""Package database loading and persistence."""
import json
import os
import ssl
import threading
import time
import urllib.request
from pathlib import Path

from src.paths import get_data_file_path, save_data_file

UAD_URL = "https://raw.githubusercontent.com/Universal-Debloater-Alliance/universal-android-debloater-next-generation/main/resources/assets/uad_lists.json"

UAD_RISK_MAP = {"Recommended": "safe", "Advanced": "caution", "Expert": "caution", "Unsafe": "dangerous"}
UAD_CAT_MAP = {"Oem": "OEM Bloatware", "Aosp": "System (AOSP)", "Google": "Google", "Carrier": "Carrier Bloatware", "Misc": "Misc"}

UAD_MAX_AGE = 86400  # re-fetch if older than 24 hours
_uad_sync_lock = threading.Lock()
_uad_syncing = False


def _load_json(filename, default=None):
    path = get_data_file_path(filename)
    if path.exists():
        try:
            return json.loads(path.read_text(encoding="utf-8"))
        except Exception:
            pass
    return default if default is not None else {}


def _save_json(filename, data):
    save_data_file(filename, json.dumps(data, indent=2, ensure_ascii=False))


def sync_uad_list():
    """Download latest UAD list from GitHub and convert to our format."""
    ctx = ssl.create_default_context()
    ctx.check_hostname = False
    ctx.verify_mode = ssl.CERT_NONE
    try:
        req = urllib.request.Request(UAD_URL, headers={"User-Agent": "SAMurai/3.0"})
        with urllib.request.urlopen(req, context=ctx, timeout=120) as resp:
            raw = json.loads(resp.read())
    except Exception as e:
        return {"success": False, "message": f"Download failed: {e}"}

    converted = {}
    for pkg_id, info in raw.items():
        removal = info.get("removal", "Advanced")
        lst = info.get("list", "Misc")
        desc = info.get("description", "").split("\n")[0][:200]
        parts = pkg_id.split(".")
        name = parts[-1].replace("_", " ").replace("-", " ").title() if len(parts) >= 3 else pkg_id
        converted[pkg_id] = {
            "name": name,
            "category": UAD_CAT_MAP.get(lst, lst),
            "risk": UAD_RISK_MAP.get(removal, "caution"),
            "desc": desc,
            "uad_removal": removal,
            "uad_list": lst,
        }

    _save_json("uad.json", converted)
    return {"success": True, "message": f"Synced {len(converted)} packages from UAD", "count": len(converted)}


BRAND_PACKAGES = _load_json("brands.json", {})
PACKAGE_DB = _load_json("packages.json", {})
UAD_DB = _load_json("uad.json", {})
PRESETS = _load_json("presets.json", {})


def reload_databases():
    """Reload all databases from disk — call after editing JSON files."""
    global BRAND_PACKAGES, PACKAGE_DB, UAD_DB, PRESETS
    BRAND_PACKAGES = _load_json("brands.json", {})
    PACKAGE_DB = _load_json("packages.json", {})
    UAD_DB = _load_json("uad.json", {})
    PRESETS = _load_json("presets.json", {})


def _uad_is_stale():
    """Check if uad.json is missing or older than UAD_MAX_AGE."""
    path = get_data_file_path("uad.json")
    if not path.exists():
        return True
    try:
        age = time.time() - os.path.getmtime(path)
        return age > UAD_MAX_AGE
    except Exception:
        return True


def _background_sync_uad():
    """Run sync_uad_list in background, then reload UAD_DB."""
    global UAD_DB, _uad_syncing
    with _uad_sync_lock:
        if _uad_syncing:
            return
        _uad_syncing = True
    try:
        result = sync_uad_list()
        if result.get("success"):
            UAD_DB = _load_json("uad.json", {})
    finally:
        with _uad_sync_lock:
            _uad_syncing = False


def ensure_uad_fresh():
    """Trigger background UAD sync if the list is stale. Non-blocking."""
    if _uad_is_stale() and not _uad_syncing:
        t = threading.Thread(target=_background_sync_uad, daemon=True)
        t.start()
