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
      <ul v-if="facts.length">
        <li v-for="(fact, index) in facts" :key="fact?.id ?? `fact-${index}`">
          {{ fact?.sourceText || '事实内容暂缺' }}
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
ul {
  margin: 0;
}

h2 {
  margin-bottom: var(--spacing-sm);
  font-size: var(--type-headline);
}

p,
li {
  line-height: 1.6;
}

ul {
  padding-left: 1.25rem;
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
