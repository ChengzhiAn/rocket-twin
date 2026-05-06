import { createApp } from 'vue'
import { createPinia } from 'pinia' // 引入 Pinia
import './style.css'
import App from './App.vue'

const app = createApp(App)
const pinia = createPinia()

app.use(pinia) // 注册 Pinia
app.mount('#app')