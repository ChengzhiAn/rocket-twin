<template>
  <div class="chart-container">
    <div class="data-board">
      <div class="data-item">
        <span class="label">表面温度 (K)</span>
        <span class="value text-red-500">{{ rocketStore.temperature.toFixed(1) }}</span>
      </div>
      <div class="data-item">
        <span class="label">动压 (kPa)</span>
        <span class="value text-yellow-400">{{ rocketStore.pressure.toFixed(2) }}</span>
      </div>
    </div>
    
    <v-chart class="echarts-box" :option="chartOption" autoresize />
  </div>
</template>

<script setup lang="ts">
import { computed } from 'vue'
import { useRocketStore } from '../store/rocket'
import { use } from 'echarts/core'
import { CanvasRenderer } from 'echarts/renderers'
import { LineChart } from 'echarts/charts'
import { GridComponent, TooltipComponent, LegendComponent } from 'echarts/components'
import VChart from 'vue-echarts'

use([CanvasRenderer, LineChart, GridComponent, TooltipComponent, LegendComponent])

const rocketStore = useRocketStore()

const chartOption = computed(() => {
  return {
    tooltip: { trigger: 'axis' },
    legend: { textStyle: { color: '#fff' } },
    grid: { 
      left: '5%', right: '5%', bottom: '5%', top: '25%', 
      containLabel: true // 防裁剪
    },
    xAxis: {
      type: 'category',
      boundaryGap: false,
      data: rocketStore.historyData.time,
      axisLabel: { show: false } // 隐藏时间轴刻度，显得更干净
    },
    yAxis:[
      {
        type: 'value',
        name: '温度(K)',
        nameTextStyle: { color: '#ef4444' },
        axisLabel: { color: '#ef4444' },
        splitLine: { lineStyle: { color: '#ffffff10' } }
      },
      {
        type: 'value',
        name: '动压(kPa)',
        nameTextStyle: { color: '#facc15' },
        axisLabel: { color: '#facc15' },
        splitLine: { show: false }
      }
    ],
    series:[
      {
        name: '表面温度',
        type: 'line',
        smooth: true,
        showSymbol: false,
        itemStyle: { color: '#ef4444' },
        areaStyle: {
          color: {
            type: 'linear', x: 0, y: 0, x2: 0, y2: 1,
            colorStops:[{ offset: 0, color: '#ef444480' }, { offset: 1, color: '#ef444400' }]
          }
        },
        data: rocketStore.historyData.temperature
      },
      {
        name: '动压',
        type: 'line',
        yAxisIndex: 1,
        smooth: true,
        showSymbol: false,
        itemStyle: { color: '#facc15' },
        data: rocketStore.historyData.pressure
      }
    ]
  }
})
</script>

<style scoped>
.chart-container { width: 100%; height: 100%; display: flex; flex-direction: column; }
.data-board { display: flex; justify-content: space-around; margin-bottom: 5px; }
.data-item { display: flex; flex-direction: column; align-items: center; }
.label { font-size: 12px; color: #aaa; }
.value { font-size: 24px; font-weight: bold; font-family: monospace; }
.echarts-box { flex: 1; width: 100%; }
</style>