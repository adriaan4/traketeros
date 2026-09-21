import 'dotenv/config';
import express from 'express';
import Stripe from 'stripe';
import path from 'path';
import { fileURLToPath } from 'url';

const app = express();

const stripe = new Stripe(process.env.STRIPE_SECRET_KEY);

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

    console.log('Dominio:', domain);
    console.log('Price ID:', process.env.STRIPE_PRICE_ID);

    const session = await stripe.checkout.sessions.create({
      mode: 'subscription',

      line_items: [
        {
          price: process.env.STRIPE_PRICE_ID,
          quantity: 1
        }
      ],

      payment_method_types: ['card'],

      billing_address_collection: 'auto',

      allow_promotion_codes: true,

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
// SERVIDOR
// =========================

const PORT = process.env.PORT || 3000;

app.listen(PORT, () => {
  console.log(
    `TRAKETEROS funcionando en el puerto ${PORT}`
  );
});
