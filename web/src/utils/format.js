/**
 * 格式化工具函数
 */

/**
 * 格式化日期
 */
export function formatDate(dateStr) {
  if (!dateStr) return ''
  const date = new Date(dateStr)
  const year = date.getFullYear()
  const month = String(date.getMonth() + 1).padStart(2, '0')
  const day = String(date.getDate()).padStart(2, '0')
  const hour = String(date.getHours()).padStart(2, '0')
  const minute = String(date.getMinutes()).padStart(2, '0')
  return `${year}-${month}-${day} ${hour}:${minute}`
}

/**
 * 格式化日期（仅日期）
 */
export function formatDateShort(dateStr) {
  if (!dateStr) return ''
  const date = new Date(dateStr)
  const month = String(date.getMonth() + 1).padStart(2, '0')
  const day = String(date.getDate()).padStart(2, '0')
  return `${month}-${day}`
}

/**
 * 获取等级颜色
 */
export function getGradeColor(score) {
  if (score >= 90) return '#07c160'   // 优秀 - 绿色
  if (score >= 75) return '#1989fa'   // 良好 - 蓝色
  if (score >= 60) return '#ff976a'   // 一般 - 橙色
  return '#ee0a24'                     // 待提升 - 红色
}

/**
 * 获取等级标签
 */
export function getGradeLabel(score) {
  if (score >= 90) return '优秀'
  if (score >= 75) return '良好'
  if (score >= 60) return '一般'
  return '待提升'
}

/**
 * 匹配状态转文本
 */
export function matchStatusText(status) {
  const map = {
    matched: '已匹配',
    partial: '部分匹配',
    unmatched: '未匹配',
  }
  return map[status] || status
}

/**
 * 匹配状态转颜色
 */
export function matchStatusColor(status) {
  const map = {
    matched: '#07c160',
    partial: '#ff976a',
    unmatched: '#ee0a24',
  }
  return map[status] || '#999'
}
