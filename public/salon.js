// Pantalla principal: Salón del Cubata de Oro + cuenta atrás de San Roque.
//   GET /api/traketimetro/salon → { salon: { meses, fechas, actual }, events }

const $ = (id) => document.getElementById(id);

const esc = (s) => String(s ?? '').replace(/[&<>"']/g, (c) => ({
  '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;'
}[c]));

const unir = (names) => names.map(esc).join(' y ');

// ---------- Cuenta atrás: 13 de agosto de 2027 (hora de Madrid, verano = +02:00) ----------
const SAN_ROQUE = new Date('2027-08-13T00:00:00+02:00').getTime();

function pad(n) { return String(n).padStart(2, '0'); }

function tickCuentaAtras() {
  const diff = SAN_ROQUE - Date.now();

  if (diff <= 0) {
    $('countdown').hidden = true;
    $('cdNote').textContent = '¡¡ES SAN ROQUE!! 🎉🍻';
    return;
  }

  const s = Math.floor(diff / 1000);
  $('cd-d').textContent = Math.floor(s / 86400);
  $('cd-h').textContent = pad(Math.floor((s % 86400) / 3600));
  $('cd-m').textContent = pad(Math.floor((s % 3600) / 60));
  $('cd-s').textContent = pad(s % 60);
}

tickCuentaAtras();
setInterval(tickCuentaAtras, 1000);

// ---------- Comunidad: próximo evento (con cuenta atrás), avisos y líderes ----------
//   GET /api/community/overview → { people, events: [{ name, date, time, place, source? }], notices }
let evTarget = null;

function hoyLocalISO() {
  const d = new Date();
  return d.getFullYear() + '-' + pad(d.getMonth() + 1) + '-' + pad(d.getDate());
}

function tickEvento() {
  const grid = $('ev-grid'), flag = $('ev-flag');
  if (evTarget === null || !grid || !flag) return;
  const diff = evTarget - Date.now();
  if (diff <= 0) { grid.hidden = true; flag.hidden = false; return; }
  grid.hidden = false; flag.hidden = true;
  const s = Math.floor(diff / 1000);
  $('ev-d').textContent = Math.floor(s / 86400);
  $('ev-h').textContent = pad(Math.floor((s % 86400) / 3600));
  $('ev-m').textContent = pad(Math.floor((s % 3600) / 60));
  $('ev-s').textContent = pad(s % 60);
}
setInterval(tickEvento, 1000);

function pintarEvento(events) {
  const box = $('cdEvento');
  const hoy = hoyLocalISO();
  // Solo los eventos publicados en el admin (los del Traketímetro llevan "source")
  const futuros = events
    .filter((e) => !e.source && e.date && String(e.date) >= hoy)
    .sort((a, b) => (String(a.date) + (a.time || '')).localeCompare(String(b.date) + (b.time || '')));

  if (!futuros.length) { evTarget = null; box.hidden = true; $('cdSection').classList.remove('con-evento'); return; }

  const ev = futuros[0];
  const [y, m, dd] = String(ev.date).split('-').map(Number);
  let hh = 0, mm = 0;
  if (/^\d{1,2}:\d{2}$/.test(ev.time || '')) [hh, mm] = ev.time.split(':').map(Number);
  evTarget = new Date(y, m - 1, dd, hh, mm).getTime();
  const fecha = new Date(y, m - 1, dd).toLocaleDateString('es-ES', { weekday: 'long', day: 'numeric', month: 'long' });
  const resto = futuros.length - 1;

  box.innerHTML = `
    <div class="cd-ev-kicker">📅 PRÓXIMO EVENTO</div>
    <h3 class="cd-ev-name">${esc(ev.name)}</h3>
    <p class="cd-ev-date">${esc(fecha)}${ev.time ? ' · ' + esc(ev.time) : ''}</p>
    ${ev.place ? `<p class="cd-ev-place">📍 ${esc(ev.place)}</p>` : ''}
    <div class="cd-ev-grid" id="ev-grid" role="timer" aria-live="off">
      <div class="cd-box"><b id="ev-d">--</b><small>días</small></div>
      <div class="cd-box"><b id="ev-h">--</b><small>horas</small></div>
      <div class="cd-box"><b id="ev-m">--</b><small>min</small></div>
      <div class="cd-box"><b id="ev-s">--</b><small>seg</small></div>
    </div>
    <div class="cd-ev-flag" id="ev-flag" hidden>¡ES HOY! 🎉🍻</div>
    <a class="cd-ev-link" href="calendario.html">Ver calendario${resto > 0 ? ` (+${resto} más)` : ''}</a>`;
  box.hidden = false;
  $('cdSection').classList.add('con-evento');
  tickEvento();
}

