"""Package management — listing, installing, removing, presets."""
from src.adb import run_adb, _shell
from src.database import PACKAGE_DB, BRAND_PACKAGES, UAD_DB, PRESETS, ensure_uad_fresh
from src.devices import detect_device_type, get_device_info
from src.battery import optimize_device


def classify_unknown(pkg_id):
    """Auto-classify unknown packages by package name patterns."""
    pkg = pkg_id.lower()
    if "samsung" in pkg or "sec.android" in pkg or "sem." in pkg:
        return "Samsung Services"
    if "google" in pkg or "android.gms" in pkg:
        return "Google"
    if "monotype" in pkg or "font" in pkg:
        return "Fonts"
    if "watchface" in pkg or "sree" in pkg:
        return "Watch Faces"
    if "health" in pkg or "shealth" in pkg or "fitness" in pkg:
        return "Health"
    if any(x in pkg for x in ["android.app.", "android.providers.", "android.server.", "com.android."]):
        return "System"
    if any(x in pkg for x in ["qualcomm", "qti.", "chipset"]):
        return "Hardware"
    return "User Apps"


def _lookup_package(pkg_id, merged_db):
    """Look up a package: custom DB > brand DB (merged) > UAD > heuristic."""
    info = merged_db.get(pkg_id)
    if info:
        source = "custom"
        if info.get("uad_removal"):
            source = "uad"
        return {
            "id": pkg_id,
            "name": info.get("name", pkg_id),
            "category": info.get("category", ""),
            "risk": info.get("risk", "unknown"),
            "desc": info.get("desc", ""),
            "source": source,
            "status": "enabled",
        }

    uad = UAD_DB.get(pkg_id)
    if uad:
        return {
            "id": pkg_id,
            "name": uad.get("name", pkg_id),
            "category": uad.get("category", ""),
            "risk": uad.get("risk", "caution"),
            "desc": uad.get("desc", ""),
            "source": "uad",
            "uad_removal": uad.get("uad_removal", ""),
            "status": "enabled",
        }

    return {
        "id": pkg_id,
        "name": pkg_id.split(".")[-1].replace("_", " ").title(),
        "category": classify_unknown(pkg_id),
        "risk": "unknown",
        "desc": "",
        "source": "unknown",
        "status": "enabled",
    }


def get_packages(device):
    """Get all enabled packages with classification — merges custom + brand + UAD."""
    ensure_uad_fresh()
    output = _shell(device, "pm", "list", "packages", "-e", "--user", "0")
    if "ERROR" in output:
        return {"error": output}

    device_type = detect_device_type(device)
    dev_info = get_device_info(device)
    brand_key = dev_info.get("brand_key", "")

    merged_db = dict(PACKAGE_DB)
    for bk, bdb in BRAND_PACKAGES.items():
        if bk in brand_key:
            merged_db.update(bdb)

    packages = []
    for line in output.split("\n"):
        line = line.strip()
        if line.startswith("package:"):
            pkg_id = line[8:]
            packages.append(_lookup_package(pkg_id, merged_db))

    packages.sort(key=lambda p: (
        {"safe": 0, "caution": 1, "unknown": 2, "dangerous": 3}.get(p["risk"], 2),
        p["category"],
        p["name"]
    ))
    return {"packages": packages, "device_type": device_type}


def uninstall_package(device, pkg_id):
    """Uninstall package for user 0 (reversible)."""
    output = run_adb(["-s", device, "shell", "pm", "uninstall", "-k", "--user", "0", pkg_id])
    if "Success" in output:
        return {"success": True, "message": f"Removed {pkg_id}"}
    output2 = run_adb(["-s", device, "shell", "pm", "disable-user", "--user", "0", pkg_id])
    if "disabled" in output2.lower():
        return {"success": True, "message": f"Disabled {pkg_id}"}
    return {"success": False, "message": f"Failed: {output} | {output2}"}


def restore_package(device, pkg_id):
    """Restore a previously removed package."""
    output = run_adb(["-s", device, "shell", "cmd", "package", "install-existing", "--user", "0", pkg_id])
    if "installed" in output.lower():
        return {"success": True, "message": f"Restored {pkg_id}"}
    output2 = run_adb(["-s", device, "shell", "pm", "enable", "--user", "0", pkg_id])
    if "enabled" in output2.lower():
        return {"success": True, "message": f"Enabled {pkg_id}"}
    return {"success": False, "message": f"Failed: {output} | {output2}"}


def get_disabled_packages(device):
    """Get disabled/removed packages that can be restored."""
    all_pkgs = _shell(device, "pm", "list", "packages", "--user", "0")
    enabled = _shell(device, "pm", "list", "packages", "-e", "--user", "0")
    all_set = {l.strip()[8:] for l in all_pkgs.split("\n") if l.strip().startswith("package:")}
    enabled_set = {l.strip()[8:] for l in enabled.split("\n") if l.strip().startswith("package:")}
    disabled = all_set - enabled_set
    result = []
    for pkg_id in sorted(disabled):
        info = PACKAGE_DB.get(pkg_id) or UAD_DB.get(pkg_id) or {}
        result.append({
            "id": pkg_id,
            "name": info.get("name", pkg_id.split(".")[-1].replace("_", " ").title()),
            "category": info.get("category", classify_unknown(pkg_id)),
            "risk": info.get("risk", "unknown"),
        })
    return {"packages": result}


def apply_preset(device, preset_id):
    preset = PRESETS.get(preset_id)
    if not preset:
        return {"success": False, "message": f"Unknown preset: {preset_id}"}
    pkg_data = get_packages(device)
    if "error" in pkg_data:
        return {"success": False, "message": pkg_data["error"]}

    removed = []
    failed = []
    for p in pkg_data["packages"]:
        if p["risk"] in preset["remove_risks"] and p["category"] in preset["remove_categories"]:
            r = uninstall_package(device, p["id"])
            if r["success"]:
                removed.append(p["id"])
            else:
                failed.append(p["id"])

    restricted = []
    for pkg in preset.get("restrict_background", []):
        _shell(device, "cmd", "appops", "set", pkg, "RUN_IN_BACKGROUND", "deny")
        _shell(device, "cmd", "appops", "set", pkg, "RUN_ANY_IN_BACKGROUND", "deny")
        _shell(device, "am", "set-standby-bucket", pkg, "restricted")
        restricted.append(pkg)

    optimize_device(device)

    return {
        "success": True,
        "message": f"Preset '{preset['name']}' applied",
        "removed": len(removed),
        "failed": len(failed),
        "restricted": len(restricted),
        "removed_packages": removed,
        "failed_packages": failed,
    }
