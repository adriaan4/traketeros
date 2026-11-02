// 🎧 Playlist TKT · front-end
// Habla solo con nuestro servidor (/api/tidal/...). Aquí no hay ninguna credencial ni token de TIDAL.
//
//   GET    /api/tidal/playlist           → canciones de la playlist (con quién las añadió)
//   GET    /api/tidal/search?q=...       → buscador de canciones de TIDAL
//   POST   /api/tidal/add                → { name, trackId } añade a la playlist
//   DELETE /api/admin/tidal/items/:id    → (admin) quitar una canción: abre playlist.html?admin=1

const IS_ADMIN = new URLSearchParams(location.search).get('admin') === '1';
const $ = (id) => document.getElementById(id);

const store = {
  get(k) { try { return localStorage.getItem(k) || ''; } catch { return ''; } },
  set(k, v) { try { localStorage.setItem(k, v); } catch { /* sin almacenamiento: no pasa nada */ } }
};

let conectado = true;
let enLista = new Set();
let busquedaSeq = 0;

// ---------- Utilidades ----------
function el(tag, props = {}, children = []) {
  const n = document.createElement(tag);
  for (const [k, v] of Object.entries(props)) {
    if (k === 'class') n.className = v;
    else if (k === 'text') n.textContent = v;
    else if (k.startsWith('on')) n.addEventListener(k.slice(2), v);
    else n.setAttribute(k, v);
  }
  for (const c of [].concat(children)) if (c) n.append(c);
  return n;
}

function msg(id, text, kind) {
  const n = $(id);
  n.textContent = text || '';
  n.className = 'msg' + (kind ? ' ' + kind : '');
}

const dur = (s) => (s > 0 ? `${Math.floor(s / 60)}:${String(s % 60).padStart(2, '0')}` : '');

function hace(ts) {
  if (!ts) return '';
  const s = Math.max(0, Math.round((Date.now() - ts) / 1000));
  if (s < 60) return 'ahora mismo';
  if (s < 3600) return `hace ${Math.round(s / 60)} min`;
  if (s < 86400) return `hace ${Math.round(s / 3600)} h`;
  if (s < 86400 * 30) return `hace ${Math.round(s / 86400)} d`;
  return new Date(ts).toLocaleDateString('es-ES', { day: 'numeric', month: 'short', year: 'numeric', timeZone: 'Europe/Madrid' });
}

function esUrlTidal(u) {
  try { const x = new URL(u); return x.protocol === 'https:' && /(^|\.)tidal\.com$/.test(x.hostname); } catch { return false; }
}

async function pedir(url, opts) {
  const res = await fetch(url, opts);
  const data = await res.json().catch(() => ({}));
  if (!res.ok) {
    const e = new Error(res.status === 401 ? 'Necesitas entrar como administrador.' : (data.error || 'No se ha podido.'));
    e.status = res.status;
    throw e;
  }
  return data;
}

function cover(t) {
  if (t.cover && esUrlTidal(t.cover)) {
    return el('img', { class: 'pl-cover', src: t.cover, alt: '', width: 56, height: 56, loading: 'lazy', referrerpolicy: 'no-referrer' });
  }
  return el('div', { class: 'pl-cover', 'aria-hidden': 'true', text: '🎵' });
}

function info(t, extra) {
  const titulo = el('div', { class: 'pl-title' }, [
    t.url ? el('a', { href: t.url, target: '_blank', rel: 'noopener noreferrer', text: t.title }) : t.title,
    t.explicit ? el('span', { class: 'pl-explicit', title: 'Contenido explícito', text: 'E' }) : null
  ]);
  const artistas = (t.artists || []).join(', ') + (t.album ? ` · ${t.album}` : '') + (dur(t.duration) ? ` · ${dur(t.duration)}` : '');
  return el('div', { class: 'pl-info' }, [titulo, el('div', { class: 'pl-artist', text: artistas }), extra]);
}

