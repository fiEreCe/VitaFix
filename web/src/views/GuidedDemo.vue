<template>
  <AppPage
    title="引导演示"
    description="用静态示例走完一轮证据驱动优化"
    back
    @back="$router.back()"
  >
    <div class="demo-intro">
      <p class="demo-notice" role="note">
        示例数据 · 预计算结果，不会调用实时 AI 或写入历史记录
      </p>
      <h2>30 秒看懂证据驱动优化</h2>
      <p>从岗位要求开始，逐步核对事实、表达和修改效果。</p>
    </div>

    <div class="demo-layout">
      <ol class="demo-progress" aria-label="演示进度">
        <li
          v-for="(step, index) in steps"
          :key="step.title"
          :class="{
            'is-active': index === current,
            'is-complete': index < current,
          }"
          :aria-current="index === current ? 'step' : undefined"
        >
          <span class="demo-progress__number" aria-hidden="true">{{ index + 1 }}</span>
          <span>{{ step.title }}</span>
        </li>
      </ol>

      <div class="demo-stage">
        <section class="demo-live" aria-live="polite" aria-atomic="true">
          <div :key="current" class="demo-detail">
            <p class="demo-detail__step">第 {{ current + 1 }} 步，共 {{ steps.length }} 步</p>
            <h3>{{ steps[current].title }}</h3>
            <p>{{ steps[current].text }}</p>
          </div>
        </section>

        <div class="demo-actions">
          <button
            v-if="current < steps.length - 1"
            class="demo-button demo-button--primary pressable"
            type="button"
            data-testid="demo-next"
            @click="current++"
          >
            下一步
          </button>
          <button
            v-else
            class="demo-button demo-button--primary pressable"
            type="button"
            data-testid="demo-restart"
            @click="restart"
          >
            重新开始
          </button>
          <button
            class="demo-button demo-button--secondary pressable"
            type="button"
            @click="$router.push('/jd-input')"
          >
            使用自己的材料
          </button>
        </div>
      </div>
    </div>
  </AppPage>
</template>

<script setup>
import { ref } from 'vue'
import AppPage from '../components/ui/AppPage.vue'
import { demoFixture } from '../demo/fixture'

const session = demoFixture.session
const task = session.tasks[0]
const requirement = session.requirements.find((item) => item.id === task.requirementId)
const fact = session.resumeFacts.find((item) => task.factIds.includes(item.id))
const validation = task.validationRecords.at(-1)
const current = ref(0)

const steps = [
  { title: '岗位要求', text: requirement.sourceText },
  { title: '简历事实', text: fact.sourceText },
  { title: '识别缺口', text: task.gapType === 'expression' ? '事实存在，但个人贡献表达不足' : task.gapType },
  { title: '事实确认', text: `${fact.context}中，${fact.contribution}` },
  { title: '安全候选', text: `${task.candidate.text}（审核：${task.candidate.verification.status}）` },
  {
    title: '修改效果验证',
    text: `${validation.diff.before} → ${validation.diff.after}（${validation.changeOutcome}）`,
  },
]

const restart = () => {
  current.value = 0
}
</script>

<style scoped>
.demo-intro {
  margin-bottom: var(--spacing-xl);
}

.demo-intro h2,
.demo-intro p {
  margin: 0;
}

.demo-intro h2 {
  margin-top: var(--spacing-lg);
  font-size: var(--type-title);
  line-height: 1.15;
  letter-spacing: -0.02em;
}

.demo-intro > p:last-child {
  margin-top: var(--spacing-sm);
  color: var(--text-secondary);
}

.demo-notice {
  padding: var(--spacing-md) var(--spacing-lg);
  color: var(--text-secondary);
  background: var(--surface-subtle);
  border-radius: var(--radius-md);
  font-size: var(--type-caption);
}

.demo-layout {
  display: grid;
  grid-template-columns: minmax(0, 1fr);
  gap: var(--spacing-xl);
  align-items: start;
}

.demo-progress {
  display: grid;
  gap: var(--spacing-xs);
  margin: 0;
  padding: var(--spacing-sm);
  list-style: none;
  background: var(--surface-content);
  border: 1px solid var(--border-subtle);
  border-radius: var(--radius-lg);
  box-shadow: var(--shadow-sm);
}

.demo-progress li {
  display: grid;
  grid-template-columns: 2rem minmax(0, 1fr);
  gap: var(--spacing-md);
  align-items: center;
  min-height: 3rem;
  padding: var(--spacing-sm) var(--spacing-md);
  color: var(--text-secondary);
  border-radius: var(--radius-md);
  font-size: var(--type-caption);
  font-weight: 500;
}

.demo-progress li.is-active {
  color: var(--text-primary);
  background: var(--surface-selected);
  font-weight: 650;
}

.demo-progress li.is-complete {
  color: var(--color-success);
  font-weight: 600;
}

.demo-progress__number {
  display: inline-grid;
  place-items: center;
  width: 2rem;
  height: 2rem;
  color: inherit;
  background: var(--surface-subtle);
  border-radius: 50%;
}

.is-active .demo-progress__number {
  color: #fff;
  background: var(--color-primary);
}

.is-complete .demo-progress__number {
  color: #fff;
  background: var(--color-success);
}

.demo-stage {
  min-width: 0;
}

.demo-detail {
  min-height: 13rem;
  padding: clamp(1.25rem, 4vw, 2rem);
  background: var(--surface-content);
  border: 1px solid var(--border-subtle);
  border-radius: var(--radius-xl);
  box-shadow: var(--shadow-md);
  animation: demo-detail-reveal var(--motion-reveal) var(--ease-out-fluid) both;
}

.demo-detail h3,
.demo-detail p {
  margin: 0;
}

.demo-detail h3 {
  margin-top: var(--spacing-sm);
  font-size: var(--type-headline);
}

.demo-detail h3 + p {
  margin-top: var(--spacing-md);
  overflow-wrap: anywhere;
  line-height: 1.7;
}

.demo-detail__step {
  color: var(--color-primary);
  font-size: var(--type-caption);
  font-weight: 650;
}

.demo-actions {
  display: grid;
  gap: var(--spacing-sm);
  margin-top: var(--spacing-lg);
}

.demo-button {
  width: 100%;
  padding: 0.75rem 1rem;
  border-radius: 999px;
  cursor: pointer;
  font-weight: 600;
}

.demo-button--primary {
  color: #fff;
  background: var(--color-primary);
  border: 1px solid var(--color-primary);
}

.demo-button--secondary {
  color: var(--color-primary);
  background: transparent;
  border: 1px solid var(--border-strong);
}

@keyframes demo-detail-reveal {
  from {
    opacity: 0;
    transform: translateY(0.5rem);
  }

  to {
    opacity: 1;
    transform: translateY(0);
  }
}

@media (min-width: 56.25rem) {
  .demo-layout {
    grid-template-columns: minmax(16rem, 22rem) minmax(0, 1fr);
    gap: var(--spacing-2xl);
  }

  .demo-progress {
    position: sticky;
    top: 6.5rem;
  }

  .demo-actions {
    grid-template-columns: repeat(2, minmax(0, 1fr));
  }
}

@media (prefers-reduced-motion: reduce) {
  .demo-detail {
    animation: none;
    transform: none;
  }
}
</style>
