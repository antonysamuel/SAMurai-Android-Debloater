"""Battery info, charge settings, and device optimization."""
from src.adb import _shell


def get_battery_info(device):
    """Get battery information."""
    output = _shell(device, "dumpsys", "battery", timeout=10)
    info = {}
    for line in output.split("\n"):
        line = line.strip()
        if ":" in line:
            key, _, val = line.partition(":")
            key = key.strip()
            val = val.strip()
            if key in ("level", "temperature", "voltage", "status", "health",
                       "mSavedBatteryAsoc", "mSavedBatteryBsoh", "mProtectBatteryMode",
                       "mProtectionThreshold", "AC powered", "USB powered",
                       "Wireless powered", "current now",
                       "Adaptive Fast Charging Settings",
                       "Super Fast Charging Settings"):
                info[key] = val
    return info


def get_charge_settings(device):
    battery = get_battery_info(device)
    return {
        "level": battery.get("level", "?"),
        "ac_powered": battery.get("AC powered", "false"),
        "usb_powered": battery.get("USB powered", "false"),
        "wireless_powered": battery.get("Wireless powered", "false"),
        "adaptive_fast_charging": battery.get("Adaptive Fast Charging Settings", "?"),
        "super_fast_charging": battery.get("Super Fast Charging Settings", "?"),
        "protect_mode": battery.get("mProtectBatteryMode", "?"),
        "protect_threshold": battery.get("mProtectionThreshold", "?"),
        "asoc": battery.get("mSavedBatteryAsoc", "?"),
        "bsoh": battery.get("mSavedBatteryBsoh", "?"),
        "current": battery.get("current now", "?"),
        "temperature": battery.get("temperature", "?"),
        "voltage": battery.get("voltage", "?"),
    }


def optimize_device(device):
    """Apply battery and performance optimizations."""
    results = []
    opts = [
        (["settings", "put", "global", "window_animation_scale", "0.5"], "Animations: window → 0.5x"),
        (["settings", "put", "global", "transition_animation_scale", "0.5"], "Animations: transition → 0.5x"),
        (["settings", "put", "global", "animator_duration_scale", "0.5"], "Animations: animator → 0.5x"),
        (["settings", "put", "global", "wifi_scan_always_enabled", "0"], "WiFi scanning: OFF"),
        (["settings", "put", "global", "ble_scan_always_enabled", "0"], "Bluetooth scanning: OFF"),
    ]
    for cmd, desc in opts:
        _shell(device, *cmd)
        results.append(desc)
    _shell(device, "sm", "fstrim", timeout=30)
    results.append("Storage TRIM complete")
    return {"results": results}
