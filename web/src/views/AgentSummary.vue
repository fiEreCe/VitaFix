<template>
  <AppPage
    title="最终结果汇总"
    description="回看每个任务的表达、事实引用与审核状态"
    back
    @back="router.back()"
  >
    <StatusPanel v-if="loading" kind="loading" title="正在加载结果汇总…" />

    <StatusPanel
      v-else-if="notFound"
      kind="error"
      title="汇总不存在或已过期"
      message="该会话可能已过期、被删除，或不属于当前设备。"
      retryable
      action-label="返回历史记录"
      @retry="router.push('/history')"
    />

    <StatusPanel
      v-else-if="error"
      kind="error"
      title="汇总加载失败"
      :message="error.message || '请检查网络后重试。'"
      retryable
      @retry="load"
    />

    <StatusPanel
      v-else-if="!data"
      kind="empty"
      title="暂无可汇总的内容"
      message="会话已创建但还没有持久化的任务结果。"
      retryable
      action-label="返回工作台"
      @retry="openWorkbench()"
    />

    <StatusPanel
      v-else-if="tasks.length === 0"
      kind="empty"
      title="还没有可汇总的任务"
      message="本次会话尚未生成优化任务，可返回工作台查看当前状态。"
      retryable
      action-label="返回工作台"
      @retry="openWorkbench()"
    />

    <div v-else class="summary">
      <section class="summary-hero" aria-labelledby="summary-title">
        <div class="summary-heading">
          <p class="summary-eyebrow">优化会话结果</p>
          <h2 id="summary-title">{{ data.title || '简历优化会话' }}</h2>
          <p v-if="data.company || data.position" class="summary-meta">
            {{ data.company }}<span v-if="data.company && data.position"> · </span>{{ data.position }}
          </p>
          <p class="summary-time">
            {{ sessionStateLabel(data.state) }} · 更新于 {{ formatDate(data.updatedAt || data.createdAt) || '未知时间' }}
          </p>
        </div>

        <div class="summary-stats" aria-label="任务统计">
          <div class="stat">
            <strong>{{ totals.taskCount }}</strong>
            <span>任务总数</span>
          </div>
          <div class="stat">
            <strong>{{ totals.completedCount }}</strong>
            <span>已完成</span>
          </div>
          <div class="stat">
            <strong>{{ totals.adoptedCount }}</strong>
            <span>已采用</span>
          </div>
          <div class="stat">
            <strong>{{ totals.decisionPendingCount }}</strong>
            <span>待决定</span>
          </div>
        </div>
      </section>

      <p class="scope-note" role="note">
        完成口径：已采用、验证通过、风险确认、拒绝、跳过或能力缺口计为已完成；
        草稿、候选和仍在处理的任务不计入。汇总读取已保存的结果，不会再次调用 AI。
      </p>

      <section class="batch-bar" aria-label="批量复制">
        <div class="batch-copy">
          <h3>批量复制</h3>
          <p>“已采用”只包含采用/验证通过/风险确认后的表达；“全部”还会包含草稿与候选表达，不包含原始事实。</p>
        </div>
        <div class="batch-actions">
          <button
            type="button"
            class="batch-btn batch-btn--primary pressable"
            :disabled="adoptedTasks.length === 0"
            @click="copyAdopted"
          >
            复制已采用表达（{{ adoptedTasks.length }}）
          </button>
          <button
            type="button"
            class="batch-btn pressable"
            :disabled="copyableTasks.length === 0"
            @click="copyAll"
          >
            复制全部表达（{{ copyableTasks.length }}）
          </button>
        </div>
      </section>

      <section class="task-list" aria-label="任务结果列表">
        <article
          v-for="(task, index) in tasks"
          :key="task.id || `task-${index}`"
          class="task-card"
          :data-task-id="task.id"
        >
          <header class="task-header">
            <span class="task-index">任务 {{ index + 1 }}</span>
            <span class="state-pill" :class="`state-pill--${stateTone(task.state)}`">
              {{ taskStateLabel(task.state) }}
            </span>
            <span v-if="task.recommended" class="recommend-pill">推荐</span>
          </header>

          <h3 class="task-requirement">{{ task.requirementText || '岗位要求' }}</h3>

          <section class="task-section">
            <h4>原始表达 / 事实依据</h4>
            <p v-if="task.originalText" class="task-text">{{ task.originalText }}</p>
            <p v-else class="muted">暂无可用的原始事实。</p>
          </section>

          <section class="task-section expression" :class="`expression--${task.expressionKind}`">
            <div class="expression-heading">
              <h4>{{ expressionHeading(task) }}</h4>
              <span class="kind-pill" :class="`kind-pill--${task.expressionKind}`">
                {{ expressionKindLabel(task.expressionKind) }}
              </span>
            </div>
            <p v-if="expressionText(task)" class="task-text">{{ expressionText(task) }}</p>
            <p v-else class="muted">{{ emptyExpressionHint(task) }}</p>
            <button
              v-if="expressionText(task)"
              type="button"
              class="copy-btn"
              :aria-label="`复制任务 ${index + 1} 的表达`"
              @click="copyTask(task)"
            >
              复制这条表达
            </button>
          </section>

          <section class="task-section">
            <div class="verification-row">
              <h4>审核状态</h4>
              <span class="verification-pill" :class="`verification-pill--${verificationTone(task.verificationStatus)}`">
                {{ verificationLabel(task.verificationStatus) }}
              </span>
            </div>
            <p v-if="task.validation?.stale" class="risk-note">
              当前文本已再次编辑，之前的验证记录（{{ verificationLabel(task.validation.safetyStatus) }}）不再适用于新文本。
            </p>
            <p v-if="task.riskAcknowledged" class="risk-note risk-note--strong">
              已由用户确认保留风险内容；该表达不会标记为“已验证”。
            </p>
            <ul v-if="task.risks?.length" class="risk-list">
              <li v-for="(risk, riskIndex) in task.risks" :key="`${risk.type}-${riskIndex}`">
                <span>{{ risk.type }}</span>
                <span v-if="risk.message">：{{ risk.message }}</span>
              </li>
            </ul>
            <p v-else class="muted">暂无额外风险提示。</p>
          </section>

          <section class="task-section">
            <h4>事实引用</h4>
            <ul v-if="task.facts?.length" class="fact-list">
              <li v-for="fact in task.facts" :key="fact.id">
                <span class="fact-id">{{ fact.id }}</span>
                <span class="fact-text">{{ fact.sourceText }}</span>
                <span class="fact-confirmation">{{ factConfirmationLabel(fact.confirmation) }}</span>
              </li>
            </ul>
            <p v-else class="muted">暂无事实引用。</p>
          </section>

          <footer class="task-footer">
            <button type="button" class="workbench-btn pressable" @click="openWorkbench(task)">
              返回工作台继续处理
            </button>
          </footer>
        </article>
      </section>
    </div>
  </AppPage>
