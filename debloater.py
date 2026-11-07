#!/usr/bin/env python3
"""SAMurai — Universal Android debloating tool with web UI & native window support."""
import http.server
import sys
import threading
import time
import webbrowser

from src.adb import run_adb
from src.ai import load_ai_config
from src.server import DebloaterHandler, PORT, find_available_port


def main():
    load_ai_config()

    print("\n  SAMurai v3.2 — Universal Android Debloater")
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

    actual_port = find_available_port(PORT)
    url = f"http://127.0.0.1:{actual_port}"
    server = http.server.HTTPServer(("127.0.0.1", actual_port), DebloaterHandler)
    print(f"  ✓ Server running at {url}")

    # Check for optional pywebview native window mode
    has_webview = False
    if "--browser" not in sys.argv:
        try:
            import webview
            has_webview = True
        except ImportError:
            has_webview = False

    if has_webview:
        print("  ✓ Opening native application window...\n")
        server_thread = threading.Thread(target=server.serve_forever, daemon=True)
        server_thread.start()

        import webview
        window = webview.create_window(
            title="SAMurai — Android Debloater & Optimizer",
            url=url,
            width=1280,
            height=860,
            min_size=(920, 600),
            text_select=True
        )
        try:
            webview.start()
        finally:
            server.shutdown()
    else:
        print("  Opening in default web browser...\n")
        threading.Timer(0.5, lambda: webbrowser.open(url)).start()
        try:
            server.serve_forever()
        except KeyboardInterrupt:
            print("\n  Shutting down...")
            server.shutdown()


if __name__ == "__main__":
    main()
