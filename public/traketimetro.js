// Traketímetro.
//   GET  /api/traketimetro             → lista de gente + ranking
//   POST /api/traketimetro/add         → { name, tipo }
//   POST /api/traketimetro/undo        → { name, tipo }
//   GET  /api/traketimetro/stream      → avisos en directo (SSE)

const $ = (id) => document.getElementById(id);

const TIPOS = {
  cervezas: { emoji: '🍺', etiqueta: 'Cerveza' },
  cubatas: { emoji: '🍹', etiqueta: 'Cubata' },
  chupitos: { emoji: '🥃', etiqueta: 'Chupito' },
  porros: { emoji: '🚬', etiqueta: 'Porro' }
};

const store = {
  get(k) { try { return localStorage.getItem(k) || ''; } catch { return ''; } },
  set(k, v) { try { localStorage.setItem(k, v); } catch { /* sin almacenamiento: no pasa nada */ } }
};

let lastAction = null; // { name, tipo } — para poder deshacer
let people = [];

function nombreActual() {
  return $('name').value.trim();
}

function decirEstado(text, kind) {
  const el = $('msg');
  el.textContent = text || '';
  el.className = 'msg' + (kind ? ' ' + kind : '');
}

function actualizarDatalist() {
  const dl = $('nombres');
  dl.innerHTML = people.map((p) => `<option value="${escapeHtml(p.name)}">`).join('');
}

function escapeHtml(s) {
  return String(s).replace(/[&<>"']/g, (c) => ({
    '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;'
  }[c]));
}

function pintarRanking() {
  const tbody = $('rankingBody');
  const vacio = $('rankingVacio');

  if (!people.length) {
    tbody.innerHTML = '';
    vacio.hidden = false;
    return;
  }
  vacio.hidden = true;

  const medallas = ['🥇', '🥈', '🥉'];

  tbody.innerHTML = people.map((p, i) => `
    <tr>
      <td class="rk-pos">${medallas[i] || (i + 1)}</td>
      <td class="rk-name">${escapeHtml(p.name)}</td>
      <td>${p.cervezas}</td>
      <td>${p.cubatas}</td>
      <td>${p.chupitos}</td>
      <td>${p.porros}</td>
      <td class="rk-total">${p.total}</td>
    </tr>
  `).join('');
}

async function cargar() {
  try {
    const res = await fetch('/api/traketimetro', { cache: 'no-store' });
    const data = await res.json();
    people = data.people || [];
    actualizarDatalist();
    pintarRanking();
  } catch {
    decirEstado('No se ha podido cargar el ranking. Prueba a recargar la página.', 'err');
  }
}

async function registrar(tipo) {
  const name = nombreActual();
  if (!name) {
    decirEstado('Escribe tu nombre primero 👆', 'err');
    $('name').focus();
    return;
  }
  store.set('trake-name', name);

  const t = TIPOS[tipo];
  const btn = $('tile-' + tipo);
  btn?.classList.add('pulse');
  setTimeout(() => btn?.classList.remove('pulse'), 220);

  try {
    const res = await fetch('/api/traketimetro/add', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ name, tipo })
    });
    const data = await res.json().catch(() => ({}));
    if (!res.ok) throw new Error(data.error || 'No se ha podido apuntar.');

    people = data.people || people;
    actualizarDatalist();
    pintarRanking();

    lastAction = { name, tipo };
    $('undo').hidden = false;
    decirEstado(`${t.emoji} +1 ${t.etiqueta.toLowerCase()} para ${name}`, 'ok');
  } catch (e) {
    decirEstado(e.message || 'Ha habido un error.', 'err');
  }
}

async function deshacer() {
  if (!lastAction) return;
  const { name, tipo } = lastAction;
  lastAction = null;
  $('undo').hidden = true;

  try {
    const res = await fetch('/api/traketimetro/undo', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ name, tipo })
    });
    const data = await res.json().catch(() => ({}));
    if (!res.ok) throw new Error(data.error || 'No se ha podido deshacer.');

    people = data.people || people;
    actualizarDatalist();
    pintarRanking();
    decirEstado(`Deshecho: -1 ${TIPOS[tipo].etiqueta.toLowerCase()} de ${name}`, 'ok');
  } catch (e) {
    decirEstado(e.message || 'Ha habido un error.', 'err');
  }
}

// ---------- En directo (SSE) ----------
function conectarDirecto() {
  try {
    const es = new EventSource('/api/traketimetro/stream');
    es.onmessage = (ev) => {
      try {
        const data = JSON.parse(ev.data);
        if (data.type === 'trake-changed') {
          people = data.people || [];
          actualizarDatalist();
          pintarRanking();
        }
      } catch { /* mensaje raro, se ignora */ }
    };
    es.onerror = () => { /* el navegador reintenta solo */ };
  } catch { /* sin SSE no pasa nada, se ve igual al recargar */ }
}

// ---------- Arranque ----------
Object.keys(TIPOS).forEach((tipo) => {
  $('tile-' + tipo)?.addEventListener('click', () => registrar(tipo));
});

$('undo').addEventListener('click', deshacer);

const nombreGuardado = store.get('trake-name');
if (nombreGuardado) $('name').value = nombreGuardado;

cargar();
conectarDirecto();
