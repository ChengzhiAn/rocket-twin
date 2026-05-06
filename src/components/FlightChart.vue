<template>
  <div class="chart-container">
    <!-- 数值跳动区 -->
    <div class="data-board">
      <div class="data-item">
        <span class="label">当前速度 (m/s)</span>
        <span class="value text-cyan-400">{{ (rocketStore.velocity || 0).toFixed(0) }}</span>
      </div>
      <div class="data-item">
        <span class="label">当前高度 (km)</span>
        <span class="value text-blue-400">{{ rocketStore.altitude.toFixed(2) }}</span>
      </div>
    </div>
    
    <!-- ECharts 图表区 -->
    <v-chart class="echarts-box" :option="chartOption" autoresize />
  </div>
</template>

<script setup lang="ts">
import { computed } from 'vue'
import { useRocketStore } from '../store/rocket'

// 引入 ECharts 核心与按需组件
import { use } from 'echarts/core'
import { CanvasRenderer } from 'echarts/renderers'
import { LineChart } from 'echarts/charts'
import { GridComponent, TooltipComponent, LegendComponent } from 'echarts/components'
import VChart from 'vue-echarts'

// 注册必须的 ECharts 组件
use([CanvasRenderer, LineChart, GridComponent, TooltipComponent, LegendComponent])

const rocketStore = useRocketStore()

// 使用 computed 动态生成图表配置项，ECharts 会自动监听并平滑重绘
const chartOption = computed(() => {
  const hasHistory = rocketStore.historyData.time.length > 0
  const fallbackTimeAxis = ['0s', '10s', '20s', '30s', '40s', '50s']
  const emptySeries = fallbackTimeAxis.map(() => null)

  return {
    tooltip: { trigger: 'axis' },
    legend: {
      itemWidth: 10,  // 缩小图例图标
      itemHeight: 6,
      textStyle: { 
        color: '#fff',
        fontSize: 10   // 缩小图例字号
      },
      top: '0%'       // 图例置顶，不占用下方空间
    },
    grid: { 
      left: '5%', right: '6%', bottom: '16%', top: '30%', 
      containLabel: true // 防裁剪
    },
    xAxis: {
      type: 'category',
      boundaryGap: false,
      data: hasHistory ? rocketStore.historyData.time : fallbackTimeAxis,
      axisLabel: { color: '#5eead4', fontSize: 9, margin: 6 },
      axisTick: { show: true, lineStyle: { color: 'rgba(94, 234, 212, 0.35)' } },
      axisLine: { show: true, lineStyle: { color: 'rgba(94, 234, 212, 0.35)' } }
    },
    yAxis: [
      {
        type: 'value',
        name: '速度',
        min: 0,
        max: hasHistory ? undefined : 100,
        splitNumber: 4,
        nameTextStyle: { color: '#00ffff' },
        axisLabel: { color: '#00ffff', fontSize: 9 },
        axisTick: { show: true, lineStyle: { color: 'rgba(0, 255, 255, 0.35)' } },
        axisLine: { show: true, lineStyle: { color: 'rgba(0, 255, 255, 0.35)' } },
        splitLine: { lineStyle: { color: '#ffffff10' } }
      },
      {
        type: 'value',
        name: '高度',
        min: 0,
        max: hasHistory ? undefined : 1,
        splitNumber: 4,
        nameTextStyle: { color: '#3b82f6' },
        axisLabel: { color: '#3b82f6', fontSize: 9 },
        axisTick: { show: true, lineStyle: { color: 'rgba(59, 130, 246, 0.35)' } },
        axisLine: { show: true, lineStyle: { color: 'rgba(59, 130, 246, 0.35)' } },
        splitLine: { show: false }
      }
    ],
    series: [
      {
        name: '速度 (m/s)',
        type: 'line',
        smooth: true,
        showSymbol: false,
        itemStyle: { color: '#00ffff' },
        areaStyle: {
          color: {
            type: 'linear', x: 0, y: 0, x2: 0, y2: 1,
            colorStops: [{ offset: 0, color: '#00ffff80' }, { offset: 1, color: '#00ffff00' }]
          }
        },
        data: hasHistory ? rocketStore.historyData.velocity : emptySeries
      },
      {
        name: '高度 (km)',
        type: 'line',
        yAxisIndex: 1,
        smooth: true,
        showSymbol: false,
        itemStyle: { color: '#3b82f6' },
        data: hasHistory ? rocketStore.historyData.altitude : emptySeries
      }
    ]
  }
})
</script>

<style scoped>
.chart-container {
  width: 100%;
  height: 100%;
  display: flex;
  flex-direction: column;
  min-height: 0;
  padding-top: 2px;
}

.data-board {
  display: flex;
  justify-content: space-around;
  margin-bottom: 4px;
  flex-shrink: 0;
}

.data-item {
  display: flex;
  flex-direction: column;
  align-items: center;
}

.label {
  font-size: clamp(8px, 0.9vh, 11px);
  color: #aaa;
}

.value {
  font-size: clamp(16px, 2vh, 22px);
  font-weight: bold;
  font-family: monospace;
  line-height: 1;
}

.echarts-box {
  flex: 1;
  min-height: 0;
  width: 100%;
}
</style>