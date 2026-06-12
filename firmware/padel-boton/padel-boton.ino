/*
 * Padel Botón — control BLE de muñeca para la app Padel Score
 * https://pablogcortez.github.io/padel-score/
 *
 * Placa:     ESP32-C3 Super Mini
 * Librería:  NimBLE-Arduino 2.x (Library Manager)
 *
 * Se anuncia como teclado BLE HID (Consumer Control) y manda comandos de
 * medios — el mismo canal que usa el reloj, la app no necesita cambios.
 *
 * Gestos:
 *   1 toque        -> ⏮ anterior    = punto NOSOTROS
 *   2 toques       -> ⏭ siguiente   = punto ELLOS
 *   mantener 2 s   -> ⏯ play/pausa  = borrar último punto
 *
 * Confirmación háptica:
 *   1 pulso corto = punto nosotros · 2 pulsos = punto ellos
 *   1 pulso largo = borrado · 3 pulsos rápidos = NO conectado
 *
 * LED de la placa: fijo = conectado · parpadeo = esperando conexión.
 * Deep sleep tras 3 h sin uso; despierta con el botón (reconecta en ~1-2 s).
 */

#include <NimBLEDevice.h>
#include <NimBLEHIDDevice.h>
#include "driver/gpio.h"
#include "esp_sleep.h"

// ---------- Pines ----------
#define PIN_BOTON   3   // pulsador a GND (pullup interno). Debe ser GPIO 0-5 para despertar del deep sleep
#define PIN_MOTOR   4   // base del transistor NPN del motor de vibración (via R 1k)
#define PIN_LED     8   // LED azul de la Super Mini (invertido: LOW = encendido)

// ---------- Ajustes ----------
#define TX_DBM            9        // potencia BLE en dBm; cores recientes aceptan hasta 20 en el C3
#define VENTANA_TAP_MS    400      // ventana para contar toques
#define HOLD_MS           2000     // mantener apretado para borrar
#define DEBOUNCE_MS       30
#define SLEEP_TRAS_MS     (3UL * 60UL * 60UL * 1000UL)  // deep sleep tras 3 h sin uso

// ---------- Usos HID Consumer Control ----------
#define KEY_NEXT  0x00B5   // siguiente  -> punto ellos
#define KEY_PREV  0x00B6   // anterior   -> punto nosotros
#define KEY_PLAY  0x00CD   // play/pausa -> borrar último

// Report map: Consumer Control de 16 bits, report ID 1
static const uint8_t REPORT_MAP[] = {
  0x05, 0x0C,        // Usage Page (Consumer)
  0x09, 0x01,        // Usage (Consumer Control)
  0xA1, 0x01,        // Collection (Application)
  0x85, 0x01,        //   Report ID (1)
  0x15, 0x00,        //   Logical Minimum (0)
  0x26, 0xFF, 0x03,  //   Logical Maximum (0x3FF)
  0x19, 0x00,        //   Usage Minimum (0)
  0x2A, 0xFF, 0x03,  //   Usage Maximum (0x3FF)
  0x75, 0x10,        //   Report Size (16)
  0x95, 0x01,        //   Report Count (1)
  0x81, 0x00,        //   Input (Data, Array)
  0xC0               // End Collection
};

NimBLEHIDDevice*     hid;
NimBLECharacteristic* input;
volatile bool conectado = false;

class ServerCallbacks : public NimBLEServerCallbacks {
  void onConnect(NimBLEServer*, NimBLEConnInfo&) override {
    conectado = true;
    Serial.println("Conectado");
  }
  void onDisconnect(NimBLEServer*, NimBLEConnInfo&, int) override {
    conectado = false;
    Serial.println("Desconectado, anunciando de nuevo");
    NimBLEDevice::startAdvertising();
  }
};

// ---------- Vibración ----------
void vibrar(uint8_t pulsos, uint16_t ms) {
  for (uint8_t i = 0; i < pulsos; i++) {
    digitalWrite(PIN_MOTOR, HIGH);
    delay(ms);
    digitalWrite(PIN_MOTOR, LOW);
    if (i + 1 < pulsos) delay(90);
  }
}

