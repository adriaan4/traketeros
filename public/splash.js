// Pantalla de bienvenida (splash) con el logo de la peña.
// Se muestra una vez por sesión: al abrir la app del móvil o la web. Toca para saltarla.
// Todo va aquí dentro (estilos incluidos) para que se vea desde el primer instante.
(function () {
  try {
    if (sessionStorage.getItem('splash-visto') || /[?&]nosplash\b/.test(location.search)) return;
    sessionStorage.setItem('splash-visto', '1');
  } catch (e) { /* sin sessionStorage: se enseña igual */ }

  var reducido = window.matchMedia && matchMedia('(prefers-reduced-motion: reduce)').matches;
  var DURACION = reducido ? 900 : 2000;

  var css =
    '#splash{position:fixed;inset:0;z-index:2147483000;display:flex;flex-direction:column;align-items:center;justify-content:center;gap:26px;' +
    'background:radial-gradient(circle at 50% 38%,#c2007a 0,#5a0045 42%,#1a0018 78%);transition:opacity .45s ease,visibility .45s;cursor:pointer}' +
    '#splash.fuera{opacity:0;visibility:hidden}' +
    '#splash img{width:min(68vw,380px);height:auto;display:block;filter:drop-shadow(0 0 26px rgba(255,37,150,.65)) drop-shadow(0 0 10px rgba(0,168,230,.55));' +
    'animation:splashEntra .9s cubic-bezier(.2,1.4,.4,1) both,splashLate 1.6s ease-in-out .9s infinite}' +
    '#splash .barra{width:min(46vw,220px);height:6px;border:2px solid #fff;border-radius:6px;overflow:hidden;background:rgba(255,255,255,.12)}' +
    '#splash .barra i{display:block;height:100%;width:0;background:linear-gradient(90deg,#00a8e6,#ff2596);animation:splashCarga ' + DURACION + 'ms linear forwards}' +
    '@keyframes splashEntra{from{opacity:0;transform:scale(.45) rotate(-6deg)}to{opacity:1;transform:none}}' +
    '@keyframes splashLate{50%{transform:scale(1.045)}}' +
    '@keyframes splashCarga{to{width:100%}}' +
    '@media (prefers-reduced-motion:reduce){#splash img{animation:none}#splash .barra i{animation-duration:' + DURACION + 'ms}}';

  var estilo = document.createElement('style');
  estilo.textContent = css;
  var cap = document.createElement('div');
  cap.id = 'splash';
  cap.setAttribute('role', 'img');
  cap.setAttribute('aria-label', 'Traketeros');
  cap.innerHTML = '<img src="/assets/splash-logo.png" alt="" decoding="async"><div class="barra"><i></i></div>';

  var raiz = document.documentElement;
  raiz.appendChild(estilo);
  raiz.appendChild(cap);

  var cerrada = false;
  function cerrar() {
    if (cerrada) return;
    cerrada = true;
    cap.classList.add('fuera');
    setTimeout(function () { cap.remove(); estilo.remove(); }, 600);
  }
  cap.addEventListener('click', cerrar);
  setTimeout(cerrar, DURACION);
})();
