<template>
  <div class="hud-container font-mono">
    <!-- 1. 3D 背景渲染层 -->
    <div class="scene-layer">
      <RocketScene />
    </div>

    <!-- 2. UI 覆盖层 (HUD) -->
    <div class="hud-overlay pointer-events-none">
    <div v-if="rocketStore.showSerialSuccessToast" class="fixed top-1/2 left-1/2 -translate-x-1/2 -translate-y-1/2 z-50 bg-cyan-900/90 border border-cyan-400 px-8 py-4 rounded-lg text-cyan-100 font-bold text-lg shadow-[0_0_30px_rgba(34,211,238,0.5)]">
      ✅ 串口连接成功！正在接收数据
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
          class="export-btn cursor-pointer px-3 py-1 border border-green-500/50 text-green-400 hover:bg-green-500/20 text-xs rounded transition-all" 
          @click="rocketStore.exportFlightData()"
        >
          <span>💾 导出本次数据</span>
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
          
          <!-- 过载 G 值 -->
          <div class="data-item">
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
          <div class="data-item">
            <div class="label">ACCELERATION (X/Y/Z)</div>
            <div class="grid grid-cols-3 gap-2 quat-stream-text">
              <div class="bg-cyan-900/20 p-2 rounded-sm border border-cyan-500/10">X: {{ rocketStore.acc?.x.toFixed(2) }}</div>
              <div class="bg-cyan-900/20 p-2 rounded-sm border border-cyan-500/10">Y: {{ rocketStore.acc?.y.toFixed(2) }}</div>
              <div class="bg-cyan-900/20 p-2 rounded-sm border border-cyan-500/10">Z: {{ rocketStore.acc?.z.toFixed(2) }}</div>
            </div>
          </div>

          <!-- 飞行剖面图表 (高度适配，解决文字遮挡) -->
          <div class="data-item chart-container-l border-t border-cyan-500/20 pt-4">
            <div class="label">FLIGHT PROFILE / 轨迹记录</div>
            <FlightChart />
          </div>
        </aside>

        <!-- [中间] 交互与瞄准区 -->
        <section class="hud-center">
          <!-- 发射按钮及选手登记区：仅在未发射时显示 -->
          <div v-if="!rocketStore.isLaunched" class="launch-control-area">
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
            
            <!-- 发射按钮 -->
            <button class="launch-btn pointer-events-auto" @click="rocketStore.startLaunch()">
              <div class="btn-content">
                <span class="btn-status-text">SYSTEM: READY TO IGNITION</span>
                <span class="btn-main-text">确认发射 LAUNCH</span>
              </div>
              <div class="btn-scan"></div>
            </button>
          </div>

          <!-- 瞄准框：发射后显示，随窗口自动缩放 -->
          <div v-else class="targeting-reticle">
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
              <!-- 底部：滚转水平仪 -->
              <div class="data-item-float bottom-side">
                <div class="float-label">ROLL / 滚转</div>
                <div class="float-value">{{ rocketStore.roll.toFixed(1) }}°</div>
                <div class="roll-container">
                  <div class="roll-scale-bg"></div>
                  <div class="roll-horizon-bar" :style="{ transform: `rotate(${-rocketStore.roll}deg)` }"></div>
                </div>
              </div>
            </div>
            <div class="center-cross"></div>
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

          <div class="data-item source-control-panel mt-auto pt-6 border-t border-cyan-500/30">
            <div class="label text-right mb-2 flex justify-end items-center gap-2">
              <!-- 点击齿轮图标触发弹窗 -->
              <span class="cursor-pointer hover:text-white transition-colors" @click="promptIpChange">⚙️</span>
              DATA SOURCE LINK
            </div>
            
            <!-- 1. 原有的模式切换按钮 -->
            <button 
              class="mode-toggle-btn w-full mb-3"
              :class="rocketStore.isDemoMode ? 'bg-orange-500/20 border-orange-500 text-orange-400' : 'bg-cyan-500/20 border-cyan-500 text-cyan-400'"
              @click="rocketStore.toggleMode()"
            >
              <span class="indicator" :class="rocketStore.isDemoMode ? 'bg-orange-400 shadow-[0_0_8px_#f97316]' : 'bg-cyan-400 shadow-[0_0_8px_#22d3ee]'"></span>
              {{ rocketStore.isDemoMode ? '模拟模式 SIMULATION MODE' : '实时遥测 LIVE TELEMETRY' }}
            </button>

            <!-- 2. 【修改后】LoRa 串口连接按钮，动态文字+动态事件 -->
            <div class="data-item">
              <button 
                v-if="!rocketStore.isWsConnected"
                class="mode-toggle-btn w-full border-purple-500 text-purple-400 bg-purple-500/10 hover:bg-purple-500/20"
                @click="handleConnectSerial"
              >
                <span class="w-2 h-2 rounded-full mr-3 bg-purple-400 shadow-[0_0_8px_#a855f7]"></span>
                <!-- 【关键】动态文字，根据平台自动切换 -->
                {{ isNativeAndroid ? '🔌 连接 USB 串口 (PAD)' : '🔌 连接 LORA 串口 (WINDOWS)' }}
              </button>
              <div v-else class="flex items-center justify-center w-full py-2 border border-green-500/30 bg-green-500/10 text-[10px] text-green-400 font-bold tracking-widest">
                <span class="w-2 h-2 rounded-full mr-2 bg-green-400 shadow-[0_0_8px_#22c55e] animate-pulse"></span>
                SERIAL LINK ACTIVE
              </div>
            </div>

            <!-- 3. 【新增】一键归零校准按钮 -->
            <button
              class="mode-toggle-btn w-full mt-2 border-green-500 text-green-400 bg-green-500/10 hover:bg-green-500/20"
              @click="rocketStore.calibrateZero"
            >
              <span class="w-2 h-2 rounded-full mr-3 bg-green-400 shadow-[0_0_8px_#22c55e]"></span>
              🎯 归零校准（水平放置后点击）
            </button>

            <!-- 显示当前绑定的 IP 地址 -->
            <div class="text-[9px] text-right mt-2 text-gray-500 font-mono">
              TARGET: {{ rocketStore.sensorIp }}
            </div>
          </div>
        </aside>
      </main>

      <!-- [底部] 环境监测条 (已调小且改为摄氏度) -->
      <footer class="hud-footer pointer-events-auto">
        <div class="env-group">
          <div class="env-box">
            <span class="label">ALTITUDE</span>
            <span class="val">{{ rocketStore.altitude.toFixed(3) }}</span><span class="u">km</span>
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
  </div>
