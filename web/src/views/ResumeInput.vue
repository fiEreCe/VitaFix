<template>
  <div class="resume-input">
    <van-nav-bar
      title="输入简历"
      left-arrow
      @click-left="$router.back()"
    />

    <div class="content">
      <!-- 输入方式切换 -->
      <div class="method-tabs">
        <div
          :class="['method-tab', { active: method === 'paste' }]"
          @click="method = 'paste'"
        >
          <van-icon name="edit" /> 粘贴文本
        </div>
        <div
          :class="['method-tab', { active: method === 'upload' }]"
          @click="method = 'upload'"
        >
          <van-icon name="uploader" /> 上传文件
        </div>
      </div>

      <!-- ============= 方式一：粘贴文本 ============= -->
      <div v-if="method === 'paste'">
        <div class="tip-card">
          <van-icon name="info-o" />
          <span>从简历文件（PDF/Word）中复制全文，粘贴到下方。AI会自动识别各个板块。</span>
        </div>

        <van-field
          v-model="resumeText"
          type="textarea"
          placeholder="请粘贴你的简历全文..."
          rows="10"
          show-word-limit
          maxlength="20000"
          autosize
        />
      </div>

      <!-- ============= 方式二：上传文件 ============= -->
      <div v-else class="upload-method">
        <div class="tip-card">
          <van-icon name="info-o" />
          <span>支持 PDF、DOCX、TXT 格式，文件最大 20MB</span>
        </div>

        <!-- 拖拽上传区 -->
        <div
          class="drop-zone"
          :class="{ dragover: isDragover, 'has-file': uploadedFile }"
          @dragover.prevent="isDragover = true"
          @dragleave.prevent="isDragover = false"
          @drop.prevent="handleDrop"
          @click="triggerFileInput"
        >
          <input
            ref="fileInput"
            type="file"
            accept=".pdf,.docx,.doc,.txt"
            style="display:none"
            @change="handleFileSelect"
          />

          <template v-if="uploading">
            <van-loading size="32" />
            <p class="drop-text">正在解析文件...</p>
          </template>

          <template v-else-if="uploadedFile">
            <van-icon name="document" size="40" color="#1989fa" />
            <p class="drop-text">{{ uploadedFile.name }}</p>
            <p class="drop-hint">
              {{ formatFileSize(uploadedFile.size) }} · 点击重新选择
            </p>
          </template>

          <template v-else>
            <van-icon name="plus" size="40" color="#c8c9cc" />
            <p class="drop-text">点击上传文件，或将文件拖拽到此处</p>
            <p class="drop-hint">支持 PDF / DOCX / TXT</p>
          </template>
        </div>
      </div>

      <!-- ============= 解析结果展示 ============= -->
      <div v-if="parsedResult" class="parsed-section">
        <div class="section-header">
          <span class="section-title">AI 识别结果</span>
          <span class="section-hint">请检查识别是否准确</span>
        </div>

        <div v-if="parsedResult.education?.length" class="block-card">
          <div class="block-header">🎓 教育背景</div>
          <div v-for="(edu, i) in parsedResult.education" :key="i" class="block-item">
            <div class="item-title">{{ edu.school }} · {{ edu.major }}</div>
            <div class="item-meta">{{ edu.degree }} | {{ edu.period }}</div>
            <div v-if="edu.description" class="item-desc">{{ edu.description }}</div>
          </div>
        </div>

        <div v-if="parsedResult.experience?.length" class="block-card">
          <div class="block-header">💼 工作经历</div>
          <div v-for="(exp, i) in parsedResult.experience" :key="i" class="block-item">
            <div class="item-title">{{ exp.company }} · {{ exp.position }}</div>
            <div class="item-meta">{{ exp.period }}</div>
            <div v-if="exp.description" class="item-desc">{{ exp.description }}</div>
          </div>
        </div>

        <div v-if="parsedResult.projects?.length" class="block-card">
          <div class="block-header">📊 项目经历</div>
          <div v-for="(proj, i) in parsedResult.projects" :key="i" class="block-item">
            <div class="item-title">{{ proj.name }}</div>
            <div class="item-meta">{{ proj.role }} | {{ proj.period }}</div>
            <div v-if="proj.description" class="item-desc">{{ proj.description }}</div>
          </div>
        </div>

        <div v-if="parsedResult.skills?.length" class="block-card">
          <div class="block-header">🛠 技能</div>
          <div class="tag-list">
            <van-tag v-for="s in parsedResult.skills" :key="s" color="#1989fa" plain>{{ s }}</van-tag>
          </div>
        </div>
      </div>

      <!-- ============= 操作按钮 ============= -->
      <div class="actions">
        <van-button
          type="primary"
          block
          round
          :loading="submitting"
          :disabled="!resumeText.trim() && !uploadedFile"
          @click="submitResume"
        >
          {{ parsedResult ? '重新识别' : 'AI识别简历' }}
        </van-button>

        <div v-if="currentResumeId" class="action-row">
          <van-button
            plain
            block
            round
            type="success"
            @click="goSupplement"
          >
            确认，补充额外经历
          </van-button>
          <van-button
            plain
            block
            round
            style="margin-top:8px"
            @click="startAnalysis"
          >
            跳过补充，直接分析
          </van-button>
        </div>
      </div>
    </div>
  </div>
