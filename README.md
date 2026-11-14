# OUTBREAK v11 — Podio TOP 5 + Perfiles Steam

## Qué funciona
- Podio TOP 5 con cinco alturas ordinales: 1.º más alto, después 2.º, 3.º, 4.º y 5.º.
- Cambia automáticamente entre el ranking GENERAL y COMPETITIVO. **Todos los puntos y jugadores de la demo son ficticios**: no existe conexión con SourceMod todavía.
- Perfiles de usuario editables **solo** tras autenticarse con Steam OpenID 2.0.
- El servidor comprueba ante Steam el resultado del inicio de sesión; no acepta SteamID escritos manualmente como prueba de identidad.
- Cada usuario puede configurar su insignia, icono y fondo predefinido o subir su propio fondo JPG, PNG o WEBP de hasta 4 MB.
- Las insignias decorativas no son rangos ni privilegios. El rango real requiere conexión a SourceMod.
- Las visitas anónimas pueden ver el podio, la página y el perfil de ejemplo, pero no cambiar un perfil.

## Cómo ejecutar con Steam real
1. Instala **Node.js 20 o superior** en tu hosting o PC y ejecuta `npm install` en la carpeta del proyecto.
2. Copia `.env.example` a `.env` y genera un `SESSION_SECRET` aleatorio de al menos 32 caracteres; no publiques este secreto.
3. En pruebas, `BASE_URL=http://localhost:3000` y ejecuta `npm start`. Abre `http://localhost:3000/`.
4. Para un dominio público, configura `BASE_URL=https://tu-dominio.com` (sin barra final), `NODE_ENV=production` y HTTPS en el proxy/hosting. Los callbacks de Steam deben usar exactamente ese mismo dominio.
5. La clave `STEAM_API_KEY` es opcional; si la configuras en el servidor podrás mostrar nombre y avatar públicos de Steam. No la incluyas en HTML/JS públicos.
6. Los datos se guardan en `data/outbreak.sqlite`. Conserva esa carpeta entre despliegues y respalda los datos.

## Qué NO hace todavía
- No está desplegado ni conectado a una cuenta Steam real; necesita un hosting que ejecute Node.js. Un HTML estático o Netlify Drop **no basta** para iniciar sesión con Steam ni para guardar fondos de forma segura.
- No integra el ranking real de SourceMod, ni pagos VIP, ni verificación del servidor L4D2.
- Los perfiles públicos se pueden consultar mediante `/api/profiles/STEAMID64` cuando ese SteamID haya iniciado sesión.

## Seguridad
- No guardes contraseñas de Steam; el usuario inicia sesión en steamcommunity.com.
- El servidor valida la respuesta firmada con Steam, un estado de sesión, su URL de vuelta y un nonce de un solo uso.
- Las sesiones se guardan en SQLite con cookie HttpOnly y Secure bajo HTTPS; los cambios de perfil exigen sesión y token CSRF.
- Los archivos se procesan como imagen con Sharp y se convierten a WebP en el servidor. Por privacidad, los fondos subidos se vuelven públicos cuando se muestra el perfil.
- Antes de abrir el sitio a tráfico público, añade limitación distribuida de solicitudes, moderación de imágenes, política de privacidad y backups periódicos.

## Diseño
El HTML independiente `OUTBREAK_v11_podio_steam_preview.html` permite ver el diseño y el TOP 5 **sin servidor**. En esa vista previa, la edición de perfil permanece cerrada correctamente.
