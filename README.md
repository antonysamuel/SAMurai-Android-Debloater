# SAMurai — Android Debloater & Optimizer

A lightweight, zero-dependency, web-based tool for debloating, securing, and optimizing Android smartphones and watches via ADB. Runs entirely on the Python 3 standard library — no pip packages, node dependencies, or build tools required.

Supports **Samsung Galaxy**, **Google Pixel**, **Xiaomi / HyperOS**, **OnePlus**, **Realme**, **OPPO**, and **Vivo** devices.

![SAMurai Dashboard](assets/dashboard.png)

> [!WARNING]
> ### ⚠️ Disclaimer — Use at Your Own Risk
> Modifying system packages, restricting background processes, or altering system configurations can affect device stability and features. While SAMurai is designed with safety precautions (using non-destructive user-space uninstalls `pm uninstall -k --user 0` that keep data intact and are fully reversible), **you are solely responsible for actions performed on your device**. Always review package selections and create backups before applying aggressive presets.

---

## 🔋 Hardware Battery Health (ASOC) — Samsung Devices

One of SAMurai's standout features is the ability to read real, calibrated hardware battery capacity directly from device kernel telemetry:

![Dashboard Metrics](assets/dashboard.png)

* **Real Hardware ASOC**: Reads the true `mSavedBatteryAsoc` (Actual State of Charge percentage) and `BSOH` (Battery State of Health) metrics, cycle counts, voltage, and real-time thermals.
* **Beyond Android's Standard UI**: Standard Android builds typically hide true hardware battery degradation percentages from users. SAMurai extracts deep hardware battery metrics via `dumpsys battery`.
* **Important Compatibility Note**:
  > [!NOTE]
  > **Tested & Verified on Samsung Galaxy devices only.** Samsung One UI devices expose internal battery calibration registers through their power management HAL. On non-Samsung devices (Pixel, Xiaomi, OnePlus, etc.), standard battery level and temperature are displayed, but the ASOC health percentage may report as unavailable or uncalibrated depending on OEM firmware restrictions.

---

## ✨ Features Overview

