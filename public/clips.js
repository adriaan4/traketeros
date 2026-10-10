// Vídeos de la portada: en bucle y sin sonido; solo se reproducen cuando se ven (ahorra datos en el móvil).
(function () {
  var vids = document.querySelectorAll('.clip video');
  if (!vids.length) return;

  function play(v) { var p = v.play(); if (p && p.catch) p.catch(function () {}); }

  vids.forEach(function (v) {
    v.muted = true; // iOS necesita el atributo en JS además del HTML
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
