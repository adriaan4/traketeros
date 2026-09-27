// Panel de admin. Pide los datos a /api/admin/overview (protegido con usuario y clave).

const $ = (id) => document.getElementById(id);

const euro = (n) => new Intl.NumberFormat('es-ES', { style: 'currency', currency: 'EUR' }).format(n || 0);
const fecha = (ts) => (ts ? new Date(ts * 1000).toLocaleDateString('es-ES') : '—');

// Escapa texto que viene de Stripe (nombres, emails...) antes de meterlo en el HTML
const esc = (s) =>
  String(s ?? '').replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));

const ESTADOS_SUB = {
  active: 'activa', trialing: 'en prueba', past_due: 'impago', canceled: 'cancelada',
  unpaid: 'impagada', incomplete: 'incompleta', incomplete_expired: 'caducada', paused: 'pausada'
};
const ESTADOS_FACTURA = { paid: 'pagada', open: 'pendiente', draft: 'borrador', void: 'anulada', uncollectible: 'incobrable' };

let data = { members: [], invoices: [] };

async function load() {
  let res;
  try {
    res = await fetch('/api/admin/overview');
  } catch (_) {
    return showGate('Sin conexión', 'No se ha podido conectar con el servidor.');
  }
  if (!res.ok) {
    return showGate('Acceso denegado', 'Entra con el usuario y la clave de administrador.');
  }

  data = await res.json();
  $('stat-customers').textContent = data.stats.customers;
  $('stat-active').textContent = data.stats.active;
  $('stat-revenue').textContent = euro(data.stats.revenue);
  $('stat-payments').textContent = data.stats.payments;
  render();
}

function showGate(titulo, texto) {
  document.querySelector('main').innerHTML =
    '<div class="gate"><h1>' + esc(titulo) + '</h1><p>' + esc(texto) +
    '</p><a class="btn" href="">Reintentar</a></div>';
}

function render() {
  const q = $('q').value.toLowerCase();

  const filas = data.members
    .filter((m) => (m.name + ' ' + m.email).toLowerCase().includes(q))
    .map((m) => {
      const s = m.subscription;
      const activa = s && (s.status === 'active' || s.status === 'trialing');
      let estado = s ? (ESTADOS_SUB[s.status] || s.status) : 'sin suscripción';
      let clase = activa ? 'on' : 'off';
      if (activa && s.cancel) { estado += ' · se cancela al final'; clase = 'warn'; }

      const boton = s
        ? '<button class="mini" type="button" data-id="' + esc(s.id) + '" data-cancel="' + (s.cancel ? '1' : '0') +
          '" data-name="' + esc(m.name) + '">' + (s.cancel ? 'Reactivar' : 'Cancelar') + '</button>'
        : '—';

      return '<tr>' +
        '<td><b>' + esc(m.name) + '</b><br><small>' + esc(m.email) + '</small></td>' +
        '<td><span class="status ' + clase + '">' + esc(estado) + '</span></td>' +
        '<td>' + (s ? esc(euro(s.amount / 100)) + ' / ' + (s.interval === 'month' ? 'mes' : esc(s.interval)) : '—') + '</td>' +
        '<td>' + (s ? fecha(s.next) : '—') + '</td>' +
        '<td>' + boton + '</td>' +
        '</tr>';
    });

  $('members').innerHTML = filas.join('') || '<tr><td colspan="5">Sin resultados</td></tr>';

  $('invoices').innerHTML =
    data.invoices
      .map((i) =>
        '<tr><td>' + esc(i.number) + '</td><td>' + esc(i.email) + '</td><td>' +
        esc(ESTADOS_FACTURA[i.status] || i.status) + '</td><td>' + esc(euro(i.amount)) + '</td><td>' + fecha(i.date) + '</td></tr>')
      .join('') || '<tr><td colspan="5">Sin facturas</td></tr>';
}

async function toggle(id, cancelada, nombre) {
  if (!cancelada && !confirm('¿Cancelar la suscripción de ' + nombre + ' al final del periodo?')) return;
  await fetch(cancelada ? '/api/admin/reactivate' : '/api/admin/cancel', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ subscriptionId: id })
  });
  load();
}

$('q').addEventListener('input', render);
$('refresh').addEventListener('click', load);
$('members').addEventListener('click', (e) => {
  const b = e.target.closest('button[data-id]');
  if (b) toggle(b.dataset.id, b.dataset.cancel === '1', b.dataset.name);
});

load();
