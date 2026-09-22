// Álbum de la peña.
//   GET    /api/photos             → lista de fotos (con sus direcciones en Cloudinary)
//   POST   /api/photos             → subir fotos (server.js)
//   DELETE /api/admin/photos/:id   → borrar (solo admin: abre fotos.html?admin=1)

const $ = (id) => document.getElementById(id);

const IS_ADMIN = new URLSearchParams(location.search).get('admin') === '1';
const MAX_SELECTED = 30;   // fotos por tanda
const CHUNK = 6;           // fotos por petición
const MAX_SIDE = 2000;     // las fotos se reducen en el móvil antes de subirlas

let photos = [];
let current = -1;

// ---------- Utilidades ----------
const store = {
  get(k) { try { return localStorage.getItem(k) || ''; } catch { return ''; } },
  set(k, v) { try { localStorage.setItem(k, v); } catch { /* sin almacenamiento: no pasa nada */ } }
};

const fecha = (ms) =>
  new Date(ms).toLocaleDateString('es-ES', { day: 'numeric', month: 'long', year: 'numeric' });

const plural = (n, uno, varios) => `${n} ${n === 1 ? uno : varios}`;

function say(text, kind) {
  const el = $('msg');
  el.textContent = text || '';
  el.className = 'msg' + (kind ? ' ' + kind : '');
}

// ---------- Galería ----------
async function loadPhotos() {
  $('loadError').textContent = '';
  try {
    const res = await fetch('/api/photos', { cache: 'no-store' });
    const data = await res.json().catch(() => ({}));
    if (!res.ok) throw new Error(data.error || 'No se han podido cargar las fotos.');

    photos = data.photos || [];
    $('codeField').hidden = !data.codeRequired;
    renderGallery();
  } catch (e) {
    $('loadError').textContent = e.message || 'No se han podido cargar las fotos.';
  }
}

function renderGallery() {
  const grid = $('grid');
  grid.replaceChildren();

  $('empty').hidden = photos.length > 0;
  $('count').textContent = photos.length ? plural(photos.length, 'foto', 'fotos') : '';

  photos.forEach((p, i) => {
    const btn = document.createElement('button');
    btn.type = 'button';
    btn.className = 'ph';
    btn.setAttribute('aria-label', p.name ? `Abrir foto de ${p.name}` : 'Abrir foto');

    const img = new Image();
    img.src = p.thumb;
    img.alt = '';
    img.width = 480;
    img.height = 480;
    img.loading = 'lazy';
    img.decoding = 'async';

    const cap = document.createElement('span');
    cap.className = 'ph-cap';
    cap.textContent = p.name || 'Traketero';

    btn.append(img, cap);
    btn.addEventListener('click', () => openAt(i));
    grid.append(btn);
  });
}

// ---------- Visor ----------
const lb = $('lb');

function showCurrent() {
  const p = photos[current];
  if (!p) return;
  $('lbImg').src = p.url;
  $('lbImg').alt = p.name ? `Foto de ${p.name}` : 'Foto de la peña';
  $('lbName').textContent = p.name || 'Traketero';
  $('lbDate').textContent = fecha(p.date);
  $('lbDl').href = p.download;
  $('lbPrev').hidden = $('lbNext').hidden = photos.length < 2;
  $('lbDel').hidden = !IS_ADMIN;
  $('lbEditName').hidden = !IS_ADMIN;
}

function openAt(i) {
  current = i;
  showCurrent();
  if (!lb.open) lb.showModal();
}

function step(delta) {
  if (!photos.length) return;
  current = (current + delta + photos.length) % photos.length;
  showCurrent();
}

$('lbPrev').addEventListener('click', () => step(-1));
$('lbNext').addEventListener('click', () => step(1));
$('lbClose').addEventListener('click', () => lb.close());

// La app envuelta en .apk usa un WebView de Android que no tiene gestor de
// descargas: el enlace "Descargar" se ve pero no hace nada. Solo en ese caso
// (se detecta por la marca "; wv)" del user-agent, que el navegador normal no
// tiene) usamos el panel de "Compartir" de Android para poder guardar la foto.
// En el navegador de siempre esto no se activa: sigue funcionando como hasta ahora.
const IS_APP_WEBVIEW = /; wv\)/.test(navigator.userAgent);

