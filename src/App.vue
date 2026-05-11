<template>
  <div class="hud-container font-mono">
    <!-- 1. 3D 背景渲染层 -->
    <div class="scene-layer">
      <RocketScene />
    </div>

    <!-- 2. UI 覆盖层 (HUD) -->
    <div class="hud-overlay pointer-events-none">
    <div v-if="rocketStore.showSerialSuccessToast" class="fixed top-1/2 left-1/2 -translate-x-1/2 -translate-y-1/2 z-50 pointer-events-auto bg-cyan-900/90 border border-cyan-400 px-8 py-4 rounded-lg text-cyan-100 font-bold text-lg shadow-[0_0_30px_rgba(34,211,238,0.5)]">
      ✅ 串口连接成功！正在接收数据
    </div>
    <div
      v-if="rocketStore.showSerialErrorToast"
      class="fixed top-1/2 left-1/2 -translate-x-1/2 -translate-y-1/2 z-[51] pointer-events-auto max-w-[min(90vw,24rem)] px-6 py-4 rounded-lg border-2 border-red-400/80 bg-red-950/95 text-red-100 text-sm sm:text-base font-bold leading-relaxed text-center shadow-[0_0_28px_rgba(248,113,113,0.35)] whitespace-pre-wrap"
    >
      {{ rocketStore.serialErrorMessage }}
    </div>
    <div
      v-if="rocketStore.showPadLocationToast"
      class="fixed top-1/2 left-1/2 -translate-x-1/2 -translate-y-1/2 z-[52] pointer-events-auto max-w-[min(92vw,26rem)] px-6 py-4 rounded-lg border-2 border-amber-400/85 bg-amber-950/95 text-amber-50 text-sm sm:text-base font-bold leading-relaxed text-center shadow-[0_0_28px_rgba(251,191,36,0.35)] whitespace-pre-wrap"
      role="alert"
    >
      <div class="mb-2 text-amber-200/95 text-xs font-semibold tracking-wide">发射架位置（本机 GPS）</div>
      {{ rocketStore.padLocationToastMessage }}
      <button
        type="button"
        class="mt-4 w-full py-2 rounded-md border border-amber-500/60 text-amber-100 text-xs font-bold hover:bg-amber-900/50 transition-colors"
        @click="rocketStore.dismissPadLocationToast()"
      >
        知道了
      </button>
    </div>
      
      <!-- [顶部] 任务信息条 -->
      <header class="hud-header pointer-events-auto">
        <div class="mission-timer text-cyan-400">
          <span class="text-xs text-gray-500 mr-2">MISSION TIME</span>
          {{ rocketStore.formattedTime }}
        </div>
        <div class="system-title-container">
          <div class="system-title text-shadow-glow">
            冷湖火箭数字孪生系统
          </div>
          <div class="system-subtitle-en">
            LENGHU ROCKET DIGITAL TWIN SYSTEM
          </div>
        </div>
        <div class="header-right-area pointer-events-auto flex items-center gap-3">
        <div class="real-clock text-gray-400">
          {{ realTime }}
        </div>
        <!-- 导出按钮（发射后才显示） -->
        <div
          v-if="rocketStore.isLaunched"
          class="export-btn"
          role="button"
          tabindex="0"
          @click="rocketStore.exportFlightData()"
          @keydown.enter.prevent="rocketStore.exportFlightData()"
          @keydown.space.prevent="rocketStore.exportFlightData()"
        >
          <span class="export-btn-icon" aria-hidden="true">💾</span>
          <span class="export-btn-text">导出本次数据</span>
        </div>
        <!-- 重置按钮 -->
        <div class="reset-btn" @click="rocketStore.resetAll()">
          <span>🔄 重置系统</span>
        </div>
       </div> 
      </header>

      <!-- [主体] 左右数据面板 -->
      <main class="hud-main">
        <!-- 左侧：动力学参数区 (Kinematics) -->
        <aside class="hud-side-left pointer-events-auto">
          <div class="section-label">KINEMATICS / 动力学</div>
          
          <div class="kinematics-metrics">
            <!-- 过载 G 值 -->
            <div class="data-item metric-primary">
              <div class="label">G-FORCE</div>
              <div class="value-row">
                <span class="value">{{ (rocketStore.gForce || 0).toFixed(2) }}</span>
                <span class="unit">G</span>
              </div>
              <div class="progress-bg">
                <div class="progress-bar" :style="{ width: Math.min((rocketStore.gForce / 5) * 100, 100) + '%' }"></div>
              </div>
            </div>

            <!-- 垂直速度 -->
            <div class="data-item">
              <div class="label">VERT. VELOCITY</div>
              <div class="value-row">
                <span class="value">{{ (rocketStore.verticalSpeed || 0).toFixed(1) }}</span>
                <span class="unit">m/s</span>
              </div>
            </div>

            <!-- 加速度三轴分布 -->
            <div class="data-item metric-wide">
              <div class="label">ACCELERATION (X/Y/Z)</div>
              <div class="grid grid-cols-3 gap-2 quat-stream-text">
                <div class="bg-cyan-900/20 p-2 rounded-sm border border-cyan-500/10">X: {{ rocketStore.acc?.x.toFixed(2) }}</div>
                <div class="bg-cyan-900/20 p-2 rounded-sm border border-cyan-500/10">Y: {{ rocketStore.acc?.y.toFixed(2) }}</div>
                <div class="bg-cyan-900/20 p-2 rounded-sm border border-cyan-500/10">Z: {{ rocketStore.acc?.z.toFixed(2) }}</div>
              </div>
            </div>
          </div>

          <!-- 飞行剖面图表 (高度适配，解决文字遮挡) -->
          <div class="data-item chart-container-l border-t border-cyan-500/20 pt-4">
            <div class="label">FLIGHT PROFILE / 轨迹记录</div>
            <FlightChart />
          </div>

          <!-- 视频链路窗口：ESP32-CAM MJPEG -->
          <div class="data-item video-link-container border-t border-cyan-500/20 pt-3">
            <div class="label">VIDEO LINK / 实时画面</div>
            <VideoLink />
          </div>
        </aside>

        <!-- [中间] 交互与瞄准区 -->
        <section class="hud-center">
          <!-- 发射按钮及选手登记区：仅在未发射时显示 -->
          <div v-if="!rocketStore.isLaunched" ref="launchControlAreaRef" class="launch-control-area" :style="launchControlAreaStyle">
            <!-- 选手登记区 -->
            <div class="student-input-wrapper pointer-events-auto flex flex-col items-center">
              <div class="text-cyan-500 text-xs mb-1 tracking-widest font-bold">PILOT ID / 选手登记</div>
              <input 
                type="text" 
                v-model="rocketStore.currentStudentName" 
                placeholder="输入参赛姓名或代号..." 
                class="bg-cyan-900/30 border border-cyan-500/50 text-cyan-100 px-4 py-2 w-64 text-center focus:outline-none focus:border-cyan-300 focus:shadow-[0_0_15px_rgba(34,211,238,0.5)] transition-all"
              />
            </div>
            
            <!-- 数据同步：模拟=同步地面基准并发射；实时=同步并开始记录 LoRa（供导出） -->
            <button type="button" class="launch-btn pointer-events-auto" @click="rocketStore.dataSyncAction">
              <div class="btn-content">
                <span class="btn-status-text">{{ rocketStore.isDemoMode ? 'SIM / 同步并发射' : 'LIVE / 同步并开始记录' }}</span>
                <span class="btn-main-text">数据同步 DATA SYNC</span>
              </div>
              <div class="btn-scan"></div>
            </button>
          </div>

          <!-- 瞄准框：发射后显示，随窗口自动缩放 -->
          <div v-if="rocketStore.isLaunched" class="targeting-reticle">
            <div class="reticle-bracket bracket-tl"></div>
            <div class="reticle-bracket bracket-tr"></div>
            <div class="reticle-bracket bracket-bl"></div>
            <div class="reticle-bracket bracket-br"></div>
        
            <div class="reticle-data">
              <!-- 左侧：俯仰 -->
              <div class="data-item-float left-side">
                <div class="float-label">PITCH</div>
                <div class="float-value">{{ rocketStore.pitch.toFixed(1) }}°</div>
              </div>
              <!-- 右侧：偏航 -->
              <div class="data-item-float right-side">
                <div class="float-label">YAW</div>
                <div class="float-value">{{ rocketStore.yaw.toFixed(1) }}°</div>
              </div>
              <!-- 顶部：滚转水平仪（原在底部易被「结束同步」遮挡，改到框上沿上方） -->
              <div class="data-item-float roll-side-top">
                <div class="float-label">ROLL</div>
                <div class="float-value">{{ rocketStore.roll.toFixed(1) }}°</div>
                <div class="roll-container">
                  <div class="roll-scale-bg"></div>
                  <div class="roll-horizon-bar" :style="{ transform: `rotate(${-rocketStore.roll}deg)` }"></div>
                </div>
              </div>
            </div>
            <div class="center-cross"></div>
          </div>

          <!-- 同步进行中：原「数据同步」位置显示「结束同步」，与右侧归零校准底边对齐 -->
          <div
            v-if="rocketStore.isLaunched && rocketStore.isFlightRecording"
            ref="endSyncControlRef"
            class="launch-control-area"
            :style="launchControlAreaStyle"
          >
            <button type="button" class="launch-btn launch-btn-end-sync pointer-events-auto" @click="rocketStore.endSyncRecording">
              <div class="btn-content">
                <span class="btn-status-text">{{ rocketStore.isDemoMode ? 'SIM / 停止记录样本' : 'LIVE / 停止记录样本' }}</span>
                <span class="btn-main-text">结束同步 END SYNC</span>
              </div>
              <div class="btn-scan"></div>
            </button>
          </div>
        </section>

        <!-- 右侧：姿态与动态区 (Attitude) -->
        <aside class="hud-side-right pointer-events-auto">
          <div class="section-label text-right">ATTITUDE / 姿态控制</div>

          <!-- 实时姿态 -->
          <div class="data-item text-right">
            <div class="label">PITCH / YAW / ROLL</div>
            <div class="value text-cyan-400">
              {{ rocketStore.pitch.toFixed(1) }}° / {{ rocketStore.yaw.toFixed(1) }}° / {{ rocketStore.roll.toFixed(1) }}°
            </div>
          </div>

          <!-- 陀螺仪旋转频率 -->
          <div class="data-item text-right">
            <div class="label">GYRO ROTATION (deg/s)</div>
            <div class="flex justify-end gap-3 quat-stream-text font-bold">
              <span class="text-red-400">X:{{ rocketStore.gyro?.x.toFixed(0) }}</span>
              <span class="text-green-400">Y:{{ rocketStore.gyro?.y.toFixed(0) }}</span>
              <span class="text-blue-400">Z:{{ rocketStore.gyro?.z.toFixed(0) }}</span>
            </div>
          </div>

          <!-- 原始四元数流 (整理过的小字号类名) -->
          <div class="data-item text-right quat-stream-container">
            <div class="label">QUATERNION STREAM</div>
            <div class="quat-stream-text">
              W:{{ rocketStore.quat_raw?.w.toFixed(4) }} X:{{ rocketStore.quat_raw?.x.toFixed(4) }}
              Y:{{ rocketStore.quat_raw?.y.toFixed(4) }} Z:{{ rocketStore.quat_raw?.z.toFixed(4) }}
            </div>
          </div>

          <!-- 姿态雷达图 -->
          <div class="data-item chart-container-r border-t border-cyan-500/20 pt-4">
             <AttitudeChart />
          </div>

          <div class="data-item relative-position-panel border-t border-cyan-500/15 pt-3 flex flex-col flex-1 min-h-0">
            <RelativePositionRadar />
          </div>

          <div class="data-item source-control-panel mt-auto pt-6 border-t border-cyan-500/30">
            <!-- 1. 原有的模式切换按钮 -->
            <button 
              class="mode-toggle-btn w-full mb-3"
              :class="rocketStore.isDemoMode ? 'bg-orange-500/20 border-orange-500 text-orange-400' : 'bg-cyan-500/20 border-cyan-500 text-cyan-400'"
              @click="rocketStore.toggleMode()"
            >
              <span class="indicator" :class="rocketStore.isDemoMode ? 'bg-orange-400 shadow-[0_0_8px_#f97316]' : 'bg-cyan-400 shadow-[0_0_8px_#22d3ee]'"></span>
              {{ rocketStore.isDemoMode ? '模拟模式 SIMULATION MODE' : '实时遥测 LIVE TELEMETRY' }}
            </button>

            <!-- LoRa 串口：始终同一按钮发起/重连，链路状态见右下角 HUD -->
            <button
              type="button"
              class="mode-toggle-btn w-full border-purple-500 text-purple-400 bg-purple-500/10 hover:bg-purple-500/20"
              @click="handleConnectSerial"
            >
              <span class="w-2 h-2 rounded-full mr-3 bg-purple-400 shadow-[0_0_8px_#a855f7]"></span>
              🔌 连接 LoRa 串口
            </button>

            <!-- 3. 【新增】一键归零校准按钮 -->
            <button
              ref="calibrateZeroBtnRef"
              class="mode-toggle-btn w-full mt-2 border-green-500 text-green-400 bg-green-500/10 hover:bg-green-500/20"
              @click="rocketStore.calibrateZero"
            >
              <span class="w-2 h-2 rounded-full mr-3 bg-green-400 shadow-[0_0_8px_#22c55e]"></span>
              🎯 归零校准（水平放置后点击）
            </button>
          </div>
        </aside>
      </main>

      <!-- [底部] 环境监测条 (已调小且改为摄氏度) -->
      <footer class="hud-footer pointer-events-auto">
        <div class="env-group">
          <div class="env-box">
            <span class="label">海拔 AMSL</span>
            <span class="val">{{ rocketStore.altitudeMsl.toFixed(1) }}</span><span class="u">m</span>
          </div>
          <div class="env-box">
            <span class="label">离地 AGL</span>
            <span class="val">{{ rocketStore.heightAboveGround.toFixed(1) }}</span><span class="u">m</span>
          </div>
          <div class="env-box">
            <span class="label">PRESSURE</span>
            <span class="val">{{ rocketStore.pressure.toFixed(0) }}</span><span class="u">Pa</span>
          </div>
          <div class="env-box">
            <span class="label">AMBIENT TEMP</span>
            <span class="val">{{ rocketStore.temperature.toFixed(1) }}</span><span class="u">°C</span>
          </div>
        </div>
        <div class="system-logs">
          <!-- 动态绑定颜色类名和文字 -->
          <div class="log-item font-bold" :class="linkStatusColor">
            {{ linkStatusText }}
          </div>
          <div class="log-item opacity-60">
            {{ sensorStatusText }}
          </div>
        </div>
      </footer>
    </div>

    <!-- 结束同步后：根据已记录样本生成的数据简报（居中，可关闭） -->
    <div
      v-if="rocketStore.syncBriefing"
      class="sync-briefing-layer pointer-events-auto"
      role="dialog"
      aria-modal="true"
      aria-labelledby="sync-briefing-title"
    >
      <div class="sync-briefing-backdrop" @click="rocketStore.dismissSyncBriefing()" />
      <article class="sync-briefing-panel" @click.stop>
        <header class="sync-briefing-header">
          <h2 id="sync-briefing-title" class="sync-briefing-title">数据简报</h2>
          <p class="sync-briefing-sub">
            <span class="text-cyan-200/90">{{ rocketStore.syncBriefing.pilotName }}</span>
            <span class="mx-2 text-cyan-600">·</span>
            <span :class="rocketStore.syncBriefing.isDemoMode ? 'text-amber-400' : 'text-cyan-400'">
              {{ rocketStore.syncBriefing.isDemoMode ? '模拟数据' : '实时遥测' }}
            </span>
          </p>
        </header>

        <div v-if="rocketStore.syncBriefing.sampleCount === 0" class="sync-briefing-empty text-amber-200/90 text-sm py-2">
          本段同步窗口内未采集到样本（可能记录时间过短）。仍可继续飞行或导出检查。
        </div>

        <div v-else class="sync-briefing-body">
          <section class="sb-card">
            <h3 class="sb-card-title">基础记录</h3>
            <div class="sb-pair">
              <div class="sb-tile">
                <span class="sb-tile-label">采样点数</span>
                <span class="sb-tile-value">{{ rocketStore.syncBriefing.sampleCount }}</span>
              </div>
              <div class="sb-tile">
                <span class="sb-tile-label">记录时长</span>
                <span class="sb-tile-value">{{ rocketStore.syncBriefing.durationSec.toFixed(2) }} s</span>
              </div>
            </div>
            <div class="sb-pair">
              <div class="sb-tile">
                <span class="sb-tile-label">约采样率</span>
                <span class="sb-tile-value">{{ rocketStore.syncBriefing.avgSampleRateHz.toFixed(1) }} Hz</span>
              </div>
              <div class="sb-tile">
                <span class="sb-tile-label">最大离地高度 AGL</span>
                <span class="sb-tile-value">{{ rocketStore.syncBriefing.maxHeightAglM.toFixed(2) }} m</span>
              </div>
            </div>
            <div class="sb-pair">
              <div class="sb-tile">
                <span class="sb-tile-label">最大速度（全程）</span>
                <span class="sb-tile-value">{{ rocketStore.syncBriefing.maxVelocityMs.toFixed(2) }} m/s</span>
              </div>
              <div class="sb-tile">
                <span class="sb-tile-label">最大合加速度等效</span>
                <span class="sb-tile-value">{{ rocketStore.syncBriefing.maxAccG.toFixed(2) }} G</span>
              </div>
            </div>
          </section>

          <section class="sb-card">
            <h3 class="sb-card-title">剖面与时序</h3>
            <div class="sb-pair">
              <div class="sb-tile">
                <span class="sb-tile-label">最大高度对应时刻 t</span>
                <span class="sb-tile-value">{{ rocketStore.syncBriefing.timeAtMaxAglSec.toFixed(2) }} s</span>
              </div>
              <div class="sb-tile" title="本段记录最后一帧的任务时间，与顶点时刻对照可看过顶后覆盖的时长">
                <span class="sb-tile-label">末帧任务时间 t₁</span>
                <span class="sb-tile-value">{{ rocketStore.syncBriefing.missionEndTimeSec.toFixed(2) }} s</span>
              </div>
            </div>
            <div class="sb-pair">
              <div class="sb-tile">
                <span class="sb-tile-label">上升段历时（至顶）</span>
                <span class="sb-tile-value">{{ rocketStore.syncBriefing.ascentDurationSec.toFixed(2) }} s</span>
              </div>
              <div class="sb-tile">
                <span class="sb-tile-label">过顶后历时</span>
                <span class="sb-tile-value">{{ rocketStore.syncBriefing.descentDurationSec.toFixed(2) }} s</span>
              </div>
            </div>
            <div class="sb-pair">
              <div class="sb-tile">
                <span class="sb-tile-label">上升段速度峰值</span>
                <span class="sb-tile-value">{{ rocketStore.syncBriefing.ascentMaxVelocityMs.toFixed(2) }} m/s</span>
              </div>
              <div class="sb-tile">
                <span class="sb-tile-label">下降段速度峰值</span>
                <span class="sb-tile-value">{{ rocketStore.syncBriefing.descentMaxVelocityMs.toFixed(2) }} m/s</span>
              </div>
            </div>
          </section>

          <section class="sb-card">
            <h3 class="sb-card-title">姿态与角运动</h3>
            <div class="sb-pair">
              <div class="sb-tile">
                <span class="sb-tile-label">俯仰角峰值（|θ|）</span>
                <span class="sb-tile-value">{{ rocketStore.syncBriefing.maxAbsPitchDeg.toFixed(1) }} °</span>
              </div>
              <div class="sb-tile">
                <span class="sb-tile-label">滚转角峰值（|γ|）</span>
                <span class="sb-tile-value">{{ rocketStore.syncBriefing.maxAbsRollDeg.toFixed(1) }} °</span>
              </div>
            </div>
            <div class="sb-pair">
              <div class="sb-tile">
                <span class="sb-tile-label">俯仰标准差 σ<sub>θ</sub></span>
                <span class="sb-tile-value">{{ rocketStore.syncBriefing.pitchStdDeg.toFixed(2) }} °</span>
              </div>
              <div
                class="sb-tile"
                title="本窗口内 √(ωx²+ωy²+ωz²) 峰值，反映箭体扭转剧烈程度"
              >
                <span class="sb-tile-label">合成角速度峰值 |ω|</span>
                <span class="sb-tile-value">{{ rocketStore.syncBriefing.maxGyroVectorDegS.toFixed(0) }} °/s</span>
              </div>
            </div>
          </section>
        </div>

        <button type="button" class="sync-briefing-close" @click="rocketStore.dismissSyncBriefing()">
          关闭
        </button>
      </article>
    </div>
  </div>
