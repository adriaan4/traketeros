// TKT365 (web pública). Todo lo importante (saldo, cuotas, premios, resultados)
// lo decide el servidor; aquí solo se muestra y se manda lo que elige la persona.
// Las personas son las del Traketímetro: se reutiliza el nombre guardado allí ("trake-name").

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
  abiertas: new Set(), // mercados con todas las opciones desplegadas
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
        `<td><b>${esc(r.name)}</b>${r.active ? '' : ' <small>(fuera del Traketímetro)</small>'}</td>` +
        `<td><b>${tkt(r.balance)}</b></td><td>${r.ganadas}</td><td>${r.perdidas}</td><td>${tkt(r.apostado)}</td>` +
        `<td class="${bn}">${r.beneficio > 0 ? '+' : ''}${tkt(r.beneficio)}</td></tr>`;
    }).join('') || '<tr><td colspan="7">Todavía no hay nadie.</td></tr>';
  } catch (e) {
    $('ranking').innerHTML = '<tr><td colspan="7">' + esc(e.message) + '</td></tr>';
  }
}

// ---------- Apuntarse solo para apostar (sin Traketímetro) ----------
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

// ---------- Identidad (la del Traketímetro, bloqueada tras elegir) ----------
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
    store.set('trake-name', u.name); // el mismo nombre que usa el Traketímetro
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

const OPCIONES_VISIBLES = 4;

