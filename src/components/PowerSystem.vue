<template>
  <div class="power-container">
    <!-- 推力展示区 (水平进度条) -->
    <div class="thrust-section">
      <div class="engine-item">
        <div class="engine-info">
          <span class="text-cyan-400 font-bold">一级发动机推力</span>
          <span class="font-mono text-lg">{{ rocketStore.thrust.toFixed(0) }} kN</span>
        </div>
        <!-- 外边框 -->
        <div class="bar-bg">
          <!-- 发光的内填条，宽度动态绑定推力百分比 (假设满载8000) -->
          <div class="bar-fill thrust-fill" :style="{ width: `${(rocketStore.thrust / 8000) * 100}%` }"></div>
        </div>
      </div>

      <div class="engine-item mt-4">
        <div class="engine-info">
          <span class="text-gray-500 font-bold">二级发动机推力 (未点火)</span>
          <span class="font-mono text-lg text-gray-500">0 kN</span>
        </div>
        <div class="bar-bg">
          <div class="bar-fill" style="width: 0%;"></div>
        </div>
      </div>
    </div>

    <!-- 燃料展示区 (垂直液位柱) -->
    <div class="fuel-section">
      <div class="fuel-tank">
        <!-- 燃料柱背景 -->
        <div class="tank-bg">
          <!-- 动态高度绑定燃料百分比 -->
          <div class="tank-fill" :style="{ height: `${rocketStore.fuel}%` }"></div>
        </div>
        <div class="fuel-text">
          <span class="text-xs text-blue-300">一级燃料</span>
          <span class="font-mono font-bold text-blue-400">{{ rocketStore.fuel.toFixed(1) }}%</span>
        </div>
      </div>
    </div>
  </div>
</template>

<script setup lang="ts">
import { useRocketStore } from '../store/rocket'
const rocketStore = useRocketStore()
</script>

<style scoped>
.power-container {
  width: 100%;
  height: 100%;
  display: flex;
  justify-content: space-between;
  align-items: center;
  padding: 10px;
}

/* 水平推力条样式 */
.thrust-section {
  flex: 1;
  padding-right: 20px;
}
.engine-info {
  display: flex;
  justify-content: space-between;
  margin-bottom: 5px;
}
.bar-bg {
  width: 100%;
  height: 12px;
  background: rgba(255, 255, 255, 0.05);
  border: 1px solid rgba(0, 255, 255, 0.2);
  border-radius: 6px;
  overflow: hidden;
}
.bar-fill {
  height: 100%;
  transition: width 0.1s linear;
}
.thrust-fill {
  background: linear-gradient(90deg, #00ffff40, #00ffff);
  box-shadow: 0 0 10px #00ffff; /* 霓虹发光效果 */
}

/* 垂直燃料柱样式 */
.fuel-section {
  display: flex;
  align-items: flex-end;
  height: 100%;
}
.fuel-tank {
  display: flex;
  flex-direction: column;
  align-items: center;
}
.tank-bg {
  width: 40px;
  /* 把写死的 180px 换成自适应，让它在任何屏幕下都好看 */
  flex: 1; 
  min-height: 100px;
  max-height: 160px;
  
  background: rgba(0, 0, 0, 0.5);
  border: 2px solid rgba(59, 130, 246, 0.5);
  border-radius: 20px;
  position: relative;
  overflow: hidden;
  box-shadow: inset 0 0 10px rgba(0,0,0,0.8);
}
.tank-fill {
  position: absolute;
  bottom: 0;
  width: 100%;
  background: linear-gradient(0deg, #1e3a8a, #3b82f6);
  box-shadow: 0 0 15px rgba(59, 130, 246, 0.8);
  transition: height 0.1s linear;
}
.fuel-text {
  margin-top: 10px;
  display: flex;
  flex-direction: column;
  align-items: center;
}
</style>