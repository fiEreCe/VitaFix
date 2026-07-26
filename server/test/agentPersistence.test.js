const test = require('node:test');
const assert = require('node:assert/strict');

const AgentSession = require('../models/AgentSession');
const { AgentOrchestrator } = require('../services/agent/agentOrchestrator');

function harness(overrides = {}) {
  const store = new Map();
  const repository = {
    async create(value) {
      store.set(value.id, structuredClone(value));
      return structuredClone(store.get(value.id));
    },
    async get(id) {
      const value = store.get(id);
      return value && structuredClone(value);
    },
    async save(value) {
      store.set(value.id, structuredClone(value));
      return structuredClone(store.get(value.id));
    },
  };
  const calls = { parseJD: 0, parseResume: 0, matchEvidence: 0 };
  const tools = {
    parseJD: async () => {
      calls.parseJD += 1;
      return { requirements: [{ id: 'req-1', sourceText: 'Research users' }] };
    },
    parseResume: async () => {
      calls.parseResume += 1;
      return { facts: [{ id: 'fact-1', sourceText: 'Interviewed users', confirmation: 'confirmed' }] };
    },
    matchEvidence: async () => {
      calls.matchEvidence += 1;
      return { matches: [{ requirementId: 'req-1', factIds: ['fact-1'], gapType: 'expression', priority: 10 }] };
    },
    ...overrides,
  };
  return { app: new AgentOrchestrator({ repository, tools }), repository, calls };
}

test('Mongoose persists task workflow fields and accepts return_control', () => {
  const session = new AgentSession({
    userId: 'user-1',
    tasks: [{
      id: 'task-1',
      state: 'return_control',
      pendingFactId: 'fact-2',
      pendingBaseFactId: 'fact-1',
      currentQuestion: 'What changed?',
      questionTarget: 'result',
      lastAnswerAssessment: { quality: 'partial', reason: 'Missing a metric' },
      initialText: 'Initial resume bullet',
      riskAcknowledged: true,
    }, {
      id: 'task-2',
      state: 'pending',
    }],
  });

  assert.equal(session.validateSync(), undefined);
  const serialized = session.toObject();
  assert.deepEqual({
    pendingFactId: serialized.tasks[0].pendingFactId,
    pendingBaseFactId: serialized.tasks[0].pendingBaseFactId,
    currentQuestion: serialized.tasks[0].currentQuestion,
    questionTarget: serialized.tasks[0].questionTarget,
    lastAnswerAssessment: serialized.tasks[0].lastAnswerAssessment,
    initialText: serialized.tasks[0].initialText,
    riskAcknowledged: serialized.tasks[0].riskAcknowledged,
  }, {
    pendingFactId: 'fact-2',
    pendingBaseFactId: 'fact-1',
    currentQuestion: 'What changed?',
    questionTarget: 'result',
    lastAnswerAssessment: { quality: 'partial', reason: 'Missing a metric' },
    initialText: 'Initial resume bullet',
    riskAcknowledged: true,
  });
  assert.equal(serialized.tasks[1].riskAcknowledged, false);
});

test('analysis records exact session transitions and reaches evidence_ready', async () => {
  const { app } = harness();
  const created = await app.createSession({ userId: 'user-1', jdText: 'JD', resumeText: 'Resume' });

  const ready = await app.startAnalysis(created.id);

  assert.equal(ready.state, 'evidence_ready');
  assert.deepEqual(ready.transitions.map(({ from, to, event }) => ({ from, to, event })), [
    { from: 'draft', to: 'parsing', event: 'ANALYSIS_STARTED' },
    { from: 'parsing', to: 'matching', event: 'INPUT_PARSED' },
    { from: 'matching', to: 'evidence_ready', event: 'TASKS_CREATED' },
  ]);
});

test('analysis is idempotent after evidence is ready and preserves tasks', async () => {
  const { app, calls, repository } = harness();
  const created = await app.createSession({ userId: 'user-1', jdText: 'JD', resumeText: 'Resume' });
  const ready = await app.startAnalysis(created.id);
  ready.tasks[0].currentQuestion = 'Preserve me';
  await repository.save(ready);

  const repeated = await app.startAnalysis(created.id);

  assert.deepEqual(repeated.tasks, ready.tasks);
  assert.deepEqual(calls, { parseJD: 1, parseResume: 1, matchEvidence: 1 });
  assert.equal(repeated.transitions.length, 3);
});

test('parse failure is persisted and retry resumes from parsing_failed', async () => {
  let attempts = 0;
  const { app } = harness({
    parseJD: async () => {
      attempts += 1;
      if (attempts === 1) throw new Error('parse unavailable');
      return { requirements: [{ id: 'req-1' }] };
    },
  });
  const created = await app.createSession({ userId: 'user-1', jdText: 'JD', resumeText: 'Resume' });

  await assert.rejects(() => app.startAnalysis(created.id), /parse unavailable/);
  const failed = await app._get(created.id);
  assert.equal(failed.state, 'parsing_failed');
  assert.deepEqual(failed.transitions.map(({ from, to }) => ({ from, to })), [
    { from: 'draft', to: 'parsing' },
    { from: 'parsing', to: 'parsing_failed' },
  ]);

  const ready = await app.startAnalysis(created.id);
  assert.equal(ready.state, 'evidence_ready');
  assert.deepEqual(ready.transitions.slice(2).map(({ from, to }) => ({ from, to })), [
    { from: 'parsing_failed', to: 'parsing' },
    { from: 'parsing', to: 'matching' },
    { from: 'matching', to: 'evidence_ready' },
  ]);
});

test('match failure is persisted and retry preserves inputs while completing', async () => {
  let attempts = 0;
  const { app } = harness({
    matchEvidence: async () => {
      attempts += 1;
      if (attempts === 1) throw new Error('match unavailable');
      return { matches: [{ requirementId: 'req-1', factIds: ['fact-1'], gapType: 'expression', priority: 10 }] };
    },
  });
  const created = await app.createSession({ userId: 'user-1', jdText: 'JD', resumeText: 'Resume' });

  await assert.rejects(() => app.startAnalysis(created.id), /match unavailable/);
  const failed = await app._get(created.id);
  assert.equal(failed.state, 'matching_failed');
  assert.equal(failed.inputSnapshot.jdText, 'JD');
  assert.equal(failed.inputSnapshot.resumeText, 'Resume');
  assert.deepEqual(failed.transitions.map(({ from, to }) => ({ from, to })), [
    { from: 'draft', to: 'parsing' },
    { from: 'parsing', to: 'matching' },
    { from: 'matching', to: 'matching_failed' },
  ]);

  const ready = await app.startAnalysis(created.id);
  assert.equal(ready.state, 'evidence_ready');
  assert.equal(ready.tasks.length, 1);
  assert.deepEqual(ready.transitions.slice(3).map(({ from, to }) => ({ from, to })), [
    { from: 'matching_failed', to: 'parsing' },
    { from: 'parsing', to: 'matching' },
    { from: 'matching', to: 'evidence_ready' },
  ]);
});
