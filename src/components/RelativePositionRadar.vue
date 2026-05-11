<template>
  <div class="rel-pos-wrap">
    <div class="rel-pos-chart-col">
      <div class="rel-pos-chart-shell">
        <v-chart class="rel-pos-echarts" :option="chartOption" autoresize />

        <div v-if="showSignalLost" class="rel-pos-lost">
          <span class="rel-pos-lost-icon">⚠</span>
          <span>信号丢失</span>
        </div>
      </div>
    </div>

    <div class="rel-pos-text-col">
      <div class="rel-pos-head">
        <span class="rel-pos-title">REL POS / 相对位置</span>
        <span class="rel-pos-sub">北斗/GPS · 东北向投影 · 盘面北向上</span>
      </div>

      <div class="rel-pos-footer">
        <div class="rel-pos-ll">
          <span class="k">PAD</span>
          <span class="v">{{ padText }}</span>
        </div>
        <div class="rel-pos-ll">
          <span class="k">RKT</span>
          <span class="v">{{ rocketText }}</span>
        </div>
      </div>
    </div>
  </div>
</template>

<script setup lang="ts">
import { computed } from 'vue'
import { use } from 'echarts/core'
import { CanvasRenderer } from 'echarts/renderers'
import { ScatterChart } from 'echarts/charts'
import {
  PolarComponent,
  TooltipComponent,
} from 'echarts/components'
import VChart from 'vue-echarts'
import { useRocketStore } from '../store/rocket'
import { horizontalDistanceM, offsetEnMeters } from '../utils/geo'

use([
  CanvasRenderer,
  ScatterChart,
  PolarComponent,
  TooltipComponent,
])

/** 公里级火箭水平射程上限（轴硬顶） */
const RADAR_ABS_MAX_M = 2500
/** 有距离时的最小可视半径，避免比例尺过大 */
const RADAR_MIN_AXIS_M = 28
/** 落在半径上的留白：点约在 max 的 1/paddingFactor 以内，便于读方位 */
const RADAR_PADDING = 1.38

const store = useRocketStore()

/** 按当前水平距离自适应半径轴上限；近距离用小比例尺，远距离放大并封顶 */
function adaptiveRadiusMaxM(distM: number): number {
  if (!Number.isFinite(distM) || distM <= 0) {
    return Math.min(RADAR_ABS_MAX_M, 100)
  }
  const padded = distM * RADAR_PADDING + 25
  return Math.min(RADAR_ABS_MAX_M, Math.max(RADAR_MIN_AXIS_M, padded))
}

const showSignalLost = computed(
  () => !store.isDemoMode && !store.rocketGpsValid,
)

const padText = computed(() =>
  `${store.padLatitude.toFixed(5)}°, ${store.padLongitude.toFixed(5)}°`,
)

const rocketText = computed(() => {
  if (!store.isDemoMode && !store.rocketGpsValid) return '—'
  return `${store.rocketLatitude.toFixed(5)}°, ${store.rocketLongitude.toFixed(5)}°`
})

/**
 * 导航方位角（0°=正北，顺时针增大）→ ECharts 极坐标角度（与 Polar.coordToPoint 一致：
 * 0°=东、90°=北、180°=西、270°=南；屏幕为 x 右、y 下，故 y 用 -sin）
 */
function navigationBearingToEChartsAngleDeg(navDeg: number): number {
  return (90 - navDeg + 360) % 360
}

/** 极角刻度值 → 东南西北（与上面一致：90° 在正上方为北） */
function eChartsAngleToCompassLetter(v: number): string {
  const d = Math.round(((v % 360) + 360) % 360)
  if (d === 0) return 'E'
  if (d === 90) return 'N'
  if (d === 180) return 'W'
  if (d === 270) return 'S'
  return ''
}

function eChartsAngleToNavigationBearing(chartDeg: number): number {
  return (90 - chartDeg + 360) % 360
}

