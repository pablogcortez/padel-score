# Padel Score 🎾

Marcador de pádel — PWA instalable que funciona offline.

**App:** https://pablogcortez.github.io/padel-score/

- Puntos 0/15/30/40, punto de oro o ventaja, sets, tie-break.
- Deshacer ilimitado y guardado automático del partido.
- Control desde el reloj (Huawei Watch u otros) vía controles de música Bluetooth:
  1 toque en ⏯ = punto nosotros · 2 toques = punto ellos · 3 toques = deshacer.
  El marcador en vivo se ve como título de la "canción" en el reloj.

## Desarrollo

- `node test-engine.cjs` — pruebas del motor de puntuación.
- `node server.cjs` — servidor local en http://localhost:8765.
- `node make-icons.cjs` — regenera los íconos PNG.
