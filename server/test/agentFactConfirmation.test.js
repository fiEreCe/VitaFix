const test = require('node:test');
const assert = require('node:assert/strict');
const { AgentOrchestrator } = require('../services/agent/agentOrchestrator');

function inMemoryRepository(initial = []) {
  const store = new Map(initial.map((session) => [session.id, structuredClone(session)]));
  return {
    store,
    async create(value) {
      store.set(value.id, structuredClone(value));
      return structuredClone(store.get(value.id));
    },
    async get(id, userId) {
      const value = store.get(id);
      return value?.userId === userId ? structuredClone(value) : null;
    },
    async save(value, userId) {
      assert.equal(value.userId, userId);
      store.set(value.id, structuredClone(value));
      return structuredClone(store.get(value.id));
    },
    async claimAnalysis(id, userId, claim) {
      const value = store.get(id);
      if (!value || value.userId !== userId || !claim.fromStates.includes(value.state)) return null;
      const from = value.state;
      value.state = claim.to;
      value.analysisClaimToken = claim.token;
      value.analysisClaimExpiresAt = claim.expiresAt;
      value.transitions.push({ from, to: claim.to, event: claim.event, toolName: claim.toolName, at: claim.at });
      store.set(id, structuredClone(value));
      return structuredClone(value);
    },
    async renewAnalysisClaim(id, userId, token, expiresAt) {
      const value = store.get(id);
      if (!value || value.userId !== userId || value.analysisClaimToken !== token) return null;
      value.analysisClaimExpiresAt = expiresAt;
      store.set(id, structuredClone(value));
      return structuredClone(value);
    },
    async saveAnalysis(value, userId, token, { clearClaim = false } = {}) {
      const stored = store.get(value.id);
      if (!stored || stored.userId !== userId || stored.analysisClaimToken !== token) {
        throw new Error('AGENT_ANALYSIS_CLAIM_LOST');
      }
      const saved = structuredClone(value);
      if (clearClaim) {
        delete saved.analysisClaimToken;
        delete saved.analysisClaimExpiresAt;
      }
      store.set(value.id, saved);
      return structuredClone(store.get(value.id));
    },
  };
}

function makeTools(overrides = {}) {
  const calls = { draft: [], verify: 0 };
  return {
    calls,
    tools: {
      parseJD: async () => ({ requirements: [{ id: 'req-1', sourceText: '用户研究', priority: 1 }] }),
      parseResume: async () => ({
        facts: [{
          id: 'fact-1',
          sourceText: '参与校园产品用户访谈',
          action: '参与用户访谈',
          context: '校园产品',
          contribution: '团队共同完成',
          method: '半结构化访谈',
          result: '输出用户洞察',
          confirmation: 'pending_confirmation',
          confirmationSource: 'auto',
          source: 'resume',
        }],
      }),
      matchEvidence: async () => ({
        matches: [{ requirementId: 'req-1', factIds: ['fact-1'], gapType: 'expression', priority: 1 }],
      }),
      draftRevision: async ({ facts }) => {
        calls.draft.push(structuredClone(facts));
        return {
          text: facts.map((fact) => fact.action).join('；'),
          factRefs: facts.map((fact) => fact.id),
          requirementRefs: ['req-1'],
        };
      },
      verifyRevision: async ({ candidate }) => {
        calls.verify += 1;
        return { status: 'passed', findings: [], factRefs: candidate.factRefs };
      },
      ...overrides,
    },
  };
}

