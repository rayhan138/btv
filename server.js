const express = require('express');
const path = require('path');

const app = express();
const PORT = process.env.PORT || 3000;

// ── Serve frontend ──────────────────────────────────────────────
app.use(express.static(path.join(__dirname, 'public')));

// ── Channel IDs ─────────────────────────────────────────────────
const CHANNELS = {
    'btv':             '355ba051-9a60-48aa-adcf-5a6c64da8c5c',
    'btv-news':        'd96eb7f4-83c2-4472-9597-3568390a8ebf',
    'btv-chattogram':  'a707f2dc-9704-413a-a67c-17c64a77c350',
    'sangsad-tv':      '9ee3b4f9-fd0a-47c5-a135-2575c5691613'
};

const BTV_BASE   = 'https://www.btvlive.gov.bd';
const STREAM_BASE = 'https://streams.btvlive.gov.bd';

// ── Common headers to mimic browser ─────────────────────────────
const BROWSER_HEADERS = {
    'Referer':    `${BTV_BASE}/`,
    'Origin':     BTV_BASE,
    'User-Agent': 'Mozilla/5.0 (Linux; Android 13; Pixel 7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Mobile Safari/537.36'
};

// ── Token cache ─────────────────────────────────────────────────
let cachedToken = null;
let tokenExpiry  = 0;

async function getCfToken() {
    const now = Date.now();
    if (cachedToken && now < tokenExpiry) return cachedToken;

    console.log('[BTV] Fetching fresh CloudFront token...');
    const res = await fetch(`${BTV_BASE}/api/cfToken`, {
        headers: BROWSER_HEADERS
    });

    if (!res.ok) throw new Error(`cfToken HTTP ${res.status}`);

    const data = await res.json();
    cachedToken = data;
    tokenExpiry = now + 4 * 60 * 1000; // cache 4 min

    console.log('[BTV] Token keys:', Object.keys(data));
    return data;
}

// ── Build signed stream URL ─────────────────────────────────────
// cfToken response format:
//   { resStatus, status, output: "Policy=...&Signature=...&Key-Pair-Id=...",
//     country: "BD", userId: "uuid-here" }
// Full URL: https://streams.btvlive.gov.bd/live/{userId}/{country}/{channelId}/index.m3u8?{output}
function buildStreamUrl(tokenData, channelId) {
    const userId  = tokenData.userId;
    const country = 'BD'; // Force BD to avoid geo-blocks
    const signed  = tokenData.output;   // "Policy=...&Signature=...&Key-Pair-Id=..."

    const baseUrl = `${STREAM_BASE}/live/${userId}/${country}/${channelId}/index.m3u8`;

    if (signed) {
        return baseUrl + '?' + signed;
    }
    return baseUrl;
}

// ── API: Debug token endpoint ───────────────────────────────────
app.get('/api/token', async (req, res) => {
    try {
        // Force fresh fetch for debug
        cachedToken = null;
        tokenExpiry = 0;
        const token = await getCfToken();
        res.json(token);
    } catch (err) {
        res.status(500).json({ error: err.message });
    }
});

// ── API: Get stream info ────────────────────────────────────────
app.get('/api/stream/:channel', async (req, res) => {
    try {
        const channelId = CHANNELS[req.params.channel];
        if (!channelId) {
            return res.status(404).json({ error: 'Unknown channel', available: Object.keys(CHANNELS) });
        }

        const token     = await getCfToken();
        const streamUrl = buildStreamUrl(token, channelId);
        const proxyUrl  = `/api/hls/manifest?url=${encodeURIComponent(streamUrl)}`;

        res.json({ channel: req.params.channel, proxyUrl, directUrl: streamUrl });
    } catch (err) {
        console.error('[BTV] Stream error:', err.message);
        res.status(500).json({ error: err.message });
    }
});

// ── HLS Proxy: Manifest (.m3u8) ────────────────────────────────
app.get('/api/hls/manifest', async (req, res) => {
    try {
        const { url } = req.query;
        if (!url) return res.status(400).send('Missing url');

        const response = await fetch(url, { headers: BROWSER_HEADERS });
        if (!response.ok) {
            const errText = await response.text();
            console.error(`[HLS] Manifest proxy error: HTTP ${response.status} - ${errText}`);
            throw new Error(`Manifest HTTP ${response.status}`);
        }

        let content = await response.text();

        // Base path for resolving relative URLs
        const urlObj   = new URL(url);
        const basePath = url.substring(0, url.lastIndexOf('/') + 1);
        const qs       = urlObj.search; // signed query string

        // Rewrite non-comment lines (URLs) to proxy through us
        content = content.replace(/^(?!#)(\S+)$/gm, (match, p) => {
            p = p.trim();
            if (!p) return match;

            // Make absolute
            let abs = p.startsWith('http') ? p : basePath + p;

            // Carry signed params to sub-resources
            if (qs && !abs.includes('Policy=') && !abs.includes('token=')) {
                abs += (abs.includes('?') ? '&' : '?') + qs.slice(1);
            }

            // Route through proxy
            if (p.endsWith('.m3u8') || p.includes('.m3u8?')) {
                return `/api/hls/manifest?url=${encodeURIComponent(abs)}`;
            }
            return `/api/hls/segment?url=${encodeURIComponent(abs)}`;
        });

        res.set({
            'Content-Type': 'application/vnd.apple.mpegurl',
            'Access-Control-Allow-Origin': '*',
            'Cache-Control': 'no-cache'
        });
        res.send(content);
    } catch (err) {
        console.error('[HLS] Manifest proxy error:', err.message);
        res.status(502).send('Manifest proxy error');
    }
});

// ── HLS Proxy: Segments (.ts / .aac / .key) ────────────────────
app.get('/api/hls/segment', async (req, res) => {
    try {
        const { url } = req.query;
        if (!url) return res.status(400).send('Missing url');

        const response = await fetch(url, { headers: BROWSER_HEADERS });
        if (!response.ok) throw new Error(`Segment HTTP ${response.status}`);

        const contentType = response.headers.get('content-type') || 'video/mp2t';
        const buffer = Buffer.from(await response.arrayBuffer());

        res.set({
            'Content-Type': contentType,
            'Access-Control-Allow-Origin': '*',
            'Cache-Control': 'no-cache'
        });
        res.send(buffer);
    } catch (err) {
        console.error('[HLS] Segment proxy error:', err.message);
        res.status(502).send('Segment proxy error');
    }
});

// ── Start ───────────────────────────────────────────────────────
app.listen(PORT, () => {
    console.log(`\n  ╔══════════════════════════════════════╗`);
    console.log(`  ║   🇧🇩  BTV HD Live — Running!         ║`);
    console.log(`  ║   http://localhost:${PORT}              ║`);
    console.log(`  ╚══════════════════════════════════════╝\n`);
});
