# RocketCam Firmware

经典 **AI Thinker ESP32-CAM** 展会图传固件。当前版本只支持之前跑通的 ESP32-CAM 模块。

## Arduino 设置

- **Board**：`AI Thinker ESP32-CAM`
- **PSRAM**：`Enabled`
- **Port**：选择 USB 下载底板对应的 COM
- **Serial Monitor**：`115200`

烧录时如果使用无自动下载的底板，需要 `IO0` 接 `GND` 后按 `RST` 再上传；上传完成后 **断开 IO0 与 GND**，再按 `RST`，否则串口会停在 `waiting for download`，热点也不会出现。

## 运行地址

- SSID：`LH-RocketCam-9527`
- 密码：`rocket9527`
- 固定信道：`6`
- 最大客户端数：`1`
- IP：`192.168.4.1`
- 预览页：`http://192.168.4.1/`
- MJPEG：`http://192.168.4.1:81/stream`
- 单帧快照：`http://192.168.4.1/snapshot`
- 健康检查：`http://192.168.4.1/health`

HUD 视频窗口默认不自动拉流，避免多台展示设备抢占 ESP32-CAM 的单路 MJPEG。真正需要播放视频的手机或平板先连接 `LH-RocketCam-9527` 热点，再在 HUD 中点击 `ENABLE VIDEO`。若设备浏览器或 WebView 对 MJPEG 长连接兼容性较差，HUD 会自动降级为 `/snapshot` 单帧轮询。

## 常见问题

- 串口显示 `waiting for download`：仍在下载模式，断开 `IO0-GND` 后按 `RST`。
- 搜不到 `LH-RocketCam-9527`：确认烧录后已经复位运行、5V 供电足够、PSRAM 开启。
- 视频窗口 `SIGNAL LOST`：确认设备已连接 `LH-RocketCam-9527` 热点，并在浏览器打开 `http://192.168.4.1/health` 能返回 `OK`。
- 浏览器 `/stream` 只出一帧就卡住：这是部分 Android WebView/浏览器对 MJPEG 长连接兼容性较差，可在 HUD 中使用自动降级后的 snapshot 模式。
- 展会现场画面卡顿：当前固件已降低到约 10fps，并固定 2.4GHz 信道。若仍卡顿，可在 `RocketCam.ino` 中调整 `AP_CHANNEL` 为 `1`、`6` 或 `11` 里现场最空的信道。