function seededSession({ taskIds = ['f1'], fact = null } = {}) {
  return {
    id: 'session-1',
    userId: 'u1',
    state: 'task_in_progress',
    currentTaskId: 'task-a',
    requirements: [
      { id: 'req-a', sourceText: '具备用户研究能力' },
      { id: 'req-b', sourceText: '具备用户访谈能力' },
    ],
    resumeFacts: [fact || {
      id: 'f1',
      sourceText: '参与校园产品用户访谈',
      action: '参与用户访谈',
      context: '校园产品',
      contribution: '团队共同完成',
      method: '半结构化访谈',
      result: '输出用户洞察',
      confirmation: 'confirmed',
      confirmationSource: 'user',
      source: 'resume',
    }],
    tasks: [
      { id: 'task-a', requirementId: 'req-a', factIds: [...taskIds], state: 'questioning', effectiveRounds: 0, clarificationUsed: false },
      { id: 'task-b', requirementId: 'req-b', factIds: ['f1'], state: 'pending', effectiveRounds: 0, clarificationUsed: false },
    ],
    transitions: [],
  };
}

test('auto-parsed facts stay pending and cannot generate a candidate before user confirmation', async () => {
  const repository = inMemoryRepository();
  const { tools, calls } = makeTools();
  const app = new AgentOrchestrator({ repository, tools });
  const created = await app.createSession({ userId: 'u1', jdText: 'JD', resumeText: '简历' });
  const ready = await app.startAnalysis(created.id, 'u1');

  const fact = ready.resumeFacts.find((item) => item.id === 'fact-1');
  assert.equal(fact.confirmation, 'pending_confirmation');
  assert.equal(fact.confirmationSource, 'auto');

  const selected = await app.selectTask(created.id, 'u1', ready.tasks[0].id);
  assert.equal(selected.tasks[0].state, 'awaiting_fact_confirmation');
  assert.equal(selected.tasks[0].pendingFactId, 'fact-1');

  const blocked = await app.generateCandidate(created.id, 'u1', ready.tasks[0].id);
  assert.equal(blocked.tasks[0].state, 'awaiting_fact_confirmation');
  assert.equal(calls.draft.length, 0, 'unconfirmed facts must not reach draft generation');

  const reviewed = await app.reviewFact(created.id, 'u1', ready.tasks[0].id, 'fact-1', 'confirm');
  assert.equal(reviewed.tasks[0].state, 'generating');
  assert.equal(reviewed.tasks[0].pendingFactId, '');
  assert.equal(reviewed.resumeFacts[0].confirmation, 'confirmed');
  assert.equal(reviewed.resumeFacts[0].confirmationSource, 'user');

  const generated = await app.generateCandidate(created.id, 'u1', ready.tasks[0].id);
  assert.equal(generated.tasks[0].state, 'awaiting_user_decision');
  assert.deepEqual(generated.tasks[0].candidate.factRefs, ['fact-1']);
  assert.equal(calls.draft.length, 1);
  assert.deepEqual(calls.draft[0].map((item) => item.id), ['fact-1']);
});

test('multiple pending facts keep the review entry until every fact is reviewed', async () => {
  const repository = inMemoryRepository();
  const { tools, calls } = makeTools({
    parseResume: async () => ({
      facts: [
        { id: 'fact-1', sourceText: '参与用户访谈', action: '参与用户访谈', context: '校园产品', contribution: '团队共同完成', method: '访谈', result: '洞察', confirmation: 'pending_confirmation', confirmationSource: 'auto' },
        { id: 'fact-2', sourceText: '整理访谈记录', action: '整理访谈记录', context: '校园产品', contribution: '本人负责', method: '主题归纳', result: '需求清单', confirmation: 'pending_confirmation', confirmationSource: 'auto' },
      ],
    }),
    matchEvidence: async () => ({
      matches: [{ requirementId: 'req-1', factIds: ['fact-1', 'fact-2'], gapType: 'expression', priority: 1 }],
    }),
  });
  const app = new AgentOrchestrator({ repository, tools });
  const created = await app.createSession({ userId: 'u1', jdText: 'JD', resumeText: '简历' });
  const ready = await app.startAnalysis(created.id, 'u1');
  const taskId = ready.tasks[0].id;

  const selected = await app.selectTask(created.id, 'u1', taskId);
  assert.equal(selected.tasks[0].pendingFactId, 'fact-1');

  const first = await app.reviewFact(created.id, 'u1', taskId, 'fact-1', 'confirm');
  assert.equal(first.tasks[0].state, 'awaiting_fact_confirmation');
  assert.equal(first.tasks[0].pendingFactId, 'fact-2');
  assert.equal(calls.draft.length, 0);

  const second = await app.reviewFact(created.id, 'u1', taskId, 'fact-2', 'confirm');
  assert.equal(second.tasks[0].state, 'generating');
  assert.equal(second.tasks[0].pendingFactId, '');
  assert.deepEqual(
    second.resumeFacts.map((fact) => [fact.id, fact.confirmation]),
    [['fact-1', 'confirmed'], ['fact-2', 'confirmed']],
  );
});

