import 'dotenv/config';
import express from 'express';
import Stripe from 'stripe';
import path from 'path';
import fs from 'fs';
import crypto from 'crypto';
import multer from 'multer';
import { v2 as cloudinary } from 'cloudinary';
import sharp from 'sharp';
import { fileURLToPath } from 'url';
import { registerTkt365 } from './tkt365.js';
import { registerHigherLower } from './higherlower.js';

const app = express();

// Fijamos la versión de la API de Stripe explícitamente. Sin esto, Stripe usa
// la versión "por defecto" de la cuenta, que puede ser antigua y no soportar
// billing_cycle_anchor_config en Checkout Sessions (se añadió el 24/06/2026).
// Si no se fija, Stripe IGNORA ese parámetro sin avisar y ancla la
// suscripción a "hoy + 1 mes" en vez de al día 1, que es justo el bug que
// estabas viendo (factura el 22 oct en vez del 1 oct).
const stripe = new Stripe(process.env.STRIPE_SECRET_KEY, {
  apiVersion: '2026-06-24.dahlia'
});

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

app.set('trust proxy', 1);

// =========================
// AUTENTICACIÓN ADMIN
// =========================

function adminAuth(req, res, next) {
  const h = req.headers.authorization || '';

  if (!h.startsWith('Basic ')) {
    return res
      .set('WWW-Authenticate', 'Basic realm="Admin"')
      .status(401)
      .send('Autenticación requerida');
  }

  const raw = Buffer.from(h.slice(6), 'base64').toString();
  const i = raw.indexOf(':');

  const u = i === -1 ? raw : raw.slice(0, i);
  const p = i === -1 ? '' : raw.slice(i + 1);

  // Comparación en tiempo constante (evita adivinar la clave midiendo tiempos)
  const igual = (a, b) => {
    if (typeof b !== 'string' || !b.length) return false;
    const ha = crypto.createHash('sha256').update(String(a)).digest();
    const hb = crypto.createHash('sha256').update(b).digest();
    return crypto.timingSafeEqual(ha, hb);
  };

  if (!igual(u, process.env.ADMIN_USER) || !igual(p, process.env.ADMIN_PASSWORD)) {
    return res
      .set('WWW-Authenticate', 'Basic realm="Admin"')
      .status(401)
      .send('Credenciales incorrectas');
  }

  next();
}

// =========================
// STRIPE WEBHOOK
// =========================

app.post(
  '/api/webhook',
  express.raw({ type: 'application/json' }),
  async (req, res) => {
    try {
      const event = stripe.webhooks.constructEvent(
        req.body,
        req.headers['stripe-signature'],
        process.env.STRIPE_WEBHOOK_SECRET
      );

      console.log('Stripe:', event.type);

      res.json({ received: true });
    } catch (e) {
      console.error('Webhook Error:', e.message);
      res.status(400).send(`Webhook Error: ${e.message}`);
    }
  }
);

// =========================
// WEBHOOK CLOUDINARY (borrado al instante)
// =========================
// Si borras una foto directamente en el panel de Cloudinary, Cloudinary avisa
// aquí al instante y la quitamos de la web sin esperar al refresco automático.
// Hay que activar esta URL en Cloudinary: Console -> Settings -> Webhook
// Notifications -> Add notification URL:
//   https://traketeros.onrender.com/api/cloudinary-webhook

app.post(
  '/api/cloudinary-webhook',
  express.raw({ type: 'application/json' }),
  (req, res) => {
    try {
      const timestamp = req.headers['x-cld-timestamp'];
      const signature = req.headers['x-cld-signature'];
      const rawBody = req.body.toString('utf8');

      const valid = cloudinary.utils.verifyNotificationSignature(
        rawBody,
        Number(timestamp),
        signature
      );

      if (!valid) {
        return res.status(401).json({ error: 'Firma no válida' });
      }

      const body = JSON.parse(rawBody);

      if (body.notification_type === 'delete') {
        const borrados = new Set(
          (body.resources || []).map((r) => r.public_id)
        );
        photoIndex = photoIndex.filter((p) => !borrados.has(p.publicId));
        pastIndex = pastIndex.filter((p) => !borrados.has(p.publicId));
        console.log(`Webhook Cloudinary: ${borrados.size} foto(s) quitada(s) al instante`);
        broadcastPhotosChanged();
      }

      // Cuando cambias el nombre (context) de una foto desde el panel de Cloudinary,
      // esto actualiza la web al instante sin esperar al refresco automático.
      if (body.notification_type === 'resource_context_changed') {
        let changed = false;
        for (const [publicId, info] of Object.entries(body.resources || {})) {
          if (!publicId.startsWith(PREFIX)) continue;
          const id = publicId.slice(PREFIX.length);
          const p = photoIndex.find((x) => x.id === id);
          if (!p) continue;

          const added_ = info.added || [];
          const updated_ = info.updated || [];
          const removed_ = info.removed || [];

          const nameEntry = [...added_, ...updated_].find((e) => e.name === 'name');
          if (nameEntry) {
            p.name = String(nameEntry.value || '').slice(0, 40);
            changed = true;
          } else if (removed_.some((e) => e.name === 'name')) {
            p.name = '';
            changed = true;
          }

          const descEntry = [...added_, ...updated_].find((e) => e.name === 'desc');
          if (descEntry) {
            p.desc = String(descEntry.value || '').slice(0, 140);
            changed = true;
          } else if (removed_.some((e) => e.name === 'desc')) {
            p.desc = '';
            changed = true;
          }
        }
        if (changed) {
          console.log('Webhook Cloudinary: nombre de foto actualizado al instante');
          broadcastPhotosChanged();
        }
      }

      res.json({ ok: true });
    } catch (e) {
      console.error('Error en webhook de Cloudinary:', e.message || e);
      res.status(400).json({ error: 'Error procesando notificación' });
    }
  }
);

// JSON
app.use(express.json({ limit: '1mb' }));

// Endpoint ligero para keep-alive / monitorización
app.get('/health', (req, res) => {
  res.set('Cache-Control', 'no-store');
  res.json({ ok: true, uptime: Math.round(process.uptime()) });
});

// =========================
// PANEL DE CONTROL (solo admin)
// =========================
// Reúne todas las subwebs de admin en una sola página. El HTML vive en /private
// (fuera de public/), así que NO se sirve como archivo normal: solo sale por esta
// ruta y solo después de pedir usuario y clave. No está enlazado desde ninguna
// página ni listado en robots.txt (para no delatar la ruta); además va con noindex.
app.get(['/panel', '/panel/'], adminAuth, (req, res) => {
  res.set({
    'Cache-Control': 'no-store',
    'X-Robots-Tag': 'noindex, nofollow, noarchive'
  });
  res.sendFile(path.join(__dirname, 'private', 'panel.html'));
});

// Archivos de la web
// Splash con el logo de la peña: se añade solo a todas las páginas (menos las de admin),
// sin tener que editar cada HTML. Es un <script> que se coloca justo al abrir <head>.
const PWA_TAGS = '<link rel="manifest" href="/manifest.webmanifest">'
  + '<meta name="mobile-web-app-capable" content="yes">'
  + '<meta name="apple-mobile-web-app-capable" content="yes">'
  + '<link rel="apple-touch-icon" href="/assets/icon-192.png">'
  + '<script>if("serviceWorker"in navigator)addEventListener("load",function(){navigator.serviceWorker.register("/sw.js").catch(function(){})})</script>';
const SPLASH_TAG = '<script src="/splash.js?v=1"></script>' + PWA_TAGS;
app.use((req, res, next) => {
  if (req.method !== 'GET') return next();
  let p;
  try { p = decodeURIComponent(req.path); } catch { return next(); }
  if (p.endsWith('/')) p += 'index.html';
  if (!p.endsWith('.html') || /^\/admin/i.test(p)) return next();
  const base = path.join(__dirname, 'public');
  const file = path.join(base, p);
  if (!file.startsWith(base + path.sep)) return next();
  fs.readFile(file, 'utf8', (err, html) => {
    if (err) return next();
    if (!html.includes('/splash.js')) html = html.replace(/<head[^>]*>/i, (m) => m + SPLASH_TAG);
    res.set({ 'Content-Type': 'text/html; charset=utf-8', 'Cache-Control': 'no-cache' });
    res.send(html);
  });
});

app.use(express.static(path.join(__dirname, 'public')));

// =========================
// CREAR CHECKOUT STRIPE
// =========================

app.post('/api/create-checkout-session', async (req, res) => {
  try {
    if (!process.env.STRIPE_SECRET_KEY) {
      return res.status(500).json({
        error: 'Falta STRIPE_SECRET_KEY.'
      });
    }

    if (!process.env.STRIPE_PRICE_ID) {
      return res.status(500).json({
        error: 'Falta STRIPE_PRICE_ID.'
      });
    }

    // Detectar automáticamente la URL de la web
    const protocol =
      req.headers['x-forwarded-proto'] ||
      req.protocol ||
      'http';

    const host =
      req.headers['x-forwarded-host'] ||
      req.get('host');

    const domain = `${protocol}://${host}`;

    // Cogemos el precio de la cuota mensual para poder cobrar hoy exactamente
    // esa misma cantidad como "cuota de entrada" (pago único), además de
    // arrancar la suscripción.
    const price = await stripe.prices.retrieve(process.env.STRIPE_PRICE_ID);

    // Día 1 del mes que viene, a las 00:00 UTC: ahí es cuando arranca de
    // verdad el cobro mensual recurrente.
    //
    // NOTA: antes esto se hacía con billing_cycle_anchor_config +
    // proration_behavior: 'none', pero Stripe NO permite combinar
    // proration_behavior: 'none' con un precio de pago único (price_data)
    // en la misma Checkout Session — de ahí el error "You cannot set
    // proration_behavior to none in a Checkout Session with one-time
    // prices". Por eso ahora se usa un periodo de prueba (trial_end) que
    // termina justo ese día: durante ese periodo no se genera ningún cargo
    // de la suscripción (así no se cobra dos veces por los días entre hoy
    // y el día 1), y sí es compatible con la cuota de entrada de pago único.
    const ahora = new Date();
    const dia1ProximoMes = new Date(Date.UTC(
      ahora.getUTCFullYear(),
      ahora.getUTCMonth() + 1,
      1, 0, 0, 0
    ));
    const trialEnd = Math.floor(dia1ProximoMes.getTime() / 1000);

    console.log('Dominio:', domain);
    console.log('Price ID:', process.env.STRIPE_PRICE_ID);

    const session = await stripe.checkout.sessions.create({
      mode: 'subscription',

      line_items: [
        {
          // Cuota de entrada: se cobra HOY, una sola vez, por el mismo
          // importe que la mensualidad.
          price_data: {
            currency: price.currency,
            product: price.product,
            unit_amount: price.unit_amount
          },
          quantity: 1
        },
        {
          // La suscripción recurrente. No cobra nada hasta que acabe el
          // periodo de prueba (trialEnd = día 1 del mes que viene), porque
          // ese primer tramo ya se cobra arriba como cuota de entrada.
          price: process.env.STRIPE_PRICE_ID,
          quantity: 1
        }
      ],

      payment_method_types: ['card'],

      billing_address_collection: 'auto',

      allow_promotion_codes: true,

      // La suscripción arranca "en pausa" (trial) hasta el día 1 del mes
      // que viene. Ese día Stripe cobra ya la cuota completa y a partir de
      // ahí sigue cobrando cada día 1. El cliente sí paga HOY la cuota de
      // entrada (arriba), así que no se queda ningún día sin cobrar.
      subscription_data: {
        trial_end: trialEnd
      },

      success_url:
        `${domain}/success.html?session_id={CHECKOUT_SESSION_ID}`,

      cancel_url:
        `${domain}/?cancelled=1`
    });

    res.json({
      url: session.url
    });

  } catch (e) {
    console.error('Error creando Checkout:', e);

    res.status(500).json({
      error: e.message || 'No se pudo iniciar el pago'
    });
  }
});

// =========================
// CONSULTAR SUSCRIPCIÓN
// =========================

app.get('/api/subscription/:id', async (req, res) => {
  try {
    const s = await stripe.checkout.sessions.retrieve(
      req.params.id,
      {
        expand: ['subscription']
      }
    );

    res.json({
      status: s.status,
      subscription_status:
        s.subscription?.status || null,
      email:
        s.customer_details?.email || null
    });

  } catch (e) {
    console.error(e);

    res.status(404).json({
      error: 'No encontrada'
    });
  }
});

// =========================
// ADMIN - OVERVIEW
// =========================

app.get('/api/admin/overview', adminAuth, async (req, res) => {
  try {
    const [
      customers,
      subs,
      invoices,
      payments
    ] = await Promise.all([
      stripe.customers.list({
        limit: 100
      }),

      stripe.subscriptions.list({
        limit: 100,
        status: 'all',
        expand: [
          'data.customer',
          'data.items.data.price'
        ]
      }),

      stripe.invoices.list({
        limit: 100,
        expand: ['data.customer']
      }),

      stripe.paymentIntents.list({
        limit: 100
      })
    ]);

    const active = subs.data.filter(
      s =>
        s.status === 'active' ||
        s.status === 'trialing'
    );

    const revenue = invoices.data
      .filter(i => i.status === 'paid')
      .reduce(
        (a, i) => a + (i.amount_paid || 0),
        0
      );

    const members = customers.data.map(c => {
      const ss = subs.data
        .filter(
          s =>
            (
              typeof s.customer === 'string'
                ? s.customer
                : s.customer?.id
            ) === c.id
        )
        .sort(
          (a, b) => b.created - a.created
        );

      const s = ss[0];

      return {
        name: c.name || '—',
        email: c.email || '—',

        subscription: s
          ? {
              id: s.id,
              status: s.status,
              cancel: s.cancel_at_period_end,

              amount:
                s.items.data[0]?.price?.unit_amount ||
                0,

              interval:
                s.items.data[0]?.price?.recurring?.interval ||
                'month',

              next: s.items.data[0]?.current_period_end ?? s.current_period_end
            }
          : null
      };
    });

    res.json({
      stats: {
        customers: customers.data.length,
        active: active.length,
        revenue: revenue / 100,
        payments:
          payments.data.filter(
            p => p.status === 'succeeded'
          ).length
      },

      members,

      invoices: invoices.data.map(i => ({
        number: i.number || i.id,
        email: i.customer?.email || '—',
        status: i.status,
        amount: i.amount_paid / 100,
        date: i.created
      }))
    });

  } catch (e) {
    console.error(e);

    res.status(500).json({
      error: e.message
    });
  }
});

// =========================
// ADMIN - CANCELAR
// =========================

app.post('/api/admin/cancel', adminAuth, async (req, res) => {
  try {
    const s = await stripe.subscriptions.update(
      req.body.subscriptionId,
      {
        cancel_at_period_end: true
      }
    );

    res.json({
      ok: true,
      cancel: s.cancel_at_period_end
    });

  } catch (e) {
    res.status(500).json({
      error: e.message
    });
  }
});

