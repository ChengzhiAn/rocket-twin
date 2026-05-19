/*
  RocketCam firmware for the Lenghu Rocket HUD demo.

  Hardware:
  - Classic AI Thinker ESP32-CAM with OV2640
  - PSRAM enabled in Arduino IDE

  Network:
  - AP SSID: LH-RocketCam-9527
  - AP password: rocket9527
  - AP channel: 6
  - Preview: http://192.168.4.1/
  - MJPEG:   http://192.168.4.1:81/stream
  - Snapshot: http://192.168.4.1/snapshot
  - Health:  http://192.168.4.1/health
*/

#include "esp_camera.h"
#include <WiFi.h>
#include "soc/rtc_cntl_reg.h"

// AI Thinker ESP32-CAM pin map.
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

const char* AP_SSID = "LH-RocketCam-9527";
const char* AP_PASSWORD = "rocket9527";
const int AP_CHANNEL = 6;
const int AP_MAX_CLIENTS = 1;

const int JPEG_QUALITY_PSRAM = 16;
const int JPEG_QUALITY_DRAM = 18;
const int STREAM_FRAME_DELAY_MS = 100;
const int MAX_CAPTURE_FAILURES = 30;

IPAddress localIp(192, 168, 4, 1);
IPAddress gateway(192, 168, 4, 1);
IPAddress subnet(255, 255, 255, 0);

WiFiServer previewServer(80);
WiFiServer streamServer(81);

void handleStreamClient(WiFiClient client);
void sendSnapshot(WiFiClient& client);

struct StreamClientContext {
  WiFiClient client;
};

WiFiClient activeStreamClient;
TaskHandle_t activeStreamTask = nullptr;

void drainHttpHeaders(WiFiClient& client) {
  unsigned long deadline = millis() + 1500;
  while (client.connected() && millis() < deadline) {
    String line = client.readStringUntil('\n');
    if (line == "\r" || line.length() == 0) {
      break;
    }
  }
}

void sendNotFound(WiFiClient& client) {
  client.println("HTTP/1.1 404 Not Found");
  client.println("Access-Control-Allow-Origin: *");
  client.println("Connection: close");
  client.println("Content-Type: text/plain");
  client.println();
  client.println("Not found. Use /stream for MJPEG.");
}

void startCamera() {
  camera_config_t config;
  config.ledc_channel = LEDC_CHANNEL_0;
  config.ledc_timer = LEDC_TIMER_0;
  config.pin_d0 = Y2_GPIO_NUM;
  config.pin_d1 = Y3_GPIO_NUM;
  config.pin_d2 = Y4_GPIO_NUM;
  config.pin_d3 = Y5_GPIO_NUM;
  config.pin_d4 = Y6_GPIO_NUM;
  config.pin_d5 = Y7_GPIO_NUM;
  config.pin_d6 = Y8_GPIO_NUM;
  config.pin_d7 = Y9_GPIO_NUM;
  config.pin_xclk = XCLK_GPIO_NUM;
  config.pin_pclk = PCLK_GPIO_NUM;
  config.pin_vsync = VSYNC_GPIO_NUM;
  config.pin_href = HREF_GPIO_NUM;
  config.pin_sccb_sda = SIOD_GPIO_NUM;
  config.pin_sccb_scl = SIOC_GPIO_NUM;
  config.pin_pwdn = PWDN_GPIO_NUM;
  config.pin_reset = RESET_GPIO_NUM;
  config.xclk_freq_hz = 20000000;
  config.pixel_format = PIXFORMAT_JPEG;
  config.grab_mode = CAMERA_GRAB_LATEST;

  if (psramFound()) {
    config.frame_size = FRAMESIZE_QVGA;
    config.jpeg_quality = JPEG_QUALITY_PSRAM;
    config.fb_count = 2;
    config.fb_location = CAMERA_FB_IN_PSRAM;
  } else {
    config.frame_size = FRAMESIZE_QVGA;
    config.jpeg_quality = JPEG_QUALITY_DRAM;
    config.fb_count = 1;
    config.fb_location = CAMERA_FB_IN_DRAM;
  }

  esp_err_t err = esp_camera_init(&config);
  if (err != ESP_OK) {
    Serial.printf("Camera init failed with error 0x%x\n", err);
    delay(3000);
    ESP.restart();
  }

  sensor_t* sensor = esp_camera_sensor_get();
  if (sensor) {
    sensor->set_framesize(sensor, FRAMESIZE_QVGA);
    sensor->set_quality(sensor, psramFound() ? JPEG_QUALITY_PSRAM : JPEG_QUALITY_DRAM);
  }
}