</template>

<script setup lang="ts">
import { computed, ref, onMounted, onBeforeUnmount, nextTick, watch } from 'vue'
import RocketScene from './components/RocketScene.vue'
import { useRocketStore } from './store/rocket'
import FlightChart from './components/FlightChart.vue'
import AttitudeChart from './components/AttitudeChart.vue'
import RelativePositionRadar from './components/RelativePositionRadar.vue'
import VideoLink from './components/HUD/VideoLink.vue'
import { StatusBar } from '@capacitor/status-bar'
import { App } from '@capacitor/app'
// 【新增】引入 Capacitor 核心对象
import { Capacitor, type PluginListenerHandle } from '@capacitor/core'

const rocketStore = useRocketStore()

// 【新增】平台判断逻辑
const isNativeAndroid = Capacitor.isNativePlatform() && Capacitor.getPlatform() === 'android'

// 【调试用】打印平台判断结果到控制台
console.log('是否是安卓原生环境:', isNativeAndroid)
console.log('当前平台:', Capacitor.getPlatform())
console.log('是否是原生环境:', Capacitor.isNativePlatform())

//0. 系统重置逻辑（已在 store 中实现，全屏逻辑被移除）

let stableViewportHeight = 0
let viewportRestoreTimer: number | undefined

const restoreScrollOrigin = () => {
  window.scrollTo(0, 0)
  document.documentElement.scrollTop = 0
  document.body.scrollTop = 0
}

