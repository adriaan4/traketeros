// 🤖 Página "Pregunta al Traketímetro": manda la pregunta a /api/asistente y pinta la respuesta.
// Todo el texto se inserta con textContent (nada de HTML que venga de fuera).
(function () {
  'use strict';

  const $ = (id) => document.getElementById(id);
  const chat = $('chat'), chips = $('chips'), form = $('form'), input = $('q'), boton = $('ir');
  let ocupado = false;

  function el(tag, cls, texto) {
    const n = document.createElement(tag);
    if (cls) n.className = cls;
    if (texto !== undefined && texto !== null) n.textContent = texto;
    return n;
  }

  function bajar(nodo) {
    try { nodo.scrollIntoView({ block: 'nearest', behavior: 'smooth' }); } catch { /* navegador antiguo */ }
  }

  function burbujaYo(texto) {
    const m = el('div', 'asis-msg asis-yo', texto);
    chat.appendChild(m);
    bajar(m);
  }

  const MEDALLAS = ['🥇', '🥈', '🥉'];

  function burbujaBot(r) {
    const m = el('div', 'asis-msg asis-bot');
    if (r.titulo) m.appendChild(el('p', 'asis-tit', r.titulo));
    m.appendChild(el('p', 'asis-txt', r.texto || r.error || '…'));

    if (Array.isArray(r.filas) && r.filas.length) {
      const ul = el('ul', 'asis-filas');
      for (const f of r.filas) {
        const li = el('li', 'asis-fila');
        li.appendChild(el('span', 'asis-pos', f.puesto <= 3 ? MEDALLAS[f.puesto - 1] : String(f.puesto)));
        const quien = el('span', 'asis-quien', f.name);
        if (f.detalle) quien.appendChild(el('small', '', f.detalle));
        li.appendChild(quien);
        li.appendChild(el('span', 'asis-valor', f.valorTxt));
        ul.appendChild(li);
      }
      m.appendChild(ul);
    }
    for (const a of r.avisos || []) m.appendChild(el('p', 'asis-aviso', 'ℹ️ ' + a));
    chat.appendChild(m);
    bajar(m);
  }

  async function preguntar(texto) {
    const q = String(texto || '').trim();
    if (!q || ocupado) return;
    ocupado = true;
    boton.disabled = true;
    burbujaYo(q);
    const pensando = el('div', 'asis-pensando', '🤔 Mirando los datos…');
    chat.appendChild(pensando);
    bajar(pensando);
    try {
      const res = await fetch('/api/asistente?q=' + encodeURIComponent(q), { cache: 'no-store' });
      let datos = null;
      try { datos = await res.json(); } catch { /* respuesta rara */ }
      pensando.remove();
      if (!res.ok || !datos) burbujaBot({ titulo: '😵 Ups', texto: (datos && datos.error) || 'No he podido contestar ahora mismo. Prueba otra vez en un momento.' });
      else burbujaBot(datos);
    } catch {
      pensando.remove();
      burbujaBot({ titulo: '📡 Sin conexión', texto: 'No he podido conectar con el servidor. Mira tu conexión y vuelve a probar.' });
    } finally {
      ocupado = false;
      boton.disabled = false;
    }
  }

  form.addEventListener('submit', (e) => {
    e.preventDefault();
    const t = input.value;
    input.value = '';
    preguntar(t);
  });

  // ---------- ejemplos (con nombres y fechas reales) ----------
  const MESES = ['enero', 'febrero', 'marzo', 'abril', 'mayo', 'junio', 'julio', 'agosto', 'septiembre', 'octubre', 'noviembre', 'diciembre'];

  function semanaActual() {
    const h = new Date();
    const lunes = new Date(h.getFullYear(), h.getMonth(), h.getDate() - ((h.getDay() + 6) % 7));
    const domingo = new Date(lunes.getFullYear(), lunes.getMonth(), lunes.getDate() + 6);
    const mismoMes = lunes.getMonth() === domingo.getMonth();
    return mismoMes
      ? `del ${lunes.getDate()} al ${domingo.getDate()} de ${MESES[domingo.getMonth()]}`
      : `del ${lunes.getDate()} de ${MESES[lunes.getMonth()]} al ${domingo.getDate()} de ${MESES[domingo.getMonth()]}`;
  }

  function pintarEjemplos(info) {
    const nombres = (info && info.nombres) || [];
    const eventos = (info && info.eventos) || [];
    const uno = nombres.length ? nombres[Math.floor(Math.random() * nombres.length)] : null;
    const ejemplos = ['¿Quién lleva más puntos este mes?', '¿Quién lleva más cubatas esta semana?'];
    if (uno) {
      ejemplos.push(`¿Cuántos cubatas lleva ${uno} este mes?`);
      ejemplos.push(`¿Cuántos puntos tiene ${uno} ${semanaActual()}?`);
    }
    ejemplos.push(`¿Quién lleva más puntos ${semanaActual()}?`);
    ejemplos.push('¿Quién va ganando hoy?');
    if (eventos.length) ejemplos.push(`¿Quién lleva más puntos en ${eventos[0]}?`);
    if (info && info.cigarros) ejemplos.push('¿Cuántos cigarros llevamos entre todos?');
    chips.textContent = '';
    for (const e of ejemplos) {
      const b = el('button', 'asis-chip', e);
      b.type = 'button';
      b.addEventListener('click', () => preguntar(e));
      chips.appendChild(b);
    }
  }

  pintarEjemplos(null);
  fetch('/api/asistente', { cache: 'no-store' })
    .then((r) => (r.ok ? r.json() : null))
    .then((info) => { if (info && info.ok) pintarEjemplos(info); })
    .catch(() => { /* se quedan los ejemplos genéricos */ });
})();