// =========================
// ADMIN - REACTIVAR
// =========================

app.post(
  '/api/admin/reactivate',
  adminAuth,
  async (req, res) => {
    try {
      const s = await stripe.subscriptions.update(
        req.body.subscriptionId,
        {
          cancel_at_period_end: false
        }
      );

      res.json({
        ok: true,
        cancel: s.cancel_at_period_end
      });

    } catch (e) {
      res.status(500).json({
        error: e.message
      });
    }
  }
);

// =========================
// FOTOS DE LA PEÑA (se guardan en Cloudinary)
// =========================
// Render borra los archivos del servidor al reiniciar, así que las fotos viven en
// Cloudinary (gratis). Solo hace falta la variable CLOUDINARY_URL (mira el README).
// Aquí solo se guarda una foto por cada subida: las miniaturas las genera Cloudinary.

const CLOUDINARY_OK = Boolean(process.env.CLOUDINARY_URL);
if (CLOUDINARY_OK) cloudinary.config({ secure: true });
else console.warn('Falta CLOUDINARY_URL: el álbum de fotos está desactivado.');

const TAG = 'traketeros';        // etiqueta con la que se listan las fotos de la peña
const PREFIX = 'traketeros_';    // prefijo del nombre de cada foto en Cloudinary
const MAX_PHOTOS = Number(process.env.MAX_PHOTOS) || 1500;
const UPLOAD_CODE = (process.env.UPLOAD_CODE || '').trim(); // opcional: código para poder subir
const ID_RE = /^[a-z0-9]{8,40}$/;
const REFRESH_MS = 2 * 60_000;   // cada cuánto se vuelve a leer la lista desde Cloudinary

let photoIndex = [];             // más nuevas primero
let lastRefresh = 0;
let refreshing = null;

// Cloudinary usa "|" y "=" para separar los campos del context, así que se
// quitan de cualquier texto que vaya a guardarse ahí (nombre o descripción).
function sanitizeText(str, maxLen) {
  return String(str || '').replace(/[|=\\]/g, '').replace(/\s+/g, ' ').trim().slice(0, maxLen);
}

function toPhoto(r) {
  if (!r.public_id?.startsWith(PREFIX)) return null;
  const id = r.public_id.slice(PREFIX.length);
  if (!ID_RE.test(id)) return null;
  const name = r.context?.custom?.name ?? r.context?.name ?? '';
  const desc = r.context?.custom?.desc ?? r.context?.desc ?? '';
  return {
    id,
    publicId: r.public_id,
    version: r.version,
    name: String(name),
    desc: String(desc),
    date: Date.parse(r.created_at) || Date.now()
  };
}

// Lee la lista de fotos de Cloudinary (se guarda en memoria para no gastar llamadas a su API)
function refreshPhotos() {
  if (refreshing) return refreshing;
  refreshing = (async () => {
    const items = [];
    let cursor;
    do {
      const opts = { max_results: 500, context: true };
      if (cursor) opts.next_cursor = cursor;
      const r = await cloudinary.api.resources_by_tag(TAG, opts);
      for (const x of r.resources || []) {
        const p = toPhoto(x);
        if (p) items.push(p);
      }
      cursor = r.next_cursor;
    } while (cursor && items.length < MAX_PHOTOS);

    items.sort((a, b) => b.date - a.date);
    photoIndex = items;
    lastRefresh = Date.now();
    console.log(`Fotos en Cloudinary: ${items.length}`);
  })().finally(() => { refreshing = null; });
  return refreshing;
}

if (CLOUDINARY_OK) {
  refreshPhotos().catch((e) => console.error('No se pudo leer Cloudinary:', e.message || e));

  // Se vuelve a leer Cloudinary cada REFRESH_MS aunque nadie visite fotos.html.
  // Así, si borras una foto directamente desde Cloudinary, desaparece sola de la
  // web como mucho a los pocos minutos, sin depender de que alguien entre a la página.
  setInterval(() => {
    const antes = photoIndex.map((p) => p.publicId).join(',');
    refreshPhotos()
      .then(() => {
        const despues = photoIndex.map((p) => p.publicId).join(',');
        if (antes !== despues) broadcastPhotosChanged();
      })
      .catch((e) => console.error('No se pudo refrescar Cloudinary:', e.message || e));
  }, REFRESH_MS).unref();
}

// =========================
// TIEMPO REAL (avisa a la web cuando se sube o se borra una foto)
// =========================
// Cada navegador abierto en fotos.html mantiene una conexión escuchando. En
// cuanto algo cambia, se le avisa por aquí y la página recarga la lista sola,
// sin que nadie tenga que refrescar a mano.

const sseClients = new Set();

function broadcastPhotosChanged() {
  const msg = `data: ${JSON.stringify({ type: 'photos-changed' })}\n\n`;
  for (const res of sseClients) {
    try { res.write(msg); } catch { /* cliente ya desconectado */ }
  }
}

app.get('/api/photos/stream', photosOnly, (req, res) => {
  res.set({
    'Content-Type': 'text/event-stream',
    'Cache-Control': 'no-cache, no-transform',
    Connection: 'keep-alive'
  });
  res.flushHeaders?.();
  res.write(':ok\n\n');

  sseClients.add(res);
  req.on('close', () => sseClients.delete(res));
});

// Mantiene la conexión abierta (algunos proxies la cierran si está muchos segundos en silencio)
setInterval(() => {
  for (const res of sseClients) {
    try { res.write(':ping\n\n'); } catch { /* cliente ya desconectado */ }
  }
}, 25_000).unref();

// Direcciones que ve la web: miniatura cuadrada, foto grande y enlace de descarga
function publicPhoto(p) {
  const base = { secure: true, version: p.version };
  return {
    id: p.id,
    name: p.name,
    desc: p.desc,
    date: p.date,
    thumb: cloudinary.url(p.publicId, {
      ...base,
      transformation: [
        { width: 480, height: 480, crop: 'fill', gravity: 'auto' },
        { quality: 'auto', fetch_format: 'auto' }
      ]
    }),
    url: cloudinary.url(p.publicId, { ...base, format: 'jpg' }),
    download: cloudinary.url(p.publicId, { ...base, format: 'jpg', flags: 'attachment' })
  };
}

function photosOnly(req, res, next) {
  if (!CLOUDINARY_OK) {
    return res.status(503).json({ error: 'El álbum todavía no está configurado.' });
  }
  next();
}

// Límite sencillo por IP: 20 subidas por hora
const uploadHits = new Map();
setInterval(() => {
  const limit = Date.now() - 3600_000;
  for (const [ip, times] of uploadHits) {
    const recent = times.filter((t) => t > limit);
    if (recent.length) uploadHits.set(ip, recent);
    else uploadHits.delete(ip);
  }
}, 10 * 60_000).unref();

function uploadLimiter(req, res, next) {
  const now = Date.now();
  const recent = (uploadHits.get(req.ip) || []).filter((t) => now - t < 3600_000);
  if (recent.length >= 20) {
    return res.status(429).json({ error: 'Has subido muchas fotos seguidas. Prueba otra vez dentro de un rato.' });
  }
  recent.push(now);
  uploadHits.set(req.ip, recent);
  next();
}

const upload = multer({
  storage: multer.memoryStorage(),
  limits: { fileSize: 15 * 1024 * 1024, files: 10, fields: 5, fieldSize: 200 },
  fileFilter: (req, file, cb) => cb(null, /^image\/(jpeg|png|webp)$/i.test(file.mimetype))
});

function sameSecret(a, b) {
  const x = Buffer.from(String(a));
  const y = Buffer.from(String(b));
  return x.length === y.length && crypto.timingSafeEqual(x, y);
}

function uploadErrorMessage(err) {
  if (err.code === 'LIMIT_FILE_SIZE') return 'Una de las fotos pesa demasiado (máximo 15 MB).';
  if (err.code === 'LIMIT_FILE_COUNT' || err.code === 'LIMIT_UNEXPECTED_FILE') return 'Máximo 10 fotos cada vez.';
  return 'No se han podido subir las fotos.';
}

function sendToCloudinary(buffer, options) {
  return new Promise((resolve, reject) => {
    cloudinary.uploader
      .upload_stream(options, (err, result) => (err ? reject(err) : resolve(result)))
      .end(buffer);
  });
}

// Lista de fotos (pública)
app.get('/api/photos', photosOnly, async (req, res) => {
  try {
    if (Date.now() - lastRefresh > REFRESH_MS) await refreshPhotos();
  } catch (e) {
    console.error('Error leyendo Cloudinary:', e.message || e);
    if (!lastRefresh) {
      return res.status(502).json({ error: 'No se han podido cargar las fotos. Inténtalo en un rato.' });
    }
  }
  res.set('Cache-Control', 'no-store');
  res.json({
    codeRequired: Boolean(UPLOAD_CODE),
    photos: photoIndex.map(publicPhoto)
  });
});

// Subir fotos (público, con código opcional)
app.post('/api/photos', photosOnly, uploadLimiter, (req, res) => {
  upload.array('photos', 10)(req, res, async (err) => {
    if (err) return res.status(400).json({ error: uploadErrorMessage(err) });

    try {
      if (UPLOAD_CODE && !sameSecret(String(req.body?.code || '').trim(), UPLOAD_CODE)) {
        return res.status(403).json({ error: 'El código de la peña no es correcto.' });
      }

      const files = req.files || [];
      if (!files.length) {
        return res.status(400).json({ error: 'No he recibido ninguna foto válida (JPG, PNG o WEBP).' });
      }
      if (photoIndex.length + files.length > MAX_PHOTOS) {
        return res.status(409).json({ error: 'El álbum está lleno.' });
      }

      const name = sanitizeText(req.body?.name, 40);
      const desc = sanitizeText(req.body?.desc, 140); // pie de foto: una línea o dos
      let added = 0;
      let unreadable = 0;
      let saveFailed = 0;

      for (const f of files) {
        let jpeg;
        try {
          // rotate() aplica la orientación del móvil. Al no llamar a withMetadata(),
          // se borran los datos EXIF (incluida la ubicación GPS de la foto).
          // flatten() pinta de blanco los PNG con fondo transparente.
          jpeg = await sharp(f.buffer, { failOn: 'error' })
            .rotate()
            .flatten({ background: '#ffffff' })
            .resize({ width: 1800, height: 1800, fit: 'inside', withoutEnlargement: true })
            .jpeg({ quality: 82 })
            .toBuffer();
        } catch (e) {
          unreadable++;
          console.error('Foto no válida:', e.message);
          continue;
        }

        try {
          const id = Date.now().toString(36) + crypto.randomBytes(5).toString('hex');
          const options = { public_id: PREFIX + id, tags: [TAG], resource_type: 'image', overwrite: false };
          const context = {};
          if (name) context.name = name;
          if (desc) context.desc = desc;
          if (Object.keys(context).length) options.context = context;

          const r = await sendToCloudinary(jpeg, options);
          photoIndex.unshift({
            id,
            publicId: r.public_id,
            version: r.version,
            name,
            desc,
            date: Date.parse(r.created_at) || Date.now()
          });
          added++;
        } catch (e) {
          saveFailed++;
          console.error('Cloudinary no ha guardado la foto:', e.message || e);
        }
      }

      if (!added) {
        return saveFailed
          ? res.status(502).json({ error: 'No se han podido guardar las fotos. Inténtalo otra vez.' })
          : res.status(400).json({ error: 'No se ha podido leer ninguna de las fotos. Prueba con JPG o PNG.' });
      }
      broadcastPhotosChanged();
      res.json({ ok: true, added, failed: unreadable + saveFailed });
    } catch (e) {
      console.error('Error subiendo fotos:', e);
      res.status(500).json({ error: 'Ha habido un error en el servidor. Inténtalo otra vez.' });
    }
  });
});

// Cambiar (o quitar) el nombre y/o la descripción de una foto ya subida (solo admin)
app.patch('/api/admin/photos/:id/name', adminAuth, photosOnly, async (req, res) => {
  const { id } = req.params;
  if (!ID_RE.test(id)) return res.status(400).json({ error: 'Id no válido' });

  const p = photoIndex.find((x) => x.id === id);

  // Si el body no trae el campo, se conserva el valor que ya había (para no
  // borrar la descripción al cambiar solo el nombre, o al revés).
  const name = req.body?.name !== undefined ? sanitizeText(req.body.name, 40) : (p?.name || '');
  const desc = req.body?.desc !== undefined ? sanitizeText(req.body.desc, 140) : (p?.desc || '');

  try {
    await cloudinary.api.update(PREFIX + id, {
      resource_type: 'image',
      type: 'upload',
      // La API de administración de Cloudinary espera el contexto como texto
      // "clave=valor|clave=valor", no como objeto (ya vienen sin '|' ni '=').
      context: `name=${name}|desc=${desc}`
    });
    if (p) { p.name = name; p.desc = desc; }
    broadcastPhotosChanged();
    res.json({ ok: true, name, desc });
  } catch (e) {
    console.error('No se pudo cambiar el nombre/descripción:', e.message || e);
    res.status(500).json({ error: 'No se pudo cambiar el nombre o la descripción.' });
  }
});

// Borrar una foto (solo admin)
app.delete('/api/admin/photos/:id', adminAuth, photosOnly, async (req, res) => {
  const { id } = req.params;
  if (!ID_RE.test(id)) return res.status(400).json({ error: 'Id no válido' });

  try {
    await cloudinary.uploader.destroy(PREFIX + id, { resource_type: 'image', invalidate: true });
    photoIndex = photoIndex.filter((p) => p.id !== id);
    broadcastPhotosChanged();
    res.json({ ok: true });
  } catch (e) {
    console.error(e);
    res.status(500).json({ error: 'No se pudo borrar la foto.' });
  }
});

// =========================
// FOTOS DEL PASADO (San Miguel, San Roque, Pilares... de años anteriores)
// =========================
// Van aparte del álbum normal: etiqueta propia en Cloudinary ('traketeros_pasado')
// y carpeta propia ('fotos_pasado/'), así que NO se mezclan con las fotos que ya
// hay ni las tocan. Cualquiera puede verlas; solo el admin puede subirlas o borrarlas.
// La fiesta, el año y la descripción se guardan en el "context" de cada foto en
// Cloudinary, que es lo que sobrevive a los redeploys de Render.

const PAST_TAG = 'traketeros_pasado';
const PAST_FOLDER = 'fotos_pasado';
const PAST_PREFIX = PAST_FOLDER + '/';
const PAST_MIN_YEAR = 1950;
// Código que tiene que poner la gente para añadir fotos del pasado (el admin no lo necesita).
// Se puede cambiar con la variable PAST_UPLOAD_CODE en Render.
const PAST_UPLOAD_CODE = (process.env.PAST_UPLOAD_CODE || 'gorilaso').trim();

