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
let pastPhotos = [];
let lbList = photos;   // lista que está viendo el visor (álbum o fotos del pasado)
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

    if (p.desc) {
      const desc = document.createElement('span');
      desc.className = 'ph-desc';
      desc.textContent = p.desc;
      btn.append(desc);
    }

    btn.addEventListener('click', () => openAt(i));
    grid.append(btn);
  });
}

// ---------- Visor ----------
const lb = $('lb');

function showCurrent() {
  const p = lbList[current];
  if (!p) return;
  // Las fotos del pasado se titulan "San Roque 2019" y no enseñan fecha de subida
  const title = p.past ? `${p.fiesta} ${p.year}` : (p.name || 'Traketero');
  $('lbImg').src = p.url;
  $('lbImg').alt = p.past ? `Foto de ${title}` : (p.name ? `Foto de ${p.name}` : 'Foto de la peña');
  $('lbName').textContent = title;
  $('lbDesc').textContent = p.desc || '';
  $('lbDesc').hidden = !p.desc;
  $('lbDate').textContent = p.past ? '' : fecha(p.date);
  $('lbDl').href = p.download;
  $('lbDl').dataset.name = p.past ? title : (p.name || 'traketeros');
  $('lbPrev').hidden = $('lbNext').hidden = lbList.length < 2;
  $('lbDel').hidden = !IS_ADMIN;
  $('lbMove').hidden = !(IS_ADMIN && p.past);
}

function openAt(i, list = photos) {
  lbList = list;
  current = i;
  showCurrent();
  if (!lb.open) lb.showModal();
}

function step(delta) {
  if (!lbList.length) return;
  current = (current + delta + lbList.length) % lbList.length;
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
  const p = lbList[current];
  if (!p || !confirm('¿Borrar esta foto para siempre?')) return;
  try {
    const url = (p.past ? '/api/admin/photos/past/' : '/api/admin/photos/') + encodeURIComponent(p.id);
    const res = await fetch(url, { method: 'DELETE' });
    if (!res.ok) throw new Error(res.status === 401 ? 'Necesitas entrar como administrador.' : 'No se pudo borrar.');
    lbList.splice(current, 1);
    if (p.past) { pastPhotos = pastPhotos.filter((x) => x.id !== p.id); renderPast(); } else renderGallery();
    if (!lbList.length) lb.close();
    else { current = Math.min(current, lbList.length - 1); showCurrent(); }
  } catch (e) {
    alert(e.message);
  }
});

