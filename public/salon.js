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

// ---------- Próximo evento (publicado desde el admin) junto a San Roque ----------
//   GET /api/community/overview → { events: [{ name, date: 'YYYY-MM-DD', time, place, source? }] }
function hoyLocalISO() {
  const d = new Date();
  return d.getFullYear() + '-' + pad(d.getMonth() + 1) + '-' + pad(d.getDate());
}

async function cargarEvento() {
  const box = $('cdEvento');
  if (!box) return;
  try {
    const r = await fetch('/api/community/overview');
    if (!r.ok) throw new Error('sin datos');
    const d = await r.json();
    const hoy = hoyLocalISO();
    // Solo los eventos publicados en el admin (los del Traketímetro llevan "source")
    const futuros = (d.events || [])
      .filter((e) => !e.source && e.date && String(e.date) >= hoy)
      .sort((a, b) => (String(a.date) + (a.time || '')).localeCompare(String(b.date) + (b.time || '')));

    if (!futuros.length) { box.hidden = true; $('cdSection').classList.remove('con-evento'); return; }

    const ev = futuros[0];
    const [y, m, dd] = String(ev.date).split('-').map(Number);
    const f = new Date(y, m - 1, dd);
    const t = new Date();
    const dias = Math.round((f - new Date(t.getFullYear(), t.getMonth(), t.getDate())) / 86400000);
    const etiqueta = dias <= 0 ? '¡HOY!' : dias === 1 ? '¡MAÑANA!' : `En ${dias} días`;
    const fecha = f.toLocaleDateString('es-ES', { weekday: 'long', day: 'numeric', month: 'long' });
    const resto = futuros.length - 1;

    box.innerHTML = `
      <div class="cd-ev-kicker">📅 PRÓXIMO EVENTO</div>
      <h3 class="cd-ev-name">${esc(ev.name)}</h3>
      <div class="cd-ev-days">${etiqueta}</div>
      <p class="cd-ev-date">${esc(fecha)}${ev.time ? ' · ' + esc(ev.time) : ''}</p>
      ${ev.place ? `<p class="cd-ev-place">📍 ${esc(ev.place)}</p>` : ''}
      <a class="cd-ev-link" href="calendario.html">Ver calendario${resto > 0 ? ` (+${resto} más)` : ''}</a>`;
    box.hidden = false;
    $('cdSection').classList.add('con-evento');
  } catch (_) {
    box.hidden = true;
    $('cdSection').classList.remove('con-evento');
  }
}

cargarEvento();
setInterval(cargarEvento, 5 * 60 * 1000);

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