function tarjeta(m) {
  const abierto = m.estado === 'abierto' && m.cierra > ahora();
  const elegido = state.sel.get(m.id);
  // Se ven las 4 primeras (las favoritas); el resto, tras «Ver más». Lo elegido y lo ganador siempre se ven.
  const desplegado = state.abiertas.has(m.id);
  const visibles = (o, i) => desplegado || i < OPCIONES_VISIBLES || o.id === elegido || (m.estado === 'resuelto' && m.ganadores.includes(o.id));
  const ocultas = m.options.filter((o, i) => !visibles(o, i)).length;
  const opts = m.options.filter(visibles).map((o) => {
    const gan = m.estado === 'resuelto' && m.ganadores.includes(o.id);
    const cls = 'tkt-odd' + (elegido === o.id ? ' sel' : '') + (gan ? ' ganadora' : '');
    return `<button type="button" class="${cls}" data-m="${esc(m.id)}" data-o="${esc(o.id)}"${abierto ? '' : ' disabled'} ` +
      `aria-pressed="${elegido === o.id}"><span class="nm">${esc(o.label)}</span><span class="qt">${cuotaTxt(o.odds)}</span></button>`;
  }).join('');
  const mas = ocultas > 0
    ? `<button type="button" class="tkt-mas" data-mas="${esc(m.id)}">Ver ${ocultas} más ▾</button>`
    : (desplegado && m.options.length > OPCIONES_VISIBLES ? `<button type="button" class="tkt-mas" data-mas="${esc(m.id)}">Ver menos ▴</button>` : '');
  let pie;
  if (m.estado === 'cancelado') pie = '<div class="tkt-cierre">Cancelado: se devuelven los TKT.' + (m.motivoCancelacion ? ' ' + esc(m.motivoCancelacion) : '') + '</div>';
  else if (m.estado === 'resuelto') pie = '<div class="tkt-cierre">Resuelto.</div>';
  else if (m.estado === 'cerrado') pie = '<div class="tkt-cierre">Cerrado: esperando resultado.</div>';
  else pie = `<div class="tkt-cierre">${cierreTxt(m)}</div>`;
  // La descripción larga solo se enseña en las apuestas que ha puesto el admin a mano
  const desc = m.descripcion && m.fuente !== 'Traketímetro' ? `<p>${esc(m.descripcion)}</p>` : '';
  return `<article class="tkt-card ${esc(m.estado)}">` +
    `<h3>${esc(m.titulo)}</h3>${desc}` +
    `<div class="tkt-opts">${opts}${mas}</div>${pie}</article>`;
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
  html += '<h2 class="tkt-sec-title">🔥 APUESTAS ABIERTAS</h2>';
  html += actuales.length
    ? `<div class="tkt-mercados">${actuales.map(tarjeta).join('')}</div>`
    : '<div class="tkt-vacio">Ahora no hay apuestas abiertas. Mira las próximas 👇</div>';

  html += '<h2 class="tkt-sec-title">⏭️ PRÓXIMAS</h2>';
  if (proximos.length) {
    for (const [nombre, lista] of grupos(proximos)) {
      html += `<div class="tkt-grupo">${esc(nombre || 'Próximamente')}</div><div class="tkt-mercados">${lista.map(tarjeta).join('')}</div>`;
    }
  } else {
    html += '<div class="tkt-vacio">Aún no hay fechas especiales próximas en el Traketímetro.</div>';
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
  const mas = e.target.closest('button.tkt-mas');
  if (mas) {
    const id = mas.dataset.mas;
    if (state.abiertas.has(id)) state.abiertas.delete(id); else state.abiertas.add(id);
    pintarMercados();
    return;
  }
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
    mostrarResguardo(d.bet).catch(() => {});
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
  state.misApuestas = bets;
  if (!bets.length) { box.innerHTML = '<div class="tkt-vacio">Todavía no has apostado nada. ¡Anímate!</div>'; return; }
  box.innerHTML = bets.map((b) => {
    const fecha = new Intl.DateTimeFormat('es-ES', { timeZone: 'Europe/Madrid', day: '2-digit', month: '2-digit', year: 'numeric', hour: '2-digit', minute: '2-digit' }).format(new Date(b.ts));
    const premio = b.estado === 'ganada' ? `<span>Cobrado: <b>${tkt(b.premio)} TKT</b></span>`
      : b.estado === 'cancelada' ? `<span>Devuelto: <b>${tkt(b.premio)} TKT</b></span>` : '';
    return `<article class="tkt-ap"><div class="tkt-ap-head"><span>${b.tipo === 'combinada' ? '🎟️ Combinada' : '🎯 Simple'} <small>· ${esc(fecha)}</small></span>` +
      `<span class="tkt-ap-der"><span class="tkt-est ${esc(b.estado)}">${EST[b.estado] || esc(b.estado)}</span>` +
      `<button type="button" class="tkt-compartir" data-share="${esc(b.id)}">📤 Compartir</button></span></div>` +
      `<ul>${b.legs.map((l) => `<li><span>${RES[l.resultado] || '🟡'} <b>${esc(l.opcion)}</b> · ${esc(l.mercado)}</span><span>${cuotaTxt(l.odds)}</span></li>`).join('')}</ul>` +
      `<div class="tkt-ap-nums"><span>Apostado: <b>${tkt(b.stake)} TKT</b></span><span>Cuota: <b>${cuotaTxt(b.cuota)}</b></span>` +
      `<span>Premio posible: <b>${tkt(b.premioPosible)} TKT</b></span>${premio}</div></article>`;
  }).join('');
}

// ---------- Compartir una apuesta como imagen ----------
const IMG = { rosa: '#ff2596', azul: '#00a8e6', negro: '#1a0018', crema: '#fff3fa' };
const IMG_ESTADO = {
  pendiente: ['PENDIENTE', '#fff1a8'], ganada: ['GANADA', '#b7f0c1'],
  perdida: ['PERDIDA', '#ffc9c9'], cancelada: ['CANCELADA', '#e6e6e6']
};
const IMG_PUNTO = { ganada: '#22a84a', perdida: '#e03131', anulada: '#9a9a9a', pendiente: '#f2b705' };

function envolver(ctx, texto, ancho) {
  const out = [];
  let linea = '';
  for (const palabra of String(texto).split(' ')) {
    const prueba = linea ? linea + ' ' + palabra : palabra;
    if (linea && ctx.measureText(prueba).width > ancho) { out.push(linea); linea = palabra; } else linea = prueba;
  }
  if (linea) out.push(linea);
  return out;
}

// Bangers dibuja el 1 casi igual que el 7: al 1 se le añade una base para que se distinga
function textoBangers(ctx, texto, cx, y, tam) {
  ctx.font = tam + 'px Bangers, Impact, sans-serif';
  const prevAlign = ctx.textAlign;
  ctx.textAlign = 'left';
  const anchos = [...texto].map((ch) => ctx.measureText(ch).width);
  let x = cx - anchos.reduce((a, b) => a + b, 0) / 2;
  [...texto].forEach((ch, i) => {
    ctx.fillText(ch, x, y);
    if (ch === '1') {
      const bw = anchos[i] * 0.78, bh = Math.max(4, tam * 0.1);
      ctx.fillRect(x + (anchos[i] - bw) / 2 - tam * 0.02, y - bh, bw, bh);
    }
    x += anchos[i];
  });
  ctx.textAlign = prevAlign;
}

// Dibuja la apuesta y devuelve la altura total que ocupa
function dibujarApuesta(ctx, W, b, nombre) {
  const M = 40, P = 44, X = M + P, ANCHO = W - 2 * M - 2 * P;
  const fecha = new Intl.DateTimeFormat('es-ES', { timeZone: 'Europe/Madrid', day: '2-digit', month: '2-digit', year: 'numeric', hour: '2-digit', minute: '2-digit' }).format(new Date(b.ts));
  let y = M;

  // Cabecera negra
  const cabY = y + 4, cabH = 150;
  ctx.fillStyle = IMG.negro; ctx.fillRect(M, cabY, W - 2 * M, cabH);
  ctx.textBaseline = 'alphabetic'; ctx.textAlign = 'left';
  ctx.font = '104px Bangers, Impact, sans-serif';
  ctx.fillStyle = '#fff'; ctx.fillText('TKT', X, cabY + 112);
  const wTkt = ctx.measureText('TKT').width;
  ctx.fillStyle = IMG.rosa; ctx.fillText('365', X + wTkt, cabY + 112);
  ctx.textAlign = 'right'; ctx.font = '900 26px Inter, Arial, sans-serif'; ctx.fillStyle = IMG.azul;
  ctx.fillText('LA CASA DE APUESTAS', W - M - P, cabY + 70);
  ctx.fillStyle = '#fff'; ctx.fillText('DE LOS TRAKETEROS', W - M - P, cabY + 104);
  y = cabY + cabH + 44;

  // Quién y cuándo + estado
  const [txtEst, colEst] = IMG_ESTADO[b.estado] || [String(b.estado).toUpperCase(), '#eee'];
  ctx.textAlign = 'left'; ctx.fillStyle = IMG.negro;
  ctx.font = '900 46px Inter, Arial, sans-serif';
  ctx.fillText(nombre || 'Apuesta', X, y + 36);
  ctx.font = '700 28px Inter, Arial, sans-serif'; ctx.fillStyle = '#555';
  ctx.fillText((b.tipo === 'combinada' ? 'COMBINADA ×' + b.legs.length : 'SIMPLE') + '  ·  ' + fecha, X, y + 78);
  ctx.font = '900 30px Inter, Arial, sans-serif';
  const wE = ctx.measureText(txtEst).width + 40;
  ctx.fillStyle = colEst; ctx.fillRect(W - M - P - wE, y + 4, wE, 54);
  ctx.strokeStyle = IMG.negro; ctx.lineWidth = 4; ctx.strokeRect(W - M - P - wE, y + 4, wE, 54);
  ctx.fillStyle = IMG.negro; ctx.textAlign = 'center'; ctx.fillText(txtEst, W - M - P - wE / 2, y + 43);
  ctx.textAlign = 'left';
  y += 112;

  // Selecciones
  for (const l of b.legs) {
    ctx.fillStyle = IMG.negro; ctx.fillRect(X, y - 4, ANCHO, 4);
    y += 30;
    const cuota = cuotaTxt(l.odds);
    ctx.font = '900 42px Inter, Arial, sans-serif';
    const wC = ctx.measureText(cuota).width;
    const lineasOp = envolver(ctx, l.opcion, ANCHO - wC - 70);
    ctx.fillStyle = IMG_PUNTO[l.resultado] || IMG_PUNTO.pendiente;
    ctx.beginPath(); ctx.arc(X + 14, y + 22, 14, 0, Math.PI * 2); ctx.fill();
    ctx.fillStyle = IMG.negro;
    lineasOp.forEach((t, i) => ctx.fillText(t, X + 46, y + 36 + i * 50));
    ctx.textAlign = 'right'; ctx.fillStyle = IMG.rosa;
    ctx.fillText(cuota, X + ANCHO, y + 36);
    ctx.textAlign = 'left';
    y += 36 + (lineasOp.length - 1) * 50 + 12;
    ctx.font = '700 28px Inter, Arial, sans-serif'; ctx.fillStyle = '#555';
    for (const t of envolver(ctx, l.mercado, ANCHO - 46).slice(0, 2)) { ctx.fillText(t, X + 46, y + 28); y += 36; }
    y += 18;
  }
  ctx.fillStyle = IMG.negro; ctx.fillRect(X, y - 4, ANCHO, 4);
  y += 36;

  // Dinero en casillas
  const ultimo = b.estado === 'ganada' ? ['COBRADO', b.premio] : (b.estado === 'cancelada' ? ['DEVUELTO', b.premio] : ['PREMIO POSIBLE', b.premioPosible]);
  const celdas = [['APOSTADO', tkt(b.stake) + ' TKT'], ['CUOTA', cuotaTxt(b.cuota)], [ultimo[0], tkt(ultimo[1]) + ' TKT']];
  const cw = ANCHO / 3, ch = 150;
  ctx.strokeStyle = IMG.negro; ctx.lineWidth = 5; ctx.strokeRect(X, y, ANCHO, ch);
  celdas.forEach(([lab, val], i) => {
    const cx = X + i * cw;
    if (i) { ctx.fillStyle = IMG.negro; ctx.fillRect(cx - 2, y, 4, ch); }
    ctx.textAlign = 'center';
    ctx.font = '900 22px Inter, Arial, sans-serif'; ctx.fillStyle = '#555';
    ctx.fillText(lab, cx + cw / 2, y + 44);
    let tam = 66;
    ctx.font = tam + 'px Bangers, Impact, sans-serif';
    while (tam > 30 && ctx.measureText(val).width > cw - 24) { tam -= 4; ctx.font = tam + 'px Bangers, Impact, sans-serif'; }
    ctx.fillStyle = i === 2 && b.estado === 'ganada' ? '#22a84a' : (i === 1 ? IMG.rosa : IMG.negro);
    textoBangers(ctx, val, cx + cw / 2, y + 110, tam);
  });
  ctx.textAlign = 'left';
  y += ch + 40;

  return y + 44;
}

async function imagenApuesta(b) {
  try { await Promise.all([document.fonts.load('100px Bangers'), document.fonts.load('900 40px Inter'), document.fonts.load('700 28px Inter')]); } catch { /* se usan las de reserva */ }
  const W = 1080;
  const nombre = (state.users.find((u) => u.id === state.user) || {}).name || '';
  const prueba = document.createElement('canvas').getContext('2d');
  prueba.canvas.width = W; prueba.canvas.height = 10;
  const H = Math.ceil(dibujarApuesta(prueba, W, b, nombre));
  const cv = document.createElement('canvas');
  cv.width = W; cv.height = H;
  const ctx = cv.getContext('2d');
  ctx.fillStyle = IMG.rosa; ctx.fillRect(0, 0, W, H);                       // fondo rosa
  ctx.fillStyle = IMG.negro; ctx.fillRect(40 + 14, 40 + 14, W - 80, H - 80); // sombra de la tarjeta
  ctx.fillStyle = '#fff'; ctx.fillRect(40, 40, W - 80, H - 80);              // tarjeta
  ctx.strokeStyle = IMG.negro; ctx.lineWidth = 8; ctx.strokeRect(40, 40, W - 80, H - 80);
  dibujarApuesta(ctx, W, b, nombre);
  return new Promise((ok, ko) => cv.toBlob((bl) => (bl ? ok(bl) : ko(new Error('No se pudo crear la imagen.'))), 'image/png'));
}

async function enviarImagen(blob) {
  const file = new File([blob], 'apuesta-tkt365.png', { type: 'image/png' });
  if (navigator.canShare && navigator.canShare({ files: [file] })) {
    try { await navigator.share({ files: [file], title: 'Mi apuesta en TKT365' }); return; }
    catch (e) { if (e && e.name === 'AbortError') return; /* si falla, se descarga */ }
  }
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = url; a.download = 'apuesta-tkt365.png';
  document.body.appendChild(a); a.click(); a.remove();
  setTimeout(() => URL.revokeObjectURL(url), 10000);
}

async function compartirApuesta(id, btn) {
  const b = (state.misApuestas || []).find((x) => x.id === id);
  if (!b) return;
  const antes = btn.textContent;
  btn.disabled = true; btn.textContent = 'Creando…';
  try {
    await enviarImagen(await imagenApuesta(b));
  } catch (e) {
    alert(e.message || 'No se pudo crear la imagen.');
  } finally {
    btn.disabled = false; btn.textContent = antes;
  }
}

// Resguardo que se enseña nada más hacer la apuesta
async function mostrarResguardo(bet) {
  const blob = await imagenApuesta(bet);
  const url = URL.createObjectURL(blob);
  const ov = document.createElement('div');
  ov.className = 'tkt-resguardo';
  ov.innerHTML = '<div class="tkt-resguardo-caja"><img alt="Resguardo de tu apuesta">' +
    '<div class="tkt-resguardo-bt"><button type="button" data-r="share">📤 Compartir</button><button type="button" data-r="close">Cerrar</button></div></div>';
  ov.querySelector('img').src = url;
  const cerrar = () => { ov.remove(); URL.revokeObjectURL(url); };
  ov.addEventListener('click', (e) => {
    if (e.target === ov) return cerrar();
    const r = e.target.closest('button[data-r]');
    if (!r) return;
    if (r.dataset.r === 'close') cerrar();
    else enviarImagen(blob).catch((err) => alert(err.message || 'No se pudo compartir.'));
  });
  document.body.appendChild(ov);
}
$('apuestas').addEventListener('click', (e) => {
  const b = e.target.closest('button[data-share]');
  if (b) compartirApuesta(b.dataset.share, b);
});

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
