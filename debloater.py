#!/usr/bin/env python3
"""SAMurai — Universal Android debloating tool with web UI."""
import http.server
import sys
import threading
import webbrowser

from src.adb import run_adb
from src.ai import load_ai_config
from src.server import DebloaterHandler, PORT


def main():
    load_ai_config()

    print("\n  SAMurai v3.0 — Universal Android Debloater")
    print("  ────────────────────────────────────────────")

    adb_check = run_adb(["version"])
    if "ERROR" in adb_check:
        print("\n  ✗ ADB not found!")
        if sys.platform == "darwin":
            print("  Install: brew install android-platform-tools")
        elif sys.platform == "linux":
            print("  Install: sudo apt install adb  (or your distro's equivalent)")
        else:
            print("  Install Android SDK Platform Tools from:")
            print("  https://developer.android.com/tools/releases/platform-tools")
        sys.exit(1)
    print("  ✓ ADB found")

    server = http.server.HTTPServer(("127.0.0.1", PORT), DebloaterHandler)
    print(f"  ✓ Server running at http://127.0.0.1:{PORT}")
    print("\n  Opening browser...\n")

    threading.Timer(0.5, lambda: webbrowser.open(f"http://127.0.0.1:{PORT}")).start()

    try:
        server.serve_forever()
    except KeyboardInterrupt:
        print("\n  Shutting down...")
        server.shutdown()


if __name__ == "__main__":
    main()
