// Admin de TKT365. Las rutas /api/tkt365/admin/* están protegidas con usuario y clave
// (el navegador los pide). Las personas salen del Traketímetro: no se crean aquí.

const $ = (id) => document.getElementById(id);
const esc = (s) =>
  String(s ?? '').replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));

const nf = new Intl.NumberFormat('es-ES', { useGrouping: 'always', maximumFractionDigits: 0 });
const tkt = (n) => nf.format(Math.round(n || 0));
const fechaFmt = new Intl.DateTimeFormat('es-ES', { timeZone: 'Europe/Madrid', day: '2-digit', month: '2-digit', year: '2-digit', hour: '2-digit', minute: '2-digit' });
const localFmt = new Intl.DateTimeFormat('sv-SE', { timeZone: 'Europe/Madrid', dateStyle: 'short', timeStyle: 'short' });
const toLocalInput = (ms) => localFmt.format(new Date(ms)).replace(' ', 'T');

let data = null;
let editando = null; // id del mercado que se está editando

function showGate(titulo, texto) {
  document.querySelector('main').innerHTML =
    '<div class="gate"><h1>' + esc(titulo) + '</h1><p>' + esc(texto) + '</p><a class="btn" href="">Reintentar</a></div>';
}

async function api(url, method, body) {
  const res = await fetch(url, {
    method: method || 'GET',
    headers: body ? { 'Content-Type': 'application/json' } : undefined,
    body: body ? JSON.stringify(body) : undefined
  });
  let j = {};
  try { j = await res.json(); } catch { /* sin cuerpo */ }
  if (res.status === 401) throw Object.assign(new Error('Acceso denegado'), { auth: true });
  if (!res.ok) throw new Error(j.error || 'Error');
  return j;
}

async function load() {
  try {
    data = await api('/api/tkt365/admin/overview');
  } catch (e) {
    return showGate(e.auth ? 'Acceso denegado' : 'Sin conexión',
      e.auth ? 'Entra con el usuario y la clave de administrador.' : 'No se ha podido conectar con el servidor.');
  }
  render();
}

