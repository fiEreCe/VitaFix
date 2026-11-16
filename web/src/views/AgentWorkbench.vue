<template>
  <AppPage title="证据驱动简历优化" description="确认事实，再决定如何表达" back @back="$router.back()">
    <StatusPanel v-if="loading" kind="loading" title="正在建立证据匹配…" message="正在加载优化任务与审核上下文。" />
    <StatusPanel
      v-else-if="notFound"
      kind="error"
      title="会话不存在或已过期"
      message="该会话可能已被删除、已过期，或不属于当前设备。请重新开始一次分析。"
      retryable
      action-label="重新开始"
      @retry="restart"
    />
    <StatusPanel
      v-else-if="loadError"
      kind="error"
      title="暂时无法加载会话"
      :message="loadErrorMessage"
      retryable
      @retry="load"
    />
    <StatusPanel
      v-else-if="!session"
      kind="error"
      title="会话状态暂不可用"
      message="已创建的会话不会丢失，请重试加载。"
      retryable
      @retry="load"
    />
    <template v-else-if="starting || session.state === 'draft'">
      <StatusPanel
        v-if="startError"
        kind="error"
        title="分析启动失败"
        :message="startErrorMessage"
        retryable
        action-label="重试启动"
        @retry="startSession()"
      />
      <StatusPanel
        v-else
        kind="loading"
        title="正在启动分析…"
        message="分析任务已在服务端创建，本页会自动获取最新状态。如果长时间无响应，可以刷新页面继续等待。"
      />
    </template>
    <StatusPanel
      v-else-if="isProcessing"
      kind="loading"
      :title="processingTitle"
      :message="processingMessage"
    />
    <StatusPanel
      v-else-if="FAILED_ANALYSIS_STATES.has(session.state)"
      kind="error"
      :title="session.state === 'parsing_failed' ? '岗位或简历解析失败' : '证据匹配失败'"
      message="本次会话和已提交的输入均已保留。可以直接重试分析，不会创建新的会话。"
      retryable
      action-label="重试分析"
      @retry="startSession()"
    />
    <StatusPanel
      v-else-if="['cancelled', 'expired'].includes(session.state)"
      kind="error"
      title="本次优化会话已结束"
      message="该会话无法继续使用，可以重新发起一次分析。"
      retryable
      action-label="重新开始"
      @retry="restart"
    />
    <StatusPanel
      v-else-if="!task"
      kind="empty"
      title="当前没有可处理的优化任务"
      message="系统未在本会话中找到可处理的岗位要求，可以重新发起分析。"
      retryable
      action-label="重新开始"
      @retry="restart"
    />
    <div v-else class="agent-workbench">
      <van-notice-bar v-if="actionError" color="#ee0a24" :text="actionError" />
      <div class="agent-toolbar">
        <button type="button" class="summary-link pressable" @click="openSummary">
          查看最终结果汇总
        </button>
      </div>
      <div class="agent-layout adaptive-grid adaptive-grid--sidebar adaptive-grid--context">
        <AgentTaskNavigation
          :tasks="session.tasks"
          :requirements="session.requirements"
          :selected-id="task?.id"
          :disabled="busy"
          @select="select"
        />
        <section class="agent-stage" aria-label="当前优化任务">
        <section class="card"><h3>岗位依据</h3><p>{{ requirement(task).sourceText }}</p><h3>可用事实</h3><ul v-if="facts(task).length" class="fact-summary"><li v-for="fact in facts(task)" :key="fact.id"><span>{{ fact.sourceText }}</span><span class="fact-summary__status">{{ factStatusLabel(fact) }}</span></li></ul><p v-else>当前任务尚未引用事实。</p></section>
        <section v-if="task.state === 'pending'" class="card"><h3>这项岗位要求可以开始处理</h3><p>系统已整理岗位依据和可用事实。开始后，你可以补充事实、优化表达，或选择跳过。</p><van-button type="primary" block round :loading="busy" @click="startTask">开始处理</van-button></section>
        <section v-if="task.state === 'capability_gap'" class="card"><h3>当前经历缺少这项证据</h3><p>系统没有找到可以支持“{{ requirement(task).sourceText }}”的真实经历，也不会替你虚构事实。</p><p>你可以跳过当前任务，或从左侧选择其他任务继续。</p><van-button type="primary" block round :loading="busy" @click="skipTask">跳过这个任务</van-button><van-button plain block round style="margin-top:8px" :disabled="!hasOtherTask" @click="selectNextTask">处理其他任务</van-button></section>
        <section v-if="task.state === 'questioning'" class="card"><h3>补充一个关键事实（{{ task.effectiveRounds }}/3）</h3><p>{{ task.currentQuestion || '请补充你本人具体做了什么、服务对象，以及使用的方法或产出。' }}</p><van-field v-model="answer" rows="3" autosize type="textarea" placeholder="例如：我设计访谈提纲并整理了用户洞察" /><van-button type="primary" block round :loading="busy" @click="submitAnswer">提交并确认事实</van-button><div class="minor"><van-button size="small" @click="specialAnswer('不记得')">不记得</van-button><van-button size="small" @click="specialAnswer('没有做过')">没有做过</van-button><van-button size="small" @click="specialAnswer('无法证明')">无法证明</van-button></div></section>
        <section v-if="task.state === 'awaiting_fact_confirmation'" class="card">
          <h3>请核对将进入候选审核的事实</h3>
          <template v-if="pendingFact(task)">
          <p v-if="pendingFactCount(task) > 1" class="fact-review__progress">第 {{ pendingFactIndex(task) }} / {{ pendingFactCount(task) }} 条待确认</p>
          <p class="fact-review__source">{{ pendingFact(task)?.sourceText }}</p>
          <dl v-if="pendingFactFields(task).length" class="fact-fields">
            <template v-for="field in pendingFactFields(task)" :key="field.key">
              <dt>{{ field.label }}</dt>
              <dd>{{ field.value }}</dd>
            </template>
          </dl>
          <p v-else class="muted">系统没有提取到结构化字段，请通过“修正内容”补充，或直接确认原始描述。</p>

          <template v-if="!correctingFact">
            <van-button type="primary" block round :loading="busy" @click="reviewFact('confirm')">确认无误</van-button>
            <van-button plain block round style="margin-top:8px" :disabled="busy" @click="startCorrection">修正内容</van-button>
            <van-button plain block round style="margin-top:8px" :loading="busy" @click="reviewFact('reject')">不是这个意思</van-button>
          </template>
          <template v-else>
            <label v-for="field in FACT_FIELDS" :key="field.key" class="fact-correction__field">
              <span>{{ field.label }}</span>
              <textarea
                v-if="field.key !== 'quantity'"
                v-model="correction[field.key]"
                rows="2"
                :placeholder="field.placeholder"
              ></textarea>
              <input
                v-else
                v-model="correction[field.key]"
                type="text"
                :placeholder="field.placeholder"
              />
            </label>
            <p v-if="correctionError" class="risk">{{ correctionError }}</p>
            <van-button type="primary" block round style="margin-top:8px" :loading="busy" @click="submitCorrection">保存修正并确认</van-button>
            <van-button plain block round style="margin-top:8px" :disabled="busy" @click="cancelCorrection">取消修正</van-button>
          </template>
          </template>
          <template v-else>
            <p class="muted">待确认事实已处理或不再可用。</p>
            <van-button type="primary" block round :loading="busy" @click="resumeTask">继续处理</van-button>
          </template>
        </section>
        <section v-if="task.state === 'generating' || task.state === 'assessing_evidence'" class="card"><van-button type="primary" block round :loading="busy" @click="generate">生成候选表达</van-button></section>
        <section v-if="task.candidate" class="card"><h3>候选表达</h3><p class="candidate">{{ task.candidate.text }}</p><van-tag :type="verificationTag(task.candidate.verification.status)">{{ verificationLabel(task.candidate.verification.status) }}</van-tag><p v-if="task.candidate.verification.findings?.length" class="risk">{{ verificationHint(task.candidate.verification.status) }}</p><p>{{ task.candidate.rationaleSummary }}</p><template v-if="task.state === 'awaiting_user_decision'"><van-button type="primary" block round :loading="busy" @click="decide('accepted')">采用这条表达</van-button><van-button plain block round style="margin-top:8px" @click="editMode=true">编辑后采用</van-button><van-button plain block round style="margin-top:8px" @click="decide('rejected')">拒绝并保留原文</van-button></template></section>
        <section v-if="task.state === 'question_failed'" class="card"><h3>回答暂未完成分析</h3><p>你的原回答和已确认事实均已保留，可以直接重试。</p><p v-if="task.pendingAnswer" class="candidate">{{ task.pendingAnswer }}</p><van-button type="primary" block round :loading="busy" @click="retry">重试分析回答</van-button></section>
        <section v-if="['generation_failed','verification_failed'].includes(task.state)" class="card"><h3>候选内容未通过安全校验</h3><p>原始事实和当前任务已保留。你可以重试生成，或自己编辑后继续。</p><van-button type="primary" block round :loading="busy" @click="retry">重试</van-button><van-button plain block round style="margin-top:8px" @click="editMode=true">自己编辑</van-button></section>
        <section v-if="editMode" class="card"><h3>自主编辑</h3><van-field v-model="editedText" rows="4" autosize type="textarea" :placeholder="task.candidate?.text || '输入你的表达'" /><p>保存不会自动验证；完成本轮修改后可主动验证。</p><van-button plain block round @click="saveEdit">保存草稿</van-button><van-button type="primary" block round style="margin-top:8px" :loading="busy" @click="validateEdit">完成修改并验证</van-button></section>
        <section v-if="latestValidation(task)" class="card"><h3>本轮修改效果验证</h3><p v-if="latestValidation(task).safetyStatus === 'unavailable'">验证暂未完成，系统不会宣称本次修改已有改善。</p><p v-else>{{ outcomeLabel(latestValidation(task).changeOutcome) }} · {{ safetyLabel(latestValidation(task).safetyStatus) }}</p><p class="candidate">{{ latestValidation(task).diff.before }} → {{ latestValidation(task).diff.after }}</p><p v-for="(issue, index) in latestValidation(task).remainingIssues" :key="`${issue.type}-${index}`" class="risk">{{ issue.type }}</p><van-button v-if="latestValidation(task).safetyStatus === 'unavailable'" type="primary" block round :loading="busy" @click="validateSavedEdit">重试验证</van-button><van-button v-if="latestValidation(task).safetyStatus === 'blocked' && task.state !== 'completed_with_risk'" type="warning" block round @click="completeWithRisk">确认保留风险内容</van-button></section>
        <section v-if="task.state === 'user_edited' && !editMode" class="card"><h3>用户编辑，未经验证</h3><p>保存草稿不会触发审核。完成本轮修改后，可主动验证事实风险和表达效果。</p><van-button type="primary" block round :loading="busy" @click="validateSavedEdit">完成修改并验证</van-button><van-button plain block round style="margin-top:8px" @click="editMode=true">继续编辑</van-button></section>
        <section v-if="task.state === 'return_control'" class="card"><h3>自动追问已暂停</h3><p>你可以继续补充、手动编辑或暂时跳过；系统不会强制生成。</p><van-button block round type="primary" @click="returnControl('continue')">继续补充</van-button><van-button block round style="margin-top:8px" @click="editMode=true">自己编辑</van-button><van-button block round style="margin-top:8px" @click="returnControl('skip')">暂时跳过</van-button></section>
        <section v-if="['accepted','rejected','skipped','ready_for_reevaluation','completed_with_risk'].includes(task.state)" class="card success"><h3>本任务已完成</h3><p v-if="task.state === 'completed_with_risk'">已确认保留风险内容；该文本未标记为“已验证”。</p><p v-else-if="latestValidation(task)?.safetyStatus === 'passed'">当前文本已验证，并已写入最终交接。</p><p v-else>已保留来源、事实引用和审核状态，可继续处理下一项任务。</p><van-button v-if="task.state === 'ready_for_reevaluation'" plain block round @click="startEdit">继续编辑</van-button><van-button plain block round style="margin-top:8px" @click="openSummary">查看最终结果汇总</van-button></section>
        </section>
        <AgentEvidenceContext
          v-if="task"
          :requirement="requirement(task)"
          :facts="facts(task)"
          :validation="latestValidation(task)"
        />
      </div>
    </div>
  </AppPage>
