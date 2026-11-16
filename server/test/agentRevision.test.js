const test = require('node:test');
const assert = require('node:assert/strict');
const { AgentToolService } = require('../services/agent/agentToolService');
const service = new AgentToolService();
const requirement = { id: 'r1', sourceText: '用户访谈' };
const facts = [
  { id: 'f1', confirmation: 'confirmed', context: '课程项目甲', action: '参与用户访谈', contribution: '团队共同整理反馈' },
  { id: 'f2', confirmation: 'corrected', context: '课程项目甲', method: '访谈提纲', result: '团队完成约20份记录', quantityType: 'estimated' },
  { id: 'f3', confirmation: 'confirmed', context: '项目乙', action: '设计海报', result: '获得奖项' },
];
test('real draft selects complementary evidence and exact references without invented outcomes', async () => {
  const draft = await service.draftRevision({ requirement, facts, sufficiency: 'strong' });
  assert.match(draft.text, /访谈提纲/);
  assert.match(draft.text, /团队完成约20份记录/);
  assert.deepEqual(draft.factRefs, ['f1', 'f2']);
  assert.deepEqual(draft.requirementRefs, ['r1']);
  assert.doesNotMatch(draft.text, /海报|奖项|形成可验证产出|提升效率/);
});
test('real draft keeps projects separate and never fills missing results', async () => {
  const draft = await service.draftRevision({ requirement, facts: [facts[0], { ...facts[2], action: '参与用户访谈' }], sufficiency: 'strong' });
  const lines = draft.text.split('\n');
  assert.equal(lines.length, 2);
  assert.doesNotMatch(lines[0], /奖项/);
  assert.match(lines[1], /项目乙.*获得奖项/);
  assert.doesNotMatch(draft.text, /形成可验证产出|提升效率/);
});
test('real draft excludes unconfirmed and rejected evidence', async () => {
  await assert.rejects(service.draftRevision({ requirement, facts: facts.map(f => ({ ...f, confirmation: 'rejected' })) }), /INSUFFICIENT/);
});
for (const type of ['unconfirmed_number', 'responsibility_expansion', 'attribution_expansion', 'unsupported_claim', 'unsupported_claim_semantics']) {
  test(`real repair handles ${type} from original candidate`, async () => {
    const candidate = { text: '主导用户访谈，效率提升99%', factRefs: ['f1'] };
    const repaired = await service.repairRevision({ requirement, facts, candidate, findings: [{ type }] });
    assert.notEqual(repaired.text, candidate.text);
    assert.doesNotMatch(repaired.text, /主导|99|提升/);
    assert.match(repaired.text, /参与|团队/);
    assert.deepEqual(repaired.factRefs, ['f1', 'f2']);
  });
}
test('unknown finding and unchanged repairs fail safely', async () => {
  await assert.rejects(service.repairRevision({ requirement, facts, candidate: { text: 'x' }, findings: [{ type: 'unknown_risk' }] }), /UNSAFE_REPAIR/);
  const candidate = await service.draftRevision({ requirement, facts });
  await assert.rejects(service.repairRevision({ requirement, facts, candidate, findings: [{ type: 'unsupported_claim' }] }), /UNCHANGED/);
});