</template>

<script setup>
import { ref, computed } from 'vue'
import { useRoute, useRouter } from 'vue-router'
import { showToast } from 'vant'
import { resumeApi } from '../api'

const route = useRoute()
const router = useRouter()

const method = ref('paste')
const resumeText = ref('')
const submitting = ref(false)
const parsedResult = ref(null)
const currentResumeId = ref('')

// 文件上传状态
const fileInput = ref(null)
const uploadedFile = ref(null)
const isDragover = ref(false)
const uploading = ref(false)

const jdId = computed(() => route.query.jdId || '')

/** 拖拽上传 */
function handleDrop(e) {
  isDragover.value = false
  const file = e.dataTransfer.files[0]
  if (file) uploadFile(file)
}

/** 点击选择文件 */
function handleFileSelect(e) {
  const file = e.target.files[0]
  if (file) uploadFile(file)
}

function triggerFileInput() {
  if (!uploading.value) fileInput.value?.click()
}

/** 上传并解析文件 */
async function uploadFile(file) {
  const ext = '.' + file.name.split('.').pop().toLowerCase()
  const allowed = ['.pdf', '.docx', '.doc', '.txt']
  if (!allowed.includes(ext)) {
    showToast('仅支持 PDF、DOCX、TXT 格式')
    return
  }

  uploading.value = true
  uploadedFile.value = file

  try {
    const res = await resumeApi.upload(file)
    resumeText.value = res.rawText
    parsedResult.value = res.parsed
    currentResumeId.value = res.id
    showToast('识别成功，请核对结果')
  } catch (e) {
    uploadedFile.value = null
    showToast('解析失败: ' + e.message)
  } finally {
    uploading.value = false
  }
}

/** 文本提交 → AI解析 */
async function submitResume() {
  const text = resumeText.value.trim()
  if (!text) {
    showToast('请先输入或上传简历')
    return
  }

  submitting.value = true
  try {
    const res = await resumeApi.create(text)
    currentResumeId.value = res.id
    parsedResult.value = res.parsed
    showToast('识别成功，请核对结果')
  } catch (e) {
    showToast('识别失败: ' + e.message)
  } finally {
    submitting.value = false
  }
}

function goSupplement() {
  // 持久化到 localStorage，防止刷新丢失
  savePendingState()
  router.push({
    path: '/supplement',
    query: { resumeId: currentResumeId.value, jdId: jdId.value },
  })
}

function startAnalysis() {
  savePendingState()
  router.push({
    path: '/supplement',
    query: { resumeId: currentResumeId.value, jdId: jdId.value, skip: '1' },
  })
}

function savePendingState() {
  localStorage.setItem('pendingResumeId', currentResumeId.value)
  localStorage.setItem('pendingJdId', jdId.value)
}