const isTextInputActive = () => {
  const activeElement = document.activeElement
  return activeElement instanceof HTMLInputElement
    || activeElement instanceof HTMLTextAreaElement
    || activeElement instanceof HTMLSelectElement
}

const syncHudViewport = () => {
  const layoutHeight = Math.round(window.innerHeight)
  const visualHeight = Math.round(window.visualViewport?.height ?? layoutHeight)

  if (stableViewportHeight === 0) {
    stableViewportHeight = layoutHeight
  }

  const focusedOnInput = isTextInputActive()
  const keyboardLooksOpen = focusedOnInput && (isNativeAndroid || visualHeight < stableViewportHeight * 0.85)

  if (!keyboardLooksOpen && layoutHeight > stableViewportHeight * 0.9) {
    stableViewportHeight = layoutHeight
  }

  const keyboardOffset = keyboardLooksOpen ? Math.max(0, stableViewportHeight - visualHeight) : 0
  const fallbackLift = keyboardLooksOpen ? stableViewportHeight * 0.18 : 0
  const keyboardLift = Math.min(Math.max(keyboardOffset * 0.55, fallbackLift), stableViewportHeight * 0.24)

  document.documentElement.style.setProperty('--app-height', `${stableViewportHeight}px`)
  document.documentElement.style.setProperty('--keyboard-lift', `${Math.round(keyboardLift)}px`)
  restoreScrollOrigin()
  window.requestAnimationFrame(() => {
    alignLaunchControlToCalibrateBottom()
  })
}

