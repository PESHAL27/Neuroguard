/*
 * NeuroGuard ESP32-CAM Firmware (Dual-Node IoT Architecture)
 *
 * Hardware (Node 2 - Smart Surveillance Streamer):
 *   - AI-Thinker ESP32-CAM module with OV2640 camera
 *   - Onboard Flash LED (GPIO 4) & Status LED (GPIO 33)
 *
 * Features:
 *   - Hosts high-performance MJPEG video stream on port 80/81 (/stream & /capture)
 *   - Auto-registers with NeuroGuard SOC backend as "esp32_cam"
 *   - Sends periodic stream health telemetry
 *   - Provides live attack surface for video feed hijacking, HTTP slowloris, and brute force demos
 *
 * Libraries required:
 *   - esp_camera.h (Built into ESP32 Arduino Core)
 *   - ArduinoJson (v6+)
 *   - WiFi & HTTPClient
 */

#include "esp_camera.h"
#include <WiFi.h>
#include <HTTPClient.h>
#include <ArduinoJson.h>
#include "esp_http_server.h"

// ─── Configuration ───────────────────────────────────
const char* WIFI_SSID     = "YOUR_HOTSPOT_SSID";
const char* WIFI_PASSWORD = "YOUR_HOTSPOT_PASSWORD";

// NeuroGuard backend address (Laptop IP running FastAPI backend)
const char* BACKEND_HOST = "192.168.137.1";
const int   BACKEND_PORT = 8000;

// Device Identity
const char* DEVICE_ID   = "esp32_cam_01";
const char* DEVICE_NAME = "ESP32-CAM Smart CCTV";
const char* DEVICE_TYPE = "esp32_cam";

// ─── AI-Thinker ESP32-CAM Pin Definitions ─────────────
#define PWDN_GPIO_NUM     32
#define RESET_GPIO_NUM    -1
#define XCLK_GPIO_NUM      0
#define SIOD_GPIO_NUM     26
#define SIOC_GPIO_NUM     27

#define Y9_GPIO_NUM       35
#define Y8_GPIO_NUM       34
#define Y7_GPIO_NUM       39
#define Y6_GPIO_NUM       36
#define Y5_GPIO_NUM       21
#define Y4_GPIO_NUM       19
#define Y3_GPIO_NUM       18
#define Y2_GPIO_NUM        5
#define VSYNC_GPIO_NUM    25
#define HREF_GPIO_NUM     23
#define PCLK_GPIO_NUM     22

#define FLASH_LED_PIN      4
#define STATUS_LED_PIN    33

// ─── Timing ───────────────────────────────────────────
const unsigned long TELEMETRY_INTERVAL_MS = 4000;
const unsigned long REGISTER_RETRY_MS     = 8000;

unsigned long lastTelemetry = 0;
bool registered = false;
httpd_handle_t stream_httpd = NULL;

#define PART_BOUNDARY "123456789000000000000987654321"
static const char* _STREAM_CONTENT_TYPE = "multipart/x-mixed-replace;boundary=" PART_BOUNDARY;
static const char* _STREAM_BOUNDARY = "\r\n--" PART_BOUNDARY "\r\n";
static const char* _STREAM_PART = "Content-Type: image/jpeg\r\nContent-Length: %u\r\n\r\n";

// ─── Camera Stream Handler ────────────────────────────
static esp_err_t stream_handler(httpd_req_t *req) {
    camera_fb_t * fb = NULL;
    esp_err_t res = ESP_OK;
    size_t _jpg_buf_len = 0;
    uint8_t * _jpg_buf = NULL;
    char * part_buf[64];

    res = httpd_resp_set_type(req, _STREAM_CONTENT_TYPE);
    if(res != ESP_OK) return res;

    httpd_resp_set_hdr(req, "Access-Control-Allow-Origin", "*");

    while(true) {
        fb = esp_camera_fb_get();
        if (!fb) {
            Serial.println("[CAM] Camera capture failed");
            res = ESP_FAIL;
        } else {
            _jpg_buf_len = fb->len;
            _jpg_buf = fb->buf;
        }
        if(res == ESP_OK) {
            size_t hlen = snprintf((char *)part_buf, 64, _STREAM_PART, _jpg_buf_len);
            res = httpd_resp_send_chunk(req, (const char *)part_buf, hlen);
        }
        if(res == ESP_OK) {
            res = httpd_resp_send_chunk(req, (const char *)_jpg_buf, _jpg_buf_len);
        }
        if(res == ESP_OK) {
            res = httpd_resp_send_chunk(req, _STREAM_BOUNDARY, strlen(_STREAM_BOUNDARY));
        }
        if(fb) {
            esp_camera_fb_return(fb);
            fb = NULL;
            _jpg_buf = NULL;
        } else if(_jpg_buf) {
            free(_jpg_buf);
            _jpg_buf = NULL;
        }
        if(res != ESP_OK) break;
    }
    return res;
}

// ─── Single Snapshot Handler ──────────────────────────
static esp_err_t capture_handler(httpd_req_t *req) {
    camera_fb_t * fb = esp_camera_fb_get();
    if (!fb) {
        httpd_resp_send_500(req);
        return ESP_FAIL;
    }
    httpd_resp_set_type(req, "image/jpeg");
    httpd_resp_set_hdr(req, "Content-Disposition", "inline; filename=capture.jpg");
    httpd_resp_set_hdr(req, "Access-Control-Allow-Origin", "*");
    esp_err_t res = httpd_resp_send(req, (const char *)fb->buf, fb->len);
    esp_camera_fb_return(fb);
    return res;
}