// Las fotos del pasado se suben en tandas más grandes que el álbum normal (hasta 20 por petición).
// Las de más de 10 MB se rechazan para no llenar la memoria del servidor.
const PAST_MAX_PER_REQUEST = 20;
const pastUpload = multer({
  storage: multer.memoryStorage(),
  limits: { fileSize: 10 * 1024 * 1024, files: PAST_MAX_PER_REQUEST, fields: 5, fieldSize: 200 },
  fileFilter: (req, file, cb) => cb(null, /^image\/(jpeg|png|webp)$/i.test(file.mimetype))
});

function pastUploadErrorMessage(err) {
  if (err.code === 'LIMIT_FILE_SIZE') return 'Una de las fotos pesa demasiado (máximo 10 MB).';
  if (err.code === 'LIMIT_FILE_COUNT' || err.code === 'LIMIT_UNEXPECTED_FILE') return `Máximo ${PAST_MAX_PER_REQUEST} fotos cada vez.`;
  return 'No se han podido subir las fotos.';
}

let pastIndex = [];            // [{ id, publicId, version, fiesta, year, desc, date }]
let pastLastRefresh = 0;
let pastRefreshing = null;

function toPast(r) {
  if (!r.public_id?.startsWith(PAST_PREFIX)) return null;
  const id = r.public_id.slice(PAST_PREFIX.length);
  if (!ID_RE.test(id)) return null;
  const ctx = r.context?.custom ?? r.context ?? {};
  const year = Number(ctx.year);
  return {
    id,
    publicId: r.public_id,
    version: r.version,
    fiesta: String(ctx.fiesta || 'Otras fiestas'),
    year: Number.isInteger(year) ? year : 0,
    desc: String(ctx.desc || ''),
    date: Date.parse(r.created_at) || Date.now()
  };
}

function refreshPast() {
  if (pastRefreshing) return pastRefreshing;
  pastRefreshing = (async () => {
    const items = [];
    let cursor;
    do {
      const opts = { max_results: 500, context: true };
      if (cursor) opts.next_cursor = cursor;
      const r = await cloudinary.api.resources_by_tag(PAST_TAG, opts);
      for (const x of r.resources || []) {
        const p = toPast(x);
        if (p) items.push(p);
      }
      cursor = r.next_cursor;
    } while (cursor && items.length < MAX_PHOTOS);

    items.sort((a, b) => a.date - b.date);
    pastIndex = items;
    pastLastRefresh = Date.now();
    console.log(`Fotos del pasado en Cloudinary: ${items.length}`);
  })().finally(() => { pastRefreshing = null; });
  return pastRefreshing;
}

if (CLOUDINARY_OK) {
  refreshPast().catch((e) => console.error('No se pudieron leer las fotos del pasado:', e.message || e));
}

function publicPast(p) {
  const base = { secure: true, version: p.version };
  return {
    id: p.id,
    past: true,
    fiesta: p.fiesta,
    year: p.year,
    desc: p.desc,
    date: p.date,
    thumb: cloudinary.url(p.publicId, {
      ...base,
      transformation: [
        { width: 480, height: 480, crop: 'fill', gravity: 'auto' },
        { quality: 'auto', fetch_format: 'auto' }
      ]
    }),
    url: cloudinary.url(p.publicId, { ...base, format: 'jpg' }),
    download: cloudinary.url(p.publicId, { ...base, format: 'jpg', flags: 'attachment' })
  };
}

// Lista pública de las fotos del pasado
app.get('/api/photos/past', photosOnly, async (req, res) => {
  try {
    if (Date.now() - pastLastRefresh > REFRESH_MS) await refreshPast();
  } catch (e) {
    console.error('Error leyendo las fotos del pasado:', e.message || e);
    if (!pastLastRefresh) {
      return res.status(502).json({ error: 'No se han podido cargar las fotos del pasado. Inténtalo en un rato.' });
    }
  }
  res.set('Cache-Control', 'no-store');
  res.json({ photos: pastIndex.map(publicPast) });
});

// Sirve para que el navegador pida usuario y clave al abrir fotos.html?admin=1
app.get('/api/admin/ping', adminAuth, (req, res) => {
  res.set('Cache-Control', 'no-store');
  res.json({ ok: true });
});

// Subir fotos del pasado. Campos: fiesta, year, desc + photos (+ code si no es admin).
// Con requireCode = false (ruta del admin, ya autenticada) no se pide el código.
function pastUploadHandler(requireCode) {
  return (req, res) => {
  pastUpload.array('photos', PAST_MAX_PER_REQUEST)(req, res, async (err) => {
    if (err) return res.status(400).json({ error: pastUploadErrorMessage(err) });

    try {
      if (requireCode && !sameSecret(String(req.body?.code || '').trim(), PAST_UPLOAD_CODE)) {
        return res.status(403).json({ error: 'La contraseña no es correcta.' });
      }

      const files = req.files || [];
      if (!files.length) {
        return res.status(400).json({ error: 'No he recibido ninguna foto válida (JPG, PNG o WEBP).' });
      }

      const fiesta = sanitizeText(req.body?.fiesta, 30);
      const year = Number(req.body?.year);
      const maxYear = Number(trakeHoy().slice(0, 4));
      if (!fiesta) return res.status(400).json({ error: 'Elige la fiesta (San Miguel, San Roque, Pilares...).' });
      if (!Number.isInteger(year) || year < PAST_MIN_YEAR || year > maxYear) {
        return res.status(400).json({ error: `Pon un año válido (entre ${PAST_MIN_YEAR} y ${maxYear}).` });
      }
      if (pastIndex.length + files.length > MAX_PHOTOS) {
        return res.status(409).json({ error: 'Ya hay demasiadas fotos del pasado.' });
      }

      const desc = sanitizeText(req.body?.desc, 140);
      let added = 0;
      let unreadable = 0;
      let saveFailed = 0;

      for (const f of files) {
        let jpeg;
        try {
          // Igual que el álbum normal: se aplica la orientación y se borran los datos EXIF (GPS)
          jpeg = await sharp(f.buffer, { failOn: 'error' })
            .rotate()
            .flatten({ background: '#ffffff' })
            .resize({ width: 1800, height: 1800, fit: 'inside', withoutEnlargement: true })
            .jpeg({ quality: 82 })
            .toBuffer();
        } catch (e) {
          unreadable++;
          console.error('Foto del pasado no válida:', e.message);
          continue;
        }

        try {
          const id = Date.now().toString(36) + crypto.randomBytes(5).toString('hex');
          const context = { fiesta, year: String(year) };
          if (desc) context.desc = desc;
          const r = await sendToCloudinary(jpeg, {
            public_id: PAST_PREFIX + id,
            tags: [PAST_TAG],
            resource_type: 'image',
            overwrite: false,
            context
          });
          pastIndex.push({
            id,
            publicId: r.public_id,
            version: r.version,
            fiesta,
            year,
            desc,
            date: Date.parse(r.created_at) || Date.now()
          });
          added++;
        } catch (e) {
          saveFailed++;
          console.error('Cloudinary no ha guardado la foto del pasado:', e.message || e);
        }
      }

      if (!added) {
        return saveFailed
          ? res.status(502).json({ error: 'No se han podido guardar las fotos. Inténtalo otra vez.' })
          : res.status(400).json({ error: 'No se ha podido leer ninguna de las fotos. Prueba con JPG o PNG.' });
      }
      res.json({ ok: true, added, failed: unreadable + saveFailed });
    } catch (e) {
      console.error('Error subiendo fotos del pasado:', e);
      res.status(500).json({ error: 'Ha habido un error en el servidor. Inténtalo otra vez.' });
    }
  });
  };
}

// Público (con contraseña) y admin (sin contraseña)
app.post('/api/photos/past', photosOnly, uploadLimiter, pastUploadHandler(true));
app.post('/api/admin/photos/past', adminAuth, photosOnly, pastUploadHandler(false));

// Mover una foto del pasado a otra fiesta/año (SOLO admin). Body: { fiesta, year }
app.patch('/api/admin/photos/past/:id', adminAuth, photosOnly, async (req, res) => {
  const { id } = req.params;
  if (!ID_RE.test(id)) return res.status(400).json({ error: 'Id no válido' });

  const p = pastIndex.find((x) => x.id === id);
  if (!p) return res.status(404).json({ error: 'No encuentro esa foto.' });

  const fiesta = sanitizeText(req.body?.fiesta, 30);
  const year = Number(req.body?.year);
  const maxYear = Number(trakeHoy().slice(0, 4));
  if (!fiesta) return res.status(400).json({ error: 'Escribe la fiesta.' });
  if (!Number.isInteger(year) || year < PAST_MIN_YEAR || year > maxYear) {
    return res.status(400).json({ error: `Pon un año válido (entre ${PAST_MIN_YEAR} y ${maxYear}).` });
  }

  try {
    await cloudinary.api.update(p.publicId, {
      resource_type: 'image',
      type: 'upload',
      // Cloudinary espera el contexto como "clave=valor|clave=valor" (ya vienen sin '|' ni '=')
      context: `fiesta=${fiesta}|year=${year}|desc=${p.desc || ''}`
    });
    p.fiesta = fiesta;
    p.year = year;
    res.json({ ok: true, fiesta, year });
  } catch (e) {
    console.error('No se pudo mover la foto del pasado:', e.message || e);
    res.status(500).json({ error: 'No se pudo mover la foto.' });
  }
});

// Borrar una foto del pasado (SOLO admin)
app.delete('/api/admin/photos/past/:id', adminAuth, photosOnly, async (req, res) => {
  const { id } = req.params;
  if (!ID_RE.test(id)) return res.status(400).json({ error: 'Id no válido' });

  try {
    await cloudinary.uploader.destroy(PAST_PREFIX + id, { resource_type: 'image', invalidate: true });
    pastIndex = pastIndex.filter((p) => p.id !== id);
    res.json({ ok: true });
  } catch (e) {
    console.error(e);
    res.status(500).json({ error: 'No se pudo borrar la foto.' });
  }
});

// =========================
// TRAKETÍMETRO (marcador de cervezas, cubatas, chupitos, porros y cigarros)
// =========================
// Los datos se organizan por MESES: cada mes tiene su propio ranking y al
// empezar un mes nuevo arranca de cero solo (el mes se calcula con la hora de
// Madrid, no hace falta ninguna tarea programada). Los meses ya cerrados se
// guardan y de ahí sale el "Salón del Cubata de Oro".
// Además el admin puede crear FECHAS especiales (San Miguel, San Roque...):
// mientras dura una fecha, lo que se apunta cuenta para el mes Y para esa fecha.
//
// Puntuación (oculta, solo sirve para ordenar): porro 3, cubata 3, chupito 2,
// cerveza 1, cigarro 1 (los cigarros solo cuentan mientras estén activados).
//
// Se guarda en memoria, en un fichero local (data/traketimetro.json) como
// caché rápida, y además se respalda en Cloudinary (como archivo "raw") cada
// vez que cambia algo. En Render el disco es "efímero": el fichero local se
// puede perder en un redeploy o al dormirse el servicio. Cloudinary sí es
// persistente de verdad, así que al arrancar el servidor intentamos cargar
// primero desde ahí; el fichero local es solo un plan B si Cloudinary no
// está configurado o falla justo en ese momento.

// TRAKE_TIPOS es una lista "viva": 'cigarros' se añade o se quita EN SITIO (mismo array)
// según esté activado o no (ver trakeSyncTipos), así TKT365 y el Higher or Lower, que
// reciben esta misma lista, se enteran sin tocar nada más.
const TRAKE_TIPOS = ['cervezas', 'cubatas', 'chupitos', 'porros'];
const TRAKE_PUNTOS = { porros: 3, cubatas: 3, chupitos: 2, cervezas: 1, cigarros: 1 };
// Los cigarros se activan solos a partir de esta fecha (hora de Madrid), salvo que el
// admin los fuerce antes ("on") o los apague ("off") desde traketimetro.html?admin=1.
const CIGARROS_DESDE = '2026-11-01';
const TRAKE_DATA_DIR = path.join(__dirname, 'data');
const TRAKE_FILE = path.join(TRAKE_DATA_DIR, 'traketimetro.json');
const TRAKE_CLOUD_ID = 'traketeros_data/traketimetro'; // public_id del respaldo en Cloudinary
const MESES_ES = ['Enero', 'Febrero', 'Marzo', 'Abril', 'Mayo', 'Junio', 'Julio', 'Agosto', 'Septiembre', 'Octubre', 'Noviembre', 'Diciembre'];

// Estructura:
// {
//   version: 2,
//   months:    { 'YYYY-MM': { <nombre en minúsculas>: { name, cervezas, cubatas, chupitos, porros } } },
//   events:    [ { id, name, start: 'YYYY-MM-DD', end: 'YYYY-MM-DD' } ],
//   eventData: { <id>: { <nombre en minúsculas>: {...} } },
//   overrides: { 'm:YYYY-MM' | 'e:<id>': 'Nombre del ganador a mano' },
//   settings:  { cigarros: 'auto' | 'on' | 'off' }   (auto = se activan solos el 2026-11-01)
//   log:       [ { id, name, tipo, cantidad, ts, foto?: { id, publicId?, url? } } ]   (historial con fecha/hora y foto opcional)
// }
let trakeData = trakeEmpty();

function trakeEmpty() {
  return { version: 2, months: {}, events: [], eventData: {}, overrides: {}, settings: { cigarros: 'auto' }, log: [] };
}

// Los datos antiguos eran un único ranking sin fechas. Eran los de septiembre
// de 2026, así que pasan a ser el mes 2026-09 (y el Cubata de Oro de septiembre
// es de Mañas). Octubre arranca de cero.
function trakeNormalize(raw) {
  if (raw && raw.version === 2 && raw.months && typeof raw.months === 'object') {
    return {
      version: 2,
      months: raw.months,
      events: Array.isArray(raw.events) ? raw.events : [],
      eventData: raw.eventData || {},
      overrides: raw.overrides || {},
      settings: { cigarros: ['auto', 'on', 'off'].includes(raw.settings?.cigarros) ? raw.settings.cigarros : 'auto' },
      // Datos anteriores no tienen historial: se queda vacío, sin tocar nada más
      log: Array.isArray(raw.log) ? raw.log : []
    };
  }
  const d = trakeEmpty();
  if (raw && typeof raw === 'object' && Object.keys(raw).length) d.months['2026-09'] = raw;
  d.overrides['m:2026-09'] = 'Mañas';
  trakeMigrated = true;
  return d;
}
let trakeMigrated = false;

function trakeLoadLocal() {
  try {
    trakeData = trakeNormalize(JSON.parse(fs.readFileSync(TRAKE_FILE, 'utf8')));
  } catch {
    trakeData = trakeNormalize({});
  }
}

function trakeSaveLocal() {
  try {
    fs.mkdirSync(TRAKE_DATA_DIR, { recursive: true });
    fs.writeFileSync(TRAKE_FILE, JSON.stringify(trakeData), 'utf8');
  } catch (e) {
    console.error('No se pudo guardar el traketímetro localmente:', e.message || e);
  }
}

// Sube el estado actual a Cloudinary. No bloquea la respuesta al usuario:
// se llama sin esperarla (fire-and-forget) desde trakeSave().
async function trakeSaveCloud() {
  if (!CLOUDINARY_OK) return;
  try {
    const b64 = Buffer.from(JSON.stringify(trakeData)).toString('base64');
    await cloudinary.uploader.upload(`data:application/json;base64,${b64}`, {
      resource_type: 'raw',
      public_id: TRAKE_CLOUD_ID,
      overwrite: true,
      invalidate: true
    });
  } catch (e) {
    console.error('No se pudo respaldar el traketímetro en Cloudinary:', e.message || e);
  }
}

// Guarda en ambos sitios: fichero local (rápido, por si Cloudinary tarda) y
// Cloudinary (el que de verdad sobrevive a un redeploy).
// TKT365 se engancha aquí: cada vez que cambian los datos del Traketímetro (nuevo
// registro, deshacer, edición del admin...) se recalculan las cuotas de TKT365.
let tkt365Api = null;

function trakeSave() {
  trakeSaveLocal();
  trakeSaveCloud();
  try { tkt365Api?.recalcularCuotas('registro'); } catch (e) { console.error('TKT365: no se pudieron recalcular las cuotas:', e.message || e); }
}

// Intenta cargar el respaldo desde Cloudinary; si no hay o falla, usa el
// fichero local como plan B.
async function trakeLoad() {
  let loaded = false;
  if (CLOUDINARY_OK) {
    try {
      const info = await cloudinary.api.resource(TRAKE_CLOUD_ID, { resource_type: 'raw' });
      const resp = await fetch(info.secure_url, { cache: 'no-store' });
      if (resp.ok) {
        trakeData = trakeNormalize(await resp.json());
        console.log('Traketímetro: datos cargados desde Cloudinary.');
        loaded = true;
      }
    } catch (e) {
      console.warn('Traketímetro: no se pudo cargar el respaldo de Cloudinary (usando plan B):', e.message || e);
    }
  }
  if (!loaded) trakeLoadLocal();
  trakeSyncTipos();
  if (trakeMigrated) {
    console.log('Traketímetro: datos antiguos pasados al mes 2026-09.');
    trakeSave();
  }
}

const trakeReady = trakeLoad();

// ---------- Fechas (hora de Madrid) ----------
function trakeHoy() {
  // 'en-CA' da el formato YYYY-MM-DD
  return new Intl.DateTimeFormat('en-CA', {
    timeZone: 'Europe/Madrid', year: 'numeric', month: '2-digit', day: '2-digit'
  }).format(new Date());
}

function trakeMesActual() {
  return trakeHoy().slice(0, 7);
}

function trakeMesLabel(id) {
  const [y, m] = id.split('-');
  return `${MESES_ES[Number(m) - 1] || id} ${y}`;
}

function trakeEventoActivo(ev, hoy) {
  return ev.start <= hoy && hoy <= (ev.end || ev.start);
}

function trakeEstadoEvento(ev, hoy) {
  if (hoy < ev.start) return 'proximo';
  if (hoy > (ev.end || ev.start)) return 'pasado';
  return 'en_curso';
}

// ---------- Cigarros: activación ----------
// modo 'auto': activos desde CIGARROS_DESDE (hora de Madrid) · 'on': activos ya · 'off': apagados.
function trakeCigarrosModo() {
  const m = trakeData.settings?.cigarros;
  return m === 'on' || m === 'off' ? m : 'auto';
}

function trakeCigarrosActivos() {
  const modo = trakeCigarrosModo();
  if (modo === 'on') return true;
  if (modo === 'off') return false;
  return trakeHoy() >= CIGARROS_DESDE;
}

// Deja TRAKE_TIPOS (lista compartida con TKT365 y Higher or Lower) al día. Devuelve true si ha cambiado.
function trakeSyncTipos() {
  const quiere = trakeCigarrosActivos();
  const i = TRAKE_TIPOS.indexOf('cigarros');
  if (quiere && i === -1) { TRAKE_TIPOS.push('cigarros'); return true; }
  if (!quiere && i !== -1) { TRAKE_TIPOS.splice(i, 1); return true; }
  return false;
}

function trakeConfig() {
  return { cigarros: { activo: trakeCigarrosActivos(), modo: trakeCigarrosModo(), desde: CIGARROS_DESDE } };
}

// Persona a cero con todos los tipos (los datos antiguos sin 'cigarros' se leen como 0)
function trakePersonaVacia(name) {
  return { name, cervezas: 0, cubatas: 0, chupitos: 0, porros: 0, cigarros: 0 };
}

// ---------- Puntos y ranking ----------
function trakePuntos(p) {
  return TRAKE_TIPOS.reduce((s, t) => s + (p[t] || 0) * TRAKE_PUNTOS[t], 0);
}

function trakeTotal(p) {
  return TRAKE_TIPOS.reduce((s, t) => s + (p[t] || 0), 0);
}

// Ranking de un periodo ('m:YYYY-MM' o 'e:<id>'), ordenado por puntos.
function trakeBucket(periodo) {
  if (periodo.startsWith('e:')) return trakeData.eventData[periodo.slice(2)] || {};
  return trakeData.months[periodo.slice(2)] || {};
}

function trakeListOf(bucket) {
  return Object.values(bucket)
    .map((p) => ({
      name: p.name,
      cervezas: p.cervezas || 0,
      cubatas: p.cubatas || 0,
      chupitos: p.chupitos || 0,
      porros: p.porros || 0,
      cigarros: p.cigarros || 0,
      total: trakeTotal(p),
      puntos: trakePuntos(p)
    }))
    .sort((a, b) => b.puntos - a.puntos || b.total - a.total || a.name.localeCompare(b.name, 'es'));
}

// Nombre(s) del ganador: el que haya puesto el admin a mano o, si no, quien
// tenga más puntos (si hay empate a puntos, ganan todos los empatados).
function trakeGanador(periodo) {
  const manual = trakeData.overrides[periodo];
  if (manual) return { names: [manual], manual: true };
  const lista = trakeListOf(trakeBucket(periodo));
  if (!lista.length || lista[0].puntos <= 0) return { names: [], manual: false };
  const top = lista[0].puntos;
  return { names: lista.filter((p) => p.puntos === top).map((p) => p.name), manual: false };
}

function trakePeriodoValido(periodo) {
  if (/^m:\d{4}-(0[1-9]|1[0-2])$/.test(periodo)) return true;
  if (periodo.startsWith('e:')) return trakeData.events.some((e) => e.id === periodo.slice(2));
  return false;
}

// Periodos que se pueden consultar en el ranking (mes actual primero)
function trakePeriodos() {
  const hoy = trakeHoy();
  const actual = hoy.slice(0, 7);
  const meses = new Set([actual, ...Object.keys(trakeData.months)]);
  const out = [...meses].sort().reverse().map((id) => ({
    id: 'm:' + id,
    tipo: 'mes',
    label: trakeMesLabel(id),
    actual: id === actual
  }));
  const eventos = [...trakeData.events]
    .sort((a, b) => b.start.localeCompare(a.start))
    .map((e) => ({
      id: 'e:' + e.id,
      tipo: 'fecha',
      label: e.name,
      start: e.start,
      end: e.end || e.start,
      estado: trakeEstadoEvento(e, hoy)
    }));
  return [...out, ...eventos];
}

// Salón del Cubata de Oro: ganadores de los meses cerrados y de las fechas
// ya terminadas, más el mes en juego.
function trakeSalon() {
  const hoy = trakeHoy();
  const actual = hoy.slice(0, 7);

  const idsMeses = new Set([
    ...Object.keys(trakeData.months),
    ...Object.keys(trakeData.overrides).filter((k) => k.startsWith('m:')).map((k) => k.slice(2))
  ]);
  const meses = [...idsMeses]
    .filter((id) => id < actual)
    .sort()
    .map((id) => ({ id, label: trakeMesLabel(id), ...trakeGanador('m:' + id) }))
    .filter((m) => m.names.length);

  const fechas = trakeData.events
    .filter((e) => trakeEstadoEvento(e, hoy) === 'pasado')
    .sort((a, b) => a.start.localeCompare(b.start))
    .map((e) => ({ id: e.id, label: e.name, start: e.start, end: e.end || e.start, ...trakeGanador('e:' + e.id) }))
    .filter((e) => e.names.length);

  const enJuego = trakeGanador('m:' + actual);
  return {
    meses,
    fechas,
    actual: { id: actual, label: trakeMesLabel(actual), lider: enJuego.manual ? [] : enJuego.names }
  };
}

// Totales de siempre por persona: suma de todos los meses (las fechas
// especiales no se suman porque ya cuentan dentro del mes).
function trakeTotalesHistoricos() {
  const acc = new Map();
  for (const bucket of Object.values(trakeData.months)) {
    for (const p of Object.values(bucket || {})) {
      const key = String(p.name || '').trim().toLowerCase();
      if (!key) continue;
      const cur = acc.get(key) || trakePersonaVacia(p.name);
      for (const t of TRAKE_TIPOS) cur[t] += p[t] || 0;
      acc.set(key, cur);
    }
  }
  return [...acc.values()]
    .map((p) => ({ ...p, total: trakeTotal(p) }))
    .filter((p) => p.total > 0)
    .sort((a, b) => b.total - a.total || a.name.localeCompare(b.name, 'es'));
}

function trakeRespuesta(periodo) {
  const p = trakePeriodoValido(periodo) ? periodo : 'm:' + trakeMesActual();
  return {
    ok: true,
    periodo: p,
    people: trakeListOf(trakeBucket(p)),
    totales: trakeTotalesHistoricos(),
    periodos: trakePeriodos(),
    salon: trakeSalon(),
    events: trakeData.events,
    historial: trakeHistorial(p),
    config: trakeConfig()
  };
}

function periodoDe(req) {
  return String(req.query?.periodo || req.body?.periodo || '');
}

// ---------- Historial (fecha, día y hora de cada apunte + foto opcional) ----------
const TRAKE_LOG_MAX = 3000;          // máximo de apuntes que se guardan en el historial
const TRAKE_LOG_VISIBLES = 60;       // cuántos se envían a la web (los más recientes)
const TRAKE_FOTOS_DIR = path.join(TRAKE_DATA_DIR, 'traketimetro_fotos'); // copia local de las fotos
const TRAKE_FOTO_TAG = 'traketimetro';          // etiqueta propia: NO salen en el álbum de /fotos.html
const TRAKE_FOTO_FOLDER = 'traketimetro_fotos'; // carpeta en Cloudinary

const trakeDiaFmt = new Intl.DateTimeFormat('en-CA', {
  timeZone: 'Europe/Madrid', year: 'numeric', month: '2-digit', day: '2-digit'
});

function trakeFotoPublica(f) {
  if (!f || !ID_RE.test(String(f.id || ''))) return null;
  let thumb = `/api/traketimetro/foto/${f.id}`;
  if (CLOUDINARY_OK && f.publicId) {
    try {
      thumb = cloudinary.url(f.publicId, {
        secure: true, width: 480, height: 480, crop: 'limit', quality: 'auto', fetch_format: 'auto', version: f.version
      });
    } catch { /* se usa la copia local */ }
  }
  return { url: `/api/traketimetro/foto/${f.id}`, thumb };
}

function trakeHistorial(periodo) {
  const ev = periodo.startsWith('e:') ? trakeData.events.find((e) => e.id === periodo.slice(2)) : null;
  const mes = periodo.startsWith('m:') ? periodo.slice(2) : '';
  const out = [];
  for (let i = trakeData.log.length - 1; i >= 0 && out.length < TRAKE_LOG_VISIBLES; i--) {
    const l = trakeData.log[i];
    if (!TRAKE_TIPOS.includes(l.tipo)) continue; // p. ej. cigarros mientras estén apagados
    const dia = trakeDiaFmt.format(new Date(l.ts));
    if (mes && dia.slice(0, 7) !== mes) continue;
    if (ev && !(ev.start <= dia && dia <= (ev.end || ev.start))) continue;
    out.push({
      id: l.id, name: l.name, tipo: l.tipo, cantidad: l.cantidad, ts: l.ts,
      foto: trakeFotoPublica(l.foto)
    });
  }
  return out;
}

// Borra la foto de un apunte (Cloudinary + copia local). No bloquea ni lanza errores.
function trakeBorrarFoto(foto) {
  if (!foto || !ID_RE.test(String(foto.id || ''))) return;
  fs.promises.unlink(path.join(TRAKE_FOTOS_DIR, foto.id + '.jpg')).catch(() => {});
  if (CLOUDINARY_OK && foto.publicId) {
    cloudinary.uploader.destroy(foto.publicId, { resource_type: 'image', invalidate: true })
      .catch((e) => console.error('No se pudo borrar la foto del traketímetro en Cloudinary:', e.message || e));
  }
}

// ---------- Directo (SSE) ----------
const sseTrakeClients = new Set();

function broadcastTrakeChanged() {
  const msg = `data: ${JSON.stringify({ type: 'trake-changed' })}\n\n`;
  for (const res of sseTrakeClients) {
    try { res.write(msg); } catch { /* cliente ya desconectado */ }
  }
}

app.get('/api/traketimetro/stream', (req, res) => {
  res.set({
    'Content-Type': 'text/event-stream',
    'Cache-Control': 'no-cache, no-transform',
    Connection: 'keep-alive'
  });
  res.flushHeaders?.();
  res.write(':ok\n\n');

  sseTrakeClients.add(res);
  req.on('close', () => sseTrakeClients.delete(res));
});

setInterval(() => {
  for (const res of sseTrakeClients) {
    try { res.write(':ping\n\n'); } catch { /* cliente ya desconectado */ }
  }
}, 25_000).unref();

// Cambio de mes (o de fecha especial): avisamos a todos para que se refresquen
// solos en cuanto pase la medianoche de Madrid.
let trakeUltimoDia = trakeHoy();
setInterval(() => {
  const hoy = trakeHoy();
  const cambioTipos = trakeSyncTipos(); // p. ej. los cigarros se activan solos el 1 de noviembre
  if (cambioTipos) {
    try { tkt365Api?.recalcularCuotas('cigarros'); } catch (e) { console.error('TKT365: no se pudieron recalcular las cuotas:', e.message || e); }
  }
  if (hoy !== trakeUltimoDia || cambioTipos) {
    trakeUltimoDia = hoy;
    broadcastTrakeChanged();
  }
}, 30_000).unref();

// Antes de atender cualquier petición de la API se deja al día la lista de tipos
// (así los cigarros aparecen/desaparecen justo a tiempo, sin esperar al reloj de arriba).
app.use('/api', (req, res, next) => {
  if (trakeSyncTipos()) {
    try { tkt365Api?.recalcularCuotas('cigarros'); } catch { /* se recalcula en el siguiente registro */ }
    broadcastTrakeChanged();
  }
  next();
});

// ---------- API pública ----------
// Ranking de un periodo (por defecto el mes actual) + salón + fechas
app.get('/api/traketimetro', (req, res) => {
  res.set('Cache-Control', 'no-store');
  res.json(trakeRespuesta(periodoDe(req)));
});

// Solo el salón (lo usa la pantalla principal)
app.get('/api/traketimetro/salon', (req, res) => {
  res.set('Cache-Control', 'no-store');
  res.json({ salon: trakeSalon(), events: trakeData.events, hoy: trakeHoy(), config: trakeConfig() });
});

function trakeValidate(req, res) {
  const name = String(req.body?.name || '').trim().slice(0, 30);
  const tipo = String(req.body?.tipo || '');
  const cantidadRaw = Math.round(Number(req.body?.cantidad));
  const cantidad = Number.isFinite(cantidadRaw) && cantidadRaw >= 1 ? Math.min(cantidadRaw, 24) : 1;

  if (!name) {
    res.status(400).json({ error: 'Falta el nombre.' });
    return null;
  }
  if (!TRAKE_TIPOS.includes(tipo)) {
    res.status(400).json({ error: tipo === 'cigarros' ? 'Los cigarros todavía no están activados.' : 'Tipo no válido.' });
    return null;
  }
  return { name, tipo, cantidad };
}

// Buckets donde cuenta lo que se apunta ahora: el mes actual y las fechas
// especiales que estén en curso hoy.
function trakeBucketsActivos(crear) {
  const hoy = trakeHoy();
  const mes = hoy.slice(0, 7);
  const out = [];
  if (crear && !trakeData.months[mes]) trakeData.months[mes] = {};
  if (trakeData.months[mes]) out.push(trakeData.months[mes]);
  for (const ev of trakeData.events) {
    if (!trakeEventoActivo(ev, hoy)) continue;
    if (crear && !trakeData.eventData[ev.id]) trakeData.eventData[ev.id] = {};
    if (trakeData.eventData[ev.id]) out.push(trakeData.eventData[ev.id]);
  }
  return out;
}

// Foto opcional al apuntar (multipart, campo "foto"). Si llega JSON normal, todo funciona como antes.
const trakeUpload = multer({
  storage: multer.memoryStorage(),
  limits: { fileSize: 12 * 1024 * 1024, files: 1, fields: 8, fieldSize: 500 },
  fileFilter: (req, file, cb) => cb(null, /^image\/(jpeg|png|webp|heic|heif)$/i.test(file.mimetype))
});

function trakeAddUpload(req, res, next) {
  if (!req.is('multipart/form-data')) return next();
  trakeUpload.single('foto')(req, res, (err) => {
    if (err) {
      return res.status(400).json({
        error: err.code === 'LIMIT_FILE_SIZE' ? 'El archivo pesa demasiado (máximo 12 MB).' : 'No se ha podido leer la foto.'
      });
    }
    next();
  });
}

// Procesa la foto (quita GPS, reduce tamaño), la guarda en la web (copia local) y la sube a Cloudinary.
// Devuelve { id, publicId?, version? } o null si no se ha podido guardar en ningún sitio.
async function trakeGuardarFoto(buffer) {
  let jpeg;
  try {
    jpeg = await sharp(buffer, { failOn: 'error' })
      .rotate()
      .flatten({ background: '#ffffff' })
      .resize({ width: 1600, height: 1600, fit: 'inside', withoutEnlargement: true })
      .jpeg({ quality: 82 })
      .toBuffer();
  } catch (e) {
    console.error('Traketímetro: foto no válida:', e.message);
    return null;
  }

  const id = Date.now().toString(36) + crypto.randomBytes(5).toString('hex');
  const foto = { id };
  let guardada = false;

  try {
    await fs.promises.mkdir(TRAKE_FOTOS_DIR, { recursive: true });
    await fs.promises.writeFile(path.join(TRAKE_FOTOS_DIR, id + '.jpg'), jpeg);
    guardada = true;
  } catch (e) {
    console.error('Traketímetro: no se pudo guardar la foto en la web:', e.message || e);
  }

  if (CLOUDINARY_OK) {
    try {
      const r = await sendToCloudinary(jpeg, {
        public_id: `${TRAKE_FOTO_FOLDER}/${id}`,
        tags: [TRAKE_FOTO_TAG],
        resource_type: 'image',
        overwrite: false
      });
      foto.publicId = r.public_id;
      foto.version = r.version;
      foto.url = r.secure_url;
      guardada = true;
    } catch (e) {
      console.error('Traketímetro: Cloudinary no ha guardado la foto:', e.message || e);
    }
  }
  return guardada ? foto : null;
}

// Sumar una o varias consumiciones de golpe (con foto opcional)
app.post('/api/traketimetro/add', trakeAddUpload, async (req, res) => {
  const ts = Date.now(); // momento exacto del apunte
  const v = trakeValidate(req, res);
  if (!v) return;

  let foto = null;
  let fotoFallo = false;
  if (req.file) {
    // Mismo límite que el álbum: 20 fotos por hora y por IP
    let limitado = false;
    uploadLimiter(req, { status: () => ({ json: () => { limitado = true; } }) }, () => {});
    if (limitado) {
      fotoFallo = true;
    } else {
      foto = await trakeGuardarFoto(req.file.buffer);
      if (!foto) fotoFallo = true;
    }
  }

  const key = v.name.toLowerCase();
  for (const bucket of trakeBucketsActivos(true)) {
    if (!bucket[key]) bucket[key] = trakePersonaVacia(v.name);
    bucket[key][v.tipo] = (bucket[key][v.tipo] || 0) + v.cantidad;
  }

  const entrada = {
    id: Date.now().toString(36) + crypto.randomBytes(4).toString('hex'),
    name: v.name,
    tipo: v.tipo,
    cantidad: v.cantidad,
    ts
  };
  if (foto) entrada.foto = foto;
  trakeData.log.push(entrada);
  if (trakeData.log.length > TRAKE_LOG_MAX) trakeData.log.splice(0, trakeData.log.length - TRAKE_LOG_MAX);

  trakeSave();
  broadcastTrakeChanged();
  const out = trakeRespuesta(periodoDe(req));
  if (fotoFallo) out.fotoFallo = true;
  res.json(out);
});

// Foto de un apunte: copia local si existe; si no (p. ej. tras un redeploy), la de Cloudinary
app.get('/api/traketimetro/foto/:id', (req, res) => {
  const { id } = req.params;
  if (!ID_RE.test(id)) return res.status(400).end();
  const file = path.join(TRAKE_FOTOS_DIR, id + '.jpg');
  if (fs.existsSync(file)) {
    res.set('Cache-Control', 'public, max-age=86400');
    return res.type('jpg').sendFile(file);
  }
  const l = trakeData.log.find((x) => x.foto?.id === id);
  const url = l?.foto?.url || (l?.foto?.publicId && CLOUDINARY_OK
    ? cloudinary.url(l.foto.publicId, { secure: true, version: l.foto.version, format: 'jpg' })
    : '');
  if (url) return res.redirect(302, url);
  res.status(404).end();
});

// Deshacer la última pulsación (por si te equivocas de nombre o de cuadro)
app.post('/api/traketimetro/undo', (req, res) => {
  const v = trakeValidate(req, res);
  if (!v) return;

  const key = v.name.toLowerCase();
  let cambio = false;
  for (const bucket of trakeBucketsActivos(false)) {
    if (bucket[key]) {
      bucket[key][v.tipo] = Math.max(0, (bucket[key][v.tipo] || 0) - v.cantidad);
      cambio = true;
    }
  }
  if (cambio) {
    // Quita el apunte más reciente igual (mismo nombre, tipo y cantidad) del historial
    for (let i = trakeData.log.length - 1; i >= 0; i--) {
      const l = trakeData.log[i];
      if (String(l.name).toLowerCase() === key && l.tipo === v.tipo && l.cantidad === v.cantidad) {
        trakeBorrarFoto(l.foto);
        trakeData.log.splice(i, 1);
        break;
      }
    }
    trakeSave();
    broadcastTrakeChanged();
  }
  res.json(trakeRespuesta(periodoDe(req)));
});

// Corregir las cantidades de una persona a mano: SOLO el admin (usuario y
// clave). Corrige el ranking que se esté viendo (mes o fecha).
app.post('/api/traketimetro/set', adminAuth, (req, res) => {
  const name = String(req.body?.name || '').trim().slice(0, 30);
  if (!name) return res.status(400).json({ error: 'Falta el nombre.' });

  const periodo = trakePeriodoValido(periodoDe(req)) ? periodoDe(req) : 'm:' + trakeMesActual();
  const bucket = trakeBucket(periodo);
  const key = name.toLowerCase();
  if (!bucket[key]) return res.status(404).json({ error: 'Esa persona no existe todavía.' });

  const clamp = (v) => {
    const n = Math.round(Number(v));
    return Number.isFinite(n) && n >= 0 ? Math.min(n, 999) : 0;
  };

  bucket[key] = {
    ...bucket[key],
    name: bucket[key].name || name,
    cervezas: clamp(req.body?.cervezas),
    cubatas: clamp(req.body?.cubatas),
    chupitos: clamp(req.body?.chupitos),
    porros: clamp(req.body?.porros),
    // Si la petición no trae cigarros (página antigua en caché) se respeta lo que ya había
    cigarros: req.body?.cigarros === undefined ? (bucket[key].cigarros || 0) : clamp(req.body.cigarros)
  };
  trakeSave();
  broadcastTrakeChanged();
  res.json(trakeRespuesta(periodo));
});

// Borrar a alguien del ranking que se esté viendo (solo admin, desde
// traketimetro.html?admin=1)
app.delete('/api/admin/traketimetro/:name', adminAuth, (req, res) => {
  const name = String(req.params.name || '').trim();
  if (!name) return res.status(400).json({ error: 'Falta el nombre.' });

  const periodo = trakePeriodoValido(periodoDe(req)) ? periodoDe(req) : 'm:' + trakeMesActual();
  const bucket = trakeBucket(periodo);
  const key = name.toLowerCase();
  if (!bucket[key]) {
    return res.status(404).json({ error: 'No existe esa persona en el ranking.' });
  }

  delete bucket[key];
  trakeSave();
  broadcastTrakeChanged();
  res.json(trakeRespuesta(periodo));
});

// ---------- Admin: fechas especiales (San Miguel, San Roque...) ----------
const FECHA_RE = /^\d{4}-\d{2}-\d{2}$/;

app.post('/api/admin/traketimetro/fechas', adminAuth, (req, res) => {
  const name = String(req.body?.name || '').trim().slice(0, 40);
  const start = String(req.body?.start || '').trim();
  const end = String(req.body?.end || '').trim() || start;

  if (!name) return res.status(400).json({ error: 'Ponle un nombre a la fecha.' });
  if (!FECHA_RE.test(start) || !FECHA_RE.test(end)) {
    return res.status(400).json({ error: 'Fecha no válida.' });
  }
  if (end < start) return res.status(400).json({ error: 'El final no puede ser antes del inicio.' });
  if (trakeData.events.length >= 100) return res.status(400).json({ error: 'Demasiadas fechas.' });

  trakeData.events.push({ id: crypto.randomBytes(5).toString('hex'), name, start, end });
  trakeSave();
  broadcastTrakeChanged();
  res.json(trakeRespuesta(periodoDe(req)));
});

app.delete('/api/admin/traketimetro/fechas/:id', adminAuth, (req, res) => {
  const id = String(req.params.id || '');
  const antes = trakeData.events.length;
  trakeData.events = trakeData.events.filter((e) => e.id !== id);
  if (trakeData.events.length === antes) return res.status(404).json({ error: 'No existe esa fecha.' });

  delete trakeData.eventData[id];
  delete trakeData.overrides['e:' + id];
  trakeSave();
  broadcastTrakeChanged();
  res.json(trakeRespuesta(periodoDe(req)));
});

// Cigarros: 'auto' (se activan solos el 1 de noviembre), 'on' (activarlos ya) u 'off' (apagarlos).
// Al apagarlos no se borra nada: los datos se quedan guardados y vuelven a verse al reactivarlos.
app.post('/api/admin/traketimetro/cigarros', adminAuth, (req, res) => {
  const modo = String(req.body?.modo || '');
  if (!['auto', 'on', 'off'].includes(modo)) return res.status(400).json({ error: 'Modo no válido.' });
  trakeData.settings = { ...(trakeData.settings || {}), cigarros: modo };
  trakeSyncTipos();
  trakeSave(); // también recalcula las cuotas de TKT365
  broadcastTrakeChanged();
  res.json(trakeRespuesta(periodoDe(req)));
});

// Poner (o quitar, dejando el nombre vacío) a mano el Cubata de Oro de un mes
// o de una fecha: body { periodo: 'm:2026-09' | 'e:<id>', name }
app.post('/api/admin/traketimetro/ganador', adminAuth, (req, res) => {
  const periodo = String(req.body?.target || '');
  if (!trakePeriodoValido(periodo)) return res.status(400).json({ error: 'Periodo no válido.' });

  const name = String(req.body?.name || '').trim().slice(0, 30);
  if (name) trakeData.overrides[periodo] = name;
  else delete trakeData.overrides[periodo];
  trakeSave();
  broadcastTrakeChanged();
  res.json(trakeRespuesta(periodoDe(req)));
});

