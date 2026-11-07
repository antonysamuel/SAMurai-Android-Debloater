"""Device settings — defaults, DNS, Knox, profiles, network scan."""
from src.adb import _shell
from src.devices import detect_device_type, get_devices
from src.packages import uninstall_package


def get_defaults(device):
    defaults = {}
    for role, label in [
        ("android.app.role.SMS", "sms"),
        ("android.app.role.BROWSER", "browser"),
        ("android.app.role.ASSISTANT", "assistant"),
        ("android.app.role.HOME", "home"),
        ("android.app.role.DIALER", "dialer"),
    ]:
        output = _shell(device, "cmd", "role", "get-role-holders", role)
        defaults[label] = output.strip() if output.strip() else "(system default)"

    autofill = _shell(device, "settings", "get", "secure", "autofill_service")
    defaults["autofill"] = autofill if autofill and autofill != "null" else "(none)"

    return defaults


def set_default(device, role, package):
    role_map = {
        "sms": "android.app.role.SMS",
        "browser": "android.app.role.BROWSER",
        "assistant": "android.app.role.ASSISTANT",
        "home": "android.app.role.HOME",
        "dialer": "android.app.role.DIALER",
    }
    android_role = role_map.get(role)
    if not android_role:
        return {"success": False, "message": f"Unknown role: {role}"}
    output = _shell(device, "cmd", "role", "add-role-holder", android_role, package)
    success = "ERROR" not in output.upper() and "exception" not in output.lower()
    return {"success": success, "message": output or f"Set {package} as default {role}"}


def get_dns(device):
    mode = _shell(device, "settings", "get", "global", "private_dns_mode")
    specifier = _shell(device, "settings", "get", "global", "private_dns_specifier")
    return {
        "mode": mode if mode else "off",
        "hostname": specifier if specifier and specifier != "null" else "",
    }


def set_dns(device, hostname):
    if hostname:
        _shell(device, "settings", "put", "global", "private_dns_mode", "hostname")
        _shell(device, "settings", "put", "global", "private_dns_specifier", hostname)
        return {"success": True, "message": f"Private DNS set to {hostname}"}
    else:
        _shell(device, "settings", "put", "global", "private_dns_mode", "off")
        return {"success": True, "message": "Private DNS disabled"}


def check_knox(device):
    info = {}
    for prop, key in [
        ("ro.boot.warranty_bit", "warranty_bit"),
        ("ro.warranty_bit", "warranty_bit_ro"),
        ("ro.boot.flash.locked", "bootloader_locked"),
        ("ro.boot.verifiedbootstate", "verified_boot"),
        ("ro.boot.veritymode", "verity_mode"),
        ("ro.secure", "secure_boot"),
        ("sys.oem_unlock_allowed", "oem_unlock_allowed"),
    ]:
        val = _shell(device, "getprop", prop)
        if val:
            info[key] = val

    knox_intact = info.get("warranty_bit", "") == "0" and info.get("verified_boot", "") == "green"
    info["knox_status"] = "intact" if knox_intact else "tripped or unknown"

    return info


def export_profile(device):
    enabled = _shell(device, "pm", "list", "packages", "-e", "--user", "0")
    all_pkgs = _shell(device, "pm", "list", "packages", "--user", "0")

    enabled_set = {l.strip()[8:] for l in enabled.split("\n") if l.strip().startswith("package:")}
    all_set = {l.strip()[8:] for l in all_pkgs.split("\n") if l.strip().startswith("package:")}
    disabled_set = all_set - enabled_set

    model = _shell(device, "getprop", "ro.product.model")

    return {
        "model": model,
        "device_type": detect_device_type(device),
        "enabled": sorted(enabled_set),
        "disabled": sorted(disabled_set),
        "total": len(all_set),
    }


def import_profile(device, profile):
    """Apply a previously exported profile — disable packages that were disabled."""
    disabled_targets = set(profile.get("disabled", []))
    results = {"removed": 0, "restored": 0, "failed": 0}

    enabled_now = _shell(device, "pm", "list", "packages", "-e", "--user", "0")
    enabled_set = {l.strip()[8:] for l in enabled_now.split("\n") if l.strip().startswith("package:")}

    for pkg in disabled_targets:
        if pkg in enabled_set:
            r = uninstall_package(device, pkg)
            if r["success"]:
                results["removed"] += 1
            else:
                results["failed"] += 1

    return {"success": True, "message": "Profile applied", **results}


def scan_network():
    devices = get_devices()
    return {"devices": devices}
