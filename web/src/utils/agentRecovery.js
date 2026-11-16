/**
 * Agent 会话恢复信息
 *
 * 只保存“尚未完成分析”的会话 ID，并按当前设备 + JD + Resume 关联，
 * 避免把其他输入对应的会话错误恢复给当前流程。
 */

import { getDeviceId } from './id.js'

const KEY_PREFIX = 'jingzhu_agent_pending_session'

function storageKey() {
  try {
    return `${KEY_PREFIX}:${getDeviceId()}`
  } catch {
    return KEY_PREFIX
  }
}

function normalize(value) {
  return value === undefined || value === null ? '' : String(value)
}

export function saveAgentRecovery({ id, jdId, resumeId }) {
  const sessionId = normalize(id)
  if (!sessionId) return null

  const record = {
    id: sessionId,
    jdId: normalize(jdId),
    resumeId: normalize(resumeId),
    savedAt: Date.now(),
  }

  try {
    localStorage.setItem(storageKey(), JSON.stringify(record))
  } catch {
    // 隐私模式或存储已满时，页面仍可继续；恢复能力降级。
  }
  return record
}

export function readAgentRecovery() {
  try {
    const raw = localStorage.getItem(storageKey())
    if (!raw) return null

    const value = JSON.parse(raw)
    if (!value || typeof value !== 'object' || !value.id) return null

    return {
      id: String(value.id),
      jdId: normalize(value.jdId),
      resumeId: normalize(value.resumeId),
      savedAt: Number(value.savedAt) || 0,
    }
  } catch {
    return null
  }
}

export function findAgentRecovery({ jdId, resumeId }) {
  const record = readAgentRecovery()
  if (!record) return null
  if (record.jdId !== normalize(jdId) || record.resumeId !== normalize(resumeId)) return null
  return record
}

export function clearAgentRecovery(id) {
  const record = readAgentRecovery()
  if (!record) return
  if (id && record.id !== String(id)) return

  try {
    localStorage.removeItem(storageKey())
  } catch {
    // 存储不可用时无需处理。
  }
}