// ---------- Pintar ----------
function render() {
  const r = data.resumen;
  $('st-m').textContent = r.mercados;
  $('st-a').textContent = r.abiertos;
  $('st-b').textContent = r.apuestas;
  $('st-t').textContent = tkt(r.totalApostado);

  $('mercados').innerHTML = data.markets.map((m) => {
    const cerrada = m.estado === 'resuelto' || m.estado === 'cancelado';
    const acc = [];
    acc.push(`<button class="mini" data-a="bets" data-id="${esc(m.id)}">Apuestas</button>`);
    if (!cerrada) {
      acc.push(`<button class="mini" data-a="edit" data-id="${esc(m.id)}">Editar</button>`);
      acc.push(m.estado === 'abierto'
        ? `<button class="mini" data-a="close" data-id="${esc(m.id)}">Cerrar</button>`
        : `<button class="mini" data-a="open" data-id="${esc(m.id)}">Abrir</button>`);
      acc.push(`<button class="mini" data-a="resolve" data-id="${esc(m.id)}">Resolver</button>`);
      if (m.auto) acc.push(`<button class="mini" data-a="recalc" data-id="${esc(m.id)}">Recalcular cuotas</button>`);
      acc.push(`<button class="mini danger" data-a="cancel" data-id="${esc(m.id)}">Cancelar</button>`);
    }
    const ganadores = m.estado === 'resuelto'
      ? '<br><small>Ganador: ' + esc(m.options.filter((o) => m.ganadores.includes(o.id)).map((o) => o.label).join(', ')) + (m.resolucion?.por === 'auto' ? ' (auto)' : '') + '</small>' : '';
    return `<tr><td style="white-space:normal;min-width:220px"><b>${esc(m.titulo)}</b><br><small>${esc(m.evento || '—')}</small>${ganadores}</td>` +
      `<td><span class="status ${esc(m.estado)}">${esc(m.estado.toUpperCase())}</span></td>` +
      `<td>${esc(fechaFmt.format(new Date(m.cierra)))}</td>` +
      `<td>${m.stats.apuestas} <small>(${m.stats.usuarios} pers.)</small></td><td>${tkt(m.stats.apostado)}</td>` +
      `<td>${esc(m.fuente)}</td><td><div class="tkt-acc">${acc.join('')}</div></td></tr>`;
  }).join('') || '<tr><td colspan="7">Todavía no hay mercados.</td></tr>';

  const q = $('q').value.trim().toLowerCase();
  $('usuarios').innerHTML = data.users.filter((u) => u.name.toLowerCase().includes(q)).map((u, i) => {
    const bn = u.beneficio > 0 ? 'tkt-pos-n' : (u.beneficio < 0 ? 'tkt-neg-n' : '');
    return `<tr><td>${i + 1}</td><td><b>${esc(u.name)}</b>${u.soloApuestas ? ' <span class="tkt-solo">SOLO APUESTAS</span>' : (u.active ? '' : ' <small>(fuera del Traketímetro)</small>')}</td>` +
      `<td><b>${tkt(u.balance)}</b> TKT</td><td>${u.ganadas} / ${u.perdidas}</td><td>${tkt(u.apostado)}</td>` +
      `<td class="${bn}">${u.beneficio > 0 ? '+' : ''}${tkt(u.beneficio)}</td>` +
      `<td>${u.reclamado
        ? `<span class="tkt-lock" title="Elegido el ${esc(fechaFmt.format(new Date(u.reclamado)))}">🔒 Elegido</span> <button class="mini danger" data-liberar="${esc(u.id)}" data-n="${esc(u.name)}">Liberar</button>`
        : '<span class="tkt-lock libre">Libre</span>'}${u.soloApuestas ? ` <button class="mini" data-quitar="${esc(u.id)}" data-n="${esc(u.name)}">Quitar</button>` : ''}</td>` +
      `<td><div class="tkt-ajuste" data-u="${esc(u.id)}">` +
      [100, 500, -100, -500].map((n) => `<button class="mini${n < 0 ? ' danger' : ''}" data-ajuste="${n}">${n > 0 ? '+' : ''}${n}</button>`).join('') +
      `<input class="tkt-in" type="number" step="1" placeholder="Cantidad" data-cant>` +
      `<input class="tkt-in motivo" type="text" maxlength="120" placeholder="Motivo" data-motivo>` +
      `<button class="mini" data-ajuste="custom">Aplicar</button></div></td></tr>`;
  }).join('') || '<tr><td colspan="8">Sin resultados</td></tr>';

  pintarApuestasAdmin();

  $('movs').innerHTML = data.transactions.map((t) =>
    `<tr><td>${esc(fechaFmt.format(new Date(t.ts)))}</td><td>${esc(t.name)}</td><td>${esc(t.tipo)}</td>` +
    `<td class="${t.cantidad >= 0 ? 'tkt-pos-n' : 'tkt-neg-n'}">${t.cantidad > 0 ? '+' : ''}${tkt(t.cantidad)}</td>` +
    `<td>${tkt(t.saldoAntes)}</td><td>${tkt(t.saldoDespues)}</td><td>${esc(t.admin || '—')}</td><td>${esc(t.motivo || '')}</td></tr>`
  ).join('') || '<tr><td colspan="8">Sin movimientos</td></tr>';

  // selects
  const evOpts = data.events.map((e) => `<option value="${esc(e.id)}">${esc(e.name)} (${esc(e.start)})</option>`).join('');
  const prevEv = $('fEventoId').value;
  $('fEventoId').innerHTML = '<option value="">— Ninguna (texto libre) —</option>' + evOpts;
  $('fEventoId').value = prevEv;
  $('aEvento').innerHTML = evOpts || '<option value="">(No hay fechas especiales en el Traketímetro)</option>';
  if (!$('aMetrica').options.length) $('aMetrica').innerHTML = data.metricas.map((m) => `<option value="${esc(m.id)}">${esc(m.titulo)}</option>`).join('');
  if (!editando) pintarFormUsuarios();
}

const ESTADO_AP = { pendiente: '🟡 Pendiente', ganada: '🟢 Ganada', perdida: '🔴 Perdida', cancelada: '⚪ Cancelada' };
const RES_AP = { pendiente: '🟡', ganada: '🟢', perdida: '🔴', anulada: '⚪' };

