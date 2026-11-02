// =====================================================================
// 🔔 Avisos push al ADMIN (las notificaciones del navegador / de Google)
// =====================================================================
// - Web Push estándar con VAPID (RFC 8292), hecho solo con `crypto` y `fetch`
//   de Node: no hace falta ninguna dependencia nueva.
// - Los avisos se mandan SIN contenido (push "vacío"): el service worker (sw.js)
//   pide después /api/tidal/ultima para saber qué canción ha sido y quién la puso.
//   Así no hace falta cifrar nada y no viaja información por los servidores de Google.
// - Solo se pueden registrar dispositivos pasando por el login de admin.
// - Las suscripciones se guardan en data/push_admin.json (+ copia en Cloudinary,
//   porque en Render el disco se borra al redesplegar).
//
// Variables de entorno (Render):
//   VAPID_PUBLIC_KEY, VAPID_PRIVATE_KEY   → se generan con:  node generar-vapid.js
//   VAPID_SUBJECT  (opcional)             → mailto:tucorreo@gmail.com  (o https://tu-dominio)
//
// Segunda vía, sin depender de Chrome ni de Google: ntfy (app gratuita, https://ntfy.sh)
//   NTFY_TOPIC   nombre secreto del canal (8-64 letras/números/_/-), p. ej. tkt-playlist-x7k2q9w4
//   NTFY_URL     (opcional) servidor de ntfy; por defecto https://ntfy.sh
//   PUBLIC_URL   (opcional) https://tu-dominio, para que al tocar el aviso se abra la playlist
// =====================================================================

import fs from 'fs';
import path from 'path';
import crypto from 'crypto';

const CLOUD_ID = 'traketeros_data/push_admin';
const MAX_SUBS = 10;                       // dispositivos de admin como máximo
const PUSH_HOSTS = [                       // solo se acepta mandar avisos a servicios push conocidos
  /(^|\.)googleapis\.com$/,                // Chrome / Android (FCM)
  /(^|\.)push\.apple\.com$/,               // Safari / iPhone
  /(^|\.)mozilla\.com$/, /(^|\.)mozaws\.net$/, // Firefox
  /(^|\.)notify\.windows\.com$/            // Edge
];

const b64url = (buf) => Buffer.from(buf).toString('base64url');