void handlePreviewClient(WiFiClient client) {
  client.setTimeout(1500);
  String requestLine = client.readStringUntil('\r');
  drainHttpHeaders(client);

  if (requestLine.startsWith("GET /health")) {
    client.println("HTTP/1.1 200 OK");
    client.println("Access-Control-Allow-Origin: *");
    client.println("Cache-Control: no-cache");
    client.println("Connection: close");
    client.println("Content-Type: text/plain");
    client.println();
    client.println("OK");
    client.print("clients=");
    client.println(WiFi.softAPgetStationNum());
    client.stop();
    return;
  }

  if (requestLine.startsWith("GET /snapshot")) {
    sendSnapshot(client);
    client.stop();
    return;
  }

  if (!requestLine.startsWith("GET / ")) {
    sendNotFound(client);
    client.stop();
    return;
  }

  client.println("HTTP/1.1 200 OK");
  client.println("Access-Control-Allow-Origin: *");
  client.println("Connection: close");
  client.println("Content-Type: text/html; charset=utf-8");
  client.println();
  client.println("<!doctype html><html><head><meta name='viewport' content='width=device-width,initial-scale=1'>");
  client.println("<title>RocketCam</title></head><body style='margin:0;background:#020617;color:#67e8f9;font-family:monospace;text-align:center'>");
  client.println("<h3>RocketCam MJPEG Stream</h3>");
  client.println("<p>This page does not auto-open video, to avoid occupying the single stream.</p>");
  client.println("<p><a style='color:#67e8f9' href='http://192.168.4.1:81/stream'>Open MJPEG stream</a></p>");
  client.println("<p><a style='color:#fde68a' href='http://192.168.4.1/snapshot'>Open single JPEG snapshot</a></p>");
  client.println("<p>HUD URL: http://192.168.4.1:81/stream</p>");
  client.println("</body></html>");
  client.stop();
}

void handlePreviewServerTask(void* parameter) {
  (void)parameter;
  for (;;) {
    WiFiClient previewClient = previewServer.available();
    if (previewClient) {
      handlePreviewClient(previewClient);
    }
    vTaskDelay(pdMS_TO_TICKS(10));
  }
}

void sendSnapshot(WiFiClient& client) {
  camera_fb_t* frame = esp_camera_fb_get();
  if (!frame) {
    Serial.println("Snapshot capture failed");
    client.println("HTTP/1.1 503 Service Unavailable");
    client.println("Access-Control-Allow-Origin: *");
    client.println("Cache-Control: no-cache");
    client.println("Connection: close");
    client.println("Content-Type: text/plain");
    client.println();
    client.println("Camera capture failed");
    return;
  }

  client.println("HTTP/1.1 200 OK");
  client.println("Access-Control-Allow-Origin: *");
  client.println("Cache-Control: no-cache, no-store, must-revalidate");
  client.println("Pragma: no-cache");
  client.println("Connection: close");
  client.println("Content-Type: image/jpeg");
  client.print("Content-Length: ");
  client.println(frame->len);
  client.println();
  client.write(frame->buf, frame->len);
  esp_camera_fb_return(frame);
}

void handleStreamServerTask(void* parameter) {
  (void)parameter;
  for (;;) {
    WiFiClient streamClient = streamServer.available();
    if (streamClient) {
      if (activeStreamTask != nullptr) {
        Serial.println("New MJPEG client requested; closing previous stream client");
        activeStreamClient.stop();
        vTaskDelay(pdMS_TO_TICKS(120));
      }

      StreamClientContext* ctx = new StreamClientContext;
      if (!ctx) {
        Serial.println("Failed to allocate stream client context");
        streamClient.stop();
      } else {
        ctx->client = streamClient;
        activeStreamClient = streamClient;
        BaseType_t ok = xTaskCreatePinnedToCore(
          [](void* taskParameter) {
            StreamClientContext* taskCtx = static_cast<StreamClientContext*>(taskParameter);
            handleStreamClient(taskCtx->client);
            delete taskCtx;
            activeStreamTask = nullptr;
            vTaskDelete(nullptr);
          },
          "stream-client",
          8192,
          ctx,
          2,
          &activeStreamTask,
          1
        );
        if (ok != pdPASS) {
          Serial.println("Failed to start stream client task");
          activeStreamClient.stop();
          streamClient.stop();
          delete ctx;
          activeStreamTask = nullptr;
        }
      }
    }
    vTaskDelay(pdMS_TO_TICKS(10));
  }
}

