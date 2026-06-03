<template>
  <div class="analysis-result">
    <van-nav-bar
      :title="analysisName"
      left-arrow
      @click-left="$router.back()"
    />

    <!-- 加载中 -->
    <div v-if="loading" class="loading-state">
      <van-loading size="40" type="spinner">AI正在分析你的简历...</van-loading>
      <p class="loading-tip">正在与JD要求进行逐项比对，请稍候</p>
    </div>

    <!-- 分析失败 -->
    <div v-else-if="failed" class="error-state">
      <van-empty description="分析失败" />
      <p class="error-msg">{{ errorMessage }}</p>
      <van-button round @click="retry">重试</van-button>
    </div>

    <!-- 分析结果 -->
    <div v-else-if="result" class="result-content">
      <!-- 顶部：整体评分（始终显示） -->
      <div class="score-section">
        <div class="score-area">
          <ScoreCircle :score="result.overallScore" :color="gradeColor" />
          <div class="score-info">
            <div class="grade" :style="{ color: gradeColor }">{{ result.overallGrade }}</div>
            <div class="summary">{{ result.summary }}</div>
          </div>
        </div>
      </div>

      <!-- Tab 切换 -->
      <van-tabs v-model="activeTab" class="result-tabs" sticky>
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
  </div>
</template>

<script setup>
import { ref, computed, onMounted, watch } from 'vue'
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

onMounted(() => {
  const id = route.params.id
  if (id) {
    pollResult(id)
  } else {
    showToast('参数错误')
    router.back()
  }
})

// 清理定时器
watch(() => route.params.id, () => {
  if (pollTimer) clearInterval(pollTimer)
})

async function pollResult(id) {
  loading.value = true
  failed.value = false

  // 先查询状态
  try {
    const statusRes = await analysisApi.getStatus(id)
    if (statusRes.status === 'completed') {
      await loadResult(id)
      return
    }
    if (statusRes.status === 'failed') {
      failed.value = true
      errorMessage.value = statusRes.errorMessage || '分析过程出错'
      loading.value = false
      return
    }
  } catch (e) {
    // 可能第一次请求还没创建完成，继续轮询
  }

  // 轮询等待
  pollTimer = setInterval(async () => {
    try {
      const statusRes = await analysisApi.getStatus(id)
      if (statusRes.status === 'completed') {
        clearInterval(pollTimer)
        await loadResult(id)
      } else if (statusRes.status === 'failed') {
        clearInterval(pollTimer)
        failed.value = true
        errorMessage.value = statusRes.errorMessage || '分析过程出错'
        loading.value = false
      }
    } catch (e) {
      // 继续轮询
    }
  }, 2000)
}

async function loadResult(id) {
  try {
    const res = await analysisApi.getById(id)
    result.value = res.analysis
    analysisName.value = res.name || '分析结果'
    loading.value = false
    events.analysisCompleted()
  } catch (e) {
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
  margin: 16px;
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

.radar-section {
  margin-bottom: 8px;
}
</style>
