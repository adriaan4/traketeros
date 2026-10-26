/* ============================================================
   TEMA DÍA / NOCHE · Traketeros
   - Automático: de noche desde que se pone el sol en Zaragoza hasta que sale,
     calculado cada día (no hace falta internet ni cambiar nada en verano/invierno).
   - Forzar noche o día a mano solo se puede desde el panel de admin (/panel); en el resto
     de la web no hay botón: los visitantes siempre ven el modo automático.
   - Si por lo que sea no se puede calcular el sol, usa de 22:00 a 07:00.
   Se carga en el <head> para que no parpadee: <script src="tema.js"></script>
   ============================================================ */
(function () {
  'use strict';

  var LAT = 41.6488, LON = -0.8891;   // Zaragoza
  var CLAVE = 'traketeros-tema';      // en localStorage: 'noche' | 'dia' (si no hay nada = automático)
  var raiz = document.documentElement;

  // ---------- Hora de salida y puesta del sol (algoritmo del Almanaque Náutico) ----------
  function diaDelAnio(y, m, d) {
    var n1 = Math.floor(275 * m / 9);
    var n2 = Math.floor((m + 9) / 12);
    var n3 = 1 + Math.floor((y - 4 * Math.floor(y / 4) + 2) / 3);
    return n1 - n2 * n3 + d - 30;
  }

  // Devuelve los milisegundos (UTC) en que sale / se pone el sol ese día en Zaragoza.
  function momentoSol(y, m, d, amanece) {
    var R = Math.PI / 180;
    var lngH = LON / 15;
    var t = diaDelAnio(y, m, d) + ((amanece ? 6 : 18) - lngH) / 24;
    var M = 0.9856 * t - 3.289;
    var L = M + 1.916 * Math.sin(M * R) + 0.020 * Math.sin(2 * M * R) + 282.634;
    L = ((L % 360) + 360) % 360;
    var RA = Math.atan(0.91764 * Math.tan(L * R)) / R;
    RA = ((RA % 360) + 360) % 360;
    RA = (RA + (Math.floor(L / 90) * 90 - Math.floor(RA / 90) * 90)) / 15;
    var sinDec = 0.39782 * Math.sin(L * R);
    var cosDec = Math.cos(Math.asin(sinDec));
    var cosH = (Math.cos(90.833 * R) - sinDec * Math.sin(LAT * R)) / (cosDec * Math.cos(LAT * R));
    if (cosH > 1 || cosH < -1) return null;
    var H = (amanece ? 360 - Math.acos(cosH) / R : Math.acos(cosH) / R) / 15;
    var T = H + RA - 0.06571 * t - 6.622;
    var UT = (((T - lngH) % 24) + 24) % 24;
    return Date.UTC(y, m - 1, d) + UT * 3600000;
  }

  // Fecha "de hoy" en Zaragoza (aunque el móvil esté en otra zona horaria)
  function fechaZaragoza(ahora) {
    try {
      var p = new Intl.DateTimeFormat('en-CA', {
        timeZone: 'Europe/Madrid', year: 'numeric', month: '2-digit', day: '2-digit'
      }).format(ahora).split('-');
      return [parseInt(p[0], 10), parseInt(p[1], 10), parseInt(p[2], 10)];
    } catch (e) {
      return [ahora.getUTCFullYear(), ahora.getUTCMonth() + 1, ahora.getUTCDate()];
    }
  }

  function esDeNoche(ahora) {
    var f = fechaZaragoza(ahora);
    var sale = momentoSol(f[0], f[1], f[2], true);
    var pone = momentoSol(f[0], f[1], f[2], false);
    if (sale == null || pone == null || isNaN(sale) || isNaN(pone)) {
      var h = ahora.getHours();           // plan B
      return h >= 22 || h < 7;
    }
    var t = ahora.getTime();
    return t < sale || t >= pone;
  }

  // ---------- Preferencia guardada ----------
  function leer() {
    try {
      var v = localStorage.getItem(CLAVE);
      return v === 'noche' || v === 'dia' ? v : 'auto';
    } catch (e) { return 'auto'; }
  }
  function guardar(v) {
    try {
      if (v === 'auto') localStorage.removeItem(CLAVE); else localStorage.setItem(CLAVE, v);
    } catch (e) { /* sin almacenamiento: vale, solo no se recuerda */ }
  }

  // ---------- Aplicar ----------
  function estado() {
    var modo = leer();
    var noche = modo === 'noche' || (modo === 'auto' && esDeNoche(new Date()));
    return { modo: modo, noche: noche };
  }

  function aplicar() {
    var e = estado();
    raiz.setAttribute('data-tema', e.noche ? 'noche' : 'dia');
    raiz.setAttribute('data-tema-modo', e.modo);
    try { window.dispatchEvent(new CustomEvent('tema-cambio', { detail: e })); } catch (_) {}
    return e;
  }

  function ciclar() {
    var sig = { auto: 'noche', noche: 'dia', dia: 'auto' }[leer()];
    guardar(sig);
    return aplicar();
  }

  // Antes de que se pinte nada, para que no haya parpadeo blanco
  aplicar();

  // Si dejas la página abierta, cambia sola al anochecer/amanecer
  setInterval(aplicar, 60 * 1000);
  document.addEventListener('visibilitychange', function () { if (!document.hidden) aplicar(); });
  // Si cambias el tema en otra pestaña (o en el panel), se actualiza aquí también
  window.addEventListener('storage', function (ev) { if (ev.key === CLAVE || ev.key === null) aplicar(); });

  // Lo usa el panel de control (/panel) para el botón de tema
  window.temaTraketeros = { estado: estado, ciclar: ciclar, esDeNoche: esDeNoche, _sol: momentoSol };
})();
