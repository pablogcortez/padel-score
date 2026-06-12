# Contador de pádel con Arduino Uno (kit de inicio)

Tablero de mesa independiente (no se conecta a la app) con el mismo motor de
reglas: 15/30/40, punto de oro, sets, tie-break y súper tie-break a 11.
Deshacer ilimitado con la misma técnica de la app (historial de puntos +
recálculo).

## Componentes (todos del kit)

- Arduino Uno
- Pantalla OLED 0,96" I2C (SSD1306, la "pantalla negra" del kit)
- 3 pulsadores
- Buzzer pasivo (opcional)
- Protoboard y cables

## Conexionado

| Componente | Pin Uno |
|---|---|
| Botón punto NOSOTROS | 2 → botón → GND |
| Botón punto ELLOS | 3 → botón → GND |
| Botón BORRAR (mantener 3 s = partido nuevo) | 4 → botón → GND |
| Buzzer (+) | 8 (el − a GND) |
| OLED SDA | A4 |
| OLED SCL | A5 |
| OLED VCC / GND | 5V / GND |

Los botones usan el pullup interno: no necesitan resistencias.

## Librerías (Arduino IDE → Library Manager)

- **Adafruit SSD1306** (acepta instalar también sus dependencias)
- **Adafruit GFX Library**

Placa: **Arduino Uno**. Abrir `contador-uno.ino` y Upload.

## Uso

- Un toque en cada botón suma el punto; el buzzer confirma (tono distinto por
  equipo, doble beep al cerrar juego, melodía al ganar el set/partido).
- **BORRAR**: toque corto quita el último punto; mantener 3 segundos arranca
  un partido nuevo.
- Configuración del partido: defines arriba del `.ino` (`PUNTO_ORO`,
  `CON_TIEBREAK`, `SUPER_TB`, `SETS_PARA_GANAR`).

## Si la "pantalla negra" no es una SSD1306

Si al subir el sketch la pantalla queda en negro, puede ser otra OLED (dirección
I2C 0x3D en vez de 0x3C — cambiarla en `display.begin`) u otro modelo de display
(Nokia 5110, etc.). Anotar qué dice el módulo en la serigrafía y adaptar.
