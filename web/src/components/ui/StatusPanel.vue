<script setup>
import { computed } from 'vue'

const props = defineProps({
  kind: {
    type: String,
    default: 'empty',
  },
  title: {
    type: String,
    required: true,
  },
  message: {
    type: String,
    default: '',
  },
  retryable: {
    type: Boolean,
    default: false,
  },
})

defineEmits(['retry'])

const role = computed(() => (props.kind === 'error' ? 'alert' : 'status'))
const live = computed(() => (props.kind === 'error' ? 'assertive' : 'polite'))
</script>

<template>
  <section
    class="status-panel"
    :class="`status-panel--${kind}`"
    :role="role"
    :aria-live="live"
  >
    <h2>{{ title }}</h2>
    <p v-if="message">{{ message }}</p>
    <button
      v-if="retryable"
      class="status-panel__retry pressable"
      type="button"
      @click="$emit('retry')"
    >
      重试
    </button>
  </section>
</template>

<style scoped>
.status-panel {
  padding: 2rem;
  text-align: center;
  background: var(--surface-content);
  border: 1px solid var(--border-subtle);
  border-radius: var(--radius-lg);
}

.status-panel h2 {
  margin: 0;
}

.status-panel h2 {
  font-size: var(--type-headline);
  line-height: 1.35;
}

.status-panel p {
  margin: 0.5rem 0 0;
  max-width: var(--reading-max);
  color: var(--text-secondary);
}

.status-panel__retry {
  margin-top: 1rem;
  min-height: 2.75rem;
  padding: 0 1.25rem;
  color: #fff;
  background: var(--color-primary);
  border: 0;
  border-radius: 999px;
  cursor: pointer;
  font-weight: 600;
}
</style>
