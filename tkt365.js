// =====================================================================
// TKT365 · apuestas 100% virtuales de la peña (puntos "TKT", sin dinero real)
// =====================================================================
// Los USUARIOS no se guardan aquí: salen siempre del Traketímetro. En el
// Traketímetro no hay tabla de usuarios; una persona existe cuando su nombre
// aparece en los meses, en las fechas especiales o en el historial, y su
// identificador interno es el nombre en minúsculas (name.trim().toLowerCase()).
// Ese mismo identificador es el que usa TKT365.
//
// Lo único propio de TKT365 (saldos, mercados, apuestas y movimientos) se
// guarda igual que el Traketímetro: memoria + fichero local + copia en
// Cloudinary (en Render el disco se borra al redesplegar).
//
// Todo se valida en el servidor: el navegador nunca decide saldo, cuota,
// premio, resultado ni ganador.
// =====================================================================

import fs from 'fs';
import path from 'path';
import crypto from 'crypto';
import express from 'express';

// ---------- Ajustes ----------
const SALDO_INICIAL = 1000;
const MAX_SELECCIONES = 8;
const APUESTA_MIN = 10;
const APUESTA_MAX = Number(process.env.TKT_MAX_APUESTA) > 0 ? Math.floor(Number(process.env.TKT_MAX_APUESTA)) : 5000;
const PREMIO_MAX = 1_000_000;
const CUOTA_MIN = 1.01;
const CUOTA_MAX = 1000;
const MARGEN = 0.88;               // las cuotas automáticas reparten un 88 % (la "casa" se queda el resto)
const CIERRE_HORA_EVENTO = 20;     // los mercados de una fecha cierran a las 20:00 del día que empieza
const GRACIA_RESOLUCION_MS = 60 * 60 * 1000; // se resuelve 1 h después de que acabe el periodo
const MAX_MOVIMIENTOS = 20000;
const VISIBLE_CERRADOS_MS = 14 * 24 * 60 * 60 * 1000;

const TZ = 'Europe/Madrid';
const METRICAS = {
  puntos:   { titulo: 'Más puntos',       desc: 'Gana quien más puntos tenga en el Traketímetro' },
  cervezas: { titulo: 'Más cervezas',     desc: 'Gana quien más cervezas apunte en el Traketímetro' },
  cubatas:  { titulo: 'Más cubatas',      desc: 'Gana quien más cubatas apunte en el Traketímetro' },
  chupitos: { titulo: 'Más chupitos',     desc: 'Gana quien más chupitos apunte en el Traketímetro' },
  porros:   { titulo: 'Más porros',       desc: 'Gana quien más porros apunte en el Traketímetro' },
  apuntes:  { titulo: 'Más actividad',    desc: 'Gana quien más veces apunte algo en el Traketímetro' },
  primero:  { titulo: 'Primero en apuntar', desc: 'Gana quien apunte antes su primera consumición en el Traketímetro' },
  ultimo:   { titulo: 'Último en apuntar',  desc: 'Gana quien apunte más tarde su última consumición en el Traketímetro' }
};
const MESES_ES = ['Enero', 'Febrero', 'Marzo', 'Abril', 'Mayo', 'Junio', 'Julio', 'Agosto', 'Septiembre', 'Octubre', 'Noviembre', 'Diciembre'];
const OTRO_ID = '__otro';

// ---------- Fechas (hora de Madrid) ----------
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

// 'YYYY-MM-DD' + hora de Madrid -> milisegundos UTC
function madridMs(fecha, h = 0, m = 0) {
  const [y, mo, d] = fecha.split('-').map(Number);
  const guess = Date.UTC(y, mo - 1, d, h, m);
  const first = guess - madridOffsetMs(guess);
  return guess - madridOffsetMs(first);
}

function addDays(fecha, n) {
  const [y, m, d] = fecha.split('-').map(Number);
  return new Date(Date.UTC(y, m - 1, d + n)).toISOString().slice(0, 10);
}

function mesSiguiente(mes) {
  const [y, m] = mes.split('-').map(Number);
  return m === 12 ? `${y + 1}-01` : `${y}-${String(m + 1).padStart(2, '0')}`;
}

function lunesSiguiente(hoy) {
  const [y, m, d] = hoy.split('-').map(Number);
  const dow = new Date(Date.UTC(y, m - 1, d)).getUTCDay(); // 0 domingo
  const falta = ((8 - dow) % 7) || 7;
  return addDays(hoy, falta);
}

const ddmm = (f) => f.slice(8, 10) + '/' + f.slice(5, 7);
const round2 = (n) => Math.round(n * 100) / 100;
const nowMs = () => Date.now();
const nuevoId = () => Date.now().toString(36) + crypto.randomBytes(5).toString('hex');
const clean = (s, max) => String(s ?? '').replace(/\s+/g, ' ').trim().slice(0, max);

