/*
 * =================================================================================
 * NEUROGUARD IoT ATTACK SIMULATION DEMO (Threat ESP32)
 * =================================================================================
 * Target: NeuroGuard Autonomous AI IoT Gateway (Protecting ESP32 Camera)
 * Behavior:
 *   - Normal Mode: Sends periodic heartbeat packet (every 5 seconds) -> [200 OK]
 *   - Attack Mode: Fires a burst of 8 rapid HTTP POST packets -> Triggers AI Watchdog!
 *   - NeuroGuard Response:
 *       * Packets 1 to 5: Forwarded / Safe [HTTP 200 OK]
 *       * Packet 6+: AI Anomaly Triggered -> [HTTP 403 QUARANTINED]
 * =================================================================================
 */

#include <WiFi.h>
#include <HTTPClient.h>

// 1. Enter your Wi-Fi details (Same network as your laptop running NeuroGuard)
const char* ssid     = "YOUR_WIFI_SSID";
const char* password = "YOUR_WIFI_PASSWORD";

// 2. Enter your Laptop's IP running NeuroGuard (e.g., "10.185.191.56" or "192.168.31.173")
const char* neuroguard_gateway_url = "http://10.185.191.56:3000/api/gateway/camera";

// Physical push button to trigger attack (optional - default pin D4 / GPIO 4)
const int BUTTON_PIN = 4;
unsigned long lastHeartbeat = 0;
bool attackTriggered = false;

void setup() {
  Serial.begin(115200);
  delay(1000);

  pinMode(BUTTON_PIN, INPUT_PULLUP);

  Serial.println("\n==============================================");
  Serial.println("  NEUROGUARD DEMO: THREAT ESP32 NODE");
  Serial.println("==============================================");

  // Connect to Wi-Fi
  Serial.print("Connecting to Wi-Fi: ");
  Serial.println(ssid);
  WiFi.begin(ssid, password);

  while (WiFi.status() != WL_CONNECTED) {
    delay(500);
    Serial.print(".");
  }

  Serial.println("\n[+] Wi-Fi Connected!");
  Serial.print("[+] Threat ESP32 IP Address: ");
  Serial.println(WiFi.localIP());
  Serial.print("[+] Target AI Gateway: ");
  Serial.println(neuroguard_gateway_url);
  Serial.println("\n[!] Send attack: Press button on GPIO 4 OR type 'attack' in Serial Monitor.");
}

void loop() {
  // Check Serial Monitor for trigger command
  if (Serial.available()) {
    String input = Serial.readStringUntil('\n');
    input.trim();
    if (input.equalsIgnoreCase("attack") || input.equalsIgnoreCase("flood") || input.equalsIgnoreCase("fire")) {
      executeFloodAttack();
    }
  }

  // Check physical button press
  if (digitalRead(BUTTON_PIN) == LOW) {
    delay(200); // Debounce
    executeFloodAttack();
  }

  // Periodic heartbeat (Normal traffic)
  if (millis() - lastHeartbeat > 8000) {
    lastHeartbeat = millis();
    sendSingleHeartbeat();
  }
}

// -----------------------------------------------------------------------------
// NORMAL SAFE HEARTBEAT (<= 1 packet per 8s)
// -----------------------------------------------------------------------------
void sendSingleHeartbeat() {
  if (WiFi.status() == WL_CONNECTED) {
    HTTPClient http;
    http.begin(neuroguard_gateway_url);
    http.addHeader("Content-Type", "application/json");

    String payload = "{\"device\":\"ESP32_Threat_Node\",\"command\":\"ping\",\"status\":\"idle\"}";
    int httpResponseCode = http.POST(payload);

    Serial.print("[Heartbeat] Gateway Response: HTTP ");
    Serial.print(httpResponseCode);
    if (httpResponseCode == 200) {
      Serial.println(" [PASS - Safe Traffic]");
    } else if (httpResponseCode == 403) {
      Serial.println(" [BLOCKED - Quarantined by NeuroGuard AI]");
    } else {
      Serial.println();
    }
    http.end();
  }
}

// -----------------------------------------------------------------------------
// RAPID FLOOD ATTACK (8 Rapid Packets in < 1 Second)
// -----------------------------------------------------------------------------
void executeFloodAttack() {
  Serial.println("\n=======================================================");
  Serial.println(" [!] INITIATING RAPID BURST FLOOD ATTACK ON ESP32 CAMERA");
  Serial.println(" [!] Threshold: 5 messages. Sending 8 rapid packets...");
  Serial.println("=======================================================");

  for (int i = 1; i <= 8; i++) {
    if (WiFi.status() == WL_CONNECTED) {
      HTTPClient http;
      http.begin(neuroguard_gateway_url);
      http.addHeader("Content-Type", "application/json");

      String payload = "{\"device\":\"ESP32_Threat_Node\",\"attack\":\"SYN_Flood\",\"packet_no\":" + String(i) + "}";
      
      unsigned long tStart = millis();
      int httpCode = http.POST(payload);
      String response = http.getString();
      unsigned long duration = millis() - tStart;

      Serial.print("Packet #");
      Serial.print(i);
      Serial.print(" -> HTTP ");
      Serial.print(httpCode);

      if (httpCode == 200) {
        Serial.print(" [PASS] (");
        Serial.print(duration);
        Serial.println("ms) - Allowed through Gateway");
      } else if (httpCode == 403) {
        Serial.print(" [🚨 BLOCKED] (");
        Serial.print(duration);
        Serial.println("ms) -> AI RATE-LIMIT INTERCEPTED & QUARANTINED!");
        Serial.print("    Response: ");
        Serial.println(response);
      } else {
        Serial.print(" [Code: ");
        Serial.print(httpCode);
        Serial.println("]");
      }

      http.end();
      delay(80); // 80ms delay between burst packets
    }
  }

  Serial.println("=======================================================");
  Serial.println(" [✓] Attack Sequence Complete. Check NeuroGuard Dashboard!");
  Serial.println("=======================================================\n");
}