// =========================
// COMUNIDAD: calendario, avisos y dashboard/perfiles
// =========================
const COMMUNITY_FILE = path.join(TRAKE_DATA_DIR, 'community.json');
const COMMUNITY_CLOUD_ID = 'traketeros_data/community';
let communityData = { events: [], notices: [], cardPhotos: {}, cardStats: ['cervezas', 'cubatas', 'chupitos', 'porros'], perfilFrases: {} };
// Categorías de estadísticas que puede mostrar la Carta del Salón de la Fama.
// El admin decide cuáles se ven (botón "añadir"/"borrar" en admin-comunidad.html).
const CARD_STAT_META = {
  cervezas: { emoji: '🍺', label: 'Cervezas' },
  cubatas: { emoji: '🍹', label: 'Cubatas' },
  chupitos: { emoji: '🥃', label: 'Chupitos' },
  porros: { emoji: '🌿', label: 'Porros' },
  cigarros: { emoji: '🚬', label: 'Cigarros' }
};
function communityNormalize(raw) {
  const cardStats = Array.isArray(raw?.cardStats)
    ? raw.cardStats.filter((k) => CARD_STAT_META[k])
    : ['cervezas', 'cubatas', 'chupitos', 'porros'];
  const cardPhotos = {};
  if (raw?.cardPhotos && typeof raw.cardPhotos === 'object') {
    for (const [key, v] of Object.entries(raw.cardPhotos)) {
      if (!v || !v.url) continue;
      cardPhotos[key] = {
        name: String(v.name || key).slice(0, 80),
        url: String(v.url),
        publicId: v.publicId ? String(v.publicId) : undefined,
        sinFondo: Boolean(v.sinFondo),
        updatedAt: Number(v.updatedAt) || Date.now()
      };
    }
  }
  return {
    events: Array.isArray(raw?.events) ? raw.events : [],
    notices: Array.isArray(raw?.notices) ? raw.notices : [],
    cardStats,
    cardPhotos,
    // frase de cada persona (clave = nombre en minúsculas), la pone ella misma o el admin
    perfilFrases: (() => {
      const out = {};
      if (raw?.perfilFrases && typeof raw.perfilFrases === 'object') {
        for (const [k, v] of Object.entries(raw.perfilFrases)) {
          const texto = String(v?.texto || '').trim().slice(0, 200);
          if (texto) out[String(k).slice(0, 80)] = { texto, ts: Number(v.ts) || Date.now() };
        }
      }
      return out;
    })()
  };
}
function communitySave() {
  try {
    fs.mkdirSync(TRAKE_DATA_DIR, { recursive: true });
    fs.writeFileSync(COMMUNITY_FILE, JSON.stringify(communityData), 'utf8');
  } catch (e) { console.error('No se pudo guardar calendario/avisos:', e.message || e); }
  if (CLOUDINARY_OK) {
    const b64 = Buffer.from(JSON.stringify(communityData)).toString('base64');
    cloudinary.uploader.upload(`data:application/json;base64,${b64}`, {
      resource_type: 'raw', public_id: COMMUNITY_CLOUD_ID, overwrite: true, invalidate: true
    }).catch((e) => console.error('No se pudo respaldar calendario/avisos:', e.message || e));
  }
}
async function communityLoad() {
  if (CLOUDINARY_OK) {
    try {
      const info = await cloudinary.api.resource(COMMUNITY_CLOUD_ID, { resource_type: 'raw' });
      const resp = await fetch(info.secure_url, { cache: 'no-store' });
      if (resp.ok) { communityData = communityNormalize(await resp.json()); communitySaveLocalOnly(); return; }
    } catch (_) {}
  }
  try { communityData = communityNormalize(JSON.parse(fs.readFileSync(COMMUNITY_FILE, 'utf8'))); }
  catch { communityData = communityNormalize(null); }
}
function communitySaveLocalOnly() {
  try { fs.mkdirSync(TRAKE_DATA_DIR, { recursive: true }); fs.writeFileSync(COMMUNITY_FILE, JSON.stringify(communityData), 'utf8'); } catch (_) {}
}
communityLoad();
function trakeAggregate() {
  const byName = new Map();
  const add = (row) => {
    const name = String(row?.name || '').trim(); if (!name) return;
    const key = name.toLocaleLowerCase('es');
    if (!byName.has(key)) byName.set(key, { ...trakePersonaVacia(name), puntos: 0, apuntes: 0, ultimaActividad: 0 });
    const x = byName.get(key);
    for (const tipo of TRAKE_TIPOS) x[tipo] += Math.max(0, Number(row?.[tipo]) || 0);
    x.puntos = trakePuntos(x);
  };
  for (const mes of Object.values(trakeData.months || {})) for (const row of Object.values(mes || {})) add(row);
  // Log is authoritative for activity/recent consumption, while monthly buckets provide lifetime totals.
  for (const row of (trakeData.log || [])) {
    const key = String(row.name || '').trim().toLocaleLowerCase('es');
    if (!key) continue;
    if (!byName.has(key)) add({ name: row.name });
    const x = byName.get(key); x.apuntes += 1; x.ultimaActividad = Math.max(x.ultimaActividad, Number(row.ts) || 0);
  }
  const list = [...byName.values()].sort((a,b) => b.puntos-a.puntos || a.name.localeCompare(b.name, 'es'));
  // ---------- Carta del Salón de la Fama: foto (si tiene) + notas tipo FC ----------
  // Todas las notas van de 60 a 99 y son PROPORCIONALES al consumo TOTAL (histórico, no mensual) del Traketímetro:
  //  - cada categoría (cervezas, cubatas...): 99 para quien más lleva; el resto, en proporción (60 si no ha consumido)
  //  - media (el número grande de arriba): lo mismo con los puntos totales
  const NOTA_MIN = 60, NOTA_MAX = 99;
  const nota = (v, max) => (max > 0 && v > 0 ? Math.round(NOTA_MIN + ((NOTA_MAX - NOTA_MIN) * Math.min(v, max)) / max) : NOTA_MIN);
  const maxPuntos = list.reduce((m, p) => Math.max(m, p.puntos), 0);
  const maxPorTipo = {};
  for (const k of Object.keys(CARD_STAT_META)) maxPorTipo[k] = list.reduce((m, p) => Math.max(m, Number(p[k]) || 0), 0);
  list.forEach((p, i) => {
    const key = p.name.toLocaleLowerCase('es');
    const foto = communityData.cardPhotos[key];
    p.foto = foto ? { url: foto.url, updatedAt: foto.updatedAt, sinFondo: Boolean(foto.sinFondo) } : null;
    p.tieneFotoPropia = Boolean(foto);
    p.puesto = i + 1;
    p.media = nota(p.puntos, maxPuntos);
    p.rating = {};
    for (const k of Object.keys(CARD_STAT_META)) p.rating[k] = nota(Number(p[k]) || 0, maxPorTipo[k]);
  });
  return list;
}
// Categorías que se ven en la Carta: lo que el admin tiene activado, pero los
// cigarros solo cuentan mientras estén encendidos (igual que en el resto de la web).
function cardConfig() {
  const disponibles = TRAKE_TIPOS.slice(); // ya incluye 'cigarros' si está activo (ver trakeSyncTipos)
  const activas = communityData.cardStats.filter((k) => disponibles.includes(k));
  // Los cigarros salen solos en la carta en cuanto están activados en el Traketímetro
  if (disponibles.includes('cigarros') && !activas.includes('cigarros')) activas.push('cigarros');
  return { cardStats: activas, cardStatsDisponibles: disponibles, cardStatMeta: CARD_STAT_META };
}
app.get('/api/community/overview', (req, res) => {
  const people = trakeAggregate();
  const upcoming = [...communityData.events, ...(trakeData.events || []).map(e => ({ ...e, source: 'traketimetro' }))]
    .filter(e => e.date || e.start).sort((a,b) => String(a.date || a.start).localeCompare(String(b.date || b.start)));
  const notices = [...communityData.notices].sort((a,b) => (Number(b.createdAt)||0)-(Number(a.createdAt)||0));
  res.json({ people, totalRegistros: (trakeData.log || []).length, upcoming: upcoming.filter(e => String(e.date || e.start) >= new Date().toISOString().slice(0,10)).slice(0,5), notices: notices.slice(0,5), events: upcoming, lastActivity: [...(trakeData.log || [])].sort((a,b)=>(b.ts||0)-(a.ts||0))[0] || null, config: { ...trakeConfig(), ...cardConfig() } });
});
app.get('/api/community/profile', (req, res) => {
  const requested = String(req.query.name || '').trim();
  if (!requested) return res.status(400).json({ error: 'Indica un nombre.' });
  const people = trakeAggregate();
  const person = people.find(p => p.name.toLocaleLowerCase('es') === requested.toLocaleLowerCase('es'));
  if (!person) return res.status(404).json({ error: 'No existe ese nombre en el Traketímetro.' });
  const key = person.name.toLocaleLowerCase('es');
  const activity = (trakeData.log || []).filter(x => String(x.name||'').trim().toLocaleLowerCase('es') === key).sort((a,b)=>(b.ts||0)-(a.ts||0)).slice(0,50);
  const recent = { cervezas: 0, cubatas: 0, chupitos: 0, porros: 0, cigarros: 0 };
  const cutoff = Date.now() - 30*24*60*60*1000;
  for (const x of activity) if ((Number(x.ts)||0) >= cutoff && recent[x.tipo] !== undefined && TRAKE_TIPOS.includes(x.tipo)) recent[x.tipo] += Number(x.cantidad)||0;
  res.json({ person, activity: activity.filter(x => TRAKE_TIPOS.includes(x.tipo)), recent, frase: communityData.perfilFrases[key]?.texto || '', config: { ...trakeConfig(), ...cardConfig() } });
});
// ---------- Foto de la Carta: MISMA identidad que TKT365 (token del dispositivo -> nombre) ----------
// Un dispositivo solo puede subir la foto del nombre que ya tiene elegido en TKT365 (api.post('/claim')).
// Así nadie puede tocar la foto de otro, igual que nadie puede apostar en nombre de otro.
const cardUpload = multer({
  storage: multer.memoryStorage(),
  limits: { fileSize: 12 * 1024 * 1024, files: 1, fields: 4, fieldSize: 200 },
  // Se acepta cualquier imagen (o tipo vacío/genérico, como mandan algunos móviles para .gif); luego se comprueba el contenido real.
  fileFilter: (req, file, cb) => cb(null, /^(image\/|application\/octet-stream$|$)/i.test(file.mimetype || ''))
});
async function cardGuardarFoto(buffer) {
  // GIF animado (el navegador convierte los vídeos a GIF): se guarda tal cual, con su fondo y su animación.
  if (buffer.length > 6 && /^GIF8[79]a$/.test(buffer.subarray(0, 6).toString('latin1'))) {
    const gifId = `traketeros_cartas/${crypto.randomUUID()}`;
    const g = await sendToCloudinary(buffer, { public_id: gifId, resource_type: 'image', overwrite: true });
    return { url: g.secure_url, publicId: g.public_id, sinFondo: false };
  }
  // ¿Viene ya recortada (sin fondo)? El navegador quita el fondo antes de subirla y manda un PNG/WebP con transparencia.
  let sinFondo = false;
  try {
    const meta = await sharp(buffer).metadata();
    if (meta.hasAlpha) {
      const alfa = (await sharp(buffer).stats()).channels[3];
      sinFondo = Boolean(alfa && alfa.min < 250);
    }
  } catch { /* se trata como foto normal */ }

  let img, extra;
  if (sinFondo) {
    // Se conserva la transparencia: WebP con alfa (sin aplanar a blanco)
    img = await sharp(buffer, { failOn: 'error' })
      .rotate()
      .resize({ width: 600, height: 800, fit: 'inside', withoutEnlargement: true })
      .webp({ quality: 90, alphaQuality: 95 })
      .toBuffer();
    extra = { format: 'webp' };
  } else {
    img = await sharp(buffer, { failOn: 'error' })
      .rotate()
      .flatten({ background: '#ffffff' })
      .resize({ width: 600, height: 600, fit: 'cover' })
      .jpeg({ quality: 85 })
      .toBuffer();
    extra = {};
  }
  const publicId = `traketeros_cartas/${crypto.randomUUID()}`;
  const r = await sendToCloudinary(img, { public_id: publicId, resource_type: 'image', overwrite: true, ...extra });
  return { url: r.secure_url, publicId: r.public_id, sinFondo };
}
// Dice a un dispositivo quién es (según lo que ya haya elegido en TKT365), igual que usa el Higher or Lower.
app.get('/api/community/quien-soy', (req, res) => {
  const id = tkt365Api?.juegos?.duenoDe(req.query.token) || null;
  const name = id ? tkt365Api.juegos.nombreDe(id) : null;
  res.json({ id, name });
});
app.post('/api/community/card-photo', uploadLimiter, (req, res) => {
  cardUpload.single('foto')(req, res, async (err) => {
    if (err) return res.status(400).json({ error: err.code === 'LIMIT_FILE_SIZE' ? 'El archivo pesa demasiado (máximo 12 MB).' : 'No se ha podido leer la foto.' });
    try {
      const name = String(req.body?.name || '').trim().slice(0, 80);
      if (!name) return res.status(400).json({ error: 'Indica tu nombre.' });
      if (!req.file) return res.status(400).json({ error: 'Formato no válido. Sube una foto, un GIF o un vídeo.' });
      const key = name.toLocaleLowerCase('es');
      const yo = tkt365Api?.juegos?.duenoDe(req.body?.token);
      if (!yo || yo !== key) {
        return res.status(403).json({ error: 'Esta carta es de otra persona. Para subir tu foto, entra en tu propio perfil (hace falta tener tu nombre elegido en TKT365, igual que para apostar).' });
      }
      const foto = await cardGuardarFoto(req.file.buffer);
      communityData.cardPhotos[key] = { name, url: foto.url, publicId: foto.publicId, sinFondo: foto.sinFondo, updatedAt: Date.now() };
      communitySave();
      res.json({ ok: true, url: foto.url });
    } catch (e) {
      console.error('Carta: no se pudo guardar la foto:', e.message || e);
      res.status(500).json({ error: 'No se pudo guardar la foto. Inténtalo de nuevo.' });
    }
  });
});
// El admin puede poner/cambiar la foto de cualquiera (sin necesitar el token de su dispositivo).
app.post('/api/admin/community/card-photo', adminAuth, (req, res) => {
  cardUpload.single('foto')(req, res, async (err) => {
    if (err) {
      console.error('Admin carta: error leyendo la foto:', err.code || err.message || err);
      return res.status(400).json({ error: err.code === 'LIMIT_FILE_SIZE' ? 'El archivo pesa demasiado (máximo 12 MB).' : 'No se ha podido leer la foto.' });
    }
    try {
      const name = String(req.body?.name || '').trim().slice(0, 80);
      if (!name) return res.status(400).json({ error: 'Indica el nombre.' });
      if (!req.file) return res.status(400).json({ error: 'Formato no válido. Sube una foto, un GIF o un vídeo.' });
      const key = name.toLocaleLowerCase('es');
      const foto = await cardGuardarFoto(req.file.buffer);
      communityData.cardPhotos[key] = { name, url: foto.url, publicId: foto.publicId, sinFondo: foto.sinFondo, updatedAt: Date.now() };
      communitySave();
      res.json({ ok: true, url: foto.url });
    } catch (e) {
      console.error('Admin carta: no se pudo guardar la foto:', e.message || e);
      const formato = /unsupported|corrupt|invalid|Input buffer|heif|bad seek/i.test(String(e.message || e));
      res.status(formato ? 415 : 500).json({ error: formato ? 'No se pudo procesar esa imagen (formato no soportado). Prueba con JPG o PNG.' : 'No se pudo guardar la foto (' + String(e.message || 'error del servidor').slice(0, 120) + ').' });
    }
  });
});
app.delete('/api/admin/community/card-photo/:name', adminAuth, (req, res) => {
  const key = String(req.params.name || '').trim().toLocaleLowerCase('es');
  delete communityData.cardPhotos[key];
  communitySave();
  res.json({ ok: true });
});
// Categorías de estadísticas que se ven en la Carta (el admin añade/quita)
app.post('/api/admin/community/card-stats', adminAuth, (req, res) => {
  const key = String(req.body?.key || '').trim();
  if (!CARD_STAT_META[key]) return res.status(400).json({ error: 'Categoría no válida.' });
  if (!communityData.cardStats.includes(key)) communityData.cardStats.push(key);
  communitySave();
  res.json({ ok: true, cardStats: communityData.cardStats });
});
app.delete('/api/admin/community/card-stats/:key', adminAuth, (req, res) => {
  communityData.cardStats = communityData.cardStats.filter((k) => k !== req.params.key);
  communitySave();
  res.json({ ok: true, cardStats: communityData.cardStats });
});
// ---------- Frase del perfil: cada persona pone la suya (misma identidad que TKT365) y el admin puede poner/quitar la de cualquiera ----------
function fraseLimpia(t) { return String(t || '').replace(/\s+/g, ' ').trim().slice(0, 200); }
function fraseGuardar(key, name, texto) {
  if (texto) communityData.perfilFrases[key] = { texto, ts: Date.now() };
  else delete communityData.perfilFrases[key];
  communitySave();
}
app.post('/api/community/frase', (req, res) => {
  const name = String(req.body?.name || '').trim().slice(0, 80);
  const key = name.toLocaleLowerCase('es');
  const persona = key && trakeAggregate().find((p) => p.name.toLocaleLowerCase('es') === key);
  if (!persona) return res.status(404).json({ error: 'No existe ese nombre en el Traketímetro.' });
  const yo = tkt365Api?.juegos?.duenoDe(req.body?.token);
  if (!yo || yo !== key) return res.status(403).json({ error: 'Solo puedes cambiar la frase de tu propio perfil (hace falta tener tu nombre elegido en TKT365).' });
  const texto = fraseLimpia(req.body?.texto);
  fraseGuardar(key, persona.name, texto);
  res.json({ ok: true, frase: texto });
});
app.post('/api/admin/community/perfil-frase', adminAuth, (req, res) => {
  const name = String(req.body?.name || '').trim().slice(0, 80);
  const key = name.toLocaleLowerCase('es');
  const persona = key && trakeAggregate().find((p) => p.name.toLocaleLowerCase('es') === key);
  if (!persona) return res.status(404).json({ error: 'No existe ese nombre en el Traketímetro.' });
  const texto = fraseLimpia(req.body?.texto);
  fraseGuardar(key, persona.name, texto);
  res.json({ ok: true, frases: communityData.perfilFrases });
});
app.get('/api/community/admin', adminAuth, (req, res) => res.json(communityData));
app.post('/api/community/events', adminAuth, (req, res) => {
  const name = String(req.body?.name || '').trim().slice(0,100);
  const date = String(req.body?.date || '').slice(0,10);
  if (!name || !/^\d{4}-\d{2}-\d{2}$/.test(date)) return res.status(400).json({ error: 'Nombre y fecha válida son obligatorios.' });
  const event = { id: crypto.randomUUID(), name, date, time: String(req.body?.time||'').slice(0,5), place: String(req.body?.place||'').trim().slice(0,120), description: String(req.body?.description||'').trim().slice(0,500), createdAt: Date.now() };
  communityData.events.push(event); communitySave(); res.json({ ok: true, event, data: communityData });
});
app.delete('/api/community/events/:id', adminAuth, (req, res) => {
  communityData.events = communityData.events.filter(e => e.id !== req.params.id); communitySave(); res.json({ ok: true, data: communityData });
});
app.post('/api/community/notices', adminAuth, (req, res) => {
  const title = String(req.body?.title || '').trim().slice(0,120);
  const body = String(req.body?.body || '').trim().slice(0,1500);
  if (!title || !body) return res.status(400).json({ error: 'Título y aviso son obligatorios.' });
  const notice = { id: crypto.randomUUID(), title, body, pinned: Boolean(req.body?.pinned), createdAt: Date.now() };
  communityData.notices.unshift(notice); communityData.notices = communityData.notices.slice(0,100); communitySave(); res.json({ ok: true, notice, data: communityData });
});
app.delete('/api/community/notices/:id', adminAuth, (req, res) => {
  communityData.notices = communityData.notices.filter(n => n.id !== req.params.id); communitySave(); res.json({ ok: true, data: communityData });
});

