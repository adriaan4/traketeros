// Barra de carga con porcentaje para la foto de la carta del Salón de la Fama.
// window.barraSubida(elementoMensaje) -> { set(pct, texto), esperando(texto), tramo(desde, hasta, texto), fin(texto), quitar() }
// window.subirConProgreso(url, formData, { headers, timeout, onProgreso(pct), onEnviado() }) -> Promise<json>
(function () {
  function barraSubida(msgEl) {
    var caja = document.createElement('div');
    caja.className = 'subida-barra';
    caja.hidden = true;
    caja.setAttribute('role', 'progressbar');
    caja.setAttribute('aria-valuemin', '0');
    caja.setAttribute('aria-valuemax', '100');
    caja.innerHTML = '<div class="subida-pista"><div class="subida-relleno"></div></div><span class="subida-pct">0%</span>';
    msgEl.parentNode.insertBefore(caja, msgEl.nextSibling);
    var relleno = caja.querySelector('.subida-relleno');
    var pctEl = caja.querySelector('.subida-pct');

    function set(pct, texto) {
      pct = Math.max(0, Math.min(100, Math.round(pct)));
      caja.hidden = false;
      caja.classList.remove('espera');
      relleno.style.width = pct + '%';
      pctEl.textContent = pct + '%';
      caja.setAttribute('aria-valuenow', String(pct));
      if (texto) msgEl.textContent = texto;
    }
    return {
      set: set,
      // Para cuando ya se ha enviado todo y el servidor está guardando la foto
      esperando: function (texto) {
        caja.hidden = false;
        caja.classList.add('espera');
        relleno.style.width = '100%';
        pctEl.textContent = '…';
        if (texto) msgEl.textContent = texto;
      },
      // Devuelve una función pct(0-100) que rellena solo el tramo desde-hasta de la barra
      tramo: function (desde, hasta, texto) {
        return function (p) {
          set(desde + (hasta - desde) * Math.max(0, Math.min(100, p)) / 100, texto ? texto + ' ' + Math.round(p) + '%' : null);
        };
      },
      fin: function (texto) {
        set(100, texto);
        setTimeout(function () { caja.hidden = true; }, 1200);
      },
      quitar: function () { caja.hidden = true; }
    };
  }

  function subirConProgreso(url, fd, opts) {
    opts = opts || {};
    return new Promise(function (ok, ko) {
      var xhr = new XMLHttpRequest();
      xhr.open('POST', url);
      var h = opts.headers || {};
      Object.keys(h).forEach(function (k) { xhr.setRequestHeader(k, h[k]); });
      xhr.timeout = opts.timeout || 120000;
      xhr.upload.onprogress = function (e) {
        if (e.lengthComputable && opts.onProgreso) opts.onProgreso((e.loaded / e.total) * 100);
      };
      xhr.upload.onload = function () { if (opts.onEnviado) opts.onEnviado(); };
      xhr.onload = function () {
        var d = {};
        try { d = JSON.parse(xhr.responseText); } catch (e) {}
        if (xhr.status >= 200 && xhr.status < 300) ok(d);
        else {
          var err = new Error(d.error || 'No se pudo subir la foto.');
          err.status = xhr.status;
          ko(err);
        }
      };
      xhr.onerror = function () { ko(new Error('Failed to fetch')); };
      xhr.ontimeout = function () { var e = new Error('timeout'); e.name = 'AbortError'; ko(e); };
      xhr.send(fd);
    });
  }

  window.barraSubida = barraSubida;
  window.subirConProgreso = subirConProgreso;
})();