// ---------- Playlist ----------
function pintarLista(tracks) {
  const ul = $('plTracks');
  ul.replaceChildren();
  enLista = new Set(tracks.map((t) => t.trackId));
  $('plCount').textContent = tracks.length ? `(${tracks.length})` : '';

  if (!tracks.length) {
    ul.append(el('li', { class: 'hint', text: 'Todavía no hay canciones. ¡Sé el primero!' }));
    return;
  }

  // Lo último añadido, arriba
  const orden = [...tracks].reverse();
  for (const t of orden) {
    const quien = t.by
      ? `🎧 Añadida por ${t.by}${t.addedAt ? ' · ' + hace(t.addedAt) : ''}`
      : '🎧 Añadida desde TIDAL';
    const acciones = el('div', { class: 'pl-actions' });
    if (IS_ADMIN) {
      acciones.append(el('button', {
        class: 'mini danger', type: 'button', text: '🗑️ Quitar',
        onclick: (e) => quitar(t, e.currentTarget)
      }));
    }
    ul.append(el('li', { class: 'pl-item' }, [cover(t), info(t, el('div', { class: 'pl-by', text: quien })), acciones]));
  }
}

async function cargarLista() {
  try {
    const data = await pedir('/api/tidal/playlist');
    if (data.playlistUrl && esUrlTidal(data.playlistUrl)) $('plOpen').href = data.playlistUrl;
    conectado = data.connected !== false;
    if (!conectado) {
      pintarLista([]);
      msg('plListMsg', IS_ADMIN
        ? 'La playlist todavía no está conectada con TIDAL. Conéctala abajo, en el panel de admin.'
        : 'La playlist todavía no está conectada con TIDAL. Avisa al admin.', 'err');
      return;
    }
    msg('plListMsg', '');
    pintarLista(data.tracks || []);
  } catch (e) {
    msg('plListMsg', e.message, 'err');
  }
}

async function quitar(t, btn) {
  if (!confirm(`¿Quitar «${t.title}» de la playlist?`)) return;
  btn.disabled = true;
  try {
    await pedir('/api/admin/tidal/items/' + encodeURIComponent(t.itemId), { method: 'DELETE' });
    msg('plListMsg', 'Canción quitada.', 'ok');
    await cargarLista();
    if ($('plQuery').value.trim().length >= 2) buscar();
  } catch (e) {
    msg('plListMsg', e.message, 'err');
    btn.disabled = false;
  }
}

// ---------- Buscador ----------
function pintarResultados(results) {
  const ul = $('plResults');
  ul.replaceChildren();
  if (!results.length) {
    msg('plMsg', 'No he encontrado nada con eso.');
    return;
  }
  msg('plMsg', '');
  for (const t of results) {
    const ya = t.inPlaylist || enLista.has(t.trackId);
    const btn = el('button', {
      class: 'mini', type: 'button', text: ya ? '✔ Ya está' : '➕ Añadir',
      onclick: () => anadir(t, btn)
    });
    btn.disabled = ya;
    ul.append(el('li', { class: 'pl-item' }, [cover(t), info(t), el('div', { class: 'pl-actions' }, [btn])]));
  }
}

async function buscar() {
  const q = $('plQuery').value.trim();
  const seq = ++busquedaSeq;
  if (q.length < 2) {
    $('plResults').replaceChildren();
    msg('plMsg', '');
    return;
  }
  msg('plMsg', 'Buscando…');
  try {
    const data = await pedir('/api/tidal/search?q=' + encodeURIComponent(q));
    if (seq !== busquedaSeq) return; // ya hay otra búsqueda más nueva
    pintarResultados(data.results || []);
  } catch (e) {
    if (seq !== busquedaSeq) return;
    $('plResults').replaceChildren();
    msg('plMsg', e.message, 'err');
  }
}

async function anadir(t, btn) {
  const name = $('plName').value.trim();
  if (!name) {
    msg('plMsg', 'Pon tu nombre para saber quién añade la canción.', 'err');
    $('plName').focus();
    return;
  }
  store.set('trake-name', name);
  btn.disabled = true;
  btn.textContent = 'Añadiendo…';
  try {
    await pedir('/api/tidal/add', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ name, trackId: t.trackId })
    });
    btn.textContent = '✔ Añadida';
    msg('plMsg', `«${t.title}» añadida a la playlist.`, 'ok');
    await cargarLista();
  } catch (e) {
    msg('plMsg', e.message, 'err');
    if (e.status === 409) { btn.textContent = '✔ Ya está'; cargarLista(); }
    else { btn.disabled = false; btn.textContent = '➕ Añadir'; }
  }
}