const { AgentOrchestrator } = require('../services/agent/agentOrchestrator');
const { AgentAuditService } = require('../services/agent/agentAuditService');
function harness(judge, inputFacts = facts) {
  let store = { id: 's', userId: 'u', state: 'task_in_progress', requirements: [requirement], resumeFacts: structuredClone(inputFacts), transitions: [], tasks: [{ id: 't', requirementId: 'r1', factIds: inputFacts.map(f => f.id), state: 'generating', effectiveRounds: 0 }] };
  const tools = new AgentToolService();
  const audit = new AgentAuditService({ judge });
  tools.verifyRevision = input => audit.verifyRevision(input);
  const repository = { get: async () => structuredClone(store), save: async s => { store = structuredClone(s); return s; } };
  return { tools, app: new AgentOrchestrator({ repository, tools }) };
}
const verdict = (status = 'passed', findings = []) => ({ status, findings, supportedClaims: [], unsupportedClaims: [], factRefs: ['f1', 'f2'] });
test('real generation, independent audit retry reuses candidate, and adoption', async () => {
  let calls = 0;
  const { app, tools } = harness(async () => { if (++calls === 1) throw new Error('offline'); return verdict(); });
  let drafts = 0;
  const draft = tools.draftRevision.bind(tools);
  tools.draftRevision = async input => { drafts++; return draft(input); };
  const first = await app.generateCandidate('s', 'u', 't');
  assert.equal(first.tasks[0].state, 'verification_failed');
  await assert.rejects(app.decide('s', 'u', 't', { type: 'accepted' }), /NOT_ADOPTABLE/);
  const retried = await app.retryCurrentStep('s', 'u', 't');
  assert.equal(retried.tasks[0].candidate.text, first.tasks[0].candidate.text);
  assert.equal(drafts, 1);
  assert.equal(calls, 2);
  const adopted = await app.decide('s', 'u', 't', { type: 'accepted' });
  assert.equal(adopted.tasks[0].state, 'accepted');
});
test('risky original is repaired by real method and independently reaudited', async () => {
  let calls = 0;
  const { app, tools } = harness(async () => { calls++; return verdict(); });
  tools.draftRevision = async () => ({ text: '主导用户访谈，提升99%', factRefs: ['f1'], requirementRefs: ['r1'] });
  // Repair uses the production generator, not the injected faulty draft.
  tools.repairRevision = input => service.repairRevision(input);
  const result = await app.generateCandidate('s', 'u', 't');
  assert.equal(result.tasks[0].repairAttempts, 1);
  assert.equal(result.tasks[0].state, 'awaiting_user_decision');
  assert.doesNotMatch(result.tasks[0].candidate.text, /99|主导/);
  assert.equal(calls, 1); // First candidate was stopped by deterministic checks.
});
test('persistent semantic risk stops after one automatic repair and bounded retries', async () => {
  let calls = 0;
  const { app } = harness(async () => { calls++; return verdict('blocked', [{ type: 'unsupported_claim' }]); });
  const result = await app.generateCandidate('s', 'u', 't');
  assert.equal(result.tasks[0].repairAttempts, 1);
  assert.equal(result.tasks[0].state, 'verification_failed');
  for (let i = 0; i < 3; i++) await app.retryCurrentStep('s', 'u', 't');
  await assert.rejects(app.retryCurrentStep('s', 'u', 't'), /RETRY_LIMIT/);
  await assert.rejects(app.decide('s', 'u', 't', { type: 'accepted' }), /NOT_ADOPTABLE/);
  assert.equal(calls, 4);
});
test('normal chain requires confirmation and excludes rejected evidence', async () => {
  let calls = 0;
  const pending = { ...facts[2], confirmation: 'pending_confirmation' };
  const { app } = harness(async () => { calls++; return verdict(); }, [facts[0], facts[1], pending]);
  const first = await app.generateCandidate('s', 'u', 't');
  assert.equal(first.tasks[0].state, 'awaiting_fact_confirmation');
  assert.equal(calls, 0);
  await app.reviewFact('s', 'u', 't', 'f3', 'reject');
  const result = await app.generateCandidate('s', 'u', 't');
  assert.deepEqual(result.tasks[0].candidate.factRefs, ['f1', 'f2']);
});
test('supplement assessment and new version do not merge unrelated project slots', async () => {
  const prior = { ...facts[0], method: '甲方法', result: '甲成果' };
  const latest = { ...facts[2], contribution: '参与', result: '' };
  const { app, tools } = harness(async () => verdict(), [prior, latest]);
  tools.assessAnswer = async input => {
    assert.equal(input.confirmedFact.context, '项目乙');
    assert.equal(input.confirmedFact.method, undefined);
    assert.equal(input.confirmedFact.result, undefined);
    return { quality: 'relevant', factPatch: { method: '乙方法' }, missingFields: [], questionHint: '' };
  };
  const result = await app.submitAnswer('s', 'u', 't', '补充乙方法');
  const added = result.resumeFacts.at(-1);
  assert.equal(added.context, '项目乙');
  assert.equal(added.result, '');
  assert.equal(added.method, '乙方法');
  assert.equal(added.baseFactId, 'f3');
});
