const test = require('node:test');
const assert = require('node:assert/strict');

const AgentSession = require('../models/AgentSession');
const { AgentOrchestrator } = require('../services/agent/agentOrchestrator');

function manualTime() {
  let current = Date.now();
  const timers = new Set();
  return {
    clock: () => new Date(current),
    scheduler: {
      setInterval(callback) {
        const timer = { callback, active: true };
        timers.add(timer);
        return timer;
      },
      clearInterval(timer) {
        timer.active = false;
        timers.delete(timer);
      },
    },
    advance(milliseconds) { current += milliseconds; },
    async heartbeat() {
      [...timers].filter((timer) => timer.active).forEach((timer) => timer.callback());
      await new Promise((resolve) => setImmediate(resolve));
    },
    stop() {
      timers.forEach((timer) => { timer.active = false; });
      timers.clear();
    },
  };
}

function harness(overrides = {}, orchestratorOptions = {}) {
  const store = new Map();
  const claimCalls = { renew: 0 };
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
    async claimAnalysis(id, { fromStates, activeStates = [], to, event, recoveryEvent, toolName, at, token, expiresAt }) {
      const value = store.get(id);
      const expired = value && (!value.analysisClaimExpiresAt || new Date(value.analysisClaimExpiresAt) <= new Date(at));
      if (!value || (!fromStates.includes(value.state) && !(activeStates.includes(value.state) && expired))) return null;
      const claimed = structuredClone(value);
      const from = claimed.state;
      claimed.state = to;
      claimed.analysisClaimToken = token;
      claimed.analysisClaimExpiresAt = expiresAt;
      claimed.transitions.push({ from, to, event: activeStates.includes(from) ? recoveryEvent : event, toolName, at });
      store.set(id, structuredClone(claimed));
      return structuredClone(claimed);
    },
    async saveAnalysis(value, token, { clearClaim = false } = {}) {
      const stored = store.get(value.id);
      if (!stored || stored.analysisClaimToken !== token) throw new Error('AGENT_ANALYSIS_CLAIM_LOST');
      const saved = structuredClone(value);
      if (clearClaim) {
        delete saved.analysisClaimToken;
        delete saved.analysisClaimExpiresAt;
      }
      store.set(value.id, structuredClone(saved));
      return structuredClone(saved);
    },
    async renewAnalysisClaim(id, token, expiresAt) {
      claimCalls.renew += 1;
      const stored = store.get(id);
      if (!stored || stored.analysisClaimToken !== token) return null;
      stored.analysisClaimExpiresAt = expiresAt;
      store.set(id, structuredClone(stored));
      return structuredClone(stored);
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
  return { app: new AgentOrchestrator({ repository, tools, ...orchestratorOptions }), repository, calls, claimCalls };
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

test('Mongoose persists analysis claim ownership and expiry', () => {
  const expiresAt = new Date(Date.now() + 60_000);
  const session = new AgentSession({
    userId: 'user-1',
    analysisClaimToken: 'claim-token',
    analysisClaimExpiresAt: expiresAt,
  });

  assert.equal(session.validateSync(), undefined);
  const serialized = session.toObject();
  assert.equal(serialized.analysisClaimToken, 'claim-token');
  assert.equal(serialized.analysisClaimExpiresAt.toISOString(), expiresAt.toISOString());
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

test('overlapping analysis starts atomically claim one tool run without overwriting tasks', async () => {
  let releaseParsing;
  const parsingGate = new Promise((resolve) => { releaseParsing = resolve; });
  const calls = { parseJD: 0, parseResume: 0, matchEvidence: 0 };
  const { app, repository } = harness({
    parseJD: async () => {
      calls.parseJD += 1;
      await parsingGate;
      return { requirements: [{ id: 'req-1' }] };
    },
    parseResume: async () => {
      calls.parseResume += 1;
      await parsingGate;
      return { facts: [{ id: 'fact-1', confirmation: 'confirmed' }] };
    },
    matchEvidence: async () => {
      calls.matchEvidence += 1;
      return { matches: [{ requirementId: `req-${calls.matchEvidence}`, factIds: ['fact-1'], gapType: 'expression', priority: 10 }] };
    },
  });
  const created = await app.createSession({ userId: 'user-1', jdText: 'JD', resumeText: 'Resume' });

  const first = app.startAnalysis(created.id);
  const second = app.startAnalysis(created.id);
  await new Promise((resolve) => setImmediate(resolve));
  assert.deepEqual(calls, { parseJD: 1, parseResume: 1, matchEvidence: 0 });

  releaseParsing();
  await Promise.all([first, second]);
  const completed = await repository.get(created.id);

  assert.deepEqual(calls, { parseJD: 1, parseResume: 1, matchEvidence: 1 });
  assert.equal(completed.state, 'evidence_ready');
  assert.equal(completed.tasks[0].requirementId, 'req-1');
  assert.deepEqual(completed.transitions.map(({ from, to }) => ({ from, to })), [
    { from: 'draft', to: 'parsing' },
    { from: 'parsing', to: 'matching' },
    { from: 'matching', to: 'evidence_ready' },
  ]);
});

test('a live analysis lease cannot be stolen and does not run tools', async () => {
  const { app, repository, calls } = harness();
  const created = await app.createSession({ userId: 'user-1', jdText: 'JD', resumeText: 'Resume' });
  created.state = 'parsing';
  created.analysisClaimToken = 'live-owner';
  created.analysisClaimExpiresAt = new Date(Date.now() + 60_000);
  created.transitions.push({ from: 'draft', to: 'parsing', event: 'ANALYSIS_STARTED', toolName: '', at: new Date().toISOString() });
  await repository.save(created);

  const active = await app.startAnalysis(created.id);

  assert.equal(active.state, 'parsing');
  assert.equal(active.analysisClaimToken, 'live-owner');
  assert.deepEqual(calls, { parseJD: 0, parseResume: 0, matchEvidence: 0 });
});

test('expired or legacy active analysis claims can be atomically recovered', async (t) => {
  for (const state of ['parsing', 'matching']) {
    await t.test(state, async () => {
      const { app, repository, calls } = harness();
      const created = await app.createSession({ userId: 'user-1', jdText: 'JD', resumeText: 'Resume' });
      created.state = state;
      if (state === 'parsing') {
        created.analysisClaimToken = 'expired-owner';
        created.analysisClaimExpiresAt = new Date(Date.now() - 1_000);
      }
      created.transitions.push({ from: 'draft', to: state, event: 'INTERRUPTED_ANALYSIS', toolName: '', at: new Date().toISOString() });
      await repository.save(created);

      const ready = await app.startAnalysis(created.id);

      assert.equal(ready.state, 'evidence_ready');
      assert.equal(ready.analysisClaimToken, undefined);
      assert.equal(ready.analysisClaimExpiresAt, undefined);
      assert.deepEqual(calls, { parseJD: 1, parseResume: 1, matchEvidence: 1 });
      assert.deepEqual(ready.transitions.slice(1).map(({ from, to, event }) => ({ from, to, event })), [
        { from: state, to: 'parsing', event: 'ANALYSIS_RECOVERED' },
        { from: 'parsing', to: 'matching', event: 'INPUT_PARSED' },
        { from: 'matching', to: 'evidence_ready', event: 'TASKS_CREATED' },
      ]);
    });
  }
});

test('an expired analysis owner cannot overwrite a newer completed claim', async () => {
  let releaseOldOwner;
  const oldOwnerGate = new Promise((resolve) => { releaseOldOwner = resolve; });
  let jdCalls = 0;
  let resumeCalls = 0;
  const { app, repository } = harness({
    parseJD: async () => {
      const call = ++jdCalls;
      if (call === 1) await oldOwnerGate;
      return { requirements: [{ id: call === 1 ? 'req-old' : 'req-new' }] };
    },
    parseResume: async () => {
      const call = ++resumeCalls;
      if (call === 1) await oldOwnerGate;
      return { facts: [{ id: 'fact-1', confirmation: 'confirmed' }] };
    },
    matchEvidence: async ({ requirements }) => ({
      matches: [{ requirementId: requirements[0].id, factIds: ['fact-1'], gapType: 'expression', priority: 10 }],
    }),
  });
  const created = await app.createSession({ userId: 'user-1', jdText: 'JD', resumeText: 'Resume' });
  const oldStart = app.startAnalysis(created.id);
  await new Promise((resolve) => setImmediate(resolve));

  const active = await repository.get(created.id);
  active.analysisClaimExpiresAt = new Date(Date.now() - 1_000);
  await repository.save(active);
  const recovered = await app.startAnalysis(created.id);
  assert.equal(recovered.tasks[0].requirementId, 'req-new');

  releaseOldOwner();
  await assert.rejects(oldStart, /AGENT_ANALYSIS_CLAIM_LOST/);
  const completed = await repository.get(created.id);
  assert.equal(completed.tasks[0].requirementId, 'req-new');
  assert.equal(completed.state, 'evidence_ready');
});

test('heartbeat renewal keeps an unresolved live analysis from being stolen', async () => {
  const time = manualTime();
  let releaseParsing;
  const parsingGate = new Promise((resolve) => { releaseParsing = resolve; });
  const calls = { parseJD: 0, parseResume: 0 };
  const { app, claimCalls } = harness({
    parseJD: async () => { calls.parseJD += 1; await parsingGate; return { requirements: [{ id: 'req-1' }] }; },
    parseResume: async () => { calls.parseResume += 1; await parsingGate; return { facts: [{ id: 'fact-1', confirmation: 'confirmed' }] }; },
  }, {
    analysisLeaseMs: 100,
    analysisHeartbeatMs: 20,
    clock: time.clock,
    scheduler: time.scheduler,
  });
  const created = await app.createSession({ userId: 'user-1', jdText: 'JD', resumeText: 'Resume' });

  const first = app.startAnalysis(created.id);
  await new Promise((resolve) => setImmediate(resolve));
  time.advance(150);
  await time.heartbeat();
  const overlapping = await app.startAnalysis(created.id);

  assert.equal(overlapping.state, 'parsing');
  assert.deepEqual(calls, { parseJD: 1, parseResume: 1 });
  assert.equal(claimCalls.renew, 1);
  releaseParsing();
  const completed = await first;
  assert.equal(completed.state, 'evidence_ready');
});

test('stopped heartbeat allows an expired analysis to be recovered', async () => {
  const time = manualTime();
  let releaseOldOwner;
  const oldOwnerGate = new Promise((resolve) => { releaseOldOwner = resolve; });
  let jdCalls = 0;
  const { app } = harness({
    parseJD: async () => {
      const call = ++jdCalls;
      if (call === 1) await oldOwnerGate;
      return { requirements: [{ id: call === 1 ? 'req-old' : 'req-new' }] };
    },
    parseResume: async () => ({ facts: [{ id: 'fact-1', confirmation: 'confirmed' }] }),
    matchEvidence: async ({ requirements }) => ({
      matches: [{ requirementId: requirements[0].id, factIds: ['fact-1'], gapType: 'expression', priority: 10 }],
    }),
  }, {
    analysisLeaseMs: 100,
    analysisHeartbeatMs: 20,
    clock: time.clock,
    scheduler: time.scheduler,
  });
  const created = await app.createSession({ userId: 'user-1', jdText: 'JD', resumeText: 'Resume' });
  const oldStart = app.startAnalysis(created.id);
  await new Promise((resolve) => setImmediate(resolve));

  time.stop();
  time.advance(150);
  const recovered = await app.startAnalysis(created.id);

  assert.equal(recovered.tasks[0].requirementId, 'req-new');
  releaseOldOwner();
  await assert.rejects(oldStart, /AGENT_ANALYSIS_CLAIM_LOST/);
});

test('lost heartbeat ownership prevents the old worker from launching matching or saving', async () => {
  const time = manualTime();
  let releaseParsing;
  const parsingGate = new Promise((resolve) => { releaseParsing = resolve; });
  let matchCalls = 0;
  const { app, repository } = harness({
    parseJD: async () => { await parsingGate; return { requirements: [{ id: 'req-old' }] }; },
    parseResume: async () => { await parsingGate; return { facts: [{ id: 'fact-1', confirmation: 'confirmed' }] }; },
    matchEvidence: async () => { matchCalls += 1; return { matches: [] }; },
  }, {
    analysisLeaseMs: 100,
    analysisHeartbeatMs: 20,
    clock: time.clock,
    scheduler: time.scheduler,
  });
  const created = await app.createSession({ userId: 'user-1', jdText: 'JD', resumeText: 'Resume' });
  const oldStart = app.startAnalysis(created.id);
  await new Promise((resolve) => setImmediate(resolve));

  const oldClaim = await repository.get(created.id);
  time.advance(150);
  const newerClaim = await repository.claimAnalysis(created.id, {
    fromStates: ['draft', 'parsing_failed', 'matching_failed'],
    activeStates: ['parsing', 'matching'],
    to: 'parsing',
    event: 'ANALYSIS_STARTED',
    recoveryEvent: 'ANALYSIS_RECOVERED',
    toolName: '',
    at: time.clock().toISOString(),
    token: 'new-owner',
    expiresAt: new Date(time.clock().getTime() + 100),
  });
  assert.notEqual(newerClaim.analysisClaimToken, oldClaim.analysisClaimToken);
  await time.heartbeat();
  releaseParsing();

  await assert.rejects(oldStart, /AGENT_ANALYSIS_CLAIM_LOST/);
  assert.equal(matchCalls, 0);
  const stored = await repository.get(created.id);
  assert.equal(stored.analysisClaimToken, 'new-owner');
  assert.equal(stored.state, 'parsing');
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
  assert.equal(failed.analysisClaimToken, undefined);
  assert.equal(failed.analysisClaimExpiresAt, undefined);
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
  assert.equal(failed.analysisClaimToken, undefined);
  assert.equal(failed.analysisClaimExpiresAt, undefined);
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
