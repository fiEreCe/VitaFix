<template>
  <div class="supplement">
    <van-nav-bar
      title="补充经历（可选）"
      left-arrow
      @click-left="$router.back()"
    />

    <div class="content">
      <div class="tip-card">
        <van-icon name="bulb-o" />
        <span>如果你有简历中没有体现的经历（实习、项目、竞赛等），可以在这里补充，AI分析时会纳入考量。</span>
      </div>

      <!-- 已有经历列表 -->
      <div v-if="items.length > 0" class="list-section">
        <div
          v-for="(item, idx) in items"
          :key="idx"
          class="item-card"
        >
          <div class="item-header">
            <van-tag :color="typeColor(item.type)" size="small">{{ item.type }}</van-tag>
            <van-icon name="cross" @click="removeItem(idx)" />
          </div>
          <div class="item-title">{{ item.title }}</div>
          <div v-if="item.period" class="item-period">{{ item.period }}</div>
          <div v-if="item.description" class="item-desc">{{ item.description }}</div>
          <div class="item-checkbox">
            <van-checkbox v-model="item.includedInResume" shape="square" size="14">
              已在简历中包含
            </van-checkbox>
          </div>
        </div>
      </div>

      <!-- 添加新经历 -->
      <van-form @submit="addItem" class="add-form">
        <van-cell-group inset>
          <van-field
            v-model="form.type"
            label="类型"
            placeholder="实习/项目/竞赛/志愿者"
            :rules="[{ required: true, message: '请选择类型' }]"
          >
            <template #input>
              <van-radio-group v-model="form.type" direction="horizontal">
                <van-radio name="实习">实习</van-radio>
                <van-radio name="项目">项目</van-radio>
                <van-radio name="竞赛">竞赛</van-radio>
                <van-radio name="其他">其他</van-radio>
              </van-radio-group>
            </template>
          </van-field>
          <van-field
            v-model="form.title"
            label="标题"
            placeholder="例如：XX公司实习 / XX项目"
            :rules="[{ required: true, message: '请输入标题' }]"
          />
          <van-field
            v-model="form.period"
            label="时间"
            placeholder="例如：2024.06 - 2024.09"
          />
          <van-field
            v-model="form.description"
            label="描述"
            type="textarea"
            rows="3"
            autosize
            placeholder="简单描述这段经历的内容和成果..."
          />
        </van-cell-group>

        <div style="margin: 16px">
          <van-button round block type="default" native-type="submit">
            添加这条经历
          </van-button>
        </div>
      </van-form>

      <!-- 底部操作 -->
      <div class="actions">
        <van-button
          type="primary"
          block
          round
          :loading="saving"
          @click="saveAndAnalyze"
        >
          {{ items.length > 0 ? '保存并开始分析' : '跳过，直接分析' }}
        </van-button>
      </div>
    </div>
  </div>
</template>

<script setup>
import { ref, onMounted, computed } from 'vue'
import { useRoute, useRouter } from 'vue-router'
import { showToast } from 'vant'
import { supplementApi, analysisApi } from '../api'
import { events } from '../utils/analytics'

const route = useRoute()
const router = useRouter()

// 先从 query 取，刷新丢失时从 localStorage 恢复
const resumeId = computed(() => route.query.resumeId || localStorage.getItem('pendingResumeId') || '')
const jdId = computed(() => route.query.jdId || localStorage.getItem('pendingJdId') || '')
const skipSupplement = computed(() => route.query.skip === '1')

const items = ref([])
const saving = ref(false)

const form = ref({
  type: '实习',
  title: '',
  period: '',
  description: '',
})

// 如果标记了跳过，直接开始分析
onMounted(() => {
  if (skipSupplement.value && resumeId.value && jdId.value) {
    startAnalysis()
  }
})

function typeColor(type) {
  const map = { 实习: '#1989fa', 项目: '#07c160', 竞赛: '#ff976a', 其他: '#969799' }
  return map[type] || '#969799'
}

function addItem() {
  if (!form.value.title.trim()) {
    showToast('请输入标题')
    return
  }
  items.value.push({ ...form.value })
  form.value.title = ''
  form.value.period = ''
  form.value.description = ''
  showToast('已添加')
}

function removeItem(idx) {
  items.value.splice(idx, 1)
}

async function saveAndAnalyze() {
  if (!resumeId.value || !jdId.value) {
    showToast('数据不完整，请重新开始')
    return
  }

  saving.value = true
  try {
    // 保存补充信息
    if (items.value.length > 0) {
      await supplementApi.upsert(resumeId.value, items.value)
    }
    // 开始分析
    await startAnalysis()
  } catch (e) {
    showToast('操作失败: ' + e.message)
  } finally {
    saving.value = false
  }
}

async function startAnalysis() {
  try {
    const res = await analysisApi.create(jdId.value, resumeId.value)
    events.analysisStarted()
    // 清理 localStorage 中的暂存数据
    localStorage.removeItem('pendingResumeId')
    localStorage.removeItem('pendingJdId')
    showToast('分析已启动')
    router.replace(`/result/${res.id}`)
  } catch (e) {
    showToast('启动分析失败: ' + e.message)
  }
}
</script>

<style scoped>
.supplement {
  min-height: 100vh;
  background: var(--bg-page);
}

.content {
  padding: 16px;
}

.tip-card {
  display: flex;
  align-items: flex-start;
  gap: 8px;
  background: #fff7e6;
  border-radius: var(--radius-md);
  padding: 12px;
  font-size: 13px;
  color: #ff976a;
  line-height: 1.5;
  margin-bottom: 16px;
}

.tip-card .van-icon {
  font-size: 18px;
  flex-shrink: 0;
  margin-top: 1px;
}

.list-section {
  display: flex;
  flex-direction: column;
  gap: 10px;
  margin-bottom: 16px;
}

.item-card {
  background: var(--bg-card);
  border-radius: var(--radius-md);
  padding: 12px 14px;
}

.item-header {
  display: flex;
  justify-content: space-between;
  align-items: center;
  margin-bottom: 6px;
}

.item-title {
  font-size: 14px;
  font-weight: 500;
}

.item-period {
  font-size: 12px;
  color: var(--text-secondary);
  margin-top: 2px;
}

.item-desc {
  font-size: 13px;
  color: var(--text-secondary);
  line-height: 1.5;
  margin-top: 4px;
}

.item-checkbox {
  margin-top: 8px;
  font-size: 12px;
}

.add-form {
  margin-bottom: 16px;
}

.actions {
  padding-bottom: 24px;
}
</style>
