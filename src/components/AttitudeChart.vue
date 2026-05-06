<template>
  <div class="chart-container">
    <!-- 顶部数值跳动区 -->
    <div class="data-board">
      <div class="data-item">
        <span class="label">俯仰 (Pitch)</span>
        <span class="value text-cyan-400">{{ rocketStore.pitch.toFixed(1) }}°</span>
      </div>
      <div class="data-item">
        <span class="label">偏航 (Yaw)</span>
        <span class="value text-blue-400">{{ rocketStore.yaw.toFixed(1) }}°</span>
      </div>
      <div class="data-item">
        <span class="label">滚转 (Roll)</span>
        <span class="value text-purple-400">{{ rocketStore.roll.toFixed(1) }}°</span>
      </div>
    </div>
    
    <!-- ECharts 雷达图区 -->
    <v-chart class="echarts-box" :option="chartOption" autoresize />
  </div>
</template>

<script setup lang="ts">
import { computed } from 'vue'
import { useRocketStore } from '../store/rocket'

// 引入 ECharts 雷达图需要的组件
import { use } from 'echarts/core'
import { CanvasRenderer } from 'echarts/renderers'
import { RadarChart } from 'echarts/charts'
import { TooltipComponent } from 'echarts/components'
import VChart from 'vue-echarts'

use([CanvasRenderer, RadarChart, TooltipComponent])

const rocketStore = useRocketStore()

// 动态生成雷达图配置
const chartOption = computed(() => {
  return {
    tooltip: {},
    radar: {
      // 定义三个维度的最大最小值
      indicator:[
        { name: '俯仰角', max: 90, min: 0 },
        { name: '偏航角', max: 5, min: -5 },
        { name: '滚转角', max: 5, min: -5 }
      ],
      center: ['50%', '55%'],
      radius: '65%',
      // 科技感样式设置
      axisName: { color: '#00ffff', fontSize: 12 },
      splitNumber: 4,
      splitArea: { show: false }, // 去掉默认的灰色背景
      axisLine: { lineStyle: { color: 'rgba(0, 255, 255, 0.3)' } },
      splitLine: { 
        lineStyle: { 
          color:[
            'rgba(0, 255, 255, 0.1)', 'rgba(0, 255, 255, 0.2)', 
            'rgba(0, 255, 255, 0.4)', 'rgba(0, 255, 255, 0.6)'
          ] 
        } 
      }
    },
    series:[
      {
        name: '姿态数据',
        type: 'radar',
        symbol: 'circle',
        symbolSize: 6,
        itemStyle: { color: '#00ffff' },
        areaStyle: { color: 'rgba(0, 255, 255, 0.2)' },
        lineStyle: { width: 2, color: '#00ffff' },
        data:[
          {
            // 将 Store 中的实时数据绑定到图表
            value: [rocketStore.pitch, rocketStore.yaw, rocketStore.roll],
            name: '实时姿态'
          }
        ]
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
  margin-bottom: 2px;
}

.value {
  font-size: clamp(14px, 1.8vh, 18px);
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