<template>
  <div class="score-circle" :style="{ '--score-color': color }">
    <svg viewBox="0 0 120 120" class="circle-svg">
      <circle cx="60" cy="60" r="52" fill="none" stroke="#f0f0f0" stroke-width="8" />
      <circle
        cx="60" cy="60" r="52"
        fill="none"
        :stroke="color"
        stroke-width="8"
        stroke-linecap="round"
        :stroke-dasharray="circumference"
        :stroke-dashoffset="dashOffset"
        transform="rotate(-90, 60, 60)"
        class="circle-progress"
      />
    </svg>
    <div class="score-text">
      <span class="score-number">{{ score }}</span>
      <span class="score-unit">分</span>
    </div>
  </div>
</template>

<script setup>
import { computed, onBeforeUnmount, onMounted, ref, watch } from 'vue'

const props = defineProps({
  score: { type: Number, default: 0 },
  color: { type: String, default: '#1989fa' },
})

const circumference = 2 * Math.PI * 52
const revealedScore = ref(0)
let revealFrame = null

function prefersReducedMotion() {
  return typeof window !== 'undefined' &&
    typeof window.matchMedia === 'function' &&
    window.matchMedia('(prefers-reduced-motion: reduce)').matches
}

function revealScore(score) {
  if (revealFrame !== null) cancelAnimationFrame(revealFrame)
  if (prefersReducedMotion()) {
    revealedScore.value = score
    return
  }
  revealedScore.value = 0
  revealFrame = requestAnimationFrame(() => {
    revealedScore.value = score
    revealFrame = null
  })
}

onMounted(() => revealScore(props.score))
watch(() => props.score, revealScore)
onBeforeUnmount(() => {
  if (revealFrame !== null) cancelAnimationFrame(revealFrame)
})

const dashOffset = computed(() => {
  const score = Math.min(Math.max(revealedScore.value, 0), 100)
  return circumference - (circumference * score) / 100
})
</script>

<style scoped>
.score-circle {
  position: relative;
  width: 120px;
  height: 120px;
  display: flex;
  align-items: center;
  justify-content: center;
}

.circle-svg {
  width: 100%;
  height: 100%;
}

.circle-progress {
  transition: stroke-dashoffset 300ms var(--ease-out-fluid);
}

.score-text {
  position: absolute;
  text-align: center;
}

.score-number {
  font-size: 36px;
  font-weight: 700;
  color: var(--score-color);
  line-height: 1;
}

.score-unit {
  font-size: 12px;
  color: var(--text-secondary);
  margin-left: 2px;
}

@media (prefers-reduced-motion: reduce) {
  .circle-progress {
    transition: none;
  }
}
</style>
