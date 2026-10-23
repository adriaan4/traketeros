// TKT365 (web pública). Todo lo importante (saldo, cuotas, premios, resultados)
// lo decide el servidor; aquí solo se muestra y se manda lo que elige la persona.
// Las personas son las del Trakímetro: se reutiliza el nombre guardado allí ("trake-name").

const $ = (id) => document.getElementById(id);
const esc = (s) =>
  String(s ?? '').replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));

const store = {
  get(k) { try { return localStorage.getItem(k) || ''; } catch { return ''; } },
  set(k, v) { try { localStorage.setItem(k, v); } catch { /* sin almacenamiento: no pasa nada */ } }
};

// Identificador anónimo de este dispositivo. El servidor liga UN nombre a este token.
function tokenDispositivo() {
  let t = store.get('tkt-token');
  if (!/^[a-f0-9]{32}$/.test(t)) {
    const b = new Uint8Array(16);
    crypto.getRandomValues(b);
    t = [...b].map((x) => x.toString(16).padStart(2, '0')).join('');
    store.set('tkt-token', t);
  }
  return t;
}
const TOKEN = tokenDispositivo();

const nf = new Intl.NumberFormat('es-ES', { useGrouping: 'always', maximumFractionDigits: 0 });
const tkt = (n) => nf.format(Math.round(n || 0));
const cuotaTxt = (n) => 'x' + Number(n || 0).toFixed(2);
const round2 = (n) => Math.round(n * 100) / 100;

const fechaFmt = new Intl.DateTimeFormat('es-ES', {
  timeZone: 'Europe/Madrid', weekday: 'short', day: '2-digit', month: '2-digit', hour: '2-digit', minute: '2-digit'
});

const state = {
  users: [],
  markets: [],
  config: { apuestaMin: 10, apuestaMax: 5000, maxSelecciones: 8 },
  skew: 0,            // diferencia entre el reloj del servidor y el del navegador
  user: '',           // id (nombre en minúsculas) de quien apuesta
  balance: null,
  sel: new Map(),     // marketId -> optionId (el cupón)
  tab: 'mercados',
  enviando: false
};

async function api(url, opts) {
  let res;
  try {
    res = await fetch(url, opts);
  } catch {
    throw new Error('Sin conexión con el servidor.');
  }
  let data = {};
  try { data = await res.json(); } catch { /* sin cuerpo */ }
  if (!res.ok) {
    const e = new Error(data.error || 'Ha pasado algo raro. Inténtalo otra vez.');
    e.data = data;
    throw e;
  }
  return data;
}

const ahora = () => Date.now() + state.skew;

// ---------- Carga ----------
async function cargarMercados() {
  const d = await api('/api/tkt365/markets?token=' + TOKEN);
  state.skew = d.now - Date.now();
  state.users = d.users;
  state.markets = d.markets;
  state.config = d.config;
  const previo = state.user;
  state.user = d.yo || ''; // el servidor manda: si el admin libera el nombre, aquí se desbloquea
  if (state.user !== previo) {
    state.balance = null;
    $('apuestas').innerHTML = '';
    cargarYo();
    if (state.tab === 'apuestas') cargarApuestas();
  }
  conciliarCupon();
  pintarUsuarios();
  pintarMercados();
  pintarCupon();
}

async function cargarYo() {
  if (!state.user) { state.balance = null; pintarSaldo(); return; }
  try {
    const d = await api('/api/tkt365/me?user=' + encodeURIComponent(state.user));
    pintarSaldo(d.balance);
  } catch {
    state.balance = null;
    pintarSaldo();
  }
}

async function cargarApuestas() {
  const box = $('apuestas');
  if (!state.user) { box.innerHTML = '<div class="tkt-vacio">Elige quién eres arriba para ver tus apuestas.</div>'; return; }
  try {
    const d = await api('/api/tkt365/my-bets?token=' + TOKEN);
    pintarApuestas(d.bets);
  } catch (e) {
    box.innerHTML = '<div class="tkt-vacio">' + esc(e.message) + '</div>';
  }
}

