# Firmware del Padel Botón (ESP32-C3 Super Mini)

Botón BLE de muñeca para marcar puntos en la app desde adentro de la cancha.
Manda comandos de medios por Bluetooth — la app no necesita ningún cambio.

| Gesto | Acción |
|---|---|
| 1 toque | Punto para nosotros (⏮) |
| 2 toques | Punto para ellos (⏭) |
| Mantener 2 s | Borrar último punto (⏯) |

Vibración: 1 pulso = nosotros · 2 pulsos = ellos · 1 largo = borrado ·
3 rápidos = no conectado al teléfono.
LED de la placa: fijo = conectado · parpadeando = esperando conexión.
Se duerme solo tras 3 h sin uso; un toque lo despierta (reconecta en ~1-2 s).

## Conexionado

```
LiPo + ──► TP4056 B+        TP4056 OUT+ ──► pin 5V de la placa
LiPo − ──► TP4056 B−        TP4056 OUT− ──► GND

Pulsador:  GPIO3 ──► botón ──► GND        (usa pullup interno)

Motor de vibración:
  GPIO4 ──► R 1k ──► base del NPN (2N2222/BC548)
  colector ──► motor ──► OUT+ (3,7 V)
  emisor   ──► GND
  diodo 1N4148 en paralelo al motor (cátodo al +)
```

⚠️ **No conectar el USB-C de la placa con la batería puesta** (el 5 V del USB
le llegaría a la batería sin control de carga). Cargar siempre por el USB del
TP4056; desconectar la batería para flashear.

## Entorno (Arduino IDE)

1. Instalar [Arduino IDE](https://www.arduino.cc/en/software).
2. **Boards Manager** → instalar "**esp32** by Espressif Systems".
3. **Library Manager** → instalar "**NimBLE-Arduino**" (escrito para la 2.x).
4. Placa: **ESP32C3 Dev Module**. En Tools poner **USB CDC On Boot: Enabled**
   (para ver el monitor serie por el USB-C).

## Flasheo

1. Conectar la placa por USB-C (sin la batería).
2. Abrir `padel-boton/padel-boton.ino`, elegir el puerto y **Upload**.
   - Si no entra en modo de programación: mantener **BOOT** apretado,
     tocar **RESET**, soltar **BOOT**, reintentar el upload.
3. Al arrancar vibra 2 veces y el LED parpadea (anunciándose).

## Emparejamiento

1. En el teléfono: **Ajustes → Bluetooth → vincular "Padel Boton"** (una sola vez;
   después reconecta solo).
2. Abrir la app con un partido en marcha (el modo reloj/medios ya arranca solo).
3. Probar los tres gestos. Conviven el botón, el reloj y la pantalla — todos
   suman al mismo marcador.

## Ajustes útiles (arriba del .ino)

| Constante | Default | Qué hace |
|---|---|---|
| `TX_DBM` | 9 | Potencia BLE en dBm. Probar 15 o 20 si el core lo acepta (más alcance, más consumo) |
| `VENTANA_TAP_MS` | 400 | Ventana para contar toques |
| `HOLD_MS` | 2000 | Duración del "mantener" para borrar |
| `SLEEP_TRAS_MS` | 3 h | Inactividad antes del deep sleep |

## Problemas conocidos

- **No compila por la librería**: este sketch usa la API de NimBLE-Arduino **2.x**
  (`setManufacturer`, `getInputReport`, callbacks con `NimBLEConnInfo`). Si tenés
  la 1.4.x instalada, actualizala desde el Library Manager.
- **Android no lo muestra al vincular**: tocar el botón una vez para asegurarse
  de que está despierto (LED parpadeando = anunciándose).
- **Conectado pero la app no reacciona**: verificar que la tarjeta de música
  "Padel Score" esté en las notificaciones del teléfono (= sesión de medios
  activa). Sin esa tarjeta ningún control de medios funciona, ni reloj ni botón.
- **Se desconecta lejos**: subir `TX_DBM` y orientar la placa con la antena
  (extremo opuesto al USB) hacia afuera de la muñeca.
