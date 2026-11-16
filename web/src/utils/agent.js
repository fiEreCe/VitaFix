/**
 * Agent 会话 / 任务的展示文案与复制工具。
 * 状态枚举与 server/domain/agent/contracts.js 保持一致；未知状态提供安全默认值。
 */

export const SESSION_STATE_LABELS = Object.freeze({
  draft: '草稿',
  parsing: '正在解析',
  parsing_failed: '解析失败',
  matching: '正在匹配证据',
  matching_failed: '匹配失败',
  evidence_ready: '证据已就绪',
  task_in_progress: '处理中',
  in_progress: '处理中',
  ready_for_reevaluation: '可继续优化',
  completed: '已完成',
  cancelled: '已取消',
  expired: '已过期',
})

export const TASK_STATE_LABELS = Object.freeze({
  pending: '待开始',
  assessing_evidence: '正在评估证据',
  questioning: '需要补充事实',
  awaiting_fact_confirmation: '等待确认事实',
  generating: '准备生成表达',
  verifying: '正在安全校验',
  awaiting_user_decision: '等待你的决定',
  accepted: '已采用',
  user_edited: '已编辑，未验证',
  rejected: '已拒绝',
  skipped: '已跳过',
  capability_gap: '能力缺口',
  ready_for_reevaluation: '已验证，可继续优化',
  completed_with_risk: '已确认风险',
  return_control: '已暂停自动追问',
  parse_failed: '简历解析失败',
  match_failed: '证据匹配失败',
  question_failed: '回答分析失败',
  generation_failed: '生成失败',
  verification_failed: '安全校验未通过',
})

export const VERIFICATION_LABELS = Object.freeze({
  passed: '已验证',
  warning: '已检查，有风险提示',
  blocked: '存在事实风险',
  unavailable: '验证暂不可用',
  unverified_user_content: '用户编辑，尚未验证',
  not_generated: '尚未生成表达',
  not_applicable: '不适用',
})

export const EXPRESSION_KIND_LABELS = Object.freeze({
  adopted: '已采用表达',
  adopted_with_risk: '已采用 · 风险已确认',
  draft: '草稿 · 未验证',
  candidate: '候选 · 待决定',
  candidate_unverified: '候选 · 未采用',
  none: '暂无表达',
})

export function sessionStateLabel(state) {
  return SESSION_STATE_LABELS[state] || '状态待更新'
}

export function taskStateLabel(state) {
  return TASK_STATE_LABELS[state] || '状态待更新'
}

export function verificationLabel(status) {
  return VERIFICATION_LABELS[status] || status || '状态待更新'
}

export function expressionKindLabel(kind) {
  return EXPRESSION_KIND_LABELS[kind] || EXPRESSION_KIND_LABELS.none
}

export function taskProgress(item) {
  const total = Number.isFinite(item?.taskCount) ? item.taskCount : 0
  const completed = Number.isFinite(item?.completedCount) ? item.completedCount : 0
  return {
    total,
    completed,
    text: total > 0 ? `已完成 ${completed}/${total} 项` : '暂无任务',
  }
}

function timestamp(value) {
  const time = new Date(value || 0).getTime()
  return Number.isFinite(time) ? time : 0
}

export function sortByRecent(a, b) {
  return timestamp(b?.updatedAt || b?.createdAt) - timestamp(a?.updatedAt || a?.createdAt)
}

export function entityKey(item) {
  return `${item?.type || 'entity'}-${item?.id || ''}`
}

/**
 * 复制文本：优先 Clipboard API，非安全上下文或权限被拒时回退到 textarea。
 */
export async function copyText(value) {
  const text = typeof value === 'string' ? value : ''
  if (!text) return false

  if (typeof navigator !== 'undefined' && navigator.clipboard?.writeText) {
    try {
      await navigator.clipboard.writeText(text)
      return true
    } catch {
      // 继续尝试回退方案
    }
  }

  if (typeof document === 'undefined') return false

  const textarea = document.createElement('textarea')
  textarea.value = text
  textarea.setAttribute('readonly', '')
  textarea.style.position = 'fixed'
  textarea.style.top = '-1000px'
  textarea.style.opacity = '0'
  document.body.appendChild(textarea)
  let copied = false
  try {
    textarea.select()
    copied = document.execCommand('copy')
  } catch {
    copied = false
  } finally {
    document.body.removeChild(textarea)
  }
  return copied
}