</template>
<script setup>
import { computed, onBeforeUnmount, onMounted, ref, watch } from 'vue'
import { useRoute, useRouter } from 'vue-router'
import { agentSessionApi } from '../api'
import { clearAgentRecovery, readAgentRecovery, saveAgentRecovery } from '../utils/agentRecovery'
import AgentEvidenceContext from '../components/agent/AgentEvidenceContext.vue'
import AgentTaskNavigation from '../components/agent/AgentTaskNavigation.vue'
import AppPage from '../components/ui/AppPage.vue'
import StatusPanel from '../components/ui/StatusPanel.vue'

const POLL_INTERVAL_MS = 2000
const MAX_POLL_FAILURES = 5
const RECOVERY_COOLDOWN_MS = 30000
const PROCESSING_STATES = new Set(['parsing', 'matching'])
const FAILED_ANALYSIS_STATES = new Set(['parsing_failed', 'matching_failed'])
const RECOVERABLE_ANALYSIS_STATES = new Set(['draft', 'parsing', 'parsing_failed', 'matching', 'matching_failed'])
const DONE_RECOVERY_STATES = new Set(['evidence_ready', 'task_in_progress', 'ready_for_reevaluation', 'completed'])

const route = useRoute()
const router = useRouter()
const session = ref(null)
const loading = ref(true)
const notFound = ref(false)
const loadError = ref(null)
const startError = ref(null)
const pollWarning = ref('')
const busy = ref(false)
const starting = ref(false)
const polling = ref(false)
const actionError = ref('')
const selectedId = ref('')
const answer = ref('')
const editMode = ref(false)
const editedText = ref('')
const recoveryHint = ref(null)
const correctingFact = ref(false)
const correctionError = ref('')
const correction = ref({
  action: '',
  context: '',
  contribution: '',
  method: '',
  result: '',
  quantity: '',
})