async function cargarRanking() {
  try {
    const d = await api('/api/tkt365/ranking');
    $('ranking').innerHTML = d.ranking.map((r, i) => {
      const bn = r.beneficio > 0 ? 'tkt-pos-bn' : (r.beneficio < 0 ? 'tkt-neg' : '');
      return `<tr class="${r.id === state.user ? 'yo' : ''}">` +
        `<td><span class="tkt-pos tkt-pos-${i + 1}">${i + 1}</span></td>` +
        `<td><b>${esc(r.name)}</b>${r.active ? '' : ' <small>(fuera del Trakímetro)</small>'}</td>` +
        `<td><b>${tkt(r.balance)}</b></td><td>${r.ganadas}</td><td>${r.perdidas}</td><td>${tkt(r.apostado)}</td>` +
        `<td class="${bn}">${r.beneficio > 0 ? '+' : ''}${tkt(r.beneficio)}</td></tr>`;
    }).join('') || '<tr><td colspan="7">Todavía no hay nadie.</td></tr>';
  } catch (e) {
    $('ranking').innerHTML = '<tr><td colspan="7">' + esc(e.message) + '</td></tr>';
  }
}

// ---------- Apuntarse solo para apostar (sin Trakímetro) ----------
$('join').addEventListener('submit', async (e) => {
  e.preventDefault();
  if (state.user) return;
  const name = $('joinName').value.replace(/\s+/g, ' ').trim();
  const msg = (t, k) => { const el = $('joinMsg'); el.textContent = t || ''; el.className = 'tkt-msg' + (k ? ' ' + k : ''); };
  if (name.length < 2) return msg('Escribe un nombre de al menos 2 letras.');
  if (!confirm(`¿Apuntarte como «${name}»?\n\nUna vez hecho no podrás cambiarlo: solo el admin puede corregirlo.`)) return;
  $('joinBtn').disabled = true;
  msg('');
  try {
    const d = await api('/api/tkt365/join', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ token: TOKEN, name })
    });
    state.user = d.user;
    $('joinName').value = '';
    await cargarMercados();
    await cargarYo();
    mensaje('¡Apuntado! Ya puedes apostar 🎉', 'ok');
  } catch (err) {
    msg(err.message);
    if (err.data?.existe) cargarMercados().catch(() => {});
  } finally {
    $('joinBtn').disabled = false;
  }
});

// ---------- Identidad (la del Trakímetro, bloqueada tras elegir) ----------
function pintarUsuarios() {
  const sel = $('quien');
  const propio = state.users.find((u) => u.id === state.user);
  if (propio) {
    sel.innerHTML = `<option value="${esc(propio.id)}">🔒 ${esc(propio.name)}</option>`;
    sel.value = propio.id;
    sel.disabled = true;
    $('join').hidden = true;
    $('nota').innerHTML = 'Tu nombre está <b>bloqueado</b> en este dispositivo. ¿Te equivocaste? Díselo al admin y te lo cambia.';
    $('walletName').textContent = propio.name;
  } else {
    sel.disabled = false;
    $('join').hidden = false;
    sel.innerHTML = '<option value="">— Elige tu nombre —</option>' +
      state.users.map((u) => `<option value="${esc(u.id)}"${u.taken ? ' disabled' : ''}>${esc(u.name)}${u.taken ? ' (ya elegido)' : ''}</option>`).join('');
    sel.value = '';
    $('nota').innerHTML = 'Elige tu nombre. Una vez elegido queda <b>bloqueado</b> en este dispositivo: si te equivocas, díselo al admin.';
    $('walletName').textContent = 'Sin nombre';
  }
}

$('quien').addEventListener('change', async () => {
  const id = $('quien').value;
  if (!id || state.user) return;
  const u = state.users.find((x) => x.id === id);
  if (!u) return;
  if (!confirm(`¿Eres ${u.name}?\n\nUna vez elegido no podrás cambiarlo: solo el admin puede corregirlo.`)) {
    $('quien').value = '';
    return;
  }
  try {
    await api('/api/tkt365/claim', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ user: id, token: TOKEN })
    });
    state.user = id;
    store.set('trake-name', u.name); // el mismo nombre que usa el Trakímetro
    mensaje('');
    pintarUsuarios();
    cargarYo();
    if (state.tab === 'apuestas') cargarApuestas();
    if (state.tab === 'ranking') cargarRanking();
    pintarCupon();
  } catch (e) {
    $('quien').value = '';
    mensaje(e.message, 'err');
    cargarMercados().catch(() => {});
  }
});

function pintarSaldo(nuevo) {
  const el = $('saldo');
  if (nuevo === undefined) {
    el.textContent = state.user && state.balance !== null ? tkt(state.balance) + ' TKT' : '—';
    return;
  }
  const sube = state.balance !== null && nuevo > state.balance;
  state.balance = nuevo;
  el.textContent = tkt(nuevo) + ' TKT';
  if (sube) { el.classList.remove('sube'); void el.offsetWidth; el.classList.add('sube'); }
  pintarCupon();
}

