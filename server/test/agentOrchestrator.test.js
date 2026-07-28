const test = require('node:test');
const assert = require('node:assert/strict');
const { AgentOrchestrator } = require('../services/agent/agentOrchestrator');

function makeQuestioningHarness(assessments) {
  const store = new Map();
  let assessmentIndex = 0;
  const repository = {
    async get(id, userId) {
      const value = store.get(id);
      return value?.userId === userId ? value : null;
    },
    async save(value, userId) {
      assert.equal(value.userId, userId);
      store.set(value.id, structuredClone(value));
      return store.get(value.id);
    },
  };
  const tools = {
    assessAnswer: async () => assessments[assessmentIndex++],
    draftRevision: async ({ facts }) => ({
      text: facts.map((fact) => fact.sourceText).join('；'),
      factRefs: facts.map((fact) => fact.id),
      requirementRefs: ['r1'],
    }),
    verifyRevision: async ({ candidate }) => ({
      status: 'passed',
      findings: [],
      factRefs: candidate.factRefs,
    }),
  };
  const session = {
    id: 'session-questioning',
    userId: 'u1',
    state: 'task_in_progress',
    requirements: [{ id: 'r1', sourceText: '用户研究' }],
    resumeFacts: [],
    transitions: [],
    tasks: [{
      id: 'task-1',
      requirementId: 'r1',
      factIds: [],
      state: 'questioning',
      effectiveRounds: 0,
      clarificationUsed: false,
    }],
  };
  store.set(session.id, structuredClone(session));
  return {
    app: new AgentOrchestrator({ repository, tools }),
    sessionId: session.id,
  };
}

test('runs a recommended task through fact confirmation and a verified candidate', async () => {
  const store = new Map();
  const repository = { async create(value) { store.set(value.id, structuredClone(value)); return store.get(value.id); }, async get(id, userId) { const value = store.get(id); return value?.userId === userId ? value : null; }, async save(value, userId) { assert.equal(value.userId, userId); store.set(value.id, structuredClone(value)); return store.get(value.id); }, async claimAnalysis(id, userId, claim) { const value = store.get(id); if (!value || value.userId !== userId || !claim.fromStates.includes(value.state)) return null; const from = value.state; value.state = claim.to; value.analysisClaimToken = claim.token; value.analysisClaimExpiresAt = claim.expiresAt; value.transitions.push({ from, to: claim.to, event: claim.event, toolName: claim.toolName, at: claim.at }); return value; }, async renewAnalysisClaim(id, userId, token, expiresAt) { const value = store.get(id); if (!value || value.userId !== userId || value.analysisClaimToken !== token) return null; value.analysisClaimExpiresAt = expiresAt; return value; }, async saveAnalysis(value, userId, token) { const stored = store.get(value.id); if (stored.userId !== userId || stored.analysisClaimToken !== token) throw new Error('AGENT_ANALYSIS_CLAIM_LOST'); delete value.analysisClaimToken; delete value.analysisClaimExpiresAt; store.set(value.id, structuredClone(value)); return store.get(value.id); } };
  const tools = {
    parseJD: async () => ({ requirements: [{ id: 'req-1', sourceText: '具备用户研究能力', priority: 10 }] }),
    parseResume: async () => ({ facts: [{ id: 'fact-1', sourceText: '参与问卷设计', action: '设计问卷', context: '校园交易用户', contribution: '团队共同完成', confirmation: 'confirmed' }] }),
    matchEvidence: async () => ({ matches: [{ requirementId: 'req-1', factIds: ['fact-1'], gapType: 'expression', priority: 10 }] }),
    draftRevision: async () => ({ text: '参与校园交易用户问卷设计', factRefs: ['fact-1'], requirementRefs: ['req-1'], rationaleSummary: '突出真实行动' }),
  };
  const app = new AgentOrchestrator({ repository, tools });
  const created = await app.createSession({ userId: 'u1', jdText: 'JD', resumeText: '简历' });
  const ready = await app.startAnalysis(created.id, 'u1');
  assert.equal(ready.tasks[0].recommended, true);
  await app.selectTask(created.id, 'u1', ready.tasks[0].id);
  const result = await app.generateCandidate(created.id, 'u1', ready.tasks[0].id);
  assert.equal(result.tasks[0].state, 'awaiting_user_decision');
  assert.equal(result.tasks[0].candidate.verification.status, 'passed');
});

