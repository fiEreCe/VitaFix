<template>
  <div class="history-page">
    <van-nav-bar
      title="历史分析"
      left-arrow
      @click-left="$router.back()"
    />

    <div v-if="loading" class="loading-state">
      <van-loading size="20">加载中...</van-loading>
    </div>

    <div v-else-if="list.length === 0" class="empty-state">
      <p class="empty-text">还没有分析记录</p>
    </div>

    <div v-else class="list">
      <div v-for="item in list" :key="item.id" class="history-card">
        <div class="card-main" @click="$router.push(`/result/${item.id}`)">
          <div class="card-left">
            <div class="card-top-row">
              <span class="card-name">{{ item.name }}</span>
              <button class="edit-btn" @click.stop="startEdit(item)">
                <svg width="14" height="14" viewBox="0 0 14 14" fill="none">
                  <path d="M10.5 1.5l2 2L4.5 11.5l-2.5.5.5-2.5L10.5 1.5z" stroke="#aeaeb2" stroke-width="1.2" stroke-linecap="round" stroke-linejoin="round"/>
                </svg>
              </button>
            </div>
            <div class="card-meta">
              {{ item.company }}<span v-if="item.company && item.position"> · </span>{{ item.position }}
            </div>
            <div class="card-time">{{ formatDate(item.createdAt) }}</div>
          </div>
          <div class="card-right">
            <div class="score-num" :style="{ color: getGradeColor(item.score) }">{{ item.score }}</div>
            <div class="score-grade" :style="{ color: getGradeColor(item.score) }">{{ item.grade }}</div>
          </div>
        </div>
        <button class="card-delete" @click.stop="confirmDelete(item)">
          <svg width="16" height="16" viewBox="0 0 16 16" fill="none">
            <path d="M3 4h10M6 4V2.5a.5.5 0 01.5-.5h3a.5.5 0 01.5.5V4M13 4v9.5a.5.5 0 01-.5.5h-9a.5.5 0 01-.5-.5V4" stroke="#aeaeb2" stroke-width="1.2" stroke-linecap="round" stroke-linejoin="round"/>
            <path d="M6.5 7v4M9.5 7v4" stroke="#aeaeb2" stroke-width="1.2" stroke-linecap="round"/>
          </svg>
        </button>
      </div>
    </div>

    <!-- 编辑名称弹窗 -->
    <van-dialog
      v-model:show="showEdit"
      title="修改名称"
      show-cancel-button
      @confirm="saveName"
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
  </div>
</template>

<script setup>
import { ref, onMounted } from 'vue'
import { showToast, showConfirmDialog } from 'vant'
import { historyApi } from '../api'
import { formatDate, getGradeColor } from '../utils/format'
import { events } from '../utils/analytics'

const list = ref([])
const loading = ref(true)
const showEdit = ref(false)
const editName = ref('')
const editingItem = ref(null)

onMounted(async () => {
  await loadList()
})

async function loadList() {
  loading.value = true
  try {
    const res = await historyApi.list({ page: 1, pageSize: 100 })
    list.value = res.list || []
  } catch (e) {
    showToast('加载失败: ' + e.message)
  } finally {
    loading.value = false
  }
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
    await saveName()
  }
  return true
}

async function saveName() {
  if (!editingItem.value || !editName.value.trim()) return

  try {
    await historyApi.updateName(editingItem.value.id, editName.value.trim())
    editingItem.value.name = editName.value.trim()
    events.historyRenamed()
    showToast('已更新')
  } catch (e) {
    showToast('更新失败: ' + e.message)
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
  padding: 8px 16px 24px;
  display: flex;
  flex-direction: column;
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

.card-main {
  flex: 1;
  display: flex;
  justify-content: space-between;
  align-items: center;
  padding: 14px 16px;
  cursor: pointer;
  min-width: 0;
}

.card-delete {
  flex-shrink: 0;
  padding: 16px;
  cursor: pointer;
  border-left: 1px solid #f0f0f0;
  background: none;
  border-top: none;
  border-right: none;
  border-bottom: none;
  display: flex;
  align-items: center;
}

.card-left {
  flex: 1;
  min-width: 0;
  margin-right: 12px;
}

.card-top-row {
  display: flex;
  align-items: center;
  gap: 6px;
}

.card-name {
  font-size: 15px;
  font-weight: 600;
  color: var(--text-primary);
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;
}

.edit-btn {
  flex-shrink: 0;
  background: none;
  border: none;
  padding: 2px;
  cursor: pointer;
  display: flex;
  align-items: center;
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

@media (min-width: 768px) {
  .list {
    max-width: 800px;
    margin: 12px auto;
  }
}
</style>