test('correcting a pending fact keeps the original record and uses the corrected version for this task only', async () => {
  const seed = seededSession({
    taskIds: ['fact-1'],
    fact: {
      id: 'fact-1',
      sourceText: '参与校园产品用户访谈',
      action: '参与用户访谈',
      context: '校园产品',
      contribution: '团队共同完成',
      confirmation: 'pending_confirmation',
      confirmationSource: 'auto',
      source: 'resume',
    },
  });
  const repository = inMemoryRepository([seed]);
  const { tools, calls } = makeTools();
  const app = new AgentOrchestrator({ repository, tools });

  await app.selectTask('session-1', 'u1', 'task-a');
  const correctedResult = await app.reviewFact('session-1', 'u1', 'task-a', 'fact-1', 'correct', {
    action: '独立设计访谈提纲并访谈 8 位用户',
    method: '半结构化访谈',
    result: '输出用户洞察',
  });

  const original = correctedResult.resumeFacts.find((fact) => fact.id === 'fact-1');
  const corrected = correctedResult.resumeFacts.find((fact) => fact.confirmation === 'corrected');
  assert.equal(original.action, '参与用户访谈', 'original content must be preserved');
  assert.equal(original.confirmation, 'pending_confirmation');
  assert.equal(corrected.originalFactId, 'fact-1');
  assert.equal(corrected.confirmationSource, 'user');
  assert.ok(correctedResult.tasks[0].factIds.includes(corrected.id));
  assert.ok(!correctedResult.tasks[0].factIds.includes('fact-1'));
  assert.equal(correctedResult.tasks[0].state, 'generating');

  const generated = await app.generateCandidate('session-1', 'u1', 'task-a');
  assert.deepEqual(generated.tasks[0].candidate.factRefs, [corrected.id]);
  assert.equal(calls.draft[0][0].action, '独立设计访谈提纲并访谈 8 位用户');
});

test('confirming a supplemental fact for task A removes only A base reference and keeps task B evidence valid', async () => {
  const seed = seededSession();
  const repository = inMemoryRepository([seed]);
  const before = await repository.get('session-1', 'u1');
  const taskBBefore = structuredClone(before.tasks[1]);
  const { tools, calls } = makeTools({
    assessAnswer: async () => ({
      quality: 'relevant',
      factPatch: {
        action: '独立设计访谈提纲',
        context: '校园交易用户',
        contribution: '本人负责提纲设计和访谈执行',
        method: '半结构化访谈',
        result: '输出 8 位用户洞察',
        quantity: '8',
        quantityType: 'exact',
      },
      missingFields: [],
      questionHint: '',
    }),
  });
  const app = new AgentOrchestrator({ repository, tools });

  const answered = await app.submitAnswer('session-1', 'u1', 'task-a', '我独立设计了访谈提纲');
  const pendingId = answered.tasks[0].pendingFactId;
  assert.equal(answered.tasks[0].pendingBaseFactId, 'f1');
  assert.deepEqual(answered.tasks[0].factIds, ['f1', pendingId]);
  assert.ok(answered.resumeFacts.find((fact) => fact.id === pendingId).baseFactId === 'f1');

  const reviewed = await app.reviewFact('session-1', 'u1', 'task-a', pendingId, 'confirm');
  assert.deepEqual(reviewed.tasks[0].factIds, [pendingId], 'task A now uses the supplemental fact only');
  assert.equal(reviewed.tasks[0].pendingFactId, '');
  assert.equal(reviewed.tasks[0].pendingBaseFactId, '');
  assert.equal(reviewed.resumeFacts.find((fact) => fact.id === 'f1').confirmation, 'confirmed');
  assert.deepEqual(reviewed.tasks[1], taskBBefore, 'task B must not change');

  const generatedA = await app.generateCandidate('session-1', 'u1', 'task-a');
  assert.deepEqual(generatedA.tasks[0].candidate.factRefs, [pendingId]);

  await app.selectTask('session-1', 'u1', 'task-b');
  const generatedB = await app.generateCandidate('session-1', 'u1', 'task-b');
  assert.deepEqual(generatedB.tasks[1].candidate.factRefs, ['f1']);
  assert.deepEqual(calls.draft.at(-1).map((fact) => fact.id), ['f1']);
});

