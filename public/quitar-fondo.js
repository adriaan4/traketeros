// Quita el fondo de una foto EN EL NAVEGADOR (la persona que sube la foto) antes de enviarla.
// Usa @imgly/background-removal (modelo de IA que se descarga la primera vez, ~40 MB, y luego queda en caché).
// window.quitarFondo(file, onProgreso?) -> Promise<File PNG con transparencia>. Si falla, lanza error (y se sube la foto original).
(function () {
  var LIB = 'https://cdn.jsdelivr.net/npm/@imgly/background-removal@1.5.5/+esm';
  var libPromesa = null;

  // Reduce la foto (máx. 1024 px) para que el móvil aguante y vaya más rápido
  function reducir(file) {
    return new Promise(function (ok, ko) {
      var url = URL.createObjectURL(file), img = new Image();
      img.onload = function () {
        var k = Math.min(1, 1024 / Math.max(img.naturalWidth, img.naturalHeight));
        var c = document.createElement('canvas');
        c.width = Math.round(img.naturalWidth * k); c.height = Math.round(img.naturalHeight * k);
        c.getContext('2d').drawImage(img, 0, 0, c.width, c.height);
        URL.revokeObjectURL(url);
        c.toBlob(function (b) { b ? ok(b) : ko(new Error('No se pudo leer la foto.')); }, 'image/jpeg', 0.92);
      };
      img.onerror = function () { URL.revokeObjectURL(url); ko(new Error('No se pudo leer la foto.')); };
      img.src = url;
    });
  }

  window.quitarFondo = async function (file, onProgreso) {
    if (!libPromesa) libPromesa = import(LIB);
    var lib = await libPromesa;
    var blob = await reducir(file);
    var out = await lib.removeBackground(blob, {
      progress: function (key, actual, total) {
        if (onProgreso && total) onProgreso(Math.min(99, Math.round((actual / total) * 100)));
      }
    });
    return new File([out], (file.name || 'foto').replace(/\.[^.]+$/, '') + '.png', { type: 'image/png' });
  };
})();
