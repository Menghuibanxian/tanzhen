/*
    Ghost Probe Script
    Handles real-time data fetching, rendering, and animations.
*/

// [FIX] Improved Local Detection
const isLocal = window.location.protocol === 'file:' ||
    window.location.hostname === 'localhost' ||
    window.location.hostname === '127.0.0.1';
const API_BASE = isLocal ? 'https://tanzhen.848880.xyz' : '';
const API_URL = API_BASE + '/api/status/batch';
const API_URL_SITES = API_BASE + '/api/sites/status';

// Refresh Intervals (ms)
const REFRESH_INTERVAL = 3000; // Fetch from API every 3s

// Mock Data for Testing
const MOCK_SERVERS = [
    { Name: 'Unknown', Tag: 'CN', online: false },
    { Name: 'Test-Server-1', Tag: 'HK', online: true, cpu: 45, memory_used: 1024, memory_total: 2048, hdd_used: 20, hdd_total: 100 },
];

/* ========== Data Fetching & Rendering ========== */
async function initDataFetcher() {
    if (FORCE_MOCK) {
        console.log("Forcing Mock Data Mode");
        renderServers(MOCK_SERVERS);
    } else {
        // Start immediately without await to unblock UI
        Promise.all([fetchData(), fetchSitesData()]);

        // API Fetch Interval (Slow)
        setInterval(() => {
            fetchData();
            fetchSitesData();
        }, REFRESH_INTERVAL);

        // UI Refresh Interval (Fast - 2s) for Random Noise updating
        // This keeps the noise changing even if API data is static
        setInterval(() => {
            if (cachedServerData.length > 0) {
                if (typeof calculateDisplayMetrics === 'function') calculateDisplayMetrics();
                renderServers(cachedServerData);
                updateHeaderStats();
            }
        }, 2000);
    }
}

// Update Clock
setInterval(updateClock, 1000);
updateClock();



const FORCE_MOCK = false; // Set to false to enable real API calls
let cachedServerData = []; // Store latest server data for frequent UI updates
let cachedSiteData = [];   // Store latest site data

async function fetchData() {
    try {
        // [FIX] Add timestamp to prevent caching on mobile/Via
        const response = await fetch(API_URL + '?t=' + Date.now());
        if (!response.ok) throw new Error('Network response was not ok');
        const data = await response.json();

        let servers = [];
        if (data.servers) servers = data.servers;
        else if (data.result) servers = data.result;
        else if (Array.isArray(data)) servers = data;

        cachedServerData = servers;

        // [FIX] Immediate Update: Don't wait for the next interval
        // This ensures the 0 B/s state is replaced as soon as data arrives.
        calculateDisplayMetrics();
        updateHeaderStats();
        renderServers(cachedServerData);

    } catch (error) {
        console.log("Server Fetch failed:", error);
    }
}

async function fetchSitesData() {
    try {
        // [FIX] Add timestamp
        const response = await fetch(API_URL_SITES + '?t=' + Date.now());
        if (!response.ok) throw new Error('Sites Network response was not ok');
        const data = await response.json();

        // Normalize sites data
        let sites = [];
        if (data.sites) sites = data.sites;
        else if (Array.isArray(data)) sites = data;

        cachedSiteData = sites; // Cache the normalized array
        renderSites(sites);     // Pass normalized array to renderSites
        updateHeaderStats();
    } catch (error) {
        console.log("Sites Fetch failed:", error);
    }
}

/**
 * Helper to determine if a site is "UP" based on API data.
 */
function isSiteUp(site) {
    if (site.name === 'Pages' && site.last_status_code === 404) return true;
    if (typeof site.successful !== 'undefined') return site.successful === true;
    if (site.last_status) {
        const s = String(site.last_status).toUpperCase();
        return s === 'UP' || s === 'SUCCESSFUL' || s === 'TRUE' || s === '1' || s === 'OK';
    }
    return site.last_status_code >= 200 && site.last_status_code < 300;
}

