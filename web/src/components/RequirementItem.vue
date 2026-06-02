<template>
  <div class="requirement-item" :class="item.status">
    <div class="req-header">
      <span :class="['req-icon', item.status]">
        <svg v-if="item.status === 'matched'" width="16" height="16" viewBox="0 0 16 16" fill="none">
          <circle cx="8" cy="8" r="7" fill="#34c759"/>
          <path d="M5 8.5l2 2 4-4" stroke="#fff" stroke-width="1.5" stroke-linecap="round" stroke-linejoin="round"/>
        </svg>
        <svg v-else-if="item.status === 'partial'" width="16" height="16" viewBox="0 0 16 16" fill="none">
          <circle cx="8" cy="8" r="7" fill="#ff9f0a"/>
          <path d="M8 5v3.5M8 11v.5" stroke="#fff" stroke-width="1.5" stroke-linecap="round"/>
        </svg>
        <svg v-else width="16" height="16" viewBox="0 0 16 16" fill="none">
          <circle cx="8" cy="8" r="7" fill="#ff3b30"/>
          <path d="M5.5 5.5l5 5M10.5 5.5l-5 5" stroke="#fff" stroke-width="1.5" stroke-linecap="round"/>
        </svg>
      </span>
      <span class="req-text">{{ item.requirement }}</span>
    </div>

    <div v-if="item.matchedSections?.length" class="req-sections">
      <div v-for="(section, idx) in item.matchedSections" :key="idx" class="req-section">
        <svg width="12" height="12" viewBox="0 0 12 12" fill="none">
          <path d="M6 1.5v9M1.5 6h9" stroke="#aeaeb2" stroke-width="1" stroke-linecap="round"/>
        </svg>
        <span class="section-label">{{ section.label }}</span>
        <span class="section-evidence">{{ section.evidence }}</span>
      </div>
    </div>

    <div v-if="item.suggestion" class="req-suggestion">
      <svg width="14" height="14" viewBox="0 0 14 14" fill="none">
        <circle cx="7" cy="7" r="6" stroke="#ff9f0a" stroke-width="1"/>
        <path d="M7 4.5v3.5M7 9.5v.5" stroke="#ff9f0a" stroke-width="1.2" stroke-linecap="round"/>
      </svg>
      <span>{{ item.suggestion }}</span>
    </div>
  </div>
</template>

<script setup>
const props = defineProps({
  item: { type: Object, required: true },
})
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
  background: #f5f5f7;
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
  color: #b56200;
  padding: 8px 10px;
  background: #fff8e6;
  border-radius: 8px;
  line-height: 1.4;
}
</style>
