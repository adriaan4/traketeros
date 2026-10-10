// Vídeos de la portada: 3 cuadros que van pasando vídeos al azar, sin sonido,
// reproduciéndose los tres a la vez. Cuando un vídeo acaba, ese cuadro salta a otro distinto.
(function () {
  var TOTAL = 10; // assets/videos/c1.mp4 ... c10.mp4 (+ c1.jpg ... de portada)
  var vids = document.querySelectorAll('.clip video');
  if (!vids.length) return;

  var deck = [];
  var enPantalla = {}; // id que muestra cada cuadro ahora mismo

  function barajar() {
    var a = [];
    for (var i = 1; i <= TOTAL; i++) a.push(i);
    for (var j = a.length - 1; j > 0; j--) {
      var k = Math.floor(Math.random() * (j + 1));
      var t = a[j]; a[j] = a[k]; a[k] = t;
    }
    return a;
  }

  // Siguiente vídeo al azar que no se esté viendo ya en otro cuadro ni sea el mismo de este.
  function siguiente(n) {
    for (var intento = 0; intento < 3; intento++) {
      if (!deck.length) deck = barajar();
      for (var i = 0; i < deck.length; i++) {
        var id = deck[i], usado = false;
        for (var q in enPantalla) { if (enPantalla[q] === id) usado = true; }
        if (!usado) { deck.splice(i, 1); return id; }
      }
      deck = barajar();
    }
    return 1 + Math.floor(Math.random() * TOTAL);
  }

  function play(v) { var p = v.play(); if (p && p.catch) p.catch(function () {}); }
  function playAll() { vids.forEach(function (v) { if (v.paused && !v.userPaused) play(v); }); }

  function cargar(v, n) {
    var id = siguiente(n);
    enPantalla[n] = id;
    v.poster = 'assets/videos/c' + id + '.jpg';
    v.src = 'assets/videos/c' + id + '.mp4';
    v.load();
    play(v);
  }

  vids.forEach(function (v, n) {
    v.muted = true; // iOS necesita el atributo en JS además del HTML
    v.loop = false; // al acabar pasa al siguiente
    v.setAttribute('playsinline', '');
    v.preload = 'auto';
    v.addEventListener('ended', function () { cargar(v, n); });
    v.addEventListener('error', function () { setTimeout(function () { cargar(v, n); }, 500); });
    v.addEventListener('canplay', function () { if (!v.userPaused) play(v); });
    // Un toque pausa/reanuda ese vídeo.
    v.addEventListener('click', function () {
      if (v.paused) { v.userPaused = false; play(v); } else { v.userPaused = true; v.pause(); }
    });
    cargar(v, n);
  });

  // Si el navegador bloqueó el autoplay, el primer toque/scroll los arranca todos.
  ['touchstart', 'click', 'scroll', 'keydown'].forEach(function (ev) {
    window.addEventListener(ev, playAll, { passive: true, once: ev !== 'scroll' });
  });
  document.addEventListener('visibilitychange', function () { if (!document.hidden) playAll(); });
  window.addEventListener('pageshow', playAll);
})();
