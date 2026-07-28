<template>
  <div class="agent-workbench">
    <van-nav-bar title="证据驱动简历优化" left-arrow @click-left="$router.back()" />
    <div v-if="loading" class="state"><van-loading size="32">正在建立证据匹配…</van-loading></div>
    <div v-else-if="error" class="state"><van-empty description="会话加载失败" /><van-button round @click="load">重试</van-button></div>
    <main v-else class="content">
      <van-notice-bar v-if="actionError" color="#ee0a24" :text="actionError" />
      <section class="card"><h3>优化任务</h3><van-cell v-for="item in session.tasks" :key="item.id" clickable @click="select(item)"><template #title>{{ item.recommended ? '推荐 · ' : '' }}{{ requirement(item).sourceText }}</template><template #label>{{ item.gapType === 'expression' ? '已有证据，可优化表达' : '需要补充事实' }}</template><template #value>{{ item.state }}</template></van-cell></section>
      <template v-if="task">
        <section class="card"><h3>岗位依据</h3><p>{{ requirement(task).sourceText }}</p><h3>可用事实</h3><p v-for="fact in facts(task)" :key="fact.id">{{ fact.sourceText }}</p></section>
        <section v-if="task.state === 'questioning'" class="card"><h3>补充一个关键事实（{{ task.effectiveRounds }}/3）</h3><p>{{ task.currentQuestion || '请补充你本人具体做了什么、服务对象，以及使用的方法或产出。' }}</p><van-field v-model="answer" rows="3" autosize type="textarea" placeholder="例如：我设计访谈提纲并整理了用户洞察" /><van-button type="primary" block round :loading="busy" @click="submitAnswer">提交并确认事实</van-button><div class="minor"><van-button size="small" @click="specialAnswer('不记得')">不记得</van-button><van-button size="small" @click="specialAnswer('没有做过')">没有做过</van-button><van-button size="small" @click="specialAnswer('无法证明')">无法证明</van-button></div></section>
        <section v-if="task.state === 'awaiting_fact_confirmation'" class="card"><h3>请确认提取的事实</h3><p>{{ pendingFact(task)?.sourceText }}</p><van-button type="primary" block round :loading="busy" @click="reviewFact('confirm')">确认无误</van-button><van-button plain block round style="margin-top:8px" @click="reviewFact('reject')">不是这个意思</van-button></section>
        <section v-if="task.state === 'generating' || task.state === 'assessing_evidence'" class="card"><van-button type="primary" block round :loading="busy" @click="generate">生成候选表达</van-button></section>
        <section v-if="task.candidate" class="card"><h3>候选表达</h3><p class="candidate">{{ task.candidate.text }}</p><van-tag :type="verificationTag(task.candidate.verification.status)">{{ verificationLabel(task.candidate.verification.status) }}</van-tag><p v-if="task.candidate.verification.findings?.length" class="risk">{{ verificationHint(task.candidate.verification.status) }}</p><p>{{ task.candidate.rationaleSummary }}</p><template v-if="task.state === 'awaiting_user_decision'"><van-button type="primary" block round :loading="busy" @click="decide('accepted')">采用这条表达</van-button><van-button plain block round style="margin-top:8px" @click="editMode=true">编辑后采用</van-button><van-button plain block round style="margin-top:8px" @click="decide('rejected')">拒绝并保留原文</van-button></template></section>
        <section v-if="task.state === 'question_failed'" class="card"><h3>回答暂未完成分析</h3><p>你的原回答和已确认事实均已保留，可以直接重试。</p><p v-if="task.pendingAnswer" class="candidate">{{ task.pendingAnswer }}</p><van-button type="primary" block round :loading="busy" @click="retry">重试分析回答</van-button></section>
        <section v-if="['generation_failed','verification_failed'].includes(task.state)" class="card"><h3>候选内容未通过安全校验</h3><p>原始事实和当前任务已保留。你可以重试生成，或自己编辑后继续。</p><van-button type="primary" block round :loading="busy" @click="retry">重试</van-button><van-button plain block round style="margin-top:8px" @click="editMode=true">自己编辑</van-button></section>
        <section v-if="editMode" class="card"><h3>自主编辑</h3><van-field v-model="editedText" rows="4" autosize type="textarea" :placeholder="task.candidate?.text || '输入你的表达'" /><p>保存不会自动验证；完成本轮修改后可主动验证。</p><van-button plain block round @click="saveEdit">保存草稿</van-button><van-button type="primary" block round style="margin-top:8px" :loading="busy" @click="validateEdit">完成修改并验证</van-button></section>
        <section v-if="latestValidation(task)" class="card"><h3>本轮修改效果验证</h3><p v-if="latestValidation(task).safetyStatus === 'unavailable'">验证暂未完成，系统不会宣称本次修改已有改善。</p><p v-else>{{ outcomeLabel(latestValidation(task).changeOutcome) }} · {{ safetyLabel(latestValidation(task).safetyStatus) }}</p><p class="candidate">{{ latestValidation(task).diff.before }} → {{ latestValidation(task).diff.after }}</p><p v-for="(issue, index) in latestValidation(task).remainingIssues" :key="`${issue.type}-${index}`" class="risk">{{ issue.type }}</p><van-button v-if="latestValidation(task).safetyStatus === 'unavailable'" type="primary" block round :loading="busy" @click="validateSavedEdit">重试验证</van-button><van-button v-if="latestValidation(task).safetyStatus === 'blocked' && task.state !== 'completed_with_risk'" type="warning" block round @click="completeWithRisk">确认保留风险内容</van-button></section>
        <section v-if="task.state === 'user_edited' && !editMode" class="card"><h3>用户编辑，未经验证</h3><p>保存草稿不会触发审核。完成本轮修改后，可主动验证事实风险和表达效果。</p><van-button type="primary" block round :loading="busy" @click="validateSavedEdit">完成修改并验证</van-button><van-button plain block round style="margin-top:8px" @click="editMode=true">继续编辑</van-button></section>
        <section v-if="task.state === 'return_control'" class="card"><h3>自动追问已暂停</h3><p>你可以继续补充、手动编辑或暂时跳过；系统不会强制生成。</p><van-button block round type="primary" @click="returnControl('continue')">继续补充</van-button><van-button block round style="margin-top:8px" @click="editMode=true">自己编辑</van-button><van-button block round style="margin-top:8px" @click="returnControl('skip')">暂时跳过</van-button></section>
        <section v-if="['accepted','rejected','skipped','ready_for_reevaluation','completed_with_risk'].includes(task.state)" class="card success"><h3>本任务已完成</h3><p v-if="task.state === 'completed_with_risk'">已确认保留风险内容；该文本未标记为“已验证”。</p><p v-else-if="latestValidation(task)?.safetyStatus === 'passed'">当前文本已验证，并已写入最终交接。</p><p v-else>已保留来源、事实引用和审核状态，可继续处理下一项任务。</p><van-button v-if="task.state === 'ready_for_reevaluation'" plain block round @click="startEdit">继续编辑</van-button></section>
      </template>
    </main>
  </div>
