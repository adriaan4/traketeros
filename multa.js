// Multa de Hacienda: empieza en 8 € el día de inicio y sube 1 € cada día.
(function () {
  var INICIO = new Date(2026, 9, 8); // 8 de octubre de 2026 (mes 9 = octubre)
  var BASE = 8;
  var el = document.getElementById('multaImporte');
  if (!el) return;

  function render() {
    var hoy = new Date();
    var a = Date.UTC(INICIO.getFullYear(), INICIO.getMonth(), INICIO.getDate());
    var b = Date.UTC(hoy.getFullYear(), hoy.getMonth(), hoy.getDate());
    var dias = Math.max(0, Math.round((b - a) / 86400000));
    el.textContent = (BASE + dias) + ' \u20ac';
  }

  render();
  setInterval(render, 60000); // por si la página queda abierta al pasar la medianoche
})();