function accionesApuesta(b) {
  const d = `data-id="${esc(b.id)}" data-n="${esc(b.usuario)}" data-s="${b.stake}" data-p="${b.premioPosible}"`;
  const out = [];
  if (b.estado !== 'ganada' && b.estado !== 'cancelada') out.push(`<button class="mini" data-settle="ganada" ${d}>${b.estado === 'perdida' ? 'Corregir: ganada' : 'Ganada'}</button>`);
  if (b.estado !== 'perdida' && b.estado !== 'cancelada') out.push(`<button class="mini danger" data-settle="perdida" ${d}>${b.estado === 'ganada' ? 'Corregir: perdida' : 'Perdida'}</button>`);
  if (b.estado === 'pendiente') out.push(`<button class="mini" data-anular="${esc(b.id)}" data-n="${esc(b.usuario)}" data-s="${b.stake}">Anular</button>`);
  return out.join('');
}

function pintarApuestasAdmin() {
  const q = $('bq').value.trim().toLowerCase();
  const est = $('bEstado').value;
  const lista = data.bets.filter((b) =>
    (!est || b.estado === est) &&
    (!q || b.usuario.toLowerCase().includes(q) || b.legs.some((l) => (l.mercado + ' ' + l.opcion).toLowerCase().includes(q))));
  $('apuestasAdmin').innerHTML = lista.map((b) => {
    const legs = '<ul class="tkt-legs">' + b.legs.map((l) =>
      `<li>${RES_AP[l.resultado] || '🟡'} <b>${esc(l.opcion)}</b> · ${esc(l.mercado)} <small>x${l.odds.toFixed(2)}</small></li>`).join('') + '</ul>';
    const cobro = b.estado === 'ganada' ? `<br><small>Cobrado: ${tkt(b.premio)}</small>` : (b.estado === 'cancelada' ? `<br><small>Devuelto: ${tkt(b.premio)}</small>` : '');
    return `<tr><td>${esc(fechaFmt.format(new Date(b.ts)))}</td><td><b>${esc(b.usuario)}</b></td>` +
      `<td>${b.tipo === 'combinada' ? 'Combinada' : 'Simple'}</td><td style="white-space:normal">${legs}</td>` +
      `<td>${tkt(b.stake)}</td><td>x${b.cuota.toFixed(2)}</td><td>${tkt(b.premioPosible)}</td>` +
      `<td>${esc(ESTADO_AP[b.estado] || b.estado)}${cobro}</td>` +
      `<td><div class="tkt-acc">${accionesApuesta(b)}</div></td></tr>`;
  }).join('') || '<tr><td colspan="9">Todavía no hay apuestas.</td></tr>';
}
$('bq').addEventListener('input', () => data && pintarApuestasAdmin());
$('bEstado').addEventListener('change', () => data && pintarApuestasAdmin());

$('apuestasAdmin').addEventListener('click', async (e) => {
  const st = e.target.closest('button[data-settle]');
  if (st) {
    const gana = st.dataset.settle === 'ganada';
    const txt = gana
      ? `¿Dar por GANADA la apuesta de ${st.dataset.n}? Se le pagarán ${tkt(Number(st.dataset.p))} TKT.`
      : `¿Dar por PERDIDA la apuesta de ${st.dataset.n}?` + ' Si estaba ganada, se le quitará el premio cobrado.';
    if (!confirm(txt)) return;
    try {
      await api('/api/tkt365/admin/bets/' + encodeURIComponent(st.dataset.id) + '/settle', 'POST', { resultado: st.dataset.settle });
      await load();
    } catch (err) { alert(err.message); }
    return;
  }
  const b = e.target.closest('button[data-anular]');
  if (!b) return;
  if (!confirm(`¿Anular la apuesta de ${b.dataset.n} y devolverle ${tkt(Number(b.dataset.s))} TKT?`)) return;
  try {
    await api('/api/tkt365/admin/bets/' + encodeURIComponent(b.dataset.anular) + '/void', 'POST', {});
    await load();
  } catch (err) { alert(err.message); }
});