let mounted = false
let generation = 0
let pollTimer = null
let pollFailures = 0
let lastRecoveryAt = 0
let autoStartId = ''

const sessionId = computed(() => route.params.id || '')
const sessionState = computed(() => session.value?.state || '')
const isProcessing = computed(() => PROCESSING_STATES.has(sessionState.value))
const processingTitle = computed(() => (
  sessionState.value === 'matching' ? '正在匹配证据…' : '正在解析岗位与简历…'
))
const processingMessage = computed(() => (
  pollWarning.value || '分析在服务端继续执行，本页会自动获取最新状态。'
))
const loadErrorMessage = computed(() => (
  loadError.value?.message
    ? `已创建的会话不会丢失。网络恢复后请重试加载。${loadError.value.message}`
    : '已创建的会话不会丢失。请检查网络后重试加载。'
))
const startErrorMessage = computed(() => (
  startError.value?.message
    ? `已创建的会话已保留，重试会继续使用同一个会话。${startError.value.message}`
    : '已创建的会话已保留，重试会继续使用同一个会话。'
))
const task = computed(() => {
  const tasks = session.value?.tasks ?? []
  return tasks.find((item) => item.id === selectedId.value)
    || tasks.find((item) => item.id === session.value?.currentTaskId)
    || tasks.find((item) => item.recommended)
    || tasks[0]
})
const hasOtherTask = computed(() => (session.value?.tasks ?? []).some(
  (item) => item.id !== task.value?.id
    && !['accepted', 'rejected', 'skipped', 'completed_with_risk'].includes(item.state),
))