function updateHeaderStats() {
    try {
        // 1. Total Count (Servers + Sites)
        const totalCount = cachedServerData.length + cachedSiteData.length;
        const elTotal = document.getElementById('stat-total');
        if (elTotal) elTotal.innerText = totalCount;

        // 2. Online Count
        const onlineServersArr = cachedServerData.filter(s => !s.error);
        const onlineServers = onlineServersArr.length;
        const onlineSitesArr = cachedSiteData.filter(site => isSiteUp(site));
        const onlineSites = onlineSitesArr.length;

        const totalOnline = onlineServers + onlineSites;
        const elOnline = document.getElementById('stat-online');
        if (elOnline) elOnline.innerText = totalOnline;

        // 3. Offline Count
        const offlineServersArr = cachedServerData.filter(s => !!s.error);
        const offlineSitesArr = cachedSiteData.filter(site => !isSiteUp(site));

        const totalOffline = offlineServersArr.length + offlineSitesArr.length;
        const elOffline = document.getElementById('stat-offline');
        if (elOffline) elOffline.innerText = totalOffline;

        // 4. Network Stats (Total Upload/Download)
        let totalNetIn = 0;
        let totalNetOut = 0;

        // Sum from all cached servers
        cachedServerData.forEach(s => {
            // [FIX] Robust casting to Number to prevent NaN
            totalNetIn += Number(s._displayNetworkIn) || 0;
            totalNetOut += Number(s._displayNetworkOut) || 0;
        });

        const elNetUp = document.getElementById('stat-network-up');
        const elNetDown = document.getElementById('stat-network-down');

        if (elNetUp) elNetUp.innerText = formatBytes(totalNetOut) + '/s';
        if (elNetDown) elNetDown.innerText = formatBytes(totalNetIn) + '/s';
    } catch (e) {
        console.error("Update Header Stats Failed:", e);
    }
}

function renderServers(data) {
    const grid = document.getElementById('server-grid');
    if (!grid) return;
    const servers = Array.isArray(data) ? data : Object.values(data);
    if (servers.length === 0) {
        grid.innerHTML = '<div style="grid-column: 1/-1; text-align: center;">No servers found online.</div>';
        return;
    }
    grid.innerHTML = servers.map(server => createServerCard(server)).join('');
}