/** 半径：水平距离 m；数据行格式 [半径, 极角°]（与 ECharts 极坐标 scatter 约定一致） */
const chartOption = computed(() => {
  const latP = store.padLatitude
  const lonP = store.padLongitude
  const latR = store.rocketLatitude
  const lonR = store.rocketLongitude

  let scatterData: number[][] = []
  let rMax = RADAR_ABS_MAX_M

  const drawDot =
    store.isDemoMode || (store.rocketGpsValid && Number.isFinite(latR) && Number.isFinite(lonR))

  if (drawDot) {
    const { eastM, northM } = offsetEnMeters(latP, lonP, latR, lonR)
    const dist = horizontalDistanceM(latP, lonP, latR, lonR)
    let bearingDeg = (Math.atan2(eastM, northM) * 180) / Math.PI
    if (bearingDeg < 0) bearingDeg += 360
    rMax = adaptiveRadiusMaxM(dist)
    const chartAngle = navigationBearingToEChartsAngleDeg(bearingDeg)
    const rPlot = Math.min(dist, rMax)
    scatterData = [[rPlot, chartAngle]]
  }

  return {
    tooltip: {
      trigger: 'item',
      formatter: (p: { value?: unknown }) => {
        const val = p.value
        if (!Array.isArray(val) || val.length < 2) return ''
        const rad = Number(val[0])
        const chartAng = Number(val[1])
        const navDeg = eChartsAngleToNavigationBearing(chartAng)
        return `方位 ${navDeg.toFixed(1)}°（正北顺时针）· 水平距 ${rad.toFixed(0)} m`
      },
    },
    polar: {
      center: ['50%', '52%'],
      radius: '72%',
    },
    angleAxis: {
      type: 'value',
      min: 0,
      max: 360,
      /**
       * startAngle 会整体平移「数据角→画布角」的映射（见 echarts polarCreator setAxis）。
       * 须为 0，否则例如数据 90°（北）会被画到 cos/sin 的 180°（西）。北在上、东在右：数据角即 ECharts 数学角（0°东、90°北）。
       */
      startAngle: 0,
      clockwise: false,
      /** 固定每 90° 一刻度，保证 E/N/W/S 与「上北下南左西右东」一致（勿仅用 splitNumber，步长会被算法微调） */
      interval: 90,
      axisLabel: {
        formatter: (v: number) => eChartsAngleToCompassLetter(v),
        color: 'rgba(0, 255, 255, 0.45)',
        fontSize: 9,
        showMaxLabel: false,
      },
      axisLine: { lineStyle: { color: 'rgba(0, 255, 255, 0.25)' } },
      splitLine: { lineStyle: { color: 'rgba(0, 255, 255, 0.2)' } },
    },
    radiusAxis: {
      min: 0,
      max: rMax,
      splitNumber: 4,
      /** 距离刻度画在「正北」径向线上，避免默认贴在别的方位看起来像歪的 */
      angle: 90,
      axisLabel: {
        color: 'rgba(0, 255, 255, 0.5)',
        fontSize: 9,
        formatter: (v: number) => `${Math.round(v)} m`,
      },
      axisLine: { lineStyle: { color: 'rgba(0, 255, 255, 0.25)' } },
      splitLine: {
        lineStyle: { color: 'rgba(0, 255, 255, 0.12)' },
      },
    },
    series: [
      {
        name: '火箭',
        type: 'scatter',
        coordinateSystem: 'polar',
        encode: { radius: 0, angle: 1 },
        symbolSize: 10,
        itemStyle: {
          color: '#f97316',
          borderColor: '#ffedd5',
          borderWidth: 1,
          shadowBlur: 8,
          shadowColor: 'rgba(249, 115, 22, 0.6)',
        },
        data: scatterData,
        z: 2,
      },
    ],
  }
})
</script>

<style scoped>
.rel-pos-wrap {
  display: flex;
  flex-direction: row;
  align-items: stretch;
  gap: clamp(10px, 1.6vw, 20px);
  width: 100%;
  min-height: 0;
  flex: 1 1 auto;
}

.rel-pos-chart-col {
  flex: 0 1 56%;
  min-width: 0;
  max-width: 64%;
  display: flex;
  flex-direction: column;
}

.rel-pos-chart-shell {
  position: relative;
  flex: 1;
  min-height: clamp(110px, 16vh, 190px);
  display: flex;
  flex-direction: column;
}

.rel-pos-echarts {
  flex: 1;
  min-height: 0;
  width: 100%;
}

.rel-pos-text-col {
  flex: 1 1 44%;
  min-width: 0;
  display: flex;
  flex-direction: column;
  justify-content: center;
  gap: clamp(10px, 1.2vh, 16px);
}

.rel-pos-head {
  display: flex;
  flex-direction: column;
  align-items: flex-start;
  flex-shrink: 0;
}

.rel-pos-title {
  font-size: clamp(9px, 1vh, 12px);
  color: #22d3ee;
  font-weight: 700;
  letter-spacing: 0.12em;
  line-height: 1.35;
}

.rel-pos-sub {
  font-size: clamp(7px, 0.75vh, 9px);
  color: rgba(156, 163, 175, 0.85);
  margin-top: 4px;
  line-height: 1.45;
}

.rel-pos-lost {
  position: absolute;
  inset: 0;
  display: flex;
  flex-direction: column;
  align-items: center;
  justify-content: center;
  gap: 6px;
  pointer-events: none;
  font-size: clamp(12px, 1.4vh, 15px);
  font-weight: 800;
  color: #fb923c;
  text-shadow: 0 0 14px rgba(251, 146, 60, 0.55);
  background: radial-gradient(
    ellipse at center,
    rgba(15, 23, 42, 0.72) 0%,
    rgba(15, 23, 42, 0.15) 70%,
    transparent 100%
  );
}

.rel-pos-lost-icon {
  font-size: clamp(18px, 2.2vh, 24px);
  line-height: 1;
}

.rel-pos-footer {
  flex-shrink: 0;
  display: flex;
  flex-direction: column;
  gap: 5px;
  font-size: clamp(7px, 0.78vh, 10px);
  text-align: left;
  color: rgba(148, 163, 184, 0.95);
  font-variant-numeric: tabular-nums;
}

.rel-pos-ll {
  display: flex;
  justify-content: flex-start;
  align-items: baseline;
  gap: 8px;
  flex-wrap: wrap;
}

.rel-pos-ll .k {
  color: rgba(34, 211, 238, 0.75);
  font-weight: 700;
  flex-shrink: 0;
  min-width: 2rem;
}

.rel-pos-ll .v {
  color: rgba(226, 232, 240, 0.92);
  letter-spacing: -0.02em;
  word-break: break-all;
}
</style>