const FACT_FIELDS = [
  { key: 'action', label: '个人行动', placeholder: '你本人具体做了什么' },
  { key: 'context', label: '场景 / 对象', placeholder: '服务什么场景或对象' },
  { key: 'contribution', label: '个人贡献', placeholder: '其中由你本人负责的部分' },
  { key: 'method', label: '方法', placeholder: '使用了什么方法' },
  { key: 'result', label: '结果', placeholder: '形成了什么结果或产出' },
  { key: 'quantity', label: '数字', placeholder: '例如 8 位、20%' },
]

const requirement = (item) => session.value?.requirements?.find((entry) => entry.id === item.requirementId) || { sourceText: '岗位要求' }
const facts = (item) => (session.value?.resumeFacts ?? []).filter(
  (fact) => item.factIds?.includes(fact.id) && fact.confirmation !== 'rejected',
)
const pendingFacts = (item) => facts(item).filter(
  (fact) => ['extracted', 'pending_confirmation'].includes(fact.confirmation),
)
const pendingFact = (item) => {
  const referenced = session.value?.resumeFacts?.find((fact) => fact.id === item.pendingFactId)
  return referenced && item.factIds?.includes(referenced.id) ? referenced : pendingFacts(item)[0]
}
const pendingFactCount = (item) => pendingFacts(item).length
const pendingFactIndex = (item) => {
  const fact = pendingFact(item)
  return Math.max(1, pendingFacts(item).findIndex((entry) => entry.id === fact?.id) + 1)
}
const pendingFactFields = (item) => {
  const fact = pendingFact(item)
  return FACT_FIELDS
    .map((field) => ({ ...field, value: fact?.[field.key] }))
    .filter((field) => typeof field.value === 'string' && field.value.trim())
}
const latestValidation = (item) => item.validationRecords?.at(-1)

