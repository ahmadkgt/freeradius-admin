// WhatsApp gateway for the FreeRADIUS admin panel.
//
// A tiny REST shim around Baileys that exposes:
//   GET  /status          → { connected, qr, jid, last_error, ... }
//   GET  /qr.png          → fresh QR code as a PNG (404 if already paired)
//   POST /send            → { to, text } send a text message
//   POST /disconnect      → log out and wipe auth state (forces re-pairing)
//
// Auth state is persisted on /app/auth (volume) so the pairing survives
// container restarts. The service is reachable only on the internal docker
// network — never exposed publicly — and authenticated via a shared bearer
// token in the X-API-Key header.

import { mkdirSync } from 'node:fs';
import { rm } from 'node:fs/promises';

import express from 'express';
import pino from 'pino';
import qrcode from 'qrcode';
import {
  default as makeWASocket,
  Browsers,
  DisconnectReason,
  useMultiFileAuthState,
  fetchLatestBaileysVersion,
} from '@whiskeysockets/baileys';

const PORT = parseInt(process.env.PORT || '3001', 10);
const AUTH_DIR = process.env.AUTH_DIR || '/app/auth';
const API_KEY = process.env.WHATSAPP_API_KEY || '';

if (!API_KEY) {
  // Fail loudly. This service has full access to the user's WhatsApp,
  // so an unauthenticated REST surface would be a serious vulnerability.
  console.error('FATAL: WHATSAPP_API_KEY env var is required');
  process.exit(1);
}

mkdirSync(AUTH_DIR, { recursive: true });

const log = pino({
  level: process.env.LOG_LEVEL || 'info',
  transport: process.env.NODE_ENV === 'production' ? undefined : { target: 'pino-pretty' },
});

// --- runtime state -------------------------------------------------------

let sock = null;
/** @type {string|null} */
let lastQr = null;
/** @type {string|null} */
let lastError = null;
let connected = false;
/** @type {string|null} */
let jid = null;
let connectingSince = null;

// --- baileys lifecycle ---------------------------------------------------

async function startSocket() {
  const { state, saveCreds } = await useMultiFileAuthState(AUTH_DIR);
  const { version } = await fetchLatestBaileysVersion();
  log.info({ version }, 'starting baileys socket');

  sock = makeWASocket({
    version,
    auth: state,
    printQRInTerminal: false,
    browser: Browsers.appropriate('FreeRADIUS Admin'),
    logger: log.child({ component: 'baileys' }),
    syncFullHistory: false,
    markOnlineOnConnect: false,
  });

  connectingSince = new Date().toISOString();

  sock.ev.on('creds.update', saveCreds);
  sock.ev.on('connection.update', async (update) => {
    const { connection, qr, lastDisconnect } = update;
    if (qr) {
      lastQr = qr;
      log.info('new QR code available');
    }
    if (connection === 'open') {
      connected = true;
      jid = sock.user?.id || null;
      lastQr = null;
      lastError = null;
      log.info({ jid }, 'connected');
    }
    if (connection === 'close') {
      connected = false;
      const code = lastDisconnect?.error?.output?.statusCode;
      lastError = lastDisconnect?.error?.message || `disconnected (code=${code})`;
      log.warn({ code, err: lastError }, 'connection closed');
      const shouldReconnect = code !== DisconnectReason.loggedOut;
      if (shouldReconnect) {
        // small backoff so we don't tight-loop on a hard error
        setTimeout(() => startSocket().catch((e) => log.error(e)), 3000);
      } else {
        log.warn('logged out; auth state will be wiped on next /disconnect');
      }
    }
  });
}

// --- HTTP server ---------------------------------------------------------

const app = express();
app.use(express.json({ limit: '256kb' }));

app.use((req, res, next) => {
  if (req.path === '/health') return next();
  const provided = req.header('x-api-key');
  if (provided !== API_KEY) {
    return res.status(401).json({ error: 'unauthorized' });
  }
  next();
});

app.get('/health', (_req, res) => {
  res.json({ ok: true });
});

app.get('/status', (_req, res) => {
  res.json({
    connected,
    jid,
    has_qr: lastQr !== null,
    last_error: lastError,
    connecting_since: connectingSince,
  });
});

app.get('/qr.png', async (_req, res) => {
  if (!lastQr) {
    return res.status(404).json({ error: 'no QR available — already paired or socket not started' });
  }
  try {
    const png = await qrcode.toBuffer(lastQr, { type: 'png', width: 360, margin: 2 });
    res.setHeader('Content-Type', 'image/png');
    res.setHeader('Cache-Control', 'no-store');
    res.send(png);
  } catch (err) {
    log.error(err);
    res.status(500).json({ error: 'qr render failed' });
  }
});

app.post('/send', async (req, res) => {
  if (!connected || !sock) {
    return res.status(503).json({ error: 'WhatsApp not connected' });
  }
  const { to, text } = req.body || {};
  if (!to || !text) {
    return res.status(400).json({ error: 'fields "to" and "text" are required' });
  }
  // Accept "+963999999999" / "00963999999999" / "963999999999" — Baileys
  // wants only digits + the @s.whatsapp.net suffix.
  const digits = String(to).replace(/[^\d]/g, '').replace(/^00/, '');
  if (!digits) {
    return res.status(400).json({ error: 'invalid phone number' });
  }
  const target = `${digits}@s.whatsapp.net`;
  try {
    const result = await sock.sendMessage(target, { text: String(text) });
    res.json({
      ok: true,
      to: digits,
      message_id: result?.key?.id || null,
    });
  } catch (err) {
    log.error({ err: err.message, to: digits }, 'send failed');
    res.status(502).json({ error: err.message || 'send failed' });
  }
});

app.post('/disconnect', async (_req, res) => {
  try {
    if (sock) {
      try { await sock.logout(); } catch { /* logout often races; ignore */ }
      sock = null;
    }
    await rm(AUTH_DIR, { recursive: true, force: true });
    mkdirSync(AUTH_DIR, { recursive: true });
    connected = false;
    jid = null;
    lastQr = null;
    lastError = null;
    setTimeout(() => startSocket().catch((e) => log.error(e)), 500);
    res.json({ ok: true });
  } catch (err) {
    log.error(err);
    res.status(500).json({ error: err.message });
  }
});

app.listen(PORT, () => {
  log.info({ port: PORT, auth_dir: AUTH_DIR }, 'whatsapp gateway listening');
});

startSocket().catch((err) => {
  log.error(err, 'failed to start socket on boot');
  // keep the HTTP server up so /status can report the error
});