const scheduleViewportRestore = () => {
  window.clearTimeout(viewportRestoreTimer)
  viewportRestoreTimer = window.setTimeout(syncHudViewport, 160)
}

const resetStableViewport = () => {
  stableViewportHeight = 0
  scheduleViewportRestore()
}


// 1. 实时时钟逻辑
const realTime = ref('')
let clockTimer: number
let padLocationResumeListener: PluginListenerHandle | undefined

const updateClock = () => {
  const now = new Date()
  realTime.value = now.getFullYear() + '-' + 
    String(now.getMonth() + 1).padStart(2, '0') + '-' + 
    String(now.getDate()).padStart(2, '0') + ' ' + 
    now.toTimeString().split(' ')[0]
}

// 动态计算 LoRa 链路文案
const linkStatusText = computed(() => {
  if (rocketStore.isDemoMode) return 'LORA: SIMULATION MODE'
  return rocketStore.isWsConnected ? 'LORA: SERIAL LINK ACTIVE' : 'LORA: SERIAL LINK LOST'
})

// 动态计算 LoRa 链路颜色
const linkStatusColor = computed(() => {
  if (rocketStore.isDemoMode) return 'text-orange-400'
  return rocketStore.isWsConnected ? 'text-green-400' : 'text-red-500 animate-pulse' // 断开时红色闪烁
})

// 动态计算传感器文案
const sensorStatusText = computed(() => {
  if (rocketStore.isDemoMode) return 'IMU: VIRTUAL / SENSOR: EMULATED'
  return rocketStore.isWsConnected ? 'IMU: STREAMING VIA LORA' : 'IMU: WAITING FOR LORA SERIAL'
})

/** 中间「数据同步」/「结束同步」区域底边与右侧「归零校准」按钮底边对齐 */
const launchControlAreaRef = ref<HTMLElement | null>(null)
const endSyncControlRef = ref<HTMLElement | null>(null)
const calibrateZeroBtnRef = ref<HTMLButtonElement | null>(null)
const launchControlBottomPx = ref<number | null>(null)

