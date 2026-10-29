// Traketímetro.
//   GET    /api/traketimetro?periodo=     → ranking del mes actual (o de otro mes / fecha) + salón
//   POST   /api/admin/traketimetro/fechas → (admin) crear fechas especiales
//   POST   /api/admin/traketimetro/ganador→ (admin) poner el Cubata de Oro a mano
//   POST   /api/traketimetro/add          → { name, tipo, cantidad? } (o multipart con foto opcional "foto")
//   POST   /api/traketimetro/undo         → { name, tipo, cantidad? }
//   POST   /api/traketimetro/set          → { name, cervezas, cubatas, chupitos, porros, cigarros? } (corregir a mano)
//   POST   /api/admin/traketimetro/cigarros → (admin) { modo: 'auto' | 'on' | 'off' } activar/apagar los cigarros
//   DELETE /api/admin/traketimetro/:name  → borrar a alguien del ranking (solo admin: abre traketimetro.html?admin=1)
//   GET    /api/traketimetro/stream       → avisos en directo (SSE)

const $ = (id) => document.getElementById(id);

const IS_ADMIN = new URLSearchParams(location.search).get('admin') === '1';

const TIPOS = {
  cervezas: { emoji: '🍺', etiqueta: 'Cerveza' },
  cubatas: { emoji: '🍹', etiqueta: 'Cubata' },
  chupitos: { emoji: '🥃', etiqueta: 'Chupito' },
  porros: { emoji: '🌿', etiqueta: 'Porro' },
  cigarros: { emoji: '🚬', etiqueta: 'Cigarro' } // solo visible cuando están activados (ver config.cigarros)
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
let historial = [];
let fotoElegida = null; // foto opcional (ya reducida) para el próximo apunte
let config = { cigarros: { activo: false, modo: 'auto', desde: '2026-11-01' } };
const cigarrosActivos = () => Boolean(config.cigarros && config.cigarros.activo);

// Aplica la respuesta del servidor (ranking + lista de periodos + fechas)
function aplicar(data) {
  if (!data) return;
  people = data.people || people;
  totales = data.totales || totales;
  if (data.periodos) periodos = data.periodos;
  if (data.events) fechas = data.events;
  if (data.historial) historial = data.historial;
  if (data.config) config = data.config;
  pintarCigarros();
  actualizarDatalist();
  pintarSelector();
  pintarRanking();
  pintarTotales();
  pintarHistorial();
  pintarAdmin();
}

// Muestra u oculta todo lo de los cigarros (botón, columnas, campo de edición...)
function pintarCigarros() {
  const on = cigarrosActivos();
  document.querySelectorAll('[data-cigarros]').forEach((el) => { el.style.display = on ? '' : 'none'; });
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
      <td class="rk-name"><a href="perfil.html?name=${encodeURIComponent(p.name)}" title="Ver perfil de ${escapeHtml(p.name)}">${escapeHtml(p.name)}</a></td>
      <td>${p.cervezas}</td>
      <td>${p.cubatas}</td>
      <td>${p.chupitos}</td>
      <td>${p.porros}</td>
      ${cigarrosActivos() ? `<td>${p.cigarros || 0}</td>` : ''}
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
      <td class="rk-name"><a href="perfil.html?name=${encodeURIComponent(p.name)}" title="Ver perfil de ${escapeHtml(p.name)}">${escapeHtml(p.name)}</a></td>
      <td>${p.cervezas}</td>
      <td>${p.cubatas}</td>
      <td>${p.chupitos}</td>
      <td>${p.porros}</td>
      ${cigarrosActivos() ? `<td>${p.cigarros || 0}</td>` : ''}
      <td class="rk-total">${p.total}</td>
    </tr>
  `).join('') + `
    <tr>
      <td class="rk-name"><b>TODOS</b></td>
      <td><b>${suma('cervezas')}</b></td>
      <td><b>${suma('cubatas')}</b></td>
      <td><b>${suma('chupitos')}</b></td>
      <td><b>${suma('porros')}</b></td>
      ${cigarrosActivos() ? `<td><b>${suma('cigarros')}</b></td>` : ''}
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
    let opts;
    if (fotoElegida) {
      const fd = new FormData();
      fd.append('name', name);
      fd.append('tipo', tipo);
      fd.append('cantidad', String(cantidad));
      fd.append('periodo', periodo);
      fd.append('foto', fotoElegida, 'foto.jpg');
      opts = { method: 'POST', body: fd };
      decirEstado('Subiendo foto…');
    } else {
      opts = {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ name, tipo, cantidad, periodo })
      };
    }
    const res = await fetch('/api/traketimetro/add', opts);
    const data = await res.json().catch(() => ({}));
    if (!res.ok) throw new Error(data.error || 'No se ha podido apuntar.');

    aplicar(data);

    const conFoto = Boolean(fotoElegida);
    quitarFoto();

    lastAction = { name, tipo, cantidad };
    $('undo').hidden = false;
    const base = `${t.emoji} +${cantidad} ${t.etiqueta.toLowerCase()}${cantidad > 1 ? 's' : ''} para ${name}`;
    if (data.fotoFallo) decirEstado(`${base} (pero la foto no se ha podido guardar 😕)`, 'err');
    else decirEstado(conFoto ? `${base} 📷` : base, 'ok');
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

