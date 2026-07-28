const test = require('node:test');
const assert = require('node:assert/strict');
const { AgentOrchestrator } = require('../services/agent/agentOrchestrator');

function createRepository() {
  const store = new Map();
  return {
    async create(value) {
      store.set(value.id, structuredClone(value));
      return store.get(value.id);
    },
    async get(id, userId) {
      const value = store.get(id);
      return value?.userId === userId ? value : null;
    },
    async save(value, userId) {
      assert.equal(value.userId, userId);
      store.set(value.id, structuredClone(value));
      return store.get(value.id);
    },
    async claimAnalysis(id, userId, claim) {
      const value = store.get(id);
      if (!value || value.userId !== userId || !claim.fromStates.includes(value.state)) return null;
      const from = value.state;
      value.state = claim.to;
      value.analysisClaimToken = claim.token;
      value.analysisClaimExpiresAt = claim.expiresAt;
      value.transitions.push({
        from,
        to: claim.to,
        event: claim.event,
        toolName: claim.toolName,
        at: claim.at,
      });
      return value;
    },
    async renewAnalysisClaim(id, userId, token, expiresAt) {
      const value = store.get(id);
      if (!value || value.userId !== userId || value.analysisClaimToken !== token) return null;
      value.analysisClaimExpiresAt = expiresAt;
      return value;
    },
    async saveAnalysis(value, userId, token) {
      const stored = store.get(value.id);
      if (!stored || stored.userId !== userId || stored.analysisClaimToken !== token) {
        throw new Error('AGENT_ANALYSIS_CLAIM_LOST');
      }
      delete value.analysisClaimToken;
      delete value.analysisClaimExpiresAt;
      store.set(value.id, structuredClone(value));
      return store.get(value.id);
    },
  };
}

function createTools({ validationSafety = 'passed' } = {}) {
  const calls = {
    assessAnswer: 0,
    verifyRevision: 0,
    evaluateModification: 0,
  };
  return {
    calls,
    parseJD: async () => ({
      requirements: [{ id: 'r1', sourceText: '用户研究', priority: 1 }],
    }),
    parseResume: async () => ({ facts: [] }),
    matchEvidence: async () => ({
      matches: [{ requirementId: 'r1', factIds: [], gapType: 'information', priority: 1 }],
    }),
    assessAnswer: async () => {
      calls.assessAnswer += 1;
      return {
        quality: 'relevant',
        factPatch: {
          action: '设计访谈提纲',
          context: '校园产品用户研究',
          contribution: '负责提纲设计和反馈整理',
          method: '半结构化访谈',
          result: '形成需求反馈清单',
          quantity: '',
          quantityType: 'exact',
        },
        missingFields: [],
        questionHint: '',
      };
    },
    draftRevision: async ({ facts }) => ({
      text: '负责校园产品用户访谈提纲设计并整理需求反馈',
      factRefs: facts.map((fact) => fact.id),
    }),
    verifyRevision: async ({ candidate }) => {
      calls.verifyRevision += 1;
      return {
        status: 'passed',
        findings: [],
        supportedClaims: [candidate.text],
        unsupportedClaims: [],
        factRefs: candidate.factRefs,
      };
    },
    evaluateModification: async ({ factRefs }) => {
      calls.evaluateModification += 1;
      return {
        relevance: 'improved',
        quality: 'improved',
        beforeFactRefs: factRefs,
        afterFactRefs: factRefs,
        improvements: ['补充个人贡献'],
        remainingIssues: [],
        nextActions: validationSafety === 'blocked' ? ['确认风险后再使用'] : ['可采用'],
        safetyStatus: validationSafety,
        safetyFindings: validationSafety === 'blocked'
          ? [{ type: 'semantic_claim_risk', message: '存在需人工确认的表述' }]
          : [],
      };
    },
  };
}

async function reachValidatedEdit({ validationSafety = 'passed' } = {}) {
  const repository = createRepository();
  const tools = createTools({ validationSafety });
  const app = new AgentOrchestrator({ repository, tools });
  const created = await app.createSession({ userId: 'u1', jdText: 'JD', resumeText: 'resume' });
  const analysed = await app.startAnalysis(created.id, 'u1');
  const taskId = analysed.tasks[0].id;

  const selected = await app.selectTask(created.id, 'u1', taskId);
  assert.equal(selected.tasks[0].state, 'questioning');

  const answered = await app.submitAnswer(
    created.id,
    'u1',
    taskId,
    '我负责校园产品访谈提纲设计，并整理成需求反馈清单',
  );
  assert.equal(answered.tasks[0].state, 'awaiting_fact_confirmation');

  const reviewed = await app.reviewFact(
    created.id,
    'u1',
    taskId,
    answered.tasks[0].pendingFactId,
    'confirm',
  );
  assert.equal(reviewed.tasks[0].state, 'generating');
  assert.equal(reviewed.resumeFacts.at(-1).confirmation, 'confirmed');

  const generated = await app.generateCandidate(created.id, 'u1', taskId);
  assert.equal(generated.tasks[0].candidate.verification.status, 'passed');

  const editedText = '负责校园产品用户访谈提纲设计，并整理需求反馈清单';
  await app.decide(created.id, 'u1', taskId, { type: 'user_edited', text: editedText });
  const validated = await app.validateModification(created.id, 'u1', taskId, editedText);
  return { app, created, taskId, tools, validated, editedText };
}

test('PF-001 through PF-004 closes the full verified evidence-driven loop', async () => {
  const { app, created, tools, validated, editedText } = await reachValidatedEdit();
  const record = validated.tasks[0].validationRecords.at(-1);

  assert.equal(tools.calls.assessAnswer, 1);
  assert.equal(tools.calls.verifyRevision, 1);
  assert.equal(tools.calls.evaluateModification, 1);
  assert.equal(record.safetyStatus, 'passed');
  assert.equal(record.changeOutcome, 'improved');
  assert.equal(validated.state, 'ready_for_reevaluation');
  assert.equal(validated.tasks[0].state, 'ready_for_reevaluation');

  const handoff = await app.getHandoff(created.id, 'u1');
  assert.equal(handoff.finalText, editedText);
  assert.equal(handoff.verificationStatus, 'passed');
  assert.equal(handoff.riskAcknowledged, false);
});

test('PF-004 preserves blocked validation and requires explicit risk acknowledgement', async () => {
  const {
    app, created, taskId, validated, editedText,
  } = await reachValidatedEdit({ validationSafety: 'blocked' });
  const record = validated.tasks[0].validationRecords.at(-1);

  assert.equal(record.changeOutcome, 'improved');
  assert.equal(record.safetyStatus, 'blocked');
  assert.equal(validated.tasks[0].state, 'user_edited');
  assert.equal(validated.handoff.verificationStatus, 'blocked');
  assert.equal(validated.handoff.riskAcknowledged, false);

  const completed = await app.completeWithRisk(created.id, 'u1', taskId);
  assert.equal(completed.tasks[0].state, 'completed_with_risk');
  assert.equal(completed.handoff.finalText, editedText);
  assert.equal(completed.handoff.verificationStatus, 'blocked');
  assert.equal(completed.handoff.riskAcknowledged, true);
});
