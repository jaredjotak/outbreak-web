# OUTBREAK — Preparado para desplegar en Render (PRUEBA)

## Publicar

1. Crea un repositorio PRIVADO llamado `outbreak-web` en GitHub.
2. Descomprime este ZIP y sube todos los archivos y carpetas al nivel raíz del repositorio. Incluye `public/`, `server.js`, `package.json` y `render.yaml`. No subas ningún archivo `.env` real.
3. En https://dashboard.render.com entra a **New > Blueprint** y conecta ese repositorio.
4. Confirma que el servicio `outbreak-l4d2` usa plan **Free** y aplica el blueprint.
5. Render generará la variable secreta `SESSION_SECRET`. La URL pública se detecta automáticamente mediante `RENDER_EXTERNAL_URL`.
6. Cuando aparezca **Live**, abre la dirección `https://...onrender.com` que Render te muestre.
7. Prueba la portada, el podio y el botón `Iniciar sesión con Steam`. Comprueba que, tras autenticarte en Steam, puedas abrir `Mi perfil`.

Alternativa: crea **New > Web Service** y configura `npm install` como Build Command, `npm start` como Start Command y las variables `NODE_ENV=production` y `SESSION_SECRET` (secreto aleatorio, 32 caracteres como mínimo).

## Limitación crítica del plan gratis

La edición actual usa SQLite local y almacena imágenes en el disco del servidor. Render Free NO conserva los archivos al reiniciar, dormir o desplegar nuevamente. Las sesiones, perfiles y fondos subidos se perderán. Por eso **esta versión solo sirve para pruebas**, NO para jugadores reales ni pagos. Antes de ofrecerla a la comunidad debes integrar una base de datos duradera y almacenamiento persistente externo, además de medidas contra abuso.

El ranking y la información del servidor son de demostración, no datos reales de SourceMod/GameTracker.
Los cobros VIP no están activados ni pueden verificarse con esta versión.

## Configuración de Steam

Steam OpenID usa el dominio público `*.onrender.com` de forma automática. No requiere compartir tu contraseña de Steam ni tu token de Discord.
`STEAM_API_KEY` es opcional y solo se usa para mostrar nombre/avatar públicos.
El callback es: `https://TU-SERVICIO.onrender.com/auth/steam/callback`.

## Archivos

- `server.js`: backend Express y autenticación Steam OpenID.
- `public/index.html`: web OUTBREAK con podio TOP 5 y perfiles.
- `public/assets`: logo y Warcelona.
- `render.yaml`: especificación de Render Free.
- `.env.example`: configuración local (NO subir un `.env` con secretos).

No publiques datos de pago reales hasta integrar almacenamiento duradero, validación y un flujo seguro de revisión.