test('answer creates a pending fact which requires confirmation', async () => {
  const store = new Map();
  const repository = { async create(value) { store.set(value.id, structuredClone(value)); return store.get(value.id); }, async get(id) { return store.get(id); }, async save(value) { store.set(value.id, structuredClone(value)); return store.get(value.id); } };
  const app = new AgentOrchestrator({ repository, tools: {
    assessAnswer: async () => ({
      quality: 'partial',
      factPatch: { action: '设计访谈提纲' },
      missingFields: ['context', 'contribution'],
      questionHint: '服务什么场景，你负责什么？',
    }),
  } });
  await app.createSession({ userId: 'u1', jdText: 'JD', resumeText: '简历' });
  const session = [...store.values()][0]; session.tasks = [{ id: 'task-1', factIds: [], state: 'questioning', effectiveRounds: 0, clarificationUsed: false }];
  await app.submitAnswer(session.id, 'u1', 'task-1', '我独立设计了校园用户访谈提纲');
  const updated = await repository.get(session.id);
  assert.equal(updated.resumeFacts.at(-1).confirmation, 'pending_confirmation');
  assert.equal(updated.tasks[0].state, 'awaiting_fact_confirmation');
});

test('confirmed structured answer becomes sufficient and can generate a candidate', async () => {
  const h = makeQuestioningHarness([{
    quality: 'relevant',
    factPatch: {
      action: '设计访谈提纲',
      context: '校园产品',
      contribution: '本人负责提纲设计',
      method: '半结构化访谈',
      result: '整理用户反馈',
      quantity: '',
      quantityType: 'exact',
    },
    missingFields: [],
    questionHint: '',
  }]);

  const answered = await h.app.submitAnswer(
    h.sessionId, 'u1', 'task-1', '我为校园产品设计访谈提纲并整理反馈',
  );
  const reviewed = await h.app.reviewFact(
    h.sessionId, 'u1', 'task-1', answered.tasks[0].pendingFactId, 'confirm',
  );
  assert.equal(reviewed.tasks[0].sufficiency, 'strong');
  assert.equal(reviewed.tasks[0].state, 'generating');

  const generated = await h.app.generateCandidate(h.sessionId, 'u1', 'task-1');
  assert.equal(generated.tasks[0].state, 'awaiting_user_decision');
});

test('off-topic answer clarifies once without consuming a round or creating a fact', async () => {
  const assessment = {
    quality: 'off_topic',
    factPatch: {},
    missingFields: ['contribution'],
    questionHint: '请说明你本人负责的部分',
  };
  const h = makeQuestioningHarness([assessment, assessment]);

  const first = await h.app.submitAnswer(h.sessionId, 'u1', 'task-1', '公司规模很大');
  assert.equal(first.tasks[0].effectiveRounds, 0);
  assert.equal(first.tasks[0].clarificationUsed, true);
  assert.equal(first.tasks[0].currentQuestion, assessment.questionHint);
  assert.equal(first.tasks[0].state, 'questioning');

  const second = await h.app.submitAnswer(h.sessionId, 'u1', 'task-1', '福利也很好');
  assert.equal(second.tasks[0].state, 'return_control');
  assert.equal(second.resumeFacts.length, 0);
});

test('later answer merges missing fields with the confirmed base fact', async () => {
  const h = makeQuestioningHarness([
    {
      quality: 'partial',
      factPatch: { action: '设计访谈提纲' },
      missingFields: ['context', 'contribution'],
      questionHint: '服务什么场景，你负责什么？',
    },
    {
      quality: 'relevant',
      factPatch: { context: '校园产品', contribution: '本人负责提纲设计' },
      missingFields: [],
      questionHint: '',
    },
  ]);

  const first = await h.app.submitAnswer(h.sessionId, 'u1', 'task-1', '设计访谈提纲');
  const firstReviewed = await h.app.reviewFact(
    h.sessionId, 'u1', 'task-1', first.tasks[0].pendingFactId, 'confirm',
  );
  assert.equal(firstReviewed.tasks[0].state, 'questioning');

  const second = await h.app.submitAnswer(
    h.sessionId, 'u1', 'task-1', '校园产品，由我负责提纲设计',
  );
  const reviewed = await h.app.reviewFact(
    h.sessionId, 'u1', 'task-1', second.tasks[0].pendingFactId, 'confirm',
  );
  assert.equal(reviewed.tasks[0].sufficiency, 'basic');
  assert.equal(reviewed.tasks[0].state, 'generating');
  assert.equal(reviewed.tasks[0].factIds.length, 1);
});

test('assessment failure preserves the answer and confirmed facts for retry', async () => {
  const h = makeQuestioningHarness([]);
  let attempts = 0;
  h.app.tools.assessAnswer = async () => {
    attempts += 1;
    if (attempts === 1) throw new Error('timeout');
    return {
      quality: 'partial',
      factPatch: { action: '设计访谈提纲' },
      missingFields: ['context', 'contribution'],
      questionHint: '服务什么场景，你负责什么？',
    };
  };

  const failed = await h.app.submitAnswer(
    h.sessionId, 'u1', 'task-1', '我设计了访谈提纲',
  );

  assert.equal(failed.tasks[0].state, 'question_failed');
  assert.equal(failed.tasks[0].pendingAnswer, '我设计了访谈提纲');
  assert.equal(failed.tasks[0].effectiveRounds, 0);
  assert.equal(failed.resumeFacts.length, 0);

  const retried = await h.app.retryCurrentStep(h.sessionId, 'u1', 'task-1');
  assert.equal(retried.tasks[0].state, 'awaiting_fact_confirmation');
  assert.equal(retried.tasks[0].effectiveRounds, 1);
  assert.equal(retried.resumeFacts[0].sourceText, '我设计了访谈提纲');
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
  const result = await app.generateCandidate(session.id, 'u1', 'task-1');
  assert.equal(result.tasks[0].state, 'awaiting_user_decision');
  assert.equal(result.tasks[0].repairAttempts, 1);
});

test('preserves the task and retries when evaluation is unavailable', async () => {
  const store = new Map(); let drafts = 0;
  const repository = { async create(v) { store.set(v.id, structuredClone(v)); return store.get(v.id); }, async get(id) { return store.get(id); }, async save(v) { store.set(v.id, structuredClone(v)); return store.get(v.id); } };
  const app = new AgentOrchestrator({ repository, tools: { draftRevision: async () => (++drafts < 3 ? { text: '', factRefs: [] } : { text: '参与用户访谈', factRefs: ['fact-1'] }) } });
  const session = await app.createSession({ userId: 'u1', jdText: 'JD', resumeText: 'resume' });
  session.requirements = [{ id: 'req-1', sourceText: '用户研究' }]; session.resumeFacts = [{ id: 'fact-1', sourceText: '参与访谈', action: '参与访谈', context: '用户', contribution: '团队共同完成', confirmation: 'confirmed' }]; session.tasks = [{ id: 'task-1', requirementId: 'req-1', factIds: ['fact-1'], state: 'generating', effectiveRounds: 0 }];
  const failed = await app.generateCandidate(session.id, 'u1', 'task-1');
  assert.equal(failed.tasks[0].state, 'verification_failed');
  assert.equal(failed.tasks[0].candidate.verification.status, 'unavailable');
  const retried = await app.retryCurrentStep(session.id, 'u1', 'task-1');
  assert.equal(retried.tasks[0].state, 'awaiting_user_decision');
  assert.equal(retried.tasks[0].retryCount, 1);
});

test('semantic audit retry preserves the generated candidate and only reruns audit', async () => {
  const store = new Map();
  let draftCalls = 0;
  let auditCalls = 0;
  let auditAvailable = false;
  const repository = {
    async create(value) {
      store.set(value.id, structuredClone(value));
      return store.get(value.id);
    },
    async get(id) { return store.get(id); },
    async save(value) {
      store.set(value.id, structuredClone(value));
      return store.get(value.id);
    },
  };
  const app = new AgentOrchestrator({
    repository,
    tools: {
      draftRevision: async () => {
        draftCalls += 1;
        return { text: '参与用户访谈并整理反馈', factRefs: ['f1'] };
      },
      verifyRevision: async ({ candidate }) => {
        auditCalls += 1;
        if (!auditAvailable) {
          return {
            status: 'unavailable',
            findings: [{ type: 'semantic_audit_unavailable' }],
            factRefs: candidate.factRefs,
          };
        }
        return { status: 'passed', findings: [], factRefs: candidate.factRefs };
      },
    },
  });
  const session = await app.createSession({
    userId: 'u1',
    jdText: 'JD',
    resumeText: 'resume',
  });
  session.requirements = [{ id: 'r1', sourceText: '用户研究' }];
  session.resumeFacts = [{
    id: 'f1',
    sourceText: '参与用户访谈并整理反馈',
    action: '参与用户访谈',
    context: '校园产品',
    contribution: '团队共同完成',
    confirmation: 'confirmed',
  }];
  session.tasks = [{
    id: 'task-1',
    requirementId: 'r1',
    factIds: ['f1'],
    state: 'generating',
    effectiveRounds: 0,
  }];

  const failed = await app.generateCandidate(session.id, 'u1', 'task-1');
  assert.equal(failed.tasks[0].state, 'verification_failed');
  assert.equal(failed.tasks[0].candidate.text, '参与用户访谈并整理反馈');
  assert.equal(draftCalls, 1);
  assert.equal(auditCalls, 1);

  auditAvailable = true;
  const retried = await app.retryCurrentStep(session.id, 'u1', 'task-1');
  assert.equal(retried.tasks[0].state, 'awaiting_user_decision');
  assert.equal(draftCalls, 1);
  assert.equal(auditCalls, 2);
  assert.deepEqual(retried.tasks[0].factIds, ['f1']);
});

test('never adopts a blocked or unreviewed AI candidate', async () => {
  const store = new Map();
  const repository = { async create(v) { store.set(v.id, structuredClone(v)); return store.get(v.id); }, async get(id) { return store.get(id); }, async save(v) { store.set(v.id, structuredClone(v)); return store.get(v.id); } };
  const app = new AgentOrchestrator({ repository, tools: {} });
  const session = await app.createSession({ userId: 'u1', jdText: 'JD', resumeText: 'resume' });
  session.tasks = [{ id: 'task-1', factIds: [], state: 'generation_failed', candidate: { text: 'unsafe', verification: { status: 'blocked' } } }];
  await assert.rejects(() => app.decide(session.id, 'u1', 'task-1', { type: 'accepted' }), /CANDIDATE_NOT_ADOPTABLE/);
});

function makeValidationHarness(judgeResult) {
  const session = {
    id: 's1',
    userId: 'u1',
    state: 'task_in_progress',
    transitions: [],
    requirements: [{ id: 'r1', sourceText: '用户研究' }],
    resumeFacts: [{
      id: 'f1',
      sourceText: '参与用户访谈并整理反馈',
      confirmation: 'confirmed',
    }],
    tasks: [{
      id: 't1',
      requirementId: 'r1',
      factIds: ['f1'],
      state: 'awaiting_user_decision',
      candidate: {
        text: '参与用户访谈',
        factRefs: ['f1'],
        verification: { status: 'passed' },
      },
      validationRecords: [],
    }],
  };
  const store = new Map([['s1', structuredClone(session)]]);
  const repository = {
    async get(id, userId) {
      const value = store.get(id);
      return value?.userId === userId ? value : null;
    },
    async save(value, userId) {
      assert.equal(value.userId, userId);
      store.set(value.id, structuredClone(value));
      return store.get(value.id);
    },
  };
  const tools = {
    evaluateModification: async () => ({
      relevance: judgeResult.relevance || 'improved',
      quality: judgeResult.quality || 'improved',
      beforeFactRefs: ['f1'],
      afterFactRefs: judgeResult.safetyStatus === 'blocked' ? [] : ['f1'],
      improvements: judgeResult.quality === 'improved' ? ['表达更具体'] : [],
      remainingIssues: judgeResult.safetyStatus === 'blocked'
        ? [{ type: 'unsupported_claim' }]
        : [],
      nextActions: ['检查并采用当前文本'],
      safetyFindings: [],
      ...judgeResult,
    }),
  };
  return { app: new AgentOrchestrator({ repository, tools }) };
}

