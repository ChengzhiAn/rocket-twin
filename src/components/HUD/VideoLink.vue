<template>
  <section class="video-link" :class="{ 'is-fullscreen': isFullscreen }">
    <div class="video-kicker">VIDEO LINK / ESP-32</div>

    <header class="video-status-bar" :class="isLinkActive ? 'is-active' : 'is-lost'">
      <div class="status-left">
        <span class="status-dot"></span>
        <span>{{ isLinkActive ? 'LINK ACTIVE' : 'SIGNAL LOST' }}</span>
      </div>
      <div class="video-bar-actions">
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
        v-show="isLinkActive"
        :key="streamKey"
        class="video-stream"
        :class="{ 'is-flipped': isFlip180 }"
        :src="streamUrl"
        alt="ESP32-CAM MJPEG stream"
        @load="handleStreamLoad"
        @error="handleStreamError"
      />

      <div v-if="!isLinkActive" class="signal-lost-panel">
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
const healthOk = ref(false)
const imageLoaded = ref(false)
const isFullscreen = ref(false)
/** Default 180° (common inverted mount); toggling FLIP persists to localStorage */
const isFlip180 = ref(true)

const VIDEO_FLIP_STORAGE_KEY = 'rocketCamVideoFlip180'

let healthTimer: number | undefined
let healthPollSeq = 0
let lastStreamRestartAt = 0

const streamRetryMs = 4000

const normalizedHost = computed(() => {
  return rocketStore.esp32CamHost
    .trim()
    .replace(/^https?:\/\//, '')
    .replace(/\/.*$/, '')
    .replace(/:81$/, '')
    .replace(/:80$/, '')
})

const streamUrl = computed(() => `http://${normalizedHost.value}:81/stream?cb=${streamKey.value}`)
const healthUrl = computed(() => `http://${normalizedHost.value}/health`)

const isLinkActive = computed(() => healthOk.value && imageLoaded.value)

function restartStream(force = false) {
  const now = Date.now()
  if (!force && now - lastStreamRestartAt < streamRetryMs) return

  imageLoaded.value = false
  streamKey.value = now
  lastStreamRestartAt = now
}

function updateHealthStatus(ok: boolean) {
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

  if (!imageLoaded.value) {
    restartStream()
  }
}

function reconnect() {
  healthOk.value = false
  restartStream(true)
  void pollHealth()
}

function handleStreamLoad() {
  imageLoaded.value = true
}

function handleStreamError() {
  imageLoaded.value = false
  if (healthOk.value) restartStream()
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
  pollHealth()
  healthTimer = window.setInterval(pollHealth, 3000)
})

onBeforeUnmount(() => {
  if (healthTimer) window.clearInterval(healthTimer)
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

.video-bar-actions {
  display: flex;
  align-self: stretch;
  flex-shrink: 0;
}

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
