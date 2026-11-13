// =====================================================================
// 🤖 ASISTENTE TRAKETERO · preguntas en español sobre el Traketímetro
// ---------------------------------------------------------------------
// No usa ninguna IA externa (ni claves, ni coste): entiende frases típicas
// ("¿cuántos cubatas lleva Mañas del 9 al 15 de noviembre?", "¿quién lleva
// más puntos este mes?") y las contesta con los datos REALES del Traketímetro.
// Solo LEE datos, no toca nada.
//
//   GET /api/asistente            → { nombres, eventos, ejemplos } (para la página)
//   GET /api/asistente?q=...      → { ok, titulo, texto, filas?, periodo, avisos? }
//
// De dónde salen los números:
//   · mes, fecha especial o "en total"  → los totales guardados (incluyen correcciones a mano)
//   · rangos de fechas, hoy, ayer, semana → el historial con fecha y hora (hora de Madrid)
// Los puntos se calculan al momento con la misma tabla que el resto de la web
// (los cigarros cuentan lo que diga TRAKE_PUNTOS, ahora 0,5).
// =====================================================================

const TZ = 'Europe/Madrid';
const MESES = ['enero', 'febrero', 'marzo', 'abril', 'mayo', 'junio', 'julio', 'agosto', 'septiembre', 'octubre', 'noviembre', 'diciembre'];
const DIAS_SEM = ['domingo', 'lunes', 'martes', 'miercoles', 'jueves', 'viernes', 'sabado'];
const EMOJI = { cervezas: '🍺', cubatas: '🍹', chupitos: '🥃', porros: '🌿', cigarros: '🚬', puntos: '⭐', total: '🍻' };
const NOMBRE_TIPO = {
  cervezas: ['cerveza', 'cervezas'], cubatas: ['cubata', 'cubatas'], chupitos: ['chupito', 'chupitos'],
  porros: ['porro', 'porros'], cigarros: ['cigarro', 'cigarros'], puntos: ['punto', 'puntos'], total: ['apunte', 'apuntes']
};

