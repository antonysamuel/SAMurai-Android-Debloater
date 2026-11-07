# Contributing to SAMurai

Thank you for your interest in contributing to SAMurai! We welcome pull requests, bug fixes, package classifications, and feedback from open-source developers.

## Core Architectural Principles

Before writing code, please keep our core rules in mind:
1. **Zero External Dependencies**: SAMurai must run on a clean machine with standard Python 3. No `pip install`, no `node_modules`, no npm build steps.
2. **Vanilla Frontend**: Pure HTML5, modern CSS3 (custom properties), and vanilla ES6+ JavaScript.
3. **Safe by Default**: Package removals must remain non-destructive user-space uninstalls (`pm uninstall -k --user 0`) to preserve user data and allow instant reinstallation.

---

## Areas Where You Can Help

### 1. Expanding Package Databases
Most contributions involve adding or refining package classifications:
* **Custom / Global packages**: Edit `data/packages.json`
* **Brand-specific packages**: Edit `data/brands.json` (Samsung, Xiaomi, OnePlus, Realme, OPPO, Vivo, Pixel, etc.)
* **Debloat presets**: Propose new curated presets in `data/presets.json`

Example format:
```json
"com.samsung.android.app.routines": {
  "name": "Bixby Routines",
  "category": "Bloatware",
  "risk": "safe",
  "desc": "Automation routines service. Safe to remove if you do not use automated triggers."
}
```

### 2. Device Compatibility Testing
Test SAMurai on different Android models (especially non-Samsung devices like Pixel, Xiaomi HyperOS, ColorOS, OxygenOS) and report or submit fixes for device-specific quirks.

---

## Submitting a Pull Request

1. **Fork the repository** on GitHub.
2. **Create a feature branch**:
   ```bash
   git checkout -b feat/my-improvement
   ```
3. **Verify syntax**:
   ```bash
   python3 -m py_compile src/*.py debloater.py
   bash -n SAMurai.sh
   ```
4. **Commit with clean commit messages**:
   ```bash
   git commit -m "feat(packages): add Xiaomi HyperOS telemetry classifications"
   ```
5. **Push and open a PR** against the `main` branch.