// ---------- Mercados ----------
function cierreTxt(m) {
  const ms = m.cierra - ahora();
  const fecha = fechaFmt.format(new Date(m.cierra));
  if (m.estado !== 'abierto') return 'Cerró ' + fecha;
  let resto = '';
  if (ms > 0) {
    const min = Math.floor(ms / 60000);
    if (min < 60) resto = ` · <b>en ${Math.max(1, min)} min</b>`;
    else if (min < 48 * 60) resto = ` · <b>en ${Math.floor(min / 60)} h ${min % 60} min</b>`;
  }
  return 'Cierra ' + esc(fecha) + resto;
}

function tarjeta(m) {
  const abierto = m.estado === 'abierto' && m.cierra > ahora();
  const elegido = state.sel.get(m.id);
  const opts = m.options.map((o) => {
    const gan = m.estado === 'resuelto' && m.ganadores.includes(o.id);
    const cls = 'tkt-odd' + (elegido === o.id ? ' sel' : '') + (gan ? ' ganadora' : '');
    return `<button type="button" class="${cls}" data-m="${esc(m.id)}" data-o="${esc(o.id)}"${abierto ? '' : ' disabled'} ` +
      `aria-pressed="${elegido === o.id}"><span class="nm">${esc(o.label)}</span><span class="qt">${cuotaTxt(o.odds)}</span></button>`;
  }).join('');
  let pie;
  if (m.estado === 'cancelado') pie = '<div class="tkt-cierre">Mercado cancelado: se devuelven los TKT.' + (m.motivoCancelacion ? ' ' + esc(m.motivoCancelacion) : '') + '</div>';
  else if (m.estado === 'resuelto') pie = '<div class="tkt-cierre">Resuelto' + (m.resolucion?.por === 'auto' ? ' automáticamente con los datos del Trakímetro' : '') + '.</div>';
  else if (m.estado === 'cerrado') pie = '<div class="tkt-cierre">Cerrado: esperando el resultado.</div>';
  else pie = `<div class="tkt-cierre">${cierreTxt(m)}</div>`;
  return `<article class="tkt-card ${esc(m.estado)}">` +
    `<h3>${esc(m.titulo)}</h3>` +
    `<div class="tkt-meta">${m.evento ? `<span>${esc(m.evento)}</span>` : ''}<span>${esc(m.categoria)}</span><span class="tk">${esc(m.fuente)}</span></div>` +
    (m.descripcion ? `<p>${esc(m.descripcion)}</p>` : '') +
    `<div class="tkt-opts">${opts}</div>${pie}</article>`;
}

function grupos(lista) {
  const out = new Map();
  for (const m of lista) {
    const k = m.ventana?.label || m.evento || '';
    if (!out.has(k)) out.set(k, []);
    out.get(k).push(m);
  }
  return out;
}

function pintarMercados() {
  const t = ahora();
  const abiertos = state.markets.filter((m) => m.estado === 'abierto' && m.cierra > t);
  const actuales = abiertos.filter((m) => !m.proximo);
  const proximos = abiertos.filter((m) => m.proximo);
  const resto = state.markets.filter((m) => !(m.estado === 'abierto' && m.cierra > t)).sort((a, b) => b.cierra - a.cierra);

  let html = '';
  html += '<h2 class="tkt-sec-title">🔥 MERCADOS ABIERTOS</h2>';
  html += actuales.length
    ? `<div class="tkt-mercados">${actuales.map(tarjeta).join('')}</div>`
    : '<div class="tkt-vacio">Ahora mismo no hay mercados abiertos. Mira los próximos 👇</div>';

  html += '<h2 class="tkt-sec-title">🔥 PRÓXIMOS MERCADOS</h2>';
  if (proximos.length) {
    for (const [nombre, lista] of grupos(proximos)) {
      html += `<div class="tkt-grupo">${esc(nombre || 'Próximamente')}</div><div class="tkt-mercados">${lista.map(tarjeta).join('')}</div>`;
    }
  } else {
    html += '<div class="tkt-vacio">Aún no hay fechas especiales próximas en el Trakímetro.</div>';
  }

  if (resto.length) {
    html += '<h2 class="tkt-sec-title">🔒 CERRADOS Y RESUELTOS</h2>';
    html += `<div class="tkt-mercados">${resto.slice(0, 18).map(tarjeta).join('')}</div>`;
  }
  $('mercados').innerHTML = html;
}

