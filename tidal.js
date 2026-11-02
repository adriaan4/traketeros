// =====================================================================
// 🎧 PLAYLIST TKT · integración REAL con TIDAL (API oficial, openapi.tidal.com/v2)
// =====================================================================
// - Autenticación oficial: OAuth 2.0 "Authorization Code + PKCE" contra
//   login.tidal.com / auth.tidal.com. La conecta UNA vez el admin (la cuenta de
//   TIDAL dueña de la playlist) desde /playlist.html?admin=1.
// - Los tokens NUNCA llegan al navegador. Se guardan cifrados (AES-256-GCM) con
//   TIDAL_TOKEN_KEY: fichero local (data/) + copia en Cloudinary (en Render el
//   disco se borra al redesplegar). Sin la clave, el contenido es ilegible.
// - Las credenciales (client id/secret, clave de cifrado) solo viven en variables
//   de entorno del servidor. No hay ninguna en el código ni en el navegador.
// - Quién añade cada canción lo guarda el servidor (data/tidal_playlist.json):
//   TIDAL no tiene "usuarios de la peña", así que se usa el nombre, igual que en
//   el Traketímetro.
// - Todo lo valida el servidor: el navegador solo manda un id de canción y un
//   nombre; el id de elemento de playlist para borrar se busca aquí.
// =====================================================================

import fs from 'fs';
import path from 'path';
import crypto from 'crypto';

const OPENAPI = 'https://openapi.tidal.com/v2';
const AUTH_URL = 'https://login.tidal.com/authorize';
const TOKEN_URL = 'https://auth.tidal.com/v1/oauth2/token';

const DEFAULT_PLAYLIST = 'c298efe8-c21d-400e-bc5b-16fe0c09625c'; // 🎧 playlist TKT (id público, no es secreto)
const TOKEN_CLOUD_ID = 'traketeros_data/tidal_tokens';
const PLAYLIST_CLOUD_ID = 'traketeros_data/tidal_playlist';

const MAX_PAGES = 30;            // 30 páginas x 20 = hasta 600 canciones
const LIST_TTL = 20_000;         // la lista de la playlist se cachea 20 s
const META_TTL = 24 * 3600_000;  // datos de una canción (título, carátula...) 24 h
const SEARCH_TTL = 5 * 60_000;
const NAME_MAX = 30;

const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
const b64url = (buf) => Buffer.from(buf).toString('base64url');