function factStatusLabel(fact) {
  if (!fact) return ''
  if (fact.confirmation === 'confirmed') {
    if (fact.confirmationSource === 'user') return '用户已确认'
    // 历史会话没有记录确认来源，不能显示为“用户已确认”。
    return '历史确认（未记录用户操作）'
  }
  if (fact.confirmation === 'corrected') {
    return fact.confirmationSource === 'user' ? '用户已修正' : '历史修正（未记录用户操作）'
  }
  return ({
    pending_confirmation: '待你确认',
    extracted: '待你确认',
    rejected: '已拒绝',
  })[fact.confirmation] || ''
}

function resetCorrection() {
  correctingFact.value = false
  correctionError.value = ''
  correction.value = { action: '', context: '', contribution: '', method: '', result: '', quantity: '' }
}

function startCorrection() {
  const fact = pendingFact(task.value)
  if (!fact) return
  correctionError.value = ''
  correction.value = Object.fromEntries(
    FACT_FIELDS.map((field) => [field.key, fact[field.key] || '']),
  )
  correctingFact.value = true
}

function cancelCorrection() {
  resetCorrection()
}

function isCurrent(id, token) {
  return token === generation && sessionId.value === id
}

function isNotFound(error) {
  return error?.status === 404 || error?.code === 'AGENT_SESSION_NOT_FOUND'
}

function stopPolling() {
  if (pollTimer) clearInterval(pollTimer)
  pollTimer = null
}

function startPolling() {
  if (pollTimer) return
  pollTimer = setInterval(() => { void pollOnce() }, POLL_INTERVAL_MS)
}

function leaseExpired(value) {
  const raw = value?.analysisClaimExpiresAt
  if (!raw) return true
  const expiresAt = new Date(raw).getTime()
  return Number.isFinite(expiresAt) && expiresAt <= Date.now()
}

function applySession(value) {
  if (!value) return
  const normalized = {
    ...value,
    tasks: value.tasks || [],
    requirements: value.requirements || [],
    resumeFacts: value.resumeFacts || [],
  }
  session.value = normalized
  if (selectedId.value && !normalized.tasks.some((item) => item.id === selectedId.value)) {
    selectedId.value = ''
  }
  const requestedTaskId = typeof route.query?.task === 'string' ? route.query.task : ''
  if (
    !selectedId.value
    && requestedTaskId
    && normalized.tasks.some((item) => item.id === requestedTaskId)
  ) {
    selectedId.value = requestedTaskId
  }

  const id = normalized.id || sessionId.value
  if (RECOVERABLE_ANALYSIS_STATES.has(normalized.state) && normalized.jdId && normalized.resumeId) {
    saveAgentRecovery({ id, jdId: normalized.jdId, resumeId: normalized.resumeId })
  } else if (DONE_RECOVERY_STATES.has(normalized.state)) {
    clearAgentRecovery(id)
  }
}

function resetForSession() {
  generation += 1
  stopPolling()
  pollFailures = 0
  lastRecoveryAt = 0
  autoStartId = ''
  session.value = null
  selectedId.value = ''
  answer.value = ''
  editMode.value = false
  editedText.value = ''
  loading.value = true
  notFound.value = false
  loadError.value = null
  startError.value = null
  pollWarning.value = ''
  actionError.value = ''
  recoveryHint.value = null
  busy.value = false
  starting.value = false
  resetCorrection()
}