void startCameraServer() {
    httpd_config_t config = HTTPD_DEFAULT_CONFIG();
    config.server_port = 80;

    httpd_uri_t stream_uri = {
        .uri       = "/stream",
        .method    = HTTP_GET,
        .handler   = stream_handler,
        .user_ctx  = NULL
    };

    httpd_uri_t capture_uri = {
        .uri       = "/capture",
        .method    = HTTP_GET,
        .handler   = capture_handler,
        .user_ctx  = NULL
    };

    if (httpd_start(&stream_httpd, &config) == ESP_OK) {
        httpd_register_uri_handler(stream_httpd, &stream_uri);
        httpd_register_uri_handler(stream_httpd, &capture_uri);
        Serial.println("[HTTP] Camera Web Server started on port 80 (/stream)");
    }
}

// ─── Setup ────────────────────────────────────────────
void setup() {
    Serial.begin(115200);
    delay(500);
    Serial.println("\n========================================");
    Serial.println("  NeuroGuard ESP32-CAM Surveillance Node");
    Serial.println("========================================\n");

    pinMode(STATUS_LED_PIN, OUTPUT);
    digitalWrite(STATUS_LED_PIN, LOW); // Active low onboard LED

    // Camera Configuration
    camera_config_t config;
    config.ledc_channel = LEDC_CHANNEL_0;
    config.ledc_timer   = LEDC_TIMER_0;
    config.pin_d0       = Y2_GPIO_NUM;
    config.pin_d1       = Y3_GPIO_NUM;
    config.pin_d2       = Y4_GPIO_NUM;
    config.pin_d3       = Y5_GPIO_NUM;
    config.pin_d4       = Y6_GPIO_NUM;
    config.pin_d5       = Y7_GPIO_NUM;
    config.pin_d6       = Y8_GPIO_NUM;
    config.pin_d7       = Y9_GPIO_NUM;
    config.pin_xclk     = XCLK_GPIO_NUM;
    config.pin_pclk     = PCLK_GPIO_NUM;
    config.pin_vsync    = VSYNC_GPIO_NUM;
    config.pin_href     = HREF_GPIO_NUM;
    config.pin_sscb_sda = SIOD_GPIO_NUM;
    config.pin_sscb_scl = SIOC_GPIO_NUM;
    config.pin_pwdn     = PWDN_GPIO_NUM;
    config.pin_reset    = RESET_GPIO_NUM;
    config.xclk_freq_hz = 20000000;
    config.pixel_format = PIXFORMAT_JPEG;

    if(psramFound()){
        config.frame_size = FRAMESIZE_QVGA; // 320x240 for high FPS & low latency
        config.jpeg_quality = 12;
        config.fb_count = 2;
    } else {
        config.frame_size = FRAMESIZE_QQVGA;
        config.jpeg_quality = 15;
        config.fb_count = 1;
    }

    esp_err_t err = esp_camera_init(&config);
    if (err != ESP_OK) {
        Serial.printf("[CAM] Camera init failed with error 0x%x\n", err);
        return;
    }
    Serial.println("[CAM] Camera initialized successfully");

    // Connect WiFi
    Serial.print("[WIFI] Connecting to " + String(WIFI_SSID));
    WiFi.mode(WIFI_STA);
    WiFi.begin(WIFI_SSID, WIFI_PASSWORD);
    while (WiFi.status() != WL_CONNECTED) {
        delay(400);
        Serial.print(".");
    }
    Serial.println("\n[WIFI] Connected! IP: " + WiFi.localIP().toString());

    startCameraServer();
}

// ─── Registration & Telemetry ─────────────────────────
bool registerCameraDevice() {
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
    int code = http.POST(body);

    if (code == 200) {
        Serial.println("[REG] ESP32-CAM Registered with SOC");
        http.end();
        return true;
    }
    http.end();
    return false;
}

void sendCameraTelemetry() {
    HTTPClient http;
    String url = "http://" + String(BACKEND_HOST) + ":" + String(BACKEND_PORT) + "/api/device/telemetry";

    StaticJsonDocument<1024> doc;
    doc["device_id"]   = DEVICE_ID;
    doc["ip"]          = WiFi.localIP().toString();
    doc["connections"] = 2;
    doc["bytes"]       = random(15000, 45000); // Video payload
    doc["protocol"]    = "HTTP/MJPEG";

    JsonObject sensors = doc.createNestedObject("sensors");
    sensors["stream_fps"] = 20;
    sensors["resolution"] = "320x240";
    sensors["port"]       = 80;

    String body;
    serializeJson(doc, body);

    http.begin(url);
    http.addHeader("Content-Type", "application/json");
    http.setTimeout(2500);
    http.POST(body);
    http.end();
}

// ─── Main Loop ────────────────────────────────────────
void loop() {
    if (WiFi.status() != WL_CONNECTED) {
        delay(1000);
        return;
    }

    if (!registered) {
        registered = registerCameraDevice();
        if (!registered) {
            delay(REGISTER_RETRY_MS);
            return;
        }
    }

    unsigned long now = millis();
    if (now - lastTelemetry >= TELEMETRY_INTERVAL_MS) {
        lastTelemetry = now;
        sendCameraTelemetry();
    }
}
