// Admin de la cuota: ver quién ha pagado y reiniciar los botones.
// /api/admin/cuota está protegido con usuario y clave (el navegador los pide).

const $ = (id) => document.getElementById(id);
const esc = (s) =>
  String(s ?? '').replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));

let people = [];
let filter = 'all';

function showGate(titulo, texto) {
  document.querySelector('main').innerHTML =
    '<div class="gate"><h1>' + esc(titulo) + '</h1><p>' + esc(texto) +
    '</p><a class="btn" href="">Reintentar</a></div>';
}

function render() {
  const paid = people.filter((p) => p.paid).length;
  $('stat-paid').textContent = paid;
  $('stat-receipt').textContent = people.filter((p) => p.receipt).length;
  $('stat-missing').textContent = people.length - paid;

  const shown = people.filter((p) => filter === 'all' || (filter === 'paid' ? p.paid : !p.paid));
  $('people').innerHTML = shown.length ? shown
    .map((p) =>
      '<tr><td><b>' + esc(p.name) + '</b></td>' +
      '<td><span class="status ' + (p.paid ? 'on' : 'off') + '">' + (p.paid ? 'HA PAGADO' : 'NO HA PAGADO') + '</span></td>' +
      '<td>' + (p.receipt ? '✅ enviado' : '—') + '</td>' +
      '<td><button class="mini" type="button" data-action="toggle" data-name="' + esc(p.name) + '">' +
      (p.paid ? 'Marcar como NO pagado' : 'Marcar como pagado') + '</button> ' +
      '<button class="mini danger" type="button" data-action="remove" data-name="' + esc(p.name) + '">Quitar</button></td></tr>')
    .join('') : '<tr><td colspan="4">Nadie en esta lista.</td></tr>';

  document.querySelectorAll('[data-filter]').forEach((b) => {
    b.classList.toggle('active', b.dataset.filter === filter);
  });
}

async function load() {
  let res;
  try {
    res = await fetch('/api/admin/cuota');
  } catch (_) {
    return showGate('Sin conexión', 'No se ha podido conectar con el servidor.');
  }
  if (!res.ok) return showGate('Acceso denegado', 'Entra con el usuario y la clave de administrador.');
  people = (await res.json()).people;
  render();
}

async function toggle(name) {
  const p = people.find((x) => x.name === name);
  if (!p) return;
  const paid = !p.paid;
  if (!paid && !confirm('¿Marcar a ' + name + ' como NO pagado? Se borra también el estado del justificante.')) return;
  const res = await fetch('/api/admin/cuota/status', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ name, paid })
  });
  if (!res.ok) return alert('No se ha podido cambiar.');
  people = (await res.json()).people;
  render();
}

async function reset(name) {
  const texto = name ? '¿Reiniciar a ' + name + '?' : '¿Reiniciar los botones de TODOS a "No he pagado"?';
  if (!confirm(texto)) return;
  const res = await fetch('/api/admin/cuota/reset', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(name ? { name } : {})
  });
  if (!res.ok) return alert('No se ha podido reiniciar.');
  people = (await res.json()).people;
  render();
}

async function remove(name) {
  if (!confirm('¿Quitar a ' + name + ' de la lista? Dejará de salir en la web.')) return;
  const res = await fetch('/api/admin/cuota/remove', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ name })
  });
  if (!res.ok) return alert('No se ha podido quitar.');
  people = (await res.json()).people;
  render();
}

async function add() {
  const name = $('newName').value.trim();
  if (!name) return;
  const res = await fetch('/api/admin/cuota/add', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ name })
  });
  const data = await res.json().catch(() => ({}));
  if (!res.ok) return alert(data.error || 'No se ha podido añadir.');
  $('newName').value = '';
  people = data.people;
  render();
}

$('addBtn').addEventListener('click', add);
$('newName').addEventListener('keydown', (e) => { if (e.key === 'Enter') add(); });
$('refresh').addEventListener('click', load);
$('resetAll').addEventListener('click', () => reset());
$('people').addEventListener('click', (e) => {
  const b = e.target.closest('button[data-name]');
  if (!b) return;
  if (b.dataset.action === 'remove') remove(b.dataset.name);
  else toggle(b.dataset.name);
});
document.querySelectorAll('[data-filter]').forEach((b) => {
  b.addEventListener('click', () => { filter = b.dataset.filter; render(); });
});

load();