</template>

<script setup lang="ts">
import { computed, ref, onMounted, onBeforeUnmount } from 'vue'
import RocketScene from './components/RocketScene.vue'
import { useRocketStore } from './store/rocket'
import FlightChart from './components/FlightChart.vue'
import AttitudeChart from './components/AttitudeChart.vue'
import { StatusBar } from '@capacitor/status-bar'
// 【新增】引入 Capacitor 核心对象
import { Capacitor } from '@capacitor/core'

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

const updateClock = () => {
  const now = new Date()
  realTime.value = now.getFullYear() + '-' + 
    String(now.getMonth() + 1).padStart(2, '0') + '-' + 
    String(now.getDate()).padStart(2, '0') + ' ' + 
    now.toTimeString().split(' ')[0]
}

// 动态计算网络链路文案
const linkStatusText = computed(() => {
  if (rocketStore.isDemoMode) return 'TELEMETRY: SIMULATION MODE'
  return rocketStore.isWsConnected ? 'TELEMETRY: WS LINK ACTIVE' : 'TELEMETRY: CONNECTION LOST'
})

// 动态计算网络链路颜色
const linkStatusColor = computed(() => {
  if (rocketStore.isDemoMode) return 'text-orange-400'
  return rocketStore.isWsConnected ? 'text-green-400' : 'text-red-500 animate-pulse' // 断开时红色闪烁
})

// 动态计算传感器文案
const sensorStatusText = computed(() => {
  if (rocketStore.isDemoMode) return 'IMU: VIRTUAL / SENSOR: EMULATED'
  return rocketStore.isWsConnected ? 'IMU: STREAMING / GPS: 3D FIX' : 'IMU: OFFLINE / SENSOR: N/A'
})

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
  
  // 1. 启动 WebSocket 连接
  rocketStore.initWebSocket()
  
  // 2. 启动演示模式的循环心跳
  rocketStore.startDemoLoop()

  // 3. 隐藏原生状态栏 (如果装了插件的话)
  if (window.StatusBar) {
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
})

