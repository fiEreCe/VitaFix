<script setup>
defineProps({
  title: {
    type: String,
    required: true,
  },
  description: {
    type: String,
    default: '',
  },
  eyebrow: {
    type: String,
    default: '',
  },
  back: {
    type: Boolean,
    default: false,
  },
})

defineEmits(['back'])
</script>

<template>
  <div class="app-page">
    <header class="app-chrome material">
      <div class="app-chrome__inner">
        <button
          v-if="back"
          class="icon-button tap-target pressable"
          type="button"
          aria-label="返回上一页"
          @click="$emit('back')"
        >
          <span aria-hidden="true">←</span>
        </button>

        <div class="app-chrome__title">
          <p v-if="eyebrow" class="app-chrome__eyebrow">{{ eyebrow }}</p>
          <h1 id="page-title">{{ title }}</h1>
          <p v-if="description" class="app-chrome__description">{{ description }}</p>
        </div>

        <div class="app-chrome__actions">
          <slot name="actions" />
        </div>
      </div>
    </header>

    <main class="app-page__main" aria-labelledby="page-title">
      <slot />
    </main>
  </div>
</template>

<style scoped>
.app-chrome {
  position: sticky;
  z-index: 20;
  top: 0;
  background: var(--surface-material);
  backdrop-filter: blur(24px) saturate(160%);
  -webkit-backdrop-filter: blur(24px) saturate(160%);
}

.app-chrome__inner {
  display: grid;
  grid-template-columns: auto minmax(0, 1fr) auto;
  gap: var(--spacing-md);
  align-items: center;
  width: 100%;
  max-width: var(--workspace-max);
  min-height: 4.5rem;
  margin: 0 auto;
  padding: 0.75rem 1rem;
}

.icon-button {
  display: inline-grid;
  place-items: center;
  width: 2.75rem;
  height: 2.75rem;
  padding: 0;
  color: var(--text-primary);
  border: 0;
  background: var(--surface-subtle);
  border-radius: 50%;
  cursor: pointer;
  font-size: 1.75rem;
  line-height: 1;
}

.app-chrome__title {
  min-width: 0;
}

.app-chrome__title h1,
.app-chrome__title p {
  margin: 0;
}

.app-chrome__title h1 {
  overflow-wrap: anywhere;
  font-size: var(--type-headline);
  line-height: 1.2;
  letter-spacing: -0.01em;
}

.app-chrome__eyebrow,
.app-chrome__description {
  color: var(--text-secondary);
  font-size: var(--type-caption);
  line-height: 1.35;
}

.app-chrome__eyebrow {
  margin-bottom: var(--spacing-xs) !important;
  font-weight: 600;
}

.app-chrome__description {
  margin-top: var(--spacing-xs) !important;
}

.app-chrome__actions {
  display: flex;
  align-items: center;
  justify-content: flex-end;
}

@media (min-width: 56.25rem) {
  .app-chrome__inner {
    padding: 1rem 2rem;
  }

}
</style>
