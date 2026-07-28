const { AgentOrchestrator } = require('./agentOrchestrator');
const { evaluateCandidate, runCases } = require('./pf002Evaluator');

function repositoryHarness() {
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
      if (value.userId !== userId) return null;
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

async function runEndToEndCase(item) {
  const repository = repositoryHarness();
  const tools = {
    parseJD: async () => ({
      requirements: [{ id: 'r1', sourceText: item.title, priority: 10 }],
    }),
    parseResume: async () => ({ facts: item.facts }),
    matchEvidence: async () => ({
      matches: [{
        requirementId: 'r1',
        factIds: item.facts.map((fact) => fact.id),
        gapType: 'expression',
        priority: 10,
      }],
    }),
    draftRevision: async () => item.candidate,
    verifyRevision: async ({ candidate, facts }) => evaluateCandidate(candidate, facts),
  };
  const app = new AgentOrchestrator({ repository, tools });
  const created = await app.createSession({
    userId: 'pf002-evaluation',
    jdText: item.title,
    resumeText: item.facts.map((fact) => fact.sourceText).join('\n'),
  });
  const analysed = await app.startAnalysis(created.id, 'pf002-evaluation');
  const taskId = analysed.tasks[0].id;
  await app.selectTask(created.id, 'pf002-evaluation', taskId);
  const result = await app.generateCandidate(created.id, 'pf002-evaluation', taskId);
  const task = result.tasks[0];
  const actual = task.candidate?.verification?.status || 'unavailable';
  return {
    caseId: item.id,
    expected: item.expected,
    actual,
    pass: actual === item.expected,
    findings: task.candidate?.verification?.findings || [],
    execution: 'orchestrator',
  };
}

async function runEvaluationSuite(cases) {
  const direct = runCases(cases);
  const e2eResults = new Map();
  for (const item of cases.filter((entry) => entry.id.startsWith('E2E-'))) {
    e2eResults.set(item.id, await runEndToEndCase(item));
  }
  const results = direct.results.map((result) => e2eResults.get(result.caseId) || {
    ...result,
    execution: 'deterministic',
  });
  return {
    ...direct,
    passed: results.filter((item) => item.pass).length,
    failed: results.filter((item) => !item.pass).length,
    results,
  };
}

module.exports = { runEndToEndCase, runEvaluationSuite };