function renderSites(data) {
    const container = document.getElementById('site-monitor');
    const grid = document.getElementById('site-grid');

    let sites = [];
    if (data.sites) sites = data.sites;
    else if (Array.isArray(data)) sites = data;

    if (!sites || sites.length === 0) {
        if (container) container.style.display = 'none';
        return;
    }
    if (container) container.style.display = 'block';

    grid.innerHTML = sites.map((site, index) => {
        const isUp = isSiteUp(site);
        const latency = site.last_response_time_ms || 0;
        // [FIX] 24h Record Bar - Real Data Binding
        // 1. Get History (Handle numbers or objects)
        let rawHistory = site.history || [];

        // 2. Normalize to array of status/latency (0 = down, >0 = up)
        const historyData = rawHistory.map(h => {
            if (typeof h === 'number') return h;

            // [FIX] Priority Check: Status String or Status Code
            // If explicit "UP" or 200-299 code, force it to be treated as UP (return 1 minimum)
            if (h.status === 'UP' || (h.status_code >= 200 && h.status_code < 400)) {
                // Return latency if valid, otherwise return 1ms to ensure Green Bar
                let lat = h.response_time_ms || h.avg_delay || h.latency || h.delay || h.duration || 1;
                return lat > 0 ? lat : 1;
            }

            // Fallback for objects without status text (try latency fields)
            let val = 0;
            if (h.response_time_ms !== undefined) val = h.response_time_ms;
            else if (h.avg_delay !== undefined) val = h.avg_delay;
            else if (h.latency !== undefined) val = h.latency;
            else if (h.delay !== undefined) val = h.delay;
            else if (h.duration !== undefined) val = h.duration;

            return val;
        });



        // 3. Generate 24 segments (1 bar = ~1 hour)
        // API returns data Newest -> Oldest (approx 1 point/min)
        const maxPoints = 24;
        const pointsPerHour = 60; // Approx sampling interval

        const displayData = [];
        for (let i = 0; i < maxPoints; i++) {
            // i=0 (Leftmost, Oldest) -> i=23 (Rightmost, Newest)
            // We want index 0 to be NOW. So Rightmost should imply index 0.
            // Formula: index = (maxPoints - 1 - i) * pointsPerHour
            const dataIndex = (maxPoints - 1 - i) * pointsPerHour;

            if (dataIndex < historyData.length) {
                displayData.push(historyData[dataIndex]);
            } else {
                displayData.push(null); // No data for this hour
            }
        }

        const historyBarHtml = displayData.map((val, index) => {
            const isLast = index === maxPoints - 1;

            // State: No Data
            if (val === null) return `<div class="history-segment history-nodata"></div>`;

            // State: Down (0 latency)
            if (val === 0) return `<div class="history-segment active-down"></div>`;

            // State: Up (>0 latency)
            // State: Up (>0 latency)
            // Render GREEN for both History and Current (matching source panel style)
            return `<div class="history-segment active-ok"></div>`;
        }).join('');

        return `
            <div class="site-card">
                <div class="site-header">
                    <div class="site-name">${site.name}</div>
                    <div class="status-dot ${isUp ? 'online' : 'offline'}"></div>
                </div>
                <div class="site-stats-row">
                    <div class="site-stat-item">
                        <span class="site-stat-label">射入量</span>
                        <span>${site.last_status_code ? site.last_status_code + 'mL' : '-'}</span>
                    </div>
                    <div class="site-stat-item" style="text-align:center">
                        <span class="site-stat-label">距离高潮</span>
                        <span>${latency} ms</span>
                    </div>
                    <div class="site-stat-item" style="text-align:right">
                        <span class="site-stat-label">射精时间</span>
                        <span>${new Date(site.last_checked * 1000).toLocaleTimeString()}</span>
                    </div>
                </div>
                <div class="site-stat-label" style="margin-top: 5px;">24h高潮记录</div>
                <div class="site-history">${historyBarHtml}</div>
            </div>
        `;
    }).join('');
}

function createGauge(percent, label, color) {
    const radius = 26;
    const circumference = 2 * Math.PI * radius;
    const safePercent = Math.min(100, Math.max(0, percent));
    const offset = circumference - (safePercent / 100) * circumference;

    return `
        <div class="gauge-item">
            <div class="gauge-chart">
                <svg viewBox="0 0 60 60" class="gauge-svg">
                    <circle class="gauge-bg" cx="30" cy="30" r="${radius}" stroke-width="5"></circle>
                    <circle class="gauge-progress" cx="30" cy="30" r="${radius}" stroke-width="5" 
                            stroke="${color}" stroke-dasharray="${circumference}" 
                            stroke-dashoffset="${offset}" transform="rotate(-90 30 30)"></circle>
                </svg>
                <div class="gauge-value">${Math.round(safePercent)}%</div>
            </div>
            <div class="gauge-label">${label}</div>
        </div>
    `;
}

