<template>
  <div
    ref="rootRef"
    class="video-link rounded-md border border-cyan-500/40 bg-slate-950/90 px-2 py-2 text-[10px] text-cyan-100 shadow-lg backdrop-blur-sm"
  >
    <div class="mb-1 flex flex-wrap items-center justify-between gap-1">
      <span class="font-bold tracking-wide text-cyan-300">VIDEO</span>
      <div class="flex gap-1">
        <button
          type="button"
          class="rounded px-1.5 py-0.5 font-bold"
          :class="isEsp32 ? 'bg-cyan-600 text-white' : 'bg-slate-800 text-cyan-500'"
          @click="rocketStore.setVideoSource('ESP32_CAM')"
        >
          ESP32
        </button>
        <button
          type="button"
          class="rounded px-1.5 py-0.5 font-bold"
          :class="isHm30 ? 'bg-cyan-600 text-white' : 'bg-slate-800 text-cyan-500'"
          @click="rocketStore.setVideoSource('HM30_RTSP')"
        >
          HM30
        </button>
      </div>
    </div>

    <div v-if="isEsp32" class="space-y-1">
      <div class="flex items-center gap-1">
        <label class="text-cyan-600">HOST</label>
        <input
          v-model="hostDraft"
          class="min-w-0 flex-1 rounded border border-cyan-700/50 bg-slate-900 px-1 py-0.5 font-mono text-cyan-100"
          placeholder="192.168.4.1"
          @change="applyHost"
          @keyup.enter="applyHost"
        />
      </div>
      <div class="relative overflow-hidden rounded border border-cyan-800/60 bg-black">
        <img
          v-show="streamEnabled"
          :key="imgKey"
          :src="imgSrc"
          alt="MJPEG"
          class="mx-auto max-h-[min(40vh,280px)] w-full object-contain"
          crossorigin="anonymous"
          @error="onImgError"
          @load="onImgLoad"
        />
        <div
          v-if="!streamOnline && streamEnabled"
          class="absolute inset-0 flex items-center justify-center bg-black/70 text-[10px] text-amber-300"
        >
          SIGNAL LOST
        </div>
      </div>
      <div class="flex justify-between gap-1 text-[9px] text-cyan-600">
        <span>{{ healthLine }}</span>
        <button type="button" class="text-cyan-400 underline" @click="reconnect">RECONNECT</button>
      </div>
    </div>

    <div v-else class="space-y-1">
      <div class="flex items-center gap-1">
        <label class="text-cyan-600">RTSP</label>
        <input
          v-model="rtspDraft"
          class="min-w-0 flex-1 rounded border border-cyan-700/50 bg-slate-900 px-1 py-0.5 font-mono text-[9px] text-cyan-100"
          @change="persistRtsp"
        />
      </div>
      <div
        ref="hm30HostRef"
        class="flex min-h-[120px] items-center justify-center rounded border border-dashed border-cyan-700/50 bg-slate-900/80 p-2 text-center text-[10px] text-cyan-500"
      >
        <template v-if="isAndroid">
          <span>Native RTSP overlay is attached to this area.</span>
        </template>
        <template v-else>
          <span>HM30 RTSP is available in the Android app. Use ESP32 for web preview.</span>
        </template>
      </div>
    </div>
  </div>
</template>

<script setup lang="ts">
import { computed, ref, watch, onMounted, onBeforeUnmount, nextTick } from 'vue'
import { Capacitor } from '@capacitor/core'
import { useRocketStore } from '../../store/rocket'
import { NativeVideo } from '../../plugins/nativeVideo'

const rocketStore = useRocketStore()
const rootRef = ref<HTMLElement | null>(null)
const hm30HostRef = ref<HTMLElement | null>(null)

const isEsp32 = computed(() => rocketStore.videoSource === 'ESP32_CAM')
const isHm30 = computed(() => rocketStore.videoSource === 'HM30_RTSP')
const isAndroid = Capacitor.isNativePlatform() && Capacitor.getPlatform() === 'android'

const hostDraft = ref(rocketStore.esp32CamHost)
const imgKey = ref(0)
const streamEnabled = ref(true)
const streamOnline = ref(true)
const healthLine = ref('-')

const RTSP_KEY = 'rocket_hm30_rtsp'
const rtspDraft = ref(localStorage.getItem(RTSP_KEY) || 'rtsp://192.168.144.25:8554/H264')

const imgSrc = computed(() => {
  const h = rocketStore.esp32CamHost.replace(/\/$/, '')
  return `http://${h}:81/stream?cb=${imgKey.value}`
})

function applyHost() {
  rocketStore.setEsp32CamHost(hostDraft.value)
  reconnect()
}

function persistRtsp() {
  localStorage.setItem(RTSP_KEY, rtspDraft.value.trim())
  syncHm30Native()
}

function reconnect() {
  streamEnabled.value = true
  streamOnline.value = true
  imgKey.value = Date.now()
}

function onImgError() {
  streamOnline.value = false
}

function onImgLoad() {
  streamOnline.value = true
}

let healthTimer: number | undefined

async function pollHealth() {
  if (!isEsp32.value) return
  const h = rocketStore.esp32CamHost.replace(/\/$/, '')
  const url = `http://${h}/health`
  try {
    const ctrl = new AbortController()
    const t = window.setTimeout(() => ctrl.abort(), 2500)
    const res = await fetch(url, { signal: ctrl.signal, cache: 'no-store' })
    window.clearTimeout(t)
    if (res.ok) {
      healthLine.value = 'health OK'
      streamOnline.value = true
    } else {
      healthLine.value = `health ${res.status}`
    }
  } catch {
    healthLine.value = 'health -'
  }
}

async function syncHm30Native() {
  if (!isHm30.value || !isAndroid) {
    try {
      await NativeVideo.remove()
    } catch {
      // noop
    }
    return
  }
  await nextTick()
  const el = hm30HostRef.value
  if (!el) return
  const r = el.getBoundingClientRect()
  const w = window.innerWidth || 1
  const h = window.innerHeight || 1
  const bounds = {
    x: r.left / w,
    y: r.top / h,
    width: r.width / w,
    height: r.height / h,
  }
  try {
    await NativeVideo.embed({ url: rtspDraft.value.trim(), bounds })
  } catch (e) {
    console.warn('NativeVideo.embed', e)
  }
}

watch(
  () => rocketStore.videoSource,
  async (s) => {
    if (s === 'HM30_RTSP') await syncHm30Native()
    else {
      try {
        await NativeVideo.remove()
      } catch {
        // noop
      }
    }
  }
)

watch(
  () => rocketStore.esp32CamHost,
  () => {
    hostDraft.value = rocketStore.esp32CamHost
    reconnect()
  }
)

onMounted(() => {
  hostDraft.value = rocketStore.esp32CamHost
  pollHealth()
  healthTimer = window.setInterval(pollHealth, 4000)
  syncHm30Native()
  window.addEventListener('resize', syncHm30Native)
})

onBeforeUnmount(() => {
  if (healthTimer) window.clearInterval(healthTimer)
  window.removeEventListener('resize', syncHm30Native)
  NativeVideo.remove().catch(() => {})
})
</script>