</template>

<script setup>
import { computed, onMounted, ref, watch } from 'vue'
import { useRoute, useRouter } from 'vue-router'
import { showToast } from 'vant'
import { agentSessionApi } from '../api'
import { formatDate } from '../utils/format'
import {
  copyText,
  expressionKindLabel,
  sessionStateLabel,
  taskStateLabel,
  verificationLabel,
} from '../utils/agent'
import AppPage from '../components/ui/AppPage.vue'
import StatusPanel from '../components/ui/StatusPanel.vue'

const route = useRoute()
const router = useRouter()

const data = ref(null)
const loading = ref(true)
const error = ref(null)
const notFound = ref(false)

const sessionId = computed(() => route.params.id || '')
const tasks = computed(() => (
  Array.isArray(data.value?.tasks) ? data.value.tasks : []
))
const totals = computed(() => {
  const value = data.value?.totals || {}
  return {
    taskCount: value.taskCount ?? data.value?.taskCount ?? 0,
    completedCount: value.completedCount ?? data.value?.completedCount ?? 0,
    adoptedCount: value.adoptedCount ?? 0,
    decisionPendingCount: value.decisionPendingCount ?? 0,
    draftCount: value.draftCount ?? 0,
    incompleteCount: value.incompleteCount ?? 0,
  }
})

