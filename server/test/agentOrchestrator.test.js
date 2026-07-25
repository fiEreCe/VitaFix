const test = require('node:test');
const assert = require('node:assert/strict');
const { AgentOrchestrator } = require('../services/agent/agentOrchestrator');

test('runs a recommended task through fact confirmation and a verified candidate', async () => {
  const store = new Map();
  const repository = { async create(value) { store.set(value.id, structuredClone(value)); return store.get(value.id); }, async get(id) { return store.get(id); }, async save(value) { store.set(value.id, structuredClone(value)); return store.get(value.id); } };
  const tools = {
    parseJD: async () => ({ requirements: [{ id: 'req-1', sourceText: '具备用户研究能力', priority: 10 }] }),
    parseResume: async () => ({ facts: [{ id: 'fact-1', sourceText: '参与问卷设计', action: '设计问卷', context: '校园交易用户', contribution: '团队共同完成', confirmation: 'confirmed' }] }),
    matchEvidence: async () => ({ matches: [{ requirementId: 'req-1', factIds: ['fact-1'], gapType: 'expression', priority: 10 }] }),
    draftRevision: async () => ({ text: '参与校园交易用户问卷设计', factRefs: ['fact-1'], requirementRefs: ['req-1'], rationaleSummary: '突出真实行动' }),
  };
  const app = new AgentOrchestrator({ repository, tools });
  const created = await app.createSession({ userId: 'u1', jdText: 'JD', resumeText: '简历' });
  const ready = await app.startAnalysis(created.id);
  assert.equal(ready.tasks[0].recommended, true);
  await app.selectTask(created.id, ready.tasks[0].id);
  const result = await app.generateCandidate(created.id, ready.tasks[0].id);
  assert.equal(result.tasks[0].state, 'awaiting_user_decision');
  assert.equal(result.tasks[0].candidate.verification.status, 'passed');
});

test('answer creates a pending fact which requires confirmation', async () => {
  const store = new Map();
  const repository = { async create(value) { store.set(value.id, structuredClone(value)); return store.get(value.id); }, async get(id) { return store.get(id); }, async save(value) { store.set(value.id, structuredClone(value)); return store.get(value.id); } };
  const app = new AgentOrchestrator({ repository, tools: {} });
  await app.createSession({ userId: 'u1', jdText: 'JD', resumeText: '简历' });
  const session = [...store.values()][0]; session.tasks = [{ id: 'task-1', factIds: [], state: 'questioning', effectiveRounds: 0, clarificationUsed: false }];
  await app.submitAnswer(session.id, 'task-1', '我独立设计了校园用户访谈提纲');
  const updated = await repository.get(session.id);
  assert.equal(updated.resumeFacts.at(-1).confirmation, 'pending_confirmation');
  assert.equal(updated.tasks[0].state, 'awaiting_fact_confirmation');
});

test('repairs an unsafe draft once before presenting it', async () => {
  const store = new Map();
  const repository = { async create(v) { store.set(v.id, structuredClone(v)); return store.get(v.id); }, async get(id) { return store.get(id); }, async save(v) { store.set(v.id, structuredClone(v)); return store.get(v.id); } };
  const app = new AgentOrchestrator({ repository, tools: {
    draftRevision: async () => ({ text: '独立收集500份样本', factRefs: ['fact-1'], requirementRefs: ['req-1'] }),
    repairRevision: async () => ({ text: '参与用户问卷设计', factRefs: ['fact-1'], requirementRefs: ['req-1'] }),
  } });
  const session = await app.createSession({ userId: 'u1', jdText: 'JD', resumeText: '简历' });
  session.requirements = [{ id: 'req-1', sourceText: '用户研究' }]; session.resumeFacts = [{ id: 'fact-1', sourceText: '参与问卷设计', action: '参与问卷设计', context: '用户', contribution: '团队共同完成', confirmation: 'confirmed' }]; session.tasks = [{ id: 'task-1', requirementId: 'req-1', factIds: ['fact-1'], state: 'generating', effectiveRounds: 0 }];
  const result = await app.generateCandidate(session.id, 'task-1');
  assert.equal(result.tasks[0].state, 'awaiting_user_decision');
  assert.equal(result.tasks[0].repairAttempts, 1);
});
