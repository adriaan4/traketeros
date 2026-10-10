// Vídeos de la portada: 3 cuadros con vídeos al azar (sin repetir), en bucle, sin sonido
// y reproduciéndose todos a la vez.
(function () {
  var TOTAL = 10; // assets/videos/c1.mp4 ... c10.mp4 (+ c1.jpg ... de portada)
  var vids = document.querySelectorAll('.clip video');
  if (!vids.length) return;

  // Baraja 1..TOTAL (Fisher-Yates) y reparte uno distinto a cada cuadro.
  var ids = [];
  for (var i = 1; i <= TOTAL; i++) ids.push(i);
  for (var j = ids.length - 1; j > 0; j--) {
    var k = Math.floor(Math.random() * (j + 1));
    var t = ids[j]; ids[j] = ids[k]; ids[k] = t;
  }

  function play(v) { var p = v.play(); if (p && p.catch) p.catch(function () {}); }
  function playAll() { vids.forEach(function (v) { if (v.paused) play(v); }); }

  vids.forEach(function (v, n) {
    var id = ids[n % ids.length];
    v.muted = true; // iOS necesita el atributo en JS además del HTML
    v.loop = true;
    v.setAttribute('playsinline', '');
    v.preload = 'auto';
    v.poster = 'assets/videos/c' + id + '.jpg';
    v.src = 'assets/videos/c' + id + '.mp4';
    v.addEventListener('loadeddata', function () { play(v); });
    v.addEventListener('canplay', function () { play(v); });
    // Si el navegador pausa alguno (ahorro de batería, scroll...), lo vuelve a arrancar.
    v.addEventListener('pause', function () { if (!v.ended && !document.hidden) setTimeout(function () { if (v.paused && !v.userPaused) play(v); }, 300); });
    // Un toque pausa/reanuda ese vídeo.
    v.addEventListener('click', function () {
      if (v.paused) { v.userPaused = false; play(v); } else { v.userPaused = true; v.pause(); }
    });
    play(v);
  });

  // Si el navegador bloqueó el autoplay, el primer toque/scroll los arranca todos.
  ['touchstart', 'click', 'scroll', 'keydown'].forEach(function (ev) {
    window.addEventListener(ev, playAll, { passive: true, once: ev !== 'scroll' });
  });
  document.addEventListener('visibilitychange', function () { if (!document.hidden) playAll(); });
  window.addEventListener('pageshow', playAll);
})();
