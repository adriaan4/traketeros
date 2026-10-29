// Higher or Lower (minijuego de "Juegos").
//
// Todo lo importante lo decide el servidor: la cifra oculta NO se envía hasta
// que se responde, las rachas/puntuaciones/premios se guardan aquí y los TKT se
// pagan en el saldo de TKT365.
//
// IDENTIDAD: este juego NO tiene usuarios propios. El jugador es el mismo que
// en TKT365 (token del dispositivo -> nombre del Traketímetro). Si el
// dispositivo aún no ha elegido nombre, se usa el mismo /api/tkt365/claim.
//
//   GET  /api/higherlower/state?token=&modo=     → quién eres, partida en curso, récords y reglas
//   POST /api/higherlower/start   { token, modo } → empieza (o retoma) una racha. modo: 'mes' | 'total'
//   POST /api/higherlower/guess   { token, eleccion: 'mas' | 'menos' }
//   POST /api/higherlower/stop    { token }       → plantarse y cobrar
//   GET  /api/higherlower/ranking?periodo=mes|total&orden=racha|puntos&token=

import fs from 'fs';
import path from 'path';

const TZ = 'Europe/Madrid';
const MESES_ES = ['Enero', 'Febrero', 'Marzo', 'Abril', 'Mayo', 'Junio', 'Julio', 'Agosto', 'Septiembre', 'Octubre', 'Noviembre', 'Diciembre'];
const MODOS = ['mes', 'total'];

// ---- Reglas (las lee también el cliente desde /state) ----
const MIN_RACHA_PREMIO = 3;                 // desde esta racha se cobra algo
const PORCENTAJE_SI_FALLAS = 0.5;           // si fallas cobras la mitad; si te plantas, todo
const TOPE_DIA = Number(process.env.HL_TOPE_DIA) > 0 ? Math.floor(Number(process.env.HL_TOPE_DIA)) : 600; // máx. TKT al día por jugador
const PREMIOS_MES = [500, 300, 150];        // podio mensual (mejor racha del mes)
const MIN_RACHA_MES = 5;                    // para entrar en el podio mensual
const MIN_ENTRE_RESPUESTAS_MS = 350;
const MAX_PARTIDAS_RECIENTES = 15;
const MAX_RECIENTES_RONDA = 3;

const TABLA_PREMIOS = { 3: 20, 4: 35, 5: 60, 6: 90, 7: 130, 8: 180, 9: 240 };
function premioBase(racha) {
  if (racha < MIN_RACHA_PREMIO) return 0;
  if (racha <= 9) return TABLA_PREMIOS[racha];
  return Math.min(1500, 320 + (racha - 10) * 100);
}
function puntosAcierto(racha) {
  return 10 + Math.min(50, 5 * (racha - 1)); // 10, 15, 20 ... hasta 60 por acierto
}

const diaFmt = new Intl.DateTimeFormat('en-CA', { timeZone: TZ, year: 'numeric', month: '2-digit', day: '2-digit' });
const hoyMadrid = () => diaFmt.format(new Date());
const mesLabel = (id) => { const [y, m] = String(id).split('-'); return `${MESES_ES[Number(m) - 1] || id} ${y}`; };

function barajar(arr) {
  const a = [...arr];
  for (let i = a.length - 1; i > 0; i--) {
    const j = Math.floor(Math.random() * (i + 1));
    [a[i], a[j]] = [a[j], a[i]];
  }
  return a;
}
const elegir = (arr) => arr[Math.floor(Math.random() * arr.length)];