void handleStreamClient(WiFiClient client) {
  client.setTimeout(1500);
  String requestLine = client.readStringUntil('\r');
  drainHttpHeaders(client);

  if (!requestLine.startsWith("GET /stream")) {
    sendNotFound(client);
    client.stop();
    return;
  }

  Serial.println("MJPEG client connected");
  client.println("HTTP/1.1 200 OK");
  client.println("Access-Control-Allow-Origin: *");
  client.println("Cache-Control: no-cache, no-store, must-revalidate");
  client.println("Pragma: no-cache");
  client.println("Connection: close");
  client.println("Content-Type: multipart/x-mixed-replace; boundary=frame");
  client.println();

  int captureFailures = 0;
  while (client.connected()) {
    camera_fb_t* frame = esp_camera_fb_get();
    if (!frame) {
      Serial.println("Camera capture failed");
      captureFailures++;
      if (captureFailures >= MAX_CAPTURE_FAILURES) {
        Serial.println("Too many camera capture failures, restarting...");
        client.stop();
        delay(500);
        ESP.restart();
      }
      delay(100);
      continue;
    }
    captureFailures = 0;

    client.printf("--frame\r\nContent-Type: image/jpeg\r\nContent-Length: %u\r\n\r\n", frame->len);
    size_t written = client.write(frame->buf, frame->len);
    client.print("\r\n");
    esp_camera_fb_return(frame);

    if (written != frame->len) {
      Serial.println("MJPEG client write failed");
      break;
    }

    delay(STREAM_FRAME_DELAY_MS);
  }

  client.stop();
  Serial.println("MJPEG client disconnected");
}

void startAccessPoint() {
  WiFi.mode(WIFI_AP);
  WiFi.setSleep(false);
  WiFi.softAPConfig(localIp, gateway, subnet);

  bool apStarted = strlen(AP_PASSWORD) >= 8
    ? WiFi.softAP(AP_SSID, AP_PASSWORD, AP_CHANNEL, false, AP_MAX_CLIENTS)
    : WiFi.softAP(AP_SSID, nullptr, AP_CHANNEL, false, AP_MAX_CLIENTS);

  if (!apStarted) {
    Serial.println("Wi-Fi AP start failed, restarting...");
    delay(3000);
    ESP.restart();
  }

  previewServer.begin();
  streamServer.begin();
  Serial.println("HTTP health server listening on port 80");
  Serial.println("MJPEG stream server listening on port 81");

  xTaskCreatePinnedToCore(
    handlePreviewServerTask,
    "preview-server",
    4096,
    nullptr,
    1,
    nullptr,
    0
  );
  xTaskCreatePinnedToCore(
    handleStreamServerTask,
    "stream-server",
    8192,
    nullptr,
    2,
    nullptr,
    1
  );

  Serial.println();
  Serial.println("RocketCam ready");
  Serial.print("SSID: ");
  Serial.println(AP_SSID);
  Serial.print("Password: ");
  Serial.println(strlen(AP_PASSWORD) >= 8 ? AP_PASSWORD : "(open)");
  Serial.print("Channel: ");
  Serial.println(AP_CHANNEL);
  Serial.print("Max clients: ");
  Serial.println(AP_MAX_CLIENTS);
  Serial.print("Preview: http://");
  Serial.println(WiFi.softAPIP());
  Serial.print("MJPEG: http://");
  Serial.print(WiFi.softAPIP());
  Serial.println(":81/stream");
}

void setup() {
  WRITE_PERI_REG(RTC_CNTL_BROWN_OUT_REG, 0);
  Serial.begin(115200);
  delay(300);
  Serial.println();
  Serial.println("RocketCam: boot (AI Thinker ESP32-CAM)");
  Serial.setDebugOutput(false);

  pinMode(4, OUTPUT);
  digitalWrite(4, LOW);

  startCamera();
  startAccessPoint();
}

void loop() {
  vTaskDelay(pdMS_TO_TICKS(1000));
}