export function registerTidal({ app, adminAuth, cloudinary, cloudinaryOk, dataDir }) {
  const env = process.env;
  const CLIENT_ID = (env.TIDAL_CLIENT_ID || '').trim();
  const CLIENT_SECRET = (env.TIDAL_CLIENT_SECRET || '').trim();
  const PLAYLIST_ID = (env.TIDAL_PLAYLIST_ID || DEFAULT_PLAYLIST).trim();
  const COUNTRY = (env.TIDAL_COUNTRY || 'ES').trim().toUpperCase();
  const SCOPES = (env.TIDAL_SCOPES || 'playlists.read playlists.write').trim();
  const TOKEN_KEY = (env.TIDAL_TOKEN_KEY || '').trim();
  const configured = Boolean(CLIENT_ID);
  const canEncrypt = TOKEN_KEY.length >= 32;

  const TOKEN_FILE = path.join(dataDir, 'tidal_tokens.json');
  const PLAYLIST_FILE = path.join(dataDir, 'tidal_playlist.json');

  if (!configured) console.warn('TIDAL: falta TIDAL_CLIENT_ID. La playlist se mostrará como "no configurada".');
  else if (!canEncrypt) console.warn('TIDAL: falta TIDAL_TOKEN_KEY (mínimo 32 caracteres). No se podrá conectar la cuenta hasta ponerla.');

  // ---------------------------------------------------------------
  // Cifrado de tokens (AES-256-GCM)
  // ---------------------------------------------------------------
  const key = canEncrypt ? crypto.scryptSync(TOKEN_KEY, 'traketeros-tidal-v1', 32) : null;

  function encrypt(obj) {
    const iv = crypto.randomBytes(12);
    const c = crypto.createCipheriv('aes-256-gcm', key, iv);
    const data = Buffer.concat([c.update(JSON.stringify(obj), 'utf8'), c.final()]);
    return JSON.stringify({ v: 1, iv: b64url(iv), tag: b64url(c.getAuthTag()), data: b64url(data) });
  }

  function decrypt(text) {
    const o = JSON.parse(text);
    const d = crypto.createDecipheriv('aes-256-gcm', key, Buffer.from(o.iv, 'base64url'));
    d.setAuthTag(Buffer.from(o.tag, 'base64url'));
    const plain = Buffer.concat([d.update(Buffer.from(o.data, 'base64url')), d.final()]);
    return JSON.parse(plain.toString('utf8'));
  }

  // ---------------------------------------------------------------
  // Persistencia (local + Cloudinary)
  // ---------------------------------------------------------------
  function writeLocal(file, text) {
    try {
      fs.mkdirSync(dataDir, { recursive: true });
      const tmp = file + '.tmp';
      fs.writeFileSync(tmp, text, { encoding: 'utf8', mode: 0o600 });
      fs.renameSync(tmp, file);
    } catch (e) {
      console.error('TIDAL: no se pudo guardar', path.basename(file) + ':', e.message || e);
    }
  }

  async function uploadCloud(id, text) {
    if (!cloudinaryOk) return;
    try {
      const b64 = Buffer.from(text).toString('base64');
      await cloudinary.uploader.upload(`data:application/json;base64,${b64}`, {
        resource_type: 'raw', public_id: id, overwrite: true, invalidate: true
      });
    } catch (e) {
      console.error('TIDAL: no se pudo respaldar en Cloudinary:', e.message || e);
    }
  }

  async function downloadCloud(id) {
    if (!cloudinaryOk) return null;
    try {
      const info = await cloudinary.api.resource(id, { resource_type: 'raw' });
      const resp = await fetch(info.secure_url, { cache: 'no-store' });
      return resp.ok ? await resp.text() : null;
    } catch {
      return null;
    }
  }

  async function deleteCloud(id) {
    if (!cloudinaryOk) return;
    try { await cloudinary.uploader.destroy(id, { resource_type: 'raw', invalidate: true }); } catch { /* ya no estaba */ }
  }

  // ---------------------------------------------------------------
  // Estado: tokens y registro de "quién añadió qué"
  // ---------------------------------------------------------------
  // tokens = { access, refresh, expiresAt, scope, userId, connectedAt }
  let tokens = null;
  let lastError = null; // último fallo de TIDAL (solo para el admin)
  let needsReconnect = false;

  // added = { [trackId]: { by, ts } }
  let added = Object.create(null);

  function saveTokens() {
    if (!canEncrypt || !tokens) return;
    const text = encrypt(tokens);
    writeLocal(TOKEN_FILE, text);
    uploadCloud(TOKEN_CLOUD_ID, text);
  }

  function savePlaylist() {
    const text = JSON.stringify({ version: 1, added });
    writeLocal(PLAYLIST_FILE, text);
    uploadCloud(PLAYLIST_CLOUD_ID, text);
  }

  async function loadAll() {
    // Registro de quién añadió qué
    let raw = await downloadCloud(PLAYLIST_CLOUD_ID);
    if (!raw) { try { raw = fs.readFileSync(PLAYLIST_FILE, 'utf8'); } catch { raw = null; } }
    if (raw) {
      try {
        const o = JSON.parse(raw);
        if (o && o.added && typeof o.added === 'object') Object.assign(added, o.added);
      } catch { /* fichero estropeado: se empieza vacío */ }
    }
    // Tokens
    if (!canEncrypt) return;
    let enc = await downloadCloud(TOKEN_CLOUD_ID);
    if (!enc) { try { enc = fs.readFileSync(TOKEN_FILE, 'utf8'); } catch { enc = null; } }
    if (enc) {
      try {
        tokens = decrypt(enc);
        console.log('TIDAL: cuenta conectada (tokens cargados).');
      } catch {
        console.warn('TIDAL: no se pudieron descifrar los tokens (¿cambió TIDAL_TOKEN_KEY?). Hay que volver a conectar la cuenta.');
        needsReconnect = true;
      }
    }
  }
  const ready = loadAll().catch((e) => console.error('TIDAL: error cargando datos:', e.message || e));

  // ---------------------------------------------------------------
  // OAuth: PKCE
  // ---------------------------------------------------------------
  const pending = new Map(); // state -> { verifier, redirectUri, exp }

  function redirectUriFor(req) {
    if (env.TIDAL_REDIRECT_URI) return env.TIDAL_REDIRECT_URI.trim();
    const base = (env.PUBLIC_URL || `${req.protocol}://${req.get('host')}`).replace(/\/+$/, '');
    return base + '/api/tidal/callback';
  }

  async function tokenRequest(params, { basic = false } = {}) {
    const headers = { 'Content-Type': 'application/x-www-form-urlencoded', Accept: 'application/json' };
    if (basic) headers.Authorization = 'Basic ' + Buffer.from(`${CLIENT_ID}:${CLIENT_SECRET}`).toString('base64');
    const resp = await fetch(TOKEN_URL, {
      method: 'POST',
      headers,
      body: new URLSearchParams(params).toString(),
      signal: AbortSignal.timeout(15_000)
    });
    const body = await resp.json().catch(() => ({}));
    if (!resp.ok) {
      const err = new Error(body.error_description || body.error || `TIDAL auth ${resp.status}`);
      err.status = resp.status;
      err.code = body.error || '';
      throw err;
    }
    return body;
  }

  function adoptTokenResponse(body, prev) {
    const expiresIn = Number(body.expires_in) || 3600;
    tokens = {
      access: body.access_token,
      refresh: body.refresh_token || prev?.refresh || '',
      expiresAt: Date.now() + expiresIn * 1000,
      scope: body.scope || prev?.scope || SCOPES,
      userId: String(body.user_id ?? body.user?.userId ?? prev?.userId ?? ''),
      connectedAt: prev?.connectedAt || Date.now()
    };
    needsReconnect = false;
    saveTokens();
  }

  let refreshing = null;
  function refreshTokens() {
    if (refreshing) return refreshing; // una sola renovación a la vez
    refreshing = (async () => {
      if (!tokens?.refresh) { needsReconnect = true; throw httpErr(409, 'La cuenta de TIDAL no está conectada. El admin tiene que conectarla.'); }
      try {
        const body = await tokenRequest({ grant_type: 'refresh_token', refresh_token: tokens.refresh, client_id: CLIENT_ID });
        adoptTokenResponse(body, tokens);
      } catch (e) {
        if (e.status === 400 || e.status === 401) { needsReconnect = true; lastError = 'TIDAL rechazó la renovación del acceso: hay que volver a conectar la cuenta.'; }
        throw httpErr(502, 'No se pudo renovar el acceso a TIDAL.');
      }
    })().finally(() => { refreshing = null; });
    return refreshing;
  }

  async function userToken() {
    if (!tokens) throw httpErr(409, 'La cuenta de TIDAL no está conectada. El admin tiene que conectarla.');
    if (Date.now() > tokens.expiresAt - 60_000) await refreshTokens();
    return tokens.access;
  }

  // Token de aplicación (client credentials) para leer el catálogo (buscar, carátulas).
  // Solo se usa si hay TIDAL_CLIENT_SECRET; si no, se usa el de la cuenta conectada.
  let appTok = null;
  async function appToken() {
    if (!CLIENT_SECRET) return userToken();
    if (appTok && Date.now() < appTok.exp - 60_000) return appTok.value;
    const body = await tokenRequest({ grant_type: 'client_credentials' }, { basic: true });
    appTok = { value: body.access_token, exp: Date.now() + (Number(body.expires_in) || 3600) * 1000 };
    return appTok.value;
  }

  // ---------------------------------------------------------------
  // Cliente HTTP de la API oficial
  // ---------------------------------------------------------------
  function httpErr(status, message) {
    const e = new Error(message);
    e.status = status;
    e.publico = true;
    return e;
  }

  async function api(method, pathname, { query, body, as = 'user' } = {}) {
    const url = new URL(OPENAPI + pathname);
    for (const [k, v] of Object.entries(query || {})) if (v !== undefined && v !== '') url.searchParams.set(k, String(v));

    let mediaType = 'application/vnd.api+json';
    let refreshed = false;
    let tries = 0;

    for (;;) {
      const token = as === 'app' ? await appToken() : await userToken();
      const headers = { Authorization: `Bearer ${token}`, Accept: 'application/vnd.api+json' };
      if (body) headers['Content-Type'] = mediaType;
      let resp;
      try {
        resp = await fetch(url, { method, headers, body: body ? JSON.stringify(body) : undefined, signal: AbortSignal.timeout(20_000) });
      } catch (e) {
        throw httpErr(504, 'TIDAL no responde ahora mismo. Prueba en un momento.');
      }

      if (resp.status === 401 && !refreshed) {
        refreshed = true;
        if (as === 'app') appTok = null; else if (tokens) tokens.expiresAt = 0;
        continue;
      }
      if (resp.status === 415 && body && mediaType !== 'application/json') { mediaType = 'application/json'; continue; }
      if (resp.status === 429 && tries < 2) {
        tries++;
        const wait = Math.min(Number(resp.headers.get('retry-after')) || 2, 8);
        await sleep(wait * 1000);
        continue;
      }

      const text = await resp.text();
      let json = null;
      if (text) { try { json = JSON.parse(text); } catch { json = null; } }

      if (!resp.ok) {
        const detail = json?.errors?.[0]?.detail || json?.errors?.[0]?.title || `HTTP ${resp.status}`;
        lastError = `${method} ${pathname} → ${resp.status}: ${detail}`;
        console.error('TIDAL API:', lastError);
        const e = new Error(detail);
        e.status = resp.status;
        e.tidal = true;
        throw e;
      }
      lastError = null;
      return json;
    }
  }

  // ---------------------------------------------------------------
  // Metadatos de canciones (título, artistas, carátula)
  // ---------------------------------------------------------------
  const metaCache = new Map(); // trackId -> { ts, meta }

  function isoDuration(s) {
    const m = /^PT(?:(\d+)H)?(?:(\d+)M)?(?:(\d+(?:\.\d+)?)S)?$/.exec(String(s || ''));
    if (!m) return 0;
    return Math.round((Number(m[1]) || 0) * 3600 + (Number(m[2]) || 0) * 60 + (Number(m[3]) || 0));
  }

  // Solo se aceptan carátulas servidas por TIDAL, para que el navegador no cargue nada raro.
  function safeImage(files, want = 320) {
    const list = (Array.isArray(files) ? files : [])
      .filter((f) => typeof f?.href === 'string')
      .map((f) => ({ href: f.href, w: Number(f.meta?.width) || 0 }))
      .filter((f) => { try { const u = new URL(f.href); return u.protocol === 'https:' && /(^|\.)tidal\.com$/.test(u.hostname); } catch { return false; } });
    if (!list.length) return '';
    list.sort((a, b) => Math.abs(a.w - want) - Math.abs(b.w - want));
    return list[0].href;
  }

  const chunk = (arr, n) => { const out = []; for (let i = 0; i < arr.length; i += n) out.push(arr.slice(i, i + n)); return out; };
  const indexIncluded = (doc) => {
    const m = new Map();
    for (const r of doc?.included || []) m.set(`${r.type}:${r.id}`, r);
    return m;
  };

  // Devuelve Map(trackId -> meta). Usa caché; pide a TIDAL solo lo que falta (20 por petición).
  async function trackMeta(ids) {
    const out = new Map();
    const falta = [];
    const now = Date.now();
    for (const id of ids) {
      const c = metaCache.get(id);
      if (c && now - c.ts < META_TTL) out.set(id, c.meta); else falta.push(id);
    }
    for (const group of chunk(falta, 20)) {
      const doc = await api('GET', '/tracks', {
        as: 'app',
        query: { countryCode: COUNTRY, 'filter[id]': group.join(','), include: 'artists,albums' }
      });
      const inc = indexIncluded(doc);
      const albumIds = new Set();
      const tmp = [];
      for (const t of doc?.data || []) {
        const artists = (t.relationships?.artists?.data || [])
          .map((a) => inc.get(`artists:${a.id}`)?.attributes?.name).filter(Boolean);
        const albumRef = t.relationships?.albums?.data?.[0];
        const album = albumRef ? inc.get(`albums:${albumRef.id}`) : null;
        if (albumRef) albumIds.add(albumRef.id);
        tmp.push({
          id: String(t.id),
          title: String(t.attributes?.title || 'Sin título') + (t.attributes?.version ? ` (${t.attributes.version})` : ''),
          artists,
          album: album?.attributes?.title || '',
          albumId: albumRef?.id || '',
          duration: isoDuration(t.attributes?.duration),
          explicit: Boolean(t.attributes?.explicit),
          cover: ''
        });
      }
      // Carátulas: se piden por álbum (una petición por cada 20 álbumes)
      const covers = new Map();
      for (const ag of chunk([...albumIds], 20)) {
        try {
          const ad = await api('GET', '/albums', {
            as: 'app',
            query: { countryCode: COUNTRY, 'filter[id]': ag.join(','), include: 'coverArt' }
          });
          const ainc = indexIncluded(ad);
          for (const a of ad?.data || []) {
            const artRef = a.relationships?.coverArt?.data?.[0];
            const art = artRef ? ainc.get(`artworks:${artRef.id}`) : null;
            covers.set(String(a.id), safeImage(art?.attributes?.files));
          }
        } catch { /* sin carátula: se muestra un icono */ }
      }
      for (const m of tmp) {
        m.cover = covers.get(String(m.albumId)) || '';
        delete m.albumId;
        m.url = `https://tidal.com/track/${m.id}`;
        metaCache.set(m.id, { ts: Date.now(), meta: m });
        out.set(m.id, m);
      }
    }
    return out;
  }

  // ---------------------------------------------------------------
  // Playlist
  // ---------------------------------------------------------------
  let listCache = { ts: 0, items: null };
  let listInflight = null;

  // Elementos de la playlist en orden: [{ trackId, itemId, addedAt }]
  async function readItems({ fresh = false } = {}) {
    if (!fresh && listCache.items && Date.now() - listCache.ts < LIST_TTL) return listCache.items;
    if (listInflight) return listInflight;
    listInflight = (async () => {
      const items = [];
      let cursor = '';
      for (let page = 0; page < MAX_PAGES; page++) {
        const doc = await api('GET', `/playlists/${encodeURIComponent(PLAYLIST_ID)}/relationships/items`, {
          query: { countryCode: COUNTRY, 'page[cursor]': cursor }
        });
        for (const d of doc?.data || []) {
          if (d.type !== 'tracks') continue; // vídeos y otros se ignoran
          items.push({
            trackId: String(d.id),
            itemId: String(d.meta?.itemId ?? ''),
            addedAt: d.meta?.addedAt ? new Date(d.meta.addedAt).getTime() || 0 : 0
          });
        }
        const next = doc?.links?.next;
        if (!next) break;
        try { cursor = new URL(next, 'https://openapi.tidal.com').searchParams.get('page[cursor]') || ''; } catch { cursor = ''; }
        if (!cursor) break;
      }
      listCache = { ts: Date.now(), items };
      return items;
    })().finally(() => { listInflight = null; });
    return listInflight;
  }

  const invalidateList = () => { listCache = { ts: 0, items: null }; };

  async function playlistView({ fresh = false } = {}) {
    const items = await readItems({ fresh });
    const metas = await trackMeta([...new Set(items.map((i) => i.trackId))]);
    const tracks = items.map((i) => {
      const m = metas.get(i.trackId);
      const reg = added[i.trackId];
      return {
        trackId: i.trackId,
        itemId: i.itemId,
        title: m?.title || 'Canción no disponible',
        artists: m?.artists || [],
        album: m?.album || '',
        cover: m?.cover || '',
        duration: m?.duration || 0,
        explicit: Boolean(m?.explicit),
        url: `https://tidal.com/track/${i.trackId}`,
        by: reg?.by || null,                 // null = la añadieron directamente en TIDAL
        addedAt: reg?.ts || i.addedAt || 0
      };
    });
    return tracks;
  }

  // ---------------------------------------------------------------
  // Utilidades de entrada y límites
  // ---------------------------------------------------------------
  const cleanName = (v) => String(v || '').replace(/[\u0000-\u001f\u007f<>]/g, '').replace(/\s+/g, ' ').trim().slice(0, NAME_MAX);
  const validTrackId = (v) => /^\d{1,12}$/.test(String(v || ''));

  function makeLimiter(max, windowMs, msg) {
    const hits = new Map();
    return (req, res, next) => {
      const now = Date.now();
      const recent = (hits.get(req.ip) || []).filter((t) => now - t < windowMs);
      if (recent.length >= max) return res.status(429).json({ error: msg });
      recent.push(now);
      hits.set(req.ip, recent);
      if (hits.size > 5000) for (const [ip, arr] of hits) if (!arr.some((t) => now - t < windowMs)) hits.delete(ip);
      next();
    };
  }
  const searchLimiter = makeLimiter(40, 60_000, 'Demasiadas búsquedas seguidas. Espera un momento.');
  const addLimiter = makeLimiter(12, 3600_000, 'Has añadido muchas canciones seguidas. Prueba dentro de un rato.');
  let globalAdds = [];

  // Las acciones que cambian cosas solo se aceptan como JSON y desde la propia web.
  function jsonSameOrigin(req, res, next) {
    const origin = req.get('origin');
    if (origin) {
      try { if (new URL(origin).host !== req.get('host')) return res.status(403).json({ error: 'Origen no permitido.' }); }
      catch { return res.status(403).json({ error: 'Origen no permitido.' }); }
    }
    if (!req.is('application/json')) return res.status(415).json({ error: 'Formato no válido.' });
    next();
  }

  const fail = (res, e) => {
    const status = e.status && e.status >= 400 && e.status < 600 ? e.status : 500;
    let msg = e.publico ? e.message : 'No se ha podido hablar con TIDAL.';
    if (e.tidal) {
      if (e.status === 401 || e.status === 403) msg = 'TIDAL no deja hacer esto con la cuenta conectada. El admin tiene que revisar la conexión.';
      else if (e.status === 404) msg = 'TIDAL no encuentra eso (¿la canción ya no está disponible?).';
      else if (e.status === 429) msg = 'TIDAL pide ir más despacio. Prueba otra vez en unos segundos.';
      else msg = 'TIDAL ha dado un error. Prueba otra vez.';
    }
    res.status(e.tidal ? (e.status === 429 ? 429 : 502) : status).json({ error: msg });
  };

  const disabledMsg = 'La playlist de TIDAL todavía no está configurada.';
  const guard = (req, res, next) => (configured ? next() : res.status(503).json({ error: disabledMsg }));

  // ---------------------------------------------------------------
  // Rutas públicas
  // ---------------------------------------------------------------
  app.get('/api/tidal/playlist', guard, async (req, res) => {
    res.set('Cache-Control', 'no-store');
    await ready;
    if (!tokens) return res.json({ connected: false, playlistUrl: `https://tidal.com/playlist/${PLAYLIST_ID}`, tracks: [] });
    try {
      const tracks = await playlistView();
      res.json({ connected: true, playlistUrl: `https://tidal.com/playlist/${PLAYLIST_ID}`, total: tracks.length, tracks });
    } catch (e) { fail(res, e); }
  });

  const searchCache = new Map();
  app.get('/api/tidal/search', guard, searchLimiter, async (req, res) => {
    res.set('Cache-Control', 'no-store');
    await ready;
    const q = String(req.query.q || '').replace(/[\u0000-\u001f\u007f]/g, ' ').replace(/\s+/g, ' ').trim().slice(0, 80);
    if (q.length < 2) return res.json({ results: [] });
    try {
      const k = q.toLowerCase();
      const hit = searchCache.get(k);
      let ids;
      if (hit && Date.now() - hit.ts < SEARCH_TTL) ids = hit.ids;
      else {
        // TIDAL cambió su API de búsqueda: ya no vale /searchResults/{query}/relationships/tracks
        // (eso da 400 "Invalid resource ID"). Ahora hay que mandar la búsqueda como filter[query]
        // a /searchResults, y la respuesta es una lista (normalmente con un único resultado).
        const doc = await api('GET', '/searchResults', {
          as: 'app', query: { 'filter[query]': q, countryCode: COUNTRY, include: 'tracks' }
        });
        const first = (doc?.data || [])[0];
        const trackRefs = first?.relationships?.tracks?.data || [];
        ids = trackRefs.filter((d) => d.type === 'tracks').map((d) => String(d.id)).slice(0, 20);
        searchCache.set(k, { ts: Date.now(), ids });
        if (searchCache.size > 300) searchCache.delete(searchCache.keys().next().value);
      }
      const metas = await trackMeta(ids);
      let enLista = new Set();
      try { enLista = new Set((await readItems()).map((i) => i.trackId)); } catch { /* sin cuenta conectada: no se marca */ }
      const results = ids.filter((id) => metas.has(id)).map((id) => ({ ...metas.get(id), trackId: id, inPlaylist: enLista.has(id) }));
      res.json({ results });
    } catch (e) { fail(res, e); }
  });

  app.post('/api/tidal/add', guard, jsonSameOrigin, addLimiter, async (req, res) => {
    res.set('Cache-Control', 'no-store');
    await ready;
    const name = cleanName(req.body?.name);
    const trackId = String(req.body?.trackId || '');
    if (!name) return res.status(400).json({ error: 'Pon tu nombre para saber quién añade la canción.' });
    if (!validTrackId(trackId)) return res.status(400).json({ error: 'Canción no válida.' });

    // Tope global por si alguien reparte la petición entre muchas IPs
    const now = Date.now();
    globalAdds = globalAdds.filter((t) => now - t < 3600_000);
    if (globalAdds.length >= 120) return res.status(429).json({ error: 'Se han añadido demasiadas canciones seguidas. Prueba dentro de un rato.' });

    try {
      const actuales = await readItems({ fresh: listCache.ts < now - 5_000 });
      if (actuales.some((i) => i.trackId === trackId)) return res.status(409).json({ error: 'Esa canción ya está en la playlist.' });

      const metas = await trackMeta([trackId]);
      if (!metas.has(trackId)) return res.status(404).json({ error: 'TIDAL no encuentra esa canción.' });

      await api('POST', `/playlists/${encodeURIComponent(PLAYLIST_ID)}/relationships/items`, {
        query: { countryCode: COUNTRY },
        body: { data: [{ id: trackId, type: 'tracks' }] }
      });

      globalAdds.push(now);
      added[trackId] = { by: name, ts: Date.now() };
      savePlaylist();
      invalidateList();
      res.json({ ok: true, track: { ...metas.get(trackId), trackId, by: name, addedAt: added[trackId].ts } });
    } catch (e) { fail(res, e); }
  });

  // ---------------------------------------------------------------
  // Rutas de admin
  // ---------------------------------------------------------------
  app.get('/api/admin/tidal/status', adminAuth, async (req, res) => {
    res.set('Cache-Control', 'no-store');
    await ready;
    const out = {
      configured,
      canEncrypt,
      hasClientSecret: Boolean(CLIENT_SECRET),
      connected: Boolean(tokens),
      needsReconnect,
      scope: tokens?.scope || SCOPES,
      connectedAt: tokens?.connectedAt || null,
      expiresAt: tokens?.expiresAt || null,
      playlistId: PLAYLIST_ID,
      redirectUri: redirectUriFor(req), // hay que registrar EXACTAMENTE esta URL en developer.tidal.com
      lastError
    };
    if (tokens) {
      try {
        const doc = await api('GET', `/playlists/${encodeURIComponent(PLAYLIST_ID)}`, { query: { countryCode: COUNTRY, include: 'owners' } });
        out.playlistName = doc?.data?.attributes?.name || '';
        const owners = (doc?.data?.relationships?.owners?.data || []).map((o) => String(o.id));
        out.isOwner = tokens.userId ? owners.includes(tokens.userId) : null;
      } catch { /* el error ya queda en lastError */ out.lastError = lastError; }
    }
    res.json(out);
  });

  // Empieza la conexión: redirige a la página oficial de TIDAL
  app.get('/api/admin/tidal/connect', adminAuth, (req, res) => {
    if (!configured) return res.status(503).send(disabledMsg);
    if (!canEncrypt) return res.status(503).send('Falta TIDAL_TOKEN_KEY (mínimo 32 caracteres) en las variables de entorno: sin ella no se pueden guardar los tokens de forma segura.');
    const now = Date.now();
    for (const [s, v] of pending) if (v.exp < now) pending.delete(s);

    const verifier = b64url(crypto.randomBytes(64));
    const state = b64url(crypto.randomBytes(24));
    const redirectUri = redirectUriFor(req);
    pending.set(state, { verifier, redirectUri, exp: now + 10 * 60_000 });

    const url = new URL(AUTH_URL);
    url.search = new URLSearchParams({
      response_type: 'code',
      client_id: CLIENT_ID,
      redirect_uri: redirectUri,
      scope: SCOPES,
      code_challenge_method: 'S256',
      code_challenge: b64url(crypto.createHash('sha256').update(verifier).digest()),
      state
    }).toString();
    res.set('Cache-Control', 'no-store').redirect(url.toString());
  });

  // TIDAL devuelve aquí al admin. Solo vale un "state" que acabe de crear /connect (un solo uso).
  app.get('/api/tidal/callback', async (req, res) => {
    res.set({ 'Cache-Control': 'no-store', 'Referrer-Policy': 'no-referrer' });
    const volver = (r) => res.redirect(`/playlist.html?admin=1&tidal=${r}`);
    const state = String(req.query.state || '');
    const p = pending.get(state);
    pending.delete(state);
    if (!p || p.exp < Date.now()) return volver('caducado');
    if (req.query.error || !req.query.code) return volver('cancelado');
    try {
      const body = await tokenRequest({
        grant_type: 'authorization_code',
        client_id: CLIENT_ID,
        code: String(req.query.code),
        redirect_uri: p.redirectUri,
        code_verifier: p.verifier
      });
      adoptTokenResponse(body, null);
      invalidateList();
      lastError = null;
      volver('ok');
    } catch (e) {
      lastError = 'No se pudo completar la conexión con TIDAL: ' + (e.message || 'error');
      console.error('TIDAL callback:', lastError);
      volver('error');
    }
  });

  app.post('/api/admin/tidal/disconnect', adminAuth, jsonSameOrigin, async (req, res) => {
    tokens = null;
    appTok = null;
    needsReconnect = false;
    invalidateList();
    try { fs.unlinkSync(TOKEN_FILE); } catch { /* no existía */ }
    await deleteCloud(TOKEN_CLOUD_ID);
    res.json({ ok: true });
  });

  // Quitar una canción de la playlist (solo admin). Se pasa el itemId que da TIDAL.
  app.delete('/api/admin/tidal/items/:itemId', adminAuth, async (req, res) => {
    res.set('Cache-Control', 'no-store');
    await ready;
    const itemId = String(req.params.itemId || '');
    if (!/^[\w-]{1,64}$/.test(itemId)) return res.status(400).json({ error: 'Elemento no válido.' });
    try {
      const actuales = await readItems({ fresh: true });
      const item = actuales.find((i) => i.itemId === itemId);
      if (!item) return res.status(404).json({ error: 'Esa canción ya no está en la playlist.' });

      await api('DELETE', `/playlists/${encodeURIComponent(PLAYLIST_ID)}/relationships/items`, {
        body: { data: [{ id: item.trackId, type: 'tracks', meta: { itemId: item.itemId } }] }
      });

      invalidateList();
      if (!actuales.some((i) => i.trackId === item.trackId && i.itemId !== item.itemId)) {
        delete added[item.trackId];
        savePlaylist();
      }
      res.json({ ok: true });
    } catch (e) { fail(res, e); }
  });

  return { ready };
}
