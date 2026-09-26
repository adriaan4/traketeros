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

  const u = raw.slice(0, i);
  const p = raw.slice(i + 1);

  if (
    u !== process.env.ADMIN_USER ||
    p !== process.env.ADMIN_PASSWORD
  ) {
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

          const nameEntry = [...(info.added || []), ...(info.updated || [])]
            .find((e) => e.name === 'name');
          if (nameEntry) {
            p.name = String(nameEntry.value || '').slice(0, 40);
            changed = true;
          } else if ((info.removed || []).some((e) => e.name === 'name')) {
            p.name = '';
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
app.use(express.json());

// Archivos de la web
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

function toPhoto(r) {
  if (!r.public_id?.startsWith(PREFIX)) return null;
  const id = r.public_id.slice(PREFIX.length);
  if (!ID_RE.test(id)) return null;
  const name = r.context?.custom?.name ?? r.context?.name ?? '';
  return {
    id,
    publicId: r.public_id,
    version: r.version,
    name: String(name),
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

      // Cloudinary usa "|" y "=" para separar datos: se quitan del nombre
      const name = String(req.body?.name || '').replace(/[|=\\]/g, '').replace(/\s+/g, ' ').trim().slice(0, 40);
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
          if (name) options.context = { name };

          const r = await sendToCloudinary(jpeg, options);
          photoIndex.unshift({
            id,
            publicId: r.public_id,
            version: r.version,
            name,
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

// Cambiar (o quitar) el nombre de una foto ya subida (solo admin)
app.patch('/api/admin/photos/:id/name', adminAuth, photosOnly, async (req, res) => {
  const { id } = req.params;
  if (!ID_RE.test(id)) return res.status(400).json({ error: 'Id no válido' });

  // Igual que al subir: fuera '|' y '=' (Cloudinary los usa para separar el context)
  const name = String(req.body?.name || '').replace(/[|=\\]/g, '').replace(/\s+/g, ' ').trim().slice(0, 40);

  try {
    await cloudinary.api.update(PREFIX + id, {
      resource_type: 'image',
      type: 'upload',
      // La API de administración de Cloudinary espera el contexto como texto
      // "clave=valor", no como objeto (el nombre ya viene sin '|' ni '=').
      context: `name=${name}`
    });
    const p = photoIndex.find((x) => x.id === id);
    if (p) p.name = name;
    broadcastPhotosChanged();
    res.json({ ok: true, name });
  } catch (e) {
    console.error('No se pudo cambiar el nombre:', e.message || e);
    res.status(500).json({ error: 'No se pudo cambiar el nombre.' });
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
// TRAKETÍMETRO (marcador de cervezas, cubatas, chupitos y porros)
// =========================
// Se guarda en memoria, en un fichero local (data/traketimetro.json) como
// caché rápida, y además se respalda en Cloudinary (como archivo "raw") cada
// vez que cambia algo. En Render el disco es "efímero": el fichero local se
// puede perder en un redeploy o al dormirse el servicio. Cloudinary sí es
// persistente de verdad, así que al arrancar el servidor intentamos cargar
// primero desde ahí; el fichero local es solo un plan B si Cloudinary no
// está configurado o falla justo en ese momento.

const TRAKE_TIPOS = ['cervezas', 'cubatas', 'chupitos', 'porros'];
const TRAKE_DATA_DIR = path.join(__dirname, 'data');
const TRAKE_FILE = path.join(TRAKE_DATA_DIR, 'traketimetro.json');
const TRAKE_CLOUD_ID = 'traketeros_data/traketimetro'; // public_id del respaldo en Cloudinary

let trakeData = {}; // key = nombre en minúsculas -> { name, cervezas, cubatas, chupitos, porros, token }

function trakeLoadLocal() {
  try {
    const raw = fs.readFileSync(TRAKE_FILE, 'utf8');
    trakeData = JSON.parse(raw) || {};
  } catch {
    trakeData = {};
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
function trakeSave() {
  trakeSaveLocal();
  trakeSaveCloud();
}

// Intenta cargar el respaldo desde Cloudinary; si no hay o falla, usa el
// fichero local como plan B.
async function trakeLoad() {
  if (CLOUDINARY_OK) {
    try {
      const info = await cloudinary.api.resource(TRAKE_CLOUD_ID, { resource_type: 'raw' });
      const resp = await fetch(info.secure_url, { cache: 'no-store' });
      if (resp.ok) {
        trakeData = await resp.json();
        console.log('Traketímetro: datos cargados desde Cloudinary.');
        return;
      }
    } catch (e) {
      console.warn('Traketímetro: no se pudo cargar el respaldo de Cloudinary (usando plan B):', e.message || e);
    }
  }
  trakeLoadLocal();
}

trakeLoad();

function trakeList() {
  return Object.values(trakeData)
    .map((p) => ({
      name: p.name,
      cervezas: p.cervezas || 0,
      cubatas: p.cubatas || 0,
      chupitos: p.chupitos || 0,
      porros: p.porros || 0,
      total: (p.cervezas || 0) + (p.cubatas || 0) + (p.chupitos || 0) + (p.porros || 0)
    }))
    .sort((a, b) => b.total - a.total || a.name.localeCompare(b.name, 'es'));
}

const sseTrakeClients = new Set();

function broadcastTrakeChanged() {
  const msg = `data: ${JSON.stringify({ type: 'trake-changed', people: trakeList() })}\n\n`;
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

// Lista de gente + ranking
app.get('/api/traketimetro', (req, res) => {
  res.set('Cache-Control', 'no-store');
  res.json({ people: trakeList() });
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
    res.status(400).json({ error: 'Tipo no válido.' });
    return null;
  }
  return { name, tipo, cantidad };
}

// Sumar una o varias consumiciones de golpe
app.post('/api/traketimetro/add', (req, res) => {
  const v = trakeValidate(req, res);
  if (!v) return;

  const key = v.name.toLowerCase();
  let esNuevo = false;
  if (!trakeData[key]) {
    // Persona nueva de verdad: le asignamos un token de propiedad y solo se
    // lo devolvemos a quien la crea (más abajo). Así solo ese navegador
    // podrá corregir sus cantidades a mano después (aparte del admin).
    //
    // OJO: a alguien que YA existiera (por ejemplo, gente del ranking de
    // antes de tener este sistema) nunca se le asigna dueño aquí solo por
    // tocarle una casilla — si no, cualquiera podría "adueñarse" de otro con
    // solo darle a un botón de cerveza. Esas personas antiguas sin dueño
    // solo las puede corregir el admin, hasta que se les borre y se
    // vuelvan a apuntar desde cero (con eso sí obtienen un token nuevo).
    trakeData[key] = {
      name: v.name, cervezas: 0, cubatas: 0, chupitos: 0, porros: 0,
      token: crypto.randomBytes(16).toString('hex')
    };
    esNuevo = true;
  }
  trakeData[key][v.tipo] = (trakeData[key][v.tipo] || 0) + v.cantidad;
  trakeSave();
  broadcastTrakeChanged();
  res.json({ ok: true, people: trakeList(), token: esNuevo ? trakeData[key].token : undefined });
});

// Deshacer la última pulsación (por si te equivocas de nombre o de cuadro)
app.post('/api/traketimetro/undo', (req, res) => {
  const v = trakeValidate(req, res);
  if (!v) return;

  const key = v.name.toLowerCase();
  if (trakeData[key]) {
    trakeData[key][v.tipo] = Math.max(0, (trakeData[key][v.tipo] || 0) - v.cantidad);
    trakeSave();
    broadcastTrakeChanged();
  }
  res.json({ ok: true, people: trakeList() });
});

// ¿Puede este request corregir las cantidades de "key"? Sí si trae el token
// de propiedad correcto, o si trae las credenciales de admin (usuario y
// clave). Si no, se responde 401 pidiendo autenticación (el navegador, igual
// que ya hace con el borrado, muestra automáticamente el cuadro de usuario y
// clave del admin).
function trakePuedeEditar(req, res, key) {
  const token = String(req.body?.token || '');
  if (token && trakeData[key]?.token && token === trakeData[key].token) return true;

  const h = req.headers.authorization || '';
  if (h.startsWith('Basic ')) {
    const raw = Buffer.from(h.slice(6), 'base64').toString();
    const i = raw.indexOf(':');
    const u = raw.slice(0, i);
    const p = raw.slice(i + 1);
    if (u === process.env.ADMIN_USER && p === process.env.ADMIN_PASSWORD) return true;
    res.set('WWW-Authenticate', 'Basic realm="Admin"').status(401).json({ error: 'Credenciales incorrectas.' });
    return false;
  }

  res.set('WWW-Authenticate', 'Basic realm="Admin"')
    .status(401)
    .json({ error: 'Solo puedes corregir tus propios datos (o entrar como administrador).' });
  return false;
}

// Corregir las cantidades de una persona a mano (por si se han equivocado)
app.post('/api/traketimetro/set', (req, res) => {
  const name = String(req.body?.name || '').trim().slice(0, 30);
  if (!name) return res.status(400).json({ error: 'Falta el nombre.' });

  const key = name.toLowerCase();
  if (!trakeData[key]) return res.status(404).json({ error: 'Esa persona no existe todavía.' });
  if (!trakePuedeEditar(req, res, key)) return;

  const clamp = (v) => {
    const n = Math.round(Number(v));
    return Number.isFinite(n) && n >= 0 ? Math.min(n, 999) : 0;
  };

  trakeData[key] = {
    ...trakeData[key],
    name: trakeData[key].name || name,
    cervezas: clamp(req.body?.cervezas),
    cubatas: clamp(req.body?.cubatas),
    chupitos: clamp(req.body?.chupitos),
    porros: clamp(req.body?.porros)
  };
  trakeSave();
  broadcastTrakeChanged();
  res.json({ ok: true, people: trakeList() });
});

// Borrar a alguien del ranking por completo (solo admin, desde
// traketimetro.html?admin=1)
app.delete('/api/admin/traketimetro/:name', adminAuth, (req, res) => {
  const name = String(req.params.name || '').trim();
  if (!name) return res.status(400).json({ error: 'Falta el nombre.' });

  const key = name.toLowerCase();
  if (!trakeData[key]) {
    return res.status(404).json({ error: 'No existe esa persona en el ranking.' });
  }

  delete trakeData[key];
  trakeSave();
  broadcastTrakeChanged();
  res.json({ ok: true, people: trakeList() });
});

// =========================
// SERVIDOR
// =========================

const PORT = process.env.PORT || 3000;

app.listen(PORT, () => {
  console.log(
    `TRAKETEROS funcionando en el puerto ${PORT}`
  );
});
