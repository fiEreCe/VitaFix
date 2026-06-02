<template>
  <div class="section-analysis">
    <!-- 头部：标签 + 标题 + 编辑按钮 + 分数 -->
    <div class="section-header">
      <div class="section-type-badge">{{ typeLabel }}</div>
      <span class="section-label">{{ section.label }}</span>
      <van-icon
        v-if="!isEditing"
        name="edit"
        size="16"
        color="#1989fa"
        class="edit-trigger"
        @click="startEdit"
      />
      <span class="section-score" :style="{ color: scoreColor }">{{ section.matchScore }}分</span>
    </div>

    <!-- JD要求 vs 简历内容 -->
    <div v-if="section.jdExpectations || section.resumeSummary" class="context-box">
      <div v-if="section.jdExpectations" class="context-row">
        <span class="context-icon">📋</span>
        <div>
          <div class="context-label">JD要求</div>
          <div class="context-text">{{ section.jdExpectations }}</div>
        </div>
      </div>
      <div v-if="section.resumeSummary" class="context-row">
        <span class="context-icon">📄</span>
        <div>
          <div class="context-label">你的内容</div>
          <div class="context-text">{{ section.resumeSummary }}</div>
        </div>
      </div>
    </div>

    <!-- 原文/编辑模式 -->
    <template v-if="isEditing">
      <van-field
        v-model="editText"
        type="textarea"
        :rows="4"
        autosize
        maxlength="5000"
        show-word-limit
        class="edit-textarea"
      />
      <div class="edit-actions">
        <van-button size="small" plain @click="cancelEdit">取消</van-button>
        <van-button
          size="small"
          type="primary"
          :loading="reevaluating"
          @click="submitReevaluate"
        >
          {{ reevaluating ? 'AI重新评分...' : 'AI重新评分' }}
        </van-button>
      </div>
      <div v-if="scoreChange !== null" :class="['score-change', scoreChange >= 0 ? 'up' : 'down']">
        {{ scoreChange >= 0 ? '↑' : '↓' }} 分数变化: {{ prevScore }} → {{ section.matchScore }} ({{ scoreChange > 0 ? '+' : '' }}{{ scoreChange }})
      </div>
    </template>

    <template v-else>
      <!-- 原文摘要（收起状态，点击展开） -->
      <div v-if="section.originalText" class="original-toggle" @click="showOriginal = !showOriginal">
        <span>查看原文</span>
        <van-icon :name="showOriginal ? 'arrow-up' : 'arrow-down'" size="12" />
      </div>
      <div v-if="showOriginal && section.originalText" class="section-original">
        {{ section.originalText }}
      </div>
    </template>

    <!-- 逐项比对 -->
    <div v-if="comparisons.length" class="comparisons-section">
      <div class="sub-title">🔍 逐项比对</div>

      <div v-for="group in comparisonGroups" :key="group.key" class="category-group">
        <div class="category-label">{{ group.label }}</div>
        <div
          v-for="(c, idx) in group.items"
          :key="group.key + '-' + idx"
          :class="['compare-item', group.css]"
        >
          <div class="compare-head">
            <span class="status-dot">{{ STATUS_MAP[c.status] }}</span>
            <span class="compare-item-name">{{ c.item }}</span>
            <span :class="['status-tag', c.status]">{{ STATUS_LABEL[c.status] }}</span>
          </div>
          <div class="compare-detail">
            <div class="detail-row">
              <span class="detail-label">JD要求</span>
              <span class="detail-value">{{ c.jdRequirement }}</span>
            </div>
            <div class="detail-row">
              <span class="detail-label">简历</span>
              <span class="detail-value">{{ c.resumeResponse }}</span>
            </div>
            <div class="detail-analysis">
              💬 {{ c.analysis }}
            </div>

            <!-- 行业壁垒与易学度评估 -->
            <div v-if="c.barrier || c.learnability" class="assessment-section">
              <div v-if="c.barrier" class="assessment-row">
                <span class="assessment-icon">🚧</span>
                <span class="assessment-label">行业壁垒</span>
                <span :class="['assessment-badge', c.barrier]">{{ BARRIER_LABEL[c.barrier] }}</span>
                <span class="assessment-text">{{ c.barrierReason }}</span>
              </div>
              <div v-if="c.learnability" class="assessment-row">
                <span class="assessment-icon">📚</span>
                <span class="assessment-label">知识易学度</span>
                <span :class="['assessment-badge', c.learnability]">{{ LEARNABILITY_LABEL[c.learnability] }}</span>
                <span class="assessment-text">{{ c.learnabilityReason }}</span>
              </div>
              <div v-if="c.advice" class="assessment-row advice">
                <span class="assessment-icon">💡</span>
                <span class="assessment-label">建议</span>
                <span class="assessment-text">{{ c.advice }}</span>
              </div>
            </div>
          </div>
        </div>
      </div>
    </div>

    <!-- 优劣势汇总 -->
    <div v-if="summaryCards.length" class="summary-section">
      <div class="sub-title">📊 优劣势汇总</div>
      <div class="summary-grid">
        <div v-for="card in summaryCards" :key="card.key" :class="['summary-card', card.css]">
          <div class="summary-card-title">{{ card.title }}</div>
          <div v-for="(item, idx) in card.items" :key="idx" class="summary-item">{{ item }}</div>
        </div>
      </div>
    </div>

    <!-- 改进建议 -->
    <div v-if="section.suggestions?.length" class="suggestions-section">
      <div class="sub-title">💡 改进建议</div>
      <div
        v-for="(sug, idx) in section.suggestions"
        :key="idx"
        class="suggestion-item"
      >
        {{ sug }}
      </div>
    </div>

    <!-- 向后兼容：旧数据展示 -->
    <template v-if="!hasNewData">
      <div v-if="section.matchedRequirements?.length" class="matched-reqs">
        <div class="mini-label">✅ 匹配了以下JD要求：</div>
        <div v-for="(req, idx) in section.matchedRequirements" :key="idx" class="matched-req">
          {{ req }}
        </div>
      </div>
      <div v-if="section.suggestions?.length" class="suggestions">
        <div class="mini-label suggest">💡 改进建议：</div>
        <div v-for="(sug, idx) in section.suggestions" :key="idx" class="suggestion-item">
          {{ sug }}
        </div>
      </div>
    </template>
  </div>
