<script setup>
defineProps({
  requirement: {
    type: Object,
    default: null,
  },
  facts: {
    type: Array,
    default: () => [],
  },
  validation: {
    type: Object,
    default: null,
  },
})

defineEmits([])

const FACT_FIELDS = [
  { key: 'action', label: '个人行动' },
  { key: 'context', label: '场景 / 对象' },
  { key: 'contribution', label: '个人贡献' },
  { key: 'method', label: '方法' },
  { key: 'result', label: '结果' },
  { key: 'quantity', label: '数字' },
]

function factFields(fact) {
  return FACT_FIELDS
    .map((field) => ({ ...field, value: fact?.[field.key] }))
    .filter((field) => typeof field.value === 'string' && field.value.trim())
}

function factStatusLabel(fact) {
  if (!fact) return ''
  if (fact.confirmation === 'confirmed') {
    if (fact.confirmationSource === 'user') return '用户已确认'
    // 历史会话没有记录确认来源，不能显示为“用户已确认”。
    return '历史确认（未记录用户操作）'
  }
  if (fact.confirmation === 'corrected') {
    return fact.confirmationSource === 'user' ? '用户已修正' : '历史修正（未记录用户操作）'
  }
  return ({
    pending_confirmation: '待你确认',
    extracted: '待你确认',
    rejected: '已拒绝',
  })[fact.confirmation] || ''
}

function validationLabel(status) {
  return ({
    passed: '已验证',
    warning: '已检查，含风险提示',
    blocked: '已阻断：存在事实风险',
    unavailable: '验证暂不可用',
    unverified_user_content: '用户编辑，尚未验证',
  })[status] || '尚无验证记录'
}
</script>

<template>
  <aside class="evidence-context material" aria-label="证据与审核上下文">
    <section>
      <h2>岗位要求</h2>
      <p>{{ requirement?.sourceText || '暂未找到对应岗位要求' }}</p>
    </section>

    <section>
      <h2>引用事实</h2>
      <ul v-if="facts.length" class="fact-list">
        <li v-for="(fact, index) in facts" :key="fact?.id ?? `fact-${index}`" class="fact-item">
          <p class="fact-source">{{ fact?.sourceText || '事实内容暂缺' }}</p>
          <p v-if="factStatusLabel(fact)" class="fact-status">{{ factStatusLabel(fact) }}</p>
          <dl v-if="factFields(fact).length" class="fact-fields">
            <template v-for="field in factFields(fact)" :key="field.key">
              <dt>{{ field.label }}</dt>
              <dd>{{ field.value }}</dd>
            </template>
          </dl>
          <p v-if="fact?.originalFactId" class="fact-note">由原事实 {{ fact.originalFactId }} 修正而来，原内容仍保留。</p>
        </li>
      </ul>
      <p v-else>当前任务尚未引用已确认事实。</p>
    </section>

    <section>
      <h2>最新验证状态</h2>
      <p
        class="context-status"
        :class="validation?.safetyStatus ? `context-status--${validation.safetyStatus}` : ''"
      >
        {{ validationLabel(validation?.safetyStatus) }}
      </p>
      <p v-if="['blocked', 'unavailable', 'unverified_user_content'].includes(validation?.safetyStatus)">
        系统未将该 AI 内容标记为可采用。
      </p>
    </section>
  </aside>
</template>

<style scoped>
.evidence-context {
  min-width: 0;
  padding: var(--spacing-lg);
  background: var(--surface-material);
  border: 1px solid var(--border-subtle);
  border-radius: var(--radius-lg);
}

section + section {
  margin-top: var(--spacing-xl);
  padding-top: var(--spacing-lg);
  border-top: 1px solid var(--border-subtle);
}

h2,
p,
ul,
dl,
dd {
  margin: 0;
}

h2 {
  margin-bottom: var(--spacing-sm);
  font-size: var(--type-headline);
}

p,
li,
dd {
  line-height: 1.6;
}

ul {
  padding-left: 0;
  list-style: none;
}

.fact-list {
  display: grid;
  gap: var(--spacing-md);
}

.fact-item {
  padding: var(--spacing-md);
  background: var(--surface-content);
  border: 1px solid var(--border-subtle);
  border-radius: var(--radius-md);
}

.fact-source {
  font-weight: 600;
  white-space: pre-wrap;
}

.fact-status,
.fact-note {
  margin-top: var(--spacing-xs);
  color: var(--text-secondary);
  font-size: var(--type-caption);
}

.fact-fields {
  display: grid;
  grid-template-columns: auto 1fr;
  gap: var(--spacing-xs) var(--spacing-md);
  margin-top: var(--spacing-sm);
  font-size: var(--type-caption);
}

.fact-fields dt {
  color: var(--text-secondary);
}

.fact-fields dd {
  color: var(--text-primary);
  white-space: pre-wrap;
  overflow-wrap: anywhere;
}

.context-status {
  color: var(--text-secondary);
  font-weight: 600;
}

.context-status--passed {
  color: var(--color-success);
}

.context-status--warning {
  color: #9a6700;
}

.context-status--blocked,
.context-status--unavailable,
.context-status--unverified_user_content {
  color: var(--color-danger);
}
</style>
