<template>
  <div class="jd-input">
    <van-nav-bar
      title="输入岗位JD"
      left-arrow
      @click-left="$router.back()"
    />

    <div class="content">
      <!-- 方式选择 -->
      <div class="method-tabs">
        <div
          :class="['method-tab', { active: method === 'text' }]"
          @click="method = 'text'"
        >
          <van-icon name="edit" /> 粘贴文本
        </div>
        <div
          :class="['method-tab', { active: method === 'image' }]"
          @click="method = 'image'"
        >
          <van-icon name="photo" /> 截图识别
        </div>
      </div>

      <!-- 文本输入 -->
      <div v-if="method === 'text'" class="text-input-area">
        <van-field
          v-model="jdText"
          type="textarea"
          placeholder="请粘贴岗位JD内容（Ctrl+V）"
          rows="10"
          show-word-limit
          maxlength="10000"
          autosize
        />
      </div>

      <!-- 截图识别 -->
      <div v-else class="image-input-area">
        <van-uploader
          :after-read="handleImageUpload"
          accept="image/*"
          max-count="1"
          :preview-image="true"
          :disabled="ocrLoading"
        >
          <div v-if="!ocrLoading" class="upload-placeholder">
            <van-icon name="photograph" size="40" color="#c8c9cc" />
            <p>点击上传JD截图</p>
            <p class="upload-hint">支持 JPG / PNG 格式</p>
          </div>
          <div v-else class="upload-placeholder">
            <van-loading size="24" />
            <p style="margin-top:12px">AI 正在识别图片文字...</p>
          </div>
        </van-uploader>

        <div v-if="ocrText" class="ocr-result">
          <div class="ocr-label">✅ AI 识别结果（可编辑修改）：</div>
          <van-field
            v-model="ocrText"
            type="textarea"
            rows="8"
            autosize
            placeholder="识别结果将显示在这里..."
          />
        </div>
      </div>

      <!-- 底部操作 -->
      <div class="actions">
        <van-button
          type="primary"
          block
          round
          :loading="submitting"
          :disabled="!(jdText.trim() || ocrText.trim())"
          @click="submitJD"
        >
          解析JD
        </van-button>
      </div>
    </div>

    <!-- 解析结果预览 -->
    <van-action-sheet v-model:show="showResult" title="JD解析结果" :closeable="true">
      <div class="parse-result">
        <div class="parse-item">
          <span class="parse-label">公司</span>
          <span class="parse-value">{{ parsedResult.company || '未识别' }}</span>
        </div>
        <div class="parse-item">
          <span class="parse-label">岗位</span>
          <span class="parse-value">{{ parsedResult.position || '未识别' }}</span>
        </div>
        <div class="parse-item">
          <span class="parse-label">学历要求</span>
          <span class="parse-value">{{ parsedResult.education || '未识别' }}</span>
        </div>
        <div class="parse-item">
          <span class="parse-label">经验要求</span>
          <span class="parse-value">{{ parsedResult.experience || '未识别' }}</span>
        </div>

        <div class="parse-section">
          <div class="parse-section-title">技能要求</div>
          <div class="tag-list">
            <van-tag
              v-for="skill in parsedResult.skills"
              :key="skill"
              color="#1989fa"
              plain
            >
              {{ skill }}
            </van-tag>
            <span v-if="!parsedResult.skills?.length" class="no-data">暂无</span>
          </div>
        </div>

        <div class="parse-section">
          <div class="parse-section-title">关键要求（{{ parsedResult.requirements?.length || 0 }}条）</div>
          <div
            v-for="(req, idx) in parsedResult.requirements"
            :key="idx"
            class="req-item"
          >
            {{ idx + 1 }}. {{ req }}
          </div>
          <span v-if="!parsedResult.requirements?.length" class="no-data">暂无</span>
        </div>

        <div class="actions">
          <van-button type="primary" block round @click="goNext">
            确认，填写简历
          </van-button>
          <van-button plain block round @click="showResult = false" style="margin-top: 8px">
            返回修改
          </van-button>
        </div>
      </div>
    </van-action-sheet>
  </div>
</template>

<script setup>
import { ref } from 'vue'
import { useRouter } from 'vue-router'
import { showToast } from 'vant'
import { jdApi } from '../api'

const router = useRouter()
const method = ref('text')
const jdText = ref('')
const ocrText = ref('')
const submitting = ref(false)
const ocrLoading = ref(false)
const showResult = ref(false)
const parsedResult = ref({})
const currentJdId = ref('')
const imagePreview = ref('')

// 截图上传 → OCR识别（仅提取文字，不自动解析JD）
async function handleImageUpload(file) {
  ocrLoading.value = true
  try {
    const res = await jdApi.ocr(file.file)
    ocrText.value = res.rawText
    imagePreview.value = file.content
    // 保留图片预览，显示识别出的文字让用户确认/编辑
    // 用户修改完后自行点击"解析JD"按钮
    showToast('文字识别完成，请确认后点击解析JD')
  } catch (e) {
    showToast('识别失败: ' + e.message)
  } finally {
    ocrLoading.value = false
  }
}

// 提交JD
async function submitJD() {
  const text = (jdText.value || ocrText.value || '').trim()
  if (!text) {
    showToast('请输入JD内容')
    return
  }

  submitting.value = true
  try {
    const res = await jdApi.create(text)
    currentJdId.value = res.id
    parsedResult.value = res.parsed
    showResult.value = true
  } catch (e) {
    showToast('解析失败: ' + e.message)
  } finally {
    submitting.value = false
  }
}

// 跳转到简历输入
function goNext() {
  showResult.value = false
  router.push({ path: '/resume-input', query: { jdId: currentJdId.value } })
}
</script>

<style scoped>
.jd-input {
  min-height: 100vh;
  background: var(--bg-page);
}

.content {
  padding: 16px;
}

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
}

.method-tab.active {
  color: var(--color-primary);
  border-color: var(--color-primary);
  background: #f0f8ff;
}

.text-input-area :deep(.van-field) {
  border-radius: var(--radius-md);
}

.upload-placeholder {
  display: flex;
  flex-direction: column;
  align-items: center;
  justify-content: center;
  padding: 48px;
  background: var(--bg-card);
  border-radius: var(--radius-md);
  border: 1px dashed #ddd;
}

.upload-placeholder p {
  margin: 8px 0 0;
  color: var(--text-secondary);
  font-size: 14px;
}

.upload-hint {
  font-size: 12px !important;
  color: var(--text-disabled) !important;
}

.ocr-result {
  margin-top: 16px;
}

.ocr-label {
  font-size: 13px;
  color: var(--text-secondary);
  margin-bottom: 8px;
}

.actions {
  margin-top: 24px;
  padding: 0 0 24px;
}

/* 解析结果 */
.parse-result {
  padding: 16px;
}

.parse-item {
  display: flex;
  padding: 10px 0;
  border-bottom: 1px solid #f5f5f5;
  font-size: 14px;
}

.parse-label {
  color: var(--text-secondary);
  width: 80px;
  flex-shrink: 0;
}

.parse-value {
  color: var(--text-primary);
  flex: 1;
}

.parse-section {
  margin-top: 16px;
}

.parse-section-title {
  font-size: 14px;
  font-weight: 600;
  color: var(--text-primary);
  margin-bottom: 8px;
}

.tag-list {
  display: flex;
  flex-wrap: wrap;
  gap: 6px;
}

.req-item {
  font-size: 13px;
  color: var(--text-secondary);
  padding: 4px 0;
  line-height: 1.5;
}

.no-data {
  font-size: 13px;
  color: var(--text-disabled);
}

/* PC 响应式 */
@media (min-width: 768px) {
  .content {
    max-width: 800px;
    margin: 0 auto;
  }

  .method-tab {
    font-size: 15px;
    padding: 12px;
  }
}
</style>
