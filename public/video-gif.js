// Convierte un VÍDEO en un GIF animado EN EL NAVEGADOR (sin librerías externas, sin quitar el fondo).
// window.videoAGif(file, onProgreso?) -> Promise<File image/gif>
// Coge hasta 4 segundos desde el principio a 10 fotogramas por segundo (máx. 40) y lo deja en bucle.
(function (global) {
  'use strict';

  // ---------- Paleta global (median cut sobre un histograma de colores de 15 bits) ----------
  function crearPaleta(frames) {
    var hist = new Uint32Array(32768);
    for (var f = 0; f < frames.length; f++) {
      var d = frames[f];
      for (var i = 0; i < d.length; i += 4 * 3) { // se muestrea 1 de cada 3 píxeles
        hist[((d[i] >> 3) << 10) | ((d[i + 1] >> 3) << 5) | (d[i + 2] >> 3)]++;
      }
    }
    var colores = [];
    for (var c = 0; c < 32768; c++) if (hist[c]) colores.push(c);
    if (!colores.length) colores.push(0);
    var cajas = [colores];
    function rango(caja, canal) {
      var min = 31, max = 0;
      for (var i = 0; i < caja.length; i++) {
        var v = canal === 0 ? caja[i] >> 10 : canal === 1 ? (caja[i] >> 5) & 31 : caja[i] & 31;
        if (v < min) min = v; if (v > max) max = v;
      }
      return max - min;
    }
    while (cajas.length < 256) {
      var mejor = -1, mejorR = 0, mejorCanal = 0;
      for (var b = 0; b < cajas.length; b++) {
        if (cajas[b].length < 2) continue;
        for (var ch = 0; ch < 3; ch++) {
          var r = rango(cajas[b], ch);
          if (r > mejorR) { mejorR = r; mejor = b; mejorCanal = ch; }
        }
      }
      if (mejor < 0) break;
      var caja = cajas[mejor];
      var val = function (c) { return mejorCanal === 0 ? c >> 10 : mejorCanal === 1 ? (c >> 5) & 31 : c & 31; };
      caja.sort(function (a, b2) { return val(a) - val(b2); });
      // se corta por la mediana ponderada por frecuencia
      var total = 0, i2;
      for (i2 = 0; i2 < caja.length; i2++) total += hist[caja[i2]];
      var acum = 0, corte = 1;
      for (i2 = 0; i2 < caja.length - 1; i2++) { acum += hist[caja[i2]]; if (acum >= total / 2) { corte = i2 + 1; break; } corte = i2 + 1; }
      cajas.splice(mejor, 1, caja.slice(0, corte), caja.slice(corte));
    }
    var paleta = new Uint8Array(256 * 3);
    for (var p = 0; p < cajas.length; p++) {
      var sr = 0, sg = 0, sb = 0, n = 0;
      for (var q = 0; q < cajas[p].length; q++) {
        var col = cajas[p][q], w = hist[col];
        sr += (col >> 10) * w; sg += ((col >> 5) & 31) * w; sb += (col & 31) * w; n += w;
      }
      n = n || 1;
      paleta[p * 3] = Math.min(255, Math.round(sr / n * 8 + 4));
      paleta[p * 3 + 1] = Math.min(255, Math.round(sg / n * 8 + 4));
      paleta[p * 3 + 2] = Math.min(255, Math.round(sb / n * 8 + 4));
    }
    return { paleta: paleta, usados: cajas.length };
  }

  function indexar(rgba, paleta, usados, lut) {
    var out = new Uint8Array(rgba.length / 4);
    for (var i = 0, j = 0; i < rgba.length; i += 4, j++) {
      var key = ((rgba[i] >> 3) << 10) | ((rgba[i + 1] >> 3) << 5) | (rgba[i + 2] >> 3);
      var idx = lut[key];
      if (idx === 255 + 1 || idx === undefined) idx = 256;
      if (idx === 256) {
        var r = rgba[i], g = rgba[i + 1], b = rgba[i + 2], best = 0, bd = 1e9;
        for (var p = 0; p < usados; p++) {
          var dr = r - paleta[p * 3], dg = g - paleta[p * 3 + 1], db = b - paleta[p * 3 + 2];
          var dd = dr * dr + dg * dg + db * db;
          if (dd < bd) { bd = dd; best = p; }
        }
        lut[key] = best; idx = best;
      }
      out[j] = idx;
    }
    return out;
  }

  // ---------- Compresión LZW de GIF ----------
  function lzw(indices, minCode) {
    var clear = 1 << minCode, eoi = clear + 1;
    var codeSize = minCode + 1, next = eoi + 1;
    var dict = new Map();
    var out = [], cur = 0, bits = 0;
    function emit(code) {
      cur |= code << bits; bits += codeSize;
      while (bits >= 8) { out.push(cur & 255); cur >>>= 8; bits -= 8; }
    }
    emit(clear);
    var prefix = indices[0];
    for (var i = 1; i < indices.length; i++) {
      var k = indices[i], key = (prefix << 8) | k, found = dict.get(key);
      if (found !== undefined) { prefix = found; continue; }
      emit(prefix);
      if (next === 4096) {
        emit(clear); dict.clear(); next = eoi + 1; codeSize = minCode + 1;
      } else {
        if (next >= (1 << codeSize)) codeSize++;
        dict.set(key, next++);
      }
      prefix = k;
    }
    emit(prefix);
    emit(eoi);
    if (bits > 0) out.push(cur & 255);
    return out;
  }

  function codificarGif(frames, w, h, retrasoCs) {
    var pal = crearPaleta(frames);
    var lut = new Uint16Array(32768).fill(256);
    var b = [];
    function s(str) { for (var i = 0; i < str.length; i++) b.push(str.charCodeAt(i)); }
    function u16(n) { b.push(n & 255, (n >> 8) & 255); }
    s('GIF89a'); u16(w); u16(h); b.push(0xF7, 0, 0);
    for (var i = 0; i < 768; i++) b.push(pal.paleta[i]);
    b.push(0x21, 0xFF, 0x0B); s('NETSCAPE2.0'); b.push(3, 1, 0, 0, 0); // bucle infinito
    for (var f = 0; f < frames.length; f++) {
      var idx = indexar(frames[f], pal.paleta, pal.usados, lut);
      b.push(0x21, 0xF9, 4, 0x00); u16(retrasoCs); b.push(0, 0);
      b.push(0x2C); u16(0); u16(0); u16(w); u16(h); b.push(0);
      b.push(8);
      var datos = lzw(idx, 8);
      for (var p = 0; p < datos.length; p += 255) {
        var n = Math.min(255, datos.length - p);
        b.push(n);
        for (var q = 0; q < n; q++) b.push(datos[p + q]);
      }
      b.push(0);
    }
    b.push(0x3B);
    return new Uint8Array(b);
  }

  // ---------- Captura de fotogramas del vídeo ----------
  function cargarVideo(file) {
    return new Promise(function (ok, ko) {
      var url = URL.createObjectURL(file), v = document.createElement('video');
      v.muted = true; v.playsInline = true; v.preload = 'auto';
      v.onloadeddata = function () { ok({ v: v, url: url }); };
      v.onerror = function () { URL.revokeObjectURL(url); ko(new Error('No se pudo leer el vídeo.')); };
      v.src = url;
    });
  }
  function buscar(v, t) {
    return new Promise(function (ok) {
      var hecho = false;
      function fin() { if (!hecho) { hecho = true; v.removeEventListener('seeked', fin); ok(); } }
      v.addEventListener('seeked', fin);
      v.currentTime = t;
      setTimeout(fin, 1500);
    });
  }

  async function videoAGif(file, onProgreso) {
    var cv = await cargarVideo(file), v = cv.v;
    try {
      var dur = isFinite(v.duration) && v.duration > 0 ? v.duration : 1;
      var FPS = 10, MAXS = 4;
      var n = Math.max(1, Math.min(MAXS * FPS, Math.floor(Math.min(dur, MAXS) * FPS)));
      var k = Math.min(1, 480 / Math.max(v.videoWidth, v.videoHeight));
      var w = Math.max(2, Math.round(v.videoWidth * k)), h = Math.max(2, Math.round(v.videoHeight * k));
      var c = document.createElement('canvas'); c.width = w; c.height = h;
      var ctx = c.getContext('2d', { willReadFrequently: true });
      var frames = [];
      for (var i = 0; i < n; i++) {
        await buscar(v, Math.min(i / FPS, Math.max(0, dur - 0.05)));
        ctx.drawImage(v, 0, 0, w, h);
        frames.push(new Uint8ClampedArray(ctx.getImageData(0, 0, w, h).data));
        if (onProgreso) onProgreso(Math.round(((i + 1) / n) * 90));
      }
      var bytes = codificarGif(frames, w, h, Math.round(100 / FPS));
      if (onProgreso) onProgreso(100);
      return new File([bytes], (file.name || 'video').replace(/\.[^.]+$/, '') + '.gif', { type: 'image/gif' });
    } finally {
      URL.revokeObjectURL(cv.url);
    }
  }

  global.videoAGif = videoAGif;
  global.__gif = { codificarGif: codificarGif };
})(typeof window !== 'undefined' ? window : globalThis);