test('PF-003 validation promotes current text into candidate and handoff', async () => {
  const h = makeValidationHarness({
    safetyStatus: 'passed',
    quality: 'improved',
    relevance: 'improved',
  });
  const text = '参与校园产品用户访谈并整理反馈';

  const result = await h.app.validateModification('s1', 'u1', 't1', text);

  assert.equal(result.tasks[0].candidate.text, text);
  assert.equal(result.tasks[0].currentText, text);
  assert.equal(result.tasks[0].state, 'ready_for_reevaluation');
  assert.equal(result.state, 'ready_for_reevaluation');
  assert.equal(result.handoff.finalText, text);
  assert.equal(result.handoff.verificationStatus, 'passed');
  assert.equal(result.tasks[0].validationRecords.length, 1);
});

test('PF-003 risk completion updates handoff without claiming verification', async () => {
  const h = makeValidationHarness({
    safetyStatus: 'blocked',
    quality: 'improved',
    relevance: 'improved',
  });
  const text = '独立访谈500位用户';

  await h.app.validateModification('s1', 'u1', 't1', text);
  const result = await h.app.completeWithRisk('s1', 'u1', 't1');

  assert.equal(result.tasks[0].state, 'completed_with_risk');
  assert.equal(result.tasks[0].riskAcknowledged, true);
  assert.equal(result.handoff.finalText, text);
  assert.equal(result.handoff.verificationStatus, 'blocked');
  assert.equal(result.handoff.riskAcknowledged, true);
});

test('editing after validation invalidates current verification but preserves history', async () => {
  const h = makeValidationHarness({
    safetyStatus: 'passed',
    quality: 'improved',
    relevance: 'improved',
  });
  await h.app.validateModification('s1', 'u1', 't1', '参与校园产品用户访谈并整理反馈');

  const edited = await h.app.decide('s1', 'u1', 't1', {
    type: 'user_edited',
    text: '参与校园产品用户访谈并归纳需求',
  });

  assert.equal(edited.tasks[0].candidate.verification.status, 'unverified_user_content');
  assert.equal(edited.tasks[0].validationRecords.length, 1);
  assert.equal(edited.handoff.verificationStatus, 'unverified_user_content');
});

test('unavailable PF-003 validation preserves baseline and history for retry', async () => {
  const h = makeValidationHarness({
    safetyStatus: 'unavailable',
    quality: 'unchanged',
    relevance: 'unchanged',
  });
  const original = '参与用户访谈';
  const current = '参与用户访谈并整理反馈';

  const unavailable = await h.app.validateModification('s1', 'u1', 't1', current);

  assert.equal(unavailable.tasks[0].state, 'user_edited');
  assert.equal(unavailable.state, 'task_in_progress');
  assert.equal(unavailable.tasks[0].validationBaseline, undefined);
  assert.equal(unavailable.tasks[0].currentText, current);
  assert.equal(unavailable.tasks[0].candidate.text, current);
  assert.equal(unavailable.handoff.finalText, current);
  assert.equal(unavailable.handoff.verificationStatus, 'unavailable');
  assert.equal(unavailable.tasks[0].validationRecords.length, 1);
  assert.equal(unavailable.tasks[0].validationRecords[0].baselineText, original);
});