function alignLaunchControlToCalibrateBottom() {
  const cal = calibrateZeroBtnRef.value
  const launch = launchControlAreaRef.value
  const endSync = endSyncControlRef.value
  if (!cal) {
    launchControlBottomPx.value = null
    return
  }
  if (!rocketStore.isLaunched) {
    if (!launch) {
      launchControlBottomPx.value = null
      return
    }
  } else if (rocketStore.isFlightRecording) {
    if (!endSync) {
      launchControlBottomPx.value = null
      return
    }
  } else {
    launchControlBottomPx.value = null
    return
  }
  const vh = window.visualViewport?.height ?? window.innerHeight
  const calBottom = cal.getBoundingClientRect().bottom
  launchControlBottomPx.value = Math.max(0, Math.round(vh - calBottom))
}

const launchControlAreaStyle = computed(() => {
  const b = launchControlBottomPx.value
  return {
    bottom:
      b != null
        ? `${b}px`
        : `calc(clamp(100px, 13.5vh, 132px) + env(safe-area-inset-bottom, 0px))`,
    top: 'auto',
  }
})

watch(
  () => [rocketStore.isLaunched, rocketStore.isFlightRecording] as const,
  () => {
    nextTick(() => requestAnimationFrame(alignLaunchControlToCalibrateBottom))
  },
)

onMounted(() => {
  updateClock()
  clockTimer = window.setInterval(updateClock, 1000)
  syncHudViewport()
  window.addEventListener('resize', syncHudViewport)
  window.addEventListener('orientationchange', resetStableViewport)
  window.addEventListener('focusin', syncHudViewport)
  window.addEventListener('focusout', scheduleViewportRestore)
  window.visualViewport?.addEventListener('resize', syncHudViewport)
  window.visualViewport?.addEventListener('scroll', restoreScrollOrigin)
  // 启动演示模式的循环心跳
  rocketStore.startDemoLoop()

  // 启动即请求本机定位作为发射架 PAD（与模拟/实时模式无关）
  void rocketStore.initPadLocationFromDevice()

  /* 从「最近任务」或设置返回前台时重试：很多人先在系统里开权限，再回应用，仅 onMounted 不会再次执行 */
  if (Capacitor.isNativePlatform()) {
    void App.addListener('resume', () => {
      void rocketStore.initPadLocationFromDevice()
    }).then((handle) => {
      padLocationResumeListener = handle
    })
  }

  window.setTimeout(() => alignLaunchControlToCalibrateBottom(), 280)
  window.setTimeout(() => alignLaunchControlToCalibrateBottom(), 900)

  // 3. 隐藏原生状态栏 (如果装了插件的话)
  if (Capacitor.isPluginAvailable('StatusBar')) {
    StatusBar.hide().catch(()=> {})
  }
})

onBeforeUnmount(() => {
  window.clearInterval(clockTimer)
  window.clearTimeout(viewportRestoreTimer)
  window.removeEventListener('resize', syncHudViewport)
  window.removeEventListener('orientationchange', resetStableViewport)
  window.removeEventListener('focusin', syncHudViewport)
  window.removeEventListener('focusout', scheduleViewportRestore)
  window.visualViewport?.removeEventListener('resize', syncHudViewport)
  window.visualViewport?.removeEventListener('scroll', restoreScrollOrigin)
  void padLocationResumeListener?.remove()
  padLocationResumeListener = undefined
})

// 【保留】原来的 Windows 串口连接函数
const connectSerial = async () => {
  try {
    await rocketStore.initWindowsSerial();
  } catch (error) {
    console.error("串口连接被用户取消或失败:", error);
  }
}

// 【新增】自动选择平台的连接函数
const handleConnectSerial = async () => {
  console.log('点击了连接按钮，当前环境是否安卓:', isNativeAndroid);
  if (isNativeAndroid) {
    // 安卓环境，执行安卓串口逻辑
    await rocketStore.initAndroidSerial();
  } else {
    // 浏览器环境，执行Windows串口逻辑
    await connectSerial();
  }
};

</script>

<style scoped>
/* =========================================
   1. 基础布局
   ========================================= */
.hud-container {
  @apply relative w-full max-w-full bg-black overflow-hidden text-white selection:bg-cyan-500/30;
  min-height: var(--app-height, 100dvh);
  height: var(--app-height, 100dvh);
  max-height: none;
}

.scene-layer {
  @apply absolute inset-0 z-0;
}

.hud-overlay {
  @apply absolute inset-0 z-10 flex flex-col;
}

/* 结束同步：数据简报（视口居中，高于 HUD） */
.sync-briefing-layer {
  position: fixed;
  inset: 0;
  z-index: 60;
  display: flex;
  align-items: center;
  justify-content: center;
  padding: clamp(12px, 3vw, 20px);
}

.sync-briefing-backdrop {
  position: absolute;
  inset: 0;
  background: rgba(0, 0, 0, 0.72);
  backdrop-filter: blur(4px);
}

.sync-briefing-panel {
  position: relative;
  width: min(94vw, 32rem);
  max-width: min(94vw, 32rem);
  max-height: none;
  overflow: visible;
  padding: 0.72rem 0.78rem 0.88rem;
  border-radius: 12px;
  border: 1px solid rgba(45, 212, 191, 0.38);
  background:
    radial-gradient(120% 80% at 50% -20%, rgba(45, 212, 191, 0.12) 0%, transparent 55%),
    linear-gradient(168deg, rgba(8, 47, 54, 0.97) 0%, rgba(2, 10, 16, 0.99) 100%);
  box-shadow:
    0 0 48px rgba(34, 211, 238, 0.18),
    inset 0 1px 0 rgba(255, 255, 255, 0.07);
}

@media (min-width: 640px) {
  .sync-briefing-panel {
    width: min(88vw, 36rem);
    max-width: min(88vw, 36rem);
    padding: 0.8rem 0.9rem 0.95rem;
  }
}

.sync-briefing-header {
  text-align: center;
  margin-bottom: 0.45rem;
}

.sync-briefing-title {
  font-size: clamp(0.88rem, 1.9vh, 1.15rem);
  letter-spacing: 0.28em;
  font-weight: 900;
  color: rgba(207, 250, 254, 0.95);
  text-shadow: 0 0 18px rgba(34, 211, 238, 0.45);
  margin: 0;
}

.sync-briefing-sub {
  margin: 0.35rem 0 0;
  font-size: 0.75rem;
  color: rgba(148, 163, 184, 0.95);
}

.sync-briefing-body {
  display: flex;
  flex-direction: column;
  gap: 0.5rem;
}

