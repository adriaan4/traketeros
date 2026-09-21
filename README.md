# Traketeros

Web de la cuota de la peña (8 €/mes con Stripe Checkout) + panel de admin.

## Estructura
- `server.js` → servidor Express. **Solo sirve lo que hay dentro de `public/`.**
- `public/` → la web: `index.html`, `success.html`, `admin.html`, `styles.css` (uno solo para las 3), `app.js`, `admin.js`, `assets/`.

## Variables de entorno (Render → Environment)
`STRIPE_SECRET_KEY`, `STRIPE_PRICE_ID`, `STRIPE_WEBHOOK_SECRET`, `ADMIN_USER`, `ADMIN_PASSWORD`.
Nunca subas el archivo `.env` a GitHub.

## En local
```
npm install
cp .env.example .env    # y rellénalo
npm start               # http://localhost:3000
```

## Regla de oro
Todo cambio de diseño se hace en `public/`. Lo que esté fuera de `public/` no se ve en la web.
Cuando cambies `styles.css` o `app.js`, sube el número de `?v=3` en los HTML para saltarte la caché.