export function registerPush({ app, adminAuth, cloudinary, cloudinaryOk, dataDir }) {
  const PUBLIC = (process.env.VAPID_PUBLIC_KEY || '').trim();
  const PRIVATE = (process.env.VAPID_PRIVATE_KEY || '').trim();
  const SUBJECT = (process.env.VAPID_SUBJECT || process.env.PUBLIC_URL || 'mailto:trakeballer@gmail.com').trim();
  const FILE = path.join(dataDir, 'push_admin.json');
  const NTFY_TOPIC = (process.env.NTFY_TOPIC || '').trim();
  const NTFY_URL = (process.env.NTFY_URL || 'https://ntfy.sh').trim().replace(/\/+$/, '');
  const ntfyOk = /^[A-Za-z0-9_-]{8,64}$/.test(NTFY_TOPIC);
  if (NTFY_TOPIC && !ntfyOk) console.warn('NTFY: NTFY_TOPIC no es válido (8-64 caracteres: letras, números, _ y -).');

  let privateKey = null;
  let keyProblem = '';
  try {
    if (PUBLIC && PRIVATE) {
      const pub = Buffer.from(PUBLIC, 'base64url');
      if (pub.length !== 65 || pub[0] !== 4) throw new Error('VAPID_PUBLIC_KEY no es una clave P-256 válida');
      privateKey = crypto.createPrivateKey({
        format: 'jwk',
        key: { kty: 'EC', crv: 'P-256', x: b64url(pub.subarray(1, 33)), y: b64url(pub.subarray(33, 65)), d: PRIVATE }
      });
      // La privada tiene que corresponder a la pública (si se copió mal una de las dos, se avisa)
      const j = crypto.createPublicKey(privateKey).export({ format: 'jwk' });
      if (j.x !== b64url(pub.subarray(1, 33)) || j.y !== b64url(pub.subarray(33, 65))) {
        throw new Error('VAPID_PRIVATE_KEY no corresponde a VAPID_PUBLIC_KEY (cópialas las dos del mismo par)');
      }
    }
  } catch (e) {
    console.warn('PUSH: claves VAPID no válidas:', e.message || e);
    keyProblem = String(e.message || e);
    privateKey = null;
  }
  const configured = Boolean(privateKey);
  if (!configured) console.warn('PUSH: faltan VAPID_PUBLIC_KEY / VAPID_PRIVATE_KEY. Los avisos al admin están desactivados (ejecuta: node generar-vapid.js).');

  // ---------- Almacén ----------
  let subs = []; // [{ endpoint, keys:{p256dh,auth}, ts }]

  function save() {
    const text = JSON.stringify({ version: 1, subs });
    try {
      fs.mkdirSync(dataDir, { recursive: true });
      fs.writeFileSync(FILE, text, { encoding: 'utf8', mode: 0o600 });
    } catch (e) { console.error('PUSH: no se pudo guardar:', e.message || e); }
    if (cloudinaryOk) {
      cloudinary.uploader.upload(`data:application/json;base64,${Buffer.from(text).toString('base64')}`, {
        resource_type: 'raw', public_id: CLOUD_ID, overwrite: true, invalidate: true
      }).catch((e) => console.error('PUSH: no se pudo respaldar en Cloudinary:', e.message || e));
    }
  }

  const parse = (text) => {
    try {
      const j = JSON.parse(text);
      return Array.isArray(j?.subs) ? j.subs.filter((s) => s?.endpoint && s?.keys) : [];
    } catch { return []; }
  };

  const ready = (async () => {
    let local = null;
    try { local = fs.readFileSync(FILE, 'utf8'); } catch { /* aún no existe */ }
    if (local) { subs = parse(local); return; }
    if (!cloudinaryOk) return;
    try {
      const info = await cloudinary.api.resource(CLOUD_ID, { resource_type: 'raw' });
      const r = await fetch(info.secure_url, { cache: 'no-store' });
      if (r.ok) { subs = parse(await r.text()); if (subs.length) save(); }
    } catch { /* sin copia */ }
  })();

  // ---------- Envío ----------
  function vapidHeader(endpoint) {
    const aud = new URL(endpoint).origin;
    const head = b64url(JSON.stringify({ typ: 'JWT', alg: 'ES256' }));
    const body = b64url(JSON.stringify({ aud, exp: Math.floor(Date.now() / 1000) + 12 * 3600, sub: SUBJECT }));
    const sig = crypto.sign('sha256', Buffer.from(`${head}.${body}`), { key: privateKey, dsaEncoding: 'ieee-p1363' });
    return `vapid t=${head}.${body}.${b64url(sig)}, k=${PUBLIC}`;
  }

  async function enviar(sub) {
    const r = await fetch(sub.endpoint, {
      method: 'POST',
      headers: { Authorization: vapidHeader(sub.endpoint), TTL: '86400', Urgency: 'high', 'Content-Length': '0' },
      signal: AbortSignal.timeout(10_000)
    });
    return r.status;
  }

  // ntfy: el servidor publica un mensaje y la app del móvil lo recibe (no pasa por Chrome)
  async function enviarNtfy(info) {
    if (!ntfyOk) return;
    const artistas = (info?.artists || []).join(', ');
    const message = info?.title
      ? `${info.by || 'Alguien'} ha añadido «${info.title}»${artistas ? ' · ' + artistas : ''}`
      : 'Alguien ha añadido una canción a la playlist.';
    const base = (process.env.PUBLIC_URL || '').trim().replace(/\/+$/, '');
    const body = { topic: NTFY_TOPIC, title: '🎧 Nueva canción en la playlist', message, tags: ['musical_note'] };
    if (/^https:\/\//.test(base)) body.click = base + '/playlist.html?admin=1';
    try {
      const r = await fetch(NTFY_URL, {
        method: 'POST', headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(body), signal: AbortSignal.timeout(10_000)
      });
      if (!r.ok) console.warn('NTFY: respuesta', r.status);
    } catch (e) { console.warn('NTFY: fallo al avisar:', e.message || e); }
  }

  // Avisa a todos los dispositivos del admin (push del navegador + ntfy). Nunca lanza error.
  async function notifyAdmin(info) {
    enviarNtfy(info).catch(() => {});
    if (!configured) return;
    try {
      await ready;
      if (!subs.length) return;
      const caducadas = new Set();
      await Promise.all(subs.map(async (s) => {
        try {
          const st = await enviar(s);
          if (st === 404 || st === 410) caducadas.add(s.endpoint); // el dispositivo ya no existe / se dio de baja
          else if (st >= 400) console.warn('PUSH: el servicio de avisos respondió', st);
        } catch (e) { console.warn('PUSH: fallo al avisar:', e.message || e); }
      }));
      if (caducadas.size) { subs = subs.filter((s) => !caducadas.has(s.endpoint)); save(); }
    } catch (e) { console.warn('PUSH:', e.message || e); }
  }

  // ---------- Rutas (solo admin) ----------
  const mismoOrigen = (req, res, next) => {
    const origin = req.get('origin');
    if (origin) {
      try { if (new URL(origin).host !== req.get('host')) return res.status(403).json({ error: 'Origen no permitido.' }); }
      catch { return res.status(403).json({ error: 'Origen no permitido.' }); }
    }
    if (!req.is('application/json')) return res.status(415).json({ error: 'Formato no válido.' });
    next();
  };

  app.get('/api/admin/push/status', adminAuth, async (req, res) => {
    res.set('Cache-Control', 'no-store');
    await ready;
    res.json({ configured, publicKey: configured ? PUBLIC : null, devices: subs.length, ntfy: ntfyOk, ntfyTopic: ntfyOk ? NTFY_TOPIC : null, ntfyUrl: NTFY_URL });
  });

  app.post('/api/admin/push/subscribe', adminAuth, mismoOrigen, async (req, res) => {
    res.set('Cache-Control', 'no-store');
    if (!configured) return res.status(503).json({ error: 'Faltan las claves VAPID en el servidor.' });
    await ready;
    const s = req.body?.subscription || {};
    const endpoint = String(s.endpoint || '');
    const p256dh = String(s.keys?.p256dh || '');
    const auth = String(s.keys?.auth || '');
    let host = '';
    try { const u = new URL(endpoint); if (u.protocol === 'https:') host = u.hostname; } catch { /* inválida */ }
    if (!host || endpoint.length > 1000 || !p256dh || !auth || p256dh.length > 200 || auth.length > 100
        || !PUSH_HOSTS.some((re) => re.test(host))) {
      return res.status(400).json({ error: 'Suscripción no válida.' });
    }
    subs = subs.filter((x) => x.endpoint !== endpoint);
    subs.push({ endpoint, keys: { p256dh, auth }, ts: Date.now() });
    if (subs.length > MAX_SUBS) subs = subs.slice(-MAX_SUBS);
    save();
    res.json({ ok: true, devices: subs.length });
  });

  app.post('/api/admin/push/unsubscribe', adminAuth, mismoOrigen, async (req, res) => {
    res.set('Cache-Control', 'no-store');
    await ready;
    const endpoint = String(req.body?.endpoint || '');
    subs = subs.filter((x) => x.endpoint !== endpoint);
    save();
    res.json({ ok: true, devices: subs.length });
  });

  app.post('/api/admin/push/test', adminAuth, mismoOrigen, async (req, res) => {
    res.set('Cache-Control', 'no-store');
    if (!configured && !ntfyOk) return res.status(503).json({ error: 'No hay ni claves VAPID ni NTFY_TOPIC en el servidor.' });
    await notifyAdmin({ by: 'El servidor', title: 'Aviso de prueba', artists: ['funciona ✅'] });
    res.json({ ok: true });
  });

  return { notifyAdmin };
}