</template>
<script setup>
import { computed, onMounted, ref } from 'vue'
import { useRoute } from 'vue-router'
import { agentSessionApi } from '../api'
const route = useRoute(); const session = ref(null); const loading = ref(true); const error = ref(false); const busy = ref(false); const actionError = ref(''); const selectedId = ref(''); const answer = ref(''); const editMode = ref(false); const editedText = ref('')
const task = computed(() => session.value?.tasks.find((item) => item.id === selectedId.value) || session.value?.tasks.find((item) => item.recommended))
const requirement = (item) => session.value.requirements.find((entry) => entry.id === item.requirementId) || { sourceText: '岗位要求' }
const facts = (item) => session.value.resumeFacts.filter((fact) => item.factIds.includes(fact.id))
const pendingFact = (item) => session.value.resumeFacts.find((fact) => fact.id === item.pendingFactId)
const latestValidation = (item) => item.validationRecords?.at(-1)
async function load() { loading.value = true; error.value = false; try { session.value = await agentSessionApi.get(route.params.id) } catch (_) { error.value = true } finally { loading.value = false } }
function select(item) { selectedId.value = item.id; if (item.state === 'pending') run(() => agentSessionApi.selectTask(route.params.id, item.id)) }
function generate() { run(() => agentSessionApi.generate(route.params.id, task.value.id)) }
function retry() { run(() => agentSessionApi.retry(route.params.id, task.value.id)) }
function submitAnswer() { if (!answer.value.trim()) return; run(async () => { await agentSessionApi.answer(route.params.id, task.value.id, answer.value); answer.value = '' }) }
function specialAnswer(value) { run(() => agentSessionApi.answer(route.params.id, task.value.id, value)) }
function reviewFact(decision) { const fact = pendingFact(task.value); if (fact) run(() => agentSessionApi.reviewFact(route.params.id, task.value.id, fact.id, decision)) }
function returnControl(action) { run(() => agentSessionApi.returnControl(route.params.id, task.value.id, action)) }
function saveEdit() { if (editedText.value.trim()) run(async () => { await agentSessionApi.decide(route.params.id, task.value.id, { type: 'user_edited', text: editedText.value, riskAcknowledged: true }); editMode.value = false }) }
function validateEdit() { if (editedText.value.trim()) run(async () => { await agentSessionApi.validate(route.params.id, task.value.id, editedText.value); editMode.value = false }) }
function validateSavedEdit() { run(() => agentSessionApi.validate(route.params.id, task.value.id, task.value.currentText || task.value.candidate?.text || '')) }
function completeWithRisk() { run(() => agentSessionApi.completeWithRisk(route.params.id, task.value.id)) }
function decide(type) { run(() => agentSessionApi.decide(route.params.id, task.value.id, { type })) }
function startEdit() { editedText.value = task.value.currentText || task.value.candidate?.text || ''; editMode.value = true }
function verificationTag(status) { return status === 'passed' ? 'success' : status === 'warning' ? 'warning' : 'danger' }
function verificationLabel(status) { return ({ passed: '已通过事实校验', warning: '可采用，含风险提示', blocked: '已阻断', unavailable: '校验暂不可用', unverified_user_content: '用户编辑，尚未验证' })[status] || status }
function verificationHint(status) { return status === 'warning' ? '该表达包含估算信息，请确认后再采用。' : '系统未将该 AI 内容标记为可采用。' }
function outcomeLabel(status) { return ({ improved: '有明确改善', unchanged: '暂无明显变化', regressed: '效果有所下降', tradeoff: '有改善，也有新问题' })[status] || status }
function safetyLabel(status) { return ({ passed: '已验证', warning: '已检查，有风险提示', blocked: '存在事实风险', unavailable: '暂未完成验证' })[status] || status }
async function run(command) { busy.value = true; actionError.value = ''; try { await command(); await load() } catch (e) { actionError.value = e.message } finally { busy.value = false } }
onMounted(load)
</script>
<style scoped>
.agent-workbench{min-height:100vh;background:var(--bg-page)}.content{padding:16px}.card{background:#fff;border-radius:14px;padding:16px;margin-bottom:12px;box-shadow:var(--shadow-sm)}h3{font-size:16px;margin:0 0 10px}.candidate{white-space:pre-wrap;line-height:1.7}.risk{color:#9a6700}.state{padding:80px 24px;text-align:center}.success{background:#f0fff4}.minor{display:flex;gap:8px;margin-top:10px;flex-wrap:wrap}
</style>