// El cupón se queda solo con selecciones que siguen siendo válidas
function conciliarCupon() {
  const t = ahora();
  let quitadas = 0;
  for (const [mid, oid] of [...state.sel]) {
    const m = state.markets.find((x) => x.id === mid);
    if (!m || m.estado !== 'abierto' || m.cierra <= t || !m.options.some((o) => o.id === oid)) {
      state.sel.delete(mid);
      quitadas++;
    }
  }
  if (quitadas) mensaje('Se han quitado del cupón selecciones de mercados que ya han cerrado.', 'err');
}

$('mercados').addEventListener('click', (e) => {
  const b = e.target.closest('button.tkt-odd');
  if (!b || b.disabled) return;
  const mid = b.dataset.m;
  const oid = b.dataset.o;
  if (state.sel.get(mid) === oid) {
    state.sel.delete(mid);
  } else {
    if (!state.sel.has(mid) && state.sel.size >= state.config.maxSelecciones) {
      mensaje(`Máximo ${state.config.maxSelecciones} selecciones por combinada.`, 'err');
      return;
    }
    state.sel.set(mid, oid); // una opción por mercado
  }
  mensaje('');
  pintarMercados();
  pintarCupon();
});

// ---------- Cupón ----------
function seleccionesActuales() {
  const out = [];
  for (const [mid, oid] of state.sel) {
    const m = state.markets.find((x) => x.id === mid);
    const o = m?.options.find((x) => x.id === oid);
    if (m && o) out.push({ m, o });
  }
  return out;
}

const cuotaTotal = (sels) => round2(sels.reduce((p, s) => p * s.o.odds, 1));
const stakeActual = () => {
  const n = Math.floor(Number($('stake').value));
  return Number.isFinite(n) && n > 0 ? n : 0;
};

function pintarCupon() {
  const sels = seleccionesActuales();
  const total = sels.length ? cuotaTotal(sels) : 1;
  $('sels').innerHTML = sels.map(({ m, o }) =>
    `<li><span class="sn">${esc(o.label)}</span><span class="sq">${cuotaTxt(o.odds)}</span>` +
    `<button class="sx" type="button" data-q="${esc(m.id)}" aria-label="Quitar ${esc(o.label)}">×</button>` +
    `<span class="sm">${esc(m.titulo)}</span></li>`).join('');
  $('cuponVacio').hidden = sels.length > 0;
  $('limpiar').hidden = sels.length === 0;
  $('cuponTipo').textContent = sels.length === 0 ? 'VACÍO' : (sels.length === 1 ? 'SIMPLE' : 'COMBINADA ×' + sels.length);
  $('cuotaTotal').textContent = cuotaTxt(total);
  $('barN').textContent = sels.length;
  $('barQ').textContent = cuotaTxt(total);
  const stake = stakeActual();
  $('premio').textContent = tkt(Math.floor(stake * total + 1e-9)) + ' TKT';
  $('apostar').disabled = state.enviando || !sels.length || stake < state.config.apuestaMin || !state.user;
  $('apostar').textContent = state.enviando ? 'ENVIANDO…' : (state.user ? 'HACER APUESTA' : 'ELIGE QUIÉN ERES');
}

function mensaje(txt, kind) {
  const el = $('msg');
  el.textContent = txt || '';
  el.className = 'tkt-msg' + (kind ? ' ' + kind : '');
}

$('sels').addEventListener('click', (e) => {
  const b = e.target.closest('button[data-q]');
  if (!b) return;
  state.sel.delete(b.dataset.q);
  pintarMercados();
  pintarCupon();
});
$('limpiar').addEventListener('click', () => { state.sel.clear(); mensaje(''); pintarMercados(); pintarCupon(); });
$('stake').addEventListener('input', pintarCupon);
document.querySelector('.tkt-rapidas').addEventListener('click', (e) => {
  const b = e.target.closest('button');
  if (!b) return;
  if (b.dataset.max) {
    const tope = Math.min(state.config.apuestaMax, state.balance ?? state.config.apuestaMax);
    $('stake').value = Math.max(0, tope);
  } else {
    $('stake').value = Math.min(state.config.apuestaMax, stakeActual() + Number(b.dataset.add));
  }
  pintarCupon();
});
$('cuponBar').addEventListener('click', () => $('cupon').classList.toggle('abierto'));