.sb-card {
  margin: 0;
  padding: 0.48rem 0.52rem 0.52rem;
  border-radius: 10px;
  border: 1px solid rgba(45, 212, 191, 0.16);
  background: linear-gradient(168deg, rgba(6, 36, 42, 0.65) 0%, rgba(2, 14, 22, 0.82) 100%);
  box-shadow: inset 0 1px 0 rgba(255, 255, 255, 0.035);
}

.sb-card-title {
  margin: 0 0 0.4rem;
  padding-left: 0.42rem;
  border-left: 3px solid rgba(45, 212, 191, 0.88);
  font-size: 0.66rem;
  font-weight: 800;
  letter-spacing: 0.22em;
  color: rgba(167, 243, 208, 0.95);
  line-height: 1.35;
}

.sb-pair {
  display: grid;
  grid-template-columns: 1fr 1fr;
  gap: 0.4rem;
  margin-bottom: 0.4rem;
}

.sb-pair:last-child {
  margin-bottom: 0;
}

@media (max-width: 419px) {
  .sb-pair {
    grid-template-columns: 1fr;
  }
}

.sb-tile {
  display: flex;
  flex-direction: column;
  align-items: flex-start;
  justify-content: center;
  gap: 0.22rem;
  min-height: 3.1rem;
  padding: 0.38rem 0.46rem;
  border-radius: 8px;
  border: 1px solid rgba(34, 211, 238, 0.12);
  background: linear-gradient(180deg, rgba(12, 42, 50, 0.5) 0%, rgba(0, 10, 16, 0.55) 100%);
}

.sb-tile-label {
  font-size: 0.62rem;
  font-weight: 600;
  line-height: 1.3;
  color: rgba(148, 163, 184, 0.96);
}

.sb-tile-label sub {
  font-size: 0.55em;
  vertical-align: baseline;
}

.sb-tile-value {
  font-size: clamp(0.82rem, 1.45vh, 0.98rem);
  font-weight: 800;
  font-variant-numeric: tabular-nums;
  color: rgba(240, 253, 250, 0.98);
  text-shadow: 0 0 14px rgba(45, 212, 191, 0.15);
}

.sync-briefing-close {
  margin-top: 0.55rem;
  width: 100%;
  padding: 0.48rem 0.65rem;
  border-radius: 8px;
  border: 1px solid rgba(45, 212, 191, 0.42);
  background: rgba(13, 59, 68, 0.45);
  color: rgba(236, 253, 245, 0.96);
  font-weight: 700;
  font-size: 0.78rem;
  letter-spacing: 0.22em;
  cursor: pointer;
  transition:
    background 0.2s ease,
    border-color 0.2s ease,
    box-shadow 0.2s ease;
}

.sync-briefing-close:hover {
  background: rgba(20, 83, 95, 0.55);
  border-color: rgba(94, 234, 212, 0.65);
  box-shadow: 0 0 20px rgba(45, 212, 191, 0.12);
}

/* =========================================
   2. 顶部状态栏
   ========================================= */
.hud-header {
  @apply flex items-center px-10 py-4 h-20;
  height: clamp(58px, 10vh, 80px);
  padding-top: clamp(10px, 1.8vh, 16px);
  padding-bottom: clamp(10px, 1.8vh, 16px);
  position: relative; /* 必须！否则标题无法相对于它居中 */
  background: linear-gradient(to bottom, rgba(0, 255, 255, 0.12) 0%, transparent 100%);
  border-bottom: 1px solid rgba(0, 255, 255, 0.15);
}

.header-right-area {
  display: flex;
  align-items: center;
  margin-left: auto; /* 核心：这一行会将整个右侧区域推到最右边 */
  z-index: 10;       /* 确保在标题层级之上，可以点击 */
}

/* 标题容器：改为垂直排列并居中 */
.system-title-container {
  position: absolute;
  left: 50%;
  top: 50%;
  transform: translate(-50%, -50%);
  pointer-events: none; /* 标题不阻挡点击 */
  text-align: center;
}


/* 中文主标题：稍微调大字间距 */
.system-title {
  @apply text-2xl font-black tracking-[0.3em] leading-tight;
  text-shadow: 0 0 15px rgba(0, 255, 255, 0.6);
}

/* 英文副标题：小字、高间距、半透明 */
.system-subtitle-en {
  font-size: 1vh; /* 保持小而精致 */
  @apply font-bold tracking-[0.5em] text-cyan-500 uppercase mt-1;
  opacity: 0.7;
  /* 也可以加一点微弱的发光 */
  text-shadow: 0 0 5px rgba(0, 255, 255, 0.3);
}

.mission-timer{
  @apply font-bold tabular-nums text-lg;
}

.real-clock {
  font-size: 1.8vh !important; /* 从之前的字号调小 */
  @apply font-bold tabular-nums;
  color: rgba(156, 163, 175, 0.7); /* 使用半透明灰色，减少视觉权重 */
}

/* =========================================
   3. 侧边数据面板 (核心对称性优化)
   ========================================= */
.hud-main {
  @apply flex-1 relative flex justify-between px-10 py-6;
  padding-top: clamp(12px, 2vh, 24px);
  padding-bottom: clamp(6px, 1vh, 12px);
  min-height: 0;
}

.hud-side-left, .hud-side-right {
  height: 100%;
  min-height: 0;
  display: flex;
  flex-direction: column;
  gap: clamp(5px, 0.7vh, 9px);
}

.hud-side-left {
  width: clamp(330px, 26vw, 465px);
  min-width: 330px;
}

.hud-side-right {
  width: clamp(300px, 20vw, 390px);
  min-width: 300px;
}

.hud-side-left .grid div {
  font-size: 1.2vh !important;
  @apply p-1 rounded-sm; /* 这里的 p-2 改为 p-1，节省高度 */
  background: rgba(6, 78, 113, 0.2);
}

.hud-side-left { @apply border-l border-cyan-500/20 pl-8; }
.hud-side-right { @apply border-r border-cyan-500/20 pr-8; }

.section-label {
  font-size: 1.05vh;
  @apply text-cyan-400 font-bold tracking-widest mb-2 opacity-90;
}

.data-item { @apply flex flex-col gap-0 w-full; }

.kinematics-metrics {
  display: grid;
  grid-template-columns: minmax(0, 1fr) minmax(0, 0.92fr);
  gap: clamp(5px, 0.75vh, 9px) clamp(8px, 1vw, 14px);
  flex-shrink: 0;
}

.kinematics-metrics .data-item {
  min-width: 0;
}

.kinematics-metrics .metric-wide {
  grid-column: 1 / -1;
}

.data-item .label {
  font-size: 0.95vh;
  @apply text-gray-400 uppercase tracking-wider mb-1;
  opacity: 0.8;
}

