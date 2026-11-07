/* SAMurai — frontend */

let selectedDevice = null;
let allPackages = [];
let selectedPkgs = new Set();

// ── API helper ──

async function api(method, path, body) {
    const opts = { method, headers: { 'Content-Type': 'application/json' } };
    if (body) opts.body = JSON.stringify(body);
    try {
        const res = await fetch(path, opts);
        return await res.json();
    } catch (e) {
        log(`Network API Error [${method} ${path}]: ${e.message}`, 'error', { cat: 'SYS', details: e.stack || e.message });
        return { error: e.message };
    }
}

function enc(s) { return encodeURIComponent(s); }

// ── Logging & Activity Console ──

let activityLogs = [];
let logFilter = 'all';
let logSearchQuery = '';
let logSortOrder = 'newest';
let logAutoScroll = true;
let logMaximized = false;
let logOpen = false;
let logCount = 0;
let logSeq = 0;

function esc(s) {
    const d = document.createElement('div');
    d.textContent = s;
    return d.innerHTML;
}

function log(msg, type = 'info', meta = null) {
    logSeq++;
    const now = new Date();
    const timeStr = now.toLocaleTimeString([], { hour12: false, hour: '2-digit', minute: '2-digit', second: '2-digit' });
    const fullTimeStr = `${timeStr}.${String(now.getMilliseconds()).padStart(3, '0')}`;

    // Infer category if not provided
    let cat = (meta && meta.cat) ? String(meta.cat).toUpperCase() : '';
    if (!cat) {
        const text = String(msg).toLowerCase();
        if (/pair|connect|dumpsys|adb|shell|reboot|serial|offline|online|device|scan/.test(text)) cat = 'ADB';
        else if (/package|preset|uninstall|restore|uad|db|catalog|installed|removed/.test(text)) cat = 'PKG';
        else if (/ai|model|nemotron|gemini|openai|ollama|groq|openrouter|prompt|chat/.test(text)) cat = 'AI';
        else if (/security|permission|perm|admin|accessib|privilege|knox|warranty/.test(text)) cat = 'SEC';
        else if (/battery|charge|temp|health|asoc|trim|optim/.test(text)) cat = 'BAT';
        else cat = 'SYS';
    }

    const device = (meta && meta.device) || (typeof selectedDevice !== 'undefined' ? selectedDevice : '') || '';
    
    // Check if message itself is multiline
    let displayMsg = msg;
    let details = meta && meta.details ? meta.details : null;
    if (typeof msg === 'string' && msg.includes('\n') && !details) {
        const lines = msg.split('\n');
        displayMsg = lines[0].trim() || 'Command Output';
        details = msg;
    }

    // Format details object to string if needed
    if (details && typeof details !== 'string') {
        try {
            details = JSON.stringify(details, null, 2);
        } catch (_) {
            details = String(details);
        }
    }

    const entry = {
        id: logSeq,
        timestamp: now,
        timeStr,
        fullTimeStr,
        type: type || 'info',
        cat,
        device,
        message: String(displayMsg),
        details: details ? String(details) : null,
        expanded: false
    };

    // Prepend to array so newest is at index 0
    activityLogs.unshift(entry);

    // Limit memory log to 500 entries
    if (activityLogs.length > 500) {
        activityLogs.pop();
    }

    if (!logOpen) {
        logCount++;
        const badge = document.getElementById('log-count');
        if (badge) {
            badge.textContent = logCount;
            badge.classList.remove('hidden');
        }
    }

    renderLogs();
}

function renderLogs() {
    const el = document.getElementById('log');
    if (!el) return;

    // Filter by category / type
    let filtered = activityLogs.filter(item => {
        if (logFilter === 'error') return item.type === 'error';
        if (logFilter === 'warn') return item.type === 'warn';
        if (logFilter === 'adb') return (item.cat || '').toUpperCase() === 'ADB';
        if (logFilter === 'ai') return (item.cat || '').toUpperCase() === 'AI';
        return true;
    });

    // Filter by search query
    if (logSearchQuery) {
        filtered = filtered.filter(item => {
            const haystack = `${item.message} ${item.cat} ${item.type} ${item.device} ${item.details || ''}`.toLowerCase();
            return haystack.includes(logSearchQuery);
        });
    }

    // Sort order
    if (logSortOrder === 'oldest') {
        filtered = [...filtered].sort((a, b) => a.id - b.id);
    } else {
        filtered = [...filtered].sort((a, b) => b.id - a.id);
    }

    // Update chip counts
    const countAll = activityLogs.length;
    const countError = activityLogs.filter(i => i.type === 'error').length;
    const countWarn = activityLogs.filter(i => i.type === 'warn').length;
    const countAdb = activityLogs.filter(i => (i.cat || '').toUpperCase() === 'ADB').length;
    const countAi = activityLogs.filter(i => (i.cat || '').toUpperCase() === 'AI').length;

    updateElemText('chip-all-count', countAll);
    updateElemText('chip-error-count', countError);
    updateElemText('chip-warn-count', countWarn);
    updateElemText('chip-adb-count', countAdb);
    updateElemText('chip-ai-count', countAi);

    // Update status text
    const summary = document.getElementById('log-stat-summary');
    if (summary) {
        const errorPart = countError > 0 ? `, ${countError} error${countError > 1 ? 's' : ''}` : '';
        const warnPart = countWarn > 0 ? `, ${countWarn} warn` : '';
        summary.textContent = `${countAll} event${countAll === 1 ? '' : 's'}${errorPart}${warnPart}`;
    }

    const filterStatus = document.getElementById('log-filter-status');
    if (filterStatus) {
        filterStatus.textContent = logSearchQuery 
            ? `Showing ${filtered.length} of ${countAll} (matching "${esc(logSearchQuery)}")` 
            : `Showing ${filtered.length} of ${countAll} events (${logSortOrder === 'newest' ? 'newest first' : 'oldest first'})`;
    }

    if (!filtered.length) {
        el.innerHTML = `<div style="text-align:center;padding:1.5rem;color:#71717a;font-size:11px;">
            ${countAll === 0 ? 'No activity logged yet.' : 'No entries matching current filter.'}
        </div>`;
        return;
    }

    el.innerHTML = filtered.map(item => {
        const devBadge = item.device ? `<span class="log-dev-pill" title="Target Device">@${esc(item.device)}</span>` : '';
        const detailsBtn = item.details ? `
            <button class="log-details-toggle" onclick="toggleLogDetails(${item.id})" title="Inspect full output / payload">
                ${item.expanded ? 'Hide details &#9652;' : 'Details &#9662;'}
            </button>` : '';

        const detailsBlock = (item.details && item.expanded) ? `
            <div class="log-details-box">
                <button class="log-details-copy-btn" onclick="copyTextToClipboard(event, ${item.id})" title="Copy this output">Copy</button>
                <code>${esc(item.details)}</code>
            </div>` : '';

        return `
        <div class="log-row log-${esc(item.type)}" id="log-row-${item.id}">
            <span class="log-time" title="${item.fullTimeStr}">${item.timeStr}</span>
            <span class="log-level-pill ${item.type}">${item.type}</span>
            <span class="log-cat-pill">${item.cat}</span>
            ${devBadge}
            <span class="log-msg-text">${esc(item.message)}</span>
            ${detailsBtn}
            <button class="log-row-copy" onclick="copyRowText(event, ${item.id})" title="Copy row to clipboard">&#128203;</button>
            ${detailsBlock}
        </div>`;
    }).join('');

    if (logAutoScroll && logOpen) {
        const wrap = document.getElementById('log-entries-wrap');
        if (wrap) {
            wrap.scrollTop = logSortOrder === 'newest' ? 0 : wrap.scrollHeight;
        }
    }
}

function updateElemText(id, text) {
    const el = document.getElementById(id);
    if (el) el.textContent = text;
}

function toggleLogSort() {
    logSortOrder = logSortOrder === 'newest' ? 'oldest' : 'newest';
    const btn = document.getElementById('log-sort-btn');
    if (btn) btn.innerHTML = `<span>${logSortOrder === 'newest' ? '&#8595; Newest' : '&#8593; Oldest'}</span>`;
    renderLogs();
}

function toggleLog() {
    logOpen = !logOpen;
    const drawer = document.getElementById('log-drawer');
    const body = document.getElementById('log-body');
    const badge = document.getElementById('log-count');

    if (drawer) drawer.classList.toggle('open', logOpen);
    if (body) body.classList.toggle('hidden', !logOpen);

    if (logOpen) {
        logCount = 0;
        if (badge) badge.classList.add('hidden');
        renderLogs();
    }
}

function toggleLogHeight() {
    logMaximized = !logMaximized;
    const drawer = document.getElementById('log-drawer');
    if (drawer) drawer.classList.toggle('maximized', logMaximized);
    const btn = document.getElementById('log-height-btn');
    if (btn) {
        btn.title = logMaximized ? 'Minimize Console Height' : 'Expand / Maximize Console';
    }
}

function filterLogs(filter) {
    logFilter = filter;
    document.querySelectorAll('.log-chip').forEach(b => {
        b.classList.toggle('active', b.dataset.filter === filter);
    });
    renderLogs();
}

function onLogSearchInput(val) {
    logSearchQuery = (val || '').trim().toLowerCase();
    const clearBtn = document.getElementById('log-search-clear');
    if (clearBtn) clearBtn.classList.toggle('hidden', !logSearchQuery);
    renderLogs();
}

function clearLogSearch() {
    const input = document.getElementById('log-search-input');
    if (input) input.value = '';
    onLogSearchInput('');
}

function toggleAutoScroll(val) {
    logAutoScroll = !!val;
}

function toggleLogDetails(id) {
    const item = activityLogs.find(i => i.id === id);
    if (item) {
        item.expanded = !item.expanded;
        renderLogs();
    }
}

function copyRowText(e, id) {
    e.stopPropagation();
    const item = activityLogs.find(i => i.id === id);
    if (!item) return;
    const text = `[${item.fullTimeStr}] [${item.type.toUpperCase()}] [${item.cat}] ${item.device ? '@' + item.device + ' ' : ''}${item.message}${item.details ? '\n--- Details ---\n' + item.details : ''}`;
    navigator.clipboard.writeText(text).then(() => {
        showCopyNotification('Copied log line!');
    });
}

function copyTextToClipboard(e, id) {
    e.stopPropagation();
    const item = activityLogs.find(i => i.id === id);
    if (!item || !item.details) return;
    navigator.clipboard.writeText(item.details).then(() => {
        showCopyNotification('Copied raw details!');
    });
}

function copyAllLogs() {
    if (!activityLogs.length) return;
    const text = activityLogs.map(item => {
        return `[${item.timestamp.toISOString()}] [${item.type.toUpperCase()}] [${item.cat}] ${item.device ? '@' + item.device + ' ' : ''}${item.message}${item.details ? '\n' + item.details : ''}`;
    }).join('\n');
    navigator.clipboard.writeText(text).then(() => {
        showCopyNotification(`Copied ${activityLogs.length} log entries!`);
    });
}

