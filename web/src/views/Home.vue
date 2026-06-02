<template>
  <div class="home">
    <!-- 顶部品牌区 -->
    <div class="hero">
      <div class="hero-icon">🎯</div>
      <h1 class="hero-title">精投助手</h1>
      <p class="hero-desc">上传 JD 和简历，AI 分析匹配度</p>
      <button class="hero-btn" @click="startNewAnalysis">
        <svg width="18" height="18" viewBox="0 0 18 18" fill="none">
          <path d="M9 3.75v10.5M3.75 9h10.5" stroke="currentColor" stroke-width="2" stroke-linecap="round"/>
        </svg>
        开始新分析
      </button>
    </div>

    <!-- 历史记录 -->
    <div class="section">
      <div class="section-header">
        <h2 class="section-title">历史记录</h2>
        <button v-if="list.length > 0" class="section-more" @click="$router.push('/history')">
          查看全部 &gt;
        </button>
      </div>

      <div v-if="loading" class="empty-state">
        <van-loading size="20">加载中...</van-loading>
      </div>

      <div v-else-if="list.length === 0" class="empty-state">
        <p class="empty-text">还没有分析记录</p>
      </div>

      <div v-else class="history-list">
        <div
          v-for="item in list.slice(0, 5)"
          :key="item.id"
          class="history-card"
          @click="$router.push(`/result/${item.id}`)"
        >
          <div class="card-left">
            <div class="card-name">{{ item.name }}</div>
            <div class="card-meta">
              <span v-if="item.company">{{ item.company }}</span>
              <span v-if="item.company && item.position"> · </span>
              <span v-if="item.position">{{ item.position }}</span>
            </div>
            <div class="card-time">{{ formatDate(item.createdAt) }}</div>
          </div>
          <div class="card-right">
            <div class="score-num" :style="{ color: getGradeColor(item.score) }">{{ item.score }}</div>
            <div class="score-grade" :style="{ color: getGradeColor(item.score) }">{{ item.grade }}</div>
          </div>
        </div>
      </div>
    </div>
  </div>
</template>

<script setup>
import { ref, onMounted } from 'vue'
import { useRouter } from 'vue-router'
import { historyApi } from '../api'
import { formatDate, getGradeColor } from '../utils/format'

const router = useRouter()
const list = ref([])
const loading = ref(true)

onMounted(async () => {
  try {
    const res = await historyApi.list({ page: 1, pageSize: 5 })
    list.value = res.list || []
  } catch (e) {
    console.error('加载历史记录失败:', e)
  } finally {
    loading.value = false
  }
})

function startNewAnalysis() {
  router.push('/jd-input')
}
</script>

<style scoped>
.home {
  min-height: 100vh;
  padding-bottom: 32px;
  background: var(--bg-page);
}

/* Apple Hero */
.hero {
  padding: 60px 24px 40px;
  text-align: center;
}

.hero-icon {
  font-size: 56px;
  margin-bottom: 16px;
}

.hero-title {
  font-size: 34px;
  font-weight: 700;
  letter-spacing: -0.5px;
  margin: 0 0 8px;
  color: var(--text-primary);
}

.hero-desc {
  font-size: 15px;
  color: var(--text-secondary);
  margin: 0 0 28px;
  line-height: 1.5;
}

.hero-btn {
  display: inline-flex;
  align-items: center;
  gap: 6px;
  background: var(--color-primary);
  color: #fff;
  border: none;
  border-radius: 24px;
  padding: 12px 28px;
  font-size: 16px;
  font-weight: 500;
  font-family: inherit;
  cursor: pointer;
  transition: opacity 0.2s, transform 0.15s;
  box-shadow: 0 4px 14px rgba(0, 113, 227, 0.3);
}

.hero-btn:active {
  opacity: 0.85;
  transform: scale(0.97);
}

/* Section */
.section {
  padding: 0 20px;
}

.section-header {
  display: flex;
  justify-content: space-between;
  align-items: center;
  margin-bottom: 14px;
}

.section-title {
  font-size: 20px;
  font-weight: 600;
  letter-spacing: -0.3px;
  margin: 0;
  color: var(--text-primary);
}

.section-more {
  font-size: 14px;
  color: var(--color-primary);
  background: none;
  border: none;
  padding: 0;
  cursor: pointer;
  font-family: inherit;
}

/* Empty */
.empty-state {
  padding: 40px 0;
  text-align: center;
}

.empty-text {
  font-size: 15px;
  color: var(--text-secondary);
  margin: 0;
}

/* History */
.history-list {
  display: flex;
  flex-direction: column;
  gap: 10px;
}

.history-card {
  background: var(--bg-card);
  border-radius: var(--radius-md);
  padding: 16px;
  display: flex;
  justify-content: space-between;
  align-items: center;
  cursor: pointer;
  transition: transform 0.15s;
  box-shadow: var(--shadow-sm);
}

.history-card:active {
  transform: scale(0.98);
}

.card-left {
  flex: 1;
  min-width: 0;
  margin-right: 12px;
}

.card-name {
  font-size: 15px;
  font-weight: 600;
  color: var(--text-primary);
  margin-bottom: 4px;
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;
}

.card-meta {
  font-size: 13px;
  color: var(--text-secondary);
  margin-bottom: 2px;
}

.card-time {
  font-size: 12px;
  color: var(--text-disabled);
}

.card-right {
  text-align: center;
  flex-shrink: 0;
}

.score-num {
  font-size: 28px;
  font-weight: 700;
  line-height: 1;
}

.score-grade {
  font-size: 12px;
  margin-top: 2px;
}
</style>