const promptIpChange = () => {
  const currentIp = rocketStore.sensorIp
  const newIp = window.prompt('请输入传感器局域网 IP 地址 (例如 192.168.0.114):', currentIp)
  
  if (newIp && newIp !== currentIp) {
    // 简单的 IP 格式校验
    const ipRegex = /^(?:[0-9]{1,3}\.){3}[0-9]{1,3}$/
    if (ipRegex.test(newIp)) {
      rocketStore.setSensorIp(newIp)
      alert('IP 配置已更新并永久保存。')
    } else {
      alert('输入的 IP 格式不正确，请重新输入。')
    }
  }
}

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
  @apply relative w-screen bg-black overflow-hidden text-white selection:bg-cyan-500/30;
  height: var(--app-height, 100dvh);
  max-height: var(--app-height, 100dvh);
}

.scene-layer {
  @apply absolute inset-0 z-0;
}

.hud-overlay {
  @apply absolute inset-0 z-10 flex flex-col;
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
  padding-bottom: clamp(12px, 2vh, 24px);
  min-height: 0;
}

.hud-side-left, .hud-side-right {
  width: 18vw;         /* 强制左右宽度对称 */
  min-width: 350px;
  display: flex;
  flex-direction: column;
  gap: 1vh;            /* 数据项间距 */
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

.data-item .label {
  font-size: 0.95vh;
  @apply text-gray-400 uppercase tracking-wider mb-1;
  opacity: 0.8;
}

/* 数值与单位样式 */
.value-row { @apply flex items-baseline gap-2; }
.value {
  font-size: 2.35vh; 
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

/* 图表容器尺寸适配 */
.chart-container-l {
  height: clamp(130px, 28vh, 190px);
  margin-top: clamp(20px, 3vh, 30px) !important;
  padding-top: clamp(16px, 2.6vh, 26px) !important;
  @apply border-t border-cyan-500/10;
}
.chart-container-r { height: clamp(120px, 25vh, 175px); }

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
  @apply flex-1 relative flex justify-center items-center;
}

/* 发射与登记控制区 */
.launch-control-area {
  position: absolute;
  top: 50%;
  left: 50%;
  transform: translate(-50%, calc(24vh - var(--keyboard-lift, 0px)));
  display: flex;
  flex-direction: column;
  align-items: center;
  gap: clamp(6px, 0.9vh, 10px);
  transition: transform 0.18s ease-out;
}

.student-input-wrapper {
  transform: scale(0.82);
  transform-origin: center bottom;
  margin-bottom: -0.8vh;
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

.btn-content { @apply flex flex-col items-center justify-center h-full w-full whitespace-nowrap; }
.btn-status-text { font-size: clamp(8px, 0.8vh, 10px); @apply opacity-50 mb-1 tracking-widest; }
.btn-main-text { font-size: clamp(15px, 1.8vh, 20px); @apply font-black tracking-widest text-shadow-glow; }

/* 瞄准框容器 */
.targeting-reticle {
  position: absolute;
  top: 50%;
  left: 50%;
  transform: translate(-50%, -55%);
  height: 65vh;
  width: calc(65vh * 0.55);
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
.bottom-side { @apply left-1/2 -translate-x-1/2; bottom: -8vh; }

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
  @apply h-20 bg-black/50 backdrop-blur-md border-t border-cyan-500/10 flex items-center justify-between px-12;
  height: clamp(56px, 10vh, 80px);
}

.env-group { @apply flex gap-16; }
.env-box { @apply flex flex-col; }
.env-box .label { font-size: 0.9vh; @apply text-gray-500 font-bold mb-0 opacity-80; }
.env-box .val { font-size: 2.3vh; @apply font-black tabular-nums text-cyan-400; }
.env-box .u { font-size: 1vh; @apply text-cyan-900 font-bold ml-1; }

.system-logs { font-size: 0.9vh; @apply text-green-700 font-mono text-right leading-tight opacity-70; }

/* =========================================
   6. 动画与特效
   ========================================= */
.text-shadow-glow { text-shadow: 0 0 10px rgba(0, 255, 255, 0.5); }

.btn-scan {
  @apply absolute top-0 -left-full w-full h-full;
  background: linear-gradient(90deg, transparent, rgba(255,255,255,0.2), transparent);
  animation: launch-scan 4s infinite linear;
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

.source-control-panel .label {
  margin-bottom: 0.35vh !important;
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