// ---------- Formulario de mercado manual ----------
function pintarFormUsuarios(markets) {
  const previos = new Map();
  for (const row of document.querySelectorAll('#fUsuarios .tkt-adm-opt')) {
    previos.set(row.dataset.u, { on: row.querySelector('[type=checkbox]').checked, odds: row.querySelector('[type=number]').value });
  }
  $('fUsuarios').innerHTML = [...data.users].sort((a, b) => a.name.localeCompare(b.name, 'es')).filter((u) => u.active).map((u) => {
    const p = previos.get(u.id) || {};
    return `<div class="tkt-adm-opt" data-u="${esc(u.id)}"><input type="checkbox"${p.on ? ' checked' : ''} aria-label="${esc(u.name)}">` +
      `<span>${esc(u.name)}</span><input type="number" step="0.01" min="1.01" max="1000" placeholder="x3.00" value="${esc(p.odds ?? '')}"></div>`;
  }).join('') || '<small>No hay personas en el Traketímetro todavía.</small>';
}

function filaLibre(label = '', odds = '', id = '') {
  const d = document.createElement('div');
  d.className = 'tkt-adm-opt libre';
  d.dataset.id = id;
  d.innerHTML = '<input type="text" maxlength="60" placeholder="Opción" data-l><input type="number" step="0.01" min="1.01" max="1000" placeholder="x2.00" data-o>' +
    '<button class="mini danger" type="button" data-rm>×</button>';
  d.querySelector('[data-l]').value = label;
  d.querySelector('[data-o]').value = odds;
  $('fLibres').appendChild(d);
  $('fLibres').hidden = false;
}
$('addLibre').addEventListener('click', () => filaLibre());
$('fLibres').addEventListener('click', (e) => {
  if (e.target.matches('[data-rm]')) {
    e.target.closest('.tkt-adm-opt').remove();
    $('fLibres').hidden = !$('fLibres').children.length;
  }
});

function leerOpciones() {
  const out = [];
  for (const row of document.querySelectorAll('#fUsuarios .tkt-adm-opt')) {
    if (!row.querySelector('[type=checkbox]').checked) continue;
    out.push({ userId: row.dataset.u, odds: Number(row.querySelector('[type=number]').value) });
  }
  for (const row of document.querySelectorAll('#fLibres .tkt-adm-opt')) {
    const label = row.querySelector('[data-l]').value.trim();
    if (!label) continue;
    out.push({ id: row.dataset.id || undefined, label, odds: Number(row.querySelector('[data-o]').value) });
  }
  return out;
}

function msg(id, txt, kind) {
  const el = $(id);
  el.textContent = txt || '';
  el.className = 'tkt-msg' + (kind ? ' ' + kind : '');
  el.style.color = kind === 'err' ? '#c01616' : (kind === 'ok' ? '#1a8a3a' : '');
}

function resetForm() {
  editando = null;
  $('form').reset();
  $('fLibres').innerHTML = '';
  $('fLibres').hidden = true;
  $('formTitulo').textContent = 'Crear mercado';
  $('fGuardar').textContent = 'Crear mercado';
  $('formReset').hidden = true;
  if (data) pintarFormUsuarios();
}
$('formReset').addEventListener('click', () => { resetForm(); msg('fMsg', ''); });

$('form').addEventListener('submit', async (e) => {
  e.preventDefault();
  const body = {
    titulo: $('fTitulo').value, descripcion: $('fDesc').value, categoria: $('fCategoria').value,
    evento: $('fEvento').value, eventoId: $('fEventoId').value || null,
    cierra: $('fCierra').value, options: leerOpciones()
  };
  try {
    if (editando) await api('/api/tkt365/admin/markets/' + encodeURIComponent(editando), 'PUT', body);
    else await api('/api/tkt365/admin/markets', 'POST', body);
    msg('fMsg', editando ? 'Mercado actualizado ✅' : 'Mercado creado ✅', 'ok');
    resetForm();
    await load();
  } catch (err) {
    msg('fMsg', err.message, 'err');
  }
});

function editar(m) {
  editando = m.id;
  // en edición se usan las opciones del mercado: se marcan en la lista de usuarios
  $('formTitulo').textContent = 'Editar mercado';
  $('fGuardar').textContent = 'Guardar cambios';
  $('formReset').hidden = false;
  $('fTitulo').value = m.titulo;
  $('fDesc').value = m.descripcion || '';
  $('fCategoria').value = m.categoria || '';
  $('fEvento').value = m.eventoId ? '' : (m.evento || '');
  $('fEventoId').value = m.eventoId || '';
  $('fCierra').value = toLocalInput(m.cierra);
  pintarFormUsuarios();
  for (const row of document.querySelectorAll('#fUsuarios .tkt-adm-opt')) {
    const o = m.options.find((x) => x.id === 'u:' + row.dataset.u);
    row.querySelector('[type=checkbox]').checked = Boolean(o);
    row.querySelector('[type=number]').value = o ? o.odds : '';
  }
  $('fLibres').innerHTML = '';
  $('fLibres').hidden = true;
  for (const o of m.options) if (!o.id.startsWith('u:')) filaLibre(o.label, o.odds, o.id);
  msg('fMsg', 'Editando «' + m.titulo + '». Las apuestas ya hechas conservan su cuota.', '');
  $('form').scrollIntoView({ behavior: 'smooth', block: 'start' });
}

