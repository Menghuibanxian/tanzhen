/*
    Ghost Probe Script
    Handles real-time data fetching, rendering, and animations.
*/

// Configuration
// You can switch to mock data if API is down
const API_URL = 'https://tanzhen.848880.xyz/api/status/batch'; // Use local proxy or direct URL
const API_URL_SITES = 'https://tanzhen.848880.xyz/api/sites/status';
// const API_URL = 'http://localhost:8787/api/status/batch'; // Local Dev

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
        await Promise.all([fetchData(), fetchSitesData()]);
        // API Fetch Interval (Slow)
        setInterval(() => {
            fetchData();
            fetchSitesData();
        }, REFRESH_INTERVAL);

        // UI Refresh Interval (Fast - 2s) for Random Noise
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
        const response = await fetch(API_URL);
        if (!response.ok) throw new Error('Network response was not ok');
        const data = await response.json();

        // Nezha API returns { servers: [...] } or { result: [...] } or array?
        // Usually it's an object with a 'result' or directly an array if it's the batch status.
        // Based on typical Nezha status/batch logic, let's log and handle valid data.

        let servers = [];
        if (data.servers) servers = data.servers;
        else if (data.result) servers = data.result;
        else if (Array.isArray(data)) servers = data;

        cachedServerData = servers;
        // Initial calculation and render
        if (typeof calculateDisplayMetrics === 'function') calculateDisplayMetrics();
        renderServers(cachedServerData);
        updateHeaderStats();
    } catch (error) {
        console.log("Server Fetch failed:", error);
    }
}

async function fetchSitesData() {
    try {
        const response = await fetch(API_URL_SITES);
        if (!response.ok) throw new Error('Sites Network response was not ok');
        const data = await response.json();

        // Normalize sites data
        let sites = [];
        if (data.sites) sites = data.sites;
        else if (Array.isArray(data)) sites = data;

        cachedSiteData = sites; // Cache the normalized array
        renderSites(sites);     // Pass normalized array to renderSites (and update renderSites to expect it or handle it)
        updateHeaderStats();
    } catch (error) {
        console.log("Sites Fetch failed:", error);
    }
}

/**
 * Helper to determine if a site is "UP" based on API data.
 * Prioritizes 'successful' or 'last_status' fields over status code.
 */
function isSiteUp(site) {
    // Special handle: If 'Pages' usually returns 404 but is considered normal
    if (site.name === 'Pages' && site.last_status_code === 404) return true;

    if (typeof site.successful !== 'undefined') {
        return site.successful === true;
    }

    if (site.last_status) {
        const s = String(site.last_status).toUpperCase();
        return s === 'UP' || s === 'SUCCESSFUL' || s === 'TRUE' || s === '1' || s === 'OK';
    }

    // Fallback if no explicit status field (though user prefers avoiding this, we keep it as last resort)
    return site.last_status_code >= 200 && site.last_status_code < 300;
}

