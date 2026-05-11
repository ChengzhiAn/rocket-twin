/*
  RocketCam firmware for the Lenghu Rocket HUD demo.

  Hardware:
  - Classic AI Thinker ESP32-CAM with OV2640
  - PSRAM enabled in Arduino IDE

  Network:
  - AP SSID: RocketCam
  - Preview: http://192.168.4.1/
  - MJPEG:   http://192.168.4.1:81/stream
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

const char* AP_SSID = "RocketCam";
const char* AP_PASSWORD = "";

IPAddress localIp(192, 168, 4, 1);
IPAddress gateway(192, 168, 4, 1);
IPAddress subnet(255, 255, 255, 0);

WiFiServer previewServer(80);
WiFiServer streamServer(81);

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
    config.jpeg_quality = 12;
    config.fb_count = 2;
    config.fb_location = CAMERA_FB_IN_PSRAM;
  } else {
    config.frame_size = FRAMESIZE_QVGA;
    config.jpeg_quality = 14;
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
    sensor->set_quality(sensor, psramFound() ? 12 : 14);
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
  client.println("<img src='http://192.168.4.1:81/stream' style='max-width:100%;height:auto'>");
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

  while (client.connected()) {
    camera_fb_t* frame = esp_camera_fb_get();
    if (!frame) {
      Serial.println("Camera capture failed");
      delay(100);
      continue;
    }

    client.printf("--frame\r\nContent-Type: image/jpeg\r\nContent-Length: %u\r\n\r\n", frame->len);
    size_t written = client.write(frame->buf, frame->len);
    client.print("\r\n");
    esp_camera_fb_return(frame);

    if (written == 0) {
      break;
    }

    delay(40);
  }

  client.stop();
  Serial.println("MJPEG client disconnected");
}

void startAccessPoint() {
  WiFi.mode(WIFI_AP);
  WiFi.setSleep(false);
  WiFi.softAPConfig(localIp, gateway, subnet);

  bool apStarted = strlen(AP_PASSWORD) >= 8
    ? WiFi.softAP(AP_SSID, AP_PASSWORD)
    : WiFi.softAP(AP_SSID);

  if (!apStarted) {
    Serial.println("Wi-Fi AP start failed, restarting...");
    delay(3000);
    ESP.restart();
  }

  previewServer.begin();
  streamServer.begin();
  xTaskCreatePinnedToCore(
    handlePreviewServerTask,
    "preview-server",
    4096,
    nullptr,
    1,
    nullptr,
    0
  );

  Serial.println();
  Serial.println("RocketCam ready");
  Serial.print("SSID: ");
  Serial.println(AP_SSID);
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
  WiFiClient streamClient = streamServer.available();
  if (streamClient) {
    handleStreamClient(streamClient);
  }
}