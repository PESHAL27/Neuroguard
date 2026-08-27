/*
 * NeuroGuard ESP32 Firmware v2.0 (Dual-Node IoT Architecture)
 *
 * Hardware (Node 1 - Industrial Controller):
 *   - ESP32 DevKit
 *   - DHT11/DHT22 Humidity & Temperature Sensor (GPIO 4)
 *   - Servo Motor Actuator (GPIO 13)
 *   - Security Status LEDs:
 *       * GREEN LED  (GPIO 18) -> Normal / Safe
 *       * YELLOW LED (GPIO 19) -> Suspicious / Investigating
 *       * RED LED    (GPIO 21) -> Attack Detected / Quarantined
 *
 * Connects to WiFi (Laptop Hotspot / Local Router), registers with NeuroGuard backend,
 * sends telemetry periodically, and dynamically updates physical LEDs based on real-time
 * SOC AI defense commands.
 *
 * Libraries required (install via Arduino Library Manager):
 *   - DHT sensor library by Adafruit
 *   - Adafruit Unified Sensor
 *   - ESP32Servo
 *   - ArduinoJson (v6+)
 */

#include <WiFi.h>
#include <HTTPClient.h>
#include <ArduinoJson.h>
#include <DHT.h>
#include <ESP32Servo.h>

// ─── Configuration ───────────────────────────────────
// WiFi credentials — set to your Laptop Hotspot or WiFi Network
const char* WIFI_SSID     = "YOUR_HOTSPOT_SSID";
const char* WIFI_PASSWORD = "YOUR_HOTSPOT_PASSWORD";

// NeuroGuard backend address (Laptop IP running FastAPI backend)
const char* BACKEND_HOST = "192.168.137.1";  // Default Windows Hotspot Gateway IP or your LAN IP
const int   BACKEND_PORT = 8000;

// Device identity
const char* DEVICE_ID   = "esp32_node_01";
const char* DEVICE_NAME = "ESP32 Industrial Controller";
const char* DEVICE_TYPE = "esp32";

// ─── Pin Configuration ────────────────────────────────
#define DHT_PIN        4       // DHT data pin
#define DHT_TYPE       DHT11   // Change to DHT22 if using DHT22
#define SERVO_PIN      13      // Servo signal pin

// Status Indicator LEDs
#define LED_GREEN_PIN  18      // Normal / Safe
#define LED_YELLOW_PIN 19      // Suspicious
#define LED_RED_PIN    21      // Under Attack / Quarantined

// ─── Timing ───────────────────────────────────────────
const unsigned long TELEMETRY_INTERVAL_MS = 3000;  // 3 seconds
const unsigned long REGISTER_RETRY_MS     = 8000;  // 8 seconds

// ─── Objects ──────────────────────────────────────────
DHT dht(DHT_PIN, DHT_TYPE);
Servo servoMotor;

unsigned long lastTelemetry = 0;
bool registered = false;
int servoAngle = 0;
int servoDirection = 1;  // 1 = increasing, -1 = decreasing
String currentLedState = "green";

// ─── Forward Declarations ─────────────────────────────
void connectWiFi();
bool registerDevice();
void sendTelemetry();
void sweepServo();
void setStatusLed(const String& state);

// ─── Setup ────────────────────────────────────────────
void setup() {
    Serial.begin(115200);
    delay(500);
    Serial.println("\n========================================");
    Serial.println("  NeuroGuard ESP32 Firmware v2.0 (Active SOC)");
    Serial.println("========================================\n");

    // Initialize LED Pins
    pinMode(LED_GREEN_PIN, OUTPUT);
    pinMode(LED_YELLOW_PIN, OUTPUT);
    pinMode(LED_RED_PIN, OUTPUT);

    // Initial state: Booting / connecting (Yellow)
    setStatusLed("yellow");

    // Initialize sensors
    dht.begin();
    Serial.println("[INIT] DHT sensor initialized on GPIO " + String(DHT_PIN));

    // Initialize servo
    servoMotor.attach(SERVO_PIN);
    servoMotor.write(0);
    Serial.println("[INIT] Servo motor initialized on GPIO " + String(SERVO_PIN));

    // Connect to WiFi
    connectWiFi();
}

// ─── Main Loop ────────────────────────────────────────
void loop() {
    // Ensure WiFi is connected
    if (WiFi.status() != WL_CONNECTED) {
        setStatusLed("yellow");
        connectWiFi();
    }

    // Register with backend if not yet registered
    if (!registered) {
        registered = registerDevice();
        if (!registered) {
            delay(REGISTER_RETRY_MS);
            return;
        }
    }

    // Non-blocking telemetry timer
    unsigned long now = millis();
    if (now - lastTelemetry >= TELEMETRY_INTERVAL_MS) {
        lastTelemetry = now;
        sweepServo();
        sendTelemetry();
    }
}

// ─── LED Status Controller ────────────────────────────
void setStatusLed(const String& state) {
    currentLedState = state;
    if (state == "red" || state == "critical" || state == "under_attack") {
        digitalWrite(LED_GREEN_PIN, LOW);
        digitalWrite(LED_YELLOW_PIN, LOW);
        digitalWrite(LED_RED_PIN, HIGH);
        Serial.println("[SOC] Status: CRITICAL (RED LED ACTIVE)");
    } else if (state == "yellow" || state == "suspicious" || state == "warning") {
        digitalWrite(LED_GREEN_PIN, LOW);
        digitalWrite(LED_YELLOW_PIN, HIGH);
        digitalWrite(LED_RED_PIN, LOW);
        Serial.println("[SOC] Status: SUSPICIOUS (YELLOW LED ACTIVE)");
    } else {
        digitalWrite(LED_GREEN_PIN, HIGH);
        digitalWrite(LED_YELLOW_PIN, LOW);
        digitalWrite(LED_RED_PIN, LOW);
        Serial.println("[SOC] Status: NORMAL (GREEN LED ACTIVE)");
    }
}

