<template>
  <AppPage
    class="history-page"
    title="历史记录"
    description="回看、命名和管理岗位匹配分析与证据优化记录。"
    back
    @back="router.back()"
  >

    <StatusPanel v-if="loading" kind="loading" title="正在加载历史记录" />

    <StatusPanel
      v-else-if="error"
      kind="error"
      title="历史记录加载失败"
      :message="error.message || '请检查网络后重试。'"
      retryable
      @retry="loadList"
    />

    <StatusPanel
      v-else-if="list.length === 0"
      kind="empty"
      title="还没有分析或优化记录"
      message="完成一次岗位匹配分析或证据优化后，记录会出现在这里。"
    />

    <div v-else class="list">
      <div v-for="item in list" :key="entityKey(item)" class="history-card">
        <button
          class="history-row__open"
          type="button"
          :aria-label="item.type === 'agent' ? `打开优化会话：${item.title || '简历优化会话'}` : `打开分析：${item.name}`"
          @click="openItem(item)"
        >
          <div class="card-left">
            <span class="card-name">
              <span class="type-pill">{{ item.type === 'agent' ? '优化会话' : '匹配分析' }}</span>
              {{ item.type === 'agent' ? (item.title || '简历优化会话') : item.name }}
            </span>
            <div class="card-meta">
              {{ item.company }}<span v-if="item.company && item.position"> · </span>{{ item.position }}
            </div>
            <div class="card-time">{{ formatDate(item.updatedAt || item.createdAt) }}</div>
          </div>
          <div class="card-right">
            <template v-if="item.type === 'agent'">
              <div class="agent-state">{{ sessionStateLabel(item.state) }}</div>
              <div class="agent-progress">{{ taskProgress(item).text }}</div>
            </template>
            <template v-else>
              <div class="score-num" :style="{ color: getGradeColor(item.score) }">{{ item.score }}</div>
              <div class="score-grade" :style="{ color: getGradeColor(item.score) }">{{ item.grade }}</div>
            </template>
          </div>
        </button>
        <div class="history-row__actions">
          <button
            v-if="item.type === 'agent'"
            class="summary-btn"
            type="button"
            :aria-label="`查看优化汇总：${item.title || '简历优化会话'}`"
            @click="openSummary(item)"
          >
            汇总
          </button>
          <template v-else>
            <button
              class="edit-btn"
              type="button"
              :aria-label="`重命名分析：${item.name}`"
              @click="startEdit(item)"
            >
              <svg width="14" height="14" viewBox="0 0 14 14" fill="none" aria-hidden="true">
                <path d="M10.5 1.5l2 2L4.5 11.5l-2.5.5.5-2.5L10.5 1.5z" stroke="currentColor" stroke-width="1.2" stroke-linecap="round" stroke-linejoin="round"/>
              </svg>
            </button>
            <button
              class="card-delete"
              type="button"
              :aria-label="`删除分析：${item.name}`"
              @click="confirmDelete(item)"
            >
            <svg width="16" height="16" viewBox="0 0 16 16" fill="none">
              <path d="M3 4h10M6 4V2.5a.5.5 0 01.5-.5h3a.5.5 0 01.5.5V4M13 4v9.5a.5.5 0 01-.5.5h-9a.5.5 0 01-.5-.5V4" stroke="currentColor" stroke-width="1.2" stroke-linecap="round" stroke-linejoin="round"/>
              <path d="M6.5 7v4M9.5 7v4" stroke="currentColor" stroke-width="1.2" stroke-linecap="round"/>
            </svg>
            </button>
          </template>
        </div>
      </div>
    </div>

    <!-- 编辑名称弹窗 -->
    <van-dialog
      v-model:show="showEdit"
      title="修改名称"
      show-cancel-button
      :before-close="handleEditClose"
    >
      <van-field
        v-model="editName"
        placeholder="例如：投递字节跳动前端岗"
        maxlength="50"
        clearable
        autofocus
      />
    </van-dialog>
  </AppPage>
</template>

<script setup>
import { ref, onMounted } from 'vue'
import { showToast, showConfirmDialog } from 'vant'
import { agentSessionApi, historyApi } from '../api'
import { formatDate, getGradeColor } from '../utils/format'
import {
  entityKey,
  sessionStateLabel,
  sortByRecent,
  taskProgress,
} from '../utils/agent'
import { events } from '../utils/analytics'
import { useRouter } from 'vue-router'
import AppPage from '../components/ui/AppPage.vue'
import StatusPanel from '../components/ui/StatusPanel.vue'

const router = useRouter()

const list = ref([])
const loading = ref(true)
const error = ref(null)
const showEdit = ref(false)
const editName = ref('')
const editingItem = ref(null)

onMounted(async () => {
  await loadList()
})