test('rejecting a supplemental fact keeps the still-valid base evidence usable', async () => {
  const repository = inMemoryRepository([seededSession()]);
  const { tools, calls } = makeTools({
    assessAnswer: async () => ({
      quality: 'partial',
      factPatch: { action: '参与用户访谈（补充）' },
      missingFields: ['result'],
      questionHint: '最终形成了什么结果？',
    }),
  });
  const app = new AgentOrchestrator({ repository, tools });

  const answered = await app.submitAnswer('session-1', 'u1', 'task-a', '我还参与了用户访谈');
  const pendingId = answered.tasks[0].pendingFactId;

  const rejected = await app.reviewFact('session-1', 'u1', 'task-a', pendingId, 'reject');
  assert.deepEqual(rejected.tasks[0].factIds, ['f1']);
  assert.equal(rejected.tasks[0].pendingFactId, '');
  assert.equal(rejected.resumeFacts.find((fact) => fact.id === pendingId).confirmation, 'rejected');
  assert.equal(rejected.resumeFacts.find((fact) => fact.id === 'f1').confirmation, 'confirmed');
  assert.equal(rejected.tasks[0].state, 'generating');

  const generated = await app.generateCandidate('session-1', 'u1', 'task-a');
  assert.deepEqual(generated.tasks[0].candidate.factRefs, ['f1']);
  assert.deepEqual(calls.draft.at(-1).map((fact) => fact.id), ['f1']);
});

test('pending review state, references, and confirmation results survive a repository reload', async () => {
  const repository = inMemoryRepository([seededSession()]);
  const { tools } = makeTools({
    assessAnswer: async () => ({
      quality: 'relevant',
      factPatch: {
        action: '独立设计访谈提纲',
        context: '校园交易用户',
        contribution: '本人负责',
        method: '半结构化访谈',
        result: '输出洞察',
      },
      missingFields: [],
      questionHint: '',
    }),
  });
  const firstApp = new AgentOrchestrator({ repository, tools });
  const answered = await firstApp.submitAnswer('session-1', 'u1', 'task-a', '我独立设计并执行了访谈');
  const pendingId = answered.tasks[0].pendingFactId;

  // 模拟刷新：重新从仓储读取会话，并用新的 orchestrator 继续处理。
  const reloaded = await repository.get('session-1', 'u1');
  assert.equal(reloaded.tasks[0].state, 'awaiting_fact_confirmation');
  assert.equal(reloaded.tasks[0].pendingFactId, pendingId);
  assert.equal(reloaded.tasks[0].pendingBaseFactId, 'f1');
  assert.equal(reloaded.resumeFacts.find((fact) => fact.id === pendingId).confirmation, 'pending_confirmation');

  const secondApp = new AgentOrchestrator({ repository, tools });
  const reviewed = await secondApp.reviewFact('session-1', 'u1', 'task-a', pendingId, 'confirm');
  const persisted = await repository.get('session-1', 'u1');
  assert.equal(persisted.tasks[0].pendingFactId, '');
  assert.deepEqual(persisted.tasks[0].factIds, [pendingId]);
  assert.equal(persisted.resumeFacts.find((fact) => fact.id === pendingId).confirmation, 'confirmed');
  assert.equal(persisted.resumeFacts.find((fact) => fact.id === pendingId).confirmationSource, 'user');
  assert.equal(reviewed.tasks[0].state, 'generating');
});

