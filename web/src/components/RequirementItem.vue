<template>
  <div class="requirement-item" :class="item.status">
    <div class="req-header">
      <span :class="['req-icon', item.status]">
        <svg v-if="item.status === 'matched'" width="16" height="16" viewBox="0 0 16 16" fill="none">
          <circle cx="8" cy="8" r="7" fill="currentColor"/>
          <path d="M5 8.5l2 2 4-4" stroke="#fff" stroke-width="1.5" stroke-linecap="round" stroke-linejoin="round"/>
        </svg>
        <svg v-else-if="item.status === 'partial'" width="16" height="16" viewBox="0 0 16 16" fill="none">
          <circle cx="8" cy="8" r="7" fill="currentColor"/>
          <path d="M8 5v3.5M8 11v.5" stroke="#fff" stroke-width="1.5" stroke-linecap="round"/>
        </svg>
        <svg v-else width="16" height="16" viewBox="0 0 16 16" fill="none">
          <circle cx="8" cy="8" r="7" fill="currentColor"/>
          <path d="M5.5 5.5l5 5M10.5 5.5l-5 5" stroke="#fff" stroke-width="1.5" stroke-linecap="round"/>
        </svg>
      </span>
      <span class="req-text">{{ item.requirement }}</span>
      <span :class="['req-status', item.status]">{{ statusLabel }}</span>
    </div>

    <div v-if="item.matchedSections?.length" class="req-sections">
      <div v-for="(section, idx) in item.matchedSections" :key="idx" class="req-section">
        <svg width="12" height="12" viewBox="0 0 12 12" fill="none">
          <path d="M6 1.5v9M1.5 6h9" stroke="currentColor" stroke-width="1" stroke-linecap="round"/>
        </svg>
        <span class="section-label">{{ section.label }}</span>
        <span class="section-evidence">{{ section.evidence }}</span>
      </div>
    </div>

    <div v-if="item.suggestion" class="req-suggestion">
      <svg width="14" height="14" viewBox="0 0 14 14" fill="none">
        <circle cx="7" cy="7" r="6" stroke="currentColor" stroke-width="1"/>
        <path d="M7 4.5v3.5M7 9.5v.5" stroke="currentColor" stroke-width="1.2" stroke-linecap="round"/>
      </svg>
      <span>{{ item.suggestion }}</span>
    </div>
  </div>
</template>

<script setup>
import { computed } from 'vue'

const props = defineProps({
  item: { type: Object, required: true },
})

const STATUS_LABELS = {
  matched: '已匹配',
  partial: '部分匹配',
  unmatched: '未匹配',
}
const statusLabel = computed(() => STATUS_LABELS[props.item.status] || '待确认')
</script>

<style scoped>
.requirement-item {
  background: var(--bg-card);
  border-radius: var(--radius-md);
  padding: 14px 16px;
  border-left: 3px solid;
  box-shadow: var(--shadow-sm);
}

.requirement-item.matched { border-left-color: var(--color-success); }
.requirement-item.partial { border-left-color: var(--color-warning); }
.requirement-item.unmatched { border-left-color: var(--color-danger); }

.req-header {
  display: flex;
  align-items: flex-start;
  gap: 8px;
}

.req-icon {
  flex-shrink: 0;
  margin-top: 1px;
}

.req-icon.matched,
.req-status.matched { color: var(--color-success); }
.req-icon.partial,
.req-status.partial { color: var(--color-warning); }
.req-icon.unmatched,
.req-status.unmatched { color: var(--color-danger); }

.req-status {
  flex-shrink: 0;
  font-size: var(--type-caption);
  font-weight: 600;
}

.req-text {
  font-size: 14px;
  line-height: 1.5;
  color: var(--text-primary);
  flex: 1;
}

.req-sections {
  margin-top: 10px;
  display: flex;
  flex-direction: column;
  gap: 4px;
}

.req-section {
  display: flex;
  align-items: flex-start;
  gap: 4px;
  font-size: 12px;
  color: var(--text-secondary);
  padding: 6px 8px;
  background: var(--surface-subtle);
  border-radius: 6px;
  line-height: 1.4;
}

.section-label {
  font-weight: 500;
  flex-shrink: 0;
  color: var(--text-primary);
}

.section-evidence {
  color: var(--text-secondary);
}

.req-suggestion {
  display: flex;
  align-items: flex-start;
  gap: 6px;
  margin-top: 10px;
  font-size: 13px;
  color: var(--color-warning);
  padding: 8px 10px;
  background: color-mix(in srgb, var(--color-warning) 10%, var(--surface-content));
  border-radius: 8px;
  line-height: 1.4;
}
</style>
