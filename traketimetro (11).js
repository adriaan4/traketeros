// Traketímetro.
//   GET    /api/traketimetro              → lista de gente + ranking
//   POST   /api/traketimetro/add          → { name, tipo, cantidad? }
//   POST   /api/traketimetro/undo         → { name, tipo, cantidad? }
//   POST   /api/traketimetro/set          → { name, cervezas, cubatas, chupitos, porros } (corregir a mano; SOLO admin)
//   DELETE /api/admin/traketimetro/:name  → borrar a alguien del ranking (solo admin: abre traketimetro.html?admin=1)
//   GET    /api/traketimetro/stream       → avisos en directo (SSE)

const $ = (id) => document.getElementById(id);

const IS_ADMIN = new URLSearchParams(location.search).get('admin') === '1';

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

function cantidadActual() {
  const n = Math.round(Number($('cantidad').value));
  if (!Number.isFinite(n) || n < 1) return 1;
  return Math.min(n, 24);
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
      <td class="rk-edit">
        ${IS_ADMIN ? `<button class="rk-edit-btn" type="button" data-editar="${escapeHtml(p.name)}" aria-label="Editar cantidades de ${escapeHtml(p.name)}">✏️</button>` : ''}
        ${IS_ADMIN ? `<button class="rk-edit-btn" type="button" data-borrar="${escapeHtml(p.name)}" aria-label="Borrar a ${escapeHtml(p.name)} del ranking">🗑️</button>` : ''}
      </td>
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

  const cantidad = cantidadActual();
  const t = TIPOS[tipo];
  const btn = $('tile-' + tipo);
  btn?.classList.add('pulse');
  setTimeout(() => btn?.classList.remove('pulse'), 220);

  try {
    const res = await fetch('/api/traketimetro/add', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ name, tipo, cantidad })
    });
    const data = await res.json().catch(() => ({}));
    if (!res.ok) throw new Error(data.error || 'No se ha podido apuntar.');

    people = data.people || people;
    actualizarDatalist();
    pintarRanking();

    lastAction = { name, tipo, cantidad };
    $('undo').hidden = false;
    decirEstado(`${t.emoji} +${cantidad} ${t.etiqueta.toLowerCase()}${cantidad > 1 ? 's' : ''} para ${name}`, 'ok');
  } catch (e) {
    decirEstado(e.message || 'Ha habido un error.', 'err');
  }
}

async function deshacer() {
  if (!lastAction) return;
  const { name, tipo, cantidad } = lastAction;
  lastAction = null;
  $('undo').hidden = true;

  try {
    const res = await fetch('/api/traketimetro/undo', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ name, tipo, cantidad })
    });
    const data = await res.json().catch(() => ({}));
    if (!res.ok) throw new Error(data.error || 'No se ha podido deshacer.');

    people = data.people || people;
    actualizarDatalist();
    pintarRanking();
    decirEstado(`Deshecho: -${cantidad || 1} ${TIPOS[tipo].etiqueta.toLowerCase()}${(cantidad || 1) > 1 ? 's' : ''} de ${name}`, 'ok');
  } catch (e) {
    decirEstado(e.message || 'Ha habido un error.', 'err');
  }
}

// ---------- Corregir cantidades a mano ----------
const editDialog = $('editDialog');
let editando = null;

function abrirEditor(name) {
  const p = people.find((x) => x.name === name);
  if (!p) return;

  editando = name;
  $('editTitle').textContent = `Editar a ${p.name}`;
  $('editCervezas').value = p.cervezas;
  $('editCubatas').value = p.cubatas;
  $('editChupitos').value = p.chupitos;
  $('editPorros').value = p.porros;
  $('editMsg').textContent = '';
  $('editMsg').className = 'msg';

  if (!editDialog.open) editDialog.showModal();
}

function numeroEditor(id) {
  const n = Math.round(Number($(id).value));
  if (!Number.isFinite(n) || n < 0) return 0;
  return Math.min(n, 999);
}

$('rankingBody').addEventListener('click', (e) => {
  const editBtn = e.target.closest('[data-editar]');
  if (editBtn) { abrirEditor(editBtn.dataset.editar); return; }

  const delBtn = e.target.closest('[data-borrar]');
  if (delBtn) { borrarPersona(delBtn.dataset.borrar); }
});

// ---------- Borrar a alguien del ranking (solo admin) ----------
async function borrarPersona(name) {
  if (!confirm(`¿Borrar a ${name} del ranking? Se perderán todas sus cantidades.`)) return;

  try {
    const res = await fetch('/api/admin/traketimetro/' + encodeURIComponent(name), { method: 'DELETE' });
    if (!res.ok) {
      throw new Error(res.status === 401 ? 'Necesitas entrar como administrador.' : 'No se ha podido borrar.');
    }
    const data = await res.json().catch(() => ({}));
    people = data.people || people.filter((p) => p.name !== name);
    actualizarDatalist();
    pintarRanking();
    decirEstado(`${name} borrado del ranking 🗑️`, 'ok');
  } catch (e) {
    decirEstado(e.message || 'Ha habido un error.', 'err');
  }
}

$('editCancel').addEventListener('click', () => editDialog.close());
editDialog.addEventListener('click', (e) => { if (e.target === editDialog) editDialog.close(); });
editDialog.addEventListener('close', () => { editando = null; });

$('editSave').addEventListener('click', async () => {
  if (!editando) return;

  const body = {
    name: editando,
    cervezas: numeroEditor('editCervezas'),
    cubatas: numeroEditor('editCubatas'),
    chupitos: numeroEditor('editChupitos'),
    porros: numeroEditor('editPorros')
  };

  const saveBtn = $('editSave');
  saveBtn.disabled = true;
  try {
    const res = await fetch('/api/traketimetro/set', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(body)
    });
    const data = await res.json().catch(() => ({}));
    if (!res.ok) throw new Error(res.status === 401 ? 'Necesitas entrar como administrador.' : (data.error || 'No se ha podido guardar.'));

    people = data.people || people;
    actualizarDatalist();
    pintarRanking();
    editDialog.close();
    decirEstado(`Cantidades de ${editando} corregidas ✏️`, 'ok');
  } catch (e) {
    $('editMsg').textContent = e.message || 'Ha habido un error.';
    $('editMsg').className = 'msg err';
  } finally {
    saveBtn.disabled = false;
  }
});

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
