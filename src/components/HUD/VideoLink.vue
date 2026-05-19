<template>
  <section class="video-link" :class="{ 'is-fullscreen': isFullscreen }">
    <div class="video-kicker">VIDEO LINK / ESP-32</div>

    <header class="video-status-bar" :class="statusClass">
      <div class="status-left">
        <span class="status-dot"></span>
        <span>{{ statusText }}</span>
      </div>
      <div class="video-bar-actions">
        <button
          v-if="videoEnabled"
          type="button"
          class="stop-btn"
          title="Stop video requests"
          @click="disableVideo"
        >
          STOP
        </button>
        <button
          type="button"
          class="flip-btn"
          :class="{ 'is-on': isFlip180 }"
          :aria-pressed="isFlip180"
          title="Correct upside-down mount (180°)"
          @click="toggleFlip180"
        >
          FLIP
        </button>
        <button type="button" class="fullscreen-btn" @click="toggleFullscreen">
          {{ isFullscreen ? 'CLOSE' : 'FULL' }}
        </button>
      </div>
    </header>

    <div class="video-frame">
      <img
        v-if="videoEnabled"
        v-show="shouldShowStream && !streamFailed"
        :key="streamKey"
        class="video-stream"
        :class="{ 'is-flipped': isFlip180 }"
        :src="imageUrl"
        alt="ESP32-CAM MJPEG stream"
        @load="handleStreamLoad"
        @error="handleStreamError"
      />

      <div v-if="!videoEnabled" class="signal-lost-panel signal-standby-panel">
        <div class="lost-title">VIDEO STANDBY</div>
        <div class="lost-subtitle">Video is off to avoid occupying RocketCam</div>
        <div class="lost-source">CONNECT TO ROCKETCAM WIFI / 192.168.4.1</div>
        <button type="button" class="reconnect-btn" @click="enableVideo">
          ENABLE VIDEO
        </button>
      </div>

      <div v-else-if="streamFailed" class="signal-lost-panel">
        <div class="lost-title">STREAM TIMEOUT</div>
        <div class="lost-subtitle">Video stream did not return frames</div>
        <div class="lost-source">MJPEG failed; retry or use snapshot fallback</div>
        <button type="button" class="reconnect-btn" @click="reconnect">
          RECONNECT VIDEO
        </button>
      </div>

      <div v-else-if="!healthOk" class="signal-lost-panel">
        <div class="lost-title">SIGNAL LOST</div>
        <div class="lost-subtitle">ESP32-CAM signal lost</div>
        <div class="lost-source">VIDEO SOURCE: ESP32-CAM / MJPEG STREAM</div>
        <button type="button" class="reconnect-btn" @click="reconnect">
          RECONNECT VIDEO
        </button>
      </div>
    </div>
  </section>
</template>

<script setup lang="ts">
import { computed, onBeforeUnmount, onMounted, ref, watch } from 'vue'
import { useRocketStore } from '../../store/rocket'

const rocketStore = useRocketStore()

const streamKey = ref(Date.now())
const videoEnabled = ref(false)
const healthOk = ref(false)
const imageLoaded = ref(false)
const streamFailed = ref(false)
const streamMode = ref<'mjpeg' | 'snapshot'>('mjpeg')
const isFullscreen = ref(false)
/** Default 180° (common inverted mount); toggling FLIP persists to localStorage */
const isFlip180 = ref(true)

const VIDEO_FLIP_STORAGE_KEY = 'rocketCamVideoFlip180'

let healthTimer: number | undefined
let snapshotTimer: number | undefined
let mjpegFallbackTimer: number | undefined
let healthPollSeq = 0
let lastStreamRestartAt = 0

const streamRetryMs = 4000
const snapshotIntervalMs = 280
const mjpegFallbackMs = 4500