function rememberRecoveryHint(id) {
  const record = readAgentRecovery()
  recoveryHint.value = record && record.id === id ? record : null
}

async function afterStateLoaded(value, token, { allowRecovery = true } = {}) {
  if (!isCurrent(value?.id || sessionId.value, token)) return
  if (!isProcessing.value) {
    stopPolling()
    pollFailures = 0
    pollWarning.value = ''
    return
  }

  startPolling()
  if (allowRecovery) await maybeRecover(token)
}

async function maybeRecover(token) {
  if (!isProcessing.value || !leaseExpired(session.value)) return
  if (Date.now() - lastRecoveryAt < RECOVERY_COOLDOWN_MS) return
  lastRecoveryAt = Date.now()
  await startSession({ recovering: true })
}

async function load() {
  const id = sessionId.value
  generation += 1
  const token = generation
  stopPolling()
  pollFailures = 0
  pollWarning.value = ''
  startError.value = null
  loadError.value = null
  notFound.value = false

  if (!id) {
    loading.value = false
    notFound.value = true
    return
  }

  loading.value = true
  try {
    const value = await agentSessionApi.get(id)
    if (!isCurrent(id, token)) return
    applySession(value)
    loading.value = false
    if (value.state === 'draft') {
      void startSession({ auto: true })
      return
    }
    await afterStateLoaded(value, token)
  } catch (error) {
    if (!isCurrent(id, token)) return
    loading.value = false
    if (isNotFound(error)) {
      notFound.value = true
      rememberRecoveryHint(id)
      clearAgentRecovery(id)
    } else {
      loadError.value = error
    }
  }
}

async function startSession({ auto = false, recovering = false } = {}) {
  const id = sessionId.value
  if (!id || starting.value) return
  if (auto) {
    if (autoStartId === id) return
    autoStartId = id
  }

  const token = generation
  starting.value = true
  if (!recovering) startError.value = null

  try {
    const value = await agentSessionApi.start(id)
    if (!isCurrent(id, token)) return
    startError.value = null
    applySession(value)
    loading.value = false
    await afterStateLoaded(value, token)
  } catch (error) {
    if (!isCurrent(id, token)) return
    if (recovering) {
      pollWarning.value = '服务端尚未确认恢复执行，本页会继续获取最新状态。'
    } else {
      startError.value = error
    }
    await reconcileAfterStartFailure(id, token, error, recovering)
  } finally {
    if (isCurrent(id, token)) starting.value = false
  }
}

async function reconcileAfterStartFailure(id, token, startFailure, recovering) {
  // 启动请求失败可能只是响应丢失，先读取服务端真实状态，避免误判。
  try {
    const value = await agentSessionApi.get(id)
    if (!isCurrent(id, token)) return
    applySession(value)
    loading.value = false

    if (value.state === 'draft') {
      // 会话仍停留在待启动状态时，必须给出可重试入口，不能只显示加载中。
      startError.value = startFailure
      stopPolling()
      return
    }
    startError.value = null
    await afterStateLoaded(value, token, { allowRecovery: false })
  } catch (error) {
    if (!isCurrent(id, token)) return
    if (isNotFound(error)) {
      notFound.value = true
      rememberRecoveryHint(id)
      clearAgentRecovery(id)
      stopPolling()
    } else if (!recovering) {
      startError.value = startFailure
    }
  }
}

async function pollOnce() {
  if (polling.value) return
  const id = sessionId.value
  if (!id || !isProcessing.value) {
    stopPolling()
    return
  }

  const token = generation
  polling.value = true
  try {
    const value = await agentSessionApi.get(id)
    if (!isCurrent(id, token)) return
    pollFailures = 0
    pollWarning.value = ''
    applySession(value)
    await afterStateLoaded(value, token)
  } catch (error) {
    if (!isCurrent(id, token)) return
    if (isNotFound(error)) {
      stopPolling()
      notFound.value = true
      rememberRecoveryHint(id)
      clearAgentRecovery(id)
      return
    }

    pollFailures += 1
    if (pollFailures >= MAX_POLL_FAILURES) {
      stopPolling()
      loadError.value = error
    } else {
      pollWarning.value = `暂时无法获取最新状态（第 ${pollFailures} 次重试），分析可能仍在服务端继续。`
    }
  } finally {
    if (isCurrent(id, token)) polling.value = false
  }
}