// ---------- utilidades ----------
const norm = (s) => String(s || '').toLowerCase().normalize('NFD').replace(/[\u0300-\u036f]/g, '')
  .replace(/[¿?¡!.,;:()"“”«»]/g, ' ').replace(/\s+/g, ' ').trim();
const escRe = (s) => s.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
const pad = (n) => String(n).padStart(2, '0');
const num = (n) => Number(n).toLocaleString('es-ES', { maximumFractionDigits: 1 });
const cap = (s) => s.charAt(0).toUpperCase() + s.slice(1);

const diaFmt = new Intl.DateTimeFormat('en-CA', { timeZone: TZ, year: 'numeric', month: '2-digit', day: '2-digit' });
const partsFmt = new Intl.DateTimeFormat('en-US', {
  timeZone: TZ, hourCycle: 'h23', year: 'numeric', month: '2-digit', day: '2-digit',
  hour: '2-digit', minute: '2-digit', second: '2-digit'
});
function madridOffsetMs(ts) {
  const o = {};
  for (const p of partsFmt.formatToParts(new Date(ts))) o[p.type] = p.value;
  return Date.UTC(+o.year, +o.month - 1, +o.day, +o.hour, +o.minute, +o.second) - Math.floor(ts / 1000) * 1000;
}
function madridMs(fecha) {
  const [y, mo, d] = fecha.split('-').map(Number);
  const guess = Date.UTC(y, mo - 1, d, 0, 0);
  const first = guess - madridOffsetMs(guess);
  return guess - madridOffsetMs(first);
}
const addDays = (f, n) => { const [y, m, d] = f.split('-').map(Number); return new Date(Date.UTC(y, m - 1, d + n)).toISOString().slice(0, 10); };
const dow = (f) => { const [y, m, d] = f.split('-').map(Number); return new Date(Date.UTC(y, m - 1, d)).getUTCDay(); };
const fechaValida = (y, m, d) => { const t = new Date(Date.UTC(y, m - 1, d)); return t.getUTCFullYear() === y && t.getUTCMonth() === m - 1 && t.getUTCDate() === d; };
const ymd = (y, m, d) => `${y}-${pad(m)}-${pad(d)}`;
const ddmm = (f) => `${Number(f.slice(8, 10))}/${Number(f.slice(5, 7))}`;
const ddmmaa = (f) => `${Number(f.slice(8, 10))}/${Number(f.slice(5, 7))}/${f.slice(0, 4)}`;
const mesLabel = (id) => { const [y, m] = id.split('-'); return `${MESES[Number(m) - 1]} ${y}`; };

const MES_RE = MESES.join('|');
// Una fecha escrita: "9", "9 de noviembre", "9 noviembre 2026", "9/11", "09-11-2026"
const FECHA_RE = `(?:\\d{1,2}[/-]\\d{1,2}(?:[/-]\\d{2,4})?|\\d{1,2}(?:\\s+(?:de\\s+)?(?:${MES_RE}))?(?:\\s+(?:de\\s+)?\\d{4})?)`;

export function registerAsistente({ app, getTrake, tipos, puntos, hoy, ready }) {
  // Pequeño límite por IP para que nadie sature el servidor
  const visitas = new Map();
  function limitado(ip) {
    const ahora = Date.now();
    const arr = (visitas.get(ip) || []).filter((t) => ahora - t < 60_000);
    arr.push(ahora);
    visitas.set(ip, arr);
    if (visitas.size > 500) for (const [k, v] of visitas) if (!v.length || ahora - v[v.length - 1] > 60_000) visitas.delete(k);
    return arr.length > 40;
  }

  // ---------- personas conocidas ----------
  function personas() {
    const t = getTrake();
    const m = new Map(); // clave en minúsculas -> nombre bonito
    const ver = (n) => { const name = String(n || '').trim(); if (name) { const k = name.toLowerCase(); if (!m.has(k)) m.set(k, name); } };
    for (const b of Object.values(t.months || {})) for (const p of Object.values(b || {})) ver(p?.name);
    for (const b of Object.values(t.eventData || {})) for (const p of Object.values(b || {})) ver(p?.name);
    for (const l of t.log || []) ver(l?.name);
    return m;
  }

  const vacio = (name) => { const o = { name, puntos: 0, total: 0 }; for (const k of tipos) o[k] = 0; return o; };
  function cerrar(o) {
    o.puntos = tipos.reduce((s, k) => s + (o[k] || 0) * (puntos[k] || 0), 0);
    o.total = tipos.reduce((s, k) => s + (o[k] || 0), 0);
    return o;
  }

  // ---------- datos de un periodo -> Map(clave -> stats) ----------
  function datosBucket(buckets) {
    const out = new Map();
    for (const b of buckets) {
      for (const [k, p] of Object.entries(b || {})) {
        const key = String(p?.name || k).trim().toLowerCase();
        if (!key) continue;
        const o = out.get(key) || vacio(p?.name || k);
        for (const t of tipos) o[t] += Number(p?.[t]) || 0;
        out.set(key, o);
      }
    }
    for (const o of out.values()) cerrar(o);
    return out;
  }

  function datosLog(startMs, endMs) {
    const t = getTrake();
    const out = new Map();
    for (const l of t.log || []) {
      if (!l || l.ts < startMs || l.ts >= endMs || !tipos.includes(l.tipo)) continue;
      const key = String(l.name || '').trim().toLowerCase();
      if (!key) continue;
      const o = out.get(key) || vacio(String(l.name).trim());
      o[l.tipo] += Number(l.cantidad) || 0;
      out.set(key, o);
    }
    for (const o of out.values()) cerrar(o);
    return out;
  }

  // ---------- interpretar el periodo ----------
  function fechaDeTexto(txt, base, hoyStr) {
    // txt: "9", "9 de noviembre", "9/11", "9/11/2026"...; base: { mes, anio } heredados
    const num2 = /^(\d{1,2})[/-](\d{1,2})(?:[/-](\d{2,4}))?$/.exec(txt.trim());
    if (num2) {
      let [, d, m, a] = num2; d = +d; m = +m;
      let y = a ? (+a < 100 ? 2000 + +a : +a) : null;
      return { d, m, y, explicitY: Boolean(a) };
    }
    const r = new RegExp(`^(\\d{1,2})(?:\\s+(?:de\\s+)?(${MES_RE}))?(?:\\s+(?:de\\s+)?(\\d{4}))?$`).exec(txt.trim());
    if (!r) return null;
    return { d: +r[1], m: r[2] ? MESES.indexOf(r[2]) + 1 : (base?.m || null), y: r[3] ? +r[3] : null, explicitY: Boolean(r[3]) };
  }

  function resolverFecha(f, hoyStr) {
    // f: {d, m, y, explicitY} -> 'YYYY-MM-DD' o null. Sin año: el actual (o el anterior si cae en el futuro)
    if (!f || !f.m) return null;
    const anioHoy = Number(hoyStr.slice(0, 4));
    let y = f.y || anioHoy;
    if (!fechaValida(y, f.m, f.d)) return null;
    let s = ymd(y, f.m, f.d);
    if (!f.explicitY && s > addDays(hoyStr, 31)) { y -= 1; if (!fechaValida(y, f.m, f.d)) return null; s = ymd(y, f.m, f.d); }
    return s;
  }

  function rangoLabel(a, b) {
    if (a === b) return `el ${ddmmaa(a)}`;
    return `del ${ddmm(a)} al ${ddmm(b)}${a.slice(0, 4) !== b.slice(0, 4) ? '' : ` de ${b.slice(0, 4)}`}`;
  }

  function interpretarPeriodo(q) {
    const h = hoy();
    const t = getTrake();

    // 1) Rango explícito: "del 9 al 15 de noviembre", "entre el 1 y el 10/10", "desde el 28/10 hasta el 3/11"
    const reR = new RegExp(`\\b(?:del|desde|entre)\\s+(?:el\\s+)?(${FECHA_RE})\\s+(?:al|hasta|y)\\s+(?:el\\s+)?(${FECHA_RE})(?![\\d/])`);
    let r = reR.exec(q);
    if (r) {
      const f2 = fechaDeTexto(r[2], null, h);
      const f1 = fechaDeTexto(r[1], f2, h);
      if (f1 && f2) {
        if (!f1.m && f2.m) f1.m = f2.m;
        if (f1.m && f2.m) {
          let yb = f2.y || Number(h.slice(0, 4));
          let ya = f1.y || yb;
          if (fechaValida(ya, f1.m, f1.d) && fechaValida(yb, f2.m, f2.d)) {
            let a = ymd(ya, f1.m, f1.d), b = ymd(yb, f2.m, f2.d);
            if (a > b && !f1.y) { ya -= 1; a = fechaValida(ya, f1.m, f1.d) ? ymd(ya, f1.m, f1.d) : a; }       // "del 28 de dic al 3 de ene"
            if (!f1.y && !f2.y && a > addDays(h, 31)) {                                                        // fechas muy futuras: año pasado
              const a2 = ymd(Number(a.slice(0, 4)) - 1, f1.m, f1.d), b2 = ymd(Number(b.slice(0, 4)) - 1, f2.m, f2.d);
              if (fechaValida(+a2.slice(0, 4), f1.m, f1.d) && fechaValida(+b2.slice(0, 4), f2.m, f2.d)) { a = a2; b = b2; }
            }
            if (a <= b) return { tipo: 'rango', start: a, end: b, label: rangoLabel(a, b) };
          }
        }
      }
    }

    // 2) "desde el 9 de noviembre" (hasta hoy)
    const reD = new RegExp(`\\bdesde\\s+(?:el\\s+)?(${FECHA_RE})(?![\\d/])`);
    r = reD.exec(q);
    if (r) {
      const f = fechaDeTexto(r[1], null, h);
      const a = f && resolverFecha(f, h);
      if (a) return { tipo: 'rango', start: a, end: h, label: `desde el ${ddmm(a)}` };
    }
    const dw = new RegExp(`\\bdesde\\s+(?:el\\s+)?(${DIAS_SEM.join('|')})\\b`).exec(q);
    if (dw) {
      const a = ultimoDia(dw[1], h, true);
      return { tipo: 'rango', start: a, end: h, label: `desde el ${dw[1]} (${ddmm(a)})` };
    }

    // 3) Relativos
    if (/\bantes de ayer\b|\banteayer\b/.test(q)) { const d = addDays(h, -2); return { tipo: 'rango', start: d, end: d, label: `anteayer (${ddmm(d)})` }; }
    if (/\bayer\b|\banoche\b/.test(q)) { const d = addDays(h, -1); return { tipo: 'rango', start: d, end: d, label: `ayer (${ddmm(d)})` }; }
    if (/\bhoy\b|\besta noche\b/.test(q)) return { tipo: 'rango', start: h, end: h, label: `hoy (${ddmm(h)})` };
    if (/\bsemana pasada\b|\bultima semana\b/.test(q)) {
      const lunes = addDays(h, -((dow(h) + 6) % 7));
      const a = addDays(lunes, -7), b = addDays(lunes, -1);
      return { tipo: 'rango', start: a, end: b, label: `la semana pasada (${ddmm(a)} al ${ddmm(b)})` };
    }
    if (/\besta semana\b/.test(q)) {
      const a = addDays(h, -((dow(h) + 6) % 7));
      return { tipo: 'rango', start: a, end: h, label: `esta semana (desde el ${ddmm(a)})` };
    }
    if (/\bmes pasado\b|\bultimo mes\b/.test(q)) {
      const [y, m] = h.split('-').map(Number);
      const id = m === 1 ? `${y - 1}-12` : `${y}-${pad(m - 1)}`;
      return { tipo: 'mes', id, label: mesLabel(id) };
    }
    if (/\beste mes\b|\bmes actual\b|\bmes en curso\b/.test(q)) return { tipo: 'mes', id: h.slice(0, 7), label: mesLabel(h.slice(0, 7)) };
    if (/\beste ano\b|\bano actual\b/.test(q)) return { tipo: 'rango', start: `${h.slice(0, 4)}-01-01`, end: h, label: `este año (${h.slice(0, 4)})` };

    // 4) Un día concreto: "el 12 de noviembre", "el 12/11"
    r = new RegExp(`\\b(?:el|dia)\\s+(${FECHA_RE})(?![\\d/])`).exec(q);
    if (r && /\d/.test(r[1]) && (/[/-]/.test(r[1]) || new RegExp(MES_RE).test(r[1]))) {
      const f = fechaDeTexto(r[1], null, h);
      const d = f && resolverFecha(f, h);
      if (d) return { tipo: 'rango', start: d, end: d, label: `el ${ddmmaa(d)}` };
    }
    // Un día de la semana: "el sábado" (el más reciente)
    const sem = new RegExp(`\\b(?:el\\s+)?(${DIAS_SEM.join('|')})(?:\\s+pasado)?\\b`).exec(q);
    if (sem && /\b(?:el\s+)?(?:lunes|martes|miercoles|jueves|viernes|sabado|domingo)\b/.test(q)) {
      const d = ultimoDia(sem[1], h, /pasado/.test(q));
      return { tipo: 'rango', start: d, end: d, label: `el ${sem[1]} (${ddmm(d)})` };
    }

    // 5) Fecha especial del admin por nombre (San Miguel, San Roque, Pilares...)
    const evs = (t.events || [])
      .filter((e) => e && e.name && new RegExp(`(^|\\s)${escRe(norm(e.name))}(\\s|$)`).test(q))
      .sort((a, b) => (b.start || '').localeCompare(a.start || ''));
    if (evs.length) {
      const anio = /\b(20\d{2})\b/.exec(q);
      let ev = anio ? evs.find((e) => String(e.start).startsWith(anio[1])) : null;
      ev = ev || evs.find((e) => e.start <= h) || evs[evs.length - 1];
      return { tipo: 'evento', id: ev.id, ev, label: `${ev.name} (${ddmm(ev.start)}${ev.end && ev.end !== ev.start ? ' al ' + ddmm(ev.end) : ''} de ${ev.start.slice(0, 4)})` };
    }

    // 6) Un mes por su nombre
    r = new RegExp(`\\b(${MES_RE})(?:\\s+(?:de\\s+)?(\\d{4}))?\\b`).exec(q);
    if (r) {
      const m = MESES.indexOf(r[1]) + 1;
      let y = r[2] ? +r[2] : Number(h.slice(0, 4));
      if (!r[2] && ymd(y, m, 1) > h) y -= 1;
      const id = `${y}-${pad(m)}`;
      return { tipo: 'mes', id, label: mesLabel(id) };
    }

    // 7) Todo el histórico
    if (/\b(siempre|historico|historia|en total|total historico|desde el principio|hasta ahora|hasta la fecha|en lo que va)\b/.test(q)
      && !/\bde la noche\b/.test(q)) return { tipo: 'total', label: 'en total (todos los meses)' };

    // 8) Por defecto: este mes
    return { tipo: 'mes', id: h.slice(0, 7), label: mesLabel(h.slice(0, 7)), porDefecto: true };
  }

  function ultimoDia(nombre, h, soloPasado) {
    const objetivo = DIAS_SEM.indexOf(nombre);
    let atras = (dow(h) - objetivo + 7) % 7;
    if (atras === 0 && soloPasado) atras = 7;
    return addDays(h, -atras);
  }

  // ---------- cargar los datos del periodo ----------
  function cargar(per) {
    const t = getTrake();
    const avisos = [];
    if (per.tipo === 'mes') return { datos: datosBucket([(t.months || {})[per.id]]), avisos };
    if (per.tipo === 'evento') return { datos: datosBucket([(t.eventData || {})[per.id]]), avisos };
    if (per.tipo === 'total') return { datos: datosBucket(Object.values(t.months || {})), avisos };
    // rango por fechas -> historial
    const startMs = madridMs(per.start), endMs = madridMs(addDays(per.end, 1));
    const log = t.log || [];
    if (!log.length) avisos.push('Todavía no hay apuntes con fecha y hora, así que no puedo contar por días.');
    else {
      const primero = log.reduce((m, l) => Math.min(m, l.ts), Infinity);
      if (startMs < primero) avisos.push(`El historial con fecha empieza el ${ddmmaa(diaFmt.format(new Date(primero)))}; lo anterior a esa fecha no se puede contar por días.`);
    }
    return { datos: datosLog(startMs, endMs), avisos };
  }

  // ---------- interpretar la pregunta ----------
  const METRICAS = [
    ['puntos', /\b(cubata de oro|puntos?|puntuacion|pts)\b/],
    ['cubatas', /\b(cubatas?|copas?|combinados?|cubatazos?)\b/],
    ['cervezas', /\b(cervezas?|birras?|canas?|tercios?|cervecitas?)\b/],
    ['chupitos', /\b(chupitos?|shots?|chupis)\b/],
    ['porros', /\b(porros?|petas?|canutos?|fumadas?)\b/],
    ['cigarros', /\b(cigarros?|cigarrillos?|pitillos?|pitis?|tabaco)\b/]
  ];

  function interpretar(pregunta) {
    const q = norm(pregunta);
    const conocidas = personas();

    // personas mencionadas (las de nombre más largo primero)
    const nombres = [...conocidas.entries()].sort((a, b) => b[0].length - a[0].length);
    let resto = ` ${q} `;
    const mencionadas = [];
    for (const [key, bonito] of nombres) {
      const nk = norm(key);
      if (!nk) continue;
      const re = new RegExp(`(?<=\\s)${escRe(nk)}(?=\\s)`);
      if (re.test(resto)) { mencionadas.push({ key, name: bonito }); resto = resto.replace(re, ' '); }
    }

    const metricas = METRICAS.filter(([, re]) => re.test(q)).map(([k]) => k);
    if (metricas.includes('puntos') && /\bcubata de oro\b/.test(q)) {
      // "cubata de oro" es la clasificación por puntos; no cuenta como pregunta por cubatas
      const i = metricas.indexOf('cubatas'); if (i >= 0 && !/\bcubatas?\b.*\bcubata de oro\b|\bcubata de oro\b.*\bcubatas\b/.test(q)) metricas.splice(i, 1);
    }
    const quiereRanking = /\b(quien|quienes|ranking|clasificacion|top|podio|lider|lidera|va ganando|va primero|va de primero|gana|ganando|primero|ultimo|farolillo)\b/.test(q);
    const alReves = /\b(menos|ultimo|farolillo|peor)\b/.test(q);
    const todos = /\b(entre todos|todos juntos|la pena|llevamos|hemos|en conjunto|en total entre|del grupo|toda la pena)\b/.test(q);
    const topN = (/\btop\s*(\d{1,2})\b/.exec(q) || /\blos\s+(\d{1,2})\s+primeros\b/.exec(q) || [])[1];
    const periodo = interpretarPeriodo(q);
    const preguntaPersona = /\b(cuant[oa]s?|lleva|llevan|ha tomado|ha bebido|se ha|ha fumado|tiene|tienen|cuanto)\b/.test(q);
    return { q, mencionadas, metricas, quiereRanking, alReves, todos, topN: topN ? Math.min(20, Math.max(1, +topN)) : null, periodo, preguntaPersona, conocidas };
  }

  // ---------- redactar respuestas ----------
  const nombreTipo = (k, n) => NOMBRE_TIPO[k][n === 1 ? 0 : 1];
  const cantidadTxt = (k, n) => (k === 'puntos' ? `${num(n)} ${n === 1 ? 'punto' : 'puntos'}` : `${num(n)} ${nombreTipo(k, n)}`);
  const lineaStats = (o) => {
    const trozos = tipos.map((k) => `${EMOJI[k]} ${num(o[k])} ${nombreTipo(k, o[k])}`);
    trozos.push(`${EMOJI.puntos} ${num(o.puntos)} ${o.puntos === 1 ? 'punto' : 'puntos'}`);
    return trozos.join(' · ');
  };
  const metricasValidas = (ms) => ms.filter((m) => m === 'puntos' || tipos.includes(m));

  function responder(pregunta) {
    const i = interpretar(pregunta);
    const { periodo, mencionadas } = i;
    const avisos = [];
    const enPeriodo = periodo.label;
    const sufijo = periodo.tipo === 'total' ? ` ${enPeriodo}` : (periodo.tipo === 'mes' ? ` en ${enPeriodo}` : ` ${enPeriodo}`);

    // Cigarros apagados
    if (i.metricas.includes('cigarros') && !tipos.includes('cigarros')) {
      return { ok: true, titulo: '🚬 Cigarros desactivados', texto: 'Los cigarros todavía no están activados en el Traketímetro, así que no hay datos de ellos.', periodo: enPeriodo };
    }
    if (periodo.tipo === 'evento' && !periodo.ev) return { ok: true, texto: 'No encuentro esa fecha especial.', periodo: enPeriodo };

    const { datos, avisos: av } = cargar(periodo);
    avisos.push(...av);
    if (periodo.porDefecto) avisos.push('No has dicho fechas, así que he mirado este mes.');

    const ms = metricasValidas(i.metricas);
    const lista = [...datos.values()];

    // Sin datos
    if (!lista.length) {
      return { ok: true, titulo: 'Sin datos', texto: `No hay apuntes${sufijo}. 🤷`, periodo: enPeriodo, avisos };
    }

    // --- Entre todos ---
    if (i.todos && !mencionadas.length && !i.quiereRanking) {
      const suma = cerrar(lista.reduce((s, o) => { for (const k of tipos) s[k] += o[k]; return s; }, vacio('Peña')));
      const que = ms.length ? ms : [];
      const texto = que.length
        ? `Entre todos${sufijo}: ${que.map((k) => `${EMOJI[k]} ${cantidadTxt(k, k === 'puntos' ? suma.puntos : suma[k])}`).join(' · ')}.`
        : `Entre todos${sufijo}: ${lineaStats(suma)}.`;
      return { ok: true, titulo: '🍻 La peña entera', texto, periodo: enPeriodo, avisos };
    }

    // --- Ranking (quién lleva más / menos) ---
    if (!mencionadas.length && !ms.length && !i.quiereRanking && !i.todos && !i.preguntaPersona) {
      return { ok: true, titulo: '🤔 No te he entendido', texto: 'Prueba con algo como: “¿Quién lleva más puntos este mes?” o “¿Cuántos cubatas lleva Fulano del 9 al 15 de noviembre?”.', periodo: enPeriodo, noEntendida: true };
    }
    const esRanking = i.quiereRanking || (!mencionadas.length && ms.length > 0 && !i.preguntaPersona);
    if (!mencionadas.length && !esRanking && i.preguntaPersona) {
      const nombres = [...i.conocidas.values()].slice(0, 15).join(', ');
      return { ok: true, titulo: 'No sé a quién te refieres', texto: `No reconozco ese nombre. Los que conozco son: ${nombres || '—'}.`, periodo: enPeriodo, nombres: [...i.conocidas.values()] };
    }
    if (esRanking) {
      const m = ms[0] || 'puntos';
      let cand = lista;
      if (mencionadas.length > 1) cand = lista.filter((o) => mencionadas.some((x) => x.key === o.name.toLowerCase()));
      const val = (o) => (m === 'puntos' ? o.puntos : o[m] || 0);
      cand = cand.slice().sort((a, b) => (i.alReves ? val(a) - val(b) : val(b) - val(a)) || a.name.localeCompare(b.name, 'es'));
      if (!cand.length) return { ok: true, texto: `No hay apuntes de esa gente${sufijo}.`, periodo: enPeriodo, avisos };
      const mejor = val(cand[0]);
      if (!i.alReves && mejor <= 0) return { ok: true, texto: `Nadie ha apuntado ${m === 'puntos' ? 'nada' : nombreTipo(m, 2)}${sufijo}.`, periodo: enPeriodo, avisos };
      const empatados = cand.filter((o) => val(o) === mejor).map((o) => o.name);
      const quien = empatados.length > 1 ? `${empatados.slice(0, -1).join(', ')} y ${empatados[empatados.length - 1]} (empatados)` : empatados[0];
      const cab = i.alReves ? 'Va el último' : (m === 'puntos' ? 'Lleva más puntos' : `Lleva más ${nombreTipo(m, 2)}`);
      const texto = `${i.alReves ? '🐢' : '🏆'} ${cab}: ${quien}, con ${cantidadTxt(m, mejor)}${sufijo}.`;
      const n = i.topN || 10;
      const filas = cand.filter((o) => i.alReves || val(o) > 0).slice(0, n).map((o, idx) => ({
        puesto: idx + 1, name: o.name, valor: val(o), valorTxt: m === 'puntos' ? num(val(o)) : String(val(o)),
        detalle: m === 'puntos' ? lineaStats({ ...o }).replace(/ · ⭐.*$/, '') : `${EMOJI.puntos} ${num(o.puntos)}`
      }));
      return { ok: true, titulo: `${EMOJI[m]} ${cap(m === 'puntos' ? 'Puntos' : nombreTipo(m, 2))}`, texto, filas, columna: m, periodo: enPeriodo, avisos };
    }

    // --- Una o varias personas ---
    const partes = [];
    const filas = [];
    for (const p of mencionadas) {
      const o = datos.get(p.key);
      if (!o) { partes.push(`${p.name} no tiene apuntes${sufijo}.`); continue; }
      const pos = lista.slice().sort((a, b) => b.puntos - a.puntos).findIndex((x) => x.name.toLowerCase() === p.key) + 1;
      if (ms.length) {
        partes.push(`${p.name} lleva ${ms.map((k) => `${EMOJI[k]} ${cantidadTxt(k, k === 'puntos' ? o.puntos : o[k])}`).join(' y ')}${sufijo}.`);
      } else {
        partes.push(`${p.name}${sufijo}: ${lineaStats(o)}. Va ${pos}.º de ${lista.length} en puntos.`);
      }
      const k0 = ms[0];
      filas.push({ puesto: pos, name: o.name, valor: k0 ? (k0 === 'puntos' ? o.puntos : o[k0]) : o.puntos, valorTxt: num(k0 ? (k0 === 'puntos' ? o.puntos : o[k0]) : o.puntos), detalle: k0 ? `${EMOJI.puntos} ${num(o.puntos)}` : lineaStats(o).replace(/ · ⭐.*$/, '') });
    }
    return { ok: true, titulo: mencionadas.length === 1 ? `👤 ${mencionadas[0].name}` : '👥 Comparación', texto: partes.join('\n'), filas: mencionadas.length > 1 ? filas.sort((a, b) => b.valor - a.valor).map((f, idx) => ({ ...f, puesto: idx + 1 })) : undefined, columna: ms[0] || 'puntos', periodo: enPeriodo, avisos };
  }

  // ---------- rutas ----------
  app.get('/api/asistente', async (req, res) => {
    try { await ready; } catch { /* sigue con lo que haya */ }
    res.set('Cache-Control', 'no-store');
    if (limitado(req.ip || 'x')) return res.status(429).json({ ok: false, error: 'Vas muy rápido, espera un momentito. ⏳' });
    const q = String(req.query.q || '').slice(0, 220).trim();
    if (!q) {
      const t = getTrake();
      return res.json({
        ok: true,
        nombres: [...personas().values()].sort((a, b) => a.localeCompare(b, 'es')),
        eventos: (t.events || []).map((e) => e.name),
        cigarros: tipos.includes('cigarros')
      });
    }
    try {
      res.json(responder(q));
    } catch (e) {
      console.error('Asistente:', e.message || e);
      res.status(500).json({ ok: false, error: 'No he podido calcular eso. Prueba a decirlo de otra forma.' });
    }
  });

  return { _responder: responder };
}
