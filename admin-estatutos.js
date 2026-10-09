// Admin de estatutos: ver sugerencias, descargar/importar JSON, borrar.
// /api/admin/estatutos está protegido con usuario y clave (el navegador los pide).

const $ = (id) => document.getElementById(id);
const esc = (s) =>
  String(s ?? '').replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
const fechaHora = (iso) => new Date(iso).toLocaleString('es-ES', { dateStyle: 'short', timeStyle: 'short' });

let list = [];

function showGate(titulo, texto) {
  document.querySelector('main').innerHTML =
    '<div class="gate"><h1>' + esc(titulo) + '</h1><p>' + esc(texto) +
    '</p><a class="btn" href="">Reintentar</a></div>';
}

function render() {
  const q = $('q').value.toLowerCase();
  $('stat-total').textContent = list.length;
  $('stat-last').textContent = list.length ? fechaHora(list[0].date) : '—';
  const shown = list.filter((s) => (s.name + ' ' + s.text).toLowerCase().includes(q));
  $('rows').innerHTML = shown.length ? shown
    .map((s) =>
      '<tr><td>' + esc(fechaHora(s.date)) + '</td><td><b>' + esc(s.name || 'Anónimo') + '</b></td>' +
      '<td style="white-space:pre-wrap;min-width:260px">' + esc(s.text) + '</td>' +
      '<td><button class="mini danger" type="button" data-id="' + esc(s.id) + '">Borrar</button></td></tr>')
    .join('') : '<tr><td colspan="4">Sin sugerencias.</td></tr>';
}

async function load() {
  let res;
  try {
    res = await fetch('/api/admin/estatutos');
  } catch (_) {
    return showGate('Sin conexión', 'No se ha podido conectar con el servidor.');
  }
  if (!res.ok) return showGate('Acceso denegado', 'Entra con el usuario y la clave de administrador.');
  list = (await res.json()).suggestions;
  render();
}

$('q').addEventListener('input', render);
$('refresh').addEventListener('click', load);

$('rows').addEventListener('click', async (e) => {
  const b = e.target.closest('button[data-id]');
  if (!b || !confirm('¿Borrar esta sugerencia?')) return;
  await fetch('/api/admin/estatutos/' + encodeURIComponent(b.dataset.id), { method: 'DELETE' });
  load();
});

$('importBtn').addEventListener('click', async () => {
  const msg = $('importMsg');
  const f = $('file').files[0];
  msg.className = 'msg';
  if (!f) { msg.className = 'msg err'; msg.textContent = 'Elige primero el archivo JSON.'; return; }
  const mode = document.querySelector('input[name="mode"]:checked').value;
  if (mode === 'replace' && !confirm('Esto sustituye TODAS las sugerencias actuales por las del archivo. ¿Seguro?')) return;
  try {
    const data = JSON.parse(await f.text());
    const res = await fetch('/api/admin/estatutos/import', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ mode, data })
    });
    const out = await res.json().catch(() => ({}));
    if (!res.ok) throw new Error(out.error || 'No se ha podido importar.');
    msg.className = 'msg ok';
    msg.textContent = 'Hecho: ' + out.imported + ' leídas, ' + out.total + ' en total.';
    $('file').value = '';
    load();
  } catch (err) {
    msg.className = 'msg err';
    msg.textContent = err instanceof SyntaxError ? 'Ese archivo no es un JSON válido.' : err.message;
  }
});

load();
