/**
 * 设备ID - 自动生成唯一标识，存储在 localStorage
 * 用于用户隔离，无需注册登录
 */

const STORAGE_KEY = 'jingzhu_device_id'
const NAME_KEY = 'jingzhu_user_name'

/**
 * 获取设备 ID（自动生成并缓存）
 */
export function getDeviceId() {
  let id = localStorage.getItem(STORAGE_KEY)
  if (!id) {
    id = 'user_' + Date.now() + '_' + Math.random().toString(36).slice(2, 10)
    localStorage.setItem(STORAGE_KEY, id)
  }
  return id
}

/**
 * 获取/设置用户昵称（仅用于展示）
 */
export function getUserName() {
  return localStorage.getItem(NAME_KEY) || '我'
}

export function setUserName(name) {
  localStorage.setItem(NAME_KEY, name)
}