$('lbMove').addEventListener('click', async () => {
  const p = lbList[current];
  if (!p || !p.past) return;
  const fiesta = prompt('¿A qué fiesta la muevo?', p.fiesta);
  if (fiesta === null) return;
  const year = prompt('¿De qué año?', String(p.year || ''));
  if (year === null) return;
  try {
    const res = await fetch('/api/admin/photos/past/' + encodeURIComponent(p.id), {
      method: 'PATCH',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ fiesta: fiesta.trim(), year: year.trim() })
    });
    const data = await res.json().catch(() => ({}));
    if (!res.ok) throw new Error(res.status === 401 ? 'Necesitas entrar como administrador.' : (data.error || 'No se pudo mover.'));
    p.fiesta = data.fiesta;
    p.year = data.year;
    lb.close();
    renderPast();
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

function sendChunk(files, name, desc, code, onProgress) {
  return new Promise((resolve, reject) => {
    const fd = new FormData();
    files.forEach((f) => fd.append('photos', f, f.name));
    fd.append('name', name);
    fd.append('desc', desc);
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
  const desc = $('desc').value.trim();
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
      const res = await sendChunk(group, name, desc, code, (f) => {
        bar.value = ((done + group.length * f) / selected.length) * 100;
      });
      done += group.length;
      uploaded += res.added || 0;
    }

    store.set('traketeros_name', name);
    store.set('traketeros_code', code);

    $('desc').value = ''; // la descripción es de esas fotos concretas, no se recuerda para la próxima
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

// =====================================================================
// FOTOS DEL PASADO (públicas; solo el admin ve el formulario para subir)
//   GET    /api/photos/past              → lista pública
//   POST   /api/admin/photos/past        → subir (solo admin)
//   DELETE /api/admin/photos/past/:id    → borrar (solo admin)
// =====================================================================
const PAST_MAX_SELECTED = 100; // fotos por tanda en las del pasado
const PAST_CHUNK = 20;         // fotos por petición (máx. 20, el servidor no admite más)
let pastFilter = ''; // '' = todas las fiestas

async function loadPast() {
  $('pastLoadError').textContent = '';
  try {
    const res = await fetch('/api/photos/past', { cache: 'no-store' });
    const data = await res.json().catch(() => ({}));
    if (!res.ok) throw new Error(data.error || 'No se han podido cargar las fotos del pasado.');
    pastPhotos = data.photos || [];
    renderPast();
  } catch (e) {
    $('pastLoadError').textContent = e.message || 'No se han podido cargar las fotos del pasado.';
  }
}

function renderPast() {
  const fiestas = [...new Set(pastPhotos.map((p) => p.fiesta))].sort((a, b) => a.localeCompare(b, 'es'));
  if (pastFilter && !fiestas.includes(pastFilter)) pastFilter = '';

  $('pastEmpty').hidden = pastPhotos.length > 0;
  $('pastCount').textContent = pastPhotos.length ? plural(pastPhotos.length, 'foto', 'fotos') : '';

  // Sugerencias para el campo "Fiesta" del formulario: las ya usadas + las de siempre
  const sugeridas = new Map();
  [...fiestas, 'San Miguel', 'San Roque', 'Pilares'].forEach((f) => {
    if (!sugeridas.has(f.toLowerCase())) sugeridas.set(f.toLowerCase(), f);
  });
  $('pastFiestaList').replaceChildren(...[...sugeridas.values()].map((f) => {
    const o = document.createElement('option');
    o.value = f;
    return o;
  }));

  // Botones para filtrar por fiesta
  const filters = $('pastFilters');
  filters.replaceChildren();
  filters.hidden = fiestas.length < 2;
  [['', 'Todas'], ...fiestas.map((f) => [f, f])].forEach(([value, label]) => {
    const b = document.createElement('button');
    b.type = 'button';
    b.className = 'past-chip';
    b.textContent = label;
    b.setAttribute('aria-pressed', String(pastFilter === value));
    b.addEventListener('click', () => { pastFilter = value; renderPast(); });
    filters.append(b);
  });

  // Grupos "San Roque · 2019": años más recientes primero
  const visibles = pastPhotos.filter((p) => !pastFilter || p.fiesta === pastFilter);
  const groups = new Map();
  for (const p of visibles) {
    const key = `${p.year}|${p.fiesta.toLowerCase()}`;
    if (!groups.has(key)) groups.set(key, { fiesta: p.fiesta, year: p.year, items: [] });
    groups.get(key).items.push(p);
  }
  const ordered = [...groups.values()].sort((a, b) => b.year - a.year || a.fiesta.localeCompare(b.fiesta, 'es'));

  const wrap = $('pastGroups');
  wrap.replaceChildren();
  for (const g of ordered) {
    const sec = document.createElement('div');
    sec.className = 'past-group';

    const h = document.createElement('h3');
    h.textContent = g.year ? `${g.fiesta} ${g.year}` : g.fiesta;
    const small = document.createElement('small');
    small.textContent = plural(g.items.length, 'foto', 'fotos');
    h.append(small);

    const grid = document.createElement('div');
    grid.className = 'gallery';
    g.items.forEach((p, i) => {
      const btn = document.createElement('button');
      btn.type = 'button';
      btn.className = 'ph';
      btn.setAttribute('aria-label', `Abrir foto de ${g.fiesta} ${g.year || ''}`.trim());

      const img = new Image();
      img.src = p.thumb;
      img.alt = '';
      img.width = 480;
      img.height = 480;
      img.loading = 'lazy';
      img.decoding = 'async';
      btn.append(img);

      if (p.desc) {
        const d = document.createElement('span');
        d.className = 'ph-desc';
        d.textContent = p.desc;
        btn.append(d);
      }
      // El visor navega solo por las fotos de este grupo
      btn.addEventListener('click', () => openAt(i, g.items));
      grid.append(btn);
    });

    sec.append(h, grid);
    wrap.append(sec);
  }
}

// ---------- Admin: subir fotos del pasado ----------
function sayPast(text, kind) {
  const el = $('pastMsg');
  el.textContent = text || '';
  el.className = 'msg' + (kind ? ' ' + kind : '');
}

{
  const form = $('pastForm');
  $('pastYear').max = String(new Date().getFullYear());
  $('pastCode').value = store.get('traketeros_past_code');

  if (IS_ADMIN) {
    // El admin no necesita contraseña. Abre el aviso de usuario y clave del navegador nada más entrar.
    $('pastCodeField').hidden = true;
    fetch('/api/admin/ping', { cache: 'no-store' })
      .then((r) => { if (!r.ok) sayPast('Necesitas entrar como administrador para subir fotos.', 'err'); })
      .catch(() => {});
  }

  const pastInput = $('pastFile');
  let pastSelected = [];

  const refreshSend = () => {
    $('pastSend').disabled = pastSelected.length === 0;
  };

  pastInput.addEventListener('change', () => {
    pastSelected = Array.from(pastInput.files || []).filter((f) => /^image\//.test(f.type)).slice(0, PAST_MAX_SELECTED);
    const tooMany = (pastInput.files || []).length > PAST_MAX_SELECTED;

    $('pastPreviews').replaceChildren();
    pastSelected.slice(0, 12).forEach((f) => {
      const img = new Image();
      img.alt = '';
      img.src = URL.createObjectURL(f);
      img.onload = () => URL.revokeObjectURL(img.src);
      $('pastPreviews').append(img);
    });

    $('pastPickText').textContent = pastSelected.length
      ? `${plural(pastSelected.length, 'foto elegida', 'fotos elegidas')} · cambiar`
      : 'Elegir fotos';
    refreshSend();
    sayPast(tooMany ? `Solo se pueden subir ${PAST_MAX_SELECTED} fotos cada vez. He cogido las primeras.` : '', tooMany ? 'err' : '');
  });

  function sendPastChunk(files, fiesta, year, desc, code, onProgress) {
    return new Promise((resolve, reject) => {
      const fd = new FormData();
      files.forEach((f) => fd.append('photos', f, f.name));
      fd.append('fiesta', fiesta);
      fd.append('year', year);
      fd.append('desc', desc);
      if (!IS_ADMIN) fd.append('code', code);

      const xhr = new XMLHttpRequest();
      xhr.open('POST', IS_ADMIN ? '/api/admin/photos/past' : '/api/photos/past');
      xhr.upload.onprogress = (e) => { if (e.lengthComputable) onProgress(e.loaded / e.total); };
      xhr.onerror = () => reject(new Error('Sin conexión. Inténtalo otra vez.'));
      xhr.onload = () => {
        let data = {};
        try { data = JSON.parse(xhr.responseText); } catch { /* respuesta no JSON */ }
        if (xhr.status >= 200 && xhr.status < 300) resolve(data);
        else if (xhr.status === 401) reject(new Error('Necesitas entrar como administrador.'));
        else reject(new Error(data.error || 'No se han podido subir las fotos.'));
      };
      xhr.send(fd);
    });
  }

  form.addEventListener('submit', async (e) => {
    e.preventDefault();
    if (!pastSelected.length) return;

    const fiesta = $('pastFiesta').value.trim();
    const year = $('pastYear').value.trim();
    const desc = $('pastDesc').value.trim();
    const code = $('pastCode').value.trim();
    if (!IS_ADMIN && !code) return sayPast('Pon la contraseña para añadir fotos.', 'err');
    if (!fiesta) return sayPast('Escribe la fiesta (San Miguel, San Roque, Pilares...).', 'err');
    if (!/^\d{4}$/.test(year)) return sayPast('Pon el año con 4 cifras (por ejemplo 2019).', 'err');

    const send = $('pastSend');
    const bar = $('pastBar');
    send.disabled = true;
    bar.hidden = false;
    bar.value = 0;
    sayPast('Preparando las fotos…');

    let done = 0;
    let uploaded = 0;
    try {
      for (let i = 0; i < pastSelected.length; i += PAST_CHUNK) {
        // De una en una (no todas a la vez): reducir 20 fotos grandes de golpe puede colgar el móvil
        const group = [];
        for (const f of pastSelected.slice(i, i + PAST_CHUNK)) group.push(await shrink(f));
        sayPast(`Subiendo ${Math.min(i + PAST_CHUNK, pastSelected.length)} de ${pastSelected.length}…`);
        const res = await sendPastChunk(group, fiesta, year, desc, code, (f) => {
          bar.value = ((done + group.length * f) / pastSelected.length) * 100;
        });
        done += group.length;
        uploaded += res.added || 0;
      }

      // Se mantienen fiesta y año por si vas a subir más fotos de la misma
      store.set('traketeros_past_code', code);
      $('pastDesc').value = '';
      pastInput.value = '';
      pastSelected = [];
      $('pastPreviews').replaceChildren();
      $('pastPickText').textContent = 'Elegir fotos';
      sayPast(`¡Listo! ${plural(uploaded, 'foto subida', 'fotos subidas')} a ${fiesta} ${year} 🔥`, 'ok');
      await loadPast();
    } catch (err) {
      const extra = uploaded ? ` (${plural(uploaded, 'foto subida', 'fotos subidas')} antes del fallo)` : '';
      sayPast((err.message || 'No se han podido subir las fotos.') + extra, 'err');
      if (uploaded) loadPast();
    } finally {
      bar.hidden = true;
      refreshSend();
    }
  });
}

loadPast();
