/**
 * API 请求封装
 */
const BASE_URL = '/api'
import { getDeviceId } from '../utils/id'

/** 获取用户标识头 */
function userIdHeader() {
  return { 'X-User-Id': getDeviceId() }
}

async function request(url, options = {}) {
  const { method = 'GET', data, params } = options

  const fetchOptions = {
    method,
    headers: {
      'Content-Type': 'application/json',
      ...userIdHeader(),
    },
  }

  if (data) {
    fetchOptions.body = JSON.stringify(data)
  }

  // 拼接 query params
  let queryString = ''
  if (params) {
    const searchParams = new URLSearchParams()
    Object.entries(params).forEach(([key, value]) => {
      if (value !== undefined && value !== null) {
        searchParams.append(key, value)
      }
    })
    queryString = '?' + searchParams.toString()
  }

  try {
    const response = await fetch(`${BASE_URL}${url}${queryString}`, fetchOptions)

    if (!response.ok) {
      const err = await response.json().catch(() => ({ error: '请求失败' }))
      throw new Error(err.error || `HTTP ${response.status}`)
    }

    return await response.json()
  } catch (error) {
    console.error('API请求失败:', url, error)
    throw error
  }
}

/* 文件上传专用：发送 FormData */
async function upload(url, formData) {
  const response = await fetch(`${BASE_URL}${url}`, {
    method: 'POST',
    headers: { ...userIdHeader() },  // 上传也要带用户ID
    body: formData,
  })
  if (!response.ok) {
    const err = await response.json().catch(() => ({ error: '上传失败' }))
    throw new Error(err.error || `HTTP ${response.status}`)
  }
  return response.json()
}

// ==================== JD API ====================
export const jdApi = {
  create(rawText) {
    return request('/jd', { method: 'POST', data: { rawText } })
  },
  ocr(imageFile) {
    const formData = new FormData()
    formData.append('image', imageFile)
    return upload('/jd/ocr', formData)
  },
  getById(id) {
    return request(`/jd/${id}`)
  },
}

// ==================== 简历 API ====================
export const resumeApi = {
  create(rawText) {
    return request('/resume', { method: 'POST', data: { rawText } })
  },
  upload(file) {
    const formData = new FormData()
    formData.append('file', file)
    return upload('/resume/upload', formData)
  },
  update(id, parsed) {
    return request(`/resume/${id}`, { method: 'PUT', data: { parsed } })
  },
  getById(id) {
    return request(`/resume/${id}`)
  },
}

// ==================== 补充信息 API ====================
export const supplementApi = {
  upsert(resumeId, items) {
    return request('/supplement', { method: 'POST', data: { resumeId, items } })
  },
  getByResumeId(resumeId) {
    return request(`/supplement/${resumeId}`)
  },
}

// ==================== 分析 API ====================
export const analysisApi = {
  create(jdId, resumeId, name) {
    return request('/analysis', { method: 'POST', data: { jdId, resumeId, name } })
  },
  getById(id) {
    return request(`/analysis/${id}`)
  },
  getStatus(id) {
    return request(`/analysis/${id}/status`)
  },
  reevaluateSection(id, sectionType, sectionIndex, revisedText) {
    return request(`/analysis/${id}/reevaluate-section`, {
      method: 'POST',
      data: { sectionType, sectionIndex, revisedText },
    })
  },
}

// ==================== 历史记录 API ====================
export const historyApi = {
  list(params = {}) {
    return request('/analysis', { params })
  },
  updateName(id, name) {
    return request(`/analysis/${id}/name`, { method: 'PUT', data: { name } })
  },
  remove(id) {
    return request(`/analysis/${id}`, { method: 'DELETE' })
  },
}

export default request
