// Vídeos de la portada: 3 cuadros con vídeos al azar (sin repetir), en bucle y sin sonido.
// Solo se reproducen cuando se ven (ahorra datos en el móvil).
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

  vids.forEach(function (v, n) {
    var id = ids[n % ids.length];
    v.muted = true; // iOS necesita el atributo en JS además del HTML
    v.poster = 'assets/videos/c' + id + '.jpg';
    v.src = 'assets/videos/c' + id + '.mp4';
    // Si el navegador bloquea el autoplay (ahorro de batería), un toque lo arranca/pausa.
    v.addEventListener('click', function () { v.paused ? play(v) : v.pause(); });
  });

  if ('IntersectionObserver' in window) {
    var io = new IntersectionObserver(function (entries) {
      entries.forEach(function (e) {
        if (e.isIntersecting) play(e.target); else e.target.pause();
      });
    }, { threshold: 0.25 });
    vids.forEach(function (v) { io.observe(v); });
  } else {
    vids.forEach(play);
  }
})();