function expressionText(task) {
  if (!task) return ''
  if (task.expressionKind === 'candidate' || task.expressionKind === 'candidate_unverified') {
    return task.candidateText || ''
  }
  if (task.expressionKind === 'none') return ''
  return task.currentText || task.candidateText || ''
}

function expressionHeading(task) {
  if (task.expressionKind === 'draft') return '当前草稿'
  if (task.expressionKind === 'candidate') return '候选表达'
  if (task.expressionKind === 'candidate_unverified') return '未采用的候选表达'
  if (task.expressionKind === 'adopted_with_risk') return '当前表达（风险已确认）'
  if (task.expressionKind === 'adopted') return '当前表达'
  return '当前表达'
}

function emptyExpressionHint(task) {
  if (task.decisionPending) return '候选表达仍待你决定。'
  if (['rejected', 'skipped', 'capability_gap'].includes(task.state)) {
    return '该任务已结束，未采用新的表达。'
  }
  return '尚未生成可用表达，可返回工作台继续处理。'
}

function stateTone(state) {
  if (['accepted', 'ready_for_reevaluation'].includes(state)) return 'success'
  if (state === 'completed_with_risk') return 'warning'
  if (['rejected', 'skipped', 'capability_gap'].includes(state)) return 'muted'
  if (['generation_failed', 'verification_failed', 'question_failed', 'parse_failed', 'match_failed'].includes(state)) return 'danger'
  return 'active'
}

function verificationTone(status) {
  if (status === 'passed') return 'success'
  if (status === 'warning') return 'warning'
  if (status === 'blocked') return 'danger'
  if (status === 'unavailable') return 'muted'
  if (status === 'not_generated' || status === 'not_applicable') return 'neutral'
  return 'warning'
}

function factConfirmationLabel(value) {
  return ({
    confirmed: '已确认',
    corrected: '已修正',
    pending_confirmation: '待确认',
    rejected: '已拒绝',
    extracted: '自动提取',
  })[value] || ''
}

const adoptedTasks = computed(() => tasks.value
  .filter((task) => task.adopted && expressionText(task)))

const copyableTasks = computed(() => tasks.value
  .filter((task) => expressionText(task)))

function taskCopyBlock(task, { includeKind = false } = {}) {
  const lines = [`【${task.requirementText || '岗位要求'}】`, expressionText(task)]
  if (includeKind) lines.push(`（${expressionKindLabel(task.expressionKind)}）`)
  if (task.expressionKind === 'adopted_with_risk' || task.riskAcknowledged) {
    lines.push('（风险已确认，请自行核对事实后再使用）')
  }
  return lines.filter(Boolean).join('\n')
}

async function copyValue(value, successMessage) {
  const copied = await copyText(value)
  showToast(copied ? successMessage : '复制失败，请手动选择文本')
}

function copyTask(task) {
  const text = expressionText(task)
  if (!text) return
  void copyValue(
    text,
    `已复制第 ${tasks.value.indexOf(task) + 1} 条表达`,
  )
}

function copyAdopted() {
  if (!adoptedTasks.value.length) return
  void copyValue(
    adoptedTasks.value.map((task) => taskCopyBlock(task)).join('\n\n'),
    `已复制 ${adoptedTasks.value.length} 条已采用表达`,
  )
}

function copyAll() {
  if (!copyableTasks.value.length) return
  void copyValue(
    copyableTasks.value.map((task) => taskCopyBlock(task, { includeKind: true })).join('\n\n'),
    `已复制 ${copyableTasks.value.length} 条表达`,
  )
}

function openWorkbench(task) {
  const query = task?.id ? { task: task.id } : {}
  router.push({ path: `/agent/${sessionId.value}`, query })
}

function isNotFound(value) {
  return value?.status === 404 || value?.code === 'AGENT_SESSION_NOT_FOUND'
}

async function load() {
  const id = sessionId.value
  loading.value = true
  error.value = null
  notFound.value = false
  if (!id) {
    loading.value = false
    notFound.value = true
    return
  }
  try {
    const value = await agentSessionApi.summary(id)
    if (sessionId.value !== id) return
    data.value = value
  } catch (e) {
    if (sessionId.value !== id) return
    if (isNotFound(e)) notFound.value = true
    else error.value = e
  } finally {
    if (sessionId.value === id) loading.value = false
  }
}