let timer = null;
$('plQuery').addEventListener('input', () => {
  clearTimeout(timer);
  timer = setTimeout(buscar, 450);
});
$('plQuery').addEventListener('keydown', (e) => {
  if (e.key === 'Enter') { clearTimeout(timer); buscar(); }
});
$('plName').value = store.get('trake-name');

// ---------- Admin: conexión con TIDAL ----------
async function pintarAdmin() {
  $('plAdmin').hidden = false;
  const st = $('plAdminState');
  try {
    const s = await pedir('/api/admin/tidal/status');
    const conectar = $('plConnect');
    const desc = $('plDisconnect');

    if (!s.configured) {
      st.textContent = '⚠️ Falta la variable TIDAL_CLIENT_ID en el servidor (se crea en developer.tidal.com).';
      conectar.hidden = true; desc.hidden = true;
    } else if (!s.canEncrypt) {
      st.textContent = '⚠️ Falta la variable TIDAL_TOKEN_KEY (mínimo 32 caracteres aleatorios): con ella se cifran los tokens. Ponla en el servidor y vuelve aquí.';
      conectar.hidden = true; desc.hidden = true;
    } else if (!s.connected) {
      st.textContent = s.needsReconnect
        ? '⚠️ La conexión con TIDAL ha caducado o se ha revocado. Vuelve a conectarla con la cuenta dueña de la playlist.'
        : 'Todavía no está conectada. Pulsa el botón e inicia sesión en TIDAL con la cuenta dueña de la playlist.';
      conectar.hidden = false; desc.hidden = true;
      conectar.textContent = '🔗 Conectar con TIDAL';
    } else {
      const quien = s.playlistName ? `«${s.playlistName}»` : 'la playlist';
      st.textContent = `✅ Conectada. Gestionando ${quien}.`
        + (s.isOwner === false ? ' ⚠️ La cuenta conectada no figura como dueña de la playlist: puede que TIDAL no deje añadir ni quitar.' : '')
        + (s.lastError ? ` Último error de TIDAL: ${s.lastError}` : '');
      conectar.hidden = false; desc.hidden = false;
      conectar.textContent = '🔄 Reconectar';
    }

    const r = $('plRedirect');
    r.replaceChildren('En developer.tidal.com, la «Redirect URI» de la app debe ser exactamente: ', el('code', { text: s.redirectUri }));
    if (s.lastError && !s.connected) st.textContent += ' ' + s.lastError;
  } catch (e) {
    st.textContent = e.message;
  }
}

$('plDisconnect').addEventListener('click', async () => {
  if (!confirm('¿Desconectar TIDAL? Nadie podrá añadir canciones hasta que lo vuelvas a conectar.')) return;
  try {
    await pedir('/api/admin/tidal/disconnect', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: '{}' });
    msg('plAdminMsg', 'Desconectado.', 'ok');
    await Promise.all([pintarAdmin(), cargarLista()]);
  } catch (e) {
    msg('plAdminMsg', e.message, 'err');
  }
});

// ---------- Arranque ----------
(function iniciar() {
  const t = new URLSearchParams(location.search).get('tidal');
  if (t && IS_ADMIN) {
    const textos = {
      ok: ['TIDAL conectado correctamente. ✅', 'ok'],
      cancelado: ['Has cancelado la conexión con TIDAL.', 'err'],
      caducado: ['El intento de conexión ha caducado. Pulsa «Conectar» otra vez.', 'err'],
      error: ['TIDAL no ha dejado completar la conexión. Revisa que la Redirect URI de la app coincida exactamente.', 'err']
    };
    if (textos[t]) msg('plAdminMsg', textos[t][0], textos[t][1]);
    history.replaceState(null, '', location.pathname + '?admin=1');
  }
  if (IS_ADMIN) pintarAdmin();
  cargarLista();
  setInterval(() => { if (!document.hidden) cargarLista(); }, 45_000);
})();
