/*
 * Contador de pádel para Arduino Uno + OLED SSD1306 (kit de inicio)
 * Tablero independiente (no se conecta a la app) con el mismo motor de
 * reglas: 15/30/40, punto de oro, sets, tie-break y súper tie-break a 11.
 *
 * Botones (a GND, pullup interno):
 *   pin 2 = punto NOSOTROS
 *   pin 3 = punto ELLOS
 *   pin 4 = BORRAR último punto (mantener 3 s = reiniciar partido)
 * Buzzer pasivo en pin 8 (opcional): beep por punto, doble por juego,
 * melodía al ganar.
 * OLED 0,96" I2C: SDA -> A4, SCL -> A5, VCC -> 5V, GND -> GND (dir 0x3C).
 *
 * Librerías (Library Manager): "Adafruit SSD1306" + "Adafruit GFX Library".
 *
 * El deshacer funciona como en la app: se guarda la lista de puntos
 * (1 bit por punto) y el marcador se recalcula desde cero — deshacer
 * es exacto siempre, sin casos especiales.
 */

#include <Wire.h>
#include <Adafruit_GFX.h>
#include <Adafruit_SSD1306.h>

// ---------- Configuración del partido ----------
#define PUNTO_ORO     1   // 1 = punto de oro en 40-40; 0 = ventaja
#define CON_TIEBREAK  1   // 1 = tie-break a 6-6
#define SUPER_TB      1   // 1 = tercer set como súper tie-break a 11
#define SETS_PARA_GANAR 2 // 2 = al mejor de 3; 1 = un set

// ---------- Pines ----------
#define BTN_A     2
#define BTN_B     3
#define BTN_UNDO  4
#define BUZZER    8   // poner 0 si no conectás buzzer

#define DEBOUNCE_MS   35
#define RESET_HOLD_MS 3000

Adafruit_SSD1306 display(128, 64, &Wire, -1);

// ---------- Historial de puntos: 1 bit por punto (0 = A, 1 = B) ----------
#define MAX_PUNTOS 800
uint8_t  hist[MAX_PUNTOS / 8];
uint16_t nPuntos = 0;

// ---------- Estado calculado ----------
struct Estado {
  uint8_t setsA, setsB;          // sets ganados
  uint8_t setHistA[3], setHistB[3];
  uint8_t nSets;
  uint8_t gamesA, gamesB;
  uint8_t ptsA, ptsB;            // índice 0-4 (4 = AD) o nº en tie-break
  bool    tiebreak, superTb;
  bool    puntoOro;
  char    ganador;               // 0, 'A' o 'B'
};
Estado est;

const char* const ETIQ[] = {"0", "15", "30", "40", "AD"};

void ganaJuego(Estado &s, bool a, bool fueTb) {
  if (s.superTb) {
    // súper tie-break decisivo: se registra como set con los puntos
    s.setHistA[s.nSets] = s.ptsA;
    s.setHistB[s.nSets] = s.ptsB;
    s.nSets++;
    if (a) s.setsA++; else s.setsB++;
    s.ptsA = s.ptsB = 0;
    s.tiebreak = s.superTb = false;
    s.ganador = a ? 'A' : 'B';
    return;
  }
  if (a) s.gamesA++; else s.gamesB++;
  s.ptsA = s.ptsB = 0;

  uint8_t gw = a ? s.gamesA : s.gamesB;
  uint8_t gl = a ? s.gamesB : s.gamesA;
  bool setOver = false;

  if (fueTb) { setOver = true; s.tiebreak = false; }
  else if (gw >= 6 && gw - gl >= 2) setOver = true;
  else if (CON_TIEBREAK && gw == 6 && gl == 6) s.tiebreak = true;

  if (setOver) {
    s.setHistA[s.nSets] = s.gamesA;
    s.setHistB[s.nSets] = s.gamesB;
    s.nSets++;
    if (a) s.setsA++; else s.setsB++;
    s.gamesA = s.gamesB = 0;
    if ((a ? s.setsA : s.setsB) >= SETS_PARA_GANAR) s.ganador = a ? 'A' : 'B';
    else if (SUPER_TB && SETS_PARA_GANAR == 2 && s.setsA == 1 && s.setsB == 1) {
      s.tiebreak = s.superTb = true;
    }
  }
}

void calcular(Estado &s) {
  memset(&s, 0, sizeof(s));
  for (uint16_t i = 0; i < nPuntos && !s.ganador; i++) {
    bool a = bitRead(hist[i >> 3], i & 7) == 0;
    uint8_t *pw = a ? &s.ptsA : &s.ptsB;
    uint8_t *pl = a ? &s.ptsB : &s.ptsA;

    if (s.tiebreak) {
      (*pw)++;
      uint8_t objetivo = s.superTb ? 11 : 7;
      if (*pw >= objetivo && *pw - *pl >= 2) ganaJuego(s, a, true);
      continue;
    }
    if (*pw == 3 && *pl == 3) {
      if (PUNTO_ORO) ganaJuego(s, a, false);
      else *pw = 4;                       // ventaja
    } else if (*pw == 4) ganaJuego(s, a, false);
    else if (*pl == 4) *pl = 3;           // vuelve a deuce
    else if (*pw == 3) ganaJuego(s, a, false);
    else (*pw)++;
  }
  s.puntoOro = !s.ganador && !s.tiebreak && PUNTO_ORO && s.ptsA == 3 && s.ptsB == 3;
}

