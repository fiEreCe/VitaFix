<template>
  <AppPage title="精投助手" description="围绕岗位证据，完成一轮可验证的简历分析">
    <div class="home">
      <div class="home-grid">
        <section class="hero" aria-labelledby="home-hero-title">
          <p class="hero-eyebrow">证据驱动的 AI 求职教练</p>
          <h2 id="home-hero-title" class="hero-title">让每次简历修改都有依据，也经得起面试追问。</h2>
          <p class="hero-desc">
            连接岗位要求与真实经历，在事实审核后给出修改建议，再通过修改验证守住事实安全。
          </p>
          <div class="hero-actions">
            <button
              type="button"
              class="hero-btn pressable"
              data-entry="analysis"
              @click="startNewAnalysis"
            >
              <svg width="18" height="18" viewBox="0 0 18 18" fill="none" aria-hidden="true">
                <path d="M9 3.75v10.5M3.75 9h10.5" stroke="currentColor" stroke-width="2" stroke-linecap="round"/>
              </svg>
              开始新分析
            </button>
            <button
              type="button"
              class="demo-btn pressable"
              data-entry="demo"
              @click="router.push('/demo')"
            >
              查看引导演示
            </button>
          </div>
        </section>

        <aside class="proof-rail" aria-label="核心闭环">
          <p class="proof-kicker">核心闭环</p>
          <ol>
            <li><strong>对齐岗位</strong><span>把 JD 要求拆成可核对的证据点</span></li>
            <li><strong>核验事实</strong><span>只使用真实经历，避免无法追问的包装</span></li>
            <li><strong>验证修改</strong><span>复查建议是否清晰、具体且事实安全</span></li>
          </ol>
        </aside>
      </div>

    <!-- 历史记录 -->
      <section class="section" aria-labelledby="history-title">
      <div class="section-header">
        <h2 id="history-title" class="section-title">历史记录</h2>
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
        <RouterLink
          v-for="item in list.slice(0, 5)"
          :key="item.id"
          class="history-card"
          :to="`/result/${item.id}`"
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
        </RouterLink>
      </div>
      </section>

    <!-- 隐私提示 -->
      <div class="privacy-notice">
      <p>
        🔒 你的简历和 JD 数据仅用于本次 AI 分析，7 天后自动删除。
        作为 Demo 项目，开发者可能在调试时看到数据，不会用于其他用途。
        如有疑虑，可在历史记录中手动删除。
      </p>
      </div>
    </div>
  </AppPage>
</template>

<script setup>
import { ref, onMounted } from 'vue'
import { RouterLink, useRouter } from 'vue-router'
import { historyApi } from '../api'
import { formatDate, getGradeColor } from '../utils/format'
import AppPage from '../components/ui/AppPage.vue'

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
  display: grid;
  gap: var(--spacing-2xl);
}

.home-grid {
  display: grid;
  grid-template-columns: minmax(0, 1fr);
  gap: var(--spacing-xl);
  align-items: stretch;
}

.hero {
  display: flex;
  flex-direction: column;
  justify-content: center;
  min-width: 0;
  padding: clamp(1.5rem, 5vw, 4rem) 0;
}

.hero-eyebrow,
.proof-kicker {
  margin: 0 0 var(--spacing-md);
  color: var(--color-primary);
  font-size: var(--type-caption);
  font-weight: 600;
  letter-spacing: 0.04em;
}

.hero-title {
  max-width: 16ch;
  margin: 0;
  color: var(--text-primary);
  font-size: var(--type-title);
  font-weight: 700;
  line-height: 1.16;
  letter-spacing: -0.025em;
}

.hero-desc {
  max-width: 42rem;
  margin: var(--spacing-lg) 0 0;
  color: var(--text-secondary);
  font-size: var(--type-body);
  line-height: 1.7;
}

.hero-actions {
  display: flex;
  flex-wrap: wrap;
  gap: var(--spacing-md);
  margin-top: var(--spacing-xl);
}

.hero-btn,
.demo-btn {
  display: inline-flex;
  align-items: center;
  justify-content: center;
  gap: var(--spacing-sm);
  min-height: 2.75rem;
  padding: 0.75rem 1.25rem;
  border-radius: 999px;
  cursor: pointer;
  font-weight: 600;
}

.hero-btn {
  background: var(--color-primary);
  color: #fff;
  border: none;
  box-shadow: 0 4px 14px rgba(0, 113, 227, 0.3);
}

.demo-btn {
  border: 1px solid var(--border-strong);
  background: var(--surface-content);
  color: var(--color-primary);
}

.proof-rail {
  padding: clamp(1.25rem, 3vw, 2rem);
  border: 1px solid var(--border-subtle);
  border-radius: var(--radius-xl);
  background: var(--surface-content);
  box-shadow: var(--shadow-md);
}

.proof-rail ol {
  display: grid;
  gap: var(--spacing-lg);
  margin: 0;
  padding: 0;
  list-style: none;
  counter-reset: proof;
}

.proof-rail li {
  display: grid;
  grid-template-columns: 2rem minmax(0, 1fr);
  column-gap: var(--spacing-md);
  counter-increment: proof;
}

.proof-rail li::before {
  content: counter(proof, decimal-leading-zero);
  grid-row: 1 / span 2;
  color: var(--color-primary);
  font-size: var(--type-caption);
  font-weight: 700;
}

.proof-rail strong,
.proof-rail span {
  grid-column: 2;
}

.proof-rail span {
  margin-top: var(--spacing-xs);
  color: var(--text-secondary);
  font-size: var(--type-caption);
  line-height: 1.55;
}

/* Section */
.section {
  min-width: 0;
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
  min-height: 2.75rem;
  font-size: 14px;
  color: var(--color-primary);
  background: none;
  border: none;
  padding: 0 var(--spacing-sm);
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
  color: inherit;
  text-decoration: none;
}

.history-card:active {
  transform: scale(0.98);
}

.history-card:focus-visible {
  outline: 2px solid var(--color-primary);
  outline-offset: 3px;
  box-shadow: var(--focus-ring);
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

/* Privacy */
.privacy-notice {
  margin: 0;
  padding: 12px 14px;
  background: #f5f5f7;
  border-radius: var(--radius-md);
  font-size: 11px;
  color: #86868b;
  line-height: 1.6;
  text-align: center;
}

.privacy-notice p {
  margin: 0;
}

@media (min-width: 56.25rem) {
  .home-grid {
    grid-template-columns: minmax(0, 1.2fr) minmax(18rem, 0.8fr);
    gap: var(--spacing-2xl);
  }
}
</style>