test('fact review rejects another user and facts that the task does not reference', async () => {
  const seed = seededSession({
    fact: {
      id: 'f1',
      sourceText: '参与校园产品用户访谈',
      action: '参与用户访谈',
      context: '校园产品',
      contribution: '团队共同完成',
      confirmation: 'pending_confirmation',
      confirmationSource: 'auto',
    },
  });
  seed.resumeFacts.push({
    id: 'f9',
    sourceText: '未被当前任务引用的事实',
    action: '其他工作',
    confirmation: 'pending_confirmation',
    confirmationSource: 'auto',
  });
  const repository = inMemoryRepository([seed]);
  const { tools } = makeTools();
  const app = new AgentOrchestrator({ repository, tools });

  await assert.rejects(
    () => app.reviewFact('session-1', 'u2', 'task-a', 'f1', 'confirm'),
    /AGENT_SESSION_NOT_FOUND/,
  );
  await assert.rejects(
    () => app.reviewFact('session-1', 'u1', 'task-a', 'f9', 'confirm'),
    /AGENT_FACT_NOT_REFERENCED/,
  );
  await assert.rejects(
    () => app.reviewFact('session-1', 'u1', 'task-a', 'missing', 'confirm'),
    /AGENT_FACT_NOT_FOUND/,
  );

  const stored = await repository.get('session-1', 'u1');
  assert.equal(stored.resumeFacts.find((fact) => fact.id === 'f1').confirmation, 'pending_confirmation');
  assert.equal(stored.resumeFacts.find((fact) => fact.id === 'f9').confirmation, 'pending_confirmation');
});

test('adoption cannot bypass an unreviewed fact even when a candidate is already verified', async () => {
  const seed = seededSession();
  seed.tasks[0].state = 'awaiting_user_decision';
  seed.tasks[0].candidate = {
    text: '参与用户访谈',
    factRefs: ['f1'],
    verification: { status: 'passed', findings: [] },
  };
  seed.tasks[0].factIds = ['f1', 'f2'];
  seed.resumeFacts.push({
    id: 'f2',
    sourceText: '补充的访谈事实',
    action: '补充访谈',
    confirmation: 'pending_confirmation',
    confirmationSource: 'auto',
  });
  const repository = inMemoryRepository([seed]);
  const { tools } = makeTools();
  const app = new AgentOrchestrator({ repository, tools });

  await assert.rejects(
    () => app.decide('session-1', 'u1', 'task-a', { type: 'accepted' }),
    /FACT_CONFIRMATION_REQUIRED/,
  );
  const stored = await repository.get('session-1', 'u1');
  assert.equal(stored.tasks[0].state, 'awaiting_user_decision');
  assert.equal(stored.tasks[0].currentText, undefined);
});

test('retry cannot regenerate while a referenced fact is still pending', async () => {
  const seed = seededSession();
  seed.tasks[0].state = 'generation_failed';
  seed.tasks[0].factIds = ['f1', 'f2'];
  seed.resumeFacts.push({
    id: 'f2',
    sourceText: '补充的访谈事实',
    action: '补充访谈',
    confirmation: 'pending_confirmation',
    confirmationSource: 'auto',
    baseFactId: 'f1',
  });
  const repository = inMemoryRepository([seed]);
  const { tools, calls } = makeTools();
  const app = new AgentOrchestrator({ repository, tools });

  const retried = await app.retryCurrentStep('session-1', 'u1', 'task-a');
  assert.equal(retried.tasks[0].state, 'awaiting_fact_confirmation');
  assert.equal(retried.tasks[0].pendingFactId, 'f2');
  assert.equal(calls.draft.length, 0);
});
