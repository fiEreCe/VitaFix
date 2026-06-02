import { createApp } from 'vue'
import App from './App.vue'
import router from './router'
import './styles/variables.css'

// Vant 组件由 unplugin-vue-components 自动导入
// 但部分指令仍需手动注册
import { showToast, showDialog, showLoadingToast, closeToast } from 'vant'
import 'vant/lib/index.css'

const app = createApp(App)
app.use(router)

// 挂载全局方法
app.config.globalProperties.$toast = showToast
app.config.globalProperties.$dialog = showDialog
app.config.globalProperties.$loading = showLoadingToast
app.config.globalProperties.$closeLoading = closeToast

app.mount('#app')