function restart() {
  const id = sessionId.value
  const record = readAgentRecovery()
  const matching = record && record.id === id ? record : null
  const jdId = session.value?.jdId || matching?.jdId || recoveryHint.value?.jdId || ''
  const resumeId = session.value?.resumeId || matching?.resumeId || recoveryHint.value?.resumeId || ''
  clearAgentRecovery(id)
  recoveryHint.value = null

  if (jdId && resumeId) {
    router.replace({ path: '/supplement', query: { jdId, resumeId, skip: '1', fresh: '1' } })
  } else {
    router.replace('/jd-input')
  }
}

async function run(command) {
  if (busy.value) return
  const id = sessionId.value
  const token = generation
  busy.value = true
  actionError.value = ''

  try {
    await command(id)
    if (!isCurrent(id, token)) return
    const value = await agentSessionApi.get(id)
    if (!isCurrent(id, token)) return
    applySession(value)
    await afterStateLoaded(value, token, { allowRecovery: false })
  } catch (error) {
    if (!isCurrent(id, token)) return
    if (isNotFound(error)) {
      notFound.value = true
      rememberRecoveryHint(id)
      clearAgentRecovery(id)
      stopPolling()
    } else {
      actionError.value = error.message
    }
  } finally {
    if (isCurrent(id, token)) busy.value = false
  }
}

function openSummary() {
  if (!sessionId.value) return
  router.push(`/agent/${sessionId.value}/summary`)
}

function select(item) {
  if (busy.value || !item) return
  resetCorrection()
  selectedId.value = item.id
  if (item.state === 'pending') run((id) => agentSessionApi.selectTask(id, item.id))
}

function startTask() {
  if (task.value) select(task.value)
}

function resumeTask() {
  if (!task.value) return
  run((id) => agentSessionApi.selectTask(id, task.value.id))
}

function skipTask() {
  if (!task.value) return
  run((id) => agentSessionApi.decide(id, task.value.id, { type: 'skipped' }))
}

function selectNextTask() {
  const next = (session.value?.tasks ?? []).find(
    (item) => item.id !== task.value?.id
      && !['accepted', 'rejected', 'skipped', 'completed_with_risk'].includes(item.state),
  )
  if (next) select(next)
}

function generate() { run((id) => agentSessionApi.generate(id, task.value.id)) }
function retry() { run((id) => agentSessionApi.retry(id, task.value.id)) }
function submitAnswer() {
  const value = answer.value.trim()
  if (!value) return
  run(async (id) => {
    await agentSessionApi.answer(id, task.value.id, value)
    answer.value = ''
  })
}
function specialAnswer(value) { run((id) => agentSessionApi.answer(id, task.value.id, value)) }
function reviewFact(decision) {
  const fact = pendingFact(task.value)
  if (!fact) return
  run(async (id) => {
    await agentSessionApi.reviewFact(id, task.value.id, fact.id, decision)
    resetCorrection()
  })
}

