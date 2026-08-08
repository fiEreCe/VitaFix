<template>
  <AppPage
    class="analysis-result"
    :title="analysisName"
    eyebrow="岗位匹配分析"
    back
    @back="router.back()"
  >

    <!-- 加载中 -->
    <StatusPanel
      v-if="loading"
      kind="loading"
      title="AI 正在分析你的简历"
      message="正在与 JD 要求进行逐项比对，请稍候。"
    />

    <!-- 分析失败 -->
    <StatusPanel
      v-else-if="failed"
      kind="error"
      title="分析失败"
      :message="errorMessage"
      retryable
      @retry="retry"
    />

    <!-- 分析结果 -->
    <div v-else-if="result" class="result-layout">
      <!-- 顶部：整体评分（始终显示） -->
      <div class="score-section result-overview" aria-label="分析概览">
        <div class="score-area">
          <ScoreCircle :score="result.overallScore" :color="gradeColor" />
          <div class="score-info">
            <div class="grade" :style="{ color: gradeColor }">{{ result.overallGrade }}</div>
            <div class="summary">{{ result.summary }}</div>
          </div>
        </div>
      </div>

      <!-- Tab 切换 -->
      <van-tabs v-model="activeTab" class="result-tabs" aria-label="分析详情" sticky>
        <!-- Tab 1: 维度分析 -->
        <van-tab title="维度分析">
          <div class="tab-content">
            <div class="radar-section">
              <div class="section-title">维度概览</div>
              <RadarChart :dimensions="result.dimensions" />
            </div>
            <div class="dimensions-section">
              <div class="section-title">维度详情</div>
              <div class="dimensions-list">
                <DimensionCard
                  v-for="(dim, idx) in result.dimensions"
                  :key="idx"
                  :dimension="dim"
                />
              </div>
            </div>
          </div>
        </van-tab>

        <!-- Tab 2: JD要求匹配清单 -->
        <van-tab title="JD要求匹配">
          <div class="tab-content">
            <div class="checklist-section">
              <div class="section-title">JD要求匹配清单</div>
              <div class="checklist-count">
                共 {{ requirementChecklist.length }} 项要求，
                <span style="color:#07c160">{{ matchedCount }} 项匹配</span>，
                <span style="color:#ff976a">{{ partialCount }} 项部分匹配</span>，
                <span style="color:#ee0a24">{{ unmatchedCount }} 项未匹配</span>
              </div>
              <div class="checklist">
                <RequirementItem
                  v-for="(req, idx) in requirementChecklist"
                  :key="idx"
                  :item="req"
                />
              </div>
            </div>
          </div>
        </van-tab>

        <!-- Tab 3: 简历板块分析 -->
        <van-tab title="板块分析">
          <div class="tab-content">
            <div class="sections-section">
              <div class="section-title">简历板块分析</div>
              <div class="sections-list">
                <SectionAnalysis
                  v-for="(section, idx) in result.sectionAnalysis"
                  :key="idx"
                  :section="section"
                  :analysis-id="route.params.id"
                  @section-updated="handleSectionUpdate"
                />
              </div>
            </div>
          </div>
        </van-tab>
      </van-tabs>

      <!-- 操作按钮 -->
      <div class="bottom-actions">
        <van-button
          plain
          block
          round
          icon="records"
          @click="goHistory"
        >
          查看历史记录
        </van-button>
        <van-button
          type="primary"
          block
          round
          icon="plus"
          style="margin-top: 8px"
          @click="newAnalysis"
        >
          开始新分析
        </van-button>
      </div>
    </div>
  </AppPage>
</template>

<script setup>
import { ref, computed, onBeforeUnmount, onMounted, watch } from 'vue'
import { useRoute, useRouter } from 'vue-router'
import { showToast } from 'vant'
import { analysisApi } from '../api'
import { getGradeColor } from '../utils/format'
import { events } from '../utils/analytics'
import ScoreCircle from '../components/ScoreCircle.vue'
import RadarChart from '../components/RadarChart.vue'
import DimensionCard from '../components/DimensionCard.vue'
import RequirementItem from '../components/RequirementItem.vue'
import SectionAnalysis from '../components/SectionAnalysis.vue'
import AppPage from '../components/ui/AppPage.vue'
import StatusPanel from '../components/ui/StatusPanel.vue'

const route = useRoute()
const router = useRouter()

const loading = ref(true)
const failed = ref(false)
const errorMessage = ref('')
const result = ref(null)
const analysisName = ref('分析结果')
const activeTab = ref(0)

// 轮询状态
let pollTimer = null
let pollGeneration = 0
let statusInFlightToken = null

onMounted(() => {
  const id = route.params.id
  if (id) {
    pollResult(id)
  } else {
    showToast('参数错误')
    router.back()
  }
})

watch(() => route.params.id, (id) => {
  if (id) {
    pollResult(id)
  } else {
    invalidatePolling()
  }
})

onBeforeUnmount(() => {
  invalidatePolling()
})

function clearPolling() {
  if (pollTimer) clearInterval(pollTimer)
  pollTimer = null
}

function invalidatePolling() {
  clearPolling()
  pollGeneration += 1
  statusInFlightToken = null
  return pollGeneration
}

function isCurrentPoll(id, token) {
  return token === pollGeneration && route.params.id === id
}