$('lbDl').addEventListener('click', async (e) => {
  if (!IS_APP_WEBVIEW) return; // navegador normal: se descarga con el enlace de toda la vida

  const p = photos[current];
  if (!p) return;
  e.preventDefault();

  try {
    const res = await fetch(p.download);
    const blob = await res.blob();
    const file = new File([blob], (p.name || 'foto').replace(/\s+/g, '_') + '.jpg', {
      type: blob.type || 'image/jpeg'
    });
    if (navigator.canShare && navigator.canShare({ files: [file] })) {
      await navigator.share({ files: [file] });
      return;
    }
  } catch { /* seguimos abajo con el último recurso */ }

  window.open(p.download, '_blank'); // último recurso dentro de la app
});
lb.addEventListener('click', (e) => { if (e.target === lb) lb.close(); }); // clic en el fondo
lb.addEventListener('close', () => { $('lbImg').removeAttribute('src'); });
document.addEventListener('keydown', (e) => {
  if (!lb.open) return;
  if (e.key === 'ArrowLeft') step(-1);
  if (e.key === 'ArrowRight') step(1);
});

$('lbEditName').addEventListener('click', async () => {
  const p = photos[current];
  if (!p) return;

  const nuevo = prompt('Nombre para esta foto (déjalo en blanco para que salga como "Traketero"):', p.name || '');
  if (nuevo === null) return; // ha pulsado cancelar

  try {
    const res = await fetch('/api/admin/photos/' + encodeURIComponent(p.id) + '/name', {
      method: 'PATCH',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ name: nuevo })
    });
    const data = await res.json().catch(() => ({}));
    if (!res.ok) throw new Error(res.status === 401 ? 'Necesitas entrar como administrador.' : (data.error || 'No se pudo cambiar el nombre.'));

    p.name = data.name;
    showCurrent();
    renderGallery();
  } catch (e) {
    alert(e.message);
  }
});

$('lbDel').addEventListener('click', async () => {
  const p = photos[current];
  if (!p || !confirm('¿Borrar esta foto para siempre?')) return;
  try {
    const res = await fetch('/api/admin/photos/' + encodeURIComponent(p.id), { method: 'DELETE' });
    if (!res.ok) throw new Error(res.status === 401 ? 'Necesitas entrar como administrador.' : 'No se pudo borrar.');
    photos.splice(current, 1);
    renderGallery();
    if (!photos.length) lb.close();
    else { current = Math.min(current, photos.length - 1); showCurrent(); }
  } catch (e) {
    alert(e.message);
  }
});

// ---------- Elegir fotos ----------
const fileInput = $('file');
const previews = $('previews');
let selected = [];