// ---------- Foto opcional ----------
// Se reduce en el móvil antes de subirla (más rápido con datos). El servidor
// además le quita la ubicación GPS y la guarda en la web y en Cloudinary.
async function reducirFoto(file) {
  try {
    const bmp = await createImageBitmap(file, { imageOrientation: 'from-image' });
    const max = 1600;
    const k = Math.min(1, max / Math.max(bmp.width, bmp.height));
    const canvas = document.createElement('canvas');
    canvas.width = Math.round(bmp.width * k);
    canvas.height = Math.round(bmp.height * k);
    const ctx = canvas.getContext('2d');
    ctx.fillStyle = '#fff';
    ctx.fillRect(0, 0, canvas.width, canvas.height);
    ctx.drawImage(bmp, 0, 0, canvas.width, canvas.height);
    const blob = await new Promise((ok) => canvas.toBlob(ok, 'image/jpeg', 0.85));
    return blob || file;
  } catch {
    return file; // si el navegador no puede reducirla, se manda tal cual
  }
}

function quitarFoto() {
  fotoElegida = null;
  $('foto').value = '';
  $('fotoCam').value = '';
  const prev = $('fotoPreview');
  if (prev.src.startsWith('blob:')) URL.revokeObjectURL(prev.src);
  prev.removeAttribute('src');
  prev.hidden = true;
  $('fotoQuitar').hidden = true;
}

// Dos entradas: la cámara (en el móvil abre la cámara directamente, gracias a
// capture="environment") y la galería. Las dos pasan por el mismo manejador.
$('fotoCamBtn').addEventListener('click', () => $('fotoCam').click());
$('fotoBtn').addEventListener('click', () => $('foto').click());
$('fotoQuitar').addEventListener('click', quitarFoto);

async function fotoSeleccionada(input) {
  const f = input.files[0];
  if (!f) return;
  const reducida = await reducirFoto(f);
  if (reducida.size > 12 * 1024 * 1024) {
    quitarFoto();
    decirEstado('La foto pesa demasiado (máximo 12 MB).', 'err');
    return;
  }
  fotoElegida = reducida;
  const prev = $('fotoPreview');
  if (prev.src.startsWith('blob:')) URL.revokeObjectURL(prev.src);
  prev.src = URL.createObjectURL(reducida);
  prev.hidden = false;
  $('fotoQuitar').hidden = false;
  decirEstado('');
}
$('foto').addEventListener('change', () => fotoSeleccionada($('foto')));
$('fotoCam').addEventListener('change', () => fotoSeleccionada($('fotoCam')));