// ---------- Mercado automático ----------
function tipoAuto() {
  const t = $('aTipo').value;
  $('aWrapEvento').hidden = t !== 'evento';
  $('aWrapMes').hidden = t !== 'mes';
  $('aWrapSemana').hidden = t !== 'semana';
}
$('aTipo').addEventListener('change', tipoAuto);

$('formAuto').addEventListener('submit', async (e) => {
  e.preventDefault();
  const t = $('aTipo').value;
  const periodoId = t === 'evento' ? $('aEvento').value : (t === 'mes' ? $('aMes').value : $('aSemana').value);
  try {
    await api('/api/tkt365/admin/auto', 'POST', {
      metrica: $('aMetrica').value, periodoTipo: t, periodoId, cierra: $('aCierra').value
    });
    msg('aMsg', 'Mercado automático creado ✅', 'ok');
    await load();
  } catch (err) {
    msg('aMsg', err.message, 'err');
  }
});

$('generar').addEventListener('click', async () => {
  try {
    const r = await api('/api/tkt365/admin/generate', 'POST', {});
    alert(r.creados ? `Se han creado ${r.creados} mercados automáticos.` : 'No había mercados nuevos que crear.');
    await load();
  } catch (err) { alert(err.message); }
});

// ---------- Acciones de mercado ----------
const modal = $('modal');
function abrirModal(html) {
  modal.innerHTML = html;
  if (!modal.open) modal.showModal();
}
modal.addEventListener('click', (e) => {
  if (e.target === modal || e.target.matches('[data-cerrar]')) modal.close();
});

async function accion(a, id) {
  const m = data.markets.find((x) => x.id === id);
  if (!m) return;
  const base = '/api/tkt365/admin/markets/' + encodeURIComponent(id);
  try {
    if (a === 'edit') return editar(m);
    if (a === 'close') { await api(base + '/close', 'POST', {}); }
    else if (a === 'open') {
      let body = {};
      if (m.cierra <= data.now) {
        const v = prompt('La hora de cierre ya pasó. Nueva hora de cierre (AAAA-MM-DD HH:mm, hora de Madrid):', toLocalInput(Date.now() + 3600e3).replace('T', ' '));
        if (!v) return;
        body = { cierra: v.trim().replace(' ', 'T') };
      }
      await api(base + '/open', 'POST', body);
    } else if (a === 'recalc') {
      if (!confirm('Recalcular las cuotas con el historial actual del Traketímetro? Las apuestas ya hechas conservan su cuota.')) return;
      await api(base + '/recalc', 'POST', {});
    } else if (a === 'cancel') {
      if (!confirm(`¿Cancelar «${m.titulo}»? Se devolverán los TKT de las apuestas (en una combinada, esa selección cuenta como x1).`)) return;
      await api(base + '/cancel', 'POST', {});
    } else if (a === 'resolve') {
      return abrirModal(`<h3>Resolver mercado</h3><p><b>${esc(m.titulo)}</b></p>` +
        `<div class="tkt-radios">${m.options.map((o, i) => `<label><input type="checkbox" name="g" value="${esc(o.id)}"> ${esc(o.label)} <small>(x${o.odds.toFixed(2)})</small></label>`).join('')}</div>` +
        `<p class="hint">Marca la opción ganadora (si hay empate puedes marcar varias). Se pagarán las apuestas ganadoras. No se puede deshacer.</p>` +
        `<div class="tkt-acc"><button class="mini" data-cerrar>Cancelar</button><button class="mini danger" id="okResolver" data-id="${esc(id)}">Resolver y pagar</button></div>`);
    } else if (a === 'bets') {
      const r = await api(base + '/bets');
      return abrirModal(`<h3>Apuestas</h3><p><b>${esc(m.titulo)}</b><br><small>${r.stats.apuestas} apuestas · ${r.stats.usuarios} personas · ${tkt(r.stats.apostado)} TKT</small></p>` +
        `<div class="scroll"><table><thead><tr><th>Usuario</th><th>Opción</th><th>TKT</th><th>Tipo</th><th>Estado</th></tr></thead><tbody>` +
        (r.bets.map((b) => `<tr><td>${esc(b.usuario)}</td><td>${esc(b.opcion)} <small>x${b.cuotaOpcion.toFixed(2)}</small></td><td>${tkt(b.stake)}</td>` +
          `<td>${esc(b.tipo)}${b.tipo === 'combinada' ? ' <small>x' + b.cuotaTotal.toFixed(2) + '</small>' : ''}</td><td>${esc(b.estado)}</td></tr>`).join('') || '<tr><td colspan="5">Nadie ha apostado todavía.</td></tr>') +
        `</tbody></table></div><div class="tkt-acc"><button class="mini" data-cerrar>Cerrar</button></div>`);
    }
    await load();
  } catch (err) {
    alert(err.message);
  }
}