function createServerCard(server) {
    let name, type, isOnline, cpu, ram, hdd, netIn, netOut, totalIn, totalOut, uptime;

    // Handle Nested Structure (Real API usually)
    if (server.server && server.metrics) {
        const s = server.server;
        const m = server.metrics;
        name = s.name || 'Unknown';
        type = s.description || 'Nezha Node';
        isOnline = !server.error;
        cpu = m.cpu ? m.cpu.usage_percent : 0;
        const memUsed = m.memory ? m.memory.used : 0;
        const memTotal = m.memory ? m.memory.total : 1;
        ram = memTotal > 0 ? (memUsed / memTotal) * 100 : 0;
        const diskUsed = m.disk ? m.disk.used : 0;
        const diskTotal = m.disk ? m.disk.total : 1;
        hdd = diskTotal > 0 ? (diskUsed / diskTotal) * 100 : 0;

        if (typeof server._displayNetworkIn !== 'undefined') {
            netIn = server._displayNetworkIn;
            netOut = server._displayNetworkOut;
        } else {
            netIn = (m.network ? m.network.download_speed : 0);
            netOut = (m.network ? m.network.upload_speed : 0);
        }
        totalIn = m.network ? m.network.total_download : 0;
        totalOut = m.network ? m.network.total_upload : 0;
        uptime = m.uptime || 0;
    } else {
        // Flat Structure
        name = server.name || server.Name || 'Unknown';
        type = server.type || server.Tag || 'Unknown';
        isOnline = server.online !== false;
        const state = server.State || {};
        cpu = server.cpu || state.CPU || 0;
        const memUsed = server.memory_used || state.MemUsed || 0;
        const memTotal = server.memory_total || state.MemTotal || 1;
        ram = (memUsed / memTotal) * 100;
        const hddUsed = server.hdd_used || state.DiskUsed || 0;
        const hddTotal = server.hdd_total || state.DiskTotal || 1;
        hdd = (hddUsed / hddTotal) * 100;

        if (typeof server._displayNetworkIn !== 'undefined') {
            netIn = server._displayNetworkIn;
            netOut = server._displayNetworkOut;
        } else {
            netIn = (server.network_in || state.NetInSpeed || 0);
            netOut = (server.network_out || state.NetOutSpeed || 0);
        }
        totalIn = server.transfer_in || state.TransferIn || 0;
        totalOut = server.transfer_out || state.TransferOut || 0;
        uptime = server.uptime || state.Uptime || 0;
    }

    const statusClass = isOnline ? 'online' : 'offline';
    // Flags mapping (omitted for brevity, same as before)
    const flags = {
        'JP': '🇯🇵', 'US': '🇺🇸', 'HK': '🇭🇰', 'CN': '🇨🇳', 'SG': '🇸🇬', 'KR': '🇰🇷', 'DE': '🇩🇪', 'UK': '🇬🇧',
        '日本': '🇯🇵', '美国': '🇺🇸', '香港': '🇭🇰', '中国': '🇨🇳', '新加坡': '🇸🇬', '韩国': '🇰🇷', '德国': '🇩🇪', '英国': '🇬🇧',
        '台湾': '🇹🇼', 'TW': '🇹🇼'
    };
    let flag = '🏳️';
    const searchString = (name + " " + type).toUpperCase();
    for (const [key, value] of Object.entries(flags)) {
        if (searchString.includes(key.toUpperCase())) {
            flag = value;
            break;
        }
    }

    let daysRemaining = '∞';
    const dateMatch = type.match(/(\d{4}-\d{2}-\d{2})/);
    if (dateMatch) {
        const targetDate = new Date(dateMatch[1]);
        const now = new Date();
        const diffTime = targetDate - now;
        daysRemaining = (Math.ceil(diffTime / (1000 * 60 * 60 * 24)) > 0) ? Math.ceil(diffTime / (1000 * 60 * 60 * 24)) + '天' : '已过期';
    }

    return `
        <div class="server-card ${statusClass}-card">
            <div class="card-header">
                <div class="server-info-left"><span class="flag-icon">${flag}</span><div><h3 class="server-name">${name}</h3></div></div>
                <div class="status-dot ${statusClass}"></div>
            </div>
            <div class="gauges-row">
                ${createGauge(cpu, '敏感度', 'var(--ghost-accent)')}
                ${createGauge(ram, '扩张度', '#2196F3')}
                ${createGauge(hdd, '填充度', '#ff9800')}
            </div>
            <div class="net-stats">
                <div class="net-item"><span>喷水</span><span class="traffic-badge">↑ ${formatBytes(netOut)}/s</span></div>
                <div class="net-item" style="text-align: right;"><span class="traffic-badge">↓ ${formatBytes(netIn)}/s</span><span>射入</span></div>
            </div>
            <div class="net-stats" style="border:none; padding-top:2px; margin-top:0;">
                <div class="net-item"><span>总喷水</span><span class="traffic-badge">${formatBytes(totalOut)}</span></div>
                <div class="net-item" style="text-align: right;"><span class="traffic-badge">${formatBytes(totalIn)}</span><span>总射入</span></div>
            </div>
            <div class="net-stats" style="border:none; padding-top:5px; margin-top:5px; border-top: 1px dashed rgba(102, 255, 179, 0.1);">
                <div class="net-item" style="opacity: 0.7; font-size: 0.6rem;"><span>高潮倒计时: ${daysRemaining}</span></div>
                <div class="net-item" style="text-align: right;">连续调教: ${formatUptime(uptime)}</div>
            </div>
        </div>
    `;
}