function formatFileSize(bytes) {
  if (bytes < 1024) return bytes + 'B'
  if (bytes < 1048576) return (bytes / 1024).toFixed(1) + 'KB'
  return (bytes / 1048576).toFixed(1) + 'MB'
}
</script>

<style scoped>
/* ============ 基础布局 ============ */
.resume-input {
  min-height: 100vh;
  background: var(--bg-page);
}

.content {
  padding: 16px;
  max-width: 800px;
  margin: 0 auto;
}

/* ============ 方式切换标签 ============ */
.method-tabs {
  display: flex;
  gap: 10px;
  margin-bottom: 16px;
}

.method-tab {
  flex: 1;
  text-align: center;
  padding: 10px;
  background: var(--bg-card);
  border-radius: var(--radius-md);
  font-size: 14px;
  color: var(--text-secondary);
  cursor: pointer;
  border: 1px solid transparent;
  transition: all 0.2s;
}

.method-tab.active {
  color: var(--color-primary);
  border-color: var(--color-primary);
  background: #f0f8ff;
}

/* ============ 提示卡片 ============ */
.tip-card {
  display: flex;
  align-items: flex-start;
  gap: 8px;
  background: #f0f8ff;
  border-radius: var(--radius-md);
  padding: 12px;
  font-size: 13px;
  color: var(--color-primary);
  line-height: 1.5;
  margin-bottom: 16px;
}

.tip-card .van-icon {
  font-size: 18px;
  flex-shrink: 0;
  margin-top: 1px;
}

/* ============ 拖拽上传区 ============ */
.drop-zone {
  border: 2px dashed #ddd;
  border-radius: var(--radius-lg);
  padding: 48px 24px;
  text-align: center;
  cursor: pointer;
  transition: all 0.2s;
  background: var(--bg-card);
}

.drop-zone:hover {
  border-color: var(--color-primary);
  background: #f0f8ff;
}

.drop-zone.dragover {
  border-color: var(--color-primary);
  background: #e6f7ff;
  transform: scale(1.02);
}

.drop-zone.has-file {
  border-style: solid;
  border-color: var(--color-primary);
  background: #f0f8ff;
}

.drop-text {
  margin: 12px 0 4px;
  font-size: 14px;
  color: var(--text-primary);
}

.drop-hint {
  margin: 0;
  font-size: 12px;
  color: var(--text-disabled);
}

/* ============ 解析结果 ============ */
.parsed-section {
  margin-top: 24px;
}

.section-header {
  display: flex;
  justify-content: space-between;
  align-items: center;
  margin-bottom: 12px;
}

.section-title {
  font-size: 16px;
  font-weight: 600;
}

.section-hint {
  font-size: 12px;
  color: var(--text-secondary);
}

.block-card {
  background: var(--bg-card);
  border-radius: var(--radius-md);
  padding: 14px;
  margin-bottom: 12px;
}

.block-header {
  font-size: 15px;
  font-weight: 600;
  margin-bottom: 10px;
}

.block-item {
  padding: 8px 0;
  border-bottom: 1px solid #f5f5f5;
}

.block-item:last-child { border-bottom: none; }

.item-title {
  font-size: 14px;
  font-weight: 500;
  margin-bottom: 2px;
}

.item-meta {
  font-size: 12px;
  color: var(--text-secondary);
  margin-bottom: 4px;
}

.item-desc {
  font-size: 13px;
  color: var(--text-secondary);
  line-height: 1.5;
  white-space: pre-wrap;
}

.tag-list {
  display: flex;
  flex-wrap: wrap;
  gap: 6px;
}

/* ============ 按钮区 ============ */
.actions {
  margin-top: 20px;
  padding-bottom: 32px;
}

.action-row {
  margin-top: 12px;
}

/* ============ PC 响应式 ============ */
@media (min-width: 768px) {
  .content {
    padding: 32px 24px;
  }

  .drop-zone {
    padding: 72px 48px;
  }

  .drop-zone:hover {
    border-color: var(--color-primary);
    background: #f0f8ff;
  }

  .block-card {
    padding: 20px;
  }

  .method-tab {
    font-size: 15px;
    padding: 12px;
  }
}
</style>
