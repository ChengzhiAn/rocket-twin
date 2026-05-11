# RocketCam Firmware

经典 **AI Thinker ESP32-CAM** 展会图传固件。当前版本只支持之前跑通的 ESP32-CAM 模块。

## Arduino 设置

- **Board**：`AI Thinker ESP32-CAM`
- **PSRAM**：`Enabled`
- **Port**：选择 USB 下载底板对应的 COM
- **Serial Monitor**：`115200`

烧录时如果使用无自动下载的底板，需要 `IO0` 接 `GND` 后按 `RST` 再上传；上传完成后 **断开 IO0 与 GND**，再按 `RST`，否则串口会停在 `waiting for download`，热点也不会出现。

## 运行地址

- SSID：`RocketCam`
- IP：`192.168.4.1`
- 预览页：`http://192.168.4.1/`
- MJPEG：`http://192.168.4.1:81/stream`
- 健康检查：`http://192.168.4.1/health`

HUD 视频窗口默认读取 `http://192.168.4.1:81/stream`。手机或平板需要先连接 `RocketCam` 热点。

## 常见问题

- 串口显示 `waiting for download`：仍在下载模式，断开 `IO0-GND` 后按 `RST`。
- 搜不到 `RocketCam`：确认烧录后已经复位运行、5V 供电足够、PSRAM 开启。
- 视频窗口 `SIGNAL LOST`：确认设备已连接 `RocketCam` 热点，并在浏览器打开 `http://192.168.4.1/health` 能返回 `OK`。
