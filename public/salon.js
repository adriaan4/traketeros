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