function submitCorrection() {
  const fact = pendingFact(task.value)
  if (!fact) return
  const patch = {}
  FACT_FIELDS.forEach((field) => {
    const value = (correction.value[field.key] || '').trim()
    if (value && value !== (fact[field.key] || '')) patch[field.key] = value
  })
  if (!Object.keys(patch).length) {
    correctionError.value = '请至少修改一项内容；如果内容无误，请直接确认。'
    return
  }
  run(async (id) => {
    await agentSessionApi.reviewFact(id, task.value.id, fact.id, 'correct', patch)
    resetCorrection()
  })
}
function returnControl(action) { run((id) => agentSessionApi.returnControl(id, task.value.id, action)) }
function saveEdit() { if (editedText.value.trim()) run(async (id) => { await agentSessionApi.decide(id, task.value.id, { type: 'user_edited', text: editedText.value, riskAcknowledged: true }); editMode.value = false }) }
function validateEdit() { if (editedText.value.trim()) run(async (id) => { await agentSessionApi.validate(id, task.value.id, editedText.value); editMode.value = false }) }
function validateSavedEdit() { run((id) => agentSessionApi.validate(id, task.value.id, task.value.currentText || task.value.candidate?.text || '')) }
function completeWithRisk() { run((id) => agentSessionApi.completeWithRisk(id, task.value.id)) }
function decide(type) { run((id) => agentSessionApi.decide(id, task.value.id, { type })) }
function startEdit() { editedText.value = task.value.currentText || task.value.candidate?.text || ''; editMode.value = true }
function verificationTag(status) { return status === 'passed' ? 'success' : status === 'warning' ? 'warning' : status === 'blocked' ? 'danger' : 'default' }
function verificationLabel(status) { return ({ passed: '已通过事实校验', warning: '可采用，含风险提示', blocked: '已阻断', unavailable: '校验暂不可用', unverified_user_content: '用户编辑，尚未验证' })[status] || status }
function verificationHint(status) { return status === 'warning' ? '该表达包含估算信息，请确认后再采用。' : '系统未将该 AI 内容标记为可采用。' }
function outcomeLabel(status) { return ({ improved: '有明确改善', unchanged: '暂无明显变化', regressed: '效果有所下降', tradeoff: '有改善，也有新问题' })[status] || status }
function safetyLabel(status) { return ({ passed: '已验证', warning: '已检查，有风险提示', blocked: '存在事实风险', unavailable: '暂未完成验证' })[status] || status }

onMounted(() => {
  mounted = true
  void load()
})

// 同一路由组件切换到另一个会话时，清理旧轮询并防止迟到响应覆盖新页面。
watch(sessionId, (id, previous) => {
  if (!mounted || id === previous) return
  resetForSession()
  void load()
})

onBeforeUnmount(() => {
  mounted = false
  generation += 1
  stopPolling()
})
</script>
<style scoped>
.agent-workbench{min-width:0}.agent-toolbar{display:flex;justify-content:flex-end;margin-top:var(--spacing-md)}.summary-link{min-height:2.75rem;padding:0 1rem;color:var(--color-primary);background:var(--surface-content);border:1px solid var(--border-strong);border-radius:999px;cursor:pointer;font:inherit;font-weight:600}.agent-layout{margin-top:var(--spacing-lg)}.agent-stage{min-width:0}.card{background:var(--surface-content);border:1px solid var(--border-subtle);border-radius:var(--radius-lg);padding:var(--spacing-lg);margin-bottom:var(--spacing-md);box-shadow:var(--shadow-sm)}h3{font-size:16px;margin:0 0 10px}.candidate{white-space:pre-wrap;line-height:1.7}.risk{color:#9a6700}.success{background:#f0fff4}.minor{display:flex;gap:8px;margin-top:10px;flex-wrap:wrap}.fact-summary{display:grid;gap:6px;padding:0;margin:0;list-style:none}.fact-summary li{display:flex;gap:8px;justify-content:space-between;align-items:flex-start;line-height:1.6}.fact-summary__status{flex-shrink:0;color:var(--text-secondary);font-size:12px}.fact-review__progress,.muted{color:var(--text-secondary);font-size:13px}.fact-review__source{font-weight:600;white-space:pre-wrap}.fact-fields{display:grid;grid-template-columns:auto 1fr;gap:6px 12px;margin:12px 0}.fact-fields dt{color:var(--text-secondary);font-size:13px}.fact-fields dd{margin:0;line-height:1.6;white-space:pre-wrap;overflow-wrap:anywhere}.fact-correction__field{display:grid;gap:4px;margin-top:10px;font-size:13px;color:var(--text-secondary)}.fact-correction__field textarea,.fact-correction__field input{width:100%;box-sizing:border-box;padding:8px 10px;color:var(--text-primary);background:var(--surface-content);border:1px solid var(--border-strong);border-radius:var(--radius-md);font:inherit;line-height:1.5;resize:vertical}

@media (min-width:56.25rem){.task-navigation,.evidence-context{position:sticky;top:6rem;max-height:calc(100svh - 7rem);overflow:auto}}
@media (min-width:56.25rem) and (max-width:74.999rem){.evidence-context{grid-column:2}}
</style>
