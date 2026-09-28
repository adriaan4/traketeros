// Admin de la cuota: ver quién ha pagado y reiniciar los botones.
// /api/admin/cuota está protegido con usuario y clave (el navegador los pide).

const $ = (id) => document.getElementById(id);
const esc = (s) =>
  String(s ?? '').replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));

let people = [];

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

  $('people').innerHTML = people
    .map((p) =>
      '<tr><td><b>' + esc(p.name) + '</b></td>' +
      '<td><span class="status ' + (p.paid ? 'on' : 'off') + '">' + (p.paid ? 'HA PAGADO' : 'NO HA PAGADO') + '</span></td>' +
      '<td>' + (p.receipt ? '✅ enviado' : '—') + '</td>' +
      '<td><button class="mini" type="button" data-name="' + esc(p.name) + '">Reiniciar</button></td></tr>')
    .join('');
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

$('refresh').addEventListener('click', load);
$('resetAll').addEventListener('click', () => reset());
$('people').addEventListener('click', (e) => {
  const b = e.target.closest('button[data-name]');
  if (b) reset(b.dataset.name);
});

load();
