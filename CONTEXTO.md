# Padel Score — Contexto del proyecto

> Documento de recapitulación para retomar el desarrollo. Última actualización: 2026-06-11.

## Qué es

PWA instalable para llevar el marcador de un partido de pádel (inspirada en Scorebot),
controlable desde un smartwatch (Huawei Watch GT 6 del usuario) vía Bluetooth.

- **App en producción:** https://pablogcortez.github.io/padel-score/
- **Repo:** https://github.com/pablogcortez/padel-score (público, rama `main`)
- **Carpeta local:** `C:\Users\pcortez\Documents\Jupyter\padel-app\copia`

## Stack y archivos

Sin frameworks ni dependencias: HTML/CSS/JS vanilla en un solo archivo.

| Archivo | Rol |
|---|---|
| `index.html` | Toda la app: UI, motor de puntuación, PWA, control por reloj |
| `manifest.webmanifest` | Manifest PWA (standalone, es, íconos 192/512) |
| `sw.js` | Service worker, precache + stale-while-revalidate. **Versión actual: `padel-score-v3`** |
| `icon-192.png`, `icon-512.png` | Íconos (pelota teal sobre fondo oscuro) |
| `make-icons.cjs` | Regenera los PNG sin dependencias (PNG crudo + zlib) |
| `test-engine.cjs` | 23 pruebas del motor de puntuación: `node test-engine.cjs` |
| `server.cjs` | Servidor local de prueba: `node server.cjs` → http://localhost:8765 |

## Arquitectura del motor de puntuación (decisión clave)

**Event sourcing**: el partido es `{ cfg, points }` donde `points` es la lista de
puntos ganados (`'A'`/`'B'`). `computeScore(cfg, points)` reproduce toda la lista y
devuelve el estado completo (sets, juegos, puntos, tie-break, saque, ganador).

- **Deshacer = `points.pop()`** y recalcular → siempre exacto, deshacer ilimitado.
- Persistencia en `localStorage` (clave `padel-score-match`); al abrir, si hay
  partido sin terminar, retoma directo.
- Reglas implementadas: 0/15/30/40, punto de oro **o** ventaja (configurable),
  set a 6 con diferencia de 2, tie-break a 6-6 (configurable; a 7 con dif. de 2),
  partido a 1 set o al mejor de 3. Saque alterna por juego; en tie-break 1 saque
  y luego de a 2.

⚠️ **No mover los marcadores del código**: `test-engine.cjs` extrae el motor de
`index.html` cortando desde `const PTS` hasta `// ---------- Persistencia` y
toma el primer bloque `<script>`. Si se reestructura, actualizar el test.

## Control desde el reloj (lo más difícil — aprendizajes de pruebas reales)

El Huawei Watch GT 6 **no puede** correr web/apps propias ni mandar taps al teléfono.
Canal usado: **controles de música Bluetooth (AVRCP) + Media Session API**.

Funcionamiento: al activar "⌚ Reloj", la app reproduce un **WAV silencioso generado
en runtime** (loop) y registra handlers de Media Session. El usuario maneja el
marcador desde la app **Música** del reloj (controles del teléfono).

**Mapeo actual (validado por el usuario en el reloj real):**
- `previoustrack` (⏮) → punto para nosotros (A)
- `nexttrack` (⏭) → punto para ellos (B)
- `play`/`pause` (⏯) → deshacer último punto

El título de la "canción" (MediaMetadata) muestra el marcador en vivo en el reloj:
`"Nosotros 30 - 15 Ellos"` / artista `"Juegos 4-3 · Sets 1-0"` — se actualiza en `render()`.

**Trampas descubiertas (no repetir):**
1. **Chrome ignora audios de < 5 segundos** para la sesión de medios: no crea la
   notificación y el reloj dice "inicia la música en el teléfono". Solución: WAV de 60 s.
2. **El conteo de toques no funciona**: el reloj traduce el doble toque a `nexttrack`
   por sí mismo; nunca llegan dos `pause` separados. Por eso se mapeó por botón.
3. El "mantener apretado" no se transmite por Bluetooth — no usable.
4. En los handlers de `pause` hay que **seguir reproduciendo** (`keep()`) para no
   perder la sesión; también hay listener de `pause` del elemento que la retoma.
5. Diagnóstico clave: si la tarjeta de música "Padel Score" aparece en las
   notificaciones del teléfono, el reloj la va a ver. Si no aparece, el problema es
   la app/Chrome; si aparece y el reloj no la ve, es Huawei Health (activar control
   de música del dispositivo).
6. Riesgo conocido: Spotify u otra app de música abierta puede robarse los controles.

Extras: wake lock (pantalla encendida durante el partido), vibración al sumar punto,
prompt de instalación con `beforeinstallprompt` (botón "📲 Instalar en el teléfono").

## Deploy y actualizaciones

- **GitHub Pages** desde `main` raíz, activado vía API. Deploy automático ~1 min tras `git push`.
- Git en esta máquina: el shell corre como `CUPDOMI/Administrator` pero la carpeta es de
  `pcortez` → ya está agregada la excepción `safe.directory`. Credencial GitHub guardada
  en el Administrador de credenciales de Windows (usuario `pablogcortez`); para usarla
  por API: `printf 'protocol=https\nhost=github.com\n\n' | git credential fill` (en Bash;
  en PowerShell 5.1 el pipe al helper falla).
- **Al cambiar la app: bumpear `CACHE` en `sw.js`** (v3 → v4...) y push. El usuario
  actualiza abriendo la app con internet, cerrándola del todo y reabriéndola (a veces 2 ciclos).
- Reinstalar solo si cambia ícono o nombre.
- Ojo: el `package.json` de la carpeta padre tiene `"type": "module"` → scripts Node
  locales deben ser `.cjs`.

## Historial de decisiones

1. App en archivo único para que funcione hasta por `file://` y sea trivial de hospedar.
2. Netlify Drop anónimo descartado (expira en 1 hora) → GitHub Pages.
3. Mapeo del reloj v1 (conteo de toques en ⏯) descartado tras prueba real → v2 por botones.

## Ideas pendientes / mejoras posibles

- Historial de partidos terminados (lista en localStorage) y estadísticas
  (puntos ganados por pareja, rachas, duración).
- Súper tie-break a 10 como tercer set (formato común en pádel amateur).
- Marcar quién saca dentro de la pareja (4 jugadores) y lados de cancha.
- Sonido/beep de confirmación al sumar punto desde el reloj (hoy solo vibra el teléfono).
- Compartir resultado final (Web Share API) como imagen o texto.
- Pantalla apaisada tipo tablero para dejar el teléfono visible en la cancha.
- Migrar íconos a un diseño con paleta/pelota de pádel más distintiva si se quiere branding.