// ─── WiFi Connection ──────────────────────────────────
void connectWiFi() {
    Serial.print("[WIFI] Connecting to " + String(WIFI_SSID));
    WiFi.mode(WIFI_STA);
    WiFi.begin(WIFI_SSID, WIFI_PASSWORD);

    int attempts = 0;
    while (WiFi.status() != WL_CONNECTED && attempts < 25) {
        delay(400);
        Serial.print(".");
        attempts++;
    }

    if (WiFi.status() == WL_CONNECTED) {
        Serial.println("\n[WIFI] Connected! IP: " + WiFi.localIP().toString());
        setStatusLed("green");
    } else {
        Serial.println("\n[WIFI] Connection failed. Check credentials or hotspot.");
    }
}

// ─── Device Registration ──────────────────────────────
bool registerDevice() {
    HTTPClient http;
    String url = "http://" + String(BACKEND_HOST) + ":" + String(BACKEND_PORT) + "/api/device/register";

    StaticJsonDocument<512> doc;
    doc["device_id"] = DEVICE_ID;
    doc["name"]      = DEVICE_NAME;
    doc["type"]      = DEVICE_TYPE;
    doc["ip"]        = WiFi.localIP().toString();
    doc["mac"]       = WiFi.macAddress();

    String body;
    serializeJson(doc, body);

    http.begin(url);
    http.addHeader("Content-Type", "application/json");
    http.setTimeout(3000);
    int httpCode = http.POST(body);

    if (httpCode == 200) {
        String response = http.getString();
        Serial.println("[REG] Registered with backend: " + response);
        http.end();
        setStatusLed("green");
        return true;
    } else {
        Serial.println("[REG] Registration failed (HTTP " + String(httpCode) + ")");
        http.end();
        return false;
    }
}

// ─── Servo Sweep ──────────────────────────────────────
void sweepServo() {
    servoAngle += servoDirection * 15;
    if (servoAngle >= 180) {
        servoAngle = 180;
        servoDirection = -1;
    } else if (servoAngle <= 0) {
        servoAngle = 0;
        servoDirection = 1;
    }
    servoMotor.write(servoAngle);
}

// ─── Send Telemetry ───────────────────────────────────
void sendTelemetry() {
    HTTPClient http;

    float humidity    = dht.readHumidity();
    float temperature = dht.readTemperature();
    bool dhtValid     = !isnan(humidity) && !isnan(temperature);

    if (!dhtValid) {
        humidity = 0;
        temperature = 0;
    }

    String url = "http://" + String(BACKEND_HOST) + ":" + String(BACKEND_PORT) + "/api/device/telemetry";

    StaticJsonDocument<1024> doc;
    doc["device_id"]   = DEVICE_ID;
    doc["ip"]          = WiFi.localIP().toString();
    doc["connections"] = 1;
    doc["bytes"]       = random(800, 3500);
    doc["protocol"]    = "TCP";

    JsonObject sensors = doc.createNestedObject("sensors");
    sensors["humidity"]    = humidity;
    sensors["temperature"] = temperature;

    JsonObject actuators = doc.createNestedObject("actuators");
    JsonObject servo = actuators.createNestedObject("servo");
    servo["angle"]  = servoAngle;
    servo["active"] = true;

    JsonArray peripherals = doc.createNestedArray("peripherals");

    JsonObject servoPeripheral = peripherals.createNestedObject();
    servoPeripheral["type"] = "servo";
    servoPeripheral["name"] = "Actuator Valve (GPIO13)";
    JsonObject servoData = servoPeripheral.createNestedObject("data");
    servoData["angle"] = servoAngle;
    servoData["pin"]   = SERVO_PIN;

    JsonObject dhtPeripheral = peripherals.createNestedObject();
    dhtPeripheral["type"] = "humidity sensor";
    dhtPeripheral["name"] = "DHT11 Climate Sensor";
    JsonObject dhtData = dhtPeripheral.createNestedObject("data");
    dhtData["humidity"]    = humidity;
    dhtData["temperature"] = temperature;
    dhtData["pin"]         = DHT_PIN;
    dhtData["valid"]       = dhtValid;

    String body;
    serializeJson(doc, body);

    http.begin(url);
    http.addHeader("Content-Type", "application/json");
    http.setTimeout(2500);
    int httpCode = http.POST(body);

    if (httpCode == 200) {
        String response = http.getString();
        Serial.println("[TEL] Telemetry OK: " + response);

        // Parse backend commands (dynamic LED state from AI engine)
        StaticJsonDocument<512> respDoc;
        DeserializationError err = deserializeJson(respDoc, response);
        if (!err) {
            const char* ledCmd = respDoc["led"] | "green";
            setStatusLed(String(ledCmd));
        }
    } else {
        Serial.println("[TEL] Telemetry HTTP error " + String(httpCode));
    }
    http.end();
}