### 1. Smart Package Management & Layered Catalog
* **5,400+ Classified Packages**: Layered classification leveraging the [Universal Android Debloater (UAD)](https://github.com/Universal-Debloater-Alliance/universal-android-debloater-next-generation) database, OEM brand dictionaries, and curated safety tiers.
* **Risk Categorization**: Clear badges for **Safe** (100% bloatware), **Caution** (feature-dependent), **Dangerous** (protected/system-critical), and **Unknown**.
* **Reversible Uninstalls**: Uses `pm uninstall -k --user 0` to disable packages for User 0 while preserving user data and system partition integrity.
* **One-Click Reinstall**: Easily restore uninstalled packages anytime from the **Removed** tab.

![Apps Manager](assets/apps-manager.png)

---

### 2. AI-Powered Smart Cleanup & Optimization Assistant
* **Autonomous Package Analysis**: Connect your preferred AI model (NVIDIA Nemotron, Google Gemini, OpenAI, Groq, OpenRouter, or local Ollama) to analyze your specific device package manifest.
* **Custom Cleanup Plans**: AI reads your installed packages, cross-references with UAD risk lists, and generates a tailored debloat proposal grouped by purpose (e.g. carrier apps, redundant OEM bloat, telemetry).
* **Interactive AI Chat**: Ask natural language questions like *"Can I safely remove Samsung Kids or Quick Share without breaking Bluetooth?"* directly inside the app.

![AI Smart Cleanup](assets/ai-cleanup.png)

---

### 3. One-Click Debloat Presets
Quickly optimize devices with tested debloat profiles:
* **Minimal Cleanup**: Removes obvious bloatware (Bixby, promo apps, novelty watch faces, carrier diagnostics).
* **iPhone Efficiency**: Removes safe bloatware and restricts background execution for aggressive power-hungry apps for a clean, snappy iOS-like standby experience.
* **Aggressive**: Strips non-essential OEM suites for maximum battery life and RAM headroom.

![Presets](assets/presets.png)

---

### 4. Interactive Wireless ADB Setup & Auto Blocker Guide
* **Interactive 5-Step Tutorial**: Built-in modal walks users through unlocking Developer Options, wireless pairing, and dual-port configurations.
* **Samsung One UI 6+ Auto Blocker Fix**: Detailed interactive guide on disabling Samsung's Auto Blocker (`Settings > Security and privacy > Auto Blocker`) which blocks wireless ADB handshakes and cable commands.
* **Dual-Port Demystification**: Clear visual breakdown explaining the difference between the rotating pairing port and the persistent connection port.

---

### 5. Deep Security Audit & Knox Verification
* **Security Scanner**: Inspects active **Device Administrators**, **Notification Listeners**, **Draw-over-other-apps (Overlay)** privileges, and audits **Sideloaded apps** installed from outside official stores.
* **Samsung Knox & Warranty Bit**: Verifies hardware `warranty_bit` (`0x0`), verified boot state (`green`), and bootloader lock integrity.

![Security Audit](assets/security-scan.png)
![Settings & Knox](assets/settings-knox.png)

---

### 6. Hardware Optimization & System Tweaks
* **Performance Speedup**: Tune animation scaling (`0.5x` / off) for an instant snappier feel.
* **Background Scanning**: Disable always-on Wi-Fi and Bluetooth background scanning to save battery.
* **Storage TRIM**: Run manual hardware `fstrim` across flash storage partitions to reclaim deleted flash blocks and maintain high write speeds.
* **Granular Permission Manager**: Inspect and revoke sensitive runtime permissions (Location, Contacts, Call Logs, Storage) per application.

![System Optimizer](assets/optimizer.png)

---

## 📋 Requirements

* **Python 3.6+** (Standard library only — zero pip dependencies required)
* **ADB** (Android Debug Bridge)
  * **macOS**: `brew install android-platform-tools`
  * **Debian / Ubuntu**: `sudo apt install adb`
  * **Fedora**: `sudo dnf install android-tools`
  * **Arch Linux**: `sudo pacman -S android-tools`
  * **Windows**: Download standalone binaries from [Android SDK Platform Tools](https://developer.android.com/tools/releases/platform-tools)
* **Wireless Debugging** or **USB Debugging** enabled on the Android device.

---

## 🚀 Quick Start

SAMurai includes smart, zero-friction launchers for every operating system that automatically detect your environment, auto-discover ADB in standard Android SDK paths if missing from `$PATH`, and resolve Python 3 or Astral's `uv`:

### macOS (One-Click)
1. Clone the repository:
   ```bash
   git clone https://github.com/antonysamuel/SAMurai-Android-Debloater.git
   cd SAMurai-Android-Debloater
   ```
2. Double-click `SAMurai.command` in Finder (or run `./SAMurai.sh` in Terminal).
3. The dashboard will automatically launch at `http://127.0.0.1:8080`.

### Linux (One-Click or Terminal)
1. Clone the repository:
   ```bash
   git clone https://github.com/antonysamuel/SAMurai-Android-Debloater.git
   cd SAMurai-Android-Debloater
   ```
2. Run `./SAMurai.sh` (or double-click it in your desktop file manager).
3. The dashboard will open in your default browser.

### Windows (Double-Click or Command Prompt)
1. Clone the repository:
   ```cmd
   git clone https://github.com/antonysamuel/SAMurai-Android-Debloater.git
   cd SAMurai-Android-Debloater
   ```
2. Double-click `SAMurai.bat` (or run `python debloater.py`).
3. The dashboard will open automatically.

> [!TIP]
> **Smart Runtime Resolution**: If system Python 3 is not installed or configured, the launcher automatically checks for Astral's `uv` (`uv run python`), offers one-click zero-root setup, and auto-discovers Android SDK platform-tools in your user directory.

---

## 📱 Wireless Connection Guide

1. **Samsung One UI 6.0+ Users**:
   Open **Settings → Security and privacy → Auto Blocker** and toggle it **OFF**.
2. **Enable Wireless Debugging**:
   Go to **Settings → Developer Options → Wireless Debugging** and toggle it **ON**.
3. **Pair the Device**:
   * Tap *"Pair device with pairing code"*.
   * In SAMurai's Dashboard, enter the IP, the 5-digit **Pairing Port** from the dialog, and the 6-digit **Code**.
   * Click **Pair**.
4. **Connect**:
   * Note the main IP & Port shown on the parent Wireless Debugging screen (not the pairing port).
   * Enter the port and click **Connect**.
5. Once connected, your device model, real-time battery stats, and package counts will appear on the dashboard.

---

## 📁 Project Architecture

```
SAMurai/
├── debloater.py              # Application entrypoint & HTTP server bootstrap
├── SAMurai.command           # macOS double-click launcher
├── SAMurai.sh                # Linux & macOS smart shell launcher
├── SAMurai.bat               # Windows double-click launcher
├── assets/                   # Screenshots and UI media
│   ├── dashboard.png
│   ├── apps-manager.png
│   ├── ai-cleanup.png
│   ├── presets.png
│   ├── permissions.png
│   ├── processes.png
│   ├── security-scan.png
│   ├── settings-knox.png
│   └── optimizer.png
├── src/                      # Pure Python stdlib backend (Zero external dependencies)
│   ├── adb.py                # ADB command execution & output parsing
│   ├── ai.py                 # Multi-provider AI interface (OpenAI, Gemini, Ollama)
│   ├── battery.py            # Battery metrics, ASOC calibration, charging controls
│   ├── database.py           # Layered JSON databases & GitHub UAD auto-sync
│   ├── devices.py            # Device listing, brand discovery, and device classification
│   ├── packages.py           # Package listing, removal, restoration, and presets
│   ├── security.py           # Security scanner, permission manager, process inspector
│   ├── server.py             # Built-in HTTP server & REST API handlers
│   └── settings.py           # Default apps, Private DNS, Knox warranty status
├── data/
│   ├── packages.json         # Custom curated package classifications
│   ├── brands.json           # OEM-specific bloatware database
│   ├── presets.json          # Minimal, iPhone Efficiency, and Aggressive profiles
│   └── uad.json              # 5,400+ UAD community entries (auto-synced every 24h)
└── web/
    ├── index.html            # Dark-mode interface
    ├── app.js                # Frontend controllers, Activity Console & tutorials
    └── style.css             # Stylesheet (SAMurai dark design tokens)
```

---

## 🛡️ Safety & Restoration Notes

* **Non-Destructive**: All removals use Android's user-space command `pm uninstall -k --user 0`. The APK remains in the read-only `/system` partition, and your application data is preserved.
* **Instant Undo**: Any removed package can be restored with a single click in the **Apps → Removed** tab.
* **Knox-Safe**: Debloating via ADB **never trips Samsung Knox** (warranty bit remains `0x0`). Knox is only tripped by flashing unauthorized custom recovery/kernels.
* **Factory Reset Safe**: Performing a factory reset on the phone will restore all OEM apps to factory state.
* **No Root Required**: Works completely over standard ADB permissions without rooting or unlocking the bootloader.

---

## 📄 License

This project is licensed under the [MIT License](LICENSE).
