"""HTTP server and API route handler."""
import http.server
import json
from pathlib import Path
from urllib.parse import parse_qs, urlparse

from src.adb import run_adb
from src.ai import BUILTIN_PROVIDERS, ai_chat, get_ai_config_safe, list_models, save_ai_config
from src.battery import get_battery_info, get_charge_settings, optimize_device
from src.database import (
    BRAND_PACKAGES, PACKAGE_DB, UAD_DB, PRESETS,
    _save_json, reload_databases, sync_uad_list,
)
from src.devices import get_device_battery_quick, get_device_info, get_devices
from src.packages import (
    apply_preset, get_disabled_packages, get_packages,
    restore_package, uninstall_package,
)
from src.security import (
    force_stop, get_notification_apps, get_permissions, get_processes,
    restrict_background, revoke_notifications, revoke_permission, security_scan,
)
from src.settings import (
    check_knox, export_profile, get_defaults, get_dns,
    import_profile, scan_network, set_default, set_dns,
)

PORT = 8080
WEB_DIR = Path(__file__).resolve().parent.parent / "web"


class DebloaterHandler(http.server.SimpleHTTPRequestHandler):
    def __init__(self, *args, **kwargs):
        super().__init__(*args, directory=str(WEB_DIR), **kwargs)

    def log_message(self, format, *args):
        pass

    def _read_body(self):
        length = int(self.headers.get("Content-Length", 0))
        raw = self.rfile.read(length).decode("utf-8") if length else "{}"
        try:
            return json.loads(raw)
        except json.JSONDecodeError:
            return None

    def _json(self, data, status=200):
        self.send_response(status)
        self.send_header("Content-Type", "application/json")
        self.send_header("Access-Control-Allow-Origin", "*")
        self.send_header("Access-Control-Allow-Methods", "GET, POST, OPTIONS")
        self.send_header("Access-Control-Allow-Headers", "Content-Type")
        self.end_headers()
        self.wfile.write(json.dumps(data).encode("utf-8"))

    def _require_device(self, params=None, data=None):
        if params:
            d = params.get("device", [""])[0]
        elif data:
            d = data.get("device", "")
        else:
            d = ""
        return d or None

    def do_OPTIONS(self):
        self._json({})

    def do_GET(self):
        parsed = urlparse(self.path)
        path = parsed.path
        params = parse_qs(parsed.query)

        if path == "/api/devices":
            self._json(get_devices())

        elif path == "/api/packages":
            d = self._require_device(params=params)
            self._json(get_packages(d) if d else {"error": "No device"})

        elif path == "/api/battery":
            d = self._require_device(params=params)
            self._json(get_battery_info(d) if d else {"error": "No device"})

        elif path == "/api/disabled":
            d = self._require_device(params=params)
            self._json(get_disabled_packages(d) if d else {"error": "No device"})

        elif path == "/api/permissions":
            d = self._require_device(params=params)
            pkg = params.get("package", [""])[0]
            self._json(get_permissions(d, pkg) if d and pkg else {"error": "Need device and package"})

        elif path == "/api/processes":
            d = self._require_device(params=params)
            self._json(get_processes(d) if d else {"error": "No device"})

        elif path == "/api/security-scan":
            d = self._require_device(params=params)
            self._json(security_scan(d) if d else {"error": "No device"})

        elif path == "/api/defaults":
            d = self._require_device(params=params)
            self._json(get_defaults(d) if d else {"error": "No device"})

        elif path == "/api/dns":
            d = self._require_device(params=params)
            self._json(get_dns(d) if d else {"error": "No device"})

        elif path == "/api/knox":
            d = self._require_device(params=params)
            self._json(check_knox(d) if d else {"error": "No device"})

        elif path == "/api/export-profile":
            d = self._require_device(params=params)
            self._json(export_profile(d) if d else {"error": "No device"})

        elif path == "/api/scan-network":
            self._json(scan_network())

        elif path == "/api/charge":
            d = self._require_device(params=params)
            self._json(get_charge_settings(d) if d else {"error": "No device"})

        elif path == "/api/notifications":
            d = self._require_device(params=params)
            self._json(get_notification_apps(d) if d else {"error": "No device"})

        elif path == "/api/presets":
            self._json({k: {"name": v["name"], "desc": v["desc"]} for k, v in PRESETS.items()})

        elif path == "/api/ai/config":
            self._json(get_ai_config_safe())

        elif path == "/api/ai/models":
            self._json(list_models())

        elif path == "/api/device-info":
            d = self._require_device(params=params)
            if d:
                info = get_device_info(d)
                batt = get_device_battery_quick(d)
                info["battery"] = batt
                self._json(info)
            else:
                self._json({"error": "No device"})

        elif path == "/api/packages-db":
            self._json({"packages": PACKAGE_DB, "brands": BRAND_PACKAGES, "presets": PRESETS, "uad_count": len(UAD_DB)})

        elif path == "/":
            self.path = "/index.html"
            super().do_GET()
        else:
            super().do_GET()

    def do_POST(self):
        data = self._read_body()
        if data is None:
            self._json({"error": "Invalid JSON"}, 400)
            return

        parsed = urlparse(self.path)
        path = parsed.path

        if path == "/api/connect":
            addr = f"{data.get('ip', '')}:{data.get('port', '')}"
            output = run_adb(["connect", addr])
            self._json({"success": "connected" in output.lower(), "message": output})

        elif path == "/api/pair":
            addr = f"{data.get('ip', '')}:{data.get('port', '')}"
            output = run_adb(["pair", addr, data.get("code", "")])
            self._json({"success": "successfully" in output.lower(), "message": output})

        elif path == "/api/uninstall":
            self._json(uninstall_package(data.get("device", ""), data.get("package", "")))

        elif path == "/api/batch_uninstall":
            d = data.get("device", "")
            results = [{"package": p, **uninstall_package(d, p)} for p in data.get("packages", [])]
            self._json({"results": results})

        elif path == "/api/restore":
            self._json(restore_package(data.get("device", ""), data.get("package", "")))

        elif path == "/api/optimize":
            self._json(optimize_device(data.get("device", "")))

        elif path == "/api/reboot":
            run_adb(["-s", data.get("device", ""), "reboot"])
            self._json({"success": True, "message": "Rebooting device..."})

        elif path == "/api/preset":
            self._json(apply_preset(data.get("device", ""), data.get("preset", "")))

        elif path == "/api/revoke-permission":
            self._json(revoke_permission(data.get("device", ""), data.get("package", ""), data.get("permission", "")))

        elif path == "/api/restrict-background":
            self._json(restrict_background(data.get("device", ""), data.get("package", "")))

        elif path == "/api/force-stop":
            self._json(force_stop(data.get("device", ""), data.get("package", "")))

        elif path == "/api/set-default":
            self._json(set_default(data.get("device", ""), data.get("role", ""), data.get("package", "")))

        elif path == "/api/dns":
            self._json(set_dns(data.get("device", ""), data.get("hostname", "")))

        elif path == "/api/import-profile":
            self._json(import_profile(data.get("device", ""), data.get("profile", {})))

        elif path == "/api/revoke-notifications":
            self._json(revoke_notifications(data.get("device", ""), data.get("packages", [])))

        elif path == "/api/ai/config":
            provider = data.get("provider", "")
            api_key = data.get("api_key", "")
            model = data.get("model", "")
            base_url = data.get("base_url", "")
            if not provider:
                self._json({"error": "Provider required"}, 400)
            else:
                save_ai_config(provider, api_key, model, base_url)
                self._json({"success": True, "message": f"AI configured with {BUILTIN_PROVIDERS.get(provider, {}).get('name', provider)}"})

        elif path == "/api/ai/chat":
            messages = data.get("messages", [])
            if not messages:
                self._json({"error": "No messages provided"}, 400)
            else:
                result = ai_chat(messages)
                self._json(result)

        elif path == "/api/ai/smart-cleanup":
            d = data.get("device", "")
            goal = data.get("goal", "balanced optimization")
            if not d:
                self._json({"error": "No device"})
            else:
                pkgs = get_packages(d)
                if isinstance(pkgs, dict) and "error" in pkgs:
                    self._json(pkgs)
                    return
                pkg_entries = pkgs.get("packages", []) if isinstance(pkgs, dict) else pkgs
                info = get_device_info(d)

                pkg_lines = []
                for p in pkg_entries:
                    src = p.get("source", "unknown")
                    uad_note = ""
                    if src == "uad":
                        uad_note = " [UAD-verified]"
                    elif src == "custom":
                        uad_note = " [custom-db]"
                    pkg_lines.append(
                        f"  {p.get('id','')} | {p.get('name','')} | risk={p.get('risk','unknown')} | "
                        f"cat={p.get('category','')} | {p.get('desc','')}{uad_note}"
                    )

                system_prompt = (
                    "You are an expert Android device optimizer. You have deep knowledge of Android packages, "
                    "the Universal Android Debloater (UAD) project, and which packages are safe to remove.\n\n"
                    "RULES:\n"
                    "- Packages marked risk=dangerous are SYSTEM CRITICAL — never recommend removing them\n"
                    "- Packages marked [UAD-verified] with risk=safe are pre-vetted by the UAD community\n"
                    "- Packages marked risk=caution need individual justification\n"
                    "- Consider the user's goal when deciding what to remove vs restrict\n"
                    "- Restrict background is safer than removal — prefer it for caution-level apps the user might need\n"
                    "- Never remove core device services (launcher, dialer, contacts, settings, systemui)\n"
                    "- Return ONLY valid JSON, no markdown, no code fences, no extra text\n\n"
                    "LAYOUT: You must choose a 'layout' for the UI from these options:\n"
                    '- "quick-actions": Best when you can group recommendations into 2-5 clear action cards '
                    '(e.g. "Remove Samsung bloat", "Restrict trackers", "Clean carrier junk"). '
                    "Each card has a title, description, icon, and list of packages. User clicks a card to expand and apply.\n"
                    '- "categories": Best when there are many packages across diverse categories. '
                    "Groups packages by type with expand/collapse sections.\n"
                    '- "priority": Best when some removals are much more impactful than others. '
                    "Sorts by urgency: high (biggest impact), medium, low.\n"
                    '- "health-report": Use ONLY when device is already very clean (fewer than 3 things to do). '
                    "Shows a score and minimal recommendations.\n"
                )

                user_prompt = (
                    f"Device: {info.get('brand', 'Unknown')} {info.get('model', '')} "
                    f"running Android {info.get('android_version', '')}\n"
                    f"User goal: {goal}\n\n"
                    f"Installed packages ({len(pkg_entries)}):\n" + "\n".join(pkg_lines) + "\n\n"
                    "Return a JSON object. The 'layout' field determines the UI template.\n\n"
                    "For layout='quick-actions':\n"
                    "{\n"
                    '  "layout": "quick-actions",\n'
                    '  "summary": "overall summary",\n'
                    '  "estimated_impact": "expected improvement",\n'
                    '  "warnings": ["any warnings"],\n'
                    '  "actions": [\n'
                    '    {\n'
                    '      "title": "Remove Samsung Bloat",\n'
                    '      "description": "Samsung preinstalled apps you likely don\'t use",\n'
                    '      "icon": "trash",\n'
                    '      "severity": "safe",\n'
                    '      "packages": [{"id": "com.example", "name": "App", "action": "remove", "reason": "why"}]\n'
                    "    }\n"
                    "  ]\n"
                    "}\n\n"
                    "For layout='categories':\n"
                    "{\n"
                    '  "layout": "categories",\n'
                    '  "summary": "...", "estimated_impact": "...", "warnings": [...],\n'
                    '  "categories": [\n'
                    '    {"name": "Category Name", "icon": "folder", "packages": [{"id":"...", "name":"...", "action":"remove|restrict", "reason":"..."}]}\n'
                    "  ]\n"
                    "}\n\n"
                    "For layout='priority':\n"
                    "{\n"
                    '  "layout": "priority",\n'
                    '  "summary": "...", "estimated_impact": "...", "warnings": [...],\n'
                    '  "high": [{"id":"...", "name":"...", "action":"remove|restrict", "reason":"..."}],\n'
                    '  "medium": [{"id":"...", "name":"...", "action":"remove|restrict", "reason":"..."}],\n'
                    '  "low": [{"id":"...", "name":"...", "action":"remove|restrict", "reason":"..."}]\n'
                    "}\n\n"
                    "For layout='health-report':\n"
                    "{\n"
                    '  "layout": "health-report",\n'
                    '  "score": 85,\n'
                    '  "grade": "A",\n'
                    '  "summary": "Your device is already well optimized.",\n'
                    '  "findings": ["minor thing 1", "minor thing 2"],\n'
                    '  "packages": [{"id":"...", "name":"...", "action":"remove|restrict", "reason":"..."}]\n'
                    "}\n\n"
                    "Icon options: trash, shield, zap, eye-off, phone, globe, battery, folder.\n"
                    "Choose the layout that best fits what you found. Prefer 'quick-actions' when possible."
                )

                result = ai_chat([
                    {"role": "system", "content": system_prompt},
                    {"role": "user", "content": user_prompt},
                ])
                self._json(result)

        elif path == "/api/ai/apply-cleanup":
            d = data.get("device", "")
            remove_ids = data.get("remove", [])
            restrict_ids = data.get("restrict", [])
            if not d:
                self._json({"error": "No device"})
                return
            results = {"removed": 0, "restricted": 0, "failed": 0, "errors": []}
            for pkg_id in remove_ids:
                r = uninstall_package(d, pkg_id)
                if r.get("success"):
                    results["removed"] += 1
                else:
                    results["failed"] += 1
                    results["errors"].append(f"{pkg_id}: {r.get('message','')}")
            for pkg_id in restrict_ids:
                from src.security import restrict_background as _restrict
                r = _restrict(d, pkg_id)
                if r.get("success"):
                    results["restricted"] += 1
                else:
                    results["failed"] += 1
                    results["errors"].append(f"{pkg_id}: {r.get('message','')}")
            results["success"] = True
            results["message"] = f"Removed {results['removed']}, restricted {results['restricted']}" + (f", {results['failed']} failed" if results['failed'] else "")
            self._json(results)

        elif path == "/api/reload-db":
            reload_databases()
            self._json({"success": True, "message": f"Reloaded: {len(PACKAGE_DB)} packages, {len(BRAND_PACKAGES)} brands, {len(UAD_DB)} UAD, {len(PRESETS)} presets"})

        elif path == "/api/sync-uad":
            result = sync_uad_list()
            if result.get("success"):
                reload_databases()
            self._json(result)

        elif path == "/api/packages-db":
            target = data.get("target", "packages")
            entries = data.get("entries", {})
            if target == "packages":
                PACKAGE_DB.update(entries)
                _save_json("packages.json", PACKAGE_DB)
                self._json({"success": True, "message": f"Saved {len(PACKAGE_DB)} packages"})
            elif target == "brands":
                brand = data.get("brand", "")
                if brand:
                    BRAND_PACKAGES.setdefault(brand, {}).update(entries)
                    _save_json("brands.json", BRAND_PACKAGES)
                    self._json({"success": True, "message": f"Saved {brand}: {len(BRAND_PACKAGES[brand])} entries"})
                else:
                    self._json({"error": "Brand name required"}, 400)
            elif target == "presets":
                PRESETS.update(entries)
                _save_json("presets.json", PRESETS)
                self._json({"success": True, "message": f"Saved {len(PRESETS)} presets"})
            else:
                self._json({"error": "Unknown target"}, 400)

        elif path == "/api/packages-db/delete":
            target = data.get("target", "packages")
            pkg_id = data.get("id", "")
            if not pkg_id:
                self._json({"error": "Package ID required"}, 400)
            elif target == "packages":
                removed = PACKAGE_DB.pop(pkg_id, None)
                _save_json("packages.json", PACKAGE_DB)
                self._json({"success": bool(removed), "message": f"Removed {pkg_id}" if removed else "Not found"})
            elif target == "brands":
                brand = data.get("brand", "")
                if brand and brand in BRAND_PACKAGES:
                    removed = BRAND_PACKAGES[brand].pop(pkg_id, None)
                    _save_json("brands.json", BRAND_PACKAGES)
                    self._json({"success": bool(removed), "message": f"Removed {pkg_id} from {brand}" if removed else "Not found"})
                else:
                    self._json({"error": "Brand not found"}, 400)
            elif target == "presets":
                removed = PRESETS.pop(pkg_id, None)
                _save_json("presets.json", PRESETS)
                self._json({"success": bool(removed), "message": f"Removed preset {pkg_id}" if removed else "Not found"})
            else:
                self._json({"error": "Unknown target"}, 400)

        else:
            self._json({"error": "Not found"}, 404)
