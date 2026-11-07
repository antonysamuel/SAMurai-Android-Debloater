"""ADB command helpers."""
import os
import shutil
import subprocess
import sys


def find_adb_binary():
    """Locate the adb binary across PATH and standard Android SDK directories."""
    found = shutil.which("adb")
    if found:
        return found

    home = os.path.expanduser("~")
    candidates = [
        # macOS
        os.path.join(home, "Library", "Android", "sdk", "platform-tools", "adb"),
        "/opt/homebrew/bin/adb",
        "/usr/local/bin/adb",
        # Linux
        os.path.join(home, "Android", "Sdk", "platform-tools", "adb"),
        os.path.join(home, ".android-sdk", "platform-tools", "adb"),
        "/usr/lib/android-sdk/platform-tools/adb",
        "/usr/bin/adb",
        # Windows
        os.path.expandvars(r"%LOCALAPPDATA%\Android\Sdk\platform-tools\adb.exe"),
        r"C:\Program Files (x86)\Android\android-sdk\platform-tools\adb.exe",
    ]

    for c in candidates:
        if os.path.isfile(c) and (os.access(c, os.X_OK) or sys.platform == "win32"):
            adb_dir = os.path.dirname(c)
            curr_path = os.environ.get("PATH", "")
            if adb_dir not in curr_path:
                os.environ["PATH"] = f"{adb_dir}{os.pathsep}{curr_path}"
            return c

    return "adb"


def run_adb(args, timeout=15):
    """Run an ADB command and return stdout+stderr."""
    adb_bin = find_adb_binary()
    try:
        result = subprocess.run(
            [adb_bin] + args,
            capture_output=True, text=True, timeout=timeout
        )
        return result.stdout.strip() + result.stderr.strip()
    except FileNotFoundError:
        return "ERROR: ADB not found. Install Android SDK Platform Tools."
    except subprocess.TimeoutExpired:
        return "ERROR: Command timed out"
    except Exception as e:
        return f"ERROR: {e}"


def _shell(device, *cmd, timeout=15):
    """Shorthand for adb -s <device> shell <cmd>."""
    return run_adb(["-s", device, "shell"] + list(cmd), timeout=timeout)