</template>

<script setup>
import { ref, computed } from 'vue'
import { showToast } from 'vant'
import { getGradeColor } from '../utils/format'
import { analysisApi } from '../api'

const props = defineProps({
  section: { type: Object, required: true },
  analysisId: { type: String, default: '' },
})

const emit = defineEmits(['section-updated'])

const showOriginal = ref(false)

// 编辑模式
const isEditing = ref(false)
const editText = ref('')
const reevaluating = ref(false)
const prevScore = ref(0)
const scoreChange = ref(null)

const sourceText = computed(() =>
  props.section.originalText || props.section.resumeSummary || ''
)

function startEdit() {
  if (!sourceText.value) {
    showToast('该板块没有可编辑的原文')
    return
  }
  editText.value = sourceText.value
  prevScore.value = props.section.matchScore || 0
  scoreChange.value = null
  isEditing.value = true
}

function cancelEdit() {
  isEditing.value = false
  reevaluating.value = false
}

async function submitReevaluate() {
  if (!editText.value.trim()) {
    showToast('内容不能为空')
    return
  }
  if (!props.analysisId) {
    showToast('缺少分析ID，无法重新评分')
    return
  }

  reevaluating.value = true
  try {
    const res = await analysisApi.reevaluateSection(
      props.analysisId,
      props.section.sectionType,
      props.section.sectionIndex,
      editText.value.trim()
    )

    const newScore = res.matchScore
    scoreChange.value = newScore - prevScore.value

    emit('section-updated', {
      sectionType: props.section.sectionType,
      sectionIndex: props.section.sectionIndex,
      data: res,
    })

    showToast('重新评分完成')
    isEditing.value = false
  } catch (e) {
    showToast('重新评分失败: ' + e.message)
  } finally {
    reevaluating.value = false
  }
}

// 常量映射表
const TYPE_LABEL = { experience: '经历', education: '教育', project: '项目', skill: '技能' }
const STATUS_MAP = { matched: '✅', partial: '⚠️', unmatched: '❌' }
const STATUS_LABEL = { matched: '匹配', partial: '部分', unmatched: '不匹配' }
const BARRIER_LABEL = { high: '高', medium: '中', low: '低' }
const LEARNABILITY_LABEL = { high: '容易', medium: '中等', low: '较难' }

const typeLabel = computed(() => TYPE_LABEL[props.section.sectionType] || props.section.sectionType)
const scoreColor = computed(() => getGradeColor(props.section.matchScore || 0))

