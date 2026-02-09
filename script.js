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

// State Variables
let isListView = false;
let isLightMode = localStorage.getItem('theme') === 'light';
let isPaused = false;

// Mock Data for Testing
const MOCK_SERVERS = [
    { Name: 'Unknown', Tag: 'CN', online: false },
    { Name: 'Test-Server-1', Tag: 'HK', online: true, cpu: 45, memory_used: 1024, memory_total: 2048, hdd_used: 20, hdd_total: 100 },
];

/* ========== Initialization ========== */
document.addEventListener('DOMContentLoaded', () => {
    // Apply Theme Immediately
    if (isLightMode) {
        document.body.classList.add('light-theme');
    }

    // Init Buttons
    initControlButtons();
});

function initControlButtons() {
    // 1. Grid/List Toggle
    const btnGrid = document.getElementById('btn-grid');
    if (btnGrid) {
        btnGrid.addEventListener('click', () => {
            isListView = !isListView;
            const grid = document.getElementById('server-grid');
            if (grid) {
                if (isListView) grid.classList.add('list-view');
                else grid.classList.remove('list-view');
            }
            // Re-render immediately to switch layouts
            renderServers(cachedServerData);
        });
    }

    // 2. Theme Toggle
    const btnTheme = document.getElementById('btn-theme');
    if (btnTheme) {
        btnTheme.addEventListener('click', () => {
            isLightMode = !isLightMode;
            if (isLightMode) {
                document.body.classList.add('light-theme');
                localStorage.setItem('theme', 'light');
            } else {
                document.body.classList.remove('light-theme');
                localStorage.setItem('theme', 'dark');
            }
        });
    }

    // 3. User Login (Handled by <a> tag in HTML)

    // 4. Pause/Resume
    const btnPlay = document.getElementById('btn-play');
    const iconPlay = document.getElementById('icon-play');
    if (btnPlay) {
        btnPlay.addEventListener('click', () => {
            isPaused = !isPaused;
            btnPlay.title = isPaused ? "点击开始刷新" : "点击暂停刷新";

            // Update Icon
            if (isPaused) {
                // Show "Play" icon (Triangle) indicating click to resume
                iconPlay.innerHTML = '<polygon points="5 3 19 12 5 21 5 3"></polygon>';
            } else {
                // Show "Pause" icon (Two bars)
                iconPlay.innerHTML = '<rect x="6" y="4" width="4" height="16"></rect><rect x="14" y="4" width="4" height="16"></rect>';
            }
        });
    }
}

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
            if (!isPaused) {
                fetchData();
                fetchSitesData();
            }
        }, REFRESH_INTERVAL);

        // UI Refresh Interval (Fast - 2s) for Random Noise updating
        // This keeps the noise changing even if API data is static
        setInterval(() => {
            if (cachedServerData.length > 0 && !isPaused) {
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

        // 2. Online Count (Must have metrics to be truly online)
        const onlineServersArr = cachedServerData.filter(s => !s.error && s.metrics);
        const onlineServers = onlineServersArr.length;
        const onlineSitesArr = cachedSiteData.filter(site => isSiteUp(site));
        const onlineSites = onlineSitesArr.length;

        const totalOnline = onlineServers + onlineSites;
        const elOnline = document.getElementById('stat-online');
        if (elOnline) elOnline.innerText = totalOnline;

        // 3. Offline Count (Error OR No Metrics)
        const offlineServersArr = cachedServerData.filter(s => !!s.error || !s.metrics);
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

    // Ensure grid has correct class
    if (isListView) grid.classList.add('list-view');
    else grid.classList.remove('list-view');

    const servers = Array.isArray(data) ? data : Object.values(data);
    if (servers.length === 0) {
        grid.innerHTML = '<div style="grid-column: 1/-1; text-align: center;">没有发现在线的肉壶。</div>';
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

    try {
        const html = sites.map((site, index) => {
            const isUp = isSiteUp(site);
            const latency = site.last_response_time_ms || 0;
            // [FIX] 24h Record Bar - Real Data Binding
            // 1. Get History (Handle numbers or objects)
            let rawHistory = site.history || [];

            // 2. Normalize to array of status/latency (0 = down, >0 = up)
            const historyData = rawHistory.map(h => {
                if (typeof h === 'number') return h;

                // [FIX] Priority Check: Status String or Status Code
                if (h.status && h.status !== 'Unknown') {
                    const s = String(h.status).toUpperCase();
                    if (s === 'DOWN' || s === 'FALSE' || s === '0') return 0; // Explicitly Down
                    return h.response_time_ms || 1; // Up
                }
                if (h.status_code) {
                    return (h.status_code >= 200 && h.status_code < 300) ? (h.response_time_ms || 1) : 0;
                }
                return h.response_time_ms || 0;
            });

            // 3. Fill to 24 blocks (assuming 24h history)
            // If API returns e.g. 60 points, we map them to 24 blocks
            const totalBlocks = 24; // Visual blocks
            // Simple strategy: take last N items or sub-sample
            let blocks = [];
            if (historyData.length === 0) {
                blocks = Array(totalBlocks).fill(null); // No data
            } else {
                // Take last 'totalBlocks' data points
                const relevantData = historyData.slice(-totalBlocks);
                // Pad start if not enough data
                const padding = Array(Math.max(0, totalBlocks - relevantData.length)).fill(null);
                blocks = [...padding, ...relevantData];
            }

            // 4. Generate HTML for blocks
            const historyHtml = blocks.map(val => {
                let className = 'history-nodata'; // Default gray
                if (val !== null) {
                    className = (val > 0) ? 'active-ok' : 'active-down';
                }
                // Tooltip content
                const tooltip = val === null ? '无数据' : (val > 0 ? `正常 (${val}ms)` : '故障');
                return `<div class="history-segment ${className}" title="${tooltip}"></div>`;
            }).join('');


            // Format current time for "射精时间" (Last Check)
            const now = new Date();
            const timeStr = now.toTimeString().split(' ')[0]; // HH:MM:SS

            return `
            <div class="site-card">
                 <div class="site-header" style="border-bottom: 1px solid rgba(102, 255, 179, 0.1); padding-bottom: 8px; margin-bottom: 8px;">
                     <div class="site-name" style="font-size: 1.1rem;">${site.name}</div>
                     <span class="status-dot ${isUp ? 'online' : 'offline'}"></span>
                 </div>
                 
                 <div class="site-stats-row" style="display: flex; justify-content: space-between; text-align: center; margin-bottom: 12px; font-size: 0.85rem;">
                    <div class="site-stat-item">
                        <span class="site-stat-label" style="display:block; color:rgba(255,255,255,0.6); margin-bottom:4px;">射入量</span>
                        <div style="font-weight:bold; color:#fff;">${site.last_status_code || 200}mL</div>
                    </div>
                     <div class="site-stat-item">
                        <span class="site-stat-label" style="display:block; color:rgba(255,255,255,0.6); margin-bottom:4px;">距离高潮</span>
                         <div style="font-weight:bold; color:#fff;">${latency} ms</div>
                    </div>
                    <div class="site-stat-item">
                        <span class="site-stat-label" style="display:block; color:rgba(255,255,255,0.6); margin-bottom:4px;">射精时间</span>
                         <div style="font-weight:bold; color:#fff;">${timeStr}</div>
                    </div>
                 </div>

                 <div style="font-size: 0.8rem; color: rgba(255,255,255,0.6); margin-bottom: 5px;">24h高潮记录</div>
                 <!-- 24h Record Bar -->
                 <div class="site-history">
                    ${historyHtml}
                 </div>
            </div>
        `;
        }).join('');

        if (grid) grid.innerHTML = html;

    } catch (e) {
        console.error("Render Sites Failed:", e);
        if (grid) grid.innerHTML = `<div style="color:red; padsding:20px;">Render Error: ${e.message}</div>`;
    }
}


// [FIX] Helper to safely get nested values
function getMetric(server, ...keys) {
    let val = server;
    for (const key of keys) {
        if (!val) return 0;
        val = val[key];
    }
    return val;
}

function createGauge(value, label, color) {
    const radius = 20;
    const circumference = 2 * Math.PI * radius;
    const offset = circumference - (value / 100) * circumference;

    return `
        <div class="gauge-item">
            <div class="gauge-chart">
                <svg class="gauge-svg" viewBox="0 0 50 50">
                    <circle class="gauge-bg" cx="25" cy="25" r="${radius}" stroke-width="4"></circle>
                    <circle class="gauge-progress" cx="25" cy="25" r="${radius}" stroke-width="4"
                        stroke="${color}" stroke-dasharray="${circumference}" stroke-dashoffset="${offset}"></circle>
                </svg>
                <div class="gauge-value" style="transform: translate(-50%, -50%);">${Math.round(value)}%</div>
            </div>
            <div class="gauge-label">${label}</div>
        </div>
    `;
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


function createServerCard(server) {
    // 1. Basic Info
    // [FIX] Handle nested 'server' object from API
    const basicInfo = server.server || server;
    const name = basicInfo.Name || basicInfo.name || '未知';
    const tag = basicInfo.Tag || basicInfo.tag || '';

    // Flag Logic (Approximate mapping)
    let flag = "🏳️"; // Default
    const upperTag = tag.toUpperCase();
    if (upperTag.includes('HK')) flag = "🇭🇰";
    else if (upperTag.includes('CN') || upperTag.includes('ZH')) flag = "🇨🇳";
    else if (upperTag.includes('US')) flag = "🇺🇸";
    else if (upperTag.includes('SG')) flag = "🇸🇬";
    else if (upperTag.includes('JP')) flag = "🇯🇵";
    else if (upperTag.includes('KR')) flag = "🇰🇷";

    // Name-based flag fallback
    const upperName = name.toUpperCase();
    if (flag === "🏳️") {
        if (upperName.includes('香港') || upperName.includes('HK')) flag = "🇭🇰";
        else if (upperName.includes('中国') || upperName.includes('CN') || upperName.includes('浙江') || upperName.includes('上海') || upperName.includes('北京')) flag = "🇨🇳";
        else if (upperName.includes('美国') || upperName.includes('US')) flag = "🇺🇸";
        else if (upperName.includes('德国') || upperName.includes('DE')) flag = "🇩🇪";
        else if (upperName.includes('新加坡') || upperName.includes('SG')) flag = "🇸🇬";
    }


    // 2. Metrics (Normalize)
    let cpu = 0, ram = 0, hdd = 0;
    let netIn = 0, netOut = 0;
    let totalIn = 0, totalOut = 0;
    let uptime = 0;

    // Use display metrics if calculated (with noise)
    if (server._displayNetworkIn !== undefined) {
        netIn = server._displayNetworkIn;
        netOut = server._displayNetworkOut;
    }

    if (server.metrics) {
        // [CASE 1] Metrics Object (Nested)
        // Check if values are objects or numbers
        const m = server.metrics;

        cpu = (typeof m.cpu === 'object') ? (Number(m.cpu.usage_percent) || 0) : (Number(m.cpu) || 0);
        ram = (typeof m.memory === 'object') ? (Number(m.memory.usage_percent) || 0) : (Number(m.memory) || 0);
        hdd = (typeof m.disk === 'object') ? (Number(m.disk.usage_percent) || 0) : (Number(m.disk) || 0);

        // Totals
        if (m.network) {
            totalIn = Number(m.network.total_download) || Number(m.network.total_in) || 0;
            totalOut = Number(m.network.total_upload) || Number(m.network.total_out) || 0;
        }

        // Uptime
        uptime = Number(m.uptime) || 0;

    } else if (server.State) {
        // [CASE 2] Old/Direct Format
        cpu = Number(server.State.CPU) || 0;
        ram = Number(server.State.Mem_used_percent) || 0;
        hdd = Number(server.State.Disk_used_percent) || 0;

        uptime = Number(server.State.Uptime) || 0;
        totalIn = Number(server.State.NetInTransfer) || 0;
        totalOut = Number(server.State.NetOutTransfer) || 0;

    }

    // 3. Status Logic
    // [FIX] Robust timestamp check
    let lastActive = 0;
    if (server.metrics && server.metrics.timestamp) lastActive = server.metrics.timestamp;
    else if (server.LastActive) lastActive = server.LastActive;

    // Auto-detect offline if data is stale (> 5 minutes)
    const nowSec = Math.floor(Date.now() / 1000);
    const isStale = (lastActive > 0) && ((nowSec - lastActive) > 300);

    const isOnline = !server.error && !isStale;

    // [FIX] Three-state logic: Online, Unknown (No Data), Offline (Error/Timeout)
    let statusClass = 'offline';

    if (server.metrics === null || server.metrics === undefined) {
        statusClass = 'unknown'; // Explicitly No Data -> Gray
    } else if (isOnline) {
        statusClass = 'online'; // Valid Data -> Green
    } else {
        statusClass = 'offline'; // Error or Stale -> Red
    }

    // Expiry Date Logic (from previous request: "高潮倒计时")
    let daysRemaining = '---';
    // Try description first, then name
    const desc = basicInfo.description || name;
    const dateMatch = desc.match(/(\d{4}-\d{1,2}-\d{1,2})/);
    if (dateMatch) {
        const targetDate = new Date(dateMatch[1]);
        const now = new Date();
        const diffTime = targetDate - now;
        daysRemaining = (Math.ceil(diffTime / (1000 * 60 * 60 * 24)) > 0) ? Math.ceil(diffTime / (1000 * 60 * 60 * 24)) + '天' : '已过期';
    }

    const lastActiveStr = lastActive > 0 ? new Date(lastActive * 1000).toLocaleTimeString() : '从未';

    // [FEATURE] Return different HTML for Detail List View
    if (isListView) {
        return `
        <div class="server-card ${statusClass}-card" title="最后更新: ${lastActiveStr}">
            <div class="card-header">
                <div class="server-info-left"><span class="flag-icon">${flag}</span><div><h3 class="server-name">${name}</h3></div></div>
                <div class="status-dot ${statusClass}"></div>
            </div>
            
            <div class="list-details">
                <div class="list-item">
                    <span class="list-value">${Math.round(cpu)}%</span>
                    <span class="list-label">敏感度</span>
                </div>
                <div class="list-item">
                    <span class="list-value">${Math.round(ram)}%</span>
                    <span class="list-label">扩张度</span>
                </div>
                <div class="list-item">
                    <span class="list-value">${Math.round(hdd)}%</span>
                    <span class="list-label">填充度</span>
                </div>
                <div class="list-item">
                    <span class="list-value" style="color:#2196F3">↓${formatBytes(netIn)}/s</span>
                    <span class="list-label">射入</span>
                </div>
                <div class="list-item">
                    <span class="list-value" style="color:#66ffb3">↑${formatBytes(netOut)}/s</span>
                    <span class="list-label">喷水</span>
                </div>
                 <div class="list-item">
                    <span class="list-value">${formatBytes(totalOut)}</span>
                    <span class="list-label">总喷水</span>
                </div>
                <div class="list-item">
                    <span class="list-value">${formatUptime(uptime)}</span>
                    <span class="list-label">连续调教</span>
                </div>
                 <div class="list-item">
                    <span class="list-value" style="color: ${daysRemaining === '已过期' ? 'red' : 'inherit'}">${daysRemaining}</span>
                    <span class="list-label">倒计时</span>
                </div>
            </div>
        </div>
        `;
    }

    // Default Grid View
    return `
        <div class="server-card ${statusClass}-card" title="最后更新: ${lastActiveStr}">
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
    if (!seconds) return '0秒';
    const d = Math.floor(seconds / (3600 * 24));
    const h = Math.floor(seconds % (3600 * 24) / 3600);
    const m = Math.floor(seconds % 3600 / 60);
    if (d > 0) return `${d}天 ${h}小时`;
    if (h > 0) return `${h}小时 ${m}分`;
    return `${m}分`;
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

            // Only add noise if we actually have metrics (Online)
            const noiseIn = Math.floor(Math.random() * 991) + 10;
            const noiseOut = Math.floor(Math.random() * 991) + 10;
            server._displayNetworkIn = netIn + noiseIn;
            server._displayNetworkOut = netOut + noiseOut;
        } else {
            const state = server.State || server.status || {};

            // No metrics -> Force 0 (No noise for Unknown/Offline)
            server._displayNetworkIn = 0;
            server._displayNetworkOut = 0;
        }
    });
}

// initialize
initDataFetcher();
initParticles();