function exportLogs() {
    if (!activityLogs.length) return;
    const header = `========================================================\nSAMurai Activity & ADB Console Log\nExported: ${new Date().toISOString()}\nTotal events: ${activityLogs.length}\n========================================================\n\n`;
    const body = activityLogs.map(item => {
        let entry = `[${item.timestamp.toISOString()}] [${item.type.toUpperCase()}] [${item.cat}] ${item.device ? '@' + item.device + ' ' : ''}${item.message}`;
        if (item.details) {
            entry += `\n--- Output / Details ---\n${item.details}\n------------------------`;
        }
        return entry;
    }).join('\n\n');

    const blob = new Blob([header + body], { type: 'text/plain;charset=utf-8' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = `samurai-activity-${new Date().toISOString().slice(0, 10)}.log`;
    document.body.appendChild(a);
    a.click();
    document.body.removeChild(a);
    URL.revokeObjectURL(url);
    log('Activity log exported to file.', 'success', { cat: 'SYS' });
}

function clearLogs() {
    activityLogs = [];
    logCount = 0;
    renderLogs();
    log('Activity log console cleared.', 'info', { cat: 'SYS' });
}

function showCopyNotification(msg) {
    const tip = document.createElement('div');
    tip.style.cssText = 'position:fixed;bottom:50px;right:20px;background:#27272a;color:#fff;border:1px solid #38bdf8;padding:5px 12px;border-radius:6px;font-size:11px;z-index:9999;box-shadow:0 4px 12px rgba(0,0,0,0.5);animation:toastPopIn .2s ease;';
    tip.textContent = msg;
    document.body.appendChild(tip);
    setTimeout(() => tip.remove(), 1800);
}

// ── Navigation ──

function showView(name) {
    document.querySelectorAll('.view').forEach(v => v.classList.remove('active'));
    document.querySelectorAll('.nav-item').forEach(n => n.classList.remove('active'));
    const view = document.getElementById('view-' + name);
    const nav = document.querySelector(`.nav-item[data-view="${name}"]`);
    if (view) view.classList.add('active');
    if (nav) nav.classList.add('active');

    if (selectedDevice) {
        if (name === 'apps') loadPackages();
        if (name === 'processes') loadProcesses();
        if (name === 'permissions') {}
        if (name === 'settings') { loadDefaults(); loadDns(); loadKnox(); loadCharge(); }
    }
}

// ── Device connection ──

let isRefreshingDevices = false;
async function refreshDevices(silent = false) {
    if (isRefreshingDevices) return;
    isRefreshingDevices = true;
    try {
        const data = await api('GET', '/api/devices');
        const list = document.getElementById('devices-list');
        if (!Array.isArray(data) || !data.length) {
            list.innerHTML = `
            <div class="no-devices-card">
                <div class="ndc-icon">
                    <svg width="26" height="26" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round">
                        <rect x="5" y="2" width="14" height="20" rx="3"/>
                        <circle cx="12" cy="18" r="1" fill="currentColor"/>
                        <path d="M8.5 7a5 5 0 0 1 7 0"/>
                        <path d="M10 9a2.5 2.5 0 0 1 4 0"/>
                    </svg>
                </div>
                <h3>No Devices Connected</h3>
                <p>Connect your phone wirelessly or with a USB cable to begin debloating and optimizing.</p>
                <div class="ndc-checklist">
                    <div class="ndc-check-item"><span>📶</span> Ensure Phone &amp; PC are on the same Wi-Fi</div>
                    <div class="ndc-check-item warning"><span>🛡️</span> <strong>Samsung:</strong> Auto Blocker must be <strong>OFF</strong></div>
                    <div class="ndc-check-item"><span>⚙️</span> Enable Wireless Debugging in Developer Options</div>
                </div>
                <div class="ndc-actions">
                    <button class="btn btn-primary" onclick="openWirelessGuide()">
                        <span>Launch Wireless Setup Demo</span>
                    </button>
                    <button class="btn btn-ghost" onclick="refreshDevices()">
                        <span>Scan Again</span>
                    </button>
                </div>
            </div>`;
            if (!silent) {
                log('ADB scan: No connected devices found.', 'info', {
                    cat: 'ADB',
                    details: 'No active ADB devices detected.\n• USB: Ensure USB debugging is toggled on and authorized.\n• Wireless: Tap "Pair device with pairing code" and enter the pairing port and code.\n• Samsung One UI 6+: Disable Auto Blocker in Security settings.'
                });
            }
            return;
        }

        const deviceSummary = data.map(d => `• ${d.model || 'Unknown'} (${d.address}) | Type: ${d.device_type || 'phone'} | Battery: ${d.battery_level ? d.battery_level + '%' : 'N/A'} | ASOC: ${d.battery_health ? d.battery_health + '%' : 'N/A'} | Brand: ${d.brand || 'Android'}`).join('\n');
        
        if (!silent) {
            log(`ADB scan: ${data.length} device(s) online`, 'success', {
                cat: 'ADB',
                details: `Discovered active endpoints:\n${deviceSummary}`
            });
        }

        list.innerHTML = data.map(d => {
            const battBadge = d.battery_level ? `<span class="dc-batt">${d.battery_level}%</span>` : '';
            const healthBadge = d.battery_health ? `<span class="dc-health">ASOC ${d.battery_health}%</span>` : '';
            const brandLabel = d.brand ? `<span class="dc-brand">${esc(d.brand)}</span>` : '';
            return `
            <div class="device-card ${selectedDevice === d.address ? 'selected' : ''}"
                 onclick="selectDevice('${d.address}','${esc(d.model || 'Device')}','${d.device_type || 'phone'}')">
                <div class="device-dot online"></div>
                <div class="dc-info">
                    <div class="dc-model">${esc(d.model || 'Unknown')} ${d.device_type === 'watch' ? '(Watch)' : ''}</div>
                    <div class="dc-addr">${d.address} ${brandLabel}</div>
                    <div class="dc-stats">${battBadge} ${healthBadge}</div>
                </div>
            </div>`;
        }).join('');

        if (!selectedDevice && data.length > 0) {
            await selectDevice(data[0].address, data[0].model || 'Device', data[0].device_type || 'phone', true);
        }
    } finally {
        isRefreshingDevices = false;
    }
}

function showConnectTroubleshoot(msg) {
    const el = document.getElementById('connect-troubleshoot');
    if (!el) return;
    el.classList.remove('hidden');
    el.innerHTML = `
        <div class="troubleshoot-icon">⚠️</div>
        <div class="troubleshoot-body">
            <div class="troubleshoot-title">Connection / Pairing Unsuccessful</div>
            <div class="troubleshoot-text">${esc(msg)}</div>
            <div class="troubleshoot-samsung-alert">
                <strong>🛡️ Samsung Users (One UI 6.0+):</strong> Samsung's <strong>Auto Blocker</strong> actively blocks wireless debugging and cable commands! Go to <strong>Settings → Security and privacy → Auto Blocker</strong> and turn it <strong>OFF</strong>. Also ensure the pairing port in the popup matches what you typed.
            </div>
            <div class="troubleshoot-actions">
                <button class="btn btn-sm btn-primary" onclick="openWirelessGuide(2, 'samsung')">Open Samsung Auto Blocker Fix</button>
                <button class="btn btn-sm btn-ghost" onclick="hideConnectTroubleshoot()">Dismiss</button>
            </div>
        </div>`;
}

function hideConnectTroubleshoot() {
    const el = document.getElementById('connect-troubleshoot');
    if (el) el.classList.add('hidden');
}

async function pairDevice() {
    const ip = document.getElementById('pair-ip').value.trim();
    const port = document.getElementById('pair-port').value.trim();
    const code = document.getElementById('pair-code').value.trim();
    if (!ip || !port || !code) return log('Fill in all pairing fields.', 'error', { cat: 'ADB' });
    log(`Pairing with ${ip}:${port}…`, 'info', { cat: 'ADB', device: `${ip}:${port}`, details: `Command: adb pair ${ip}:${port} [code hidden]` });
    const r = await api('POST', '/api/pair', { ip, port, code });
    const details = `Target: ${ip}:${port}\nResult: ${r.message || r.error || 'No output'}\nSuccess: ${r.success}`;
    log(r.message || r.error, r.success ? 'success' : 'error', { cat: 'ADB', device: `${ip}:${port}`, details });
    if (r.success) {
        document.getElementById('conn-ip').value = ip;
        hideConnectTroubleshoot();
    } else {
        showConnectTroubleshoot(r.message || r.error || 'Pairing failed. Check code and port.');
    }
}

async function connectDevice() {
    const ip = document.getElementById('conn-ip').value.trim();
    const port = document.getElementById('conn-port').value.trim();
    if (!ip || !port) return log('Fill in IP and port.', 'error', { cat: 'ADB' });
    log(`Connecting to ${ip}:${port}…`, 'info', { cat: 'ADB', device: `${ip}:${port}`, details: `Command: adb connect ${ip}:${port}` });
    const r = await api('POST', '/api/connect', { ip, port });
    const details = `Target: ${ip}:${port}\nResult: ${r.message || r.error || 'No output'}\nSuccess: ${r.success}`;
    log(r.message || r.error, r.success ? 'success' : 'error', { cat: 'ADB', device: `${ip}:${port}`, details });
    if (r.success) {
        hideConnectTroubleshoot();
        await refreshDevices();
    } else {
        showConnectTroubleshoot(r.message || r.error || 'Connection failed. Check IP and port.');
    }
}

async function selectDevice(addr, model, type, skipRefresh = false) {
    selectedDevice = addr;
    const ind = document.getElementById('sidebar-device');
    ind.innerHTML = `<span class="device-dot online"></span><span class="device-label" title="${addr}">${esc(model)}</span>`;
    
    document.querySelectorAll('.device-card').forEach(el => {
        if (el.getAttribute('onclick')?.includes(addr)) {
            el.classList.add('selected');
        } else {
            el.classList.remove('selected');
        }
    });

    log(`Active device: ${model} (${addr})`, 'info', {
        cat: 'ADB',
        device: addr,
        details: `Model: ${model}\nAddress: ${addr}\nType: ${type}\nStatus: Active (ready for debloat and diagnostics)`
    });

    if (!skipRefresh) {
        await refreshDevices(true);
    }
    loadQuickStats();
}

async function loadQuickStats() {
    if (!selectedDevice) return;
    const el = document.getElementById('quick-stats');
    el.classList.remove('hidden');
    const batt = await api('GET', `/api/battery?device=${enc(selectedDevice)}`);
    document.getElementById('qs-battery').textContent = (batt.level || '?') + '%';
    document.getElementById('qs-temp').textContent = batt.temperature ? (parseInt(batt.temperature) / 10).toFixed(1) + '°C' : '—';
    document.getElementById('qs-health').textContent = (batt.mSavedBatteryAsoc || '?') + '%';

    const pkgs = await api('GET', `/api/packages?device=${enc(selectedDevice)}`);
    const count = pkgs.packages ? pkgs.packages.length : 0;
    if (pkgs.packages) {
        document.getElementById('qs-packages').textContent = count;
    }

    const tempStr = batt.temperature ? (parseInt(batt.temperature) / 10).toFixed(1) + '°C' : 'N/A';
    log(`Device stats: Battery ${batt.level || '?'}%, ASOC ${batt.mSavedBatteryAsoc || '?'}%, ${count} packages`, 'info', {
        cat: 'BAT',
        device: selectedDevice,
        details: `Device: ${selectedDevice}\nBattery Level: ${batt.level || '?'}%\nHealth (ASOC): ${batt.mSavedBatteryAsoc || '?'}%\nTemperature: ${tempStr}\nVoltage: ${batt.voltage || 'N/A'}\nInstalled Packages: ${count}`
    });
}

// ── Apps view ──

function switchAppTab(tab) {
    document.querySelectorAll('.sub-tab').forEach(t => t.classList.remove('active'));
    if (tab === 'installed') {
        document.querySelectorAll('.sub-tab')[0].classList.add('active');
        document.getElementById('apps-installed-tab').classList.remove('hidden');
        document.getElementById('apps-removed-tab').classList.add('hidden');
    } else {
        document.querySelectorAll('.sub-tab')[1].classList.add('active');
        document.getElementById('apps-installed-tab').classList.add('hidden');
        document.getElementById('apps-removed-tab').classList.remove('hidden');
        loadRemoved();
    }
}

async function loadPackages() {
    if (!selectedDevice) return;
    const list = document.getElementById('packages-list');
    list.innerHTML = '<div class="loading"><div class="spinner"></div><br>Loading packages…</div>';
    const data = await api('GET', `/api/packages?device=${enc(selectedDevice)}`);
    if (data.error) { list.innerHTML = `<p class="empty">${esc(data.error)}</p>`; return; }
    allPackages = data.packages || [];
    selectedPkgs.clear();
    populateCatFilter();
    renderPackages();
    log(`Loaded ${allPackages.length} packages from ${selectedDevice}`, 'success', {
        cat: 'PKG',
        device: selectedDevice,
        details: `Loaded ${allPackages.length} packages with UAD metadata.\nAvailable categories: ${[...new Set(allPackages.map(p => p.category))].join(', ')}`
    });
}

function populateCatFilter() {
    const cats = [...new Set(allPackages.map(p => p.category))].sort();
    document.getElementById('filter-cat').innerHTML = '<option value="all">All categories</option>' +
        cats.map(c => `<option value="${c}">${c} (${allPackages.filter(p => p.category === c).length})</option>`).join('');
}

function visiblePackages() {
    const q = document.getElementById('search-apps').value.toLowerCase();
    const cat = document.getElementById('filter-cat').value;
    const risk = document.getElementById('filter-risk').value;
    return allPackages.filter(p => {
        if (q && !p.name.toLowerCase().includes(q) && !p.id.toLowerCase().includes(q)) return false;
        if (cat !== 'all' && p.category !== cat) return false;
        if (risk !== 'all' && p.risk !== risk) return false;
        return true;
    });
}

function renderPackages() {
    const vis = visiblePackages();
    const counts = { safe: 0, caution: 0, unknown: 0, dangerous: 0 };
    allPackages.forEach(p => { if (counts[p.risk] !== undefined) counts[p.risk]++; });

    document.getElementById('stats-row').innerHTML = `
        <span class="stat-chip"><span class="risk-dot safe"></span> ${counts.safe} safe</span>
        <span class="stat-chip"><span class="risk-dot caution"></span> ${counts.caution} caution</span>
        <span class="stat-chip"><span class="risk-dot unknown"></span> ${counts.unknown} unknown</span>
        <span class="stat-chip"><span class="risk-dot dangerous"></span> ${counts.dangerous} system</span>
        <span style="margin-left:auto">${vis.length} of ${allPackages.length} shown</span>
    `;

    const list = document.getElementById('packages-list');
    if (!vis.length) { list.innerHTML = '<p class="empty">No packages match your filters.</p>'; return; }

    list.innerHTML = vis.map(p => `
        <div class="pkg-row" id="pkg-${CSS.escape(p.id)}">
            <input type="checkbox" ${selectedPkgs.has(p.id) ? 'checked' : ''} ${p.risk === 'dangerous' ? 'disabled' : ''}
                   onchange="togglePkg('${p.id}',this.checked)">
            <div class="pkg-info">
                <span class="pkg-name">${esc(p.name)}</span>
                <span class="pkg-id">${p.id}</span>
                ${p.desc ? `<span class="pkg-desc">${esc(p.desc)}</span>` : ''}
            </div>
            <div class="pkg-badges">
                <span class="pkg-category">${esc(p.category)}</span>
                <span class="risk-badge risk-${p.risk}">${p.risk}</span>
                ${p.source === 'uad' ? '<span class="source-badge uad">UAD</span>' : p.source === 'custom' ? '<span class="source-badge custom">CUSTOM</span>' : '<span class="source-badge" style="visibility:hidden">----</span>'}
            </div>
            <div class="pkg-actions">
                <button class="btn btn-ghost btn-sm" onclick="showPkgPerms('${p.id}')" title="Permissions">Perms</button>
                <button class="btn btn-danger btn-sm" ${p.risk === 'dangerous' ? 'disabled title="System critical"' : ''} onclick="removePkg('${p.id}')">Remove</button>
            </div>
        </div>
    `).join('');
    updateBatchBtn();
}

function filterPackages() { renderPackages(); }

function togglePkg(id, on) {
    if (on) selectedPkgs.add(id); else selectedPkgs.delete(id);
    updateBatchBtn();
}

function selectAllVisible() {
    visiblePackages().filter(p => p.risk !== 'dangerous').forEach(p => selectedPkgs.add(p.id));
    renderPackages();
}

function deselectAll() { selectedPkgs.clear(); renderPackages(); }

function updateBatchBtn() {
    const btn = document.getElementById('btn-batch');
    btn.textContent = `Remove selected (${selectedPkgs.size})`;
    btn.disabled = selectedPkgs.size === 0;
}

async function removePkg(id) {
    const p = allPackages.find(x => x.id === id);
    if (p?.risk === 'dangerous' && !confirm(`${p.name} is system critical.\nRemoving it may crash or bootloop your device.\n\nContinue anyway?`)) return;
    if (p?.risk === 'caution' && !confirm(`${p.name}: ${p.desc}\n\nSome features may stop working. Continue?`)) return;
    log(`Removing ${id}…`, 'warn', { cat: 'PKG', device: selectedDevice, details: `Target: ${id}\nName: ${p?.name || 'Unknown'}\nRisk: ${p?.risk || 'unknown'}` });
    const r = await api('POST', '/api/uninstall', { device: selectedDevice, package: id });
    const details = `Package: ${id}\nUser: 0\nStatus: ${r.success ? 'REMOVED' : 'FAILED'}\nMessage: ${r.message || ''}`;
    log(r.message || (r.success ? `Removed ${id}` : `Failed to remove ${id}`), r.success ? 'success' : 'error', { cat: 'PKG', device: selectedDevice, details });
    if (r.success) {
        allPackages = allPackages.filter(x => x.id !== id);
        selectedPkgs.delete(id);
        renderPackages();
    }
}

async function batchRemove() {
    const ids = [...selectedPkgs];
    if (!confirm(`Remove ${ids.length} packages?\n\nThis is reversible — you can restore them later.`)) return;
    log(`Batch removing ${ids.length} packages…`, 'warn', { cat: 'PKG', device: selectedDevice, details: `Selected packages (${ids.length}):\n${ids.join('\n')}` });
    const r = await api('POST', '/api/batch_uninstall', { device: selectedDevice, packages: ids });
    let ok = 0;
    const detailsList = [];
    for (const x of (r.results || [])) {
        if (x.success) {
            ok++;
            allPackages = allPackages.filter(p => p.id !== x.package);
            selectedPkgs.delete(x.package);
            detailsList.push(`✓ ${x.package}: REMOVED`);
        } else {
            detailsList.push(`✗ ${x.package}: FAILED - ${x.error || x.message || 'unknown error'}`);
            log(`Failed: ${x.package}`, 'error', { cat: 'PKG', device: selectedDevice, details: `${x.package}: ${x.error || x.message || 'Error'}` });
        }
    }
    log(`Batch uninstall: ${ok} of ${ids.length} packages removed`, ok === ids.length ? 'success' : (ok > 0 ? 'warn' : 'error'), {
        cat: 'PKG',
        device: selectedDevice,
        details: `Summary: ${ok}/${ids.length} removed\n\n${detailsList.join('\n')}`
    });
    renderPackages();
}

async function loadRemoved() {
    if (!selectedDevice) return;
    const list = document.getElementById('removed-list');
    list.innerHTML = '<div class="loading"><div class="spinner"></div><br>Loading…</div>';
    const data = await api('GET', `/api/disabled?device=${enc(selectedDevice)}`);
    const pkgs = data.packages || [];
    if (!pkgs.length) { list.innerHTML = '<p class="empty">Nothing has been removed yet.</p>'; return; }
    list.innerHTML = pkgs.map(p => `
        <div class="pkg-row">
            <div style="width:15px"></div>
            <div class="pkg-info">
                <span class="pkg-name">${esc(p.name)}</span>
                <span class="pkg-id">${p.id}</span>
            </div>
            <div class="pkg-badges">
                <span class="pkg-category">${esc(p.category)}</span>
                <span class="risk-badge risk-${p.risk}">${p.risk}</span>
            </div>
            <div class="pkg-actions">
                <button class="btn btn-sm" style="background:var(--safe)" onclick="restorePkg('${p.id}')">Restore</button>
            </div>
        </div>
    `).join('');
}

async function restorePkg(id) {
    log(`Restoring ${id}…`, 'info', { cat: 'PKG', device: selectedDevice, details: `Package: ${id}\nAction: pm install-existing --user 0 ${id}` });
    const r = await api('POST', '/api/restore', { device: selectedDevice, package: id });
    const details = `Package: ${id}\nUser: 0\nStatus: ${r.success ? 'RESTORED' : 'FAILED'}\nMessage: ${r.message || ''}`;
    log(r.message || (r.success ? `Restored ${id}` : `Failed to restore ${id}`), r.success ? 'success' : 'error', { cat: 'PKG', device: selectedDevice, details });
    if (r.success) { loadRemoved(); loadPackages(); }
}

// ── Presets ──

async function previewPreset(name) {
    if (!selectedDevice) return log('Connect a device first.', 'error');
    const el = document.getElementById('preset-preview');
    const list = document.getElementById('preset-preview-list');
    const title = document.getElementById('preset-preview-title');
    el.classList.remove('hidden');
    title.textContent = `Preview: ${name}`;
    list.innerHTML = '<div class="loading"><div class="spinner"></div><br>Analyzing packages…</div>';

    const pkgData = await api('GET', `/api/packages?device=${enc(selectedDevice)}`);
    const presets = await api('GET', '/api/presets');
    const preset = presets[name];
    if (!preset || !pkgData.packages) {
        list.innerHTML = '<p class="empty">Could not load preview.</p>';
        return;
    }

    const willRemove = pkgData.packages.filter(p =>
        p.risk !== 'dangerous' && (p.risk === 'safe' || (name === 'aggressive' && p.risk === 'caution'))
    );

    if (!willRemove.length) {
        list.innerHTML = '<p class="empty">Nothing to remove with this preset.</p>';
        return;
    }

    list.innerHTML = willRemove.map(p => `
        <div class="pkg-row">
            <div style="width:15px"></div>
            <div class="pkg-info"><span class="pkg-name">${esc(p.name)}</span><span class="pkg-id">${p.id}</span></div>
            <div class="pkg-badges">
                <span class="pkg-category">${esc(p.category)}</span>
                <span class="risk-badge risk-${p.risk}">${p.risk}</span>
            </div>
        </div>
    `).join('');
}

function hidePresetPreview() {
    document.getElementById('preset-preview').classList.add('hidden');
}

async function applyPreset(name) {
    if (!selectedDevice) return log('Connect a device first.', 'error', { cat: 'ADB' });
    if (!confirm(`Apply the "${name}" preset?\n\nThis will remove packages according to the profile. You can restore them later.`)) return;
    log(`Applying preset: ${name}…`, 'warn', { cat: 'PKG', device: selectedDevice, details: `Preset: ${name}\nDevice: ${selectedDevice}` });
    const r = await api('POST', '/api/preset', { device: selectedDevice, preset: name });
    if (r.success) {
        log(`Preset "${name}" applied: ${r.removed} removed, ${r.restricted} restricted, ${r.failed} failed`, r.failed > 0 ? 'warn' : 'success', {
            cat: 'PKG',
            device: selectedDevice,
            details: `Preset: ${name}\nRemoved: ${r.removed}\nRestricted: ${r.restricted}\nFailed: ${r.failed}\nRaw result: ${JSON.stringify(r, null, 2)}`
        });
    } else {
        log(r.message || 'Preset failed', 'error', { cat: 'PKG', device: selectedDevice, details: r.message || 'Preset application error' });
    }
}

// ── Permissions ──

async function showPkgPerms(pkg) {
    showView('permissions');
    const list = document.getElementById('permissions-list');
    list.innerHTML = '<div class="loading"><div class="spinner"></div><br>Loading permissions…</div>';
    const data = await api('GET', `/api/permissions?device=${enc(selectedDevice)}&package=${enc(pkg)}`);
    const perms = data.permissions || [];
    const granted = perms.filter(p => p.granted);

    if (!granted.length) {
        list.innerHTML = `<p class="empty">No dangerous runtime permissions granted for ${esc(pkg)}</p>`;
        return;
    }

    list.innerHTML = `<div class="section-header"><h2>${esc(pkg)}</h2></div>` +
        granted.map(p => `
        <div class="perm-row">
            <div>
                <div class="perm-name">${p.permission.replace('android.permission.', '')}</div>
                <div class="perm-id">${p.permission}</div>
            </div>
            <button class="btn btn-danger btn-sm" onclick="revokePermission('${pkg}','${p.permission}')">Revoke</button>
        </div>
    `).join('');
}

async function loadPermissionsForPkg() {
    const pkg = document.getElementById('search-perms').value.trim();
    if (!pkg || !selectedDevice) return;
    if (!pkg.includes('.')) return;
    await showPkgPerms(pkg);
}

function filterPermissions() {
    const q = document.getElementById('search-perms').value.toLowerCase();
    if (q.includes('.') && q.length > 5) {
        clearTimeout(filterPermissions._timer);
        filterPermissions._timer = setTimeout(() => loadPermissionsForPkg(), 600);
    }
}

async function revokePermission(pkg, perm) {
    log(`Revoking ${perm.split('.').pop()} from ${pkg}…`, 'warn');
    const r = await api('POST', '/api/revoke-permission', { device: selectedDevice, package: pkg, permission: perm });
    log(r.message || 'Done', r.success ? 'success' : 'error');
    showPkgPerms(pkg);
}

async function loadNotifications() {
    if (!selectedDevice) return;
    const sec = document.getElementById('notifications-section');
    sec.classList.remove('hidden');
    const list = document.getElementById('notifications-list');
    list.innerHTML = '<div class="loading"><div class="spinner"></div><br>Scanning apps (this may take a moment)…</div>';
    const data = await api('GET', `/api/notifications?device=${enc(selectedDevice)}`);
    const apps = data.apps || [];
    if (!apps.length) { list.innerHTML = '<p class="empty">No apps with notification permission found.</p>'; return; }
    list.innerHTML = apps.map(a => `
        <div class="perm-row">
            <label style="display:flex;align-items:center;gap:.5rem;cursor:pointer">
                <input type="checkbox" class="notif-check" value="${a.id}">
                <div>
                    <div class="perm-name">${esc(a.name)}</div>
                    <div class="perm-id">${a.id}</div>
                </div>
            </label>
        </div>
    `).join('');
    document.querySelectorAll('.notif-check').forEach(cb => cb.addEventListener('change', () => {
        const checked = document.querySelectorAll('.notif-check:checked').length;
        const btn = document.getElementById('btn-revoke-notifs');
        btn.disabled = checked === 0;
        btn.textContent = `Revoke selected notifications (${checked})`;
    }));
}

async function bulkRevokeNotifications() {
    const pkgs = [...document.querySelectorAll('.notif-check:checked')].map(cb => cb.value);
    if (!pkgs.length) return;
    if (!confirm(`Revoke notification permission for ${pkgs.length} apps?`)) return;
    log(`Revoking notifications for ${pkgs.length} apps…`, 'warn');
    const r = await api('POST', '/api/revoke-notifications', { device: selectedDevice, packages: pkgs });
    const results = r.results || [];
    const ok = results.filter(x => x.success).length;
    log(`Revoked notifications for ${ok} of ${results.length} apps`, ok > 0 ? 'success' : 'error');
    loadNotifications();
}

// ── Processes ──

async function loadProcesses() {
    if (!selectedDevice) return;
    const list = document.getElementById('processes-list');
    list.innerHTML = '<div class="loading"><div class="spinner"></div><br>Loading…</div>';
    const data = await api('GET', `/api/processes?device=${enc(selectedDevice)}`);
    const procs = data.processes || [];
    if (!procs.length) { list.innerHTML = '<p class="empty">No user processes found.</p>'; return; }
    list.innerHTML = procs.map(p => `
        <div class="proc-row">
            <div>
                <span class="proc-name">${esc(p.label || p.name)}</span>
                <span class="pkg-id">${p.name}</span>
            </div>
            <span class="proc-pid">PID ${p.pid}</span>
            <div class="pkg-actions">
                <button class="btn btn-ghost btn-sm" onclick="restrictBackground_proc('${p.name}')">Restrict</button>
                <button class="btn btn-danger btn-sm" onclick="forceStop('${p.name}')">Stop</button>
            </div>
        </div>
    `).join('');
    log(`${procs.length} processes loaded`, 'info');
}

async function forceStop(pkg) {
    if (!confirm(`Force stop ${pkg}?`)) return;
    log(`Stopping ${pkg}…`, 'warn');
    const r = await api('POST', '/api/force-stop', { device: selectedDevice, package: pkg });
    log(r.message || 'Stopped', r.success ? 'success' : 'error');
    loadProcesses();
}

async function restrictBackground_proc(pkg) {
    log(`Restricting ${pkg}…`, 'warn');
    const r = await api('POST', '/api/restrict-background', { device: selectedDevice, package: pkg });
    (r.results || []).forEach(x => log(`${pkg}: ${x}`, 'success'));
}

// ── Security ──

async function runSecurityScan() {
    if (!selectedDevice) return log('Connect a device first.', 'error');
    const el = document.getElementById('security-results');
    el.innerHTML = '<div class="loading"><div class="spinner"></div><br>Scanning…</div>';
    log('Running security scan…', 'info', { cat: 'SEC', device: selectedDevice });
    const data = await api('GET', `/api/security-scan?device=${enc(selectedDevice)}`);
    const findings = data.findings || [];

    if (!findings.length) {
        el.innerHTML = '<div class="scan-section"><div class="scan-item scan-ok">No issues found — device looks clean.</div></div>';
        log('Security scan clean', 'success', { cat: 'SEC', device: selectedDevice, details: 'All checks passed: no unauthorized device admins, unknown sideloads, or open vulnerabilities.' });
        return;
    }

    el.innerHTML = findings.map(f => {
        const typeClass = f.type === 'danger' ? 'scan-bad' : f.type === 'warning' ? 'scan-warn' : 'scan-ok';
        const dotClass = f.type === 'danger' ? 'dangerous' : f.type === 'warning' ? 'caution' : 'safe';
        let details = '';
        if (Array.isArray(f.details)) {
            details = f.details.map(d => {
                if (typeof d === 'object') return `<div class="scan-item"><span class="risk-dot ${dotClass}"></span> ${esc(d.package || d.name || JSON.stringify(d))}</div>`;
                return `<div class="scan-item"><span class="risk-dot ${dotClass}"></span> ${esc(d)}</div>`;
            }).join('');
        } else if (typeof f.details === 'string') {
            details = `<div class="scan-item ${typeClass}">${esc(f.details)}</div>`;
        }
        return `<div class="scan-section"><h3><span class="risk-dot ${dotClass}"></span> ${esc(f.title)}</h3>${details}</div>`;
    }).join('');

    const scanDetails = findings.map(f => {
        const detailStr = Array.isArray(f.details) 
            ? f.details.map(d => typeof d === 'object' ? JSON.stringify(d) : d).join(', ') 
            : (f.details || '');
        return `[${(f.type || 'info').toUpperCase()}] ${f.title}: ${detailStr}`;
    }).join('\n');
    log(`Security scan: ${findings.length} findings`, 'success', { cat: 'SEC', device: selectedDevice, details: scanDetails });
}

// ── Settings ──

async function loadDefaults() {
    if (!selectedDevice) return;
    const el = document.getElementById('defaults-list');
    const data = await api('GET', `/api/defaults?device=${enc(selectedDevice)}`);
    if (data.error) { el.innerHTML = '<p class="empty">Could not load defaults.</p>'; return; }

    const labels = { sms: 'SMS', browser: 'Browser', assistant: 'Assistant', home: 'Home', dialer: 'Dialer', autofill: 'Autofill' };
    el.innerHTML = Object.entries(data).map(([role, pkg]) => `
        <div class="setting-row">
            <span class="setting-label">${labels[role] || role}</span>
            <span class="setting-value">${esc(String(pkg || 'not set'))}</span>
        </div>
    `).join('');
}

async function loadDns() {
    if (!selectedDevice) return;
    const data = await api('GET', `/api/dns?device=${enc(selectedDevice)}`);
    if (data.hostname) document.getElementById('dns-host').value = data.hostname;
    if (data.mode) document.getElementById('dns-host').placeholder = `Current mode: ${data.mode}`;
}

async function setDns() {
    const host = document.getElementById('dns-host').value.trim();
    log(host ? `Setting Private DNS to ${host}…` : 'Disabling Private DNS…');
    const r = await api('POST', '/api/dns', { device: selectedDevice, hostname: host });
    log(r.message || 'Done', r.success ? 'success' : 'error');
}

async function loadKnox() {
    if (!selectedDevice) return;
    const data = await api('GET', `/api/knox?device=${enc(selectedDevice)}`);
    const el = document.getElementById('knox-info');
    if (data.error) {
        el.innerHTML = '<p class="empty">Could not read Knox status.</p>';
        log(`Could not read Knox status: ${data.error}`, 'warn', { cat: 'SEC', device: selectedDevice });
        return;
    }
    log(`Samsung Knox status: ${data.knox_status || 'verified'} (warranty bit: ${data.warranty_bit || '0'})`, 'info', {
        cat: 'SEC',
        device: selectedDevice,
        details: Object.entries(data).map(([k, v]) => `${k}: ${v}`).join('\n')
    });
    el.innerHTML = Object.entries(data).map(([k, v]) => {
        const isGood = (k === 'knox_status' && v === 'intact') || (k === 'verified_boot' && v === 'green') || (k === 'warranty_bit' && v === '0');
        const color = isGood ? 'var(--safe)' : '';
        return `
        <div class="info-item">
            <div class="info-label">${esc(k.replace(/_/g, ' '))}</div>
            <div class="info-value" ${color ? `style="color:${color}"` : ''}>${esc(String(v))}</div>
        </div>`;
    }).join('');
}

async function loadCharge() {
    if (!selectedDevice) return;
    const data = await api('GET', `/api/charge?device=${enc(selectedDevice)}`);
    const el = document.getElementById('charge-info');
    if (data.error) { el.innerHTML = '<p class="empty">Could not read charge status.</p>'; return; }

    const labels = {
        level: 'Battery Level', temperature: 'Temperature', voltage: 'Voltage',
        current: 'Current (mA)', asoc: 'Health (ASOC)', bsoh: 'BSOH',
        ac_powered: 'AC Power', usb_powered: 'USB Power', wireless_powered: 'Wireless Power',
        adaptive_fast_charging: 'Adaptive Fast Charging', super_fast_charging: 'Super Fast Charging',
        protect_mode: 'Battery Protection', protect_threshold: 'Protection Threshold'
    };

    el.innerHTML = Object.entries(data).map(([k, v]) => {
        let display = String(v);
        if (k === 'temperature' && v !== '?') display = (parseInt(v) / 10).toFixed(1) + '°C';
        if (k === 'voltage' && v !== '?') display = (parseInt(v) / 1000).toFixed(2) + 'V';
        if (k === 'level' && v !== '?') display = v + '%';
        if (k === 'asoc' && v !== '?') display = v + '%';
        return `
        <div class="info-item">
            <div class="info-label">${labels[k] || k}</div>
            <div class="info-value">${esc(display)}</div>
        </div>`;
    }).join('');
}

async function exportProfile() {
    if (!selectedDevice) return log('Connect a device first.', 'error');
    log('Exporting profile…');
    const data = await api('GET', `/api/export-profile?device=${enc(selectedDevice)}`);
    if (data.error) return log(data.error, 'error');
    const blob = new Blob([JSON.stringify(data, null, 2)], { type: 'application/json' });
    const a = document.createElement('a');
    a.href = URL.createObjectURL(blob);
    a.download = `debloat-profile-${data.model || 'device'}-${new Date().toISOString().slice(0, 10)}.json`;
    a.click();
    log(`Profile exported: ${data.total} packages, ${data.disabled.length} disabled`, 'success');
}

async function importProfile() {
    if (!selectedDevice) return log('Connect a device first.', 'error');
    const input = document.createElement('input');
    input.type = 'file';
    input.accept = '.json';
    input.onchange = async () => {
        const file = input.files[0];
        if (!file) return;
        try {
            const text = await file.text();
            const profile = JSON.parse(text);
            if (!confirm(`Import profile from ${profile.model || 'unknown device'}?\nThis will disable ${profile.disabled?.length || 0} packages.`)) return;
            log('Importing profile…', 'warn');
            const r = await api('POST', '/api/import-profile', { device: selectedDevice, profile });
            log(`Profile imported: ${r.removed} removed, ${r.failed} failed`, r.failed > 0 ? 'warn' : 'success');
        } catch (e) {
            log('Invalid profile file', 'error');
        }
    };
    input.click();
}

// ── Optimize ──

async function applyOptimize() {
    if (!selectedDevice) return log('Connect a device first.', 'error', { cat: 'BAT' });
    if (!confirm('Apply optimizations?\n\n- Reduce animations to 0.5x\n- Disable WiFi / Bluetooth scanning\n- Run storage TRIM')) return;
    log('Applying device optimizations…', 'info', { cat: 'BAT', device: selectedDevice });
    const r = await api('POST', '/api/optimize', { device: selectedDevice });
    const results = r.results || [];
    log(`Optimization complete: ${results.length} tweaks applied`, 'success', {
        cat: 'BAT',
        device: selectedDevice,
        details: results.join('\n')
    });
}

async function restrictBackground() {
    const pkg = document.getElementById('restrict-pkg').value.trim();
    if (!pkg) return log('Enter a package name.', 'error', { cat: 'BAT' });
    if (!selectedDevice) return log('Connect a device first.', 'error', { cat: 'BAT' });
    log(`Restricting background execution for ${pkg}…`, 'warn', { cat: 'BAT', device: selectedDevice });
    const r = await api('POST', '/api/restrict-background', { device: selectedDevice, package: pkg });
    const results = r.results || [];
    log(`Restricted ${pkg}`, 'success', { cat: 'BAT', device: selectedDevice, details: results.join('\n') });
}

async function rebootDevice() {
    if (!selectedDevice) return log('Connect a device first.', 'error', { cat: 'ADB' });
    if (!confirm('Reboot this device?')) return;
    log('Sending reboot signal to device…', 'warn', { cat: 'ADB', device: selectedDevice, details: `Target: ${selectedDevice}\nCommand: adb -s ${selectedDevice} reboot` });
    await api('POST', '/api/reboot', { device: selectedDevice });
    log('Reboot command dispatched successfully.', 'info', { cat: 'ADB', device: selectedDevice });
}

// ── Database Editor ──

let dbData = {};

async function loadDatabase() {
    const target = document.getElementById('db-target').value;
    const brandSel = document.getElementById('db-brand');
    brandSel.classList.toggle('hidden', target !== 'brands');

    const r = await api('GET', '/api/packages-db');
    if (r.error) return log(r.error, 'error');
    dbData = r;

    const banner = document.getElementById('uad-banner');
    const uadCount = r.uad_count || 0;
    const customCount = Object.keys(r.packages || {}).length;
    if (uadCount > 0) {
        banner.innerHTML = `<span class="uad-ok">UAD list loaded: ${uadCount.toLocaleString()} packages</span> + ${customCount} custom entries. <span class="hint">Auto-syncs every 24h.</span>`;
    } else {
        banner.innerHTML = `<span class="uad-missing">UAD list not found.</span> Click "Sync UAD list" to download 5,000+ bloatware classifications from the Universal Android Debloater project.`;
    }

    renderDatabase();
}

async function syncUadList() {
    log('Syncing UAD list from GitHub... this may take a moment.', 'info');
    const el = document.getElementById('uad-banner');
    el.innerHTML = '<span class="hint">Downloading UAD list...</span>';
    const r = await api('POST', '/api/sync-uad', {});
    if (r.success) {
        log(r.message, 'success');
        await loadDatabase();
    } else {
        log(r.error || r.message || 'Sync failed', 'error');
        el.innerHTML = `<span class="uad-missing">Sync failed: ${esc(r.message || r.error || 'Unknown error')}</span>`;
    }
}

function renderDatabase() {
    const target = document.getElementById('db-target').value;
    const search = (document.getElementById('db-search').value || '').toLowerCase();
    const list = document.getElementById('db-list');
    const stats = document.getElementById('db-stats');
    let entries = {};

    if (target === 'packages') {
        entries = dbData.packages || {};
    } else if (target === 'brands') {
        const brand = document.getElementById('db-brand').value;
        entries = (dbData.brands || {})[brand] || {};
    } else if (target === 'presets') {
        const presets = dbData.presets || {};
        list.innerHTML = Object.entries(presets).map(([key, p]) => `
            <div class="pkg-row">
                <div class="pkg-info">
                    <span class="pkg-name">${esc(key)}</span>
                    <span class="pkg-id">${esc(p.name || '')}</span>
                    ${p.desc ? `<span class="pkg-desc">${esc(p.desc)}</span>` : ''}
                </div>
                <div class="pkg-actions">
                    <button class="btn btn-ghost btn-xs" onclick="deleteDbEntry('presets','${key}')">Delete</button>
                </div>
            </div>
        `).join('');
        stats.textContent = `${Object.keys(presets).length} presets`;
        return;
    }

    const filtered = Object.entries(entries).filter(([id, info]) => {
        if (!search) return true;
        return id.toLowerCase().includes(search) || (info.name || '').toLowerCase().includes(search) || (info.desc || '').toLowerCase().includes(search);
    });

    stats.textContent = `${filtered.length} of ${Object.keys(entries).length} entries`;

    list.innerHTML = filtered.map(([id, info]) => {
        const riskClass = info.risk || 'unknown';
        return `
        <div class="pkg-row">
            <span class="risk-dot ${riskClass}" style="flex-shrink:0"></span>
            <div class="pkg-info">
                <span class="pkg-name">${esc(info.name || id)}</span>
                <span class="pkg-id">${esc(id)}</span>
                ${info.desc ? `<span class="pkg-desc">${esc(info.desc)}</span>` : ''}
            </div>
            <div class="pkg-badges">
                <span class="pkg-category">${esc(info.category || '')}</span>
            </div>
            <div class="pkg-actions">
                <button class="btn btn-ghost btn-xs" onclick="editDbEntry('${id}')">Edit</button>
                <button class="btn btn-ghost btn-xs" onclick="deleteDbEntry('${document.getElementById('db-target').value}','${id}')">Delete</button>
            </div>
        </div>`;
    }).join('');
}

function filterDatabase() { renderDatabase(); }

function editDbEntry(id) {
    const target = document.getElementById('db-target').value;
    let entry;
    if (target === 'packages') entry = (dbData.packages || {})[id];
    else if (target === 'brands') {
        const brand = document.getElementById('db-brand').value;
        entry = ((dbData.brands || {})[brand] || {})[id];
    }
    if (!entry) return;
    document.getElementById('db-pkg-id').value = id;
    document.getElementById('db-pkg-name').value = entry.name || '';
    document.getElementById('db-pkg-cat').value = entry.category || '';
    document.getElementById('db-pkg-risk').value = entry.risk || 'safe';
    document.getElementById('db-pkg-desc').value = entry.desc || '';
}

async function addDbEntry() {
    const id = document.getElementById('db-pkg-id').value.trim();
    if (!id) return log('Enter a package ID.', 'error');
    const entry = {
        name: document.getElementById('db-pkg-name').value.trim() || id,
        category: document.getElementById('db-pkg-cat').value.trim() || 'User Apps',
        risk: document.getElementById('db-pkg-risk').value,
        desc: document.getElementById('db-pkg-desc').value.trim(),
    };
    const target = document.getElementById('db-target').value;
    const body = { target, entries: { [id]: entry } };
    if (target === 'brands') body.brand = document.getElementById('db-brand').value;

    const r = await api('POST', '/api/packages-db', body);
    if (r.success) {
        log(r.message, 'success');
        await loadDatabase();
        document.getElementById('db-pkg-id').value = '';
        document.getElementById('db-pkg-name').value = '';
        document.getElementById('db-pkg-cat').value = '';
        document.getElementById('db-pkg-desc').value = '';
    } else {
        log(r.error || 'Failed', 'error');
    }
}

async function deleteDbEntry(target, id) {
    if (!confirm(`Delete ${id} from ${target}?`)) return;
    const body = { target, id };
    if (target === 'brands') body.brand = document.getElementById('db-brand').value;
    const r = await api('POST', '/api/packages-db/delete', body);
    if (r.success) {
        log(r.message, 'success');
        await loadDatabase();
    } else {
        log(r.error || 'Failed', 'error');
    }
}

async function reloadDatabases() {
    const r = await api('POST', '/api/reload-db', {});
    if (r.success) {
        log(r.message, 'success');
        await loadDatabase();
    } else {
        log(r.error || 'Failed', 'error');
    }
}

// ── AI Chat ──

async function sendChatMessage() {
    const input = document.getElementById('chat-input');
    const msg = input.value.trim();
    if (!msg) return;
    input.value = '';

    const container = document.getElementById('chat-messages');
    container.innerHTML += `<div class="chat-msg user"><div class="chat-bubble">${esc(msg)}</div></div>`;
    container.scrollTop = container.scrollHeight;

    container.innerHTML += `<div class="chat-msg assistant" id="chat-typing"><div class="chat-bubble typing">Thinking...</div></div>`;
    container.scrollTop = container.scrollHeight;

    let context = msg;
    if (selectedDevice) {
        context = `[Device: ${selectedDevice}] ` + msg;
    }

    const previewMsg = msg.length > 55 ? msg.slice(0, 55) + '…' : msg;
    log(`AI Query: "${previewMsg}"`, 'info', {
        cat: 'AI',
        device: selectedDevice || '',
        details: `User Prompt: ${msg}\nContext payload:\n${context}`
    });

    const messages = [
        { role: "system", content: "You are a mobile device optimization expert. Help users debloat and optimize their Android phones and watches. Be concise and practical. When recommending package removal, always mention the risk level." },
        { role: "user", content: context }
    ];

    const r = await api('POST', '/api/ai/chat', { messages });
    const typing = document.getElementById('chat-typing');
    if (typing) typing.remove();

    if (r.error) {
        container.innerHTML += `<div class="chat-msg assistant"><div class="chat-bubble error">${esc(r.error)}</div></div>`;
        log(`AI Chat Error: ${r.error}`, 'error', {
            cat: 'AI',
            device: selectedDevice || '',
            details: `Prompt: ${msg}\nError Details:\n${r.error}`
        });
    } else {
        container.innerHTML += `<div class="chat-msg assistant"><div class="chat-bubble">${formatAiResponse(r.response || '')}</div></div>`;
        const respText = r.response || '';
        const shortResp = respText.length > 60 ? respText.slice(0, 60).replace(/\n/g, ' ') + '…' : respText;
        log(`AI Response: "${shortResp}"`, 'success', {
            cat: 'AI',
            device: selectedDevice || '',
            details: `Prompt: ${msg}\nResponse (${respText.length} chars):\n${respText}`
        });
    }
    container.scrollTop = container.scrollHeight;
}

function formatAiResponse(text) {
    return esc(text)
        .replace(/\n/g, '<br>')
        .replace(/\*\*(.*?)\*\*/g, '<strong>$1</strong>')
        .replace(/`(.*?)`/g, '<code>$1</code>');
}

// ── AI Smart Cleanup ──

function extractJson(text) {
    if (!text) return null;
    // Strip thinking tags (NVIDIA reasoning models)
    let s = text.replace(/<think>[\s\S]*?<\/think>/gi, '');
    // Strip markdown code fences
    s = s.replace(/```(?:json)?\s*\n?([\s\S]*?)```/g, '$1');
    s = s.trim();
    // Try direct parse
    try { return JSON.parse(s); } catch (_) {}
    // Find the outermost JSON object in the text
    const start = s.indexOf('{');
    if (start === -1) return null;
    let depth = 0;
    for (let i = start; i < s.length; i++) {
        if (s[i] === '{') depth++;
        else if (s[i] === '}') { depth--; if (depth === 0) { try { return JSON.parse(s.slice(start, i + 1)); } catch (_) { return null; } } }
    }
    return null;
}

let aiCleanupPlan = null;

async function aiSmartCleanup() {
    if (!selectedDevice) return log('Connect a device first.', 'error');
    const goal = document.getElementById('ai-goal').value.trim() || 'balanced optimization';
    const status = document.getElementById('ai-cleanup-status');
    const result = document.getElementById('ai-cleanup-result');
    status.innerHTML = '<div class="loading"><div class="spinner"></div><br>AI is reading your packages, comparing with UAD database, and building a cleanup plan...</div>';
    result.innerHTML = '';
    aiCleanupPlan = null;
    log(`AI smart cleanup started (goal: ${goal})...`, 'info');

    const r = await api('POST', '/api/ai/smart-cleanup', { device: selectedDevice, goal });
    if (r.error) {
        status.innerHTML = `<div class="ai-error">${esc(r.error)}</div>`;
        log('AI cleanup analysis failed: ' + r.error, 'error');
        return;
    }

    console.log('AI raw response:', r.response);
    const plan = extractJson(r.response || '');
    if (!plan) {
        status.innerHTML = '';
        result.innerHTML = `<div class="ai-response">${formatAiResponse(r.response || '')}</div>`;
        log('AI returned text response (could not parse as structured plan). Check browser console for raw output.', 'warn');
        return;
    }

    aiCleanupPlan = plan;
    status.innerHTML = '';
    renderCleanupPlan(plan);
    const totalPkgs = countPlanPackages(plan);
    log(`AI cleanup plan ready (${plan.layout || 'default'} layout, ${totalPkgs} packages).`, 'success', {
        cat: 'AI',
        device: selectedDevice,
        details: `Goal: ${goal}\nTotal evaluated: ${totalPkgs}\nSummary: ${plan.summary || ''}\nFull plan:\n${JSON.stringify(plan, null, 2)}`
    });
}

const CLEANUP_ICONS = {
    trash: '&#128465;', shield: '&#128737;', zap: '&#9889;', 'eye-off': '&#128683;',
    phone: '&#128241;', globe: '&#127760;', battery: '&#128267;', folder: '&#128193;',
    star: '&#11088;', check: '&#9989;',
};

function cleanupIcon(name) { return CLEANUP_ICONS[name] || CLEANUP_ICONS.folder; }

function countPlanPackages(plan) {
    if (plan.actions) return plan.actions.reduce((n, a) => n + (a.packages || []).length, 0);
    if (plan.categories) return plan.categories.reduce((n, c) => n + (c.packages || []).length, 0);
    if (plan.high || plan.medium || plan.low) return (plan.high||[]).length + (plan.medium||[]).length + (plan.low||[]).length;
    if (plan.packages) return plan.packages.length;
    return (plan.remove||[]).length + (plan.restrict||[]).length;
}

function renderCleanupPlan(plan) {
    const el = document.getElementById('ai-cleanup-result');
    const layout = plan.layout || 'quick-actions';

    let html = renderCleanupHeader(plan);

    if (layout === 'quick-actions') html += renderQuickActions(plan);
    else if (layout === 'categories') html += renderCategories(plan);
    else if (layout === 'priority') html += renderPriority(plan);
    else if (layout === 'health-report') html += renderHealthReport(plan);
    else html += renderQuickActions(plan);

    html += renderApplyBar(plan);
    el.innerHTML = html;
}

function renderCleanupHeader(plan) {
    let html = '';
    if (plan.summary) {
        html += `<div class="cleanup-summary"><strong>Summary:</strong> ${esc(plan.summary)}`;
        if (plan.estimated_impact) html += `<br><strong>Expected impact:</strong> ${esc(plan.estimated_impact)}`;
        html += '</div>';
    }
    const warnings = plan.warnings || [];
    if (warnings.length) {
        html += '<div class="cleanup-warnings">';
        warnings.forEach(w => { html += `<div class="cleanup-warn-item">${esc(w)}</div>`; });
        html += '</div>';
    }
    return html;
}

function renderPkgRow(p, group) {
    const action = p.action || (group === 'restrict' ? 'restrict' : 'remove');
    const tag = action === 'restrict' ? '<span class="cleanup-action-tag restrict">RESTRICT</span>' : '<span class="cleanup-action-tag remove">REMOVE</span>';
    return `<div class="cleanup-row">
        <input type="checkbox" checked class="cleanup-cb" data-group="${action}" data-id="${esc(p.id)}">
        ${tag}
        <div class="cleanup-pkg-info"><span class="pkg-name">${esc(p.name || p.id)}</span><span class="pkg-id">${esc(p.id)}</span></div>
        <span class="cleanup-reason">${esc(p.reason || '')}</span>
    </div>`;
}

function renderQuickActions(plan) {
    const actions = plan.actions || [];
    if (!actions.length) return '<p class="empty">AI found nothing to clean up.</p>';

    let html = '<div class="action-cards">';
    actions.forEach((a, idx) => {
        const pkgs = a.packages || [];
        const sevClass = a.severity === 'safe' ? 'safe' : a.severity === 'caution' ? 'caution' : 'accent';
        html += `<div class="action-card" data-idx="${idx}">`;
        html += `<div class="action-card-header" onclick="toggleActionCard(${idx})">`;
        html += `<span class="action-card-icon">${cleanupIcon(a.icon)}</span>`;
        html += `<div class="action-card-title">`;
        html += `<strong>${esc(a.title)}</strong>`;
        html += `<span class="action-card-meta">${pkgs.length} package${pkgs.length !== 1 ? 's' : ''}</span>`;
        html += `</div>`;
        html += `<span class="action-card-desc">${esc(a.description || '')}</span>`;
        html += `<span class="action-card-toggle">&#9660;</span>`;
        html += `</div>`;
        html += `<div class="action-card-body hidden" id="action-body-${idx}">`;
        html += `<div class="action-card-controls"><label class="cleanup-toggle"><input type="checkbox" checked onchange="toggleActionGroup(${idx},this.checked)"> Select all</label></div>`;
        html += `<div class="cleanup-list">${pkgs.map(p => renderPkgRow(p, 'remove')).join('')}</div>`;
        html += `</div></div>`;
    });
    html += '</div>';
    return html;
}

function renderCategories(plan) {
    const cats = plan.categories || [];
    if (!cats.length) return '<p class="empty">AI found nothing to clean up.</p>';

    let html = '';
    cats.forEach((cat, idx) => {
        const pkgs = cat.packages || [];
        html += `<div class="cleanup-section">`;
        html += `<div class="cleanup-section-header clickable" onclick="toggleCatSection(${idx})">`;
        html += `<h2><span class="cat-icon">${cleanupIcon(cat.icon)}</span> ${esc(cat.name)} (${pkgs.length})</h2>`;
        html += `<label class="cleanup-toggle"><input type="checkbox" checked onchange="toggleCatGroup(${idx},this.checked)"> Select all</label>`;
        html += `</div>`;
        html += `<div class="cleanup-list" id="cat-list-${idx}">${pkgs.map(p => renderPkgRow(p)).join('')}</div>`;
        html += `</div>`;
    });
    return html;
}

function renderPriority(plan) {
    const levels = [
        { key: 'high', label: 'High Impact', color: 'var(--danger)', items: plan.high || [] },
        { key: 'medium', label: 'Medium Impact', color: 'var(--caution)', items: plan.medium || [] },
        { key: 'low', label: 'Low Impact', color: 'var(--muted)', items: plan.low || [] },
    ];
    let html = '';
    levels.forEach(lv => {
        if (!lv.items.length) return;
        html += `<div class="cleanup-section">`;
        html += `<div class="cleanup-section-header">`;
        html += `<h2><span class="priority-dot" style="background:${lv.color}"></span> ${lv.label} (${lv.items.length})</h2>`;
        html += `<label class="cleanup-toggle"><input type="checkbox" checked onchange="toggleCleanupGroup('${lv.key}',this.checked)"> Select all</label>`;
        html += `</div>`;
        html += `<div class="cleanup-list">${lv.items.map(p => renderPkgRow(p)).join('')}</div>`;
        html += `</div>`;
    });
    return html || '<p class="empty">AI found nothing to clean up.</p>';
}

function renderHealthReport(plan) {
    const score = plan.score || 0;
    const grade = plan.grade || '?';
    const findings = plan.findings || [];
    const pkgs = plan.packages || [];
    const scoreColor = score >= 80 ? 'var(--safe)' : score >= 50 ? 'var(--caution)' : 'var(--danger)';

    let html = `<div class="health-report">`;
    html += `<div class="health-score-ring">`;
    html += `<div class="health-score" style="border-color:${scoreColor}"><span class="health-grade">${esc(grade)}</span><span class="health-number">${score}/100</span></div>`;
    html += `</div>`;
    if (findings.length) {
        html += '<div class="health-findings">';
        findings.forEach(f => { html += `<div class="health-finding">${esc(f)}</div>`; });
        html += '</div>';
    }
    if (pkgs.length) {
        html += `<div class="cleanup-section"><div class="cleanup-section-header"><h2>Minor recommendations (${pkgs.length})</h2></div>`;
        html += `<div class="cleanup-list">${pkgs.map(p => renderPkgRow(p)).join('')}</div></div>`;
    }
    html += '</div>';
    return html;
}

function renderApplyBar(plan) {
    const total = countPlanPackages(plan);
    if (!total) return '';
    return `<div class="cleanup-apply-bar">
        <button class="btn btn-danger" onclick="applyCleanupPlan()">Apply selected cleanup</button>
        <span class="hint" style="margin:0">Removals are reversible via the Apps &gt; Removed tab.</span>
    </div>`;
}

function toggleActionCard(idx) {
    const body = document.getElementById('action-body-' + idx);
    body.classList.toggle('hidden');
    const card = body.closest('.action-card');
    card.classList.toggle('expanded');
}

function toggleActionGroup(idx, checked) {
    const body = document.getElementById('action-body-' + idx);
    body.querySelectorAll('.cleanup-cb').forEach(cb => { cb.checked = checked; });
}

function toggleCatSection(idx) {
    document.getElementById('cat-list-' + idx).classList.toggle('hidden');
}

function toggleCatGroup(idx, checked) {
    document.getElementById('cat-list-' + idx).querySelectorAll('.cleanup-cb').forEach(cb => { cb.checked = checked; });
}

function toggleCleanupGroup(group, checked) {
    document.querySelectorAll(`.cleanup-cb[data-group="${group}"]`).forEach(cb => { cb.checked = checked; });
}

async function applyCleanupPlan() {
    if (!selectedDevice || !aiCleanupPlan) return;

    const removeIds = [];
    const restrictIds = [];
    document.querySelectorAll('.cleanup-cb:checked').forEach(cb => {
        const id = cb.dataset.id;
        if (cb.dataset.group === 'remove') removeIds.push(id);
        else if (cb.dataset.group === 'restrict') restrictIds.push(id);
    });

    if (!removeIds.length && !restrictIds.length) return log('Nothing selected to apply.', 'warn');

    const msg = `Apply AI cleanup?\n\n- Remove ${removeIds.length} package(s)\n- Restrict ${restrictIds.length} package(s)\n\nRemovals are reversible.`;
    if (!confirm(msg)) return;

    log(`Applying AI cleanup plan (${removeIds.length} remove, ${restrictIds.length} restrict)...`, 'info');
    const status = document.getElementById('ai-cleanup-status');
    status.innerHTML = '<div class="loading"><div class="spinner"></div><br>Applying cleanup plan...</div>';

    const r = await api('POST', '/api/ai/apply-cleanup', { device: selectedDevice, remove: removeIds, restrict: restrictIds });
    status.innerHTML = '';

    if (r.error) {
        log('Cleanup failed: ' + r.error, 'error', { cat: 'AI', device: selectedDevice, details: r.error });
    } else {
        log(r.message, r.failed ? 'warn' : 'success', {
            cat: 'AI',
            device: selectedDevice,
            details: `Removed (${removeIds.length}):\n${removeIds.join('\n')}\n\nRestricted (${restrictIds.length}):\n${restrictIds.join('\n')}${r.errors && r.errors.length ? '\n\nErrors:\n' + r.errors.join('\n') : ''}`
        });
        if (r.errors && r.errors.length) r.errors.forEach(e => log(e, 'error', { cat: 'AI', device: selectedDevice }));
        document.getElementById('ai-cleanup-result').innerHTML = `<div class="cleanup-summary" style="border-color:var(--safe)"><strong>Cleanup applied:</strong> ${esc(r.message)}</div>`;
        loadPackages();
    }
}

// ── AI Settings ──

let aiProviders = {};

async function loadAiSettings() {
    const r = await api('GET', '/api/ai/config');
    if (r.providers) aiProviders = r.providers;
    if (r.provider) document.getElementById('ai-provider').value = r.provider;
    if (r.model) document.getElementById('ai-model').value = r.model;
    if (r.base_url) document.getElementById('ai-baseurl').value = r.base_url;
    if (r.api_key && r.api_key !== '...') {
        document.getElementById('ai-apikey').placeholder = 'Key configured (' + r.api_key + ')';
    }
    onAiProviderChange();
}

function onAiProviderChange() {
    const prov = document.getElementById('ai-provider').value;
    const hint = document.getElementById('ai-model-hint');
    const urlInput = document.getElementById('ai-baseurl');
    const keyHint = document.getElementById('ai-key-hint');
    const info = aiProviders[prov] || {};

    if (info.default_model) {
        hint.textContent = `Default: ${info.default_model}`;
    } else if (prov === 'custom') {
        hint.textContent = 'Enter the model name your endpoint expects.';
    } else {
        hint.textContent = 'Select a provider first.';
    }

    if (info.base_url) {
        urlInput.placeholder = info.base_url;
        if (!urlInput.value) urlInput.value = info.base_url;
    } else if (prov === 'custom') {
        urlInput.placeholder = 'https://api.example.com/v1';
    }

    if (prov === 'ollama') {
        keyHint.textContent = 'No API key needed for local Ollama.';
    } else if (prov === 'custom') {
        keyHint.textContent = 'Leave blank if your endpoint requires no auth.';
    } else {
        keyHint.textContent = 'Required for cloud providers. Leave blank for Ollama or keyless endpoints.';
    }
}

async function saveAiSettings() {
    const provider = document.getElementById('ai-provider').value;
    const api_key = document.getElementById('ai-apikey').value.trim();
    const model = document.getElementById('ai-model').value.trim();
    const base_url = document.getElementById('ai-baseurl').value.trim();

    if (!provider) return log('Select a provider.', 'error', { cat: 'AI' });

    log(`Saving AI configuration (${provider})…`, 'info', {
        cat: 'AI',
        details: `Provider: ${provider}\nModel: ${model || '(default)'}\nBase URL: ${base_url || '(default)'}\nAPI Key: ${api_key ? '••••' + api_key.slice(-4) : '(none)'}`
    });

    const r = await api('POST', '/api/ai/config', { provider, api_key, model, base_url });
    const status = document.getElementById('ai-settings-status');
    if (r.success) {
        status.innerHTML = `<p class="hint" style="color:var(--safe)">${esc(r.message)}</p>`;
        log(r.message, 'success', { cat: 'AI', details: `Provider "${provider}" configured successfully.` });
        document.getElementById('ai-apikey').value = '';
        document.getElementById('ai-apikey').placeholder = 'Key saved';
    } else {
        status.innerHTML = `<p class="hint" style="color:var(--danger)">${esc(r.error || 'Failed')}</p>`;
        log(r.error || 'Failed to save', 'error', { cat: 'AI', details: r.error || 'Failed to save configuration' });
    }
}

async function testAiConnection() {
    log('Testing AI connection…', 'info', { cat: 'AI', details: 'Sending ping message to test configured AI provider credentials.' });
    const r = await api('POST', '/api/ai/chat', {
        messages: [{ role: "user", content: "Say 'Connection successful!' in one sentence." }]
    });
    if (r.error) {
        log('AI test failed: ' + r.error, 'error', { cat: 'AI', details: r.error });
    } else {
        const preview = (r.response || '').trim();
        log('AI connected: ' + (preview.length > 70 ? preview.slice(0, 70) + '…' : preview), 'success', {
            cat: 'AI',
            details: `Provider Response:\n${preview}`
        });
    }
}

function toggleKeyVisibility() {
    const input = document.getElementById('ai-apikey');
    input.type = input.type === 'password' ? 'text' : 'password';
}

async function fetchAvailableModels() {
    const el = document.getElementById('ai-models-list');
    el.classList.remove('hidden');
    el.innerHTML = '<p class="hint">Fetching available models...</p>';
    log('Fetching available models from provider…', 'info', { cat: 'AI' });

    const r = await api('GET', '/api/ai/models');
    if (r.error) {
        el.innerHTML = `<p class="hint" style="color:var(--danger)">${esc(r.error)}</p>`;
        log('Failed to fetch models: ' + r.error, 'error', { cat: 'AI', details: r.error });
        return;
    }

    const models = r.models || [];
    if (!models.length) {
        el.innerHTML = '<p class="hint">No models found.</p>';
        log('No models returned from provider.', 'warn', { cat: 'AI' });
        return;
    }

    log(`Found ${models.length} available models.`, 'success', {
        cat: 'AI',
        details: `Available models (${models.length}):\n${models.map(m => `• ${m.id || m.name || m}`).join('\n')}`
    });
    el.innerHTML = '<div class="model-picker">' +
        models.map(m => `<button class="model-option" onclick="selectModel('${esc(m.id)}')" title="${esc(m.owned_by || '')}">${esc(m.id)}</button>`).join('') +
        '</div>';
}

function selectModel(id) {
    document.getElementById('ai-model').value = id;
    document.querySelectorAll('.model-option').forEach(b => b.classList.remove('selected'));
    const match = [...document.querySelectorAll('.model-option')].find(b => b.textContent === id);
    if (match) match.classList.add('selected');
    log('Selected model: ' + id, 'info', { cat: 'AI', details: `Active AI model set to: ${id}` });
}

// ── Wireless Setup Guide & Interactive Demo Controller ──

const guideState = {
    step: 1,
    brand: 'samsung',
    isPlaying: false,
    playTimer: null,
    progressTimer: null,
    stepProgress: 0,
    stepDuration: 5500,
    devTapsRemaining: 4,
    autoBlockerOff: false,
    wirelessAllowed: false,
    samplePairPort: 37199,
    sampleConnPort: 42891,
    sampleCode: '849201',
    sampleIp: '192.168.1.105'
};

function openWirelessGuide(step = 1, brand = 'samsung') {
    const modal = document.getElementById('wireless-guide-modal');
    if (!modal) return;
    guideState.step = step;
    guideState.brand = brand;
    setGuideBrand(brand, false);
    setGuideStep(step);
    modal.classList.add('open');
    document.body.style.overflow = 'hidden';
    document.addEventListener('keydown', handleGuideKeydown);
}

function closeWirelessGuide() {
    const modal = document.getElementById('wireless-guide-modal');
    if (!modal) return;
    stopGuideDemo();
    modal.classList.remove('open');
    document.body.style.overflow = '';
    document.removeEventListener('keydown', handleGuideKeydown);
}

function onGuideBackdropClick(e) {
    if (e.target && e.target.id === 'wireless-guide-modal') {
        closeWirelessGuide();
    }
}

function handleGuideKeydown(e) {
    if (e.key === 'Escape') {
        closeWirelessGuide();
    } else if (e.key === 'ArrowRight') {
        nextGuideStep();
    } else if (e.key === 'ArrowLeft') {
        prevGuideStep();
    }
}

function setGuideBrand(brand, render = true) {
    guideState.brand = brand;
    document.querySelectorAll('.guide-brand-tab').forEach(b => {
        b.classList.toggle('active', b.dataset.brand === brand);
    });

    const step2Badge = document.getElementById('step2-badge');
    if (step2Badge) {
        if (brand === 'samsung') {
            step2Badge.textContent = 'Crucial';
            step2Badge.style.background = '#ef4444';
        } else if (brand === 'xiaomi') {
            step2Badge.textContent = 'Security';
            step2Badge.style.background = '#f59e0b';
        } else {
            step2Badge.textContent = 'Check';
            step2Badge.style.background = '#0ea5e9';
        }
    }

    if (render) {
        renderPhoneScreen(guideState.step, brand);
        renderGuideInfo(guideState.step, brand);
    }
}

function setGuideStep(step) {
    step = Math.max(1, Math.min(5, step));
    guideState.step = step;

    // Update Stepper buttons
    document.querySelectorAll('.guide-stepper .step-btn').forEach(btn => {
        const s = parseInt(btn.dataset.step, 10);
        btn.classList.toggle('active', s === step);
        btn.classList.toggle('completed', s < step);
    });

    // Update Footer Buttons
    const prevBtn = document.getElementById('guide-prev-btn');
    const nextBtn = document.getElementById('guide-next-btn');
    if (prevBtn) {
        prevBtn.style.visibility = step === 1 ? 'hidden' : 'visible';
    }
    if (nextBtn) {
        if (step === 5) {
            nextBtn.innerHTML = 'Finish &amp; Connect &#10003;';
            nextBtn.className = 'btn btn-primary';
        } else {
            nextBtn.innerHTML = 'Next Step &#8594;';
            nextBtn.className = 'btn btn-primary';
        }
    }

    renderPhoneScreen(step, guideState.brand);
    renderGuideInfo(step, guideState.brand);
}

function nextGuideStep() {
    if (guideState.step < 5) {
        setGuideStep(guideState.step + 1);
    } else {
        finishGuideAndFocus();
    }
}

function prevGuideStep() {
    if (guideState.step > 1) {
        setGuideStep(guideState.step - 1);
    }
}

function toggleGuideDemo() {
    if (guideState.isPlaying) {
        stopGuideDemo();
    } else {
        startGuideDemo();
    }
}

function startGuideDemo() {
    guideState.isPlaying = true;
    const btn = document.getElementById('guide-autoplay-btn');
    const icon = document.getElementById('demo-play-icon');
    const text = document.getElementById('demo-play-text');
    if (btn) btn.classList.add('playing');
    if (icon) icon.innerHTML = '&#10074;&#10074;';
    if (text) text.textContent = 'Pause Demo';

    runDemoTick();
}

function stopGuideDemo() {
    guideState.isPlaying = false;
    if (guideState.playTimer) clearTimeout(guideState.playTimer);
    if (guideState.progressTimer) clearInterval(guideState.progressTimer);
    guideState.playTimer = null;
    guideState.progressTimer = null;
    guideState.stepProgress = 0;

    const fill = document.getElementById('guide-progress-fill');
    if (fill) fill.style.width = '0%';

    const btn = document.getElementById('guide-autoplay-btn');
    const icon = document.getElementById('demo-play-icon');
    const text = document.getElementById('demo-play-text');
    if (btn) btn.classList.remove('playing');
    if (icon) icon.innerHTML = '&#9654;';
    if (text) text.textContent = 'Play Demo';
}

function runDemoTick() {
    if (!guideState.isPlaying) return;

    // Trigger simulated action based on active step
    triggerStepSimAction(guideState.step);

    const startTime = Date.now();
    const duration = guideState.stepDuration;
    const fill = document.getElementById('guide-progress-fill');

    if (guideState.progressTimer) clearInterval(guideState.progressTimer);
    guideState.progressTimer = setInterval(() => {
        if (!guideState.isPlaying) return clearInterval(guideState.progressTimer);
        const elapsed = Date.now() - startTime;
        const pct = Math.min(100, (elapsed / duration) * 100);
        if (fill) fill.style.width = pct + '%';
    }, 50);

    if (guideState.playTimer) clearTimeout(guideState.playTimer);
    guideState.playTimer = setTimeout(() => {
        if (!guideState.isPlaying) return;
        if (guideState.step < 5) {
            setGuideStep(guideState.step + 1);
            runDemoTick();
        } else {
            // Reached end of demo, loop back to step 1
            setGuideStep(1);
            runDemoTick();
        }
    }, duration);
}

function triggerStepSimAction(step) {
    if (step === 1) {
        setTimeout(() => simulateBuildTap(true), 800);
        setTimeout(() => simulateBuildTap(true), 1600);
    } else if (step === 2) {
        if (guideState.brand === 'samsung' && !guideState.autoBlockerOff) {
            setTimeout(() => toggleSimAutoBlocker(true), 1200);
        }
    } else if (step === 3) {
        setTimeout(() => toggleSimAllowDialog(true), 1500);
    }
}

function simulateBuildTap(silent = false) {
    guideState.devTapsRemaining = Math.max(0, guideState.devTapsRemaining - 1);
    const item = document.getElementById('phone-build-item');
    if (item) {
        const ripple = document.createElement('div');
        ripple.className = 'tap-ripple';
        ripple.style.left = '50%';
        ripple.style.top = '50%';
        item.appendChild(ripple);
        setTimeout(() => ripple.remove(), 600);
    }

    if (guideState.devTapsRemaining <= 0) {
        showPhoneToast('🎉 You are now a developer!');
        const label = document.getElementById('phone-build-status');
        if (label) {
            label.textContent = 'Developer mode enabled ✓';
            label.style.background = 'rgba(34,197,94,0.2)';
            label.style.color = 'var(--safe)';
        }
    } else {
        showPhoneToast(`You are now ${guideState.devTapsRemaining} steps away from being a developer.`);
        const label = document.getElementById('phone-build-status');
        if (label) {
            label.textContent = `Tap ${guideState.devTapsRemaining} more times`;
        }
    }

    const simBtn = document.getElementById('sim-tap-btn');
    if (simBtn) {
        simBtn.textContent = guideState.devTapsRemaining > 0 
            ? `Simulate Tapping Build Number (${guideState.devTapsRemaining} left)` 
            : 'Developer Mode Unlocked! ✓';
    }
}

function toggleSimAutoBlocker(silent = false) {
    guideState.autoBlockerOff = !guideState.autoBlockerOff;
    renderPhoneScreen(2, guideState.brand);
    if (!silent) {
        showPhoneToast(guideState.autoBlockerOff 
            ? 'Auto Blocker disabled — Wireless ADB allowed!' 
            : 'Auto Blocker enabled — ADB commands blocked!');
    }
    const btn = document.getElementById('sim-autoblocker-btn');
    if (btn) {
        btn.textContent = guideState.autoBlockerOff 
            ? 'Auto Blocker: Disabled ✓ (Click to toggle)' 
            : 'Turn OFF Auto Blocker in Demo';
    }
}

function toggleSimAllowDialog(silent = false) {
    guideState.wirelessAllowed = true;
    const dialog = document.getElementById('phone-dialog-allow');
    if (dialog) dialog.style.display = 'none';
    if (!silent) {
        showPhoneToast('Wireless debugging allowed on this network');
    }
}

function showPhoneToast(msg) {
    const screen = document.getElementById('phone-screen');
    if (!screen) return;
    const existing = screen.querySelector('.phone-toast');
    if (existing) existing.remove();

    const toast = document.createElement('div');
    toast.className = 'phone-toast';
    toast.textContent = msg;
    screen.appendChild(toast);
    setTimeout(() => {
        if (toast && toast.parentNode) toast.remove();
    }, 2400);
}

function prefillSamplePorts() {
    document.getElementById('pair-ip').value = guideState.sampleIp;
    document.getElementById('pair-port').value = guideState.samplePairPort;
    document.getElementById('pair-code').value = guideState.sampleCode;
    document.getElementById('conn-ip').value = guideState.sampleIp;
    document.getElementById('conn-port').value = guideState.sampleConnPort;
    showPhoneToast('Pre-filled sample ports in SAMurai!');
    log('Pre-filled sample IP & ports into pair/connect fields.', 'info');
}

function finishGuideAndFocus() {
    closeWirelessGuide();
    showView('dashboard');
    const pairIp = document.getElementById('pair-ip');
    if (pairIp) {
        pairIp.focus();
        pairIp.scrollIntoView({ behavior: 'smooth', block: 'center' });
    }
}

// ── Render Phone Mockup Screen ──

function renderPhoneScreen(step, brand) {
    const el = document.getElementById('phone-screen-content');
    if (!el) return;

    if (step === 1) {
        const isUnlocked = guideState.devTapsRemaining <= 0;
        const statusText = isUnlocked ? 'Developer mode enabled ✓' : `Tap ${guideState.devTapsRemaining} more times`;
        const statusStyle = isUnlocked ? 'background:rgba(34,197,94,0.2);color:var(--safe);' : 'background:rgba(14,165,233,0.2);color:var(--accent);';

        el.innerHTML = `
            <div class="phone-ui-header">
                <span class="phone-ui-back">&#8592;</span>
                <span class="phone-ui-title">Software information</span>
            </div>
            <div class="phone-ui-card">
                <div class="phone-ui-item">
                    <span class="phone-ui-label">${brand === 'samsung' ? 'One UI version' : 'Android version'}</span>
                    <span class="phone-ui-sub">${brand === 'samsung' ? '6.1 / 7.0' : '14'}</span>
                </div>
                <div class="phone-ui-item active-tap" id="phone-build-item" onclick="simulateBuildTap()" style="position:relative;cursor:pointer;">
                    <div style="display:flex;justify-content:space-between;align-items:center;">
                        <span class="phone-ui-label" style="color:var(--accent);font-weight:700;">Build number</span>
                        <span id="phone-build-status" style="font-size:8px;padding:1px 5px;border-radius:4px;font-weight:700;${statusStyle}">${statusText}</span>
                    </div>
                    <span class="phone-ui-sub" style="font-family:var(--mono);color:#fff;margin-top:2px;">UP1A.231005.007.S928BXXU1</span>
                    <span style="font-size:8px;color:#a1a1aa;margin-top:3px;">&#128070; Click or tap to simulate</span>
                </div>
                <div class="phone-ui-item">
                    <span class="phone-ui-label">Baseband version</span>
                    <span class="phone-ui-sub">S928BXXU1AXB5</span>
                </div>
                <div class="phone-ui-item">
                    <span class="phone-ui-label">Kernel version</span>
                    <span class="phone-ui-sub">6.1.43-android14-perf</span>
                </div>
            </div>`;
    } else if (step === 2) {
        if (brand === 'samsung') {
            const isOff = guideState.autoBlockerOff;
            el.innerHTML = `
                <div class="phone-ui-header">
                    <span class="phone-ui-back">&#8592;</span>
                    <span class="phone-ui-title">Auto Blocker</span>
                </div>
                <div class="phone-shield-container">
                    <div class="phone-shield-icon ${isOff ? 'unlocked' : 'active'}">
                        ${isOff ? `
                        <svg width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.2" stroke-linecap="round" stroke-linejoin="round">
                            <path d="M12 22s8-4 8-10V5l-8-3-8 3v7c0 6 8 10 8 10z"/>
                            <polyline points="9 12 11 14 15 10"/>
                        </svg>` : `
                        <svg width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.2" stroke-linecap="round" stroke-linejoin="round">
                            <path d="M12 22s8-4 8-10V5l-8-3-8 3v7c0 6 8 10 8 10z"/>
                            <rect x="9" y="10" width="6" height="5" rx="1"/>
                            <path d="M10 10V8a2 2 0 0 1 4 0v2"/>
                        </svg>`}
                    </div>
                    <div class="phone-shield-title">${isOff ? 'Auto Blocker: Off' : 'Auto Blocker: On'}</div>
                    <div class="phone-shield-status" style="color:${isOff ? 'var(--safe)' : '#fca5a5'};">
                        ${isOff ? '&#10003; Wireless ADB handshakes permitted' : '&#9888; Blocks USB and Wireless ADB'}
                    </div>
                </div>
                <div class="phone-ui-card" style="cursor:pointer;" onclick="toggleSimAutoBlocker()">
                    <div class="phone-switch-row">
                        <div>
                            <div class="phone-ui-label" style="font-weight:700;">Auto Blocker</div>
                            <div class="phone-ui-sub">${isOff ? 'Disabled for debloating' : 'Turn OFF to allow ADB connection'}</div>
                        </div>
                        <div class="phone-switch ${isOff ? 'off' : 'on samsung-autoblocker-on'}">
                            <div class="phone-switch-thumb"></div>
                        </div>
                    </div>
                </div>
                <div class="phone-ui-card" style="opacity:${isOff ? '0.35' : '1'};margin-top:6px;">
                    <div class="phone-ui-item">
                        <span class="phone-ui-label">Block software updates by USB cable</span>
                        <span class="phone-ui-sub">Blocks commands sent via PC and Wireless Debugging</span>
                    </div>
                    <div class="phone-ui-item">
                        <span class="phone-ui-label">Maximum restrictions</span>
                        <span class="phone-ui-sub">Blocks sideloading and ADB debugging</span>
                    </div>
                </div>`;
        } else if (brand === 'xiaomi') {
            el.innerHTML = `
                <div class="phone-ui-header">
                    <span class="phone-ui-back">&#8592;</span>
                    <span class="phone-ui-title">Developer options</span>
                </div>
                <div class="phone-shield-container">
                    <div class="phone-shield-icon unlocked">
                        <span style="font-size:22px;">&#9881;</span>
                    </div>
                    <div class="phone-shield-title">HyperOS / MIUI Setting</div>
                    <div class="phone-shield-status" style="color:#fde047;">SIM Card &amp; Mi Account required</div>
                </div>
                <div class="phone-ui-card highlight">
                    <div class="phone-switch-row">
                        <div>
                            <div class="phone-ui-label" style="font-weight:700;color:var(--accent);">USB debugging (Security)</div>
                            <div class="phone-ui-sub">Allows app removal via ADB</div>
                        </div>
                        <div class="phone-switch on"><div class="phone-switch-thumb"></div></div>
                    </div>
                </div>`;
        } else {
            el.innerHTML = `
                <div class="phone-ui-header">
                    <span class="phone-ui-back">&#8592;</span>
                    <span class="phone-ui-title">Security &amp; Network</span>
                </div>
                <div class="phone-shield-container">
                    <div class="phone-shield-icon unlocked">
                        <span style="font-size:20px;">&#10003;</span>
                    </div>
                    <div class="phone-shield-title">No OEM Blocker</div>
                    <div class="phone-shield-status" style="color:var(--safe);">Standard Android stack</div>
                </div>
                <div class="phone-ui-card">
                    <div class="phone-ui-item">
                        <span class="phone-ui-label">Wi-Fi Connection</span>
                        <span class="phone-ui-sub">Connected to same router as PC</span>
                    </div>
                    <div class="phone-ui-item">
                        <span class="phone-ui-label">MAC Randomization</span>
                        <span class="phone-ui-sub">Standard phone MAC</span>
                    </div>
                </div>`;
        }
    } else if (step === 3) {
        el.innerHTML = `
            <div class="phone-ui-header">
                <span class="phone-ui-back">&#8592;</span>
                <span class="phone-ui-title">Developer options</span>
            </div>
            <div class="phone-ui-card">
                <div class="phone-switch-row">
                    <div>
                        <div class="phone-ui-label">USB debugging</div>
                        <div class="phone-ui-sub">Debug mode when USB is connected</div>
                    </div>
                    <div class="phone-switch on"><div class="phone-switch-thumb"></div></div>
                </div>
            </div>
            <div class="phone-ui-card highlight">
                <div class="phone-switch-row">
                    <div>
                        <div class="phone-ui-label" style="color:var(--accent);font-weight:700;">Wireless debugging</div>
                        <div class="phone-ui-sub">Debug mode when Wi-Fi is connected</div>
                    </div>
                    <div class="phone-switch on"><div class="phone-switch-thumb"></div></div>
                </div>
            </div>
            ${!guideState.wirelessAllowed ? `
            <div class="phone-dialog-overlay" id="phone-dialog-allow">
                <div class="phone-dialog">
                    <div class="phone-dialog-title">Allow wireless debugging?</div>
                    <div class="phone-dialog-text">Network: <strong>Home_Network_5G</strong><br>BSSID: 00:11:22:33:44:55</div>
                    <div style="font-size:8.5px;color:#cbd5e1;display:flex;align-items:center;gap:4px;margin-bottom:8px;">
                        <span style="color:var(--accent);">&#9745;</span> Always allow on this network
                    </div>
                    <div class="phone-dialog-btn-row">
                        <button class="phone-dialog-btn cancel" onclick="toggleSimAllowDialog()">Cancel</button>
                        <button class="phone-dialog-btn allow" onclick="toggleSimAllowDialog()">Allow</button>
                    </div>
                </div>
            </div>` : `
            <div style="text-align:center;padding:12px;font-size:9.5px;color:var(--safe);background:rgba(34,197,94,0.1);border-radius:6px;border:1px solid rgba(34,197,94,0.3);margin-top:6px;">
                &#10003; Wireless debugging active on this Wi-Fi
            </div>`}
            `;
    } else if (step === 4) {
        el.innerHTML = `
            <div class="phone-ui-header">
                <span class="phone-ui-back">&#8592;</span>
                <span class="phone-ui-title">Wireless debugging</span>
            </div>
            <!-- Main Screen Port -->
            <div class="phone-ui-card" style="border-color:rgba(34,197,94,0.6);background:rgba(34,197,94,0.08);">
                <div style="display:flex;justify-content:space-between;align-items:center;">
                    <span class="phone-ui-label" style="color:var(--safe);font-weight:700;">IP address &amp; Port</span>
                    <span style="font-size:7.5px;background:rgba(34,197,94,0.25);color:var(--safe);padding:1px 4px;border-radius:3px;font-weight:700;">CONNECT BOX</span>
                </div>
                <div class="phone-ui-sub" style="font-family:var(--mono);color:#fff;font-size:10px;margin-top:3px;font-weight:600;">
                    ${guideState.sampleIp}:<span style="color:#4ade80;font-weight:800;text-decoration:underline;">${guideState.sampleConnPort}</span>
                </div>
            </div>

            <!-- Pairing Popup Dialog -->
            <div class="phone-ui-card" style="border-color:rgba(14,165,233,0.6);background:rgba(14,165,233,0.08);margin-top:8px;">
                <div style="display:flex;justify-content:space-between;align-items:center;margin-bottom:4px;">
                    <span class="phone-ui-label" style="color:var(--accent);font-weight:700;">Pair with pairing code</span>
                    <span style="font-size:7.5px;background:rgba(14,165,233,0.25);color:var(--accent);padding:1px 4px;border-radius:3px;font-weight:700;">PAIR BOX</span>
                </div>
                <div class="phone-dialog-code-pill">${guideState.sampleCode}</div>
                <div class="phone-ui-sub" style="font-family:var(--mono);color:#cbd5e1;font-size:9.5px;text-align:center;">
                    Pairing Port: <span style="color:var(--accent);font-weight:800;text-decoration:underline;">${guideState.samplePairPort}</span>
                </div>
            </div>`;
    } else if (step === 5) {
        el.innerHTML = `
            <div class="phone-ui-header">
                <span class="phone-ui-back">&#10003;</span>
                <span class="phone-ui-title">SAMurai Connected</span>
            </div>
            <div class="phone-shield-container">
                <div class="phone-shield-icon unlocked" style="width:48px;height:48px;">
                    <svg width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5" stroke-linecap="round" stroke-linejoin="round">
                        <polyline points="20 6 9 17 4 12"/>
                    </svg>
                </div>
                <div class="phone-shield-title" style="color:var(--safe);font-size:12px;">Device Ready!</div>
                <div class="phone-shield-status">ADB Wireless Link Active</div>
            </div>
            <div class="phone-ui-card highlight" style="margin-top:8px;">
                <div class="phone-ui-label" style="font-size:11.5px;font-weight:700;color:#fff;">
                    ${brand === 'samsung' ? 'Galaxy S24 Ultra (SM-S928B)' : 'Android Phone (Wireless)'}
                </div>
                <div class="phone-ui-sub" style="font-family:var(--mono);color:var(--accent);margin:3px 0 6px 0;font-size:9.5px;">
                    ${guideState.sampleIp}:${guideState.sampleConnPort}
                </div>
                <div style="display:flex;gap:6px;flex-wrap:wrap;">
                    <span style="font-size:8.5px;background:rgba(34,197,94,0.18);color:var(--safe);padding:2px 6px;border-radius:4px;font-weight:700;">Battery 92%</span>
                    <span style="font-size:8.5px;background:rgba(14,165,233,0.18);color:var(--accent);padding:2px 6px;border-radius:4px;font-weight:700;">ASOC 99% (Healthy)</span>
                </div>
            </div>`;
    }
}

// ── Render Step Info & Instructions ──

function renderGuideInfo(step, brand) {
    const el = document.getElementById('guide-step-content');
    if (!el) return;

    if (step === 1) {
        el.innerHTML = `
            <div class="step-header-tag">Step 1 of 5 &bull; Unlocking Access</div>
            <h3 class="step-title-main">Enable Developer Options</h3>
            <p class="step-desc-para">
                Android protects system debugging behind a hidden Developer menu. You only need to unlock this once per phone.
            </p>
            <div class="guide-instruction-list">
                <div class="guide-instruction-item">
                    <span class="gi-num">1</span>
                    <div class="gi-text">Open your phone's <strong>Settings</strong> app.</div>
                </div>
                <div class="guide-instruction-item">
                    <span class="gi-num">2</span>
                    <div class="gi-text">Scroll to the very bottom and tap <strong>About phone</strong> &rarr; <strong>Software information</strong> (or <em>About device</em>).</div>
                </div>
                <div class="guide-instruction-item">
                    <span class="gi-num">3</span>
                    <div class="gi-text">Find <strong>Build number</strong> and <strong>tap it rapidly 7 times</strong> until you see <em>"You are now a developer!"</em></div>
                </div>
                <div class="guide-instruction-item">
                    <span class="gi-num">4</span>
                    <div class="gi-text">If prompted, enter your lock screen PIN or password to confirm.</div>
                </div>
            </div>
            <div class="guide-callout info">
                <span class="callout-icon">&#128161;</span>
                <div>
                    Once unlocked, a brand-new <strong>Developer options</strong> menu will permanently appear at the very bottom of your main Settings menu.
                </div>
            </div>
            <div class="guide-actions-bar">
                <button class="btn-interactive-sim" id="sim-tap-btn" onclick="simulateBuildTap()">
                    <span>&#128070;</span>
                    <span>${guideState.devTapsRemaining > 0 ? `Simulate Tapping Build Number (${guideState.devTapsRemaining} left)` : 'Developer Mode Unlocked! ✓'}</span>
                </button>
            </div>`;
    } else if (step === 2) {
        if (brand === 'samsung') {
            el.innerHTML = `
                <div class="step-header-tag" style="color:#ef4444;">Step 2 of 5 &bull; Samsung Critical Setting</div>
                <h3 class="step-title-main">Turn OFF Auto Blocker</h3>
                <div class="guide-callout warning">
                    <span class="callout-icon">&#128737;&#65039;</span>
                    <div>
                        <strong>CRITICAL FOR SAMSUNG USERS (One UI 6.0 / 6.1 / 7):</strong><br>
                        Samsung introduced <strong>Auto Blocker</strong> on newer Galaxy phones (S24, S23, A54/A55, Z Fold/Flip). When ON, Auto Blocker strictly intercepts and <strong>blocks all USB cable commands, sideloading, and Wireless ADB handshakes</strong>!
                        Pairing and connecting will fail with <em>"Connection refused"</em> or hang indefinitely if this is not disabled.
                    </div>
                </div>
                <div class="guide-instruction-list">
                    <div class="guide-instruction-item">
                        <span class="gi-num">1</span>
                        <div class="gi-text">Open phone <strong>Settings</strong> &rarr; tap <strong>Security and privacy</strong>.</div>
                    </div>
                    <div class="guide-instruction-item">
                        <span class="gi-num">2</span>
                        <div class="gi-text">Tap on <strong>Auto Blocker</strong>.</div>
                    </div>
                    <div class="guide-instruction-item">
                        <span class="gi-num">3</span>
                        <div class="gi-text">Switch the main toggle at the top to <strong>OFF</strong> (or disable <em>"Block software updates by USB cable"</em>).</div>
                    </div>
                </div>
                <div class="guide-callout success">
                    <span class="callout-icon">&#9989;</span>
                    <div>
                        <strong>Safe &amp; Reversible:</strong> You can safely switch Auto Blocker back <strong>ON</strong> at any time after you finish debloating and optimizing your phone with SAMurai!
                    </div>
                </div>
                <div class="guide-actions-bar">
                    <button class="btn-interactive-sim warning-theme" id="sim-autoblocker-btn" onclick="toggleSimAutoBlocker()">
                        <span>&#128737;&#65039;</span>
                        <span>${guideState.autoBlockerOff ? 'Auto Blocker: Disabled ✓ (Click to toggle)' : 'Turn OFF Auto Blocker in Demo'}</span>
                    </button>
                </div>`;
        } else if (brand === 'xiaomi') {
            el.innerHTML = `
                <div class="step-header-tag" style="color:#f59e0b;">Step 2 of 5 &bull; Xiaomi / HyperOS Requirement</div>
                <h3 class="step-title-main">Enable Security Debugging</h3>
                <div class="guide-callout warning">
                    <span class="callout-icon">&#9888;&#65039;</span>
                    <div>
                        <strong>Xiaomi Requirement:</strong> HyperOS / MIUI separates USB debugging into standard and security permissions. To allow SAMurai to uninstall or modify packages, you must enable security settings.
                    </div>
                </div>
                <div class="guide-instruction-list">
                    <div class="guide-instruction-item">
                        <span class="gi-num">1</span>
                        <div class="gi-text">Open <strong>Settings</strong> &rarr; <strong>Additional settings</strong> &rarr; <strong>Developer options</strong>.</div>
                    </div>
                    <div class="guide-instruction-item">
                        <span class="gi-num">2</span>
                        <div class="gi-text">Enable <strong>USB debugging (Security settings)</strong>.</div>
                    </div>
                    <div class="guide-instruction-item">
                        <span class="gi-num">3</span>
                        <div class="gi-text"><em>Note:</em> Xiaomi requires an active SIM card and signed-in Mi Account to enable this switch.</div>
                    </div>
                </div>`;
        } else {
            el.innerHTML = `
                <div class="step-header-tag">Step 2 of 5 &bull; Network Verification</div>
                <h3 class="step-title-main">Verify Wi-Fi &amp; Network Setup</h3>
                <p class="step-desc-para">
                    Vanilla Android and Pixel devices have no OEM blockers like Auto Blocker. Just ensure your phone and computer can discover each other.
                </p>
                <div class="guide-instruction-list">
                    <div class="guide-instruction-item">
                        <span class="gi-num">1</span>
                        <div class="gi-text">Ensure phone and computer are on the <strong>same Wi-Fi network / router</strong>.</div>
                    </div>
                    <div class="guide-instruction-item">
                        <span class="gi-num">2</span>
                        <div class="gi-text">Avoid <em>Guest Wi-Fi</em> networks which enforce client isolation (blocking device-to-device traffic).</div>
                    </div>
                    <div class="guide-instruction-item">
                        <span class="gi-num">3</span>
                        <div class="gi-text">Turn off VPNs on both devices while pairing to avoid subnet routing issues.</div>
                    </div>
                </div>`;
        }
    } else if (step === 3) {
        el.innerHTML = `
            <div class="step-header-tag">Step 3 of 5 &bull; Wireless ADB Activation</div>
            <h3 class="step-title-main">Enable Wireless Debugging</h3>
            <p class="step-desc-para">
                Enable Android's built-in ADB Wi-Fi daemon so SAMurai can connect over your local wireless network.
            </p>
            <div class="guide-instruction-list">
                <div class="guide-instruction-item">
                    <span class="gi-num">1</span>
                    <div class="gi-text">Go to <strong>Settings</strong> &rarr; scroll to the very bottom and tap <strong>Developer options</strong>.</div>
                </div>
                <div class="guide-instruction-item">
                    <span class="gi-num">2</span>
                    <div class="gi-text">Scroll down to the <em>Debugging</em> section and toggle <strong>Wireless debugging</strong> to <strong>ON</strong>.</div>
                </div>
                <div class="guide-instruction-item">
                    <span class="gi-num">3</span>
                    <div class="gi-text">When prompted with <em>"Allow wireless debugging on this network?"</em>, check <strong>"Always allow on this network"</strong> and tap <strong>Allow</strong>.</div>
                </div>
            </div>
            <div class="guide-callout info">
                <span class="callout-icon">&#128161;</span>
                <div>
                    <strong>Keep Screen On:</strong> Some phones enter low-power sleep and suspend wireless debugging if the screen turns off during initial pairing. Keep the screen active for a few seconds.
                </div>
            </div>
            <div class="guide-actions-bar">
                <button class="btn-interactive-sim" onclick="toggleSimAllowDialog()">
                    <span>&#10003;</span>
                    <span>Simulate "Allow on this Network"</span>
                </button>
            </div>`;
    } else if (step === 4) {
        el.innerHTML = `
            <div class="step-header-tag" style="color:var(--accent);">Step 4 of 5 &bull; The Most Common Mistake</div>
            <h3 class="step-title-main">Pairing Code vs. Connection Port</h3>
            <p class="step-desc-para">
                Android separates wireless debugging into two distinct steps with <strong>two different ports</strong>. Mixing them up causes 90% of connection failures.
            </p>

            <div class="dual-port-container">
                <div class="port-card pair-port">
                    <span class="port-card-badge">Step A &bull; One-Time Pair</span>
                    <div class="port-card-title">Pairing Popup Dialog</div>
                    <div class="port-card-desc">
                        Tap <em>"Pair device with pairing code"</em>. A popup appears showing a <strong>6-digit Code</strong> and a <strong>Pairing Port</strong> (e.g. ${guideState.samplePairPort}).
                    </div>
                    <div class="port-card-dest">&#8594; Enter into SAMurai's <strong>"Pair device"</strong> box</div>
                </div>

                <div class="port-card conn-port">
                    <span class="port-card-badge">Step B &bull; Active Connection</span>
                    <div class="port-card-title">Main Screen Address</div>
                    <div class="port-card-desc">
                        Look at the main Wireless Debugging screen (behind the popup). Note the <strong>IP address &amp; Port</strong> (e.g. ${guideState.sampleConnPort}).
                    </div>
                    <div class="port-card-dest">&#8594; Enter into SAMurai's <strong>"Connect"</strong> box</div>
                </div>
            </div>

            <div class="guide-callout warning">
                <span class="callout-icon">&#9888;&#65039;</span>
                <div>
                    <strong>Samsung Port Rotation:</strong> Samsung rotates the connection port whenever your phone reconnects to Wi-Fi or toggles Wireless Debugging. If your session drops in the future, just check the port on the phone's main screen and reconnect!
                </div>
            </div>

            <div class="guide-actions-bar">
                <button class="btn-interactive-sim" onclick="prefillSamplePorts()">
                    <span>&#9889;</span>
                    <span>Pre-fill Sample Ports into SAMurai</span>
                </button>
            </div>`;
    } else if (step === 5) {
        el.innerHTML = `
            <div class="step-header-tag" style="color:var(--safe);">Step 5 of 5 &bull; Ready to Debloat</div>
            <h3 class="step-title-main">Connected &amp; Ready!</h3>
            <p class="step-desc-para">
                Once paired and connected, your device will show up immediately on the SAMurai dashboard with live hardware metrics.
            </p>
            <div class="guide-instruction-list">
                <div class="guide-instruction-item">
                    <span class="gi-num">1</span>
                    <div class="gi-text">Click <strong>Pair</strong> in SAMurai. The activity log will confirm <em>"Successfully paired"</em>.</div>
                </div>
                <div class="guide-instruction-item">
                    <span class="gi-num">2</span>
                    <div class="gi-text">Click <strong>Connect</strong>. Your device will light up green under <strong>Connected devices</strong>.</div>
                </div>
                <div class="guide-instruction-item">
                    <span class="gi-num">3</span>
                    <div class="gi-text">Check your battery health (ASOC metric), temperature, and package count.</div>
                </div>
            </div>
            <div class="guide-callout success">
                <span class="callout-icon">&#127881;</span>
                <div>
                    <strong>You are ready:</strong> Head over to the <strong>Apps</strong> view to safely remove bloatware, apply curated <strong>Presets</strong>, or use <strong>AI Cleanup</strong> to analyze which apps are safe to remove!
                </div>
            </div>
            <div class="guide-actions-bar" style="margin-top:1.25rem;">
                <button class="btn btn-primary" onclick="finishGuideAndFocus()" style="padding:.6rem 1.25rem;font-size:13px;font-weight:600;">
                    Ready! Close Guide &amp; Connect Device &#8594;
                </button>
                <button class="btn btn-ghost" onclick="setGuideStep(1)">
                    Restart Tutorial
                </button>
            </div>`;
    }
}

refreshDevices();
loadAiSettings();
log('SAMurai console initialized.', 'info', { cat: 'SYS', details: 'Web UI loaded. Ready for ADB operations and device management.' });
