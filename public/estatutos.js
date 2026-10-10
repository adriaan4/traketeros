// Estatutos: contraseña -> documento + sugerencias.
// La contraseña se comprueba en el servidor; el PDF solo se sirve con la sesión.

const $ = (id) => document.getElementById(id);
const esc = (s) =>
  String(s ?? '').replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));

const json = { 'Content-Type': 'application/json' };

function showGate() {
  $('content').hidden = true;
  $('logout').hidden = true;
  $('gate').hidden = false;
  $('pw').focus();
}

function fechaHora(iso) {
  const d = new Date(iso);
  return d.toLocaleDateString('es-ES', { day: 'numeric', month: 'short', year: 'numeric' }) + ' · ' +
    d.toLocaleTimeString('es-ES', { hour: '2-digit', minute: '2-digit' });
}

function renderList(list) {
  $('sugCount').textContent = list.length ? list.length + (list.length === 1 ? ' mensaje' : ' mensajes') : '';
  $('sugEmpty').hidden = list.length > 0;
  $('sugList').innerHTML = list
    .map((s) =>
      '<article class="est-card"><p>' + esc(s.text).replace(/\n/g, '<br>') + '</p>' +
      '<small><b>' + esc(s.name || 'Anónimo') + '</b> · ' + esc(fechaHora(s.date)) + '</small></article>')
    .join('');
}

async function loadList() {
  try {
    const res = await fetch('/api/estatutos/sugerencias');
    if (res.status === 401) return showGate();
    renderList((await res.json()).suggestions || []);
  } catch (_) {
    $('sugEmpty').hidden = false;
    $('sugEmpty').textContent = 'No se han podido cargar las sugerencias y quejas.';
  }
}

function showContent() {
  $('gate').hidden = true;
  $('content').hidden = false;
  $('logout').hidden = false;
  // Los móviles no pintan bien un PDF dentro de la página: allí solo el botón
  const puedeEmbeber = window.innerWidth >= 800 && navigator.pdfViewerEnabled !== false && !/Android|iPhone|iPad|iPod/i.test(navigator.userAgent);
  if (puedeEmbeber) {
    $('pdfFrame').src = '/api/estatutos/pdf#view=FitH';
    $('pdfFrame').hidden = false;
  }
  loadList();
}

async function init() {
  try {
    const res = await fetch('/api/estatutos/session');
    if (res.ok) return showContent();
  } catch (_) {}
  showGate();
}

$('loginForm').addEventListener('submit', async (e) => {
  e.preventDefault();
  const msg = $('loginMsg');
  const pw = $('pw').value;
  if (!pw) { msg.className = 'msg err'; msg.textContent = 'Escribe la contraseña.'; return; }
  $('loginBtn').disabled = true;
  msg.className = 'msg'; msg.textContent = '';
  try {
    const res = await fetch('/api/estatutos/login', { method: 'POST', headers: json, body: JSON.stringify({ password: pw }) });
    const data = await res.json().catch(() => ({}));
    if (!res.ok) throw new Error(data.error || 'No se ha podido entrar.');
    $('pw').value = '';
    showContent();
  } catch (err) {
    msg.className = 'msg err';
    msg.textContent = err.message;
  } finally {
    $('loginBtn').disabled = false;
  }
});

$('sugForm').addEventListener('submit', async (e) => {
  e.preventDefault();
  const msg = $('sugMsg');
  const text = $('sugText').value.trim();
  if (!text) { msg.className = 'msg err'; msg.textContent = 'Escribe tu sugerencia o queja.'; return; }
  $('sugBtn').disabled = true;
  msg.className = 'msg'; msg.textContent = 'Enviando…';
  try {
    const res = await fetch('/api/estatutos/sugerencias', {
      method: 'POST', headers: json,
      body: JSON.stringify({ name: $('sugName').value, text })
    });
    if (res.status === 401) return showGate();
    const data = await res.json().catch(() => ({}));
    if (!res.ok) throw new Error(data.error || 'No se ha podido enviar.');
    $('sugText').value = '';
    msg.className = 'msg ok';
    msg.textContent = '¡Enviada! Gracias 🙌';
    loadList();
  } catch (err) {
    msg.className = 'msg err';
    msg.textContent = err.message;
  } finally {
    $('sugBtn').disabled = false;
  }
});

$('logout').addEventListener('click', async () => {
  await fetch('/api/estatutos/logout', { method: 'POST' }).catch(() => {});
  $('pdfFrame').src = 'about:blank';
  showGate();
});

init();