function updateHeaderStats() {
    // 1. Total Count (Servers + Sites)
    // "今日已调教"
    const totalCount = cachedServerData.length + cachedSiteData.length;
    const elTotal = document.getElementById('stat-total');
    if (elTotal) elTotal.innerText = totalCount;

    // 2. Online Count (Online Servers + Online Sites)
    // "同时调教的数就是肉便器在线的个数" + "性奴的状态"
    // Server Online: !server.error
    const onlineServersArr = cachedServerData.filter(s => !s.error);
    const onlineServers = onlineServersArr.length;
    // Site Online: Use shared helper logic
    const onlineSitesArr = cachedSiteData.filter(site => isSiteUp(site));
    const onlineSites = onlineSitesArr.length;

    const totalOnline = onlineServers + onlineSites;
    const elOnline = document.getElementById('stat-online');
    if (elOnline) elOnline.innerText = totalOnline;

    // 3. Offline Count (Offline Servers + Offline Sites)
    // "巢穴数量就是肉便器性奴离线的个数"
    // Server offline: usually !server.online or based on API structure. 
    // In our createServerCard logic: isOnline = !server.error;
    const offlineServersArr = cachedServerData.filter(s => !!s.error); // error: true means offline
    const offlineSitesArr = cachedSiteData.filter(site => !isSiteUp(site));

    const totalOffline = offlineServersArr.length + offlineSitesArr.length;
    const elOffline = document.getElementById('stat-offline');
    if (elOffline) elOffline.innerText = totalOffline;

    // 4. Network Stats (Total Upload/Download)
    let totalNetIn = 0;
    let totalNetOut = 0;

    // Sum from all cached servers using the SYNCED display values
    cachedServerData.forEach(s => {
        // Use synced values (or fallback to 0/raw if not yet calc'd)
        const netIn = (typeof s._displayNetworkIn !== 'undefined') ? s._displayNetworkIn : (Number(s.network_in) || 0);
        const netOut = (typeof s._displayNetworkOut !== 'undefined') ? s._displayNetworkOut : (Number(s.network_out) || 0);

        totalNetIn += netIn;
        totalNetOut += netOut;
    });

    const elNetUp = document.getElementById('stat-network-up');
    const elNetDown = document.getElementById('stat-network-down');

    if (elNetUp) elNetUp.innerText = formatBytes(totalNetOut) + '/s';
    if (elNetDown) elNetDown.innerText = formatBytes(totalNetIn) + '/s';
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

    // Check structure: usually { "sites": [...] } or array
    let sites = [];
    if (data.sites) sites = data.sites;
    else if (Array.isArray(data)) sites = data;

    if (!sites || sites.length === 0) {
        if (container) container.style.display = 'none';
        return;
    }

    if (container) container.style.display = 'block';



    // Render Cards for Grid Layout
    grid.innerHTML = sites.map(site => {
        const isUp = isSiteUp(site);

        const latency = site.last_response_time_ms || 0;

        // History Bar Logic
        const historySegments = site.history || Array(30).fill({ status: 1 });
        const historyBarHtml = historySegments.slice(-30).map(point => {
            // Placeholder: assume point has status or just use dummy ok
            // Real logic: check point.status or latency
            return `<div class="history-segment ${isUp ? 'ok' : 'down'}"></div>`;
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
                <div class="site-history">
                    ${historyBarHtml}
                </div>
            </div>
        `;
    }).join('');
}


/* ========== Helper: Create Circular Gauge ========== */
function createGauge(percent, label, color) {
    const radius = 26;
    const circumference = 2 * Math.PI * radius;
    // Ensure percent is between 0 and 100
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
    // 1. Normalize Data Structure
    // Handle both Flat (Mock) and Nested (API: {server:{...}, metrics:{...}})
    let name, type, isOnline, cpu, ram, hdd, netIn, netOut, totalIn, totalOut, uptime;

    if (server.server && server.metrics) {
        // Real API Structure
        const s = server.server;
        const m = server.metrics;

        name = s.name || 'Unknown';
        type = s.description || 'Nezha Node'; // Use description as type/tag
        isOnline = !server.error; // Assuming error=false means online

        cpu = m.cpu ? m.cpu.usage_percent : 0;

        const memUsed = m.memory ? m.memory.used : 0;
        const memTotal = m.memory ? m.memory.total : 1;
        ram = memTotal > 0 ? (memUsed / memTotal) * 100 : 0;

        const diskUsed = m.disk ? m.disk.used : 0;
        const diskTotal = m.disk ? m.disk.total : 1;
        hdd = diskTotal > 0 ? (diskUsed / diskTotal) * 100 : 0;

        // Use Pre-calculated Display Metrics if available (Sync with header)
        if (typeof server._displayNetworkIn !== 'undefined') {
            netIn = server._displayNetworkIn;
            netOut = server._displayNetworkOut;
        } else {
            // Fallback if not yet calculated
            netIn = (m.network ? m.network.download_speed : 0);
            netOut = (m.network ? m.network.upload_speed : 0);
        }

        // Total Transfer
        totalIn = m.network ? m.network.total_download : 0;
        totalOut = m.network ? m.network.total_upload : 0;

        uptime = m.uptime || 0;
    } else {
        // Flat Structure (Mock / Other API variants)
        name = server.name || server.Name || 'Unknown';
        type = server.type || server.Tag || 'Unknown';
        isOnline = server.online !== false;

        // Parse State Object if present
        const state = server.State || {};
        cpu = server.cpu || state.CPU || 0;

        const memUsed = server.memory_used || state.MemUsed || 0;
        const memTotal = server.memory_total || state.MemTotal || 1;
        ram = (memUsed / memTotal) * 100;

        const hddUsed = server.hdd_used || state.DiskUsed || 0;
        const hddTotal = server.hdd_total || state.DiskTotal || 1;
        hdd = (hddUsed / hddTotal) * 100;

        // Use Pre-calculated Display Metrics if available (Sync with header)
        if (typeof server._displayNetworkIn !== 'undefined') {
            netIn = server._displayNetworkIn;
            netOut = server._displayNetworkOut;
        } else {
            // Fallback
            netIn = (server.network_in || state.NetInSpeed || 0);
            netOut = (server.network_out || state.NetOutSpeed || 0);
        }

        // Total Transfer (Fallback)
        totalIn = server.transfer_in || state.TransferIn || 0;
        totalOut = server.transfer_out || state.TransferOut || 0;

        uptime = server.uptime || state.Uptime || 0;
    }

    const statusClass = isOnline ? 'online' : 'offline';

    // 2. Formatting & Mapping
    // Map Chinese/English country names to Flags
    const flags = {
        'JP': '🇯🇵', 'US': '🇺🇸', 'HK': '🇭🇰', 'CN': '🇨🇳', 'SG': '🇸🇬', 'KR': '🇰🇷', 'DE': '🇩🇪', 'UK': '🇬🇧',
        '日本': '🇯🇵', '美国': '🇺🇸', '香港': '🇭🇰', '中国': '🇨🇳', '新加坡': '🇸🇬', '韩国': '🇰🇷', '德国': '🇩🇪', '英国': '🇬🇧',
        '台湾': '🇹🇼', 'TW': '🇹🇼'
    };

    // Attempt to find country code in Name or Type
    let flag = '🏳️';
    const searchString = (name + " " + type).toUpperCase();
    for (const [key, value] of Object.entries(flags)) {
        if (searchString.includes(key.toUpperCase())) {
            flag = value;
            break;
        }
    }

    // Parse Expiration Date from Description (stored in 'type')
    // Format: "2026-10-03到期" or similar
    let daysRemaining = '∞';

    const dateMatch = type.match(/(\d{4}-\d{2}-\d{2})/);
    if (dateMatch) {
        const targetDate = new Date(dateMatch[1]);
        const now = new Date();
        const diffTime = targetDate - now;
        const diffDays = Math.ceil(diffTime / (1000 * 60 * 60 * 24));
        daysRemaining = diffDays > 0 ? diffDays + '天' : '已过期';
    }

    return `
        <div class="server-card ${statusClass}-card">
            <div class="card-header">
                <div class="server-info-left">
                    <span class="flag-icon">${flag}</span>
                    <div>
                        <h3 class="server-name">${name}</h3>
                    </div>
                </div>
                <div class="status-dot ${statusClass}"></div>
            </div>
            
            <!-- Gauges Row -->
            <div class="gauges-row">
                ${createGauge(cpu, '敏感度', 'var(--ghost-accent)')}
                ${createGauge(ram, '扩张度', '#2196F3')}
                ${createGauge(hdd, '填充度', '#ff9800')}
            </div>
            
            <div class="net-stats">
                <div class="net-item">
                    <span>喷水</span>
                    <span class="traffic-badge">↑ ${formatBytes(netOut)}/s</span>
                </div>
                <div class="net-item" style="text-align: right;">
                    <span class="traffic-badge">↓ ${formatBytes(netIn)}/s</span>
                    <span>射入</span>
                </div>
            </div>
            <!-- Total Transfer Row (New) -->
            <div class="net-stats" style="border:none; padding-top:2px; margin-top:0;">
                <div class="net-item">
                    <span>总喷水</span>
                    <span class="traffic-badge">${formatBytes(totalOut)}</span>
                </div>
                <div class="net-item" style="text-align: right;">
                    <span class="traffic-badge">${formatBytes(totalIn)}</span>
                    <span>总射入</span>
                </div>
            </div>

            <div class="net-stats" style="border:none; padding-top:5px; margin-top:5px; border-top: 1px dashed rgba(102, 255, 179, 0.1);">
                <div class="net-item" style="opacity: 0.7; font-size: 0.6rem;">
                     <span>高潮倒计时: ${daysRemaining}</span>
                </div>
                <div class="net-item" style="text-align: right;">
                    连续调教: ${formatUptime(uptime)}
                </div>
            </div>
        </div>
    `;
}

/* ========== Helpers ========== */
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

/* ========== Particle System (Original from Archive) ========== */
function initParticles() {
    // Ensure container exists
    let container = document.getElementById('particles');
    if (!container) {
        container = document.createElement('div');
        container.id = 'particles';
        document.body.prepend(container); // Put it behind everything (z-index 0 in CSS)
    }

    const gradients = [
        'radial-gradient(circle, #66ffb3 0%, #44cc88 70%, transparent 100%)',
        'radial-gradient(circle, #55cc99 0%, #339966 70%, transparent 100%)',
        'radial-gradient(circle, #44aa80 0%, #227744 70%, transparent 100%)'
    ];
    const minSize = 4, maxSize = 8;
    const minDuration = 8, maxDuration = 15;

    // Lower frequency for mobile devices
    const isMobile = window.innerWidth <= 768;
    const spawnInterval = isMobile ? 450 : 50; // Increased frequency for desktop

    function createParticle() {
        const particle = document.createElement('div');
        particle.className = 'particle';
        const size = Math.random() * (maxSize - minSize) + minSize;
        const duration = Math.random() * (maxDuration - minDuration) + minDuration;
        const dx = (Math.random() - 0.5) * 2;
        const delay = Math.random() * 2;

        particle.style.width = `${size}px`;
        particle.style.width = `${size}px`;
        particle.style.height = `${size}px`;
        particle.style.left = `${Math.random() * 100}%`;
        particle.style.bottom = `-20px`; // Start slightly below screen
        // Set custom property for X-axis drift
        particle.style.setProperty('--dx', dx);
        particle.style.background = gradients[Math.floor(Math.random() * gradients.length)];
        particle.style.animation = `float ${duration}s linear ${delay}s forwards`;

        container.appendChild(particle);

        // Auto-remove when animation ends
        particle.addEventListener('animationend', () => particle.remove());
    }

    // Start particle generation
    setInterval(createParticle, spawnInterval);
    // Create initial batch
    for (let i = 0; i < 10; i++) createParticle();
}

function updateClock() {
    const clock = document.getElementById('clock');
    if (!clock) return;
    const now = new Date();
    clock.innerText = now.toLocaleTimeString('en-GB'); // 24-hour format
}


// Helper to calculate display metrics (including noise) for sync
function calculateDisplayMetrics() {
    cachedServerData.forEach(server => {
        const state = server.status || {};

        // Network Noise: 10 - 1000 B/s
        const noiseIn = Math.floor(Math.random() * 991) + 10;
        const noiseOut = Math.floor(Math.random() * 991) + 10;

        // Calculate and store on server object for consistency between Card and Header
        server._displayNetworkIn = (server.network_in || state.NetInSpeed || 0) + noiseIn;
        server._displayNetworkOut = (server.network_out || state.NetOutSpeed || 0) + noiseOut;
    });
}


// initialize
initDataFetcher();
initParticles();