const normalizedHost = computed(() => {
  return rocketStore.esp32CamHost
    .trim()
    .replace(/^https?:\/\//, '')
    .replace(/\/.*$/, '')
    .replace(/:81$/, '')
    .replace(/:80$/, '')
})

const streamUrl = computed(() => `http://${normalizedHost.value}:81/stream?cb=${streamKey.value}`)
const snapshotUrl = computed(() => `http://${normalizedHost.value}/snapshot?cb=${streamKey.value}`)
const imageUrl = computed(() => (streamMode.value === 'snapshot' ? snapshotUrl.value : streamUrl.value))
const healthUrl = computed(() => `http://${normalizedHost.value}/health`)

const shouldShowStream = computed(() => videoEnabled.value && healthOk.value)
const isLinkActive = computed(() => shouldShowStream.value && imageLoaded.value)
const statusText = computed(() => {
  if (!videoEnabled.value) return 'VIDEO STANDBY'
  if (isLinkActive.value) return 'LINK ACTIVE'
  if (streamFailed.value) return 'STREAM TIMEOUT'
  if (healthOk.value && streamMode.value === 'snapshot') return 'SNAPSHOT OPEN'
  return healthOk.value ? 'STREAM OPEN' : 'SIGNAL LOST'
})
const statusClass = computed(() => {
  if (!videoEnabled.value) return 'is-standby'
  if (streamFailed.value) return 'is-lost'
  if (healthOk.value) return 'is-active'
  return 'is-lost'
})

function restartStream(force = false) {
  if (!videoEnabled.value) return
  const now = Date.now()
  if (!force && now - lastStreamRestartAt < streamRetryMs) return

  imageLoaded.value = false
  streamFailed.value = false
  streamKey.value = now
  lastStreamRestartAt = now
  if (healthOk.value && streamMode.value === 'mjpeg') armMjpegFallbackTimer()
}

function updateHealthStatus(ok: boolean) {
  if (!videoEnabled.value) return
  const wasHealthy = healthOk.value
  healthOk.value = ok

  if (!ok) {
    imageLoaded.value = false
    return
  }

  if (!wasHealthy) {
    restartStream(true)
    return
  }

  if (!imageLoaded.value) restartStream()
}

function startHealthPolling() {
  if (healthTimer) window.clearInterval(healthTimer)
  void pollHealth()
  healthTimer = window.setInterval(pollHealth, 3000)
}

function stopHealthPolling() {
  if (healthTimer) {
    window.clearInterval(healthTimer)
    healthTimer = undefined
  }
}

function startSnapshotPolling() {
  if (snapshotTimer) window.clearInterval(snapshotTimer)
  snapshotTimer = window.setInterval(() => {
    if (videoEnabled.value && healthOk.value && streamMode.value === 'snapshot') {
      streamKey.value = Date.now()
    }
  }, snapshotIntervalMs)
}

function stopSnapshotPolling() {
  if (snapshotTimer) {
    window.clearInterval(snapshotTimer)
    snapshotTimer = undefined
  }
}

function clearMjpegFallbackTimer() {
  if (mjpegFallbackTimer) {
    window.clearTimeout(mjpegFallbackTimer)
    mjpegFallbackTimer = undefined
  }
}

function armMjpegFallbackTimer() {
  clearMjpegFallbackTimer()
  mjpegFallbackTimer = window.setTimeout(() => {
    if (videoEnabled.value && healthOk.value && streamMode.value === 'mjpeg' && !imageLoaded.value) {
      switchToSnapshotMode()
    }
  }, mjpegFallbackMs)
}

function switchToSnapshotMode() {
  clearMjpegFallbackTimer()
  streamMode.value = 'snapshot'
  imageLoaded.value = false
  streamFailed.value = false
  streamKey.value = Date.now()
  startSnapshotPolling()
}

function enableVideo() {
  videoEnabled.value = true
  streamMode.value = 'mjpeg'
  healthOk.value = false
  imageLoaded.value = false
  streamFailed.value = false
  restartStream(true)
  startHealthPolling()
}

function disableVideo() {
  stopHealthPolling()
  stopSnapshotPolling()
  clearMjpegFallbackTimer()
  videoEnabled.value = false
  healthOk.value = false
  imageLoaded.value = false
  streamFailed.value = false
  streamKey.value = Date.now()
}

function reconnect() {
  if (!videoEnabled.value) {
    enableVideo()
    return
  }
  streamMode.value = 'mjpeg'
  stopSnapshotPolling()
  healthOk.value = false
  imageLoaded.value = false
  streamFailed.value = false
  restartStream(true)
  void pollHealth()
}

function handleStreamLoad() {
  imageLoaded.value = true
  streamFailed.value = false
  if (streamMode.value === 'mjpeg') clearMjpegFallbackTimer()
}

function handleStreamError() {
  imageLoaded.value = false
  if (streamMode.value === 'mjpeg') {
    switchToSnapshotMode()
    return
  }
  streamFailed.value = true
}

function toggleFullscreen() {
  isFullscreen.value = !isFullscreen.value
}

function toggleFlip180() {
  isFlip180.value = !isFlip180.value
}

watch(isFlip180, (on) => {
  try {
    localStorage.setItem(VIDEO_FLIP_STORAGE_KEY, on ? '1' : '0')
  } catch {
    /* ignore quota / private mode */
  }
})

async function pollHealth() {
  if (!videoEnabled.value) return
  const pollSeq = ++healthPollSeq
  const ctrl = new AbortController()
  const timeout = window.setTimeout(() => ctrl.abort(), 2200)

  try {
    const response = await fetch(healthUrl.value, {
      signal: ctrl.signal,
      cache: 'no-store',
    })
    if (pollSeq === healthPollSeq) updateHealthStatus(response.ok)
  } catch {
    if (pollSeq === healthPollSeq) updateHealthStatus(false)
  } finally {
    window.clearTimeout(timeout)
  }
}

watch(normalizedHost, () => {
  if (!videoEnabled.value) return
  reconnect()
})

onMounted(() => {
  try {
    const v = localStorage.getItem(VIDEO_FLIP_STORAGE_KEY)
    if (v === '0') isFlip180.value = false
    else if (v === '1') isFlip180.value = true
    else isFlip180.value = true
  } catch {
    isFlip180.value = true
  }
  rocketStore.setVideoSource?.('ESP32_CAM')
})

onBeforeUnmount(() => {
  disableVideo()
})
</script>

<style scoped>
.video-link {
  --panel-cyan: #22d3ee;
  --panel-green: #22c55e;
  --panel-red: #fb7185;
  position: relative;
  overflow: hidden;
  border: 1px solid rgba(34, 211, 238, 0.45);
  background:
    linear-gradient(rgba(8, 47, 73, 0.16) 1px, transparent 1px),
    linear-gradient(90deg, rgba(8, 47, 73, 0.16) 1px, transparent 1px),
    rgba(2, 10, 22, 0.92);
  background-size: 4px 4px, 4px 4px, auto;
  box-shadow:
    inset 0 0 24px rgba(34, 211, 238, 0.08),
    0 0 18px rgba(34, 211, 238, 0.12);
  color: #cffafe;
  min-height: 176px;
}

.video-link::before {
  content: '';
  position: absolute;
  inset: 0;
  pointer-events: none;
  background: repeating-linear-gradient(
    to bottom,
    rgba(255, 255, 255, 0.04) 0,
    rgba(255, 255, 255, 0.04) 1px,
    transparent 1px,
    transparent 4px
  );
  mix-blend-mode: screen;
}

.video-kicker {
  position: absolute;
  top: -14px;
  left: 0;
  font-size: 9px;
  letter-spacing: 0.16em;
  color: rgba(207, 250, 254, 0.72);
  text-shadow: 0 0 6px rgba(34, 211, 238, 0.45);
}

.video-status-bar {
  position: relative;
  z-index: 1;
  display: flex;
  align-items: center;
  justify-content: space-between;
  height: 22px;
  padding: 0 0 0 8px;
  border-bottom: 1px solid rgba(34, 211, 238, 0.35);
  background: linear-gradient(90deg, rgba(8, 47, 73, 0.95), rgba(12, 74, 110, 0.82));
  font-size: 10px;
  font-weight: 800;
  letter-spacing: 0.22em;
}

.status-left {
  display: flex;
  align-items: center;
  gap: 7px;
}

.status-dot {
  width: 8px;
  height: 8px;
  border-radius: 999px;
  box-shadow: 0 0 10px currentColor;
}

.is-active .status-dot {
  color: var(--panel-green);
  background: var(--panel-green);
}

.is-lost .status-dot {
  color: var(--panel-red);
  background: var(--panel-red);
}

.is-standby .status-dot {
  color: #facc15;
  background: #facc15;
}

.video-bar-actions {
  display: flex;
  align-self: stretch;
  flex-shrink: 0;
}

.stop-btn,
.flip-btn,
.fullscreen-btn {
  align-self: stretch;
  min-width: 44px;
  padding: 0 6px;
  border-left: 1px solid rgba(34, 211, 238, 0.35);
  background: rgba(14, 116, 144, 0.38);
  color: #a5f3fc;
  font-size: 9px;
  font-weight: 800;
  letter-spacing: 0.12em;
}

.stop-btn {
  background: rgba(127, 29, 29, 0.4);
  color: #fecdd3;
}

.flip-btn {
  min-width: 48px;
  letter-spacing: 0.08em;
}

.flip-btn.is-on {
  background: rgba(34, 211, 238, 0.22);
  color: #ecfeff;
  box-shadow: inset 0 0 12px rgba(34, 211, 238, 0.15);
}

.video-frame {
  position: relative;
  z-index: 1;
  display: flex;
  align-items: center;
  justify-content: center;
  min-height: 132px;
  background: rgba(0, 0, 0, 0.38);
}

.video-stream {
  display: block;
  width: 100%;
  height: 160px;
  object-fit: cover;
  image-rendering: auto;
  transition: transform 0.2s ease;
}

.video-stream.is-flipped {
  transform: rotate(180deg);
  transform-origin: center center;
}

.signal-lost-panel {
  width: 100%;
  min-height: 150px;
  display: flex;
  flex-direction: column;
  align-items: center;
  justify-content: center;
  gap: 9px;
  text-align: center;
  background:
    radial-gradient(circle at center, rgba(127, 29, 29, 0.18), transparent 58%),
    rgba(2, 6, 23, 0.82);
}

.signal-standby-panel {
  background:
    radial-gradient(circle at center, rgba(202, 138, 4, 0.14), transparent 58%),
    rgba(2, 6, 23, 0.82);
}

.signal-standby-panel .lost-title {
  color: #fde68a;
  text-shadow: 0 0 10px rgba(250, 204, 21, 0.62);
}

.lost-title {
  color: #fda4af;
  font-size: 18px;
  font-weight: 900;
  letter-spacing: 0.38em;
  text-indent: 0.38em;
  text-shadow: 0 0 10px rgba(248, 113, 113, 0.75);
}

.lost-subtitle {
  color: rgba(207, 250, 254, 0.56);
  font-size: 10px;
  letter-spacing: 0.18em;
}

.lost-source {
  color: rgba(34, 211, 238, 0.74);
  font-size: 10px;
  font-weight: 800;
  letter-spacing: 0.16em;
}

.reconnect-btn {
  border: 1px solid rgba(34, 211, 238, 0.55);
  background: rgba(8, 145, 178, 0.22);
  color: #a5f3fc;
  font-weight: 900;
  letter-spacing: 0.18em;
  box-shadow: inset 0 0 14px rgba(34, 211, 238, 0.08);
  margin-top: 4px;
  padding: 7px 16px;
  font-size: 10px;
}

.is-fullscreen {
  position: fixed;
  inset: 5vh 5vw;
  z-index: 80;
}

.is-fullscreen .video-frame {
  min-height: calc(90vh - 70px);
}

.is-fullscreen .video-stream {
  height: calc(90vh - 70px);
  object-fit: contain;
}
</style>
