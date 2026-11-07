# SAMurai

A zero-dependency, web-based tool for debloating and optimizing Android phones and watches via ADB. Runs entirely on Python 3 stdlib — no pip installs needed.

Supports Samsung, Xiaomi, OnePlus, Realme, OPPO, Vivo, and Google Pixel devices.

## Features

- **Wireless ADB** — pair and connect to devices over WiFi
- **Smart package classification** — 5,400+ known packages from the [Universal Android Debloater](https://github.com/Universal-Debloater-Alliance/universal-android-debloater-next-generation) project, plus custom databases for Samsung, Google, carrier bloatware, and brand-specific packages
- **Safe removal** — uses `pm uninstall -k --user 0` (reversible, data preserved) with `pm disable-user` as fallback
- **One-click restore** — reinstall any removed package
- **Debloat presets** — Minimal, iPhone Efficiency, and Aggressive profiles
- **Battery health** — ASOC and BSOH readings, temperature, charge settings
- **Permission manager** — inspect and revoke runtime permissions per app
- **Security scanner** — device admins, accessibility services, sideloaded apps, ADB exposure
- **Background restrictor** — deny background activity and set standby buckets
- **Process viewer** — see running apps, force stop, restrict
- **Default app manager** — set SMS, browser, assistant, dialer, home defaults
- **Private DNS** — configure system-wide ad blocking
- **Knox/warranty check** — verify warranty bit, verified boot, bootloader status
- **Device profiles** — export/import package state for backup or migration
- **Storage maintenance** — run TRIM on flash storage
- **AI-powered analysis** — connect any OpenAI-compatible API for package analysis, smart presets, and chat assistance
- **Editable databases** — all package lists stored as JSON files, editable from the UI or any text editor

## Requirements

- **Python 3.6+** (uses only stdlib — no pip packages)
- **ADB** (Android Debug Bridge)
  - macOS: `brew install android-platform-tools`
  - Debian/Ubuntu: `sudo apt install adb`
  - Fedora: `sudo dnf install android-tools`
  - Arch: `sudo pacman -S android-tools`
  - Windows: download from [Android SDK Platform Tools](https://developer.android.com/tools/releases/platform-tools)
- **Wireless Debugging** enabled on the target device (Settings > Developer Options > Wireless Debugging)

## Quick Start

### macOS (double-click)

1. Clone this repo
2. Double-click `SAMurai.command`
3. The web UI opens at `http://127.0.0.1:8080`

### Linux (double-click or terminal)

1. Clone this repo
2. Run `./SAMurai.sh` — or make it executable and double-click in your file manager
3. The web UI opens at `http://127.0.0.1:8080`

### Any platform (terminal)

```bash
git clone https://github.com/user/SAMurai.git
cd SAMurai
python3 debloater.py
```

The web UI opens automatically in your default browser.

## Usage

### Connect a device

1. **Samsung Users (One UI 6.0+)**: Turn OFF **Auto Blocker** in Settings > Security and privacy > Auto Blocker (Auto Blocker blocks ADB commands and wireless handshakes).
2. On your phone: Settings > Developer Options > Wireless Debugging (toggle ON and tap "Allow").
3. Tap "Pair device with pairing code".
4. In the web UI Dashboard (or using the built-in **Interactive Setup Guide**), enter the IP, pairing port, and code — click **Pair**.
5. Enter the IP and the main wireless debugging port — click **Connect**.

> The wireless debugging port rotates frequently on Samsung devices. If you lose connection, check the port under Wireless Debugging and reconnect. You can also launch the **Wireless Setup Guide & Demo** in the web UI for an interactive walkthrough.

### Debloat

- **Apps tab**: browse installed packages, filter by risk level or category, select and batch remove
- **Presets tab**: apply one-click debloat profiles (Minimal, iPhone Efficiency, Aggressive)
- **Optimize tab**: reduce animations, disable background scanning, run storage TRIM

### AI Features (optional)

1. Go to **AI Settings**
2. Select a provider (NVIDIA, Gemini, OpenAI, Groq, OpenRouter, Ollama, or any custom endpoint)
3. Enter your API key and save
4. Use **AI Chat** for optimization advice or **AI Analyze** for automated package analysis

## Project Structure

```
SAMurai/
├── debloater.py              # Entry point
├── SAMurai.command            # macOS double-click launcher
├── SAMurai.sh                 # Linux launcher
├── src/
│   ├── adb.py                # ADB command execution
│   ├── ai.py                 # AI provider config and chat
│   ├── battery.py            # Battery info, charging, optimization
│   ├── database.py           # JSON database loading, UAD sync
│   ├── devices.py            # Device detection and info
│   ├── packages.py           # Package listing, removal, presets
│   ├── security.py           # Security scanning, permissions
│   ├── server.py             # HTTP server and API routes
│   └── settings.py           # Defaults, DNS, Knox, profiles
├── data/
│   ├── packages.json          # Custom package database (199 entries)
│   ├── brands.json            # Brand-specific packages (63 entries)
│   ├── presets.json           # Debloat presets
│   └── uad.json              # UAD list (5,399 entries, auto-synced)
└── web/
    ├── index.html             # Web UI
    ├── app.js                 # Frontend logic
    └── style.css              # Styling
```

## Package Classification

Packages are identified using a layered lookup:

1. **Custom database** (`data/packages.json`) — your own classifications, highest priority
2. **Brand database** (`data/brands.json`) — brand-specific bloatware (Xiaomi, OnePlus, etc.)
3. **UAD database** (`data/uad.json`) — 5,400+ packages from the Universal Android Debloater project
4. **Heuristic** — pattern-based classification for anything not in any database

Risk levels:
- **Safe** — confirmed bloatware, no side effects from removal
- **Caution** — may affect some features; review before removing
- **Dangerous** — system-critical; removal may cause crashes or bootloops
- **Unknown** — not in any database; exercise caution

The UAD list auto-syncs from GitHub every 24 hours in the background. You can also manually sync from the Database tab.

### Editing the databases

You can add, edit, or remove entries in two ways:
- **Web UI**: go to the Database tab, search/edit/add entries, click Save
- **JSON files**: edit `data/packages.json` or `data/brands.json` directly, then click "Reload from disk" in the UI

Entry format in `packages.json`:
```json
{
  "com.example.bloatware": {
    "name": "Example Bloat",
    "category": "Bloatware",
    "risk": "safe",
    "desc": "Description of what this package does"
  }
}
```

## AI Providers

Any OpenAI-compatible API works. Built-in providers:

| Provider | Base URL | API Key Required |
|----------|----------|-----------------|
| NVIDIA Nemotron | `integrate.api.nvidia.com/v1` | Yes |
| Google Gemini | `generativelanguage.googleapis.com/v1beta` | Yes |
| OpenAI | `api.openai.com/v1` | Yes |
| OpenRouter | `openrouter.ai/api/v1` | Yes |
| Groq | `api.groq.com/openai/v1` | Yes |
| Ollama (local) | `localhost:11434/v1` | No |
| Custom | You set the URL | Optional |

Every provider's base URL is editable — point it at any compatible endpoint.

## Safety Notes

- All removals use `pm uninstall -k --user 0` — this removes the app for the current user only, preserving data. The app still exists on the system partition and can be restored.
- Packages marked **Dangerous** are checkbox-disabled in the UI to prevent accidental removal.
- Work profiles (e.g., Intune-managed User 10) cannot be modified via ADB.
- Factory reset restores all removed packages.
- The tool never requires root access.

## License

MIT
