<template>
  <div class="agent-workbench">
    <van-nav-bar title="证据驱动简历优化" left-arrow @click-left="$router.back()" />
    <div v-if="loading" class="state"><van-loading size="32">正在建立证据匹配…</van-loading></div>
    <div v-else-if="error" class="state"><van-empty description="会话加载失败" /><van-button round @click="load">重试</van-button></div>
    <main v-else class="content">
      <van-notice-bar v-if="actionError" color="#ee0a24" :text="actionError" />
      <section class="card"><h3>优化任务</h3><van-cell v-for="task in session.tasks" :key="task.id" clickable @click="select(task)">
        <template #title><span>{{ task.recommended ? '推荐 · ' : '' }}{{ requirement(task).sourceText }}</span></template>
        <template #label>{{ task.gapType === 'expression' ? '已有证据，优化表达' : '需要补充事实' }}</template>
        <template #value>{{ task.state }}</template>
      </van-cell></section>
      <template v-if="task">
        <section class="card"><h3>岗位依据</h3><p>{{ requirement(task).sourceText }}</p><h3>可用事实</h3><p v-for="fact in facts(task)" :key="fact.id">{{ fact.sourceText }}</p></section>
        <section v-if="task.state === 'questioning'" class="card"><h3>信息仍不足</h3><p>请补充你本人具体做了什么、服务的对象，以及使用的方法或产出。</p><van-button type="primary" block round @click="generate">已有信息，尝试生成保守表达</van-button></section>
        <section v-if="task.state === 'generating' || task.state === 'assessing_evidence'" class="card"><van-button type="primary" block round :loading="busy" @click="generate">生成候选表达</van-button></section>
        <section v-if="task.candidate" class="card"><h3>候选表达</h3><p class="candidate">{{ task.candidate.text }}</p><van-tag :type="task.candidate.verification.status === 'passed' ? 'success' : 'danger'">{{ task.candidate.verification.status }}</van-tag><p>{{ task.candidate.rationaleSummary }}</p>
          <van-button v-if="task.state === 'awaiting_user_decision'" type="primary" block round :loading="busy" @click="decide('accepted')">采用这条表达</van-button>
        </section>
        <section v-if="['accepted','user_edited','rejected','skipped'].includes(task.state)" class="card success"><h3>本任务已完成</h3><p>已保留来源、事实引用和审核状态，可继续处理下一项任务。</p></section>
      </template>
    </main>
  </div>
</template>
<script setup>
import { computed, onMounted, ref } from 'vue'
import { useRoute } from 'vue-router'
import { agentSessionApi } from '../api'
const route = useRoute(); const session = ref(null); const loading = ref(true); const error = ref(false); const busy = ref(false); const actionError = ref(''); const selectedId = ref('')
const task = computed(() => session.value?.tasks.find((item) => item.id === selectedId.value) || session.value?.tasks.find((item) => item.recommended))
const requirement = (item) => session.value.requirements.find((entry) => entry.id === item.requirementId) || { sourceText: '岗位要求' }
const facts = (item) => session.value.resumeFacts.filter((fact) => item.factIds.includes(fact.id))
async function load() { loading.value = true; error.value = false; try { session.value = await agentSessionApi.get(route.params.id) } catch (_) { error.value = true } finally { loading.value = false } }
function select(item) { selectedId.value = item.id; if (item.state === 'pending') run(() => agentSessionApi.selectTask(route.params.id, item.id)) }
function generate() { run(() => agentSessionApi.generate(route.params.id, task.value.id)) }
function decide(type) { run(() => agentSessionApi.decide(route.params.id, task.value.id, { type })) }
async function run(command) { busy.value = true; actionError.value = ''; try { await command(); await load() } catch (e) { actionError.value = e.message } finally { busy.value = false } }
onMounted(load)
</script>
<style scoped>
.agent-workbench{min-height:100vh;background:var(--bg-page)}.content{padding:16px}.card{background:#fff;border-radius:14px;padding:16px;margin-bottom:12px;box-shadow:var(--shadow-sm)}h3{font-size:16px;margin:0 0 10px}.candidate{white-space:pre-wrap;line-height:1.7}.state{padding:80px 24px;text-align:center}.success{background:#f0fff4}
</style>
