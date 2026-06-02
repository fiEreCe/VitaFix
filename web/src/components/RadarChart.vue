<template>
  <div class="radar-chart">
    <svg :viewBox="`0 0 ${size} ${size}`" class="radar-svg">
      <!-- 网格 -->
      <polygon
        v-for="level in levels"
        :key="level"
        :points="gridPoints(level)"
        fill="none"
        stroke="#f0f0f0"
        stroke-width="1"
      />
      <!-- 轴线 -->
      <line
        v-for="(dim, idx) in dimensions"
        :key="idx"
        :x1="cx"
        :y1="cy"
        :x2="point(idx, 1).x"
        :y2="point(idx, 1).y"
        stroke="#f0f0f0"
        stroke-width="1"
      />
      <!-- 数据区域 -->
      <polygon
        :points="dataPoints"
        fill="rgba(25, 137, 250, 0.15)"
        stroke="rgba(25, 137, 250, 0.8)"
        stroke-width="2"
      />
      <!-- 数据点 -->
      <circle
        v-for="(pt, idx) in dataPointArray"
        :key="idx"
        :cx="pt.x"
        :cy="pt.y"
        r="3"
        fill="#1989fa"
      />
      <!-- 标签 -->
      <text
        v-for="(dim, idx) in dimensions"
        :key="'label-' + idx"
        :x="labelPoint(idx).x"
        :y="labelPoint(idx).y"
        text-anchor="middle"
        dominant-baseline="middle"
        font-size="11"
        fill="#666"
      >
        {{ dim.name }}
      </text>
    </svg>
  </div>
</template>

<script setup>
import { computed } from 'vue'

const props = defineProps({
  dimensions: {
    type: Array,
    default: () => [],
  },
  size: { type: Number, default: 280 },
})

const cx = computed(() => props.size / 2)
const cy = computed(() => props.size / 2)
const radius = computed(() => props.size * 0.35)
const levels = [0.25, 0.5, 0.75, 1]

function angle(index) {
  const n = props.dimensions.length
  return (Math.PI * 2 * index) / n - Math.PI / 2
}

function point(index, ratio) {
  const a = angle(index)
  return {
    x: cx.value + radius.value * ratio * Math.cos(a),
    y: cy.value + radius.value * ratio * Math.sin(a),
  }
}

function gridPoints(level) {
  return props.dimensions
    .map((_, idx) => {
      const p = point(idx, level)
      return `${p.x},${p.y}`
    })
    .join(' ')
}

const dataPointArray = computed(() => {
  return props.dimensions.map((dim, idx) => {
    const ratio = Math.min(dim.score || 0, 100) / 100
    return point(idx, ratio)
  })
})

const dataPoints = computed(() => {
  return dataPointArray.value.map((p) => `${p.x},${p.y}`).join(' ')
})

function labelPoint(index) {
  const ratio = 1.25
  const a = angle(index)
  return {
    x: cx.value + radius.value * ratio * Math.cos(a),
    y: cy.value + radius.value * ratio * Math.sin(a),
  }
}
</script>

<style scoped>
.radar-chart {
  display: flex;
  justify-content: center;
}

.radar-svg {
  width: 100%;
  max-width: 280px;
  height: auto;
}
</style>