// =========================
// TKT365: apuestas virtuales con puntos TKT (sin dinero real)
// =========================
// Los usuarios salen SIEMPRE del Trakímetro (ver tkt365.js). No se toca nada
// del Trakímetro ni de la cuota: solo se leen sus datos.
tkt365Api = registerTkt365({
  app,
  adminAuth,
  getTrake: () => trakeData,
  tipos: TRAKE_TIPOS,
  puntos: TRAKE_PUNTOS,
  hoy: trakeHoy,
  ready: trakeReady,
  cloudinary,
  cloudinaryOk: CLOUDINARY_OK,
  dataDir: TRAKE_DATA_DIR
});

// Higher or Lower (Juegos): mismos jugadores que TKT365/Traketímetro, premios en TKT.
registerHigherLower({
  app,
  getTrake: () => trakeData,
  tipos: TRAKE_TIPOS,
  hoy: trakeHoy,
  ready: trakeReady,
  tkt: tkt365Api.juegos,
  cloudinary,
  cloudinaryOk: CLOUDINARY_OK,
  dataDir: TRAKE_DATA_DIR
});

// =========================
// CUOTA: quién ha pagado + justificante por correo
// =========================
// El estado (quién ha marcado "He pagado" y si ha mandado justificante) se
// guarda igual que el traketímetro: en memoria, en un fichero local y con
// respaldo en Cloudinary (en Render el disco se borra al redesplegar).
//
// Los justificantes se mandan por correo con Resend (por HTTP, porque Render
// gratis bloquea el SMTP). Variables de entorno:
//   RESEND_API_KEY   (obligatoria para enviar justificantes)
//   CUOTA_EMAIL_TO   (opcional, por defecto trakeballer@gmail.com)
//   RESEND_FROM      (opcional, por defecto onboarding@resend.dev)

const CUOTA_NOMBRES_INICIALES = [
  'Adrián', 'Miguel', 'Isabel', 'Laura', 'Lucía', 'Aurora', 'Carlota', 'Carol',
  'Cristina', 'David', 'Elisa', 'Paula', 'Rubén', 'Silvia', 'Xulia'
];
const CUOTA_EMAIL_TO = (process.env.CUOTA_EMAIL_TO || 'trakeballer@gmail.com').trim();
const CUOTA_EMAIL_FROM = (process.env.RESEND_FROM || 'Traketeros <onboarding@resend.dev>').trim();
const CUOTA_FILE = path.join(TRAKE_DATA_DIR, 'cuota.json');
const CUOTA_CLOUD_ID = 'traketeros_data/cuota';

let cuotaPeople = [...CUOTA_NOMBRES_INICIALES]; // la lista se puede cambiar desde el admin
let cuotaData = {}; // nombre -> { paid: boolean, receipt: boolean }

function cuotaSnapshot() {
  return JSON.stringify({ people: cuotaPeople, status: cuotaData });
}

// Acepta el formato nuevo ({ people, status }) y el antiguo (solo el estado)
function cuotaApply(raw) {
  if (raw && Array.isArray(raw.people)) {
    cuotaPeople = raw.people.map(String);
    cuotaData = raw.status || {};
  } else {
    cuotaPeople = [...CUOTA_NOMBRES_INICIALES];
    cuotaData = raw || {};
  }
}

function cuotaSaveLocal() {
  try {
    fs.mkdirSync(TRAKE_DATA_DIR, { recursive: true });
    fs.writeFileSync(CUOTA_FILE, cuotaSnapshot(), 'utf8');
  } catch (e) {
    console.error('No se pudo guardar la cuota localmente:', e.message || e);
  }
}

async function cuotaSaveCloud() {
  if (!CLOUDINARY_OK) return;
  try {
    const b64 = Buffer.from(cuotaSnapshot()).toString('base64');
    await cloudinary.uploader.upload(`data:application/json;base64,${b64}`, {
      resource_type: 'raw',
      public_id: CUOTA_CLOUD_ID,
      overwrite: true,
      invalidate: true
    });
  } catch (e) {
    console.error('No se pudo respaldar la cuota en Cloudinary:', e.message || e);
  }
}

function cuotaSave() {
  cuotaSaveLocal();
  cuotaSaveCloud();
}

async function cuotaLoad() {
  if (CLOUDINARY_OK) {
    try {
      const info = await cloudinary.api.resource(CUOTA_CLOUD_ID, { resource_type: 'raw' });
      const resp = await fetch(info.secure_url, { cache: 'no-store' });
      if (resp.ok) {
        cuotaApply(await resp.json());
        console.log('Cuota: datos cargados desde Cloudinary.');
        return;
      }
    } catch (e) {
      console.warn('Cuota: no se pudo cargar el respaldo de Cloudinary (usando plan B):', e.message || e);
    }
  }
  try {
    cuotaApply(JSON.parse(fs.readFileSync(CUOTA_FILE, 'utf8')));
  } catch {
    cuotaApply(null);
  }
}

cuotaLoad();

function cuotaList() {
  return cuotaPeople.map((name) => ({
    name,
    paid: Boolean(cuotaData[name]?.paid),
    receipt: Boolean(cuotaData[name]?.receipt)
  }));
}

// Solo se aceptan los nombres de la lista (evita que se cuelen otros)
function cuotaNombre(req, res) {
  const name = String(req.body?.name || '').trim();
  if (!cuotaPeople.includes(name)) {
    res.status(400).json({ error: 'Ese nombre no está en la lista.' });
    return null;
  }
  return name;
}

function escHtml(s) {
  return String(s).replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
}

// Lista pública
app.get('/api/cuota', (req, res) => {
  res.set('Cache-Control', 'no-store');
  res.json({ people: cuotaList() });
});

// Marcar "He pagado" / "No he pagado"
app.post('/api/cuota/status', (req, res) => {
  const name = cuotaNombre(req, res);
  if (!name) return;

  // Desde la web pública solo se puede marcar "He pagado". Quitarlo lo hace el admin.
  if (req.body?.paid !== true) {
    return res.status(403).json({ error: 'Solo el admin puede quitar un pago.' });
  }
  cuotaData[name] = { paid: true, receipt: Boolean(cuotaData[name]?.receipt) };
  cuotaSave();
  res.json({ ok: true, people: cuotaList() });
});

// Límite sencillo por IP: 10 justificantes por hora
const receiptHits = new Map();
setInterval(() => {
  const limit = Date.now() - 3600_000;
  for (const [ip, times] of receiptHits) {
    const recent = times.filter((t) => t > limit);
    if (recent.length) receiptHits.set(ip, recent);
    else receiptHits.delete(ip);
  }
}, 10 * 60_000).unref();

function receiptLimiter(req, res, next) {
  const now = Date.now();
  const recent = (receiptHits.get(req.ip) || []).filter((t) => now - t < 3600_000);
  if (recent.length >= 10) {
    return res.status(429).json({ error: 'Demasiados intentos seguidos. Prueba otra vez dentro de un rato.' });
  }
  recent.push(now);
  receiptHits.set(req.ip, recent);
  next();
}