export function registerHigherLower({ app, getTrake, tipos, hoy = hoyMadrid, ready, tkt, cloudinary, cloudinaryOk, dataDir, ahora = Date.now, aleatorio = null }) {
  const FILE = path.join(dataDir, 'higherlower.json');
  const CLOUD_ID = 'traketeros_data/higherlower';

  // ---------- Estado ----------
  // players: id -> { name, best, bestTs, bestModo, puntos, partidas, aciertos, fallos, premios,
  //                  dia: { fecha, tkt }, months: { 'YYYY-MM': { best, bestTs, puntos, partidas } } }
  // runs:    id -> partida en curso (con la ronda y las cifras ocultas, solo en servidor)
  // pagos:   'YYYY-MM' -> { ts, podio: [{ id, name, puesto, premio }] }  (premios mensuales ya pagados)
  const vacio = () => ({ version: 1, players: {}, runs: {}, pagos: {}, recientes: [] });
  let st = vacio();

  function normalizar(raw) {
    const s = vacio();
    if (!raw || typeof raw !== 'object') return s;
    if (raw.players && typeof raw.players === 'object') s.players = raw.players;
    if (raw.runs && typeof raw.runs === 'object') s.runs = raw.runs;
    if (raw.pagos && typeof raw.pagos === 'object') s.pagos = raw.pagos;
    if (Array.isArray(raw.recientes)) s.recientes = raw.recientes.slice(0, 50);
    return s;
  }

  // ---------- Persistencia (disco + respaldo en Cloudinary, como el resto de la web) ----------
  function saveLocal() {
    try {
      fs.mkdirSync(dataDir, { recursive: true });
      const tmp = FILE + '.tmp';
      fs.writeFileSync(tmp, JSON.stringify(st), 'utf8');
      fs.renameSync(tmp, FILE);
    } catch (e) {
      console.error('Higher or Lower: no se pudo guardar localmente:', e.message || e);
    }
  }

  let cloudBusy = false;
  let cloudDirty = false;
  async function saveCloud() {
    if (!cloudinaryOk) return;
    if (cloudBusy) { cloudDirty = true; return; }
    cloudBusy = true;
    try {
      do {
        cloudDirty = false;
        const b64 = Buffer.from(JSON.stringify(st)).toString('base64');
        await cloudinary.uploader.upload(`data:application/json;base64,${b64}`, {
          resource_type: 'raw', public_id: CLOUD_ID, overwrite: true, invalidate: true
        });
      } while (cloudDirty);
    } catch (e) {
      console.error('Higher or Lower: no se pudo respaldar en Cloudinary:', e.message || e);
    } finally {
      cloudBusy = false;
    }
  }

  // Guardado inmediato (fin de partida, premios) y guardado diferido (cada respuesta de una racha en curso)
  function guardarYa() {
    clearTimeout(timerLocal);
    timerLocal = null;
    saveLocal();
    saveCloud();
  }
  let timerLocal = null;
  function guardarPronto() {
    if (timerLocal) return;
    timerLocal = setTimeout(() => { timerLocal = null; saveLocal(); }, 1500);
    timerLocal.unref?.();
  }

  async function load() {
    if (cloudinaryOk) {
      try {
        const info = await cloudinary.api.resource(CLOUD_ID, { resource_type: 'raw' });
        const resp = await fetch(info.secure_url, { cache: 'no-store' });
        if (resp.ok) {
          st = normalizar(await resp.json());
          console.log('Higher or Lower: datos cargados desde Cloudinary.');
          return;
        }
      } catch (e) {
        console.warn('Higher or Lower: no se pudo cargar el respaldo de Cloudinary (usando plan B):', e.message || e);
      }
    }
    try {
      st = normalizar(JSON.parse(fs.readFileSync(FILE, 'utf8')));
    } catch {
      st = vacio();
    }
  }

  const cargado = load().catch((e) => console.error('Higher or Lower: error al cargar:', e.message || e));
  const listo = Promise.all([Promise.resolve(ready).catch(() => {}), cargado, Promise.resolve(tkt.listo).catch(() => {})]);

  // ---------- Datos reales del Traketímetro ----------
  // modo 'mes'  → el mes actual; modo 'total' → todos los meses sumados.
  // (Las fechas especiales no se suman: sus apuntes ya están dentro del mes.)
  function personas(modo) {
    const t = getTrake() || {};
    const meses = t.months || {};
    const claves = modo === 'mes' ? [hoy().slice(0, 7)] : Object.keys(meses).sort();
    const map = new Map();
    for (const mes of claves) {
      for (const p of Object.values(meses[mes] || {})) {
        const nombre = String(p?.name || '').trim();
        if (!nombre) continue;
        const id = nombre.toLowerCase();
        let x = map.get(id);
        if (!x) { x = { id, name: nombre }; for (const k of tipos) x[k] = 0; map.set(id, x); }
        x.name = nombre;
        for (const k of tipos) x[k] += Number(p[k]) || 0;
      }
    }
    // El nombre que se muestra es SIEMPRE el mismo que usa TKT365 / el Traketímetro
    for (const x of map.values()) x.name = tkt.nombreDe(x.id) || x.name;
    return [...map.values()];
  }

  const rnd = () => (aleatorio ? aleatorio() : Math.random());
  const pick = (arr) => arr[Math.floor(rnd() * arr.length)];

  // Crea una ronda: A (visible, cifra a la vista) contra B (oculto). Nunca hay empates.
  function nuevaRonda(run, previoB) {
    const gente = personas(run.modo);
    if (gente.length < 2) return null;
    const ultimoTipo = run.ronda?.tipo;
    let orden = barajar(tipos);
    if (ultimoTipo) orden = [...orden.filter((k) => k !== ultimoTipo), ...orden.filter((k) => k === ultimoTipo)];
    const recientes = new Set(run.recientes || []);

    const intentar = (A) => {
      for (const tipo of orden) {
        const cand = gente.filter((p) => p.id !== A.id && p[tipo] !== A[tipo]);
        if (!cand.length) continue;
        const nuevos = cand.filter((p) => !recientes.has(p.id));
        const B = pick(nuevos.length ? nuevos : cand);
        return {
          tipo,
          a: { id: A.id, name: A.name, value: A[tipo] },
          b: { id: B.id, name: B.name, value: B[tipo] }
        };
      }
      return null;
    };

    // En cada acierto, el que estaba oculto pasa a ser el visible (como en el juego clásico)
    const A0 = previoB ? gente.find((p) => p.id === previoB.id) : null;
    if (A0) { const r = intentar(A0); if (r) return r; }
    for (const A of barajar(gente)) { const r = intentar(A); if (r) return r; }
    return null;
  }

  // ---------- Jugadores ----------
  function jugador(id, name) {
    let p = st.players[id];
    if (!p) {
      p = st.players[id] = { name, best: 0, bestTs: 0, bestModo: '', puntos: 0, partidas: 0, aciertos: 0, fallos: 0, premios: 0, dia: { fecha: '', tkt: 0 }, months: {} };
    }
    p.name = name; // siempre el nombre actual de TKT365 / Traketímetro
    return p;
  }

  const mesDe = (p, mes) => (p.months[mes] ||= { best: 0, bestTs: 0, puntos: 0, partidas: 0 });

  function restanteHoy(p) {
    const f = hoy();
    if (p.dia.fecha !== f) { p.dia = { fecha: f, tkt: 0 }; }
    return Math.max(0, TOPE_DIA - p.dia.tkt);
  }

  // ---------- Quién es quien juega (identidad = TKT365) ----------
  function quien(token) {
    const id = tkt.duenoDe(token);
    if (!id) return null;
    const name = tkt.nombreDe(id);
    return name ? { id, name } : null;
  }

  // ---------- Vistas públicas ----------
  function rondaPublica(run) {
    const r = run.ronda;
    return { tipo: r.tipo, a: { name: r.a.name, value: r.a.value }, b: { name: r.b.name } }; // la cifra de B NO sale
  }

  function runPublica(run, p) {
    const base = premioBase(run.score);
    const quedaHoy = p ? restanteHoy(p) : TOPE_DIA;
    return {
      modo: run.modo,
      racha: run.score,
      puntos: run.puntos,
      ronda: rondaPublica(run),
      cobroPlantarse: Math.min(base, quedaHoy),
      cobroFallo: Math.min(Math.floor(base * PORCENTAJE_SI_FALLAS), quedaHoy)
    };
  }

  function statsPublicas(p) {
    if (!p) return { best: 0, puntos: 0, partidas: 0, aciertos: 0, fallos: 0, premios: 0, mes: { best: 0, puntos: 0, partidas: 0 } };
    const m = p.months[hoy().slice(0, 7)] || { best: 0, puntos: 0, partidas: 0 };
    return {
      best: p.best, puntos: p.puntos, partidas: p.partidas, aciertos: p.aciertos, fallos: p.fallos, premios: p.premios,
      mes: { best: m.best, puntos: m.puntos, partidas: m.partidas }
    };
  }

  function reglasPublicas() {
    const tabla = [];
    for (let n = MIN_RACHA_PREMIO; n <= 10; n++) tabla.push({ racha: n, tkt: premioBase(n) });
    return {
      minRachaPremio: MIN_RACHA_PREMIO,
      tabla,
      masDeDiez: 'A partir de 10 aciertos: +100 TKT por cada acierto más (máx. 1.500).',
      porcentajeSiFallas: PORCENTAJE_SI_FALLAS,
      topeDia: TOPE_DIA,
      premiosMes: PREMIOS_MES,
      minRachaMes: MIN_RACHA_MES
    };
  }

  // ---------- Fin de partida: puntuación, premio y TKT ----------
  function cerrarRun(yo, run, causa) {
    const p = jugador(yo.id, yo.name);
    const mes = hoy().slice(0, 7);
    const ts = ahora();

    // Premio: si te plantas, cobras todo; si fallas, la mitad
    const base = premioBase(run.score);
    const bruto = causa === 'fallo' ? Math.floor(base * PORCENTAJE_SI_FALLAS) : base;
    const quedan = restanteHoy(p);
    const premio = Math.min(bruto, quedan);
    const topeAlcanzado = bruto > premio;

    // Estadísticas
    p.partidas += 1;
    p.aciertos += run.score;
    if (causa === 'fallo') p.fallos += 1;
    p.puntos += run.puntos;
    const m = mesDe(p, mes);
    m.partidas += 1;
    m.puntos += run.puntos;
    let nuevoRecord = false;
    if (run.score > p.best) { p.best = run.score; p.bestTs = ts; p.bestModo = run.modo; nuevoRecord = run.score > 0; }
    if (run.score > m.best) { m.best = run.score; m.bestTs = ts; }

    delete st.runs[yo.id];
    st.recientes.unshift({ ts, id: yo.id, name: yo.name, racha: run.score, puntos: run.puntos, modo: run.modo, premio });
    st.recientes.length = Math.min(st.recientes.length, MAX_PARTIDAS_RECIENTES * 3);

    let saldo = tkt.saldo(yo.id);
    if (premio > 0) {
      const nuevo = tkt.acreditar(yo.id, premio, `Higher or Lower · racha de ${run.score}`);
      if (nuevo !== null) {
        saldo = nuevo;
        p.premios += premio;
        p.dia.tkt += premio;
      }
    }
    guardarYa();

    return {
      causa,
      racha: run.score,
      puntos: run.puntos,
      premio: saldo !== null && premio > 0 ? premio : 0,
      topeAlcanzado,
      nuevoRecord,
      record: p.best,
      saldo
    };
  }

  // ---------- Premios del mes (se pagan solos cuando el mes ya ha terminado) ----------
  function pagarMesesCerrados() {
    const actual = hoy().slice(0, 7);
    const meses = new Set();
    for (const p of Object.values(st.players)) for (const k of Object.keys(p.months || {})) meses.add(k);
    let cambio = false;
    for (const mes of [...meses].sort()) {
      if (mes >= actual || st.pagos[mes]) continue;
      const lista = Object.entries(st.players)
        .map(([id, p]) => ({ id, name: tkt.nombreDe(id) || p.name, best: p.months[mes]?.best || 0, ts: p.months[mes]?.bestTs || 0 }))
        .filter((x) => x.best >= MIN_RACHA_MES)
        .sort((a, b) => b.best - a.best || a.ts - b.ts)
        .slice(0, PREMIOS_MES.length);
      const podio = [];
      lista.forEach((x, i) => {
        const premio = PREMIOS_MES[i];
        const nuevo = tkt.acreditar(x.id, premio, `Higher or Lower · podio de ${mesLabel(mes)} (puesto ${i + 1})`);
        if (nuevo !== null) {
          if (st.players[x.id]) st.players[x.id].premios += premio;
          podio.push({ id: x.id, name: x.name, puesto: i + 1, racha: x.best, premio });
        }
      });
      st.pagos[mes] = { ts: ahora(), podio };
      cambio = true;
    }
    if (cambio) guardarYa();
  }

  // ---------- Ranking ----------
  function ranking(periodo, orden) {
    const mes = hoy().slice(0, 7);
    const filas = Object.entries(st.players).map(([id, p]) => {
      const d = periodo === 'mes'
        ? (p.months[mes] || { best: 0, bestTs: 0, puntos: 0, partidas: 0 })
        : { best: p.best, bestTs: p.bestTs, puntos: p.puntos, partidas: p.partidas };
      return { id, name: tkt.nombreDe(id) || p.name, racha: d.best, puntos: d.puntos, partidas: d.partidas, ts: d.bestTs || 0 };
    }).filter((x) => x.partidas > 0 && (orden === 'puntos' ? x.puntos > 0 : x.racha > 0));
    filas.sort((a, b) => orden === 'puntos'
      ? b.puntos - a.puntos || b.racha - a.racha || a.name.localeCompare(b.name, 'es')
      : b.racha - a.racha || a.ts - b.ts || b.puntos - a.puntos);
    return filas.map((x, i) => ({ puesto: i + 1, id: x.id, name: x.name, racha: x.racha, puntos: x.puntos, partidas: x.partidas }));
  }

  function ultimoPodio() {
    const meses = Object.keys(st.pagos).sort();
    const k = meses[meses.length - 1];
    if (!k) return null;
    return { mes: k, label: mesLabel(k), podio: st.pagos[k].podio };
  }

  // ---------- Núcleo de las acciones (independiente de Express, para poder probarlo) ----------
  const ultimaRespuesta = new Map(); // id -> ts

  function accionState({ token, modo }) {
    const yo = quien(token);
    const out = { ok: true, modos: MODOS, reglas: reglasPublicas(), podioAnterior: ultimoPodio(), mesLabel: mesLabel(hoy().slice(0, 7)) };
    if (!yo) {
      // Aún no ha elegido nombre en este dispositivo: se elige con el mismo /api/tkt365/claim
      out.yo = null;
      out.users = tkt.usuarios();
      return { status: 200, body: out };
    }
    const p = st.players[yo.id];
    out.yo = { id: yo.id, name: yo.name, saldo: tkt.saldo(yo.id) };
    out.stats = statsPublicas(p);
    const run = st.runs[yo.id];
    out.run = run ? runPublica(run, p) : null;
    const m = MODOS.includes(modo) ? modo : 'total';
    out.disponible = Object.fromEntries(MODOS.map((k) => [k, personas(k).length >= 2 && Boolean(nuevaRonda({ modo: k, recientes: [] }, null))]));
    out.modoSugerido = out.disponible[m] ? m : (MODOS.find((k) => out.disponible[k]) || m);
    return { status: 200, body: out };
  }

  function accionStart({ token, modo }) {
    const yo = quien(token);
    if (!yo) return { status: 403, body: { error: 'Elige quién eres para jugar.' } };
    const p = jugador(yo.id, yo.name);
    let run = st.runs[yo.id];
    if (!run) {
      const m = MODOS.includes(modo) ? modo : 'total';
      run = { modo: m, score: 0, puntos: 0, ts: ahora(), recientes: [], ronda: null };
      const ronda = nuevaRonda(run, null);
      if (!ronda) {
        return { status: 409, body: { error: m === 'mes' ? 'Este mes hay pocos datos en el Traketímetro. Prueba con "Histórico".' : 'Hacen falta al menos 2 traketeros con cifras distintas en el Traketímetro.' } };
      }
      run.ronda = ronda;
      run.recientes = [ronda.a.id, ronda.b.id];
      st.runs[yo.id] = run;
      guardarPronto();
    }
    return { status: 200, body: { ok: true, run: runPublica(run, p), saldo: tkt.saldo(yo.id) } };
  }

  function accionGuess({ token, eleccion }) {
    const yo = quien(token);
    if (!yo) return { status: 403, body: { error: 'Elige quién eres para jugar.' } };
    const run = st.runs[yo.id];
    if (!run || !run.ronda) return { status: 404, body: { error: 'No tienes ninguna partida en curso.', sinRun: true } };
    if (eleccion !== 'mas' && eleccion !== 'menos') return { status: 400, body: { error: 'Elige MÁS o MENOS.' } };

    const t = ahora();
    if (t - (ultimaRespuesta.get(yo.id) || 0) < MIN_ENTRE_RESPUESTAS_MS) {
      return { status: 429, body: { error: 'Vas muy rápido. Un momento.' } };
    }
    ultimaRespuesta.set(yo.id, t);

    const r = run.ronda;
    const acierto = eleccion === 'mas' ? r.b.value > r.a.value : r.b.value < r.a.value;
    const revelado = { tipo: r.tipo, a: { name: r.a.name, value: r.a.value }, b: { name: r.b.name, value: r.b.value } };

    if (!acierto) {
      const fin = cerrarRun(yo, run, 'fallo');
      return { status: 200, body: { ok: true, acierto: false, revelado, fin, stats: statsPublicas(st.players[yo.id]) } };
    }

    run.score += 1;
    const ganados = puntosAcierto(run.score);
    run.puntos += ganados;
    const siguiente = nuevaRonda(run, r.b);
    if (!siguiente) {
      // No quedan parejas con cifras distintas: fin de la racha cobrando el 100 %
      const fin = cerrarRun(yo, run, 'sin_datos');
      return { status: 200, body: { ok: true, acierto: true, ganados, revelado, fin, stats: statsPublicas(st.players[yo.id]) } };
    }
    run.ronda = siguiente;
    run.recientes = [...(run.recientes || []), siguiente.b.id].slice(-MAX_RECIENTES_RONDA);
    guardarPronto();
    return { status: 200, body: { ok: true, acierto: true, ganados, revelado, run: runPublica(run, st.players[yo.id]) } };
  }

  function accionStop({ token }) {
    const yo = quien(token);
    if (!yo) return { status: 403, body: { error: 'Elige quién eres para jugar.' } };
    const run = st.runs[yo.id];
    if (!run) return { status: 404, body: { error: 'No tienes ninguna partida en curso.', sinRun: true } };
    if (run.score < 1) return { status: 409, body: { error: 'Acierta al menos una para poder plantarte.' } };
    const fin = cerrarRun(yo, run, 'plantarse');
    return { status: 200, body: { ok: true, fin, stats: statsPublicas(st.players[yo.id]) } };
  }

  function accionRanking({ token, periodo, orden }) {
    const per = periodo === 'mes' ? 'mes' : 'total';
    const ord = orden === 'puntos' ? 'puntos' : 'racha';
    const lista = ranking(per, ord);
    const yo = quien(token);
    const mio = yo ? lista.find((x) => x.id === yo.id) || null : null;
    return {
      status: 200,
      body: {
        ok: true, periodo: per, orden: ord,
        mesLabel: mesLabel(hoy().slice(0, 7)),
        lista: lista.slice(0, 20),
        yo: yo ? { id: yo.id, puesto: mio ? mio.puesto : null } : null,
        totalJugadores: lista.length,
        premiosMes: PREMIOS_MES,
        minRachaMes: MIN_RACHA_MES,
        podioAnterior: ultimoPodio()
      }
    };
  }

  const acciones = { accionState, accionStart, accionGuess, accionStop, accionRanking };

  // ---------- Rutas ----------
  const manejar = (fn, leer) => async (req, res) => {
    res.set('Cache-Control', 'no-store');
    try { await listo; } catch { /* sigue */ }
    try {
      pagarMesesCerrados();
      const datos = leer(req);
      const r = fn(datos);
      res.status(r.status).json(r.body);
    } catch (e) {
      console.error('Higher or Lower: error:', e.message || e);
      res.status(500).json({ error: 'Ha pasado algo raro. Inténtalo otra vez.' });
    }
  };
  const q = (req) => ({ token: String(req.query.token || ''), modo: String(req.query.modo || ''), periodo: String(req.query.periodo || ''), orden: String(req.query.orden || '') });
  const b = (req) => ({ token: String(req.body?.token || ''), modo: String(req.body?.modo || ''), eleccion: String(req.body?.eleccion || '') });

  app.get('/api/higherlower/state', manejar(accionState, q));
  app.get('/api/higherlower/ranking', manejar(accionRanking, q));
  app.post('/api/higherlower/start', manejar(accionStart, b));
  app.post('/api/higherlower/guess', manejar(accionGuess, b));
  app.post('/api/higherlower/stop', manejar(accionStop, b));

  return { ...acciones, _estado: () => st, _pagarMeses: pagarMesesCerrados };
}