// ---------- Sonido ----------
void beep(uint16_t f, uint16_t ms) {
  if (BUZZER) { tone(BUZZER, f, ms); delay(ms); }
}

// ---------- Acciones ----------
void agregarPunto(bool b) {            // b: false = A, true = B
  if (est.ganador || nPuntos >= MAX_PUNTOS) return;
  Estado antes = est;
  bitWrite(hist[nPuntos >> 3], nPuntos & 7, b);
  nPuntos++;
  calcular(est);
  dibujar();
  if (est.ganador)               { beep(880,150); beep(1175,150); beep(1568,300); }
  else if (est.nSets > antes.nSets) { beep(880,120); beep(1175,200); }
  else if (est.gamesA + est.gamesB > antes.gamesA + antes.gamesB) { beep(988,90); beep(988,90); }
  else beep(b ? 740 : 988, 60);
}

void borrarPunto() {
  if (!nPuntos) return;
  nPuntos--;
  calcular(est);
  dibujar();
  beep(523, 120);
}

void reiniciar() {
  nPuntos = 0;
  calcular(est);
  dibujar();
  beep(659,80); beep(523,80); beep(659,80);
}

// ---------- Pantalla ----------
void dibujar() {
  display.clearDisplay();
  display.setTextColor(SSD1306_WHITE);

  if (est.ganador) {
    display.setTextSize(2);
    display.setCursor(10, 8);
    display.print(F("GANO"));
    display.setCursor(10, 28);
    display.print(est.ganador == 'A' ? F("NOSOTROS") : F("ELLOS"));
    display.setTextSize(1);
    display.setCursor(10, 52);
    for (uint8_t i = 0; i < est.nSets; i++) {
      display.print(est.setHistA[i]); display.print('-'); display.print(est.setHistB[i]);
      display.print(' ');
    }
    display.display();
    return;
  }

  // línea superior: sets terminados + banner
  display.setTextSize(1);
  display.setCursor(0, 0);
  for (uint8_t i = 0; i < est.nSets; i++) {
    display.print(est.setHistA[i]); display.print('-'); display.print(est.setHistB[i]);
    display.print(' ');
  }
  if (est.puntoOro)      display.print(F("P.DE ORO!"));
  else if (est.superTb)  display.print(F("SUPER TB"));
  else if (est.tiebreak) display.print(F("TIE-BREAK"));

  // filas principales: nombre, juegos, puntos
  display.setTextSize(2);
  display.setCursor(0, 16);  display.print(F("NOS"));
  display.setCursor(0, 40);  display.print(F("ELL"));
  display.setCursor(48, 16); display.print(est.gamesA);
  display.setCursor(48, 40); display.print(est.gamesB);
  display.setCursor(76, 16);
  if (est.tiebreak) display.print(est.ptsA); else display.print(ETIQ[est.ptsA]);
  display.setCursor(76, 40);
  if (est.tiebreak) display.print(est.ptsB); else display.print(ETIQ[est.ptsB]);

  display.display();
}

// ---------- Botones ----------
struct Boton {
  uint8_t pin;
  bool estado;
  uint32_t tCambio;
};
Boton bA = {BTN_A, false, 0}, bB = {BTN_B, false, 0}, bU = {BTN_UNDO, false, 0};
uint32_t tUndoDown = 0;
bool resetHecho = false;

// devuelve true en el flanco de presión
bool flanco(Boton &b) {
  bool crudo = digitalRead(b.pin) == LOW;
  if (crudo != b.estado && millis() - b.tCambio > DEBOUNCE_MS) {
    b.estado = crudo;
    b.tCambio = millis();
    return crudo;
  }
  return false;
}

void setup() {
  pinMode(BTN_A, INPUT_PULLUP);
  pinMode(BTN_B, INPUT_PULLUP);
  pinMode(BTN_UNDO, INPUT_PULLUP);
  display.begin(SSD1306_SWITCHCAPVCC, 0x3C);
  calcular(est);
  dibujar();
  beep(988, 80);
}

void loop() {
  if (flanco(bA)) agregarPunto(false);
  if (flanco(bB)) agregarPunto(true);

  if (flanco(bU)) { tUndoDown = millis(); resetHecho = false; }
  if (bU.estado && !resetHecho && millis() - tUndoDown >= RESET_HOLD_MS) {
    resetHecho = true;          // mantener 3 s: partido nuevo
    reiniciar();
  }
  // soltar antes de los 3 s = borrar un punto
  static bool uAntes = false;
  if (uAntes && !bU.estado && !resetHecho) borrarPunto();
  uAntes = bU.estado;
}
