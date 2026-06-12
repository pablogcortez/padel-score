# Botón DIY tipo Flic para Padel Score

> Proyecto de hardware: botón Bluetooth de muñeca para marcar puntos desde adentro
> de la cancha, con más alcance que el reloj. Documentado 2026-06-11.
> **Estado: firmware listo en [`firmware/`](firmware/README.md) (2026-06-12);
> componentes aún no comprados.**

## Concepto

Un microcontrolador BLE actuando como **teclado HID que envía comandos de medios**
(Consumer Control). Android los enruta a la sesión de medios activa, así que funciona
con la app **sin modificarla** — usa el mismo canal que el reloj, y pueden convivir.

Gestos (detectados en el firmware, sin el problema del doble toque del reloj):

| Gesto | Comando BLE | Acción en la app |
|---|---|---|
| 1 toque | `PREVIOUS_TRACK` (⏮) | Punto para nosotros |
| 2 toques (ventana 400 ms) | `NEXT_TRACK` (⏭) | Punto para ellos |
| Mantener ≥ 2 s | `PLAY_PAUSE` (⏯) | Borrar último punto |

## Lista de compra (verificada en Mercado Libre Argentina, 2026-06)

Opción recomendada (barata y disponible):

1. **ESP32-C3 Super Mini** — USB-C, BLE 5, 22×18 mm.
   https://listado.mercadolibre.com.ar/esp32-super-mini-c3
2. **TP4056 con protección** — **COMPRADO (2026-06): versión USB-C c/protector**.
   Conexionado tal como está documentado abajo: OUT+ → pin 5V, OUT− → GND.
   (Se evaluó la variante con boost 5V pero se descartó: el boost consume mA
   permanentes y arruinaría el deep sleep.)
3. **LiPo 3,7 V 300–500 mAh.**
   https://listado.mercadolibre.com.ar/bateria-li-po-3.7v-400mah
4. **Pulsador táctil 12 mm** (mejor si es IP67 por el sudor).
5. **Motor de vibración de celular 3 V** + transistor NPN (2N2222/BC548) +
   resistencia 1k + diodo flyback: **1N4148, 1N4007 (1N400x) o 1N5819 — cualquiera
   sirve**; banda (cátodo) hacia el positivo del motor.
6. Carcasa impresa en 3D + correa de velcro (botón hundido ~1 mm para evitar
   toques accidentales).

Alternativa premium: **Seeed XIAO nRF52840 Plus** (publicado en ML como importado:
https://www.mercadolibre.com.ar/xiao-nrf52840-plus-cortexm4-carga-bateria-integrado-ble-5/up/MLAU3401174068).
Cargador LiPo integrado (no necesita TP4056) y batería que dura meses (consumo en
µA vs mA del ESP32). Mismo chip que usa el Flic real. Decidir por precio.

Comprado en vez de DIY: **Flic 2 + Flic Wristband** (flic.io) — gestos nativos
1/2/mantener, ~50 m de alcance, mapeables a medios desde su app. ~US$ 30-40 + envío.

## Conexionado (ESP32-C3 Super Mini)

```
LiPo + ──► TP4056 B+        TP4056 OUT+ ──► pin 5V de la placa
LiPo − ──► TP4056 B−        TP4056 OUT− ──► GND

Pulsador: GPIO3 ──► botón ──► GND   (INPUT_PULLUP interno)

Motor vibración:
  GPIO4 ──► R 1k ──► base NPN
  colector ──► motor ──► OUT+ (3,7 V)
  emisor ──► GND
  diodo 1N4148 en paralelo al motor (cátodo al +)
```

⚠️ **No conectar el USB-C de la placa con la batería puesta** (el 5V del USB
backfeed-ea a la batería sin control de carga). Cargar siempre por el USB del
TP4056; desconectar la batería para flashear.

## Firmware

**Ya escrito y versionado en [`firmware/padel-boton/padel-boton.ino`](firmware/padel-boton/padel-boton.ino)**,
con instrucciones de entorno, flasheo y emparejamiento en [`firmware/README.md`](firmware/README.md).
Usa NimBLE-Arduino 2.x como HID Consumer Control. Lo que sigue era el diseño original.

## Firmware (diseño)

- **Arduino IDE** + core ESP32. Librería: `ESP32-BLE-Keyboard` (T-vK) en modo
  NimBLE (necesario en C3), o `ESP32-NimBLE-Keyboard`. Trae
  `KEY_MEDIA_PREVIOUS_TRACK`, `KEY_MEDIA_NEXT_TRACK`, `KEY_MEDIA_PLAY_PAUSE`.
- Máquina de estados del botón (debounce ~30 ms):

```
si botón bajó: t0 = millis()
si botón subió:
  si millis()-t0 >= 2000  -> PLAY_PAUSE (borrar) y listo
  sino toques++, tVentana = millis()
si toques > 0 && millis()-tVentana > 400:
  toques == 1 -> PREVIOUS_TRACK (nosotros)
  toques >= 2 -> NEXT_TRACK (ellos)
  toques = 0
```

- **Confirmación háptica** sin mirar el teléfono: 1 pulso corto = punto nosotros,
  2 pulsos = punto ellos, 1 pulso largo = borrado.
- **Batería**: BLE conectado ≈ 10-20 mA → ~20-30 h con 400 mAh (varios partidos).
  Auto-apagado: deep sleep tras ~3 h sin uso, wake por GPIO del botón
  (reconecta en ~1-2 s al primer toque).
- **Emparejamiento**: una sola vez en Ajustes → Bluetooth del teléfono; reconecta solo.
- TX power: subir con `esp_ble_tx_power_set(...)` al máximo del chip.
  Alcance esperado: 30-60 m con línea de vista (cancha 20×10 cubierta de sobra).

## Opción comprada en ML Argentina: control multimedia "para volante"

Investigado 2026-06: los **controles remotos BT multimedia para volante/moto/bici**
(https://listado.mercadolibre.com.ar/control-remoto-para-volante-bluetooth) son
botoneras BLE a pila de botón, plug-and-play, con botones físicos ⏮ ⏯ ⏭ — mandan
los mismos comandos de medios que la app ya escucha, sin tocar código.
Ejemplo: https://articulo.mercadolibre.com.ar/MLA-1108605122

- ✅ Baratos, disponibles, botones dedicados, adaptables a la muñeca con velcro.
- ⚠️ Verificar que sea control multimedia (botones de música en la foto), NO
  disparador de selfie (manda volumen) NI receptor de audio BT con salida aux
  (se roba la salida de audio y mata la voz del marcador).
- ❌ **Alcance ~10 m, igual que el reloj** — no resuelve el problema de alcance.
  Mitigación: teléfono pegado al vidrio a mitad de cancha → distancia máx ~11 m.
  Para alcance real (30-60 m) las únicas vías son el DIY de este documento o un
  Flic 2 importado (hay listado en ML pero stock incierto:
  https://listado.mercadolibre.com.ar/flic-smart-button).

Plan sugerido: comprar uno de estos controles (cuesta poco) y probarlo en cancha
con el teléfono bien ubicado; si el alcance no da, encarar el DIY.

## Por qué NO sirven los botones BLE baratos

Los disparadores de cámara/selfie (AB Shutter 3 y similares, ~US$ 3) mandan teclas
de **volumen o Enter**, no comandos de música — la app no puede capturarlos.
Tiene que ser un dispositivo que mande Consumer Control de medios reales.