onMounted(load)

watch(sessionId, () => {
  data.value = null
  void load()
})
</script>

<style scoped>
.summary {
  display: grid;
  gap: var(--spacing-lg);
  width: min(100%, var(--workspace-max));
  margin: 0 auto;
  padding-bottom: var(--spacing-2xl);
}

.summary-hero {
  display: grid;
  gap: var(--spacing-lg);
  padding: var(--spacing-xl);
  background: var(--surface-content);
  border: 1px solid var(--border-subtle);
  border-radius: var(--radius-xl);
  box-shadow: var(--shadow-sm);
}

.summary-eyebrow,
.summary-meta,
.summary-time {
  margin: 0;
  color: var(--text-secondary);
  font-size: var(--type-caption);
}

.summary-eyebrow {
  color: var(--color-primary);
  font-weight: 600;
  letter-spacing: 0.04em;
}

.summary-heading h2 {
  margin: 0.35rem 0 0;
  font-size: var(--type-title);
  line-height: 1.2;
  overflow-wrap: anywhere;
}

.summary-meta {
  margin-top: var(--spacing-sm);
  font-size: var(--type-body);
}

.summary-time {
  margin-top: var(--spacing-xs);
}

.summary-stats {
  display: grid;
  grid-template-columns: repeat(2, minmax(0, 1fr));
  gap: var(--spacing-sm);
}

.stat {
  display: grid;
  gap: 2px;
  padding: var(--spacing-md);
  background: var(--surface-subtle);
  border-radius: var(--radius-md);
}

.stat strong {
  font-size: 1.5rem;
  line-height: 1;
}

.stat span {
  color: var(--text-secondary);
  font-size: var(--type-caption);
}

.scope-note {
  margin: 0;
  padding: var(--spacing-md);
  color: var(--text-secondary);
  font-size: var(--type-caption);
  line-height: 1.6;
  background: var(--surface-subtle);
  border-radius: var(--radius-md);
}

.batch-bar {
  display: grid;
  gap: var(--spacing-md);
  padding: var(--spacing-lg);
  background: var(--surface-content);
  border: 1px solid var(--border-subtle);
  border-radius: var(--radius-lg);
}

.batch-copy h3,
.batch-copy p {
  margin: 0;
}

.batch-copy h3 {
  font-size: var(--type-headline);
}

.batch-copy p {
  margin-top: var(--spacing-xs);
  color: var(--text-secondary);
  font-size: var(--type-caption);
  line-height: 1.55;
}

.batch-actions {
  display: flex;
  flex-wrap: wrap;
  gap: var(--spacing-sm);
}

.batch-btn,
.copy-btn,
.workbench-btn {
  min-height: 2.75rem;
  padding: 0.6rem 1rem;
  border-radius: 999px;
  border: 1px solid var(--border-strong);
  background: var(--surface-content);
  color: var(--color-primary);
  cursor: pointer;
  font: inherit;
  font-weight: 600;
}

.batch-btn--primary,
.workbench-btn {
  background: var(--color-primary);
  border-color: var(--color-primary);
  color: #fff;
}

.batch-btn:disabled {
  cursor: not-allowed;
  opacity: 0.5;
}

.task-list {
  display: grid;
  grid-template-columns: minmax(0, 1fr);
  gap: var(--spacing-md);
}

.task-card {
  display: grid;
  gap: var(--spacing-md);
  min-width: 0;
  padding: var(--spacing-lg);
  background: var(--surface-content);
  border: 1px solid var(--border-subtle);
  border-radius: var(--radius-lg);
  box-shadow: var(--shadow-sm);
}

.task-header {
  display: flex;
  flex-wrap: wrap;
  align-items: center;
  gap: var(--spacing-sm);
}

.task-index {
  color: var(--text-secondary);
  font-size: var(--type-caption);
  font-weight: 600;
}

.state-pill,
.kind-pill,
.verification-pill,
.recommend-pill {
  display: inline-block;
  padding: 2px 8px;
  border-radius: 999px;
  font-size: 12px;
  font-weight: 600;
  line-height: 1.5;
}

