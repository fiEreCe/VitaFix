<script setup>
import { computed } from 'vue'

const props = defineProps({
  tasks: {
    type: Array,
    default: () => [],
  },
  requirements: {
    type: Array,
    default: () => [],
  },
  selectedId: {
    type: [String, Number],
    default: '',
  },
})

defineEmits(['select'])

const requirementById = computed(() => new Map(
  props.requirements.map((requirement) => [requirement?.id, requirement]),
))

function requirementText(task) {
  return requirementById.value.get(task?.requirementId)?.sourceText || '岗位要求'
}

function stateLabel(state) {
  return ({
    pending: '待开始',
    assessing_evidence: '正在评估证据',
    questioning: '需要补充事实',
    awaiting_fact_confirmation: '等待确认事实',
    generating: '准备生成表达',
    verifying: '正在安全校验',
    awaiting_user_decision: '等待你的决定',
    accepted: '已采用',
    rejected: '已拒绝',
    skipped: '已跳过',
    user_edited: '已编辑，待验证',
    question_failed: '回答分析失败',
    generation_failed: '生成失败',
    verification_failed: '安全校验未通过',
    ready_for_reevaluation: '可继续优化',
    completed_with_risk: '已保留风险内容',
    return_control: '已暂停自动追问',
  })[state] || '状态待更新'
}
</script>

<template>
  <nav class="task-navigation material" aria-label="优化任务">
    <h2>优化任务</h2>
    <div class="task-list">
      <button
        v-for="(item, index) in tasks"
        :key="item?.id ?? `task-${index}`"
        class="task-row pressable"
        type="button"
        :aria-current="item?.id === selectedId ? 'step' : undefined"
        @click="$emit('select', item)"
      >
        <span class="task-row__title">
          <span v-if="item?.recommended" class="task-row__recommendation">推荐 · </span>{{ requirementText(item) }}
        </span>
        <span class="task-row__meta">{{ item?.gapType === 'expression' ? '已有证据，可优化表达' : '需要补充事实' }}</span>
        <span class="task-row__state">{{ stateLabel(item?.state) }}</span>
      </button>
    </div>
  </nav>
</template>

<style scoped>
.task-navigation {
  min-width: 0;
  padding: var(--spacing-lg);
  background: var(--surface-material);
  border: 1px solid var(--border-subtle);
  border-radius: var(--radius-lg);
}

h2 {
  margin: 0 0 var(--spacing-md);
  font-size: var(--type-headline);
}

.task-list {
  display: grid;
  gap: var(--spacing-sm);
}

.task-row {
  display: grid;
  gap: var(--spacing-xs);
  width: 100%;
  padding: var(--spacing-md);
  color: var(--text-primary);
  text-align: left;
  background: var(--surface-content);
  border: 1px solid var(--border-subtle);
  border-radius: var(--radius-md);
  cursor: pointer;
}

.task-row[aria-current='step'] {
  background: var(--surface-selected);
  border-color: var(--color-primary);
}

.task-row__title {
  font-weight: 600;
  line-height: 1.4;
}

.task-row__recommendation,
.task-row__state {
  color: var(--color-primary);
}

.task-row__meta,
.task-row__state {
  font-size: var(--type-caption);
  line-height: 1.4;
}

.task-row__meta {
  color: var(--text-secondary);
}
</style>
