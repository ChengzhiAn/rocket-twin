import { defineConfig } from 'vite'
import vue from '@vitejs/plugin-vue'

export default defineConfig({
  plugins: [vue()],
  base: './',
  server: {
    // 设置开发服务器代理
    proxy: {
      // 凡是请求路径以 /api 开头的，都会被转发
      '/api': {
        target: 'http://192.168.0.114', // 目标真实接口地址
        changeOrigin: true,            // 允许跨域
        // 路径重写：把请求里的 /api 去掉
        // 比如请求 /api/getData，转发到目标服务器时变成 /getData
        rewrite: (path) => path.replace(/^\/api/, '')
      }
    }
  }
})