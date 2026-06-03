/**
 * 轻量埋点工具
 *
 * 记录用户关键行为，输出到控制台（Railway 日志中可见），
 * 同时发送到服务端的 /api/track 接口统一收集。
 * MVP 阶段无需第三方 SDK，后续可平滑接入 Amplitude / Mixpanel。
 */

const ANALYTICS_KEY = 'jingzhu_visitor_id'

function getVisitorId() {
  let id = localStorage.getItem(ANALYTICS_KEY)
  if (!id) {
    id = 'v_' + Date.now().toString(36) + '_' + Math.random().toString(36).slice(2, 6)
    localStorage.setItem(ANALYTICS_KEY, id)
  }
  return id
}

/**
 * 记录事件
 * @param {string} event - 事件名称
 * @param {Object} data - 附加数据
 */
export function track(event, data = {}) {
  const payload = {
    event,
    visitorId: getVisitorId(),
    timestamp: new Date().toISOString(),
    url: window.location.hash || window.location.pathname,
    ...data,
  }
  console.log('[埋点]', JSON.stringify(payload))

  // 发送到服务端统一收集（发后即忘，不 await）
  fetch('/api/track', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(payload),
  }).catch(() => {})
}

/**
 * 常用事件快捷方法
 */
export const events = {
  pageView(pageName) {
    track('page_view', { page: pageName })
  },
  analysisStarted() {
    track('analysis_started')
  },
  analysisCompleted() {
    track('analysis_completed')
  },
  sectionReevaluated() {
    track('section_reevaluated')
  },
  historyDeleted() {
    track('history_deleted')
  },
  historyRenamed() {
    track('history_renamed')
  },
}