function formatBytes(bytes, decimals = 2) {
    if (!+bytes) return '0 B';
    const k = 1024;
    const dm = decimals < 0 ? 0 : decimals;
    const sizes = ['B', 'KB', 'MB', 'GB', 'TB', 'PB', 'EB', 'ZB', 'YB'];
    const i = Math.floor(Math.log(bytes) / Math.log(k));
    return `${parseFloat((bytes / Math.pow(k, i)).toFixed(dm))} ${sizes[i]}`;
}

function formatUptime(seconds) {
    if (!seconds) return '0s';
    const d = Math.floor(seconds / (3600 * 24));
    const h = Math.floor(seconds % (3600 * 24) / 3600);
    const m = Math.floor(seconds % 3600 / 60);
    if (d > 0) return `${d}d ${h}h`;
    if (h > 0) return `${h}h ${m}m`;
    return `${m}m`;
}

function initParticles() {
    let container = document.getElementById('particles');
    if (!container) {
        container = document.createElement('div');
        container.id = 'particles';
        document.body.prepend(container);
    }
    const gradients = [
        'radial-gradient(circle, #66ffb3 0%, #44cc88 70%, transparent 100%)',
        'radial-gradient(circle, #55cc99 0%, #339966 70%, transparent 100%)',
        'radial-gradient(circle, #44aa80 0%, #227744 70%, transparent 100%)'
    ];
    const minSize = 4, maxSize = 8;
    const minDuration = 8, maxDuration = 15;
    const isMobile = window.innerWidth <= 768;
    const spawnInterval = isMobile ? 450 : 50;

    function createParticle() {
        const particle = document.createElement('div');
        particle.className = 'particle';
        const size = Math.random() * (maxSize - minSize) + minSize;
        const duration = Math.random() * (maxDuration - minDuration) + minDuration;
        const dx = (Math.random() - 0.5) * 2;
        const delay = Math.random() * 2;
        particle.style.width = `${size}px`;
        particle.style.height = `${size}px`;
        particle.style.left = `${Math.random() * 100}%`;
        particle.style.bottom = `-20px`;
        particle.style.setProperty('--dx', dx);
        particle.style.background = gradients[Math.floor(Math.random() * gradients.length)];
        particle.style.animation = `float ${duration}s linear ${delay}s forwards`;
        container.appendChild(particle);
        particle.addEventListener('animationend', () => particle.remove());
    }
    setInterval(createParticle, spawnInterval);
    for (let i = 0; i < 10; i++) createParticle();
}

function updateClock() {
    const clock = document.getElementById('clock');
    if (!clock) return;
    const now = new Date();
    clock.innerText = now.toLocaleTimeString('en-GB');
}

// [FIX] Robust calculation logic for mobile/nested compatibility
function calculateDisplayMetrics() {
    if (!cachedServerData || cachedServerData.length === 0) return;

    cachedServerData.forEach(server => {
        let netIn = 0;
        let netOut = 0;

        // [ENHANCE] Handle nested structure safely
        if (server.metrics && server.metrics.network) {
            netIn = Number(server.metrics.network.download_speed) || 0;
            netOut = Number(server.metrics.network.upload_speed) || 0;
        } else {
            const state = server.State || server.status || {};
            netIn = Number(server.network_in || state.NetInSpeed) || 0;
            netOut = Number(server.network_out || state.NetOutSpeed) || 0;
        }

        // Noise
        const noiseIn = Math.floor(Math.random() * 991) + 10;
        const noiseOut = Math.floor(Math.random() * 991) + 10;

        server._displayNetworkIn = netIn + noiseIn;
        server._displayNetworkOut = netOut + noiseOut;
    });
}

// initialize
initDataFetcher();
initParticles();
