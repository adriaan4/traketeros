// Higher or Lower (pestaña de Juegos).
// Todo lo importante (cifras ocultas, rachas, puntos, premios en TKT, ranking) lo decide
// el servidor (/api/higherlower/*). Aquí solo se pinta y se manda lo que elige la persona.
//
// IDENTIDAD: se reutiliza la de TKT365 (mismo token de dispositivo "tkt-token" y el mismo
// /api/tkt365/claim). El nombre es SIEMPRE el del Traketímetro; este juego no crea usuarios.
//
// Va dentro de una función para no chocar con las variables globales de juegos.js.
(function () {
  'use strict';

  const sec = document.getElementById('higherlower');
  const tabBtn = document.getElementById('tabHL');
  if (!sec || !tabBtn) return;

  const $ = (id) => document.getElementById(id);
  const esc = (s) =>
    String(s ?? '').replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
  const nf = new Intl.NumberFormat('es-ES');
  const num = (n) => nf.format(Math.round(Number(n) || 0));

  const store = {
    get(k) { try { return localStorage.getItem(k) || ''; } catch { return ''; } },
    set(k, v) { try { localStorage.setItem(k, v); } catch { /* sin almacenamiento: no pasa nada */ } }
  };

  // Mismo identificador anónimo de dispositivo que usa TKT365
  function tokenDispositivo() {
    let t = store.get('tkt-token');
    if (!/^[a-f0-9]{32}$/.test(t)) {
      const b = new Uint8Array(16);
      crypto.getRandomValues(b);
      t = [...b].map((x) => x.toString(16).padStart(2, '0')).join('');
      store.set('tkt-token', t);
    }
    return t;
  }
  const TOKEN = tokenDispositivo();

  const TIPOS = {
    cervezas: { emoji: '🍺', nombre: 'cervezas' },
    cubatas: { emoji: '🍹', nombre: 'cubatas' },
    chupitos: { emoji: '🥃', nombre: 'chupitos' },
    porros: { emoji: '🌿', nombre: 'porros' },
    cigarros: { emoji: '🚬', nombre: 'cigarros' }
  };
  // Tipos que cuentan ahora mismo (el servidor añade 'cigarros' cuando están activados)
  const tiposActivos = () => ((S.reglas && S.reglas.tipos) || ['cervezas', 'cubatas', 'chupitos', 'porros']).filter((k) => TIPOS[k]);
  const listaTipos = (sep) => tiposActivos().map((k) => `${TIPOS[k].emoji} ${TIPOS[k].nombre}`).join(sep);
  const listaNombres = () => { const n = tiposActivos().map((k) => TIPOS[k].nombre); return n.length > 1 ? `${n.slice(0, -1).join(', ')} o ${n[n.length - 1]}` : n.join(''); };
  const MODO_LABEL = { mes: 'Este mes', total: 'Histórico' };
  const reducirMovimiento = window.matchMedia && matchMedia('(prefers-reduced-motion: reduce)').matches;

  const S = {
    cargado: false,
    modo: 'total',          // modo elegido para la próxima racha
    yo: null,               // { id, name, saldo }
    users: [],              // personas que aún no han elegido nombre (solo si yo === null)
    stats: null,
    reglas: null,
    disponible: { mes: true, total: true },
    podioAnterior: null,
    run: null,              // partida en curso (sin la cifra oculta)
    fase: 'carga',          // carga | identidad | inicio | pregunta | revelado | fin
    ocupado: false,
    pendiente: null,        // siguiente ronda ya calculada por el servidor (tras acertar)
    ultimo: null,           // último resultado revelado { acierto, revelado }
    fin: null,
    rankPer: 'total',
    rankOrd: 'racha',
    rank: null
  };

  async function api(url, opts) {
    let res;
    try {
      res = await fetch(url, opts);
    } catch {
      throw new Error('Sin conexión con el servidor.');
    }
    let data = {};
    try { data = await res.json(); } catch { /* sin cuerpo */ }
    if (!res.ok) {
      const e = new Error(data.error || 'Ha pasado algo raro. Inténtalo otra vez.');
      e.status = res.status;
      e.data = data;
      throw e;
    }
    return data;
  }
  const post = (url, body) =>
    api(url, { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ token: TOKEN, ...body }) });

  function msg(texto, clase) {
    const m = $('hlMsg');
    if (!m) return;
    m.textContent = texto || '';
    m.className = 'hl-msg' + (clase ? ' ' + clase : '');
  }

  // ---------- Carga ----------
  async function cargarEstado() {
    const d = await api(`/api/higherlower/state?token=${TOKEN}&modo=${S.modo}`);
    S.cargado = true;
    S.reglas = d.reglas;
    S.podioAnterior = d.podioAnterior;
    S.yo = d.yo;
    S.users = d.users || [];
    S.stats = d.stats || null;
    S.disponible = d.disponible || S.disponible;
    S.run = d.run || null;
    S.pendiente = null;
    S.ultimo = null;
    S.fin = null;
    if (d.modoSugerido) S.modo = d.modoSugerido;
    if (S.run) S.modo = S.run.modo;
    S.fase = !S.yo ? 'identidad' : (S.run ? 'pregunta' : 'inicio');
  }

  async function refrescar() {
    try {
      await cargarEstado();
    } catch (e) {
      $('hlStage').innerHTML = `<p class="hl-msg err">${esc(e.message)}</p><button class="btn" id="hlReintentar" type="button">Reintentar</button>`;
      $('hlReintentar').addEventListener('click', refrescar);
      return;
    }
    pintar();
    pintarReglas();
    cargarRanking();
  }

  // ---------- Pintado ----------
  function pintar() {
    pintarHud();
    const st = $('hlStage');
    if (S.fase === 'identidad') return pintarIdentidad(st);
    if (S.fase === 'inicio') return pintarInicio(st);
    pintarArena(st);
  }

  function pintarHud(bump) {
    const hud = $('hlHud');
    if (!S.yo) { hud.hidden = true; return; }
    hud.hidden = false;
    const racha = S.run ? S.run.racha : 0;
    const puntos = S.run ? S.run.puntos : 0;
    const record = S.stats ? S.stats.best : 0;
    hud.innerHTML =
      `<div class="hl-stat yo"><small>Jugador</small><b>${esc(S.yo.name)}</b></div>` +
      `<div class="hl-stat racha${bump === 'racha' ? ' bump' : ''}"><small>🔥 Racha</small><b>${num(racha)}</b></div>` +
      `<div class="hl-stat"><small>⭐ Puntos</small><b>${num(puntos)}</b></div>` +
      `<div class="hl-stat"><small>🏅 Récord</small><b>${num(record)}</b></div>` +
      `<div class="hl-stat"><small>🪙 Saldo TKT</small><b>${num(S.yo.saldo)}</b></div>`;
  }

  function pintarIdentidad(st) {
    const libres = S.users.filter((u) => !u.taken);
    st.innerHTML =
      `<div class="hl-id">` +
      `<p class="hl-intro"><b>¿Quién eres?</b><small>Juegas con tu nombre del Traketímetro, el mismo de TKT365. Solo se elige una vez en este dispositivo.</small></p>` +
      (libres.length
        ? `<select id="hlUser" aria-label="Tu nombre">` +
          `<option value="">Elige tu nombre…</option>` +
          libres.map((u) => `<option value="${esc(u.id)}">${esc(u.name)}</option>`).join('') +
          `</select><button class="btn submit" id="hlElegir" type="button">Soy yo ✅</button>`
        : `<p class="hl-vacio">No queda ningún nombre libre.</p>`) +
      `<p class="hl-nota">¿No sales en la lista? Apúntate en <a href="tkt365.html">TKT365</a> y vuelve.</p>` +
      `<p class="hl-msg err" id="hlMsg" aria-live="polite"></p></div>`;
    const btn = $('hlElegir');
    if (!btn) return;
    btn.addEventListener('click', async () => {
      const id = $('hlUser').value;
      if (!id) return msg('Elige tu nombre en la lista.', 'err');
      btn.disabled = true;
      try {
        const d = await post('/api/tkt365/claim', { user: id });
        store.set('trake-name', d.name); // el mismo nombre que usan Traketímetro y TKT365
        await refrescar();
      } catch (e) {
        msg(e.message, 'err');
        btn.disabled = false;
        if (e.data && e.data.refrescar) refrescar();
      }
    });
  }

  function pintarInicio(st) {
    const r = S.reglas || {};
    const bloq = !S.disponible.mes && !S.disponible.total;
    st.innerHTML =
      `<p class="hl-intro">Te enseño a un traketero con su cifra y a otro a oscuras. ¿Tiene <b>más o menos</b>? ` +
      `Encadena aciertos, sube la racha y cobra <b>TKT</b>.` +
      `<small>Con datos reales del Traketímetro: ${listaTipos(' · ')}</small></p>` +
      `<div class="hl-modos" role="group" aria-label="Datos del juego">` +
      ['total', 'mes'].map((m) =>
        `<button class="hl-chip${S.modo === m ? ' active' : ''}" type="button" data-modo="${m}"${S.disponible[m] ? '' : ' disabled title="Aún no hay datos suficientes"'}>` +
        `${m === 'mes' ? '📅 ' : '🏆 '}${MODO_LABEL[m]}</button>`).join('') +
      `</div>` +
      (bloq
        ? `<p class="hl-msg err">Todavía no hay datos suficientes en el Traketímetro para jugar.</p>`
        : `<button class="btn submit" id="hlEmpezar" type="button">🎲 Empezar racha</button>`) +
      `<p class="hl-nota">Desde ${r.minRachaPremio || 3} aciertos seguidos ya cobras TKT. Si fallas te llevas la mitad; si te plantas a tiempo, todo.</p>` +
      `<p class="hl-msg" id="hlMsg" aria-live="polite"></p>`;
    st.querySelectorAll('.hl-chip').forEach((b) => b.addEventListener('click', () => {
      S.modo = b.dataset.modo;
      st.querySelectorAll('.hl-chip').forEach((x) => x.classList.toggle('active', x === b));
    }));
    const e = $('hlEmpezar');
    if (e) e.addEventListener('click', empezar);
  }

  function textoPregunta(r) {
    const t = TIPOS[r.tipo] || { nombre: r.tipo };
    return `¿<b>${esc(r.b.name)}</b> tiene <b>más</b> o <b>menos</b> ${esc(t.nombre)} que <b>${esc(r.a.name)}</b>?`;
  }

  function pintarArena(st) {
    const r = S.run.ronda;
    const t = TIPOS[r.tipo] || { emoji: '🍻', nombre: r.tipo };
    const unidad = `${t.emoji} ${esc(t.nombre)}`;
    st.innerHTML =
      `<div class="hl-cat">${t.emoji} ${esc(t.nombre.toUpperCase())} · ${esc(MODO_LABEL[S.run.modo] || '')}</div>` +
      `<div class="hl-arena">` +
      `<article class="hl-card" id="hlA"><span class="hl-who">${esc(r.a.name)}</span><span class="hl-num">${num(r.a.value)}</span><span class="hl-unit">${unidad}</span></article>` +
      `<div class="hl-vs" aria-hidden="true">VS</div>` +
      `<article class="hl-card oculta" id="hlB"><span class="hl-who">${esc(r.b.name)}</span><span class="hl-num" id="hlBNum" aria-label="cifra oculta">?</span><span class="hl-unit">${unidad}</span></article>` +
      `</div>` +
      `<div id="hlAcciones"></div>`;
    pintarAcciones();
  }

  function pintarAcciones() {
    const cont = $('hlAcciones');
    if (!cont) return;
    if (S.fase === 'pregunta') {
      const r = S.run;
      const puedePlantarse = r.racha >= 1 && r.cobroPlantarse > 0;
      cont.innerHTML =
        `<p class="hl-pregunta">${textoPregunta(r.ronda)}</p>` +
        `<div class="hl-botones">` +
        `<button class="hl-btn mas" id="hlMas" type="button" aria-label="Tiene más">⬆️ MÁS</button>` +
        `<button class="hl-btn menos" id="hlMenos" type="button" aria-label="Tiene menos">⬇️ MENOS</button></div>` +
        (r.racha >= 1
          ? `<button class="btn ghost hl-plantarse" id="hlPlantarse" type="button"${puedePlantarse ? '' : ' disabled'}>` +
            (puedePlantarse ? `💰 Plantarme y cobrar ${num(r.cobroPlantarse)} TKT` : `💰 Plantarme (cobras desde ${(S.reglas && S.reglas.minRachaPremio) || 3} aciertos)`) +
            `</button>`
          : '') +
        `<p class="hl-msg" id="hlMsg" aria-live="polite">` +
        (r.racha >= 1 && r.cobroFallo > 0 ? `Si fallas ahora cobras ${num(r.cobroFallo)} TKT.` : '') + `</p>`;
      $('hlMas').addEventListener('click', () => responder('mas'));
      $('hlMenos').addEventListener('click', () => responder('menos'));
      const p = $('hlPlantarse');
      if (p && puedePlantarse) p.addEventListener('click', plantarse);
    } else if (S.fase === 'revelado') {
      const u = S.ultimo;
      cont.innerHTML =
        `<p class="hl-msg ${u.acierto ? 'ok' : 'ko'}" id="hlMsg" aria-live="polite">${u.texto}</p>` +
        `<button class="btn submit hl-sig" id="hlSiguiente" type="button">Siguiente ▶</button>`;
      const s = $('hlSiguiente');
      s.addEventListener('click', siguiente);
      s.focus({ preventScroll: true });
    } else if (S.fase === 'fin') {
      cont.innerHTML = (S.ultimo ? `<p class="hl-msg ${S.ultimo.acierto ? 'ok' : 'ko'}" id="hlMsg" aria-live="polite">${S.ultimo.texto}</p>` : '') + htmlFin(S.fin);
      const o = $('hlOtra');
      if (o) o.addEventListener('click', otraVez);
    }
  }

  function htmlFin(f) {
    const titulos = { fallo: '💥 Racha terminada', plantarse: '💰 ¡Cobrado!', sin_datos: '🏁 ¡Te has pasado el juego!' };
    let premio;
    if (f.premio > 0) premio = `+${num(f.premio)}`;
    else if (f.topeAlcanzado) premio = '0';
    else premio = '0';
    let nota = '';
    if (f.premio > 0 && f.causa === 'fallo') nota = 'Por fallar te llevas la mitad. Plantándote a tiempo cobras todo.';
    else if (f.topeAlcanzado) nota = 'Has llegado al tope diario de TKT del juego. Mañana más.';
    else if (f.racha < ((S.reglas && S.reglas.minRachaPremio) || 3)) nota = `El premio llega desde ${(S.reglas && S.reglas.minRachaPremio) || 3} aciertos seguidos.`;
    return `<div class="hl-fin"><h3>${titulos[f.causa] || 'Fin de la racha'}</h3>` +
      (f.nuevoRecord ? `<span class="hl-record">🏅 ¡NUEVO RÉCORD!</span>` : '') +
      `<div class="hl-fin-grid">` +
      `<div><small>🔥 Racha</small><b>${num(f.racha)}</b></div>` +
      `<div><small>⭐ Puntos</small><b>${num(f.puntos)}</b></div>` +
      `<div class="premio"><small>🪙 TKT</small><b>${premio}</b></div></div>` +
      (nota ? `<p>${esc(nota)}</p>` : '') +
      `<button class="btn submit" id="hlOtra" type="button">Jugar otra vez 🔁</button></div>`;
  }

  // ---------- Acciones ----------
  async function empezar() {
    const b = $('hlEmpezar');
    if (b) b.disabled = true;
    try {
      const d = await post('/api/higherlower/start', { modo: S.modo });
      S.run = d.run;
      S.modo = d.run.modo;
      if (S.yo && d.saldo !== undefined && d.saldo !== null) S.yo.saldo = d.saldo;
      S.fase = 'pregunta';
      S.ultimo = null;
      S.fin = null;
      pintar();
    } catch (e) {
      msg(e.message, 'err');
      if (b) b.disabled = false;
      if (e.status === 403) refrescar();
    }
  }

  function contar(el, hasta) {
    if (reducirMovimiento || hasta <= 0) { el.textContent = num(hasta); return; }
    const t0 = performance.now();
    const dur = Math.min(900, 300 + hasta * 25);
    const paso = (t) => {
      const k = Math.min(1, (t - t0) / dur);
      el.textContent = num(hasta * (1 - Math.pow(1 - k, 3)));
      if (k < 1) requestAnimationFrame(paso);
      else el.textContent = num(hasta);
    };
    requestAnimationFrame(paso);
  }

  async function responder(eleccion) {
    if (S.ocupado) return;
    S.ocupado = true;
    ['hlMas', 'hlMenos', 'hlPlantarse'].forEach((id) => { const b = $(id); if (b) b.disabled = true; });
    try {
      const d = await post('/api/higherlower/guess', { eleccion });
      mostrarResultado(d);
    } catch (e) {
      if (e.status === 404 || e.status === 403) { await refrescar(); }
      else {
        ['hlMas', 'hlMenos', 'hlPlantarse'].forEach((id) => { const b = $(id); if (b) b.disabled = false; });
        msg(e.message, 'err');
      }
    } finally {
      S.ocupado = false;
    }
  }

  function mostrarResultado(d) {
    const rv = d.revelado;
    const t = TIPOS[rv.tipo] || { nombre: rv.tipo };
    const B = $('hlB');
    B.classList.remove('oculta');
    B.classList.add(d.acierto ? 'ok' : 'ko');
    contar($('hlBNum'), rv.b.value);

    const hechos = `${esc(rv.b.name)} tiene ${num(rv.b.value)} ${esc(t.nombre)} y ${esc(rv.a.name)} ${num(rv.a.value)}.`;
    S.ultimo = {
      acierto: d.acierto,
      texto: d.acierto ? `✅ ¡Acertaste! ${hechos} +${num(d.ganados)} pts` : `❌ ¡Fallaste! ${hechos}`
    };
    if (d.stats) S.stats = d.stats;

    if (d.fin) {
      S.fin = d.fin;
      if (S.yo && d.fin.saldo !== null && d.fin.saldo !== undefined) S.yo.saldo = d.fin.saldo;
      S.run = null;
      S.fase = 'fin';
      pintarHud();
      pintarAcciones();
      cargarRanking();
      return;
    }
    // Acierto y la racha sigue: la siguiente ronda ya está calculada
    S.pendiente = d.run;
    S.fase = 'revelado';
    S.run.racha = d.run.racha;
    S.run.puntos = d.run.puntos;
    pintarHud('racha');
    pintarAcciones();
  }

  function siguiente() {
    if (!S.pendiente) return refrescar();
    S.run = S.pendiente;
    S.pendiente = null;
    S.ultimo = null;
    S.fase = 'pregunta';
    pintar();
  }

  async function plantarse() {
    if (S.ocupado) return;
    S.ocupado = true;
    const b = $('hlPlantarse');
    if (b) b.disabled = true;
    try {
      const d = await post('/api/higherlower/stop', {});
      S.fin = d.fin;
      if (d.stats) S.stats = d.stats;
      if (S.yo && d.fin.saldo !== null && d.fin.saldo !== undefined) S.yo.saldo = d.fin.saldo;
      S.run = null;
      S.fase = 'fin';
      S.ultimo = null;
      $('hlStage').innerHTML = `<div id="hlAcciones"></div>`;
      pintarHud();
      pintarAcciones();
      cargarRanking();
    } catch (e) {
      if (e.status === 404) await refrescar();
      else { msg(e.message, 'err'); if (b) b.disabled = false; }
    } finally {
      S.ocupado = false;
    }
  }

  function otraVez() {
    S.fin = null;
    S.ultimo = null;
    S.run = null;
    S.fase = 'inicio';
    refrescar();
  }

  // ---------- Ranking ----------
  async function cargarRanking() {
    try {
      S.rank = await api(`/api/higherlower/ranking?periodo=${S.rankPer}&orden=${S.rankOrd}&token=${TOKEN}`);
      pintarRanking();
    } catch (e) {
      $('hlRanking').innerHTML = `<p class="hl-vacio">${esc(e.message)}</p>`;
    }
  }

  function pintarRanking() {
    const d = S.rank;
    const el = $('hlRanking');
    if (!d) return;
    const medalla = (n) => (n === 1 ? '🥇' : n === 2 ? '🥈' : n === 3 ? '🥉' : n);
    const valor = (x) => (S.rankOrd === 'puntos' ? num(x.puntos) : num(x.racha));
    const filas = d.lista.map((x) =>
      `<li class="${d.yo && d.yo.id === x.id ? 'yo' : ''}"><span class="hl-pos">${medalla(x.puesto)}</span>` +
      `<span class="hl-nom">${esc(x.name)}<small>${num(x.partidas)} ${x.partidas === 1 ? 'partida' : 'partidas'}${S.rankOrd === 'puntos' ? ` · mejor racha ${num(x.racha)}` : ` · ${num(x.puntos)} pts`}</small></span>` +
      `<span class="hl-val">${valor(x)}${S.rankOrd === 'racha' ? ' 🔥' : ''}</span></li>`).join('');
    const chip = (grupo, v, etiqueta, activo) => `<button class="hl-chip${activo ? ' active' : ''}" type="button" data-${grupo}="${v}">${etiqueta}</button>`;

    let podio = '';
    if (d.podioAnterior && d.podioAnterior.podio.length) {
      podio = `<p class="hl-nota"><b>Podio de ${esc(d.podioAnterior.label)}:</b> ` +
        d.podioAnterior.podio.map((p) => `${p.puesto === 1 ? '🥇' : p.puesto === 2 ? '🥈' : '🥉'} ${esc(p.name)} (${num(p.racha)} 🔥, +${num(p.premio)} TKT)`).join(' · ') + `</p>`;
    }
    const miPuesto = d.yo && d.yo.puesto
      ? `<p class="hl-nota">Vas el <b>nº ${d.yo.puesto}</b> de ${d.totalJugadores}.</p>`
      : (d.yo ? `<p class="hl-nota">Todavía no estás en esta clasificación. ¡A jugar!</p>` : '');

    el.innerHTML =
      `<div class="hl-filtros">` +
      chip('per', 'total', '🏆 Histórico', d.periodo === 'total') + chip('per', 'mes', `📅 ${esc(d.mesLabel)}`, d.periodo === 'mes') + `</div>` +
      `<div class="hl-filtros">` +
      chip('ord', 'racha', '🔥 Mejor racha', d.orden === 'racha') + chip('ord', 'puntos', '⭐ Puntos', d.orden === 'puntos') + `</div>` +
      (filas ? `<ol class="hl-rank">${filas}</ol>` : `<p class="hl-vacio">Aún no hay nadie. ¡Sé el primero!</p>`) +
      miPuesto +
      `<p class="hl-nota">🎁 Cada mes, los 3 mejores de <b>mejor racha</b> (mínimo ${d.minRachaMes}) se llevan ${d.premiosMes.map(num).join(' / ')} TKT al cerrar el mes.</p>` +
      podio;

    el.querySelectorAll('[data-per]').forEach((b) => b.addEventListener('click', () => { S.rankPer = b.dataset.per; cargarRanking(); }));
    el.querySelectorAll('[data-ord]').forEach((b) => b.addEventListener('click', () => { S.rankOrd = b.dataset.ord; cargarRanking(); }));
  }

  function pintarReglas() {
    const r = S.reglas;
    if (!r) return;
    $('hlReglasCuerpo').innerHTML =
      `<ul>` +
      `<li>Se compara una cifra real del Traketímetro (${listaNombres()}). Nunca hay empates.</li>` +
      `<li>Aciertas → el traketero oculto pasa a ser el visible y sigues. Fallas → se acaba la racha.</li>` +
      `<li>Cada acierto da puntos (10 el primero y más cuanto mayor es la racha).</li>` +
      `<li>Premio en TKT según tu racha. Si <b>fallas</b> cobras el ${Math.round(r.porcentajeSiFallas * 100)} %; si te <b>plantas</b>, el 100 %.</li>` +
      `<li>Máximo ${num(r.topeDia)} TKT al día por jugador con este juego.</li></ul>` +
      `<table class="hl-tabla"><tr><th>Racha</th><th>Premio</th></tr>` +
      r.tabla.map((x) => `<tr><td>${x.racha}${x.racha === 10 ? '+' : ''}</td><td>${num(x.tkt)} TKT</td></tr>`).join('') + `</table>` +
      `<p class="hl-nota">${esc(r.masDeDiez)}</p>`;
  }

  // ---------- Integración con las pestañas de Juegos ----------
  const tituloEl = $('tituloJuegos');
  const hintEl = $('hintJuegos');

  function activar() {
    // Deja la página en su estado normal (por si veníamos del Impostor) y luego tapamos la carta
    if (typeof window.cambiarModo === 'function') window.cambiarModo('yo_nunca');
    document.querySelectorAll('.tab').forEach((b) => b.classList.remove('active'));
    tabBtn.classList.add('active');
    $('carta').hidden = true;
    $('gameControls').hidden = true;
    sec.hidden = false;
    document.body.classList.add('modo-hl');
    if (tituloEl) tituloEl.innerHTML = 'Higher or <span>Lower.</span>';
    if (hintEl) hintEl.textContent = 'Uno a la vista, otro a oscuras. ¿Más o menos? Encadena aciertos y cobra TKT.';
    if (history.replaceState) history.replaceState(null, '', '#higher-lower');
    if (S.fase !== 'revelado' && S.fase !== 'fin' && !S.ocupado) refrescar();
    else cargarRanking();
  }

  function desactivar() {
    sec.hidden = true;
    tabBtn.classList.remove('active');
    document.body.classList.remove('modo-hl');
    if (location.hash === '#higher-lower' && history.replaceState) history.replaceState(null, '', location.pathname + location.search);
  }

  tabBtn.addEventListener('click', activar);
  // juegos.js ya restaura título, carta y controles en su propio listener; aquí solo cerramos la nuestra
  document.querySelectorAll('.tab').forEach((b) => b.addEventListener('click', desactivar));

  $('hlReglas').addEventListener('toggle', () => { if ($('hlReglas').open) pintarReglas(); });

  if (location.hash === '#higher-lower') activar();
})();