.state-pill--success,
.verification-pill--success {
  background: #e8f8ee;
  color: #0b7a3b;
}

.state-pill--warning,
.verification-pill--warning,
.kind-pill--adopted_with_risk {
  background: #fff4df;
  color: #8a5a00;
}

.state-pill--danger,
.verification-pill--danger {
  background: #ffecec;
  color: #b42318;
}

.state-pill--muted,
.verification-pill--muted {
  background: var(--surface-subtle);
  color: var(--text-secondary);
}

.state-pill--active,
.verification-pill--neutral {
  background: var(--surface-selected, #eef5ff);
  color: var(--color-primary);
}

.kind-pill--adopted {
  background: #e8f8ee;
  color: #0b7a3b;
}

.kind-pill--draft,
.kind-pill--candidate,
.kind-pill--candidate_unverified,
.kind-pill--none {
  background: var(--surface-subtle);
  color: var(--text-secondary);
}

.recommend-pill {
  background: var(--surface-subtle);
  color: var(--color-primary);
}

.task-requirement {
  margin: 0;
  font-size: var(--type-headline);
  line-height: 1.45;
  overflow-wrap: anywhere;
}

.task-section {
  display: grid;
  gap: var(--spacing-sm);
  min-width: 0;
}

.task-section h4 {
  margin: 0;
  font-size: var(--type-caption);
  color: var(--text-secondary);
}

.task-text {
  margin: 0;
  white-space: pre-wrap;
  line-height: 1.7;
  overflow-wrap: anywhere;
}

.expression {
  padding: var(--spacing-md);
  background: var(--surface-subtle);
  border-radius: var(--radius-md);
}

.expression--adopted,
.expression--adopted_with_risk {
  border-left: 3px solid #0b7a3b;
}

.expression--adopted_with_risk {
  border-left-color: #b7791f;
}

.expression--draft,
.expression--candidate {
  border-left: 3px dashed var(--border-strong);
}

.expression-heading,
.verification-row {
  display: flex;
  flex-wrap: wrap;
  align-items: center;
  justify-content: space-between;
  gap: var(--spacing-sm);
}

.copy-btn {
  justify-self: start;
  min-height: 2.25rem;
  padding: 0.4rem 0.9rem;
  font-size: var(--type-caption);
}

.muted {
  margin: 0;
  color: var(--text-secondary);
  font-size: var(--type-caption);
  line-height: 1.6;
}

.risk-note {
  margin: 0;
  color: #8a5a00;
  font-size: var(--type-caption);
  line-height: 1.55;
}

.risk-note--strong {
  font-weight: 600;
}

.risk-list,
.fact-list {
  display: grid;
  gap: var(--spacing-xs);
  margin: 0;
  padding: 0;
  list-style: none;
}

.risk-list li {
  padding: 6px 8px;
  color: #8a5a00;
  font-size: var(--type-caption);
  background: #fff4df;
  border-radius: var(--radius-sm, 8px);
  overflow-wrap: anywhere;
}

.fact-list li {
  display: flex;
  flex-wrap: wrap;
  align-items: baseline;
  gap: 6px;
  padding: 6px 8px;
  font-size: var(--type-caption);
  background: var(--surface-subtle);
  border-radius: var(--radius-sm, 8px);
}

.fact-id {
  color: var(--text-secondary);
  font-family: ui-monospace, SFMono-Regular, Menlo, monospace;
  font-size: 11px;
}

.fact-text {
  flex: 1 1 12rem;
  min-width: 0;
  overflow-wrap: anywhere;
}

.fact-confirmation {
  color: var(--text-secondary);
}

.task-footer {
  display: flex;
  justify-content: flex-end;
}

@media (min-width: 48rem) {
  .summary-hero {
    grid-template-columns: minmax(0, 1.2fr) minmax(16rem, 0.8fr);
    align-items: center;
  }

  .summary-stats {
    grid-template-columns: repeat(4, minmax(0, 1fr));
  }

  .batch-bar {
    grid-template-columns: minmax(0, 1fr) auto;
    align-items: center;
  }

  .task-list {
    grid-template-columns: repeat(2, minmax(0, 1fr));
  }
}
</style>