// ---------- Envío de tecla de medios ----------
void enviarTecla(uint16_t uso) {
  if (!conectado) {
    vibrar(3, 40); // aviso: no conectado
    return;
  }
  uint8_t msg[2] = { (uint8_t)(uso & 0xFF), (uint8_t)(uso >> 8) };
  input->setValue(msg, 2);
  input->notify();
  delay(30);
  uint8_t rel[2] = { 0, 0 };
  input->setValue(rel, 2);
  input->notify();
}

// ---------- Deep sleep ----------
void dormir() {
  Serial.println("Sin uso, a dormir");
  vibrar(1, 120);
  digitalWrite(PIN_LED, HIGH); // LED apagado (invertido)
  NimBLEDevice::deinit(true);
  gpio_pullup_en((gpio_num_t)PIN_BOTON);
  gpio_pulldown_dis((gpio_num_t)PIN_BOTON);
  esp_deep_sleep_enable_gpio_wakeup(1ULL << PIN_BOTON, ESP_GPIO_WAKEUP_GPIO_LOW);
  esp_deep_sleep_start();
}

void setup() {
  Serial.begin(115200);
  pinMode(PIN_BOTON, INPUT_PULLUP);
  pinMode(PIN_MOTOR, OUTPUT);
  digitalWrite(PIN_MOTOR, LOW);
  pinMode(PIN_LED, OUTPUT);
  digitalWrite(PIN_LED, HIGH);

  NimBLEDevice::init("Padel Boton");
  NimBLEDevice::setPower(TX_DBM);
  NimBLEDevice::setSecurityAuth(true, false, true); // bonding, sin PIN

  NimBLEServer* server = NimBLEDevice::createServer();
  server->setCallbacks(new ServerCallbacks());

  hid = new NimBLEHIDDevice(server);
  hid->setManufacturer("Padel Score DIY");
  hid->setPnp(0x02, 0x05DA, 0x0001, 0x0100);
  hid->setHidInfo(0x00, 0x01);
  hid->setReportMap((uint8_t*)REPORT_MAP, sizeof(REPORT_MAP));
  input = hid->getInputReport(1);
  hid->startServices();

  NimBLEAdvertising* adv = NimBLEDevice::getAdvertising();
  adv->setAppearance(0x03C0); // Generic HID
  adv->addServiceUUID(hid->getHidService()->getUUID());
  adv->start();

  Serial.println("Anunciando como 'Padel Boton'");
  vibrar(2, 50); // encendido
}

// ---------- Máquina de estados del botón ----------
bool     apretado = false;
uint32_t tCambio = 0, tDown = 0, tUp = 0, tActividad = 0;
uint8_t  toques = 0;
bool     holdDisparado = false;
uint32_t tLed = 0;

void loop() {
  const uint32_t ahora = millis();

  // LED: fijo conectado, parpadeo 1 Hz esperando
  if (conectado) {
    digitalWrite(PIN_LED, LOW);
  } else if (ahora - tLed > 500) {
    tLed = ahora;
    digitalWrite(PIN_LED, !digitalRead(PIN_LED));
  }

  // lectura con debounce
  const bool crudo = digitalRead(PIN_BOTON) == LOW;
  if (crudo != apretado && ahora - tCambio > DEBOUNCE_MS) {
    apretado = crudo;
    tCambio = ahora;
    tActividad = ahora;
    if (apretado) {
      tDown = ahora;
      holdDisparado = false;
    } else if (!holdDisparado) {
      toques++;
      tUp = ahora;
    }
  }

  // mantener 2 s -> borrar (dispara sin esperar a soltar; la vibración avisa)
  if (apretado && !holdDisparado && ahora - tDown >= HOLD_MS) {
    holdDisparado = true;
    toques = 0;
    enviarTecla(KEY_PLAY);
    vibrar(1, 250);
  }

  // cierre de la ventana de toques
  if (!apretado && toques > 0 && ahora - tUp > VENTANA_TAP_MS) {
    if (toques == 1) {
      enviarTecla(KEY_PREV);  // punto nosotros
      vibrar(1, 60);
    } else {
      enviarTecla(KEY_NEXT);  // punto ellos
      vibrar(2, 60);
    }
    toques = 0;
  }

  // auto-apagado
  if (!apretado && ahora - tActividad > SLEEP_TRAS_MS) dormir();

  delay(5);
}