async function loadList() {
  loading.value = true
  error.value = null
  try {
    const [analysisRes, agentRes] = await Promise.all([
      historyApi.list({ page: 1, pageSize: 100 }),
      agentSessionApi.list({ page: 1, pageSize: 100 }),
    ])
    const analyses = (analysisRes.list || []).map((item) => ({ ...item, type: 'analysis' }))
    const agents = (agentRes.list || []).map((item) => ({ ...item, type: 'agent' }))
    list.value = [...analyses, ...agents].sort(sortByRecent)
  } catch (e) {
    error.value = e
  } finally {
    loading.value = false
  }
}

function openItem(item) {
  router.push(item.type === 'agent' ? `/agent/${item.id}` : `/result/${item.id}`)
}

function openSummary(item) {
  router.push(`/agent/${item.id}/summary`)
}

function startEdit(item) {
  editingItem.value = item
  editName.value = item.name
  showEdit.value = true
}

async function handleEditClose(action) {
  if (action === 'confirm') {
    if (!editName.value.trim()) {
      showToast('名称不能为空')
      return false
    }
    return await saveName()
  }
  return true
}

async function saveName() {
  if (!editingItem.value || !editName.value.trim()) return false

  try {
    await historyApi.updateName(editingItem.value.id, editName.value.trim())
    editingItem.value.name = editName.value.trim()
    events.historyRenamed()
    showToast('已更新')
    return true
  } catch (e) {
    showToast('更新失败: ' + e.message)
    return false
  }
}

function confirmDelete(item) {
  showConfirmDialog({
    title: '确认删除',
    message: `确定要删除"${item.name}"的分析记录吗？`,
  }).then(async () => {
    try {
      await historyApi.remove(item.id)
      list.value = list.value.filter((i) => i.id !== item.id)
      events.historyDeleted()
      showToast('已删除')
    } catch (e) {
      showToast('删除失败: ' + e.message)
    }
  }).catch(() => {
    // 取消删除
  })
}
</script>

<style scoped>
.history-page {
  min-height: 100vh;
  background: var(--bg-page);
}

.loading-state {
  display: flex;
  justify-content: center;
  padding: 60px 0;
}

.empty-state {
  padding: 60px 24px;
  text-align: center;
}

.empty-text {
  font-size: 15px;
  color: var(--text-secondary);
  margin: 0;
}

.list {
  width: min(100%, var(--workspace-max));
  margin: 0 auto;
  padding: 8px 16px 24px;
  display: grid;
  grid-template-columns: minmax(0, 1fr);
  gap: 10px;
}

.history-card {
  background: var(--bg-card);
  border-radius: var(--radius-md);
  display: flex;
  align-items: center;
  box-shadow: var(--shadow-sm);
  overflow: hidden;
}

.history-row__open {
  flex: 1;
  display: flex;
  justify-content: space-between;
  align-items: center;
  padding: 14px 16px;
  cursor: pointer;
  min-width: 0;
  color: inherit;
  text-align: left;
  border: 0;
  background: transparent;
}

.history-row__actions {
  align-self: stretch;
  display: flex;
  align-items: center;
  border-left: 1px solid var(--border-subtle);
}

.card-delete,
.edit-btn {
  flex-shrink: 0;
  display: grid;
  place-items: center;
  min-width: 44px;
  min-height: 44px;
  padding: 10px;
  color: var(--text-secondary);
  cursor: pointer;
  border: 0;
  background: transparent;
}

.card-left {
  flex: 1;
  min-width: 0;
  margin-right: 12px;
}

.card-name {
  display: block;
  font-size: 15px;
  font-weight: 600;
  color: var(--text-primary);
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;
}

.type-pill {
  display: inline-block;
  margin-right: 6px;
  padding: 1px 6px;
  border-radius: 999px;
  background: var(--surface-selected, #eef5ff);
  color: var(--color-primary);
  font-size: 11px;
  font-weight: 600;
  vertical-align: 1px;
}

.agent-state {
  font-size: 13px;
  font-weight: 600;
  color: var(--color-primary);
}

.agent-progress {
  margin-top: 3px;
  font-size: 12px;
  color: var(--text-secondary);
  white-space: nowrap;
}

.summary-btn {
  flex-shrink: 0;
  min-width: 52px;
  min-height: 44px;
  padding: 10px 8px;
  color: var(--color-primary);
  background: transparent;
  border: 0;
  cursor: pointer;
  font-size: 13px;
  font-weight: 600;
}

.card-meta {
  font-size: 13px;
  color: var(--text-secondary);
  margin-top: 3px;
}

.card-time {
  font-size: 12px;
  color: var(--text-disabled);
  margin-top: 2px;
}

.card-right {
  text-align: center;
  flex-shrink: 0;
}

.score-num {
  font-size: 24px;
  font-weight: 700;
  line-height: 1;
  font-variant-numeric: tabular-nums;
}

.score-grade {
  font-size: 12px;
  margin-top: 2px;
}

@media (min-width: 56.25rem) {
  .list {
    grid-template-columns: repeat(2, minmax(0, 1fr));
    padding: 16px 32px 32px;
  }
}
</style>