// 判断是新数据还是旧数据
const hasNewData = computed(() =>
  (props.section.comparisons?.length > 0) ||
  props.section.jdExpectations ||
  props.section.resumeSummary
)

const comparisons = computed(() => props.section.comparisons || [])
const getList = (key) => props.section[key] || []

// 按 category 分组的比对项
const comparisonGroups = computed(() => [
  { key: 'gen', label: '通用能力', css: 'cat-general', items: comparisons.value.filter(c => c.category === '通用') },
  { key: 'spec', label: '垂直领域', css: 'cat-vertical', items: comparisons.value.filter(c => c.category === '垂直') },
].filter(g => g.items.length))

// 优劣势卡片（自动过滤空项）
const summaryCards = computed(() => [
  { key: 'gs', title: '💪 通用优势', items: getList('通用优势'), css: 'good' },
  { key: 'gw', title: '⚠️ 通用差距', items: getList('通用差距'), css: 'warn' },
  { key: 'vs', title: '🎯 垂直优势', items: getList('垂直优势'), css: 'good' },
  { key: 'vw', title: '🔴 垂直差距', items: getList('垂直差距'), css: 'danger' },
].filter(c => c.items.length))
</script>

<style scoped>
.section-analysis {
  background: var(--bg-card);
  border-radius: var(--radius-md);
  padding: 16px;
  box-shadow: var(--shadow-sm);
}

/* 头部 */
.section-header {
  display: flex;
  align-items: center;
  gap: 8px;
}

.section-type-badge {
  font-size: 11px;
  font-weight: 600;
  padding: 2px 8px;
  background: #f0f0f0;
  color: var(--text-secondary);
  border-radius: 4px;
  letter-spacing: 0.3px;
}

.section-label {
  flex: 1;
  font-size: 14px;
  font-weight: 600;
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;
}

.section-score {
  font-size: 16px;
  font-weight: 700;
  flex-shrink: 0;
  font-variant-numeric: tabular-nums;
}

.edit-trigger {
  cursor: pointer;
  flex-shrink: 0;
}

/* 编辑模式 */
.edit-textarea {
  margin-top: 10px;
  border-radius: var(--radius-md);
  background: #fff;
}

.edit-actions {
  display: flex;
  justify-content: flex-end;
  gap: 8px;
  margin-top: 8px;
}

.score-change {
  font-size: 12px;
  font-weight: 600;
  padding: 4px 8px;
  border-radius: 4px;
  margin-top: 6px;
  text-align: center;
}

.score-change.up {
  background: #e8f8e8;
  color: #07c160;
}

.score-change.down {
  background: #ffe8e8;
  color: #ee0a24;
}

/* JD要求 vs 简历内容 */
.context-box {
  margin-top: 10px;
  padding: 12px;
  background: #f5f5f7;
  border-radius: 8px;
  display: flex;
  flex-direction: column;
  gap: 8px;
}

.context-row {
  display: flex;
  gap: 8px;
  font-size: 12px;
  line-height: 1.5;
}

.context-icon {
  flex-shrink: 0;
  font-size: 14px;
}

.context-label {
  font-size: 11px;
  color: var(--text-secondary);
  margin-bottom: 1px;
  font-weight: 500;
}

.context-text {
  color: var(--text-primary);
}

/* 原文切换 */
.original-toggle {
  margin-top: 8px;
  font-size: 12px;
  color: var(--color-primary);
  cursor: pointer;
  display: flex;
  align-items: center;
  gap: 4px;
}

.section-original {
  font-size: 12px;
  color: var(--text-secondary);
  line-height: 1.5;
  margin-top: 4px;
  padding: 8px;
  background: #fafafa;
  border-radius: 4px;
}

/* 子标题 */
.sub-title {
  font-size: 13px;
  font-weight: 600;
  margin-bottom: 8px;
  margin-top: 12px;
}

.sub-title:first-child {
  margin-top: 0;
}

/* 逐项比对 */
.comparisons-section {
  margin-top: 4px;
}

.category-group {
  margin-bottom: 10px;
}

.category-label {
  font-size: 11px;
  font-weight: 600;
  color: var(--text-secondary);
  padding: 3px 8px;
  background: #f0f0f0;
  border-radius: 4px;
  display: inline-block;
  margin-bottom: 6px;
}

