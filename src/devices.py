"""Device detection, info, and battery quick-check."""
import re

from src.adb import run_adb, _shell
from src.database import ensure_uad_fresh


def get_device_info(device):
    """Get detailed device info including brand detection."""
    props = {}
    for key in ["ro.product.brand", "ro.product.model", "ro.product.manufacturer",
                 "ro.build.version.release", "ro.build.display.id", "ro.product.device",
                 "ro.product.characteristics", "ro.build.version.sdk"]:
        val = run_adb(["-s", device, "shell", "getprop", key], timeout=5)
        if val and "ERROR" not in val:
            props[key] = val.strip()

    brand = (props.get("ro.product.brand", "") or props.get("ro.product.manufacturer", "")).lower()
    model = props.get("ro.product.model", "")
    chars = props.get("ro.product.characteristics", "")
    device_type = "watch" if ("watch" in chars or model.startswith("SM-R")) else "phone"

    brand_name = brand.capitalize()
    if "samsung" in brand: brand_name = "Samsung"
    elif "xiaomi" in brand or "redmi" in brand or "poco" in brand: brand_name = "Xiaomi"
    elif "oneplus" in brand: brand_name = "OnePlus"
    elif "realme" in brand: brand_name = "Realme"
    elif "oppo" in brand: brand_name = "OPPO"
    elif "vivo" in brand: brand_name = "Vivo"
    elif "google" in brand: brand_name = "Google Pixel"

    return {
        "brand": brand_name,
        "brand_key": brand,
        "model": model,
        "android_version": props.get("ro.build.version.release", ""),
        "sdk": props.get("ro.build.version.sdk", ""),
        "build": props.get("ro.build.display.id", ""),
        "device_type": device_type,
    }


def get_device_battery_quick(device):
    """Quick battery check — level and health."""
    output = run_adb(["-s", device, "shell", "dumpsys", "battery"], timeout=5)
    info = {"level": "", "health_asoc": "", "health_bsoh": "", "temperature": ""}
    for line in output.split("\n"):
        line = line.strip()
        if line.startswith("level:"):
            info["level"] = line.split(":")[1].strip()
        elif "mSavedBatteryAsoc" in line:
            m = re.search(r'\[(\d+)\]', line)
            if m: info["health_asoc"] = m.group(1)
        elif "mSavedBatteryBsoh" in line:
            m = re.search(r'(\d+)', line.split(":")[1])
            if m: info["health_bsoh"] = m.group(1)
        elif line.startswith("temperature:"):
            info["temperature"] = line.split(":")[1].strip()
    return info


def get_devices():
    """List connected ADB devices with device type detection."""
    ensure_uad_fresh()
    output = run_adb(["devices", "-l"])
    devices = []
    for line in output.split("\n")[1:]:
        line = line.strip()
        if not line or "offline" in line:
            continue
        parts = line.split()
        if len(parts) >= 2 and parts[1] in ("device", "unauthorized"):
            addr = parts[0]
            model = ""
            product = ""
            for p in parts:
                if p.startswith("model:"):
                    model = p.split(":")[1]
                if p.startswith("product:"):
                    product = p.split(":")[1]
            device_type = "phone"
            if model and re.match(r"SM.R\d", model):
                device_type = "watch"
            extra = {}
            if parts[1] == "device":
                try:
                    batt = get_device_battery_quick(addr)
                    info = get_device_info(addr)
                    extra = {**batt, "brand": info.get("brand", ""), "android_version": info.get("android_version", ""),
                             "device_type": info.get("device_type", device_type)}
                except Exception:
                    pass
            devices.append({
                "address": addr,
                "status": parts[1],
                "model": model,
                "product": product,
                "device_type": extra.get("device_type", device_type),
                "brand": extra.get("brand", ""),
                "android_version": extra.get("android_version", ""),
                "battery_level": extra.get("level", ""),
                "battery_health": extra.get("health_asoc", ""),
            })
    return devices


def detect_device_type(device):
    """Detect whether a device is a phone or watch."""
    model = _shell(device, "getprop", "ro.product.model")
    if model and re.match(r"SM.R\d", model):
        return "watch"
    chars = _shell(device, "getprop", "ro.build.characteristics")
    if "watch" in chars.lower() or "wearable" in chars.lower():
        return "watch"
    return "phone"
