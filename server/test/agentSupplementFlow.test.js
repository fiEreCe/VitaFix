const test = require('node:test');
const assert = require('node:assert/strict');

const JD = require('../models/JD');
const Resume = require('../models/Resume');
const Supplement = require('../models/Supplement');
const jdParser = require('../services/jdParser');
const resumeParser = require('../services/resumeParser');
const { createAgentSessionController } = require('../controllers/agentSessionController');

function response() {
  return {
    statusCode: 200,
    body: null,
    status(code) { this.statusCode = code; return this; },
    json(value) { this.body = value; return this; },
  };
}

function inMemoryRepository() {
  const store = new Map();
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
      const expired = value && (!value.analysisClaimExpiresAt || new Date(value.analysisClaimExpiresAt) <= new Date(claim.at));
      if (!value || value.userId !== userId || (!claim.fromStates.includes(value.state) && !(claim.activeStates.includes(value.state) && expired))) return null;
      const from = value.state;
      value.state = claim.to;
      value.analysisClaimToken = claim.token;
      value.analysisClaimExpiresAt = claim.expiresAt;
      value.transitions.push({ from, to: claim.to, event: claim.activeStates.includes(from) ? claim.recoveryEvent : claim.event, toolName: claim.toolName, at: claim.at });
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
      if (!stored || stored.userId !== userId || stored.analysisClaimToken !== token) throw new Error('AGENT_ANALYSIS_CLAIM_LOST');
      const saved = structuredClone(value);
      if (clearClaim) {
        delete saved.analysisClaimToken;
        delete saved.analysisClaimExpiresAt;
      }
      store.set(value.id, structuredClone(saved));
      return structuredClone(store.get(value.id));
    },
  };
}

test('a saved supplement reaches the frozen snapshot, parsing, and evidence matching', async (t) => {
  const originals = {
    jdFindOne: JD.findOne,
    resumeFindOne: Resume.findOne,
    supplementFindOne: Supplement.findOne,
    jdParse: jdParser.parse,
    resumeParse: resumeParser.parse,
  };
  const filters = [];
  JD.findOne = async () => ({ rawText: '负责用户研究与访谈' });
  Resume.findOne = async () => ({ rawText: '某公司 运营实习：负责社群运营' });
  Supplement.findOne = async (filter) => {
    filters.push(filter);
    return {
      items: [{
        type: '项目',
        title: '用户研究项目',
        period: '2024',
        description: '独立完成20位用户访谈并输出洞察',
        includedInResume: false,
      }],
    };
  };
  jdParser.parse = async () => ({
    company: '示例公司',
    position: '产品经理',
    requirements: ['具备用户研究与访谈能力'],
    responsibilities: [],
  });
  resumeParser.parse = async () => ({
    personalInfo: {},
    education: [],
    experience: [{ company: '某公司', position: '运营', period: '2023', description: '负责社群运营' }],
    projects: [],
    skills: [],
    certifications: [],
  });
  t.after(() => {
    JD.findOne = originals.jdFindOne;
    Resume.findOne = originals.resumeFindOne;
    Supplement.findOne = originals.supplementFindOne;
    jdParser.parse = originals.jdParse;
    resumeParser.parse = originals.resumeParse;
  });

  const repository = inMemoryRepository();
  const controller = createAgentSessionController({ repository });
  const created = response();
  await controller.create({ userId: 'u1', body: { jdId: 'jd1', resumeId: 'resume1' } }, created);
  assert.equal(created.statusCode, 201);
  assert.deepEqual(filters, [{ resumeId: 'resume1', userId: 'u1' }]);

  const sessionId = created.body.id;
  const snapshot = repository.store.get(sessionId).inputSnapshot;
  assert.equal(snapshot.resumeText, '某公司 运营实习：负责社群运营');
  assert.deepEqual(snapshot.supplements, [{
    type: '项目',
    title: '用户研究项目',
    period: '2024',
    description: '独立完成20位用户访谈并输出洞察',
    includedInResume: false,
  }]);

  const started = response();
  await controller.start({ userId: 'u1', params: { id: sessionId } }, started);
  assert.equal(started.statusCode, 200);
  assert.equal(started.body.state, 'evidence_ready');

  const supplementFact = started.body.resumeFacts.find((fact) => fact.source === 'supplement');
  assert.ok(supplementFact);
  assert.match(supplementFact.sourceText, /用户访谈/);
  assert.equal(supplementFact.confirmation, 'confirmed');
  assert.ok(started.body.matches[0].factIds.includes(supplementFact.id));
  assert.ok(started.body.tasks[0].factIds.includes(supplementFact.id));
});

test('a supplement owned by another user is not loaded into the session', async (t) => {
  const originals = {
    jdFindOne: JD.findOne,
    resumeFindOne: Resume.findOne,
    supplementFindOne: Supplement.findOne,
  };
  let supplementFilter;
  JD.findOne = async () => ({ rawText: 'JD' });
  Resume.findOne = async () => ({ rawText: '简历' });
  Supplement.findOne = async (filter) => {
    supplementFilter = filter;
    return null;
  };
  t.after(() => {
    JD.findOne = originals.jdFindOne;
    Resume.findOne = originals.resumeFindOne;
    Supplement.findOne = originals.supplementFindOne;
  });

  const repository = inMemoryRepository();
  const controller = createAgentSessionController({ repository });
  const created = response();
  await controller.create({ userId: 'u2', body: { jdId: 'jd1', resumeId: 'resume1' } }, created);

  assert.deepEqual(supplementFilter, { resumeId: 'resume1', userId: 'u2' });
  assert.equal(created.statusCode, 201);
  assert.deepEqual(repository.store.get(created.body.id).inputSnapshot.supplements, []);
});