.compare-item {
  border-radius: 6px;
  padding: 8px 10px;
  margin-bottom: 6px;
  border-left: 3px solid;
}

.compare-item.cat-general {
  background: #f8f9fb;
  border-left-color: var(--color-primary, #1989fa);
}

.compare-item.cat-vertical {
  background: #fdf6f6;
  border-left-color: #ff6b6b;
}

.compare-head {
  display: flex;
  align-items: center;
  gap: 6px;
}

.status-dot {
  font-size: 14px;
  flex-shrink: 0;
}

.compare-item-name {
  flex: 1;
  font-size: 13px;
  font-weight: 500;
}

.status-tag {
  font-size: 10px;
  padding: 1px 6px;
  border-radius: 10px;
  font-weight: 500;
}

.status-tag.matched {
  background: #e8f8e8;
  color: #07c160;
}

.status-tag.partial {
  background: #fff3e0;
  color: #ff976a;
}

.status-tag.unmatched {
  background: #ffe8e8;
  color: #ee0a24;
}

.compare-detail {
  margin-top: 4px;
  padding: 4px 0 0 20px;
}

.detail-row {
  display: flex;
  font-size: 11px;
  line-height: 1.6;
  gap: 6px;
}

.detail-label {
  color: var(--text-secondary);
  width: 36px;
  flex-shrink: 0;
}

.detail-value {
  color: var(--text-primary);
  flex: 1;
}

.detail-analysis {
  font-size: 11px;
  color: var(--text-secondary);
  margin-top: 3px;
  padding: 4px 6px;
  background: #fff;
  border-radius: 4px;
  line-height: 1.4;
}

/* 行业壁垒与易学度评估 */
.assessment-section {
  margin-top: 6px;
  padding: 6px 8px;
  background: #f8f9fb;
  border-radius: 4px;
  display: flex;
  flex-direction: column;
  gap: 4px;
}

.assessment-row {
  display: flex;
  align-items: flex-start;
  gap: 4px;
  font-size: 11px;
  line-height: 1.4;
}

.assessment-icon {
  flex-shrink: 0;
  font-size: 11px;
}

.assessment-label {
  color: var(--text-secondary);
  flex-shrink: 0;
  width: 54px;
  font-weight: 500;
}

.assessment-badge {
  font-size: 10px;
  padding: 0 5px;
  border-radius: 3px;
  flex-shrink: 0;
  font-weight: 500;
}

.assessment-badge.high {
  background: #ffe8e8;
  color: #ee0a24;
}

.assessment-badge.medium {
  background: #fff3e0;
  color: #ff976a;
}

.assessment-badge.low {
  background: #e8f8e8;
  color: #07c160;
}

.assessment-text {
  color: var(--text-secondary);
  flex: 1;
}

.assessment-row.advice .assessment-text {
  color: var(--text-primary);
  font-weight: 500;
}

/* 优劣势汇总 */
.summary-section {
  margin-top: 4px;
}

.summary-grid {
  display: grid;
  grid-template-columns: 1fr 1fr;
  gap: 6px;
}

.summary-card {
  border-radius: 6px;
  padding: 8px 10px;
}

.summary-card.good {
  background: #f0faf0;
}

.summary-card.warn {
  background: #fffbf0;
}

.summary-card.danger {
  background: #fff0f0;
}

.summary-card-title {
  font-size: 11px;
  font-weight: 600;
  margin-bottom: 4px;
}

.summary-item {
  font-size: 11px;
  color: var(--text-secondary);
  line-height: 1.5;
  padding: 1px 0;
}

/* 改进建议 */
.suggestions-section {
  margin-top: 4px;
}

.suggestion-item {
  font-size: 12px;
  color: var(--text-secondary);
  padding: 4px 8px;
  line-height: 1.5;
  background: #fefce8;
  border-radius: 4px;
  margin-bottom: 4px;
}

/* 向后兼容（旧数据） */
.matched-reqs, .suggestions {
  margin-top: 10px;
}

.mini-label {
  font-size: 12px;
  font-weight: 500;
  color: var(--color-success);
  margin-bottom: 4px;
}

.mini-label.suggest {
  color: var(--color-warning);
}

.matched-req {
  font-size: 12px;
  color: var(--text-secondary);
  padding: 2px 0;
}

@media (min-width: 768px) {
  .summary-grid {
    grid-template-columns: 1fr 1fr;
  }
}
</style>
