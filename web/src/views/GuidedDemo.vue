<template>
  <div class="demo">
    <van-nav-bar title="引导演示" left-arrow @click-left="$router.back()" />
    <main>
      <van-notice-bar text="示例数据 · 预计算结果，不会调用实时 AI 或写入历史记录" />
      <h1>30 秒看懂证据驱动优化</h1>
      <section
        v-for="(step, index) in steps"
        v-show="index <= current"
        :key="step.title"
        class="card"
      >
        <h3>{{ step.title }}</h3>
        <p>{{ step.text }}</p>
      </section>
      <div class="actions">
        <van-button
          v-if="current < steps.length - 1"
          type="primary"
          round
          block
          @click="current++"
        >
          下一步
        </van-button>
        <van-button v-else type="primary" round block @click="restart">
          重新开始
        </van-button>
        <van-button plain round block style="margin-top: 8px" @click="$router.push('/jd-input')">
          使用自己的材料
        </van-button>
      </div>
    </main>
  </div>
</template>

<script setup>
import { ref } from 'vue'
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
.demo { min-height: 100vh; background: var(--bg-page); }
main { padding: 16px; }
h1 { margin: 18px 0; font-size: 25px; }
.card { margin: 12px 0; padding: 16px; border-radius: 14px; background: #fff; box-shadow: var(--shadow-sm); }
h3 { margin: 0 0 8px; }
.actions { margin-top: 18px; }
</style>