/* 数值与单位样式 */
.value-row { @apply flex items-baseline gap-2; }
.value {
  font-size: 2.15vh; 
  @apply font-black tabular-nums text-white;
}

/* 专门针对右侧数据，防止换行 */
.hud-side-right .value {
  font-size: 1.55vh !important; /* 调小字号 */
  white-space: nowrap;         /* 强制不换行 */
  letter-spacing: -0.05vh;     /* 稍微收紧字符间距 */
  @apply text-cyan-400;        /* 颜色改回青色 */
}

.unit {
  font-size: 1.3vh;
  @apply text-gray-500 ml-1 font-bold;
}

/* 图表：高度大致维持，少占纵向份额；余量给视频 */
.chart-container-l {
  flex: 0.85 1 minmax(0, 1fr);
  min-height: clamp(185px, 30vh, 300px);
  max-height: clamp(220px, 34vh, 320px);
  margin-top: clamp(6px, 0.9vh, 12px) !important;
  padding-top: clamp(7px, 1vh, 12px) !important;
  display: flex;
  flex-direction: column;
  min-width: 0;
  @apply border-t border-cyan-500/10;
}

.chart-container-l :deep(.chart-container) {
  flex: 1;
  min-height: 0;
}

.video-link-container {
  --video-window-height: clamp(215px, 40vh, 360px);
  flex: 1.45 1 minmax(0, 1fr);
  min-height: 0;
  margin-top: clamp(4px, 0.7vh, 10px) !important;
  padding-top: clamp(6px, 0.9vh, 10px) !important;
  display: flex;
  flex-direction: column;
  @apply border-t border-cyan-500/10;
}

.video-link-container :deep(.video-link:not(.fullscreen)) {
  width: min(100%, calc(var(--video-window-height) * 16 / 9));
  max-width: 100%;
  max-height: none;
  flex: 0 0 auto;
}

/* 姿态三角雷达：略增高，避免轴标签与上方数值区挤压 */
.chart-container-r {
  height: clamp(200px, 38vh, 300px);
  min-height: 0;
  display: flex;
  flex-direction: column;
}
.chart-container-r :deep(.chart-container) {
  flex: 1;
  min-height: 0;
}

.relative-position-panel {
  flex: 1 1 auto;
  min-height: clamp(120px, 18vh, 200px);
}

/* 原始数据流样式 (解决调不动的问题) */
.quat-stream-container { @apply opacity-80; }
.quat-stream-text {
  font-size: 1.05vh !important;
  line-height: 1.4;
  @apply text-cyan-500/90 font-bold;
}

/* 进度条样式 */
.progress-bg { @apply w-full h-1 bg-gray-800 rounded-full mt-1 overflow-hidden; }
.progress-bar { @apply h-full bg-cyan-400 shadow-[0_0_8px_rgba(34,211,238,0.6)] transition-all duration-300; }

/* =========================================
   4. 中间瞄准与按钮 (响应式适配)
   ========================================= */
.hud-center {
  flex: 1;
  position: relative;
  display: flex;
  flex-direction: column;
  justify-content: center;
  align-items: center;
  min-width: 0;
}

/* 发射与登记：全屏水平居中；bottom 由脚本与右侧「归零校准」按钮底边对齐 */
.launch-control-area {
  position: fixed;
  left: 50%;
  top: auto;
  transform: translate(-50%, calc(0px - var(--keyboard-lift, 0px)));
  display: flex;
  flex-direction: column;
  align-items: center;
  justify-content: flex-start;
  width: min(420px, 92vw);
  max-width: min(420px, 92vw);
  padding: 0 clamp(12px, 4vw, 28px);
  box-sizing: border-box;
  gap: clamp(8px, 1vh, 12px);
  z-index: 15;
  pointer-events: auto;
  transition: transform 0.18s ease-out;
}

.student-input-wrapper {
  transform: scale(0.82);
  transform-origin: center center;
  width: 100%;
  max-width: 320px;
  margin-bottom: 0.15vh;
}

.student-input-wrapper input {
  width: clamp(190px, 22vh, 230px) !important;
  padding-top: 0.55vh !important;
  padding-bottom: 0.55vh !important;
  font-size: clamp(12px, 1.45vh, 15px);
}

.student-input-wrapper > div {
  font-size: clamp(9px, 1vh, 11px) !important;
  margin-bottom: 0.3vh !important;
}

/* 发射按钮 */
.launch-btn {
  position: relative;
  width: clamp(220px, 27vh, 285px);
  height: clamp(46px, 6vh, 62px);
  background: rgba(0, 255, 255, 0.05);
  backdrop-filter: blur(1px);
  @apply border border-cyan-500/40 text-cyan-400 overflow-hidden;
  clip-path: polygon(10% 0, 100% 0, 90% 100%, 0 100%);
  transition: all 0.3s ease;
}

.launch-btn:hover {
  background: rgba(0, 255, 255, 0.15);
  @apply border-cyan-300 shadow-[0_0_20px_rgba(0,255,255,0.2)];
}

.launch-btn-end-sync {
  background: rgba(251, 191, 36, 0.08);
  @apply border-amber-500/50 text-amber-300;
}

.launch-btn-end-sync:hover {
  background: rgba(251, 191, 36, 0.18);
  @apply border-amber-400 shadow-[0_0_20px_rgba(251,191,36,0.25)];
}

.btn-content { @apply flex flex-col items-center justify-center h-full w-full whitespace-nowrap; }
.btn-status-text { font-size: clamp(8px, 0.8vh, 10px); @apply opacity-50 mb-1 tracking-widest; }
.btn-main-text { font-size: clamp(15px, 1.8vh, 20px); @apply font-black tracking-widest text-shadow-glow; }

/* 瞄准框：fixed 以视口中心为锚点，与全屏 3D 火箭轴线对齐 */
.targeting-reticle {
  position: fixed;
  top: 50%;
  left: 50%;
  transform: translate(-50%, -50%);
  height: 65vh;
  width: calc(65vh * 0.55);
  z-index: 12;
  @apply pointer-events-none flex justify-center items-center;
}

/* 瞄准框内数据展示 */
.data-item-float {
  @apply absolute flex flex-col items-center justify-center text-cyan-400;
  text-shadow: 0 0 1px rgba(0, 255, 255, 0.8), 0 0 5px rgba(0, 255, 255, 0.3);
}

.float-label { font-size: 0.9vh; @apply font-bold tracking-widest mb-1 opacity-70; }
.float-value { font-size: 2.4vh; @apply font-black tabular-nums leading-none; }

