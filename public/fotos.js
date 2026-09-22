// Álbum de la peña.
//   GET    /api/photos             → lista de fotos (con sus direcciones en Cloudinary)
//   POST   /api/photos             → subir fotos (server.js)
//   DELETE /api/admin/photos/:id   → borrar (solo admin: abre fotos.html?admin=1)

const $ = (id) => document.getElementById(id);

const IS_ADMIN = new URLSearchParams(location.search).get('admin') === '1';

// Si esto existe, estamos dentro de la app Android (ver MainActivity.java),
// que expone este puente para poder guardar descargas de verdad en el
// dispositivo (el truco del blob de más abajo no funciona solo en un
// WebView).
const ANDROID_APP =
  window.AndroidDownloader && typeof window.AndroidDownloader.guardarArchivo === 'function'
    ? window.AndroidDownloader
    : null;

function blobABase64(blob) {
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onloadend = () => resolve(String(reader.result || '').split(',')[1] || '');
    reader.onerror = reject;
    reader.readAsDataURL(blob);
  });
}
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
  $('lbDl').dataset.name = p.name || 'traketeros';
  $('lbPrev').hidden = $('lbNext').hidden = photos.length < 2;
  $('lbDel').hidden = !IS_ADMIN;
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
lb.addEventListener('click', (e) => { if (e.target === lb) lb.close(); }); // clic en el fondo
lb.addEventListener('close', () => { $('lbImg').removeAttribute('src'); });
document.addEventListener('keydown', (e) => {
  if (!lb.open) return;
  if (e.key === 'ArrowLeft') step(-1);
  if (e.key === 'ArrowRight') step(1);
});

// Descargar la foto al móvil (no solo abrirla en el navegador).
// En iOS/Android, un <a href> normal a menudo solo abre la imagen a pantalla
// completa aunque el servidor mande Content-Disposition: attachment. Bajamos
// la foto como blob y forzamos la descarga desde ahí, que sí funciona.
$('lbDl').addEventListener('click', async (e) => {
  const a = e.currentTarget;
  const url = a.href;
  if (!url || url === '#') return;

  e.preventDefault();
  const originalText = a.textContent;

  const safeName = (a.dataset.name || 'traketeros')
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/(^-|-$)/g, '') || 'traketeros';
  const fileName = `traketeros-${safeName}.jpg`;

  try {
    a.textContent = 'Descargando…';
    const res = await fetch(url, { cache: 'no-store' });
    if (!res.ok) throw new Error('fallo al descargar');
    const blob = await res.blob();

    if (ANDROID_APP) {
      // Dentro de la app: se lo pasamos a Android para que lo guarde de
      // verdad en el dispositivo (en Descargas).
      const base64 = await blobABase64(blob);
      ANDROID_APP.guardarArchivo(base64, fileName, blob.type || 'image/jpeg');
    } else {
      // Navegador normal (móvil o escritorio): truco del blob de siempre.
      const blobUrl = URL.createObjectURL(blob);
      const tmp = document.createElement('a');
      tmp.href = blobUrl;
      tmp.download = fileName;
      document.body.appendChild(tmp);
      tmp.click();
      tmp.remove();
      setTimeout(() => URL.revokeObjectURL(blobUrl), 10_000);
    }
  } catch {
    // Si algo falla (p. ej. sin conexión), al menos abrimos la foto
    // para que se pueda guardar a mano.
    window.open(url, '_blank', 'noopener');
  } finally {
    a.textContent = originalText;
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

loadPhotos();
