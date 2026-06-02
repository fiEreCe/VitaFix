import { createRouter, createWebHashHistory } from 'vue-router'

const routes = [
  {
    path: '/',
    name: 'Home',
    component: () => import('../views/Home.vue'),
  },
  {
    path: '/jd-input',
    name: 'JdInput',
    component: () => import('../views/JdInput.vue'),
  },
  {
    path: '/resume-input',
    name: 'ResumeInput',
    component: () => import('../views/ResumeInput.vue'),
  },
  {
    path: '/supplement',
    name: 'Supplement',
    component: () => import('../views/Supplement.vue'),
  },
  {
    path: '/result/:id',
    name: 'AnalysisResult',
    component: () => import('../views/AnalysisResult.vue'),
  },
  {
    path: '/history',
    name: 'History',
    component: () => import('../views/History.vue'),
  },
]

const router = createRouter({
  history: createWebHashHistory(),
  routes,
})

export default router
