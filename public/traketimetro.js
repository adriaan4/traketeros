// Traketímetro.
//   GET    /api/traketimetro?periodo=     → ranking del mes actual (o de otro mes / fecha) + salón
//   POST   /api/admin/traketimetro/fechas → (admin) crear fechas especiales
//   POST   /api/admin/traketimetro/ganador→ (admin) poner el Cubata de Oro a mano
//   POST   /api/traketimetro/add          → { name, tipo, cantidad? }
//   POST   /api/traketimetro/undo         → { name, tipo, cantidad? }
//   POST   /api/traketimetro/set          → { name, cervezas, cubatas, chupitos, porros } (corregir a mano)
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
let totales = [];
let periodo = '';      // '' = mes actual (siempre el que toque); 'm:2026-09' / 'e:<id>' = otro
let periodos = [];
let fechas = [];

// Aplica la respuesta del servidor (ranking + lista de periodos + fechas)
function aplicar(data) {
  if (!data) return;
  people = data.people || people;
  totales = data.totales || totales;
  if (data.periodos) periodos = data.periodos;
  if (data.events) fechas = data.events;
  actualizarDatalist();
  pintarSelector();
  pintarRanking();
  pintarTotales();
  pintarAdmin();
}

function pintarSelector() {
  const sel = $('periodo');
  if (!sel) return;
  const meses = periodos.filter((p) => p.tipo === 'mes');
  const evs = periodos.filter((p) => p.tipo === 'fecha');
  const opt = (p) => {
    const valor = p.actual ? '' : p.id;
    const extra = p.actual ? ' (este mes)' : (p.estado === 'en_curso' ? ' (hoy)' : '');
    return `<option value="${escapeHtml(valor)}">${escapeHtml(p.label + extra)}</option>`;
  };
  sel.innerHTML =
    `<optgroup label="Meses">${meses.map(opt).join('')}</optgroup>` +
    (evs.length ? `<optgroup label="Fechas">${evs.map(opt).join('')}</optgroup>` : '');
  sel.value = periodo;
  if (sel.value !== periodo) { periodo = ''; sel.value = ''; }

  const actual = periodos.find((p) => (p.actual ? '' : p.id) === periodo);
  const info = $('periodoInfo');
  if (!actual) { info.textContent = ''; return; }
  if (actual.tipo === 'mes') {
    info.textContent = actual.actual
      ? 'El ranking arranca de cero cada mes. 🔄'
      : 'Mes cerrado.';
  } else {
    const d = (s) => s.split('-').reverse().join('/');
    info.textContent = actual.start === actual.end ? d(actual.start) : `${d(actual.start)} → ${d(actual.end)}`;
  }
}

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
      <td class="rk-total">${p.puntos}</td>
      <td class="rk-edit">
        <button class="rk-edit-btn" type="button" data-editar="${escapeHtml(p.name)}" aria-label="Editar cantidades de ${escapeHtml(p.name)}">✏️</button>
        ${IS_ADMIN ? `<button class="rk-edit-btn" type="button" data-borrar="${escapeHtml(p.name)}" aria-label="Borrar a ${escapeHtml(p.name)} del ranking">🗑️</button>` : ''}
      </td>
    </tr>
  `).join('');
}

function pintarTotales() {
  const tbody = $('totalesBody');
  const vacio = $('totalesVacio');
  if (!tbody) return;

  if (!totales.length) {
    tbody.innerHTML = '';
    vacio.hidden = false;
    return;
  }
  vacio.hidden = true;

  const suma = (k) => totales.reduce((s, p) => s + (p[k] || 0), 0);
  tbody.innerHTML = totales.map((p) => `
    <tr>
      <td class="rk-name">${escapeHtml(p.name)}</td>
      <td>${p.cervezas}</td>
      <td>${p.cubatas}</td>
      <td>${p.chupitos}</td>
      <td>${p.porros}</td>
      <td class="rk-total">${p.total}</td>
    </tr>
  `).join('') + `
    <tr>
      <td class="rk-name"><b>TODOS</b></td>
      <td><b>${suma('cervezas')}</b></td>
      <td><b>${suma('cubatas')}</b></td>
      <td><b>${suma('chupitos')}</b></td>
      <td><b>${suma('porros')}</b></td>
      <td class="rk-total"><b>${suma('total')}</b></td>
    </tr>`;
}

async function cargar() {
  try {
    const res = await fetch('/api/traketimetro?periodo=' + encodeURIComponent(periodo), { cache: 'no-store' });
    const data = await res.json();
    aplicar(data);
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
      body: JSON.stringify({ name, tipo, cantidad, periodo })
    });
    const data = await res.json().catch(() => ({}));
    if (!res.ok) throw new Error(data.error || 'No se ha podido apuntar.');

    aplicar(data);

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
      body: JSON.stringify({ name, tipo, cantidad, periodo })
    });
    const data = await res.json().catch(() => ({}));
    if (!res.ok) throw new Error(data.error || 'No se ha podido deshacer.');

    aplicar(data);
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
    const res = await fetch('/api/admin/traketimetro/' + encodeURIComponent(name) + '?periodo=' + encodeURIComponent(periodo), { method: 'DELETE' });
    if (!res.ok) {
      throw new Error(res.status === 401 ? 'Necesitas entrar como administrador.' : 'No se ha podido borrar.');
    }
    const data = await res.json().catch(() => ({}));
    aplicar(data);
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
    periodo,
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
    if (!res.ok) throw new Error(data.error || 'No se ha podido guardar.');

    aplicar(data);
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
        if (data.type === 'trake-changed') cargar();
      } catch { /* mensaje raro, se ignora */ }
    };
    es.onerror = () => { /* el navegador reintenta solo */ };
  } catch { /* sin SSE no pasa nada, se ve igual al recargar */ }
}

// ---------- Admin: fechas y Cubata de Oro a mano ----------
function formatoFecha(s) { return String(s).split('-').reverse().join('/'); }

function pintarAdmin() {
  if (!IS_ADMIN) return;
  $('adminFechas').hidden = false;

  $('fechasList').innerHTML = fechas.length
    ? fechas.map((e) => `
      <li>
        <span><b>${escapeHtml(e.name)}</b> · ${formatoFecha(e.start)}${e.end && e.end !== e.start ? ' → ' + formatoFecha(e.end) : ''}</span>
        <button class="rk-edit-btn" type="button" data-fecha-borrar="${escapeHtml(e.id)}" aria-label="Borrar ${escapeHtml(e.name)}">🗑️</button>
      </li>`).join('')
    : '<li class="fechas-vacio">Todavía no hay fechas.</li>';

  const sel = $('ganadorPeriodo');
  const previo = sel.value;
  sel.innerHTML = periodos
    .filter((p) => !p.actual)
    .map((p) => `<option value="${escapeHtml(p.id)}">${escapeHtml(p.label)}</option>`).join('');
  if (previo) sel.value = previo;
}

function msgAdmin(id, text, kind) {
  const el = $(id);
  el.textContent = text || '';
  el.className = 'msg' + (kind ? ' ' + kind : '');
}

async function llamarAdmin(url, method, body) {
  const res = await fetch(url, {
    method,
    headers: { 'Content-Type': 'application/json' },
    body: body ? JSON.stringify({ ...body, periodo }) : undefined
  });
  const data = await res.json().catch(() => ({}));
  if (!res.ok) throw new Error(res.status === 401 ? 'Necesitas entrar como administrador.' : (data.error || 'No se ha podido.'));
  return data;
}

if (IS_ADMIN) {
  $('fechaAdd').addEventListener('click', async () => {
    try {
      const data = await llamarAdmin('/api/admin/traketimetro/fechas', 'POST', {
        name: $('fechaNombre').value,
        start: $('fechaInicio').value,
        end: $('fechaFin').value
      });
      aplicar(data);
      $('fechaNombre').value = '';
      $('fechaInicio').value = '';
      $('fechaFin').value = '';
      msgAdmin('fechaMsg', 'Fecha añadida ✅', 'ok');
    } catch (e) {
      msgAdmin('fechaMsg', e.message, 'err');
    }
  });

  $('fechasList').addEventListener('click', async (e) => {
    const b = e.target.closest('[data-fecha-borrar]');
    if (!b) return;
    if (!confirm('¿Borrar esta fecha? Se pierde también su ranking.')) return;
    try {
      aplicar(await llamarAdmin('/api/admin/traketimetro/fechas/' + encodeURIComponent(b.dataset.fechaBorrar) + '?periodo=' + encodeURIComponent(periodo), 'DELETE'));
      msgAdmin('fechaMsg', 'Fecha borrada 🗑️', 'ok');
    } catch (err) {
      msgAdmin('fechaMsg', err.message, 'err');
    }
  });

  $('ganadorSave').addEventListener('click', async () => {
    try {
      const data = await llamarAdmin('/api/admin/traketimetro/ganador', 'POST', {
        target: $('ganadorPeriodo').value,
        name: $('ganadorNombre').value
      });
      aplicar(data);
      $('ganadorNombre').value = '';
      msgAdmin('ganadorMsg', 'Guardado 🏆', 'ok');
    } catch (err) {
      msgAdmin('ganadorMsg', err.message, 'err');
    }
  });
}

// ---------- Arranque ----------
$('periodo').addEventListener('change', () => {
  periodo = $('periodo').value;
  cargar();
});

Object.keys(TIPOS).forEach((tipo) => {
  $('tile-' + tipo)?.addEventListener('click', () => registrar(tipo));
});

$('undo').addEventListener('click', deshacer);

const nombreGuardado = store.get('trake-name');
if (nombreGuardado) $('name').value = nombreGuardado;

cargar();
conectarDirecto();

// Por si el móvil estaba dormido al cambiar de mes: al volver, se refresca solo
document.addEventListener('visibilitychange', () => { if (!document.hidden) cargar(); });
setInterval(cargar, 5 * 60 * 1000);