$('apostar').addEventListener('click', async () => {
  const sels = seleccionesActuales();
  const stake = stakeActual();
  if (!sels.length || !state.user || state.enviando) return;
  if (stake < state.config.apuestaMin) { mensaje(`La apuesta mínima es de ${state.config.apuestaMin} TKT.`, 'err'); return; }
  if (state.balance !== null && stake > state.balance) { mensaje('No tienes saldo suficiente.', 'err'); return; }

  state.enviando = true;
  pintarCupon();
  mensaje('');
  try {
    const d = await api(sels.length === 1 ? '/api/tkt365/bets' : '/api/tkt365/combination', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        token: TOKEN,
        stake,
        expectedOdds: cuotaTotal(sels), // solo para avisar si las cuotas han cambiado: la cuota real la pone el servidor
        selections: sels.map(({ m, o }) => ({ marketId: m.id, optionId: o.id }))
      })
    });
    state.sel.clear();
    pintarSaldo(d.balance);
    mensaje(`¡Apuesta hecha! Posible premio: ${tkt(d.bet.premioPosible)} TKT 🎉`, 'ok');
    cargarMercados().catch(() => {});
  } catch (e) {
    mensaje(e.message, 'err');
    if (e.data?.refrescar || e.data?.identidad) cargarMercados().catch(() => {});
  } finally {
    state.enviando = false;
    pintarMercados();
    pintarCupon();
  }
});

// ---------- Mis apuestas ----------
const EST = { pendiente: '🟡 Pendiente', ganada: '🟢 Ganada', perdida: '🔴 Perdida', cancelada: '⚪ Cancelada' };
const RES = { pendiente: '🟡', ganada: '🟢', perdida: '🔴', anulada: '⚪' };

function pintarApuestas(bets) {
  const box = $('apuestas');
  if (!bets.length) { box.innerHTML = '<div class="tkt-vacio">Todavía no has apostado nada. ¡Anímate!</div>'; return; }
  box.innerHTML = bets.map((b) => {
    const fecha = new Intl.DateTimeFormat('es-ES', { timeZone: 'Europe/Madrid', day: '2-digit', month: '2-digit', year: 'numeric', hour: '2-digit', minute: '2-digit' }).format(new Date(b.ts));
    const premio = b.estado === 'ganada' ? `<span>Cobrado: <b>${tkt(b.premio)} TKT</b></span>`
      : b.estado === 'cancelada' ? `<span>Devuelto: <b>${tkt(b.premio)} TKT</b></span>` : '';
    return `<article class="tkt-ap"><div class="tkt-ap-head"><span>${b.tipo === 'combinada' ? '🎟️ Combinada' : '🎯 Simple'} <small>· ${esc(fecha)}</small></span>` +
      `<span class="tkt-est ${esc(b.estado)}">${EST[b.estado] || esc(b.estado)}</span></div>` +
      `<ul>${b.legs.map((l) => `<li><span>${RES[l.resultado] || '🟡'} <b>${esc(l.opcion)}</b> · ${esc(l.mercado)}</span><span>${cuotaTxt(l.odds)}</span></li>`).join('')}</ul>` +
      `<div class="tkt-ap-nums"><span>Apostado: <b>${tkt(b.stake)} TKT</b></span><span>Cuota: <b>${cuotaTxt(b.cuota)}</b></span>` +
      `<span>Premio posible: <b>${tkt(b.premioPosible)} TKT</b></span>${premio}</div></article>`;
  }).join('');
}

// ---------- Pestañas ----------
function irA(tab) {
  state.tab = tab;
  document.querySelectorAll('.tkt-tabs button').forEach((b) => b.setAttribute('aria-selected', String(b.dataset.tab === tab)));
  $('vistaMercados').hidden = tab !== 'mercados';
  $('vistaApuestas').hidden = tab !== 'apuestas';
  $('vistaRanking').hidden = tab !== 'ranking';
  $('cupon').style.display = tab === 'mercados' ? '' : 'none';
  if (tab === 'apuestas') cargarApuestas();
  if (tab === 'ranking') cargarRanking();
}
document.querySelector('.tkt-tabs').addEventListener('click', (e) => {
  const b = e.target.closest('button[data-tab]');
  if (b) irA(b.dataset.tab);
});

// ---------- Arranque y refresco ----------
async function refrescar() {
  try {
    await cargarMercados();
    await cargarYo();
    if (state.tab === 'apuestas') cargarApuestas();
    if (state.tab === 'ranking') cargarRanking();
  } catch (e) {
    if (!state.markets.length) $('mercados').innerHTML = '<div class="tkt-vacio">' + esc(e.message) + '</div>';
  }
}

refrescar();
setInterval(() => { if (!document.hidden) refrescar(); }, 20000);
setInterval(() => { if (!document.hidden && state.tab === 'mercados') pintarMercados(); }, 30000);
document.addEventListener('visibilitychange', () => { if (!document.hidden) refrescar(); });
