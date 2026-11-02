# Traketeros

Web de la peña Traketeros: fotos, traketímetro, TKT365, juegos, playlist y panel de admin.

## Estructura
- `server.js` → servidor Express. **Solo sirve lo que hay dentro de `public/`.**
- `public/` → la web: `index.html`, `admin.html`, `fotos.html`, `styles.css` (uno solo para todas), `fotos.js`, `assets/`.

## Variables de entorno (Render → Environment)
`ADMIN_USER`, `ADMIN_PASSWORD`.
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

## 🎧 Playlist TKT (TIDAL) — `/playlist.html`
Busca canciones en TIDAL y las añade a la playlist compartida (id en `TIDAL_PLAYLIST_ID`, por defecto la de la peña).
Guarda quién añadió cada canción y el admin puede quitarlas (`/playlist.html?admin=1`, también en el panel).
Usa la **API oficial de TIDAL** (OAuth 2.0 Authorization Code + PKCE). Los tokens nunca llegan al navegador.

### Puesta en marcha (una sola vez)
1. En https://developer.tidal.com crea una app. Copia el **Client ID** (y el **Client Secret**, recomendado: permite buscar sin depender de la sesión de nadie).
2. En la app, añade como **Redirect URI** exactamente: `https://TU-DOMINIO/api/tidal/callback`
   (en `/playlist.html?admin=1` se muestra la URL exacta que espera el servidor).
3. Variables de entorno en Render (nunca en el código ni en GitHub):
   - `TIDAL_CLIENT_ID` (obligatoria) y `TIDAL_CLIENT_SECRET` (recomendada)
   - `TIDAL_TOKEN_KEY`: clave aleatoria de **32 caracteres o más** con la que se cifran los tokens (ej. `openssl rand -base64 48`). Si la cambias, hay que reconectar.
   - Opcionales: `PUBLIC_URL` (https://tu-dominio, para construir la Redirect URI), `TIDAL_REDIRECT_URI`, `TIDAL_PLAYLIST_ID`, `TIDAL_COUNTRY` (por defecto `ES`), `TIDAL_SCOPES` (por defecto `playlists.read playlists.write`).
4. Abre `/playlist.html?admin=1` (o el panel), pulsa **Conectar con TIDAL** e inicia sesión con la cuenta **dueña de la playlist** (o colaboradora con permiso de edición).

### Seguridad
- Tokens cifrados con AES-256-GCM (`data/tidal_tokens.json` + copia en Cloudinary); se renuevan solos. «Desconectar» los borra de los dos sitios.
- El navegador solo manda `{ nombre, id de canción }`; el servidor valida todo, limita peticiones y evita duplicados.
- Quitar canciones exige usuario y clave de admin.

## Regla de oro
Todo cambio de diseño se hace en `public/`. Lo que esté fuera de `public/` no se ve en la web.
Cuando cambies `styles.css`, sube el número de `?v=4` en los HTML para saltarte la caché.

### Nombre al añadir una canción
En `/playlist.html` el nombre ya no se escribe: se elige de una lista con los nombres del **Traketímetro** y de **TKT365** (incluida la gente que solo apuesta). El servidor lo vuelve a comprobar, así que no se puede colar otro nombre.

### 🔔 Avisos al admin cuando alguien añade una canción
Notificaciones push del navegador (las de Google/Chrome en Android y escritorio; también Safari en iPhone si la web está añadida a la pantalla de inicio). No necesita ninguna dependencia nueva.
1. En tu ordenador: `node generar-vapid.js` y copia las dos líneas a Render → Environment: `VAPID_PUBLIC_KEY`, `VAPID_PRIVATE_KEY` (opcional: `VAPID_SUBJECT=mailto:tu@correo`).
2. Abre `/playlist.html?admin=1` (entra con usuario y clave de admin), pulsa **🔔 Avisarme en este dispositivo** y acepta el permiso. Con **Probar aviso** compruebas que llega.
3. Repite en cada dispositivo donde quieras recibirlos (máximo 10). Solo se pueden registrar dispositivos pasando por el login de admin.