function pintarAvisos(notices) {
  const lista = [...notices].sort((a, b) => (b.pinned ? 1 : 0) - (a.pinned ? 1 : 0));
  $('notices').innerHTML = lista.map((n) => `
    <li class="home-notice">
      <b>${n.pinned ? '⭐ ' : ''}${esc(n.title)}</b>
      <p>${esc(n.body)}</p>
      <small>${esc(new Date(n.createdAt).toLocaleDateString('es-ES'))}</small>
    </li>`).join('');
  $('homeNotices').hidden = !lista.length;
}

function pintarLideres(people) {
  const medallas = ['🥇', '🥈', '🥉'];
  $('tilePeople').textContent = people.length ? `${people.length} traketeros en el marcador` : 'Apunta tu consumo';
  $('leaders').innerHTML = people.slice(0, 8).map((p, i) => `
    <tr>
      <td>${medallas[i] || i + 1}</td>
      <td><a href="perfil.html?name=${encodeURIComponent(p.name)}">${esc(p.name)}</a></td>
      <td>${esc(p.cervezas)}</td><td>${esc(p.cubatas)}</td><td>${esc(p.chupitos)}</td><td>${esc(p.porros)}</td>
      <td><b>${esc(p.puntos)}</b></td>
    </tr>`).join('') || '<tr><td colspan="7">Todavía no hay estadísticas.</td></tr>';
}

async function cargarComunidad() {
  try {
    const r = await fetch('/api/community/overview');
    if (!r.ok) throw new Error('sin datos');
    const d = await r.json();
    pintarEvento(d.events || []);
    pintarAvisos(d.notices || []);
    pintarLideres(d.people || []);
  } catch (_) {
    evTarget = null;
    $('cdEvento').hidden = true;
    $('cdSection').classList.remove('con-evento');
    $('leaders').innerHTML = '<tr><td colspan="7">No se pudieron cargar los datos.</td></tr>';
  }
}

cargarComunidad();
setInterval(cargarComunidad, 5 * 60 * 1000);

// ---------- Salón ----------
const fechaCorta = (s) => s.split('-').reverse().join('/');

function trofeo(titulo, sub, nombres, clase) {
  return `
    <article class="trofeo ${clase || ''}">
      <div class="trofeo-icon" aria-hidden="true">🍹</div>
      <small>${esc(titulo)}</small>
      <b>${nombres}</b>
      ${sub ? `<em>${esc(sub)}</em>` : ''}
    </article>`;
}

async function cargarSalon() {
  const grid = $('salonGrid');
  try {
    const res = await fetch('/api/traketimetro/salon', { cache: 'no-store' });
    if (!res.ok) throw new Error();
    const { salon } = await res.json();

    const piezas = [];
    // Meses ya cerrados (Septiembre, Octubre... uno al lado del otro)
    for (const m of salon.meses) piezas.push(trofeo(m.label, 'Cubata de Oro', unir(m.names)));
    // Fechas especiales ya terminadas (San Miguel, San Roque...)
    for (const f of salon.fechas) {
      const rango = f.start === f.end ? fechaCorta(f.start) : `${fechaCorta(f.start)} → ${fechaCorta(f.end)}`;
      piezas.push(trofeo(f.label, rango, unir(f.names), 'fecha'));
    }
    // El mes que se está jugando ahora
    const a = salon.actual;
    piezas.push(trofeo(
      a.label,
      'en juego…',
      a.lider.length ? `va ganando ${unir(a.lider)}` : 'nadie ha apuntado aún',
      'en-juego'
    ));

    grid.innerHTML = piezas.join('');
  } catch {
    grid.innerHTML = '<p class="salon-vacio">No se ha podido cargar el salón. Recarga la página.</p>';
  }
}

cargarSalon();
// Se actualiza solo (y salta al mes nuevo sin recargar)
setInterval(cargarSalon, 60 * 1000);
document.addEventListener('visibilitychange', () => { if (!document.hidden) cargarSalon(); });
