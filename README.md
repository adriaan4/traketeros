# Traketeros

Web de la cuota de la peña (8 €/mes con Stripe Checkout) + panel de admin.

## Estructura
- `server.js` → servidor Express. **Solo sirve lo que hay dentro de `public/`.**
- `public/` → la web: `index.html`, `success.html`, `admin.html`, `fotos.html`, `styles.css` (uno solo para todas), `app.js`, `admin.js`, `fotos.js`, `assets/`.

## Variables de entorno (Render → Environment)
`STRIPE_SECRET_KEY`, `STRIPE_PRICE_ID`, `STRIPE_WEBHOOK_SECRET`, `ADMIN_USER`, `ADMIN_PASSWORD`.
Fotos: `CLOUDINARY_URL` (obligatoria para el álbum), y opcionales `UPLOAD_CODE`, `MAX_PHOTOS` (mira `.env.example`).
Nunca subas el archivo `.env` a GitHub.

## En local
```
npm install
cp .env.example .env    # y rellénalo
npm start               # http://localhost:3000
```

## Fotos de la peña (`/fotos.html`)
Cualquiera puede subir fotos y verlas en el álbum. Las fotos **se guardan en Cloudinary** (gratis),
no en Render, así que no se pierden cuando el servidor se reinicia o se duerme.
Antes de guardarlas se reducen y se les borra la **ubicación GPS** del móvil.

### Poner Cloudinary en marcha (una sola vez)
1. Crea una cuenta gratis en https://cloudinary.com (sin tarjeta).
2. En el Dashboard → **Go to API Keys** → copia el valor de **API environment variable**.
   Es algo como `CLOUDINARY_URL=cloudinary://123456:abcDEF@minube`.
3. En Render → tu servicio → **Environment** → **Add Environment Variable**:
   - *Key*: `CLOUDINARY_URL`
   - *Value*: solo lo que va **después** del `=`, o sea `cloudinary://123456:abcDEF@minube`
4. Guarda. Render se redespliega solo. Si no la pones, `/fotos.html` dice que el álbum no está configurado.

### Otras cosas
- **Código para subir (recomendado):** pon la variable `UPLOAD_CODE` en Render y solo podrá subir quien lo sepa.
- **Borrar una foto:** abre `/fotos.html?admin=1`, pulsa la foto y "Borrar" (pide usuario y clave de admin).
  También puedes borrarlas desde tu panel de Cloudinary (Media Library); la web lo nota en unos 5 minutos.
- **Límites gratis de Cloudinary:** 25 créditos al mes, y 1 crédito = 1 GB de espacio, o 1 GB de descargas,
  o 1.000 transformaciones (cada miniatura cuenta una vez). Para una peña sobra. Puedes mirar el gasto en su panel.
- Las fotos llevan la etiqueta `traketeros`; solo las que tengan esa etiqueta salen en el álbum.

## Regla de oro
Todo cambio de diseño se hace en `public/`. Lo que esté fuera de `public/` no se ve en la web.
Cuando cambies `styles.css` o `app.js`, sube el número de `?v=4` en los HTML para saltarte la caché.