.left-side { @apply top-1/2 -translate-y-1/2 items-end; left: -3vh; }
.right-side { @apply top-1/2 -translate-y-1/2 items-start; right: -3vh; }
/* 滚转：贴在瞄准框上沿之上；translateY 略向下避免顶到页眉（Pad 上再加大） */
.roll-side-top {
  left: 50%;
  transform: translate(-50%, 1.1vh);
  bottom: 100%;
  margin-bottom: 0.6vh;
  flex-direction: column;
}

@media (max-width: 1024px) {
  .roll-side-top {
    transform: translate(-50%, 2.8vh);
  }
}

/* 滚转水平仪样式 */
.roll-container { @apply relative w-16 h-4 mt-2 flex items-center justify-center; }
.roll-scale-bg { @apply absolute w-full h-[1px] bg-cyan-500/20; }
.roll-horizon-bar {
  @apply absolute w-10 h-[2px] bg-cyan-400 shadow-[0_0_8px_rgba(0,255,255,0.8)];
  transition: transform 0.2s linear;
}

/* 瞄准框支架与十字 */
.reticle-bracket { @apply absolute border-cyan-500/50; width: 3.5vh; height: 3.5vh; }
.bracket-tl { @apply top-0 left-0 border-t-2 border-l-2; }
.bracket-tr { @apply top-0 right-0 border-t-2 border-r-2; }
.bracket-bl { @apply bottom-0 left-0 border-b-2 border-l-2; }
.bracket-br { @apply bottom-0 right-0 border-b-2 border-r-2; }
.center-cross { @apply absolute w-4 h-4; background: radial-gradient(circle, #22d3ee 1.5px, transparent 1.5px); }

/* =========================================
   5. 底部状态栏 (已精简调优)
   ========================================= */
.hud-footer {
  @apply backdrop-blur-md border-t border-cyan-500/10 flex items-center justify-between px-12;
  flex-shrink: 0;
  min-height: clamp(42px, 7vh, 54px);
  padding-bottom: env(safe-area-inset-bottom, 0px);
  box-sizing: border-box;
  background: rgba(8, 145, 178, 0.26);
  -webkit-backdrop-filter: blur(16px) saturate(145%);
  backdrop-filter: blur(16px) saturate(145%);
  box-shadow: inset 0 1px 18px rgba(34, 211, 238, 0.1);
}

.env-group { @apply flex gap-12; }
.env-box { @apply flex flex-col; }
.env-box .label { font-size: clamp(7px, 0.75vh, 9px); @apply text-cyan-100/55 font-bold mb-0 opacity-80; }
.env-box .val { font-size: clamp(14px, 1.8vh, 20px); @apply font-black tabular-nums text-cyan-300; line-height: 1; }
.env-box .u { font-size: clamp(7px, 0.85vh, 9px); @apply text-cyan-700 font-bold ml-1; }

.system-logs { font-size: clamp(7px, 0.75vh, 9px); @apply text-green-300/75 font-mono text-right leading-tight opacity-80; }

/* =========================================
   6. 动画与特效
   ========================================= */
.text-shadow-glow { text-shadow: 0 0 10px rgba(0, 255, 255, 0.5); }

.btn-scan {
  @apply absolute top-0 -left-full w-full h-full;
  background: linear-gradient(90deg, transparent, rgba(255,255,255,0.2), transparent);
  animation: launch-scan 4s infinite linear;
}

/* 导出 CSV：与重置按钮同系的 HUD 青灰小 pill，略小一号 */
.export-btn {
  display: inline-flex;
  align-items: center;
  gap: 0.2rem;
  font-size: 0.82vh !important;
  line-height: 1.2;
  padding: 0.18rem 0.42rem 0.2rem;
  letter-spacing: 0.04em;
  border-radius: 4px;
  border: 1px solid rgba(34, 211, 238, 0.32);
  color: rgba(207, 250, 254, 0.92);
  background: linear-gradient(180deg, rgba(12, 55, 66, 0.55) 0%, rgba(4, 24, 32, 0.65) 100%);
  box-shadow:
    inset 0 1px 0 rgba(255, 255, 255, 0.06),
    0 0 0 1px rgba(0, 0, 0, 0.2);
  cursor: pointer;
  user-select: none;
  transition:
    background 0.2s ease,
    border-color 0.2s ease,
    box-shadow 0.2s ease,
    color 0.2s ease;
}

.export-btn:hover {
  border-color: rgba(94, 234, 212, 0.5);
  background: linear-gradient(180deg, rgba(18, 75, 88, 0.65) 0%, rgba(6, 40, 52, 0.75) 100%);
  box-shadow:
    inset 0 1px 0 rgba(255, 255, 255, 0.08),
    0 0 14px rgba(34, 211, 238, 0.12);
  color: rgba(240, 253, 250, 0.98);
}

.export-btn:active {
  transform: scale(0.97);
}

.export-btn-icon {
  font-size: 0.95em;
  line-height: 1;
  opacity: 0.88;
}

.export-btn-text {
  font-weight: 700;
  white-space: nowrap;
}

/* 重置按钮：做得更精简 */
.reset-btn {
  font-size: 0.9vh !important; /* 极小字号 */
  @apply px-2 py-0.5 border border-cyan-500/30 text-cyan-500/60 cursor-pointer hover:bg-cyan-500/20 ml-3 rounded;
  transition: all 0.3s ease;
}


@keyframes launch-scan {
  0% { left: -100%; }
  20% { left: 100%; }
  100% { left: 100%; }
}

/* 模式切换按钮样式 */
.mode-toggle-btn {
  @apply relative flex items-center justify-center w-full py-1.5 px-3 border text-xs font-bold tracking-widest uppercase transition-all duration-300;
  backdrop-filter: blur(2px);
}

.mode-toggle-btn:hover {
  @apply brightness-125;
}

.indicator {
  @apply w-2 h-2 rounded-full mr-3 animate-pulse;
}

.source-control-panel {
  padding-top: clamp(8px, 1.4vh, 16px) !important;
}

.source-control-panel .mode-toggle-btn {
  min-height: 30px;
  padding-top: 0.55vh !important;
  padding-bottom: 0.55vh !important;
  font-size: clamp(9px, 0.95vh, 11px) !important;
  letter-spacing: 0.14em;
}

.source-control-panel .mode-toggle-btn.mb-3 {
  margin-bottom: 0.75vh !important;
}

.source-control-panel .mode-toggle-btn.mt-2 {
  margin-top: 0.75vh !important;
}

.source-control-panel .mode-toggle-btn span:first-child {
  width: 0.38rem !important;
  height: 0.38rem !important;
  margin-right: 0.45rem !important;
  flex-shrink: 0;
}
</style>