<template>
  <div class="dimension-card" :class="{ expanded }" @click="expanded = !expanded">
    <div class="dimension-header">
      <span class="dimension-name">{{ dimension.name }}</span>
      <span class="dimension-score" :style="{ color: scoreColor }">{{ dimension.score }}</span>
      <svg :class="['arrow-icon', { rotated: expanded }]" width="12" height="12" viewBox="0 0 12 12" fill="none">
        <path d="M3 5l3 3 3-3" stroke="#aeaeb2" stroke-width="1.5" stroke-linecap="round" stroke-linejoin="round"/>
      </svg>
    </div>

    <div class="score-bar">
      <div class="score-bar-bg">
        <div class="score-bar-fill" :style="{ width: (dimension.score || 0) + '%', background: scoreColor }" />
      </div>
    </div>

    <div v-if="dimension.detail" class="dimension-detail">{{ dimension.detail }}</div>

    <template v-if="expanded">
      <div v-if="dimension.matchedItems?.length" class="dimension-list">
        <div class="list-label">匹配项</div>
        <div v-for="(item, idx) in dimension.matchedItems" :key="idx" class="list-item">
          <div class="list-item-name">{{ item.item }}</div>
          <div class="list-item-desc">{{ item.relevance }}</div>
        </div>
      </div>

      <div v-if="dimension.gapItems?.length" class="dimension-list">
        <div class="list-label gap">可提升项</div>
        <div v-for="(item, idx) in dimension.gapItems" :key="idx" class="list-item">
          <div class="list-item-name">{{ item.item }}</div>
          <div class="list-item-desc">{{ item.suggestion }}</div>
        </div>
      </div>
    </template>
  </div>
</template>

<script setup>
import { ref, computed } from 'vue'
import { getGradeColor } from '../utils/format'

defineOptions({ name: 'DimensionCard' })

const props = defineProps({
  dimension: { type: Object, required: true },
})

const expanded = ref(false)
const scoreColor = computed(() => getGradeColor(props.dimension.score || 0))
</script>

<style scoped>
.dimension-card {
  background: var(--bg-card);
  border-radius: var(--radius-md);
  padding: 16px;
  cursor: pointer;
  box-shadow: var(--shadow-sm);
  transition: box-shadow 0.2s;
}

.dimension-card:active {
  box-shadow: var(--shadow-md);
}

.dimension-header {
  display: flex;
  align-items: center;
  gap: 8px;
}

.dimension-name {
  flex: 1;
  font-size: 15px;
  font-weight: 500;
  letter-spacing: -0.2px;
}

.dimension-score {
  font-size: 17px;
  font-weight: 700;
  font-variant-numeric: tabular-nums;
  min-width: 28px;
  text-align: right;
}

.arrow-icon {
  flex-shrink: 0;
  transition: transform 0.2s;
}

.arrow-icon.rotated {
  transform: rotate(180deg);
}

.score-bar {
  margin-top: 10px;
}

.score-bar-bg {
  height: 4px;
  background: #f0f0f0;
  border-radius: 2px;
  overflow: hidden;
}

.score-bar-fill {
  height: 100%;
  border-radius: 2px;
  transition: width 1s ease-in-out;
}

.dimension-detail {
  font-size: 13px;
  color: var(--text-secondary);
  line-height: 1.5;
  margin-top: 10px;
}

.dimension-list {
  margin-top: 14px;
  padding-top: 12px;
  border-top: 1px solid #f0f0f0;
}

.list-label {
  font-size: 12px;
  font-weight: 600;
  color: var(--color-success);
  margin-bottom: 8px;
  text-transform: uppercase;
  letter-spacing: 0.5px;
}

.list-label.gap {
  color: var(--color-warning);
}

.list-item {
  padding: 6px 0;
}

.list-item + .list-item {
  border-top: 1px solid #f5f5f7;
  padding-top: 8px;
}

.list-item-name {
  font-size: 13px;
  font-weight: 500;
  margin-bottom: 2px;
}

.list-item-desc {
  font-size: 12px;
  color: var(--text-secondary);
  line-height: 1.4;
}
</style>