export function registerTkt365({
  app, adminAuth, getTrake, tipos, puntos, hoy, ready, cloudinary, cloudinaryOk, dataDir
}) {
  const FILE = path.join(dataDir, 'tkt365.json');
  const CLOUD_ID = 'traketeros_data/tkt365';

  // ---------- Estado ----------
  const vacio = () => ({
    version: 1,
    balances: Object.create(null), // userId -> { name, balance, since, active }
    markets: [],
    bets: [],
    transactions: [],
    extras: Object.create(null),  // userId -> { name, ts }  (personas que solo apuestan: no están en el Traketímetro)
    claims: Object.create(null),  // userId -> { hash, ts }  (quién ha elegido qué nombre; el token nunca se guarda en claro)
    cuotas: { ts: 0, motivo: '', revisados: 0, cambiados: 0 } // último recálculo de cuotas automáticas
  });
  let st = vacio();

  function normalizar(raw) {
    const s = vacio();
    if (!raw || typeof raw !== 'object') return s;
    if (raw.balances && typeof raw.balances === 'object') Object.assign(s.balances, raw.balances);
    if (Array.isArray(raw.markets)) s.markets = raw.markets;
    if (Array.isArray(raw.bets)) s.bets = raw.bets;
    if (Array.isArray(raw.transactions)) s.transactions = raw.transactions;
    if (raw.claims && typeof raw.claims === 'object') Object.assign(s.claims, raw.claims);
    if (raw.extras && typeof raw.extras === 'object') Object.assign(s.extras, raw.extras);
    if (raw.cuotas && typeof raw.cuotas === 'object') Object.assign(s.cuotas, raw.cuotas);
    return s;
  }

  // ---------- Persistencia ----------
  function saveLocal() {
    try {
      fs.mkdirSync(dataDir, { recursive: true });
      const tmp = FILE + '.tmp';
      fs.writeFileSync(tmp, JSON.stringify(st), 'utf8');
      fs.renameSync(tmp, FILE);
    } catch (e) {
      console.error('TKT365: no se pudo guardar localmente:', e.message || e);
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
      console.error('TKT365: no se pudo respaldar en Cloudinary:', e.message || e);
    } finally {
      cloudBusy = false;
    }
  }

  function save() {
    saveLocal();
    saveCloud();
  }

  async function load() {
    if (cloudinaryOk) {
      try {
        const info = await cloudinary.api.resource(CLOUD_ID, { resource_type: 'raw' });
        const resp = await fetch(info.secure_url, { cache: 'no-store' });
        if (resp.ok) {
          st = normalizar(await resp.json());
          console.log('TKT365: datos cargados desde Cloudinary.');
          return;
        }
      } catch (e) {
        console.warn('TKT365: no se pudo cargar el respaldo de Cloudinary (usando plan B):', e.message || e);
      }
    }
    try {
      st = normalizar(JSON.parse(fs.readFileSync(FILE, 'utf8')));
    } catch {
      st = vacio();
    }
  }

  const cargado = load().catch((e) => console.error('TKT365: error al cargar:', e.message || e));
  const listo = Promise.all([Promise.resolve(ready).catch(() => {}), cargado]);
  let arrancado = false;
  listo.then(() => { arrancado = true; tick(); });

  // ---------- Usuarios: SIEMPRE los del Traketímetro ----------
  function trakeUsuarios(soloTrake = false) {
    const t = getTrake();
    const m = new Map(); // userId -> nombre a mostrar
    const add = (name) => {
      const n = String(name || '').trim();
      if (n) m.set(n.toLowerCase(), n);
    };
    for (const b of Object.values(t.months || {})) for (const p of Object.values(b || {})) add(p.name);
    for (const b of Object.values(t.eventData || {})) for (const p of Object.values(b || {})) add(p.name);
    for (const l of t.log || []) add(l.name);
    if (!soloTrake) {
      // Quien solo apuesta (no está en el Traketímetro). Si luego aparece allí, manda el nombre del Traketímetro.
      for (const [id, e] of Object.entries(st.extras)) if (!m.has(id)) m.set(id, e.name);
    }
    return m;
  }

  function movimiento(userId, tipo, cantidad, antes, despues, extra = {}) {
    st.transactions.push({
      id: nuevoId(), ts: nowMs(), userId, name: st.balances[userId]?.name || userId,
      tipo, cantidad, saldoAntes: antes, saldoDespues: despues, ...extra
    });
    if (st.transactions.length > MAX_MOVIMIENTOS) st.transactions.splice(0, st.transactions.length - MAX_MOVIMIENTOS);
  }

  // Crea el saldo inicial de quien aparezca nuevo en el Traketímetro. Quien
  // desaparezca se queda con su saldo e historial (solo se marca inactivo).
  function sincronizarUsuarios() {
    const users = trakeUsuarios();
    let cambio = false;
    for (const [id, name] of users) {
      const b = st.balances[id];
      if (!b) {
        st.balances[id] = { name, balance: SALDO_INICIAL, since: nowMs(), active: true };
        movimiento(id, 'alta', SALDO_INICIAL, 0, SALDO_INICIAL, { motivo: 'Saldo inicial automático' });
        cambio = true;
      } else {
        if (b.name !== name) { b.name = name; cambio = true; }
        if (!b.active) { b.active = true; cambio = true; }
      }
    }
    for (const [id, b] of Object.entries(st.balances)) {
      if (!users.has(id) && b.active) { b.active = false; cambio = true; }
    }
    return { users, cambio };
  }

  function usuarioValido(raw) {
    const id = String(raw || '').trim().toLowerCase();
    if (!id || id.length > 60) return null;
    const users = trakeUsuarios();
    if (!users.has(id)) return null;
    if (!st.balances[id] && sincronizarUsuarios().cambio) save();
    return st.balances[id] ? id : null;
  }

  // ---------- Identidad: un nombre = un dispositivo ----------
  // El navegador genera un token aleatorio y lo guarda. Aquí solo se guarda su
  // hash. Un token solo puede tener UN nombre y un nombre solo puede tenerlo
  // UN token. Solo el admin puede liberar un nombre (si alguien se equivoca).
  const TOKEN_RE = /^[a-f0-9]{32,64}$/;
  const hashToken = (t) => crypto.createHash('sha256').update(String(t)).digest('hex');
  function tokenValido(t) {
    const s = String(t || '').trim().toLowerCase();
    return TOKEN_RE.test(s) ? s : null;
  }
  // userId que posee este token (o null)
  function duenoDe(token) {
    const t = tokenValido(token);
    if (!t) return null;
    const h = hashToken(t);
    for (const [id, c] of Object.entries(st.claims)) if (c.hash === h) return id;
    return null;
  }

  // ---------- Periodos / ventanas de datos del Traketímetro ----------
  function ventana(per) {
    if (!per) return null;
    const t = getTrake();
    if (per.tipo === 'evento') {
      const ev = (t.events || []).find((e) => e.id === per.id);
      if (!ev) return null;
      const end = ev.end || ev.start;
      return { start: ev.start, end, startMs: madridMs(ev.start), endMs: madridMs(addDays(end, 1)), label: ev.name };
    }
    if (per.tipo === 'mes') {
      if (!/^\d{4}-(0[1-9]|1[0-2])$/.test(per.id || '')) return null;
      const sig = mesSiguiente(per.id);
      const [y, m] = per.id.split('-');
      return {
        start: per.id + '-01', end: addDays(sig + '-01', -1),
        startMs: madridMs(per.id + '-01'), endMs: madridMs(sig + '-01'),
        label: `${MESES_ES[Number(m) - 1]} ${y}`
      };
    }
    if (per.tipo === 'semana') {
      if (!/^\d{4}-\d{2}-\d{2}$/.test(per.start || '')) return null;
      const end = addDays(per.start, 6);
      return { start: per.start, end, startMs: madridMs(per.start), endMs: madridMs(addDays(end, 1)), label: `Semana del ${ddmm(per.start)} al ${ddmm(end)}` };
    }
    return null;
  }

  // Título corto de un mercado automático: "Cubata de Oro noviembre", "Más cervezas semana 2/11"...
  // Se calcula siempre al vuelo, así también se arreglan los mercados que ya estaban guardados.
  function tituloAuto(metrica, periodo) {
    const def = METRICAS[metrica];
    const w = ventana(periodo);
    if (!def || !w) return null;
    if (periodo.tipo === 'mes') {
      const [y, m] = periodo.id.split('-');
      const nombre = MESES_ES[Number(m) - 1].toLowerCase();
      const año = y !== hoy().slice(0, 4) ? ' ' + y : '';
      const base = metrica === 'puntos' ? 'Cubata de Oro' : def.titulo;
      return `${base} ${nombre}${año}`;
    }
    if (periodo.tipo === 'semana') return `${def.titulo} · ${ddmm(periodo.start)} al ${ddmm(addDays(periodo.start, 6))}`;
    return `${def.titulo} · ${w.label}`;
  }

  // Estadísticas del historial (log) dentro de una ventana
  function statsLog(w) {
    const t = getTrake();
    const out = new Map();
    for (const l of t.log || []) {
      if (!l || l.ts < w.startMs || l.ts >= w.endMs) continue;
      const id = String(l.name || '').trim().toLowerCase();
      if (!id) continue;
      let s = out.get(id);
      if (!s) { s = { first: l.ts, last: l.ts, count: 0 }; for (const k of tipos) s[k] = 0; out.set(id, s); }
      s.first = Math.min(s.first, l.ts);
      s.last = Math.max(s.last, l.ts);
      s.count += 1;
      if (tipos.includes(l.tipo)) s[l.tipo] += Number(l.cantidad) || 0;
    }
    return out;
  }

  const puntosDe = (p) => tipos.reduce((s, k) => s + (p[k] || 0) * puntos[k], 0);

  // userId -> valor de la métrica en el periodo (con datos REALES del Traketímetro)
  function puntuaciones(per, metrica) {
    const w = ventana(per);
    if (!w) return null;
    const t = getTrake();
    const out = new Map();
    const usaLog = metrica === 'primero' || metrica === 'ultimo' || metrica === 'apuntes' || per.tipo === 'semana';
    if (usaLog) {
      for (const [id, s] of statsLog(w)) {
        let v;
        if (metrica === 'primero') v = s.first;
        else if (metrica === 'ultimo') v = s.last;
        else if (metrica === 'apuntes') v = s.count;
        else if (metrica === 'puntos') v = puntosDe(s);
        else v = s[metrica] || 0;
        out.set(id, v);
      }
    } else {
      const bucket = per.tipo === 'evento' ? (t.eventData || {})[per.id] : (t.months || {})[per.id];
      for (const p of Object.values(bucket || {})) {
        const id = String(p.name || '').trim().toLowerCase();
        if (!id) continue;
        out.set(id, metrica === 'puntos' ? puntosDe(p) : (p[metrica] || 0));
      }
    }
    return out;
  }

  // Ganadores reales (userIds) o null si no hay datos para decidirlo
  function ganadoresReales(m) {
    const sc = puntuaciones(m.auto.periodo, m.auto.metrica);
    if (!sc || !sc.size) return null;
    const vals = [...sc.values()];
    const mejor = m.auto.metrica === 'primero' ? Math.min(...vals) : Math.max(...vals);
    if (m.auto.metrica !== 'primero' && m.auto.metrica !== 'ultimo' && mejor <= 0) return null;
    return [...sc].filter(([, v]) => v === mejor).map(([id]) => id);
  }

  // ---------- Cuotas automáticas a partir del historial ----------
  function estadisticaHistorica(metrica, antesDe) {
    const t = getTrake();
    const out = new Map();
    const inc = (id, v) => out.set(id, (out.get(id) || 0) + v);
    if (metrica === 'primero' || metrica === 'ultimo' || metrica === 'apuntes') {
      const limite = antesDe ? madridMs(antesDe + '-01') : Infinity;
      for (const l of t.log || []) {
        if (l.ts >= limite) continue;
        const id = String(l.name || '').trim().toLowerCase();
        if (id) inc(id, 1);
      }
    } else {
      for (const [mesId, b] of Object.entries(t.months || {})) {
        if (antesDe && mesId >= antesDe) continue; // ese mes y los siguientes no cuentan: arrancan de cero
        for (const p of Object.values(b || {})) {
          const id = String(p.name || '').trim().toLowerCase();
          if (id) inc(id, metrica === 'puntos' ? puntosDe(p) : (p[metrica] || 0));
        }
      }
    }
    return out;
  }

  function cuotasAuto(metrica, opts) {
    const users = trakeUsuarios(true); // los mercados automáticos solo usan gente del Traketímetro
    const t = getTrake();
    const hist = estadisticaHistorica(metrica, opts?.antesDe);
    // Las cuotas dependen SOLO del consumo total acumulado de la peña (todos los meses
    // sumados), sin peso extra por el último mes. Todo sale del Traketímetro.
    let cand = [...users].map(([id, name]) => ({
      id, name,
      stat: hist.get(id) || 0
    }));
    cand.sort((a, b) => b.stat - a.stat || a.name.localeCompare(b.name, 'es'));
    const conDatos = cand.filter((c) => c.stat > 0).slice(0, opts?.todos ? 12 : 8);
    cand = conDatos.length >= 2 ? conDatos : cand.slice(0, Math.max(4, conDatos.length));
    if (cand.length < 2) return null;
    const media = cand.reduce((s, c) => s + c.stat, 0) / cand.length;
    const pesos = cand.map((c) => c.stat + 0.25 * media + 1);
    const otro = 0.1 * pesos.reduce((a, b) => a + b, 0);
    const total = pesos.reduce((a, b) => a + b, 0) + otro;
    const cuota = (w) => round2(Math.min(40, Math.max(1.1, MARGEN / (w / total))));
    const options = cand.map((c, i) => ({ id: 'u:' + c.id, label: c.name, userId: c.id, odds: cuota(pesos[i]) }));
    options.push({ id: OTRO_ID, label: 'Cualquier otro', odds: cuota(otro) });
    return options;
  }

  function crearMercadoAuto({ metrica, periodo, cierra, key }) {
    const w = ventana(periodo);
    const def = METRICAS[metrica];
    if (!w || !def) return null;
    const options = cuotasAuto(metrica);
    if (!options) return null;
    const m = {
      id: nuevoId(),
      titulo: tituloAuto(metrica, periodo) || def.titulo,
      descripcion: `${def.desc} durante ${w.label}.`,
      categoria: 'Estadísticas',
      evento: w.label,
      eventoId: periodo.tipo === 'evento' ? periodo.id : null,
      cierra,
      estado: 'abierto',
      fuente: 'trakimetro',
      options,
      ganadores: [],
      creado: nowMs(),
      actualizado: nowMs(),
      auto: { key: key || null, metrica, periodo }
    };
    st.markets.push(m);
    return m;
  }

  // Genera los mercados que tienen sentido con los datos de Traketímetro.
  // Es idempotente: cada mercado automático tiene una clave y no se repite.
  function generarAutomaticos() {
    const t = getTrake();
    const ahora = nowMs();
    const hoyStr = hoy();
    const existe = (key) => st.markets.some((m) => m.auto?.key === key);
    let creados = 0;

    // Fechas especiales que aún no han empezado (o empiezan hoy y todavía hay tiempo)
    for (const ev of t.events || []) {
      if (ev.start < hoyStr) continue;
      const cierra = madridMs(ev.start, CIERRE_HORA_EVENTO, 0);
      if (cierra <= ahora) continue;
      for (const metrica of ['puntos', 'cervezas', 'cubatas', 'chupitos', 'apuntes', 'primero', 'ultimo']) {
        const key = `auto:e:${ev.id}:${metrica}`;
        if (existe(key)) continue;
        if (crearMercadoAuto({ metrica, periodo: { tipo: 'evento', id: ev.id }, cierra, key })) creados++;
      }
    }

    // Mes siguiente
    const mesSig = mesSiguiente(hoyStr.slice(0, 7));
    for (const metrica of ['puntos', 'cervezas', 'cubatas', 'chupitos', 'apuntes']) {
      const key = `auto:m:${mesSig}:${metrica}`;
      if (existe(key)) continue;
      if (crearMercadoAuto({ metrica, periodo: { tipo: 'mes', id: mesSig }, cierra: madridMs(mesSig + '-01'), key })) creados++;
    }

    // Semana siguiente (de lunes a domingo)
    const lunes = lunesSiguiente(hoyStr);
    for (const metrica of ['puntos', 'cubatas']) {
      const key = `auto:w:${lunes}:${metrica}`;
      if (existe(key)) continue;
      if (crearMercadoAuto({ metrica, periodo: { tipo: 'semana', start: lunes }, cierra: madridMs(lunes), key })) creados++;
    }
    return creados;
  }

  // ---------- Apuestas: liquidación ----------
  function mercado(id) {
    return st.markets.find((m) => m.id === id);
  }

  function evaluarApuesta(b) {
    let perdida = false;
    let pendiente = false;
    let efectiva = 1;
    let ganada = false;
    for (const leg of b.legs) {
      const m = mercado(leg.marketId);
      if (!m) { pendiente = true; leg.resultado = 'pendiente'; continue; }
      if (m.estado === 'resuelto') {
        leg.resultado = m.ganadores.includes(leg.optionId) ? 'ganada' : 'perdida';
      } else if (m.estado === 'cancelado') {
        leg.resultado = 'anulada';
      } else {
        leg.resultado = 'pendiente';
      }
      if (leg.resultado === 'perdida') perdida = true;
      else if (leg.resultado === 'pendiente') pendiente = true;
      else if (leg.resultado === 'ganada') { efectiva *= leg.odds; ganada = true; }
    }
    if (perdida) return { estado: 'perdida', premio: 0, cuota: 0 };
    if (pendiente) return { estado: 'pendiente' };
    if (!ganada) return { estado: 'cancelada', premio: b.stake, cuota: 1 }; // todas anuladas: se devuelve lo apostado
    const cuota = round2(efectiva);
    return { estado: 'ganada', premio: Math.floor(b.stake * cuota + 1e-9), cuota };
  }

  function liquidarMercado(marketId) {
    for (const b of st.bets) {
      if (b.estado !== 'pendiente') continue;
      if (!b.legs.some((l) => l.marketId === marketId)) continue;
      const r = evaluarApuesta(b);
      if (r.estado === 'pendiente') continue;
      b.estado = r.estado;
      b.cuotaFinal = r.cuota;
      b.premio = r.premio;
      b.liquidada = nowMs();
      const bal = st.balances[b.userId];
      if (bal && r.premio > 0) {
        const antes = bal.balance;
        bal.balance += r.premio;
        movimiento(b.userId, r.estado === 'ganada' ? 'premio' : 'reembolso', r.premio, antes, bal.balance, {
          betId: b.id, motivo: r.estado === 'ganada' ? 'Apuesta ganada' : 'Apuesta cancelada: se devuelven los TKT'
        });
      }
    }
  }

  function resolverMercado(m, ganadores, por) {
    m.estado = 'resuelto';
    m.ganadores = ganadores;
    m.resolucion = { por, ts: nowMs() };
    m.actualizado = nowMs();
    liquidarMercado(m.id);
  }

  function cancelarMercado(m, motivo) {
    m.estado = 'cancelado';
    m.motivoCancelacion = motivo || '';
    m.actualizado = nowMs();
    liquidarMercado(m.id);
  }

  // ---------- Reloj: cierra, resuelve y genera ----------
  let ticking = false;
  function tick() {
    if (!arrancado || ticking) return;
    ticking = true;
    try {
      let cambio = sincronizarUsuarios().cambio;
      const ahora = nowMs();
      for (const m of st.markets) {
        if (m.estado === 'abierto' && m.cierra <= ahora) { m.estado = 'cerrado'; m.actualizado = ahora; cambio = true; }
      }
      for (const m of st.markets) {
        if (!m.auto || (m.estado !== 'abierto' && m.estado !== 'cerrado')) continue;
        const w = ventana(m.auto.periodo);
        if (!w || ahora < w.endMs + GRACIA_RESOLUCION_MS) continue;
        const g = ganadoresReales(m);
        if (!g) {
          cancelarMercado(m, 'Sin datos en el Traketímetro para decidir el resultado');
        } else {
          let ids = m.options.filter((o) => o.userId && g.includes(o.userId)).map((o) => o.id);
          if (g.some((id) => !m.options.some((o) => o.userId === id)) && m.options.some((o) => o.id === OTRO_ID)) ids.push(OTRO_ID);
          if (!ids.length) cancelarMercado(m, 'El resultado no coincide con ninguna opción');
          else resolverMercado(m, ids, 'auto');
        }
        cambio = true;
      }
      if (generarAutomaticos() > 0) cambio = true;
      if (cambio) save();
    } catch (e) {
      console.error('TKT365: error en el reloj:', e.message || e);
    } finally {
      ticking = false;
    }
  }
  setInterval(tick, 30_000).unref();

  // ---------- Vistas públicas ----------
  function fase(m, ahora) {
    const w = m.auto ? ventana(m.auto.periodo) : (m.eventoId ? ventana({ tipo: 'evento', id: m.eventoId }) : null);
    return { w, proximo: Boolean(w && w.startMs > ahora) };
  }

  function mercadoPublico(m, ahora) {
    const { w, proximo } = fase(m, ahora);
    return {
      id: m.id, titulo: (m.auto && tituloAuto(m.auto.metrica, m.auto.periodo)) || m.titulo, descripcion: String(m.descripcion || '').replace(/Trak[ií]metro/g, 'Traketímetro'), categoria: m.categoria,
      evento: m.evento, eventoId: m.eventoId || null, cierra: m.cierra, estado: m.estado,
      fuente: m.fuente === 'trakimetro' ? 'Traketímetro' : 'Manual',
      options: m.options.map((o) => ({ id: o.id, label: o.label, odds: o.odds })),
      ganadores: m.ganadores || [],
      proximo,
      ventana: w ? { start: w.start, end: w.end, label: w.label } : null,
      resolucion: m.resolucion || null,
      motivoCancelacion: m.motivoCancelacion || ''
    };
  }

  function estadisticas(userId) {
    let ganadas = 0, perdidas = 0, apostado = 0, beneficio = 0, pendientes = 0;
    for (const b of st.bets) {
      if (b.userId !== userId) continue;
      if (b.estado === 'cancelada') continue;
      apostado += b.stake;
      if (b.estado === 'ganada') { ganadas++; beneficio += b.premio - b.stake; }
      else if (b.estado === 'perdida') { perdidas++; beneficio -= b.stake; }
      else pendientes++;
    }
    return { ganadas, perdidas, pendientes, apostado, beneficio };
  }

  function tituloMercado(id) {
    const m = st.markets.find((x) => x.id === id);
    return m?.auto ? tituloAuto(m.auto.metrica, m.auto.periodo) : null;
  }

  function apuestaPublica(b) {
    return {
      id: b.id, tipo: b.legs.length > 1 ? 'combinada' : 'simple', ts: b.ts, stake: b.stake,
      cuota: b.totalOdds, premioPosible: b.potential, estado: b.estado,
      premio: b.premio || 0, cuotaFinal: b.cuotaFinal ?? null,
      legs: b.legs.map((l) => ({
        marketId: l.marketId, mercado: tituloMercado(l.marketId) || l.marketTitulo, evento: l.evento, opcion: l.label, odds: l.odds, resultado: l.resultado || 'pendiente'
      }))
    };
  }

  function ranking() {
    return Object.entries(st.balances)
      .map(([id, b]) => ({ id, name: b.name, active: b.active, balance: b.balance, ...estadisticas(id) }))
      .sort((a, b) => b.balance - a.balance || b.beneficio - a.beneficio || a.name.localeCompare(b.name, 'es'));
  }

  // ---------- Colocar apuestas ----------
  function colocarApuesta(req, res, modo) {
    const userId = duenoDe(req.body?.token);
    if (!userId) return res.status(403).json({ error: 'Primero elige quién eres (arriba). Si ya lo hiciste y no funciona, díselo al admin.', identidad: true });
    if (!usuarioValido(userId)) return res.status(400).json({ error: 'Usuario no válido: tiene que existir en el Traketímetro.' });

    const stake = Number(req.body?.stake);
    if (!Number.isInteger(stake) || stake < APUESTA_MIN) {
      return res.status(400).json({ error: `La apuesta mínima es de ${APUESTA_MIN} TKT (cantidad entera).` });
    }
    if (stake > APUESTA_MAX) return res.status(400).json({ error: `La apuesta máxima es de ${APUESTA_MAX} TKT.` });

    const sel = req.body?.selections;
    if (!Array.isArray(sel) || !sel.length) return res.status(400).json({ error: 'No has elegido ninguna selección.' });
    if (modo === 'simple' && sel.length !== 1) {
      return res.status(400).json({ error: 'Una apuesta simple lleva una sola selección. Usa la combinada.' });
    }
    if (modo === 'combinada' && sel.length < 2) {
      return res.status(400).json({ error: 'Una combinada necesita al menos 2 selecciones.' });
    }
    if (sel.length > MAX_SELECCIONES) {
      return res.status(400).json({ error: `Máximo ${MAX_SELECCIONES} selecciones por combinada.` });
    }

    const ahora = nowMs();
    const legs = [];
    const usados = new Set();
    for (const s of sel) {
      const m = mercado(String(s?.marketId || ''));
      if (!m) return res.status(400).json({ error: 'Uno de los mercados ya no existe.' });
      if (usados.has(m.id)) return res.status(400).json({ error: 'No puedes elegir dos opciones del mismo mercado en una combinada.' });
      usados.add(m.id);
      if (m.estado !== 'abierto' || m.cierra <= ahora) {
        return res.status(409).json({ error: `El mercado «${m.titulo}» ya está cerrado.`, refrescar: true });
      }
      const o = m.options.find((x) => x.id === String(s?.optionId || ''));
      if (!o) return res.status(400).json({ error: 'Una de las opciones no es válida.' });
      legs.push({ marketId: m.id, marketTitulo: m.titulo, evento: m.evento, optionId: o.id, label: o.label, odds: o.odds, resultado: 'pendiente' });
    }

    const totalOdds = round2(legs.reduce((p, l) => p * l.odds, 1));
    const potential = Math.floor(stake * totalOdds + 1e-9);
    if (potential > PREMIO_MAX) {
      return res.status(400).json({ error: `El premio máximo por apuesta es de ${PREMIO_MAX} TKT. Baja la cantidad.` });
    }

    // Solo para avisar de que las cuotas han cambiado; la cuota que vale es la del servidor
    const esperada = Number(req.body?.expectedOdds);
    if (Number.isFinite(esperada) && Math.abs(esperada - totalOdds) > 0.001) {
      return res.status(409).json({ error: 'Las cuotas han cambiado. Revisa el cupón y vuelve a apostar.', refrescar: true, cuota: totalOdds });
    }

    const bal = st.balances[userId];
    if (bal.balance < stake) return res.status(400).json({ error: 'No tienes saldo suficiente.' });

    const antes = bal.balance;
    bal.balance -= stake;
    const bet = { id: nuevoId(), userId, name: bal.name, ts: ahora, stake, totalOdds, potential, legs, estado: 'pendiente', premio: 0 };
    st.bets.push(bet);
    movimiento(userId, 'apuesta', -stake, antes, bal.balance, { betId: bet.id, motivo: legs.length > 1 ? 'Combinada' : 'Apuesta simple' });
    save();
    res.json({ ok: true, bet: apuestaPublica(bet), balance: bal.balance });
  }

  // ---------- Rutas públicas ----------
  const api = express.Router();
  api.use(async (req, res, next) => {
    res.set('Cache-Control', 'no-store');
    try { await listo; } catch { /* sigue */ }
    tick();
    next();
  });

  api.get('/markets', (req, res) => {
    const ahora = nowMs();
    const users = [...trakeUsuarios()].map(([id, name]) => ({ id, name, taken: Boolean(st.claims[id]), soloApuestas: !trakeUsuarios(true).has(id) })).sort((a, b) => a.name.localeCompare(b.name, 'es'));
    const yo = duenoDe(req.query.token);
    const markets = st.markets
      .filter((m) => m.estado === 'abierto' || ahora - (m.actualizado || m.cierra) < VISIBLE_CERRADOS_MS)
      .sort((a, b) => a.cierra - b.cierra)
      .map((m) => mercadoPublico(m, ahora));
    res.json({
      ok: true, now: ahora, users, markets, yo,
      config: { saldoInicial: SALDO_INICIAL, apuestaMin: APUESTA_MIN, apuestaMax: APUESTA_MAX, maxSelecciones: MAX_SELECCIONES }
    });
  });

  api.get('/me', (req, res) => {
    const id = usuarioValido(req.query.user);
    if (!id) return res.status(404).json({ error: 'Esa persona no está en el Traketímetro.' });
    res.json({ ok: true, id, name: st.balances[id].name, balance: st.balances[id].balance, ...estadisticas(id) });
  });

  // Solo las apuestas de quien es dueño de ese dispositivo (nadie ve las de otros)
  api.get('/my-bets', (req, res) => {
    const id = duenoDe(req.query.token);
    if (!id) return res.status(403).json({ error: 'Elige quién eres para ver tus apuestas.' });
    const bets = st.bets.filter((b) => b.userId === id).sort((a, b) => b.ts - a.ts).slice(0, 200).map(apuestaPublica);
    res.json({ ok: true, bets });
  });

  api.get('/ranking', (req, res) => {
    res.json({ ok: true, ranking: ranking() });
  });

  // ---------- Personas que solo apuestan (sin Traketímetro) ----------
  const MAX_EXTRAS = 80;
  function nombreNuevoValido(raw) {
    const name = clean(raw, 30);
    if (name.length < 2) return { error: 'Escribe un nombre de al menos 2 letras.' };
    if (!/[\p{L}\p{N}]/u.test(name)) return { error: 'Ese nombre no vale.' };
    if (/[<>"`]/.test(name)) return { error: 'El nombre no puede llevar < > " ni comillas raras.' };
    const id = name.toLowerCase();
    if (id === OTRO_ID || id.startsWith('__')) return { error: 'Ese nombre no vale.' };
    if (trakeUsuarios().has(id) || st.balances[id]) return { error: 'Ese nombre ya existe: búscalo en la lista.', existe: true };
    if (Object.keys(st.extras).length >= MAX_EXTRAS) return { error: 'No caben más personas. Díselo al admin.' };
    return { id, name };
  }
  function crearExtra(id, name) {
    st.extras[id] = { name, ts: nowMs() };
    sincronizarUsuarios(); // crea el saldo inicial
  }

  // Apuntarse solo para apostar. Crea el nombre y lo deja elegido en este dispositivo.
  api.post('/join', (req, res) => {
    const token = tokenValido(req.body?.token);
    if (!token) return res.status(400).json({ error: 'Dispositivo no válido. Recarga la página.' });
    const propio = duenoDe(token);
    if (propio) return res.status(409).json({ error: `Ya eres ${st.balances[propio].name}. Si te equivocaste, pídele al admin que te libere el nombre.` });
    const v = nombreNuevoValido(req.body?.name);
    if (v.error) return res.status(400).json({ error: v.error, existe: Boolean(v.existe) });
    crearExtra(v.id, v.name);
    st.claims[v.id] = { hash: hashToken(token), ts: nowMs() };
    save();
    res.json({ ok: true, user: v.id, name: v.name });
  });

  // Elegir nombre (una sola vez por dispositivo; solo el admin puede deshacerlo)
  api.post('/claim', (req, res) => {
    const token = tokenValido(req.body?.token);
    if (!token) return res.status(400).json({ error: 'Dispositivo no válido. Recarga la página.' });
    const id = usuarioValido(req.body?.user);
    if (!id) return res.status(404).json({ error: 'Esa persona no está en el Traketímetro.' });
    const propio = duenoDe(token);
    if (propio === id) return res.json({ ok: true, user: id, name: st.balances[id].name });
    if (propio) {
      return res.status(409).json({ error: `Ya eres ${st.balances[propio].name}. Si te equivocaste, pídele al admin que te libere el nombre.` });
    }
    if (st.claims[id]) {
      return res.status(409).json({ error: `${st.balances[id].name} ya lo ha elegido otra persona. Si eres tú, díselo al admin.`, refrescar: true });
    }
    st.claims[id] = { hash: hashToken(token), ts: nowMs() };
    save();
    res.json({ ok: true, user: id, name: st.balances[id].name });
  });

  api.post('/bets', (req, res) => colocarApuesta(req, res, 'simple'));
  api.post('/combination', (req, res) => colocarApuesta(req, res, 'combinada'));

  // ---------- Admin ----------
  const adm = express.Router();
  adm.use(adminAuth);
  adm.use(async (req, res, next) => {
    res.set('Cache-Control', 'no-store');
    try { await listo; } catch { /* sigue */ }
    tick();
    next();
  });

  function adminNombre() {
    return process.env.ADMIN_USER || 'admin';
  }

  function statsMercado(m) {
    // Las apuestas anuladas/canceladas no cuentan como apuestas hechas ni como TKT apostados
    const bets = st.bets.filter((b) => b.estado !== 'cancelada' && b.legs.some((l) => l.marketId === m.id));
    const usuarios = new Set(bets.map((b) => b.userId));
    const porOpcion = {};
    let total = 0;
    for (const b of bets) {
      for (const l of b.legs) {
        if (l.marketId !== m.id) continue;
        porOpcion[l.optionId] = (porOpcion[l.optionId] || 0) + b.stake;
      }
      total += b.stake;
    }
    return { apuestas: bets.length, apostado: total, usuarios: usuarios.size, porOpcion };
  }

  function mercadoAdmin(m, ahora) {
    return { ...mercadoPublico(m, ahora), auto: m.auto || null, stats: statsMercado(m) };
  }

  function parseCierre(v) {
    if (typeof v === 'number' && Number.isFinite(v)) return Math.round(v);
    const s = String(v || '').trim();
    const r = /^(\d{4}-\d{2}-\d{2})[T ](\d{2}):(\d{2})/.exec(s);
    if (r) return madridMs(r[1], Number(r[2]), Number(r[3]));
    return NaN;
  }

  // Valida y construye la lista de opciones. Las opciones de usuario salen
  // SIEMPRE de Traketímetro (el nombre no se escribe a mano).
  function construirOpciones(raw, previas = []) {
    if (!Array.isArray(raw) || raw.length < 2) return { error: 'Hacen falta al menos 2 opciones.' };
    if (raw.length > 30) return { error: 'Demasiadas opciones (máximo 30).' };
    const users = trakeUsuarios();
    const out = [];
    const vistos = new Set();
    for (const o of raw) {
      const odds = round2(Number(o?.odds));
      if (!Number.isFinite(odds) || odds < CUOTA_MIN || odds > CUOTA_MAX) {
        return { error: `Cada cuota tiene que estar entre ${CUOTA_MIN} y ${CUOTA_MAX}.` };
      }
      let opt;
      if (o.userId) {
        const uid = String(o.userId).trim().toLowerCase();
        if (!users.has(uid)) return { error: 'Una de las personas no existe en el Traketímetro.' };
        opt = { id: 'u:' + uid, label: users.get(uid), userId: uid, odds };
      } else {
        const label = clean(o.label, 60);
        if (!label) return { error: 'Una opción no tiene nombre.' };
        const prev = o.id ? previas.find((p) => p.id === o.id && !p.userId) : null;
        opt = { id: prev ? prev.id : (o.id === OTRO_ID ? OTRO_ID : 'o:' + crypto.randomBytes(4).toString('hex')), label, odds };
      }
      const clave = opt.userId ? 'u:' + opt.userId : 'l:' + opt.label.toLowerCase();
      if (vistos.has(clave) || out.some((x) => x.id === opt.id)) return { error: 'Hay opciones repetidas.' };
      vistos.add(clave);
      out.push(opt);
    }
    return { options: out };
  }

  adm.get('/overview', (req, res) => {
    sincronizarUsuarios();
    const ahora = nowMs();
    const t = getTrake();
    const markets = [...st.markets].sort((a, b) => b.cierra - a.cierra).map((m) => mercadoAdmin(m, ahora));
    const totalApostado = st.bets.filter((b) => b.estado !== 'cancelada').reduce((s, b) => s + b.stake, 0);
    res.json({
      ok: true, now: ahora,
      markets,
      users: ranking().map((u) => ({ ...u, reclamado: st.claims[u.id] ? st.claims[u.id].ts : null, soloApuestas: Boolean(st.extras[u.id]) && !trakeUsuarios(true).has(u.id) })),
      bets: [...st.bets].sort((a, b) => b.ts - a.ts).slice(0, 500).map((b) => ({ ...apuestaPublica(b), usuario: b.name, userId: b.userId })),
      events: (t.events || []).map((e) => ({ id: e.id, name: e.name, start: e.start, end: e.end || e.start })),
      metricas: Object.entries(METRICAS).map(([id, d]) => ({ id, titulo: d.titulo })),
      transactions: [...st.transactions].reverse().slice(0, 300),
      resumen: { mercados: st.markets.length, abiertos: st.markets.filter((m) => m.estado === 'abierto').length, apuestas: st.bets.filter((b) => b.estado !== 'cancelada').length, totalApostado },
      config: { apuestaMin: APUESTA_MIN, apuestaMax: APUESTA_MAX, cuotaMin: CUOTA_MIN, cuotaMax: CUOTA_MAX },
      ultimoRecalculo: st.cuotas
    });
  });

  adm.post('/markets', (req, res) => {
    const titulo = clean(req.body?.titulo, 120);
    if (!titulo) return res.status(400).json({ error: 'Falta el título.' });
    const cierra = parseCierre(req.body?.cierra);
    if (!Number.isFinite(cierra) || cierra <= nowMs()) return res.status(400).json({ error: 'La hora de cierre tiene que ser futura.' });
    const r = construirOpciones(req.body?.options);
    if (r.error) return res.status(400).json({ error: r.error });

    const t = getTrake();
    const eventoId = req.body?.eventoId ? String(req.body.eventoId) : null;
    const ev = eventoId ? (t.events || []).find((e) => e.id === eventoId) : null;
    if (eventoId && !ev) return res.status(400).json({ error: 'Esa fecha especial no existe.' });

    const m = {
      id: nuevoId(), titulo,
      descripcion: clean(req.body?.descripcion, 300),
      categoria: clean(req.body?.categoria, 40) || 'General',
      evento: ev ? ev.name : clean(req.body?.evento, 80),
      eventoId: ev ? ev.id : null,
      cierra, estado: 'abierto', fuente: 'manual', options: r.options, ganadores: [],
      creado: nowMs(), actualizado: nowMs(), auto: null
    };
    st.markets.push(m);
    save();
    res.json({ ok: true, market: mercadoAdmin(m, nowMs()) });
  });

  // Mercado automático con datos reales del Traketímetro, elegido a mano
  adm.post('/auto', (req, res) => {
    const metrica = String(req.body?.metrica || '');
    if (!METRICAS[metrica]) return res.status(400).json({ error: 'Métrica no válida.' });
    const tipo = String(req.body?.periodoTipo || '');
    let periodo;
    if (tipo === 'evento') periodo = { tipo, id: String(req.body?.periodoId || '') };
    else if (tipo === 'mes') periodo = { tipo, id: String(req.body?.periodoId || '') };
    else if (tipo === 'semana') periodo = { tipo, start: String(req.body?.periodoId || '') };
    else return res.status(400).json({ error: 'Periodo no válido.' });
    const w = ventana(periodo);
    if (!w) return res.status(400).json({ error: 'Periodo no válido.' });
    if (w.endMs <= nowMs()) return res.status(400).json({ error: 'Ese periodo ya ha terminado.' });
    const cierra = parseCierre(req.body?.cierra);
    if (!Number.isFinite(cierra) || cierra <= nowMs()) return res.status(400).json({ error: 'La hora de cierre tiene que ser futura.' });
    const m = crearMercadoAuto({ metrica, periodo, cierra, key: null });
    if (!m) return res.status(400).json({ error: 'No hay suficientes personas en el Traketímetro para crear este mercado.' });
    save();
    res.json({ ok: true, market: mercadoAdmin(m, nowMs()) });
  });

  adm.post('/generate', (req, res) => {
    const n = generarAutomaticos();
    if (n) save();
    res.json({ ok: true, creados: n });
  });

  function mercadoDeRuta(req, res) {
    const m = mercado(String(req.params.id || ''));
    if (!m) { res.status(404).json({ error: 'Ese mercado no existe.' }); return null; }
    return m;
  }

  adm.put('/markets/:id', (req, res) => {
    const m = mercadoDeRuta(req, res);
    if (!m) return;
    if (m.estado === 'resuelto' || m.estado === 'cancelado') {
      return res.status(409).json({ error: 'Un mercado resuelto o cancelado no se puede editar.' });
    }
    const b = req.body || {};
    if (b.titulo !== undefined) {
      const titulo = clean(b.titulo, 120);
      if (!titulo) return res.status(400).json({ error: 'Falta el título.' });
      m.titulo = titulo;
    }
    if (b.descripcion !== undefined) m.descripcion = clean(b.descripcion, 300);
    if (b.categoria !== undefined) m.categoria = clean(b.categoria, 40) || 'General';
    if (b.evento !== undefined && !m.auto) m.evento = clean(b.evento, 80);
    if (b.cierra !== undefined) {
      const c = parseCierre(b.cierra);
      if (!Number.isFinite(c)) return res.status(400).json({ error: 'Hora de cierre no válida.' });
      m.cierra = c;
    }
    if (b.options !== undefined) {
      const r = construirOpciones(b.options, m.options);
      if (r.error) return res.status(400).json({ error: r.error });
      // No se puede quitar una opción sobre la que ya hay apuestas
      for (const o of m.options) {
        if (r.options.some((x) => x.id === o.id)) continue;
        if (st.bets.some((bt) => bt.legs.some((l) => l.marketId === m.id && l.optionId === o.id))) {
          return res.status(409).json({ error: `La opción «${o.label}» ya tiene apuestas y no se puede quitar.` });
        }
      }
      // Las cuotas nuevas valen para apuestas futuras; las antiguas conservan la suya
      m.options = r.options;
    }
    m.actualizado = nowMs();
    save();
    res.json({ ok: true, market: mercadoAdmin(m, nowMs()) });
  });

  // Sustituye las cuotas de un mercado conservando las opciones que ya tienen apuestas
  function aplicarCuotas(m, nuevas) {
    for (const o of m.options) {
      if (!nuevas.some((n) => n.id === o.id) && st.bets.some((bt) => bt.legs.some((l) => l.marketId === m.id && l.optionId === o.id))) nuevas.push(o);
    }
    const firma = (os) => JSON.stringify(os.map((o) => [o.id, o.label, o.odds]));
    if (firma(nuevas) === firma(m.options)) return false; // nada que cambiar
    m.options = nuevas;
    m.actualizado = nowMs();
    m.cuotasTs = m.actualizado;
    return true;
  }

  // Cuotas de un mercado automático calculadas SOLO con estadísticas del Traketímetro
  // (cubatas, cervezas, chupitos, porros, puntos, apuntes...). El Cubata de Oro (puntos
  // de un mes) usa las estadísticas totales de la peña, igual que su botón propio.
  function opcionesAuto(m) {
    const per = m.auto?.periodo;
    const delMes = per?.tipo === 'mes' ? per.id : null;
    const todos = m.auto?.metrica === 'puntos' && Boolean(delMes);
    return cuotasAuto(m.auto.metrica, { antesDe: delMes, todos });
  }

  // Recalcula las cuotas de TODOS los mercados automáticos abiertos y lo guarda en el
  // backend (fichero + Cloudinary). Las apuestas ya hechas conservan la cuota con la
  // que se colocaron (la cuota va dentro de cada apuesta).
  function recalcularCuotas(motivo = 'registro', { forzarGuardado = false } = {}) {
    if (!arrancado) return { revisados: 0, cambiados: 0 };
    let revisados = 0;
    let cambiados = 0;
    for (const m of st.markets) {
      if (!m.auto || m.estado !== 'abierto') continue;
      const nuevas = opcionesAuto(m);
      if (!nuevas) continue;
      revisados++;
      if (aplicarCuotas(m, nuevas)) cambiados++;
    }
    if (cambiados > 0 || forzarGuardado) {
      st.cuotas = { ts: nowMs(), motivo, revisados, cambiados };
      save();
    }
    return { revisados, cambiados };
  }

  // Cada nuevo registro del Traketímetro llega aquí. Se agrupan registros seguidos
  // (800 ms) para no recalcular de más.
  let recalcTimer = null;
  function programarRecalculo(motivo = 'registro') {
    if (recalcTimer) clearTimeout(recalcTimer);
    recalcTimer = setTimeout(() => {
      recalcTimer = null;
      try { recalcularCuotas(motivo); } catch (e) { console.error('TKT365: error al recalcular cuotas:', e.message || e); }
    }, 800);
    recalcTimer.unref?.();
  }

  adm.post('/markets/:id/recalc', (req, res) => {
    const m = mercadoDeRuta(req, res);
    if (!m) return;
    if (!m.auto) return res.status(400).json({ error: 'Solo los mercados automáticos se pueden recalcular.' });
    if (m.estado === 'resuelto' || m.estado === 'cancelado') return res.status(409).json({ error: 'Este mercado ya no está activo.' });
    const nuevas = opcionesAuto(m);
    if (!nuevas) return res.status(400).json({ error: 'No hay datos suficientes.' });
    if (aplicarCuotas(m, nuevas)) save();
    res.json({ ok: true, market: mercadoAdmin(m, nowMs()) });
  });

  // Botón 🔄 "Recalcular cuotas": todos los mercados automáticos abiertos de una vez
  adm.post('/recalc-all', (req, res) => {
    const r = recalcularCuotas('admin', { forzarGuardado: true });
    res.json({ ok: true, ...r, ts: st.cuotas.ts });
  });

  // Cubata de Oro de un mes (el mercado "¿Quién sumará más puntos?" de ese mes):
  // cuotas recalculadas con las estadísticas TOTALES de la peña (todos los meses sumados).
  adm.post('/recalc-cubata-oro', (req, res) => {
    const mes = String(req.body?.mes || mesSiguiente(hoy().slice(0, 7)));
    const m = st.markets.find((x) => x.auto && x.auto.metrica === 'puntos' && x.auto.periodo?.tipo === 'mes' && x.auto.periodo.id === mes);
    if (!m) return res.status(404).json({ error: 'No existe el mercado del Cubata de Oro de ese mes.' });
    if (m.estado === 'resuelto' || m.estado === 'cancelado') return res.status(409).json({ error: 'Ese mercado ya no está activo.' });
    const nuevas = cuotasAuto('puntos', { todos: true, antesDe: mes }); // todos empiezan el mes con 0: solo cuenta lo anterior
    if (!nuevas) return res.status(400).json({ error: 'No hay datos suficientes.' });
    aplicarCuotas(m, nuevas);
    save();
    res.json({ ok: true, market: mercadoAdmin(m, nowMs()) });
  });

  // ---------- Borrar mercados ----------
  // Solo se borra lo que ya no puede dejar apuestas colgadas: si una apuesta
  // pendiente depende del mercado, se conserva hasta resolverlo o cancelarlo.
  const tienePendientes = (id) => st.bets.some((b) => b.estado === 'pendiente' && b.legs.some((l) => l.marketId === id));

  adm.post('/markets/purge-closed', (req, res) => {
    const finales = ['cerrado', 'resuelto', 'cancelado'];
    const quitar = st.markets.filter((m) => finales.includes(m.estado) && !tienePendientes(m.id));
    const conservados = st.markets.filter((m) => finales.includes(m.estado) && tienePendientes(m.id)).length;
    if (quitar.length) {
      const ids = new Set(quitar.map((m) => m.id));
      st.markets = st.markets.filter((m) => !ids.has(m.id));
      save();
    }
    res.json({ ok: true, borrados: quitar.length, conservados });
  });

  adm.delete('/markets/:id', (req, res) => {
    const m = mercadoDeRuta(req, res);
    if (!m) return;
    if (m.estado === 'abierto') return res.status(409).json({ error: 'Cierra el mercado antes de borrarlo.' });
    if (tienePendientes(m.id)) return res.status(409).json({ error: 'Tiene apuestas pendientes: resuélvelo o cancélalo primero.' });
    st.markets = st.markets.filter((x) => x.id !== m.id);
    save();
    res.json({ ok: true });
  });

  adm.post('/markets/:id/close', (req, res) => {
    const m = mercadoDeRuta(req, res);
    if (!m) return;
    if (m.estado !== 'abierto') return res.status(409).json({ error: 'Solo se puede cerrar un mercado abierto.' });
    m.estado = 'cerrado';
    m.actualizado = nowMs();
    save();
    res.json({ ok: true, market: mercadoAdmin(m, nowMs()) });
  });

  adm.post('/markets/:id/open', (req, res) => {
    const m = mercadoDeRuta(req, res);
    if (!m) return;
    if (m.estado !== 'cerrado') return res.status(409).json({ error: 'Solo se puede abrir un mercado cerrado.' });
    if (req.body?.cierra !== undefined) {
      const c = parseCierre(req.body.cierra);
      if (!Number.isFinite(c)) return res.status(400).json({ error: 'Hora de cierre no válida.' });
      m.cierra = c;
    }
    if (m.cierra <= nowMs()) return res.status(400).json({ error: 'La hora de cierre ya pasó: indica una nueva hora de cierre.' });
    m.estado = 'abierto';
    m.actualizado = nowMs();
    save();
    res.json({ ok: true, market: mercadoAdmin(m, nowMs()) });
  });

  adm.post('/markets/:id/resolve', (req, res) => {
    const m = mercadoDeRuta(req, res);
    if (!m) return;
    if (m.estado === 'resuelto' || m.estado === 'cancelado') return res.status(409).json({ error: 'Este mercado ya está resuelto o cancelado.' });
    let g = req.body?.ganadores;
    if (!Array.isArray(g)) g = req.body?.ganador ? [req.body.ganador] : [];
    g = [...new Set(g.map(String))];
    if (!g.length || g.some((id) => !m.options.some((o) => o.id === id))) {
      return res.status(400).json({ error: 'Elige una opción ganadora válida.' });
    }
    resolverMercado(m, g, 'admin');
    save();
    res.json({ ok: true, market: mercadoAdmin(m, nowMs()) });
  });

  adm.post('/markets/:id/cancel', (req, res) => {
    const m = mercadoDeRuta(req, res);
    if (!m) return;
    if (m.estado === 'resuelto' || m.estado === 'cancelado') return res.status(409).json({ error: 'Este mercado ya está resuelto o cancelado.' });
    cancelarMercado(m, clean(req.body?.motivo, 120) || 'Cancelado por el administrador');
    save();
    res.json({ ok: true, market: mercadoAdmin(m, nowMs()) });
  });

  adm.get('/markets/:id/bets', (req, res) => {
    const m = mercadoDeRuta(req, res);
    if (!m) return;
    const bets = st.bets
      .filter((b) => b.legs.some((l) => l.marketId === m.id))
      .sort((a, b) => b.ts - a.ts)
      .map((b) => {
        const leg = b.legs.find((l) => l.marketId === m.id);
        return {
          id: b.id, usuario: b.name, ts: b.ts, stake: b.stake, opcion: leg.label, cuotaOpcion: leg.odds,
          tipo: b.legs.length > 1 ? 'combinada' : 'simple', cuotaTotal: b.totalOdds,
          premioPosible: b.potential, estado: b.estado, premio: b.premio || 0
        };
      });
    res.json({ ok: true, bets, stats: statsMercado(m) });
  });

  adm.post('/users/:userId/adjust', (req, res) => {
    const id = String(req.params.userId || '').trim().toLowerCase();
    const bal = st.balances[id];
    if (!bal) return res.status(404).json({ error: 'Esa persona no tiene saldo TKT365.' });
    const cantidad = Number(req.body?.cantidad);
    if (!Number.isInteger(cantidad) || cantidad === 0 || Math.abs(cantidad) > 1_000_000) {
      return res.status(400).json({ error: 'La cantidad tiene que ser un número entero distinto de 0.' });
    }
    if (bal.balance + cantidad < 0) return res.status(400).json({ error: 'El saldo no puede quedar por debajo de 0.' });
    const antes = bal.balance;
    bal.balance += cantidad;
    movimiento(id, 'ajuste', cantidad, antes, bal.balance, { admin: adminNombre(), motivo: clean(req.body?.motivo, 120) || 'Sin motivo' });
    save();
    res.json({ ok: true, user: { id, name: bal.name, balance: bal.balance } });
  });

  // El admin añade a alguien que solo apuesta
  adm.post('/users', (req, res) => {
    const v = nombreNuevoValido(req.body?.name);
    if (v.error) return res.status(400).json({ error: v.error });
    crearExtra(v.id, v.name);
    save();
    res.json({ ok: true, user: { id: v.id, name: v.name } });
  });

  // Quitar a alguien que solo apuesta (solo si nunca ha apostado)
  adm.post('/users/:userId/remove', (req, res) => {
    const id = String(req.params.userId || '').trim().toLowerCase();
    if (!st.extras[id]) return res.status(404).json({ error: 'Solo se pueden quitar personas añadidas solo para apostar.' });
    if (trakeUsuarios(true).has(id)) return res.status(409).json({ error: 'Esa persona ya está en el Traketímetro.' });
    if (st.bets.some((b) => b.userId === id)) return res.status(409).json({ error: 'Ya ha apostado: no se puede quitar (puedes liberar su nombre o ajustar su saldo).' });
    delete st.extras[id];
    delete st.claims[id];
    delete st.balances[id];
    save();
    res.json({ ok: true });
  });

  // Si alguien eligió el nombre equivocado: se libera y puede volver a elegir
  adm.post('/users/:userId/release', (req, res) => {
    const id = String(req.params.userId || '').trim().toLowerCase();
    if (!st.claims[id]) return res.status(404).json({ error: 'Ese nombre no está elegido por nadie.' });
    delete st.claims[id];
    movimiento(id, 'nombre', 0, st.balances[id]?.balance ?? 0, st.balances[id]?.balance ?? 0, { admin: adminNombre(), motivo: 'Nombre liberado por el admin' });
    save();
    res.json({ ok: true });
  });

  // Dar una apuesta por ganada o perdida a mano (para mercados manuales).
  // También sirve para corregir un error: pasar de ganada a perdida (o al revés)
  // ajusta el saldo con la diferencia.
  adm.post('/bets/:id/settle', (req, res) => {
    const b = st.bets.find((x) => x.id === String(req.params.id || ''));
    if (!b) return res.status(404).json({ error: 'Esa apuesta no existe.' });
    const r = String(req.body?.resultado || '');
    if (r !== 'ganada' && r !== 'perdida') return res.status(400).json({ error: 'Resultado no válido.' });
    if (b.estado === 'cancelada') return res.status(409).json({ error: 'Esa apuesta está anulada y devuelta.' });
    if (b.estado === r) return res.status(409).json({ error: `Esa apuesta ya está ${r}.` });
    const bal = st.balances[b.userId];
    if (!bal) return res.status(404).json({ error: 'Esa persona no tiene saldo TKT365.' });
    const antesPremio = b.estado === 'ganada' ? (b.premio || 0) : 0;
    const nuevoPremio = r === 'ganada' ? b.potential : 0;
    const delta = nuevoPremio - antesPremio;
    if (bal.balance + delta < 0) return res.status(400).json({ error: 'No se puede: el saldo de esa persona quedaría por debajo de 0.' });
    const estabaPendiente = b.estado === 'pendiente';
    b.estado = r;
    b.premio = nuevoPremio;
    b.cuotaFinal = r === 'ganada' ? b.totalOdds : 0;
    b.liquidada = nowMs();
    b.manual = true;
    for (const l of b.legs) {
      if (r === 'ganada') l.resultado = 'ganada';
      else if (l.resultado !== 'perdida') l.resultado = 'perdida'; // en una perdida, se marcan como falladas las no resueltas
    }
    if (delta !== 0) {
      const antes = bal.balance;
      bal.balance += delta;
      movimiento(b.userId, delta > 0 ? (estabaPendiente ? 'premio' : 'ajuste') : 'ajuste', delta, antes, bal.balance, {
        betId: b.id, admin: adminNombre(),
        motivo: estabaPendiente ? 'Apuesta ganada (marcada por el admin)' : `Apuesta corregida a ${r} por el admin`
      });
    }
    save();
    res.json({ ok: true, balance: bal.balance });
  });

  // Anular una apuesta pendiente y devolver los TKT apostados
  adm.post('/bets/:id/void', (req, res) => {
    const b = st.bets.find((x) => x.id === String(req.params.id || ''));
    if (!b) return res.status(404).json({ error: 'Esa apuesta no existe.' });
    if (b.estado !== 'pendiente') return res.status(409).json({ error: 'Solo se pueden anular apuestas pendientes. Para las ya resueltas, ajusta el saldo a mano.' });
    b.estado = 'cancelada';
    b.premio = b.stake;
    b.cuotaFinal = 1;
    b.liquidada = nowMs();
    for (const l of b.legs) if (l.resultado === 'pendiente') l.resultado = 'anulada';
    const bal = st.balances[b.userId];
    if (bal) {
      const antes = bal.balance;
      bal.balance += b.stake;
      movimiento(b.userId, 'reembolso', b.stake, antes, bal.balance, { betId: b.id, admin: adminNombre(), motivo: clean(req.body?.motivo, 120) || 'Apuesta anulada por el admin' });
    }
    save();
    res.json({ ok: true });
  });

  app.use('/api/tkt365/admin', express.json({ limit: '200kb' }), adm);
  app.use('/api/tkt365', express.json({ limit: '50kb' }), api);

  // ---------- API interna para minijuegos (higherlower.js) ----------
  // Los juegos NO tienen usuarios propios: usan la misma identidad que TKT365
  // (token de dispositivo -> nombre del Traketímetro) y cobran/pagan en TKT.
  const juegos = {
    listo,
    duenoDe: (token) => duenoDe(token),
    nombreDe: (id) => trakeUsuarios().get(id) || st.balances[id]?.name || null,
    usuarios: () => [...trakeUsuarios()]
      .map(([id, name]) => ({ id, name, taken: Boolean(st.claims[id]), soloApuestas: !trakeUsuarios(true).has(id) }))
      .sort((a, b) => a.name.localeCompare(b.name, 'es')),
    saldo: (id) => (st.balances[id] ? st.balances[id].balance : null),
    // Suma TKT al saldo (queda en los movimientos como tipo "juego"). Devuelve el saldo nuevo o null.
    acreditar(id, cantidad, motivo) {
      const n = Math.floor(Number(cantidad));
      const bal = st.balances[id];
      if (!bal || !Number.isFinite(n) || n <= 0) return null;
      const antes = bal.balance;
      bal.balance += n;
      movimiento(id, 'juego', n, antes, bal.balance, { motivo: clean(motivo, 120) || 'Minijuego' });
      save();
      return bal.balance;
    }
  };

  return { tick, recalcularCuotas: programarRecalculo, juegos };
}