modal.addEventListener('click', async (e) => {
  const b = e.target.closest('#okResolver');
  if (!b) return;
  const ganadores = [...modal.querySelectorAll('input[name=g]:checked')].map((x) => x.value);
  if (!ganadores.length) return alert('Marca al menos una opción ganadora.');
  if (!confirm('¿Seguro? Se pagarán los premios y no se puede deshacer.')) return;
  try {
    await api('/api/tkt365/admin/markets/' + encodeURIComponent(b.dataset.id) + '/resolve', 'POST', { ganadores });
    modal.close();
    await load();
  } catch (err) { alert(err.message); }
});

$('mercados').addEventListener('click', (e) => {
  const b = e.target.closest('button[data-a]');
  if (b) accion(b.dataset.a, b.dataset.id);
});

// ---------- Saldos ----------
$('usuarios').addEventListener('click', async (e) => {
  const quitar = e.target.closest('button[data-quitar]');
  if (quitar) {
    if (!confirm(`¿Quitar a «${quitar.dataset.n}»? Solo se puede si nunca ha apostado.`)) return;
    try {
      await api('/api/tkt365/admin/users/' + encodeURIComponent(quitar.dataset.quitar) + '/remove', 'POST', {});
      await load();
    } catch (err) { alert(err.message); }
    return;
  }
  const lib = e.target.closest('button[data-liberar]');
  if (lib) {
    if (!confirm(`¿Liberar el nombre «${lib.dataset.n}»? Quien lo tenga podrá volver a elegir nombre, y ese nombre quedará libre para otra persona.`)) return;
    try {
      await api('/api/tkt365/admin/users/' + encodeURIComponent(lib.dataset.liberar) + '/release', 'POST', {});
      await load();
    } catch (err) { alert(err.message); }
    return;
  }
  const b = e.target.closest('button[data-ajuste]');
  if (!b) return;
  const cont = b.closest('.tkt-ajuste');
  const userId = cont.dataset.u;
  let cantidad;
  if (b.dataset.ajuste === 'custom') {
    cantidad = Math.round(Number(cont.querySelector('[data-cant]').value));
    if (!Number.isFinite(cantidad) || cantidad === 0) return alert('Escribe una cantidad (puede ser negativa).');
  } else {
    cantidad = Number(b.dataset.ajuste);
  }
  const motivo = cont.querySelector('[data-motivo]').value.trim();
  try {
    await api('/api/tkt365/admin/users/' + encodeURIComponent(userId) + '/adjust', 'POST', { cantidad, motivo });
    await load();
  } catch (err) { alert(err.message); }
});

$('altaForm').addEventListener('submit', async (e) => {
  e.preventDefault();
  try {
    await api('/api/tkt365/admin/users', 'POST', { name: $('altaName').value });
    $('altaName').value = '';
    msg('altaMsg', 'Persona añadida ✅ (ya puede elegir su nombre en TKT365)', 'ok');
    await load();
  } catch (err) { msg('altaMsg', err.message, 'err'); }
});

$('q').addEventListener('input', () => data && render());
$('refresh').addEventListener('click', load);

tipoAuto();
$('aCierra').value = toLocalInput(Date.now() + 24 * 3600e3);
load();