fileInput.addEventListener('change', () => {
  selected = Array.from(fileInput.files || []).filter((f) => /^image\//.test(f.type)).slice(0, MAX_SELECTED);
  const tooMany = (fileInput.files || []).length > MAX_SELECTED;

  previews.replaceChildren();
  selected.slice(0, 12).forEach((f) => {
    const img = new Image();
    img.alt = '';
    img.src = URL.createObjectURL(f);
    img.onload = () => URL.revokeObjectURL(img.src);
    previews.append(img);
  });

  $('pickText').textContent = selected.length
    ? `${plural(selected.length, 'foto elegida', 'fotos elegidas')} · cambiar`
    : 'Elegir fotos';
  $('send').disabled = selected.length === 0;
  say(tooMany ? `Solo se pueden subir ${MAX_SELECTED} fotos cada vez. He cogido las primeras.` : '', tooMany ? 'err' : '');
});

// ---------- Subir ----------
// Reduce la foto en el móvil para que suba rápido (el servidor la vuelve a optimizar).
async function shrink(file) {
  if (!/^image\/(jpeg|png|webp)$/.test(file.type)) return file;
  const url = URL.createObjectURL(file);
  try {
    const img = new Image();
    img.src = url;
    await img.decode();

    const scale = Math.min(1, MAX_SIDE / Math.max(img.naturalWidth, img.naturalHeight));
    if (scale === 1 && file.size < 1.5 * 1024 * 1024) return file;

    const canvas = document.createElement('canvas');
    canvas.width = Math.round(img.naturalWidth * scale);
    canvas.height = Math.round(img.naturalHeight * scale);
    const ctx = canvas.getContext('2d');
    ctx.fillStyle = '#fff';
    ctx.fillRect(0, 0, canvas.width, canvas.height);
    ctx.drawImage(img, 0, 0, canvas.width, canvas.height);

    const blob = await new Promise((ok) => canvas.toBlob(ok, 'image/jpeg', 0.86));
    if (!blob || blob.size >= file.size) return file;
    const base = (file.name || 'foto').replace(/\.[^.]+$/, '') || 'foto';
    return new File([blob], base + '.jpg', { type: 'image/jpeg' });
  } catch {
    return file;
  } finally {
    URL.revokeObjectURL(url);
  }
}

function sendChunk(files, name, code, onProgress) {
  return new Promise((resolve, reject) => {
    const fd = new FormData();
    files.forEach((f) => fd.append('photos', f, f.name));
    fd.append('name', name);
    if (code) fd.append('code', code);

    const xhr = new XMLHttpRequest();
    xhr.open('POST', '/api/photos');
    xhr.upload.onprogress = (e) => { if (e.lengthComputable) onProgress(e.loaded / e.total); };
    xhr.onerror = () => reject(new Error('Sin conexión. Inténtalo otra vez.'));
    xhr.onload = () => {
      let data = {};
      try { data = JSON.parse(xhr.responseText); } catch { /* respuesta no JSON */ }
      if (xhr.status >= 200 && xhr.status < 300) resolve(data);
      else reject(new Error(data.error || 'No se han podido subir las fotos.'));
    };
    xhr.send(fd);
  });
}

$('name').value = store.get('traketeros_name');
$('code').value = store.get('traketeros_code');

$('form').addEventListener('submit', async (e) => {
  e.preventDefault();
  if (!selected.length) return;

  const name = $('name').value.trim();
  const code = $('code').value.trim();
  const send = $('send');
  const bar = $('bar');

  send.disabled = true;
  bar.hidden = false;
  bar.value = 0;
  say('Preparando las fotos…');

  let done = 0;
  let uploaded = 0;
  try {
    for (let i = 0; i < selected.length; i += CHUNK) {
      const group = await Promise.all(selected.slice(i, i + CHUNK).map(shrink));
      say(`Subiendo ${Math.min(i + CHUNK, selected.length)} de ${selected.length}…`);
      const res = await sendChunk(group, name, code, (f) => {
        bar.value = ((done + group.length * f) / selected.length) * 100;
      });
      done += group.length;
      uploaded += res.added || 0;
    }

    store.set('traketeros_name', name);
    store.set('traketeros_code', code);

    fileInput.value = '';
    selected = [];
    previews.replaceChildren();
    $('pickText').textContent = 'Elegir fotos';
    say(`¡Listo! ${plural(uploaded, 'foto subida', 'fotos subidas')} 🔥`, 'ok');
    await loadPhotos();
  } catch (err) {
    const extra = uploaded ? ` (${plural(uploaded, 'foto subida', 'fotos subidas')} antes del fallo)` : '';
    say((err.message || 'No se han podido subir las fotos.') + extra, 'err');
    if (uploaded) loadPhotos();
    send.disabled = false;
  } finally {
    bar.hidden = true;
    if (!selected.length) send.disabled = true;
  }
});

// ---------- Tiempo real ----------
// El servidor avisa por aquí en cuanto alguien sube o borra una foto (la suya
// o la de otro), así que recargamos la lista sola, sin que nadie tenga que
// refrescar la página a mano. Si se corta la conexión (móvil, wifi...), el
// propio navegador la reconecta solo.
function listenForChanges() {
  try {
    const es = new EventSource('/api/photos/stream');
    es.onmessage = (e) => {
      try {
        const data = JSON.parse(e.data);
        if (data.type === 'photos-changed') loadPhotos();
      } catch { /* mensaje no válido: se ignora */ }
    };
  } catch { /* el navegador no soporta EventSource: no pasa nada, se queda como antes */ }
}

loadPhotos();
listenForChanges();
