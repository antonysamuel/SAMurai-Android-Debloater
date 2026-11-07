"""Security scanning, permissions, processes, and notifications."""
import re

from src.adb import _shell
from src.database import PACKAGE_DB
from src.packages import classify_unknown


def security_scan(device):
    findings = []

    admins_output = _shell(device, "dumpsys", "device_policy", timeout=10)
    admins = []
    for line in admins_output.split("\n"):
        m = re.search(r"admin=ComponentInfo\{([^}]+)\}", line)
        if m:
            admins.append(m.group(1))
    if admins:
        findings.append({"type": "info", "title": "Device Administrators", "details": admins})

    access = _shell(device, "settings", "get", "secure", "enabled_accessibility_services")
    if access and access != "null":
        findings.append({"type": "warning", "title": "Accessibility services enabled", "details": access.split(":")})

    listeners = _shell(device, "settings", "get", "secure", "enabled_notification_listeners")
    if listeners and listeners != "null":
        findings.append({"type": "info", "title": "Notification listeners", "details": listeners.split(":")})

    overlay = _shell(device, "cmd", "appops", "query-op", "SYSTEM_ALERT_WINDOW", "allow")
    if overlay.strip():
        findings.append({"type": "info", "title": "Draw over other apps", "details": overlay.strip().split("\n")})

    usage = _shell(device, "cmd", "appops", "query-op", "GET_USAGE_STATS", "allow")
    if usage.strip():
        findings.append({"type": "info", "title": "Usage access", "details": usage.strip().split("\n")})

    pkgs_output = _shell(device, "pm", "list", "packages", "-3", "-i", "--user", "0", timeout=20)
    sideloaded = []
    for line in pkgs_output.split("\n"):
        line = line.strip()
        if "installer=" in line and "com.android.vending" not in line and "com.sec.android.app.samsungapps" not in line:
            pkg_part = line.split("installer=")[0].replace("package:", "").strip()
            installer = line.split("installer=")[1].strip() if "installer=" in line else "unknown"
            if pkg_part:
                sideloaded.append({"package": pkg_part, "installer": installer})
    if sideloaded:
        findings.append({"type": "warning", "title": "Sideloaded apps (not from Play Store)", "details": sideloaded})

    unknown_src = _shell(device, "settings", "get", "secure", "install_non_market_apps")
    if unknown_src == "1":
        findings.append({"type": "warning", "title": "Unknown sources enabled", "details": "Any app can install APKs silently"})

    adb_tcp = _shell(device, "getprop", "service.adb.tcp.port")
    if adb_tcp and adb_tcp not in ("", "0", "-1"):
        findings.append({"type": "danger", "title": "ADB exposed on port " + adb_tcp, "details": "ADB is persistently listening on the network"})

    return {"findings": findings}


def get_permissions(device, package):
    output = _shell(device, "dumpsys", "package", package, timeout=10)
    perms = []
    in_runtime = False
    for line in output.split("\n"):
        line = line.strip()
        if "runtime permissions:" in line:
            in_runtime = True
            continue
        if in_runtime:
            m = re.match(r"(android\.permission\.\w+):\s*granted=(\w+)", line)
            if m:
                perms.append({"permission": m.group(1), "granted": m.group(2) == "true"})
            elif line and not line.startswith("android.permission"):
                in_runtime = False
    return {"package": package, "permissions": perms}


def revoke_permission(device, package, permission):
    output = _shell(device, "pm", "revoke", package, permission)
    success = "ERROR" not in output.upper() and "exception" not in output.lower()
    return {"success": success, "message": output or f"Revoked {permission} from {package}"}


def restrict_background(device, package):
    results = []
    _shell(device, "cmd", "appops", "set", package, "RUN_IN_BACKGROUND", "deny")
    results.append("RUN_IN_BACKGROUND → deny")
    _shell(device, "cmd", "appops", "set", package, "RUN_ANY_IN_BACKGROUND", "deny")
    results.append("RUN_ANY_IN_BACKGROUND → deny")
    _shell(device, "am", "set-standby-bucket", package, "restricted")
    results.append("Standby bucket → restricted")
    _shell(device, "am", "force-stop", package)
    results.append("Force stopped")
    return {"success": True, "package": package, "results": results}


def get_processes(device):
    output = _shell(device, "ps", "-A", timeout=10)
    processes = []
    for line in output.split("\n")[1:]:
        parts = line.split()
        if len(parts) >= 9:
            uid = parts[0]
            pid = parts[1]
            name = parts[-1]
            if uid.startswith("u0_") or uid.startswith("u10_"):
                info = PACKAGE_DB.get(name, {})
                processes.append({
                    "uid": uid,
                    "pid": pid,
                    "name": name,
                    "label": info.get("name", name.split(".")[-1].replace("_", " ").title()),
                    "category": info.get("category", classify_unknown(name)),
                })
    return {"processes": processes}


def force_stop(device, package):
    _shell(device, "am", "force-stop", package)
    return {"success": True, "message": f"Force stopped {package}"}


def get_notification_apps(device):
    """List third-party apps with POST_NOTIFICATIONS granted."""
    pkgs_output = _shell(device, "pm", "list", "packages", "-3", "-e", "--user", "0")
    apps = []
    for line in pkgs_output.split("\n"):
        line = line.strip()
        if line.startswith("package:"):
            pkg = line[8:]
            perm_out = _shell(device, "dumpsys", "package", pkg, timeout=5)
            if "android.permission.POST_NOTIFICATIONS: granted=true" in perm_out:
                info = PACKAGE_DB.get(pkg, {})
                apps.append({
                    "id": pkg,
                    "name": info.get("name", pkg.split(".")[-1].replace("_", " ").title()),
                })
    return {"apps": apps}


def revoke_notifications(device, packages):
    results = []
    for pkg in packages:
        output = _shell(device, "pm", "revoke", pkg, "android.permission.POST_NOTIFICATIONS")
        success = "ERROR" not in output.upper() and "exception" not in output.lower()
        results.append({"package": pkg, "success": success})
    return {"results": results}