const receiptUpload = multer({
  storage: multer.memoryStorage(),
  limits: { fileSize: 15 * 1024 * 1024, files: 1, fields: 5, fieldSize: 200 },
  fileFilter: (req, file, cb) => cb(null, /^image\//i.test(file.mimetype))
});

// Subir el justificante: se reduce la foto y se manda por correo
app.post('/api/cuota/receipt', receiptLimiter, (req, res) => {
  receiptUpload.single('receipt')(req, res, async (err) => {
    if (err) {
      return res.status(400).json({
        error: err.code === 'LIMIT_FILE_SIZE'
          ? 'La foto pesa demasiado (máximo 15 MB).'
          : 'No se ha podido subir la foto.'
      });
    }

    try {
      const name = cuotaNombre(req, res);
      if (!name) return;

      if (!cuotaData[name]?.paid) {
        return res.status(400).json({ error: 'Primero pulsa "He pagado".' });
      }
      if (!req.file) {
        return res.status(400).json({ error: 'No he recibido ninguna imagen.' });
      }
      if (!process.env.RESEND_API_KEY) {
        return res.status(503).json({ error: 'El envío de justificantes todavía no está configurado.' });
      }

      let jpeg;
      try {
        jpeg = await sharp(req.file.buffer, { failOn: 'error' })
          .rotate()
          .flatten({ background: '#ffffff' })
          .resize({ width: 1800, height: 1800, fit: 'inside', withoutEnlargement: true })
          .jpeg({ quality: 85 })
          .toBuffer();
      } catch (e) {
        console.error('Justificante no válido:', e.message);
        return res.status(400).json({ error: 'No he podido leer esa imagen. Prueba con una captura o foto JPG/PNG.' });
      }

      const r = await fetch('https://api.resend.com/emails', {
        method: 'POST',
        headers: {
          Authorization: `Bearer ${process.env.RESEND_API_KEY}`,
          'Content-Type': 'application/json'
        },
        body: JSON.stringify({
          from: CUOTA_EMAIL_FROM,
          to: [CUOTA_EMAIL_TO],
          subject: `${name} ha pagado su cuota mensual`,
          html: `<p><b>${escHtml(name)}</b> ha pagado su cuota mensual. Justificante adjunto.</p>`,
          attachments: [
            { filename: `justificante-${name.toLowerCase().normalize('NFD').replace(/[\u0300-\u036f]/g, '').replace(/[^a-z0-9]+/g, '-')}.jpg`, content: jpeg.toString('base64') }
          ]
        })
      });

      if (!r.ok) {
        const raw = await r.text().catch(() => '');
        console.error('Resend error:', r.status, raw);
        let detail = '';
        try { detail = JSON.parse(raw).message || ''; } catch {}
        return res.status(502).json({
          error: 'No se ha podido enviar el correo.' + (detail ? ` Resend dice (${r.status}): ${detail}` : ` (código ${r.status})`)
        });
      }

      cuotaData[name] = { paid: true, receipt: true };
      cuotaSave();
      res.json({ ok: true, people: cuotaList() });
    } catch (e) {
      console.error('Error enviando justificante:', e);
      res.status(500).json({ error: 'Ha habido un error en el servidor. Inténtalo otra vez.' });
    }
  });
});

// ADMIN: ver el estado (sirve para que el navegador pida usuario y clave)
app.get('/api/admin/cuota', adminAuth, (req, res) => {
  res.set('Cache-Control', 'no-store');
  res.json({ people: cuotaList() });
});

// ADMIN: marcar a una persona como pagado / no pagado
app.post('/api/admin/cuota/status', adminAuth, (req, res) => {
  const name = String(req.body?.name || '');
  if (!cuotaPeople.includes(name)) return res.status(400).json({ error: 'Ese nombre no está en la lista.' });
  const paid = req.body?.paid === true;
  cuotaData[name] = { paid, receipt: paid ? Boolean(cuotaData[name]?.receipt) : false };
  cuotaSave();
  res.json({ ok: true, people: cuotaList() });
});

// ADMIN: reiniciar a todos, o solo a uno si viene "name"
app.post('/api/admin/cuota/reset', adminAuth, (req, res) => {
  const name = req.body?.name;
  if (name !== undefined) {
    if (!cuotaPeople.includes(name)) return res.status(400).json({ error: 'Ese nombre no está en la lista.' });
    delete cuotaData[name];
  } else {
    cuotaData = {};
  }
  cuotaSave();
  res.json({ ok: true, people: cuotaList() });
});

// ADMIN: quitar a una persona de la lista
app.post('/api/admin/cuota/remove', adminAuth, (req, res) => {
  const name = String(req.body?.name || '');
  if (!cuotaPeople.includes(name)) return res.status(400).json({ error: 'Ese nombre no está en la lista.' });
  cuotaPeople = cuotaPeople.filter((n) => n !== name);
  delete cuotaData[name];
  cuotaSave();
  res.json({ ok: true, people: cuotaList() });
});

// ADMIN: añadir a una persona a la lista (por si quitas a alguien sin querer)
app.post('/api/admin/cuota/add', adminAuth, (req, res) => {
  const name = String(req.body?.name || '').replace(/[\u0000-\u001f]/g, '').replace(/\s+/g, ' ').trim().slice(0, 30);
  if (!name) return res.status(400).json({ error: 'Falta el nombre.' });
  if (cuotaPeople.some((n) => n.toLowerCase() === name.toLowerCase())) {
    return res.status(409).json({ error: 'Ya está en la lista.' });
  }
  if (cuotaPeople.length >= 60) return res.status(400).json({ error: 'La lista está llena.' });
  cuotaPeople.push(name);
  cuotaSave();
  res.json({ ok: true, people: cuotaList() });
});


// =========================
// ESTATUTOS (privado con contraseña) + SUGERENCIAS
// =========================
//
// El PDF vive en /private (fuera de public/), así que solo se sirve si hay una
// cookie de sesión válida, que se consigue con la contraseña. Las sugerencias
// se guardan igual que el resto: memoria + fichero local + respaldo en
// Cloudinary. Desde /admin-estatutos.html puedes descargar todo en un JSON y
// volver a importarlo después de un deploy.
//
// Variables de entorno (opcionales):
//   (la contraseña de los estatutos está fija en el código: Estraketeros26)
//   ESTATUTOS_SECRET    clave para firmar la sesión (por defecto sale de ADMIN_PASSWORD)

const ESTATUTOS_PDF = path.join(__dirname, 'private', 'estatutos.pdf');
const ESTATUTOS_FILE = path.join(TRAKE_DATA_DIR, 'estatutos_sugerencias.json');
const ESTATUTOS_CLOUD_ID = 'traketeros_data/estatutos_sugerencias';
const ESTATUTOS_COOKIE = 'trk_estatutos';
const ESTATUTOS_SESION_MS = 7 * 24 * 60 * 60 * 1000;
const ESTATUTOS_MAX_SUG = 1000;
const ESTATUTOS_MAX_TEXTO = 1500;

// Contraseña fija (ya no depende de ninguna variable de entorno de Render).
// Se aceptan las dos variantes por si la "?" no era parte de la contraseña.
const ESTATUTOS_PASSWORDS = ['Estraketeros26', 'Estraketeros26?'];

const sha = (v) => crypto.createHash('sha256').update(String(v)).digest();
function estatutosPasswordOk(pw) {
  const h = sha(pw);
  let ok = false;
  for (const good of ESTATUTOS_PASSWORDS) {
    if (crypto.timingSafeEqual(h, sha(good))) ok = true;
  }
  return ok;
}

const ESTATUTOS_SECRET = process.env.ESTATUTOS_SECRET || ('estatutos|' + (process.env.ADMIN_PASSWORD || 'traketeros'));
const estatutosFirma = (exp) => crypto.createHmac('sha256', ESTATUTOS_SECRET).update(String(exp)).digest('hex');

function estatutosToken() {
  const exp = Date.now() + ESTATUTOS_SESION_MS;
  return exp + '.' + estatutosFirma(exp);
}

function estatutosCookie(req) {
  const m = (req.headers.cookie || '').split(';').map((c) => c.trim()).find((c) => c.startsWith(ESTATUTOS_COOKIE + '='));
  return m ? decodeURIComponent(m.slice(ESTATUTOS_COOKIE.length + 1)) : '';
}

function estatutosAuth(req, res, next) {
  const [exp, sig] = estatutosCookie(req).split('.');
  const good = exp && sig && Number(exp) > Date.now() && sig.length === 64 &&
    crypto.timingSafeEqual(Buffer.from(sig), Buffer.from(estatutosFirma(exp)));
  if (!good) return res.status(401).json({ error: 'Hace falta la contraseña.' });
  next();
}

// ---------- Almacenamiento de sugerencias ----------
let estatutosSug = []; // [{ id, name, text, date (ISO) }]

function estatutosLimpiar(list) {
  if (!Array.isArray(list)) return [];
  return list
    .filter((x) => x && typeof x.text === 'string' && x.text.trim())
    .map((x) => ({
      id: String(x.id || crypto.randomUUID()).slice(0, 64),
      name: String(x.name || '').replace(/[\u0000-\u001f]/g, ' ').replace(/\s+/g, ' ').trim().slice(0, 40),
      text: String(x.text).replace(/\r/g, '').trim().slice(0, ESTATUTOS_MAX_TEXTO),
      date: isNaN(Date.parse(x.date)) ? new Date().toISOString() : new Date(x.date).toISOString()
    }));
}

function estatutosSnapshot() {
  return JSON.stringify({ version: 1, exportedAt: new Date().toISOString(), suggestions: estatutosSug });
}

function estatutosSaveLocal() {
  try {
    fs.mkdirSync(TRAKE_DATA_DIR, { recursive: true });
    fs.writeFileSync(ESTATUTOS_FILE, estatutosSnapshot(), 'utf8');
  } catch (e) {
    console.error('No se pudieron guardar las sugerencias localmente:', e.message || e);
  }
}

async function estatutosSaveCloud() {
  if (!CLOUDINARY_OK) return;
  try {
    const b64 = Buffer.from(estatutosSnapshot()).toString('base64');
    await cloudinary.uploader.upload(`data:application/json;base64,${b64}`, {
      resource_type: 'raw',
      public_id: ESTATUTOS_CLOUD_ID,
      overwrite: true,
      invalidate: true
    });
  } catch (e) {
    console.error('No se pudieron respaldar las sugerencias en Cloudinary:', e.message || e);
  }
}

function estatutosSave() {
  estatutosSaveLocal();
  estatutosSaveCloud();
}

async function estatutosLoad() {
  if (CLOUDINARY_OK) {
    try {
      const info = await cloudinary.api.resource(ESTATUTOS_CLOUD_ID, { resource_type: 'raw' });
      const resp = await fetch(info.secure_url, { cache: 'no-store' });
      if (resp.ok) {
        const j = await resp.json();
        estatutosSug = estatutosLimpiar(j.suggestions);
        console.log('Estatutos: sugerencias cargadas desde Cloudinary.');
        return;
      }
    } catch (e) {
      console.warn('Estatutos: no se pudo cargar el respaldo de Cloudinary (usando plan B):', e.message || e);
    }
  }
  try {
    estatutosSug = estatutosLimpiar(JSON.parse(fs.readFileSync(ESTATUTOS_FILE, 'utf8')).suggestions);
  } catch {
    estatutosSug = [];
  }
}

estatutosLoad();

// ---------- Límite de intentos (en memoria, por IP) ----------
function estatutosLimiter(max, windowMs, msg) {
  const hits = new Map();
  return (req, res, next) => {
    const now = Date.now();
    const arr = (hits.get(req.ip) || []).filter((t) => now - t < windowMs);
    if (arr.length >= max) return res.status(429).json({ error: msg });
    arr.push(now);
    hits.set(req.ip, arr);
    if (hits.size > 2000) for (const [k, v] of hits) if (!v.some((t) => now - t < windowMs)) hits.delete(k);
    next();
  };
}
const estatutosLoginLimit = estatutosLimiter(8, 10 * 60 * 1000, 'Demasiados intentos. Prueba dentro de un rato.');
const estatutosSendLimit = estatutosLimiter(10, 10 * 60 * 1000, 'Has mandado muchas sugerencias seguidas. Prueba dentro de un rato.');

// ---------- Rutas públicas (con contraseña) ----------
app.post('/api/estatutos/login', estatutosLoginLimit, (req, res) => {
  const pw = String(req.body?.password ?? '').slice(0, 200);
  if (!estatutosPasswordOk(pw)) return res.status(401).json({ error: 'Contraseña incorrecta.' });
  const secure = req.secure ? '; Secure' : '';
  res.set('Set-Cookie',
    `${ESTATUTOS_COOKIE}=${encodeURIComponent(estatutosToken())}; Path=/; HttpOnly; SameSite=Lax; Max-Age=${ESTATUTOS_SESION_MS / 1000}${secure}`);
  res.json({ ok: true });
});

app.post('/api/estatutos/logout', (req, res) => {
  res.set('Set-Cookie', `${ESTATUTOS_COOKIE}=; Path=/; HttpOnly; SameSite=Lax; Max-Age=0`);
  res.json({ ok: true });
});

app.get('/api/estatutos/session', estatutosAuth, (req, res) => {
  res.set('Cache-Control', 'no-store');
  res.json({ ok: true });
});

app.get('/api/estatutos/pdf', estatutosAuth, (req, res) => {
  res.set('Cache-Control', 'private, no-store');
  res.set('Content-Type', 'application/pdf');
  res.set('Content-Disposition', (req.query.download ? 'attachment' : 'inline') + '; filename="Estatutos-Traketeros.pdf"');
  res.sendFile(ESTATUTOS_PDF, (err) => {
    if (err && !res.headersSent) res.status(404).json({ error: 'No se encuentra el documento.' });
  });
});

app.get('/api/estatutos/sugerencias', estatutosAuth, (req, res) => {
  res.set('Cache-Control', 'no-store');
  res.json({ suggestions: [...estatutosSug].sort((a, b) => b.date.localeCompare(a.date)) });
});

app.post('/api/estatutos/sugerencias', estatutosAuth, estatutosSendLimit, (req, res) => {
  const text = String(req.body?.text ?? '').replace(/\r/g, '').trim();
  if (!text) return res.status(400).json({ error: 'Escribe tu sugerencia.' });
  if (text.length > ESTATUTOS_MAX_TEXTO) return res.status(400).json({ error: `Máximo ${ESTATUTOS_MAX_TEXTO} caracteres.` });
  if (estatutosSug.length >= ESTATUTOS_MAX_SUG) return res.status(409).json({ error: 'Ya hay demasiadas sugerencias.' });
  const [nueva] = estatutosLimpiar([{ id: crypto.randomUUID(), name: req.body?.name, text, date: new Date().toISOString() }]);
  estatutosSug.push(nueva);
  estatutosSave();
  res.json({ ok: true, suggestion: nueva });
});

// ---------- Admin ----------
app.get('/api/admin/estatutos', adminAuth, (req, res) => {
  res.set('Cache-Control', 'no-store');
  res.json({ suggestions: [...estatutosSug].sort((a, b) => b.date.localeCompare(a.date)) });
});

// Descarga todo en un JSON
app.get('/api/admin/estatutos/export', adminAuth, (req, res) => {
  const dia = new Date().toISOString().slice(0, 10);
  res.set('Cache-Control', 'no-store');
  res.set('Content-Type', 'application/json; charset=utf-8');
  res.set('Content-Disposition', `attachment; filename="sugerencias-estatutos-${dia}.json"`);
  res.send(JSON.stringify({ version: 1, exportedAt: new Date().toISOString(), suggestions: estatutosSug }, null, 2));
});

// Importa un JSON exportado antes. mode "merge" (por defecto) añade las que no
// existan ya; mode "replace" sustituye todo por lo importado.
app.post('/api/admin/estatutos/import', adminAuth, (req, res) => {
  const body = req.body || {};
  const incoming = estatutosLimpiar(Array.isArray(body) ? body : (body.data?.suggestions ?? body.data ?? body.suggestions));
  if (!incoming.length) return res.status(400).json({ error: 'El JSON no tiene ninguna sugerencia válida.' });
  if (body.mode === 'replace') {
    estatutosSug = incoming.slice(0, ESTATUTOS_MAX_SUG);
  } else {
    const ids = new Set(estatutosSug.map((x) => x.id));
    for (const x of incoming) if (!ids.has(x.id) && estatutosSug.length < ESTATUTOS_MAX_SUG) estatutosSug.push(x);
  }
  estatutosSave();
  res.json({ ok: true, total: estatutosSug.length, imported: incoming.length });
});

app.delete('/api/admin/estatutos/:id', adminAuth, (req, res) => {
  const antes = estatutosSug.length;
  estatutosSug = estatutosSug.filter((x) => x.id !== req.params.id);
  if (estatutosSug.length === antes) return res.status(404).json({ error: 'No existe esa sugerencia.' });
  estatutosSave();
  res.json({ ok: true, total: estatutosSug.length });
});

// =========================
// SERVIDOR
// =========================

const PORT = process.env.PORT || 3000;

app.listen(PORT, () => {
  console.log(
    `TRAKETEROS funcionando en el puerto ${PORT}`
  );
  startKeepAlive();
});

// =========================
// KEEP-ALIVE (evita que Render free se duerma)
// =========================
// Render free duerme el servicio tras ~15 min sin peticiones HTTP entrantes.
// Hacemos un ping a nuestra propia URL pública cada 10 min para que cuente
// como tráfico entrante. Render rellena RENDER_EXTERNAL_URL automáticamente;
// también se puede forzar con KEEP_ALIVE_URL. En local no hace nada.
function startKeepAlive() {
  const base = process.env.KEEP_ALIVE_URL || process.env.RENDER_EXTERNAL_URL;
  if (!base) return;
  const url = base.replace(/\/+$/, '') + '/health';
  const everyMs = 10 * 60 * 1000;

  const ping = async () => {
    try {
      const r = await fetch(url, { cache: 'no-store', signal: AbortSignal.timeout(20000) });
      console.log(`[keep-alive] ${url} -> ${r.status}`);
    } catch (e) {
      console.warn('[keep-alive] fallo:', e.message || e);
    }
  };

  setInterval(ping, everyMs).unref();
  console.log(`[keep-alive] activo, ping cada 10 min a ${url}`);
}