async function pollResult(id) {
  const token = invalidatePolling()
  loading.value = true
  failed.value = false

  const terminal = await checkStatus(id, token)
  if (terminal || !isCurrentPoll(id, token)) return

  // 轮询等待
  pollTimer = setInterval(() => {
    void checkStatus(id, token)
  }, 2000)
}

async function checkStatus(id, token) {
  if (!isCurrentPoll(id, token) || statusInFlightToken === token) return false
  statusInFlightToken = token

  try {
    const statusRes = await analysisApi.getStatus(id)
    if (!isCurrentPoll(id, token)) return true

    if (statusRes.status === 'completed') {
      clearPolling()
      await loadResult(id, token)
      return true
    }
    if (statusRes.status === 'failed') {
      clearPolling()
      failed.value = true
      errorMessage.value = statusRes.errorMessage || '分析过程出错'
      loading.value = false
      return true
    }
  } catch (e) {
    // 请求暂时失败时保持既有行为，继续轮询
    return false
  } finally {
    if (statusInFlightToken === token) statusInFlightToken = null
  }

  return false
}

async function loadResult(id, token) {
  try {
    const res = await analysisApi.getById(id)
    if (!isCurrentPoll(id, token)) return
    result.value = res.analysis
    analysisName.value = res.name || '分析结果'
    loading.value = false
    events.analysisCompleted()
  } catch (e) {
    if (!isCurrentPoll(id, token)) return
    failed.value = true
    errorMessage.value = e.message
    loading.value = false
  }
}

function retry() {
  const id = route.params.id
  if (id) pollResult(id)
}

function goHistory() {
  router.push('/history')
}

function newAnalysis() {
  router.push('/jd-input')
}

function handleSectionUpdate({ sectionType, sectionIndex, data }) {
  if (!result.value?.sectionAnalysis) return
  const idx = result.value.sectionAnalysis.findIndex(
    (s) => s.sectionType === sectionType && s.sectionIndex === sectionIndex
  )
  if (idx === -1) return
  const updated = { ...result.value.sectionAnalysis[idx], ...data }
  result.value.sectionAnalysis[idx] = updated
}

const gradeColor = computed(() => getGradeColor(result.value?.overallScore || 0))

const requirementChecklist = computed(() => result.value?.requirementChecklist || [])

const matchedCount = computed(() =>
  requirementChecklist.value.filter((r) => r.status === 'matched').length
)
const partialCount = computed(() =>
  requirementChecklist.value.filter((r) => r.status === 'partial').length
)
const unmatchedCount = computed(() =>
  requirementChecklist.value.filter((r) => r.status === 'unmatched').length
)
</script>

<style scoped>
.analysis-result {
  min-height: 100vh;
  background: var(--bg-page);
}

.result-layout {
  display: grid;
  gap: 1rem;
  width: min(100%, var(--workspace-max));
  margin: 0 auto;
}

.loading-state,
.error-state {
  display: flex;
  flex-direction: column;
  align-items: center;
  justify-content: center;
  padding: 80px 24px;
  text-align: center;
}

.loading-tip {
  font-size: 14px;
  color: var(--text-secondary);
  margin-top: 12px;
}

.error-msg {
  font-size: 14px;
  color: var(--text-secondary);
  margin: 8px 0 16px;
}

/* Apple score card */
.score-section {
  background: var(--bg-card);
  margin: 16px 16px 0;
  padding: 24px;
  border-radius: var(--radius-lg);
  box-shadow: var(--shadow-sm);
}

.score-area {
  display: flex;
  align-items: center;
  gap: 20px;
}

.score-info {
  flex: 1;
}

.grade {
  font-size: 22px;
  font-weight: 700;
  margin-bottom: 6px;
  letter-spacing: -0.3px;
}

.summary {
  font-size: 14px;
  color: var(--text-secondary);
  line-height: 1.5;
}

/* Tabs */
.result-tabs {
  margin: 0 16px;
  background: var(--bg-card);
  border-radius: var(--radius-md);
  overflow: hidden;
  --van-tabs-bottom-bar-color: var(--color-primary);
}

.tab-content {
  padding: 16px;
  padding-bottom: 80px;
}

.section-title {
  font-size: 17px;
  font-weight: 600;
  letter-spacing: -0.3px;
  margin-bottom: 14px;
  color: var(--text-primary);
}

.dimensions-list,
.checklist,
.sections-list {
  display: flex;
  flex-direction: column;
  gap: 10px;
}

.checklist-count {
  font-size: 14px;
  color: var(--text-secondary);
  margin-bottom: 12px;
}

.bottom-actions {
  padding: 16px 20px 32px;
}

.bottom-actions .van-button--default {
  border: 1px solid #d2d2d7;
  color: var(--text-primary);
}

@media (min-width: 56.25rem) {
  .result-layout {
    grid-template-columns: minmax(16rem, 22rem) minmax(0, 1fr);
    align-items: start;
    padding: 1rem 2rem 2rem;
  }

  .result-overview {
    position: sticky;
    top: 6.5rem;
    margin: 0;
  }

  .result-tabs,
  .bottom-actions {
    grid-column: 2;
    margin: 0;
  }

  .bottom-actions {
    padding-right: 0;
    padding-left: 0;
  }
}

.radar-section {
  margin-bottom: 8px;
}
</style>
