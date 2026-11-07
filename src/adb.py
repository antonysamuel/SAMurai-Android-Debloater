"""ADB command helpers."""
import subprocess


def run_adb(args, timeout=15):
    """Run an ADB command and return stdout+stderr."""
    try:
        result = subprocess.run(
            ["adb"] + args,
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