// ---------- Historial (día y hora de Madrid) ----------
const fmtDia = new Intl.DateTimeFormat('es-ES', {
  timeZone: 'Europe/Madrid', weekday: 'long', day: '2-digit', month: '2-digit', year: 'numeric'
});
const fmtHora = new Intl.DateTimeFormat('es-ES', {
  timeZone: 'Europe/Madrid', hour: '2-digit', minute: '2-digit', hour12: false
});

function textoFecha(ts) {
  const d = new Date(ts);
  const dia = fmtDia.format(d).replace(',', '');
  return { dia: dia.charAt(0).toUpperCase() + dia.slice(1), hora: fmtHora.format(d) };
}

function pintarHistorial() {
  const ul = $('historialList');
  const vacio = $('historialVacio');
  if (!ul) return;

  if (!historial.length) {
    ul.innerHTML = '';
    vacio.hidden = false;
    return;
  }
  vacio.hidden = true;

  ul.innerHTML = historial.map((h) => {
    const t = TIPOS[h.tipo] || { emoji: '🍻', etiqueta: h.tipo };
    const f = textoFecha(h.ts);
    const plural = h.cantidad > 1 ? 's' : '';
    const foto = h.foto
      ? `<button class="hist-foto" type="button" data-foto="${escapeHtml(h.foto.url)}" data-cap="${escapeHtml(h.name + ' · ' + f.dia + ' ' + f.hora)}" aria-label="Ver foto de ${escapeHtml(h.name)}"><img src="${escapeHtml(h.foto.thumb)}" alt="" loading="lazy"></button>`
      : '';
    return `
      <li class="hist-item">
        <span class="hist-emoji">${t.emoji}</span>
        <div class="hist-info">
          <b>${escapeHtml(h.name)}</b> · +${h.cantidad} ${escapeHtml(t.etiqueta.toLowerCase())}${plural}
          <small>🕒 ${escapeHtml(f.dia)} · ${escapeHtml(f.hora)}</small>
        </div>
        ${foto}
      </li>`;
  }).join('');
}

const fotoDialog = $('fotoDialog');
$('historialList').addEventListener('click', (e) => {
  const b = e.target.closest('[data-foto]');
  if (!b) return;
  $('fotoGrande').src = b.dataset.foto;
  $('fotoCap').textContent = b.dataset.cap || '';
  if (!fotoDialog.open) fotoDialog.showModal();
});
$('fotoCerrar').addEventListener('click', () => fotoDialog.close());
fotoDialog.addEventListener('click', (e) => { if (e.target === fotoDialog) fotoDialog.close(); });
fotoDialog.addEventListener('close', () => { $('fotoGrande').removeAttribute('src'); });

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
  $('editCigarros').value = p.cigarros || 0;
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
  // Con los cigarros apagados no se manda el campo: el servidor conserva lo que hubiera
  if (cigarrosActivos()) body.cigarros = numeroEditor('editCigarros');

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

  const modoSel = $('cigarrosModo');
  if (modoSel && document.activeElement !== modoSel) modoSel.value = config.cigarros.modo;
  const cEstado = $('cigarrosEstado');
  if (cEstado) {
    cEstado.textContent = cigarrosActivos()
      ? '🚬 Ahora mismo los cigarros están ACTIVADOS (cuentan 1 punto y salen en ranking, perfiles, Salón de la Fama, Cubata de Oro y TKT365).'
      : `🚬 Ahora mismo los cigarros están DESACTIVADOS. En modo automático se activan el ${formatoFecha(config.cigarros.desde)}.`;
  }

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

  $('cigarrosSave').addEventListener('click', async () => {
    try {
      const data = await llamarAdmin('/api/admin/traketimetro/cigarros', 'POST', { modo: $('cigarrosModo').value });
      aplicar(data);
      msgAdmin('cigarrosMsg', 'Guardado 🚬', 'ok');
    } catch (err) {
      msgAdmin('cigarrosMsg', err.message, 'err');
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
