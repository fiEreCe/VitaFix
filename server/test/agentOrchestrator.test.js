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
