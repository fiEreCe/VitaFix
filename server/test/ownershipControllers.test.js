const test = require('node:test');
const assert = require('node:assert/strict');

const JD = require('../models/JD');
const Resume = require('../models/Resume');
const Supplement = require('../models/Supplement');
const Analysis = require('../models/Analysis');
const AgentSession = require('../models/AgentSession');
const jdParser = require('../services/jdParser');
const resumeParser = require('../services/resumeParser');
const jdController = require('../controllers/jdController');
const resumeController = require('../controllers/resumeController');
const supplementController = require('../controllers/supplementController');
const analysisController = require('../controllers/analysisController');
const historyController = require('../controllers/historyController');
const {
  createAgentSessionController,
  createAgentSessionRepository,
  loadOwnedInputs,
} = require('../controllers/agentSessionController');
const { AgentOrchestrator } = require('../services/agent/agentOrchestrator');
const matchAnalyzer = require('../services/matchAnalyzer');
const sectionReevaluator = require('../services/sectionReevaluator');

function response() {
  return {
    statusCode: 200, body: null,
    status(code) { this.statusCode = code; return this; },
    json(value) { this.body = value; return this; },
  };
}

test('JD create stores userId and get filters by id plus userId', async (t) => {
  const oldParse = jdParser.parse;
  const oldSave = JD.prototype.save;
  const oldFindOne = JD.findOne;
  let saved;
  let filter;
  jdParser.parse = async () => ({ company: 'A' });
  JD.prototype.save = async function save() { saved = this.toObject(); return this; };
  JD.findOne = async (value) => { filter = value; return null; };
  t.after(() => { jdParser.parse = oldParse; JD.prototype.save = oldSave; JD.findOne = oldFindOne; });

  await jdController.create({ userId: 'u1', body: { rawText: 'JD' } }, response());
  await jdController.getById({ userId: 'u1', params: { id: 'jd1' } }, response());
  assert.equal(saved.userId, 'u1');
  assert.deepEqual(filter, { _id: 'jd1', userId: 'u1' });
});

test('Resume create and update store or filter by userId', async (t) => {
  const oldParse = resumeParser.parse;
  const oldSave = Resume.prototype.save;
  const oldUpdate = Resume.findOneAndUpdate;
  let saved;
  let filter;
  resumeParser.parse = async () => ({ skills: [] });
  Resume.prototype.save = async function save() { saved = this.toObject(); return this; };
  Resume.findOneAndUpdate = async (value) => { filter = value; return null; };
  t.after(() => { resumeParser.parse = oldParse; Resume.prototype.save = oldSave; Resume.findOneAndUpdate = oldUpdate; });

  await resumeController.create({ userId: 'u1', body: { rawText: 'resume' } }, response());
  await resumeController.update({ userId: 'u1', params: { id: 'r1' }, body: { parsed: {} } }, response());
  assert.equal(saved.userId, 'u1');
  assert.deepEqual(filter, { _id: 'r1', userId: 'u1' });
});

test('Supplement upsert filters by resumeId and userId and stores userId', async (t) => {
  const oldFindOne = Supplement.findOne;
  const oldSave = Supplement.prototype.save;
  let filter;
  let saved;
  Supplement.findOne = async (value) => { filter = value; return null; };
  Supplement.prototype.save = async function save() { saved = this.toObject(); return this; };
  t.after(() => { Supplement.findOne = oldFindOne; Supplement.prototype.save = oldSave; });

  await supplementController.upsert({ userId: 'u1', body: { resumeId: '507f1f77bcf86cd799439011', items: [] } }, response());
  assert.equal(filter.userId, 'u1');
  assert.equal(filter.resumeId, '507f1f77bcf86cd799439011');
  assert.equal(saved.userId, 'u1');
});

test('Analysis status lookup filters by id and current owner', async (t) => {
  const oldFindOne = Analysis.findOne;
  let filter;
  Analysis.findOne = async (value) => { filter = value; return null; };
  t.after(() => { Analysis.findOne = oldFindOne; });
  const res = response();
  await analysisController.getStatus({ userId: 'u2', params: { id: 'a1' } }, res);
  assert.deepEqual(filter, { _id: 'a1', userId: 'u2' });
  assert.equal(res.statusCode, 404);
});

test('agent input loader queries JD and Resume by id plus userId', async (t) => {
  const oldJdFindOne = JD.findOne;
  const oldResumeFindOne = Resume.findOne;
  const filters = [];
  JD.findOne = async (filter) => { filters.push(filter); return { rawText: 'JD' }; };
  Resume.findOne = async (filter) => { filters.push(filter); return { rawText: 'resume' }; };
  t.after(() => { JD.findOne = oldJdFindOne; Resume.findOne = oldResumeFindOne; });

  assert.deepEqual(await loadOwnedInputs('jd1', 'resume1', 'u1'), { jdText: 'JD', resumeText: 'resume' });
  assert.deepEqual(filters, [{ _id: 'jd1', userId: 'u1' }, { _id: 'resume1', userId: 'u1' }]);
});

test('agent session create maps missing or foreign inputs to non-retryable 404', async () => {
  for (const code of ['missing', 'foreign']) {
    const controller = createAgentSessionController({
      orchestrator: { createSession: async () => { throw new Error('MUST_NOT_CREATE'); } },
      loadInputs: async () => { throw new Error('INPUT_NOT_FOUND'); },
    });
    const res = response();
    await controller.create({ userId: 'u1', body: { jdId: `${code}-jd`, resumeId: `${code}-resume` } }, res);
    assert.equal(res.statusCode, 404);
    assert.equal(res.body.error.code, 'INPUT_NOT_FOUND');
    assert.equal(res.body.error.retryable, false);
  }
});

test('Analysis create scopes all input lookups and owner-conditionally persists completion', async (t) => {
  const originals = {
    jd: JD.findOne, resume: Resume.findOne, supplement: Supplement.findOne,
    save: Analysis.prototype.save, update: Analysis.updateOne, analyze: matchAnalyzer.analyze,
    immediate: global.setImmediate, log: console.log,
  };
  const filters = [];
  const writes = [];
  let background;
  JD.findOne = async (filter) => { filters.push(filter); return { parsed: { company: 'A', position: 'B' } }; };
  Resume.findOne = async (filter) => { filters.push(filter); return { parsed: {} }; };
  Supplement.findOne = async (filter) => { filters.push(filter); return { items: [] }; };
  Analysis.prototype.save = async function save() { this._id = 'analysis-1'; return this; };
  Analysis.updateOne = async (filter, update) => { writes.push({ filter, update }); return { matchedCount: 1 }; };
  matchAnalyzer.analyze = async () => ({ overallScore: 88 });
  global.setImmediate = (callback) => { background = callback; };
  console.log = () => {};
  t.after(() => {
    JD.findOne = originals.jd; Resume.findOne = originals.resume; Supplement.findOne = originals.supplement;
    Analysis.prototype.save = originals.save; Analysis.updateOne = originals.update;
    matchAnalyzer.analyze = originals.analyze; global.setImmediate = originals.immediate;
    console.log = originals.log;
  });

  const res = response();
  await analysisController.create({ userId: 'u1', body: { jdId: 'jd1', resumeId: 'r1' } }, res);
  await background();
  assert.deepEqual(filters, [
    { _id: 'jd1', userId: 'u1' },
    { _id: 'r1', userId: 'u1' },
    { resumeId: 'r1', userId: 'u1' },
  ]);
  assert.deepEqual(writes[0].filter, { _id: res.body.id, userId: 'u1' });
  assert.equal(writes[0].update.$set.status, 'completed');
});

test('Analysis async failure owner-conditionally persists failure state', async (t) => {
  const originals = {
    jd: JD.findOne, resume: Resume.findOne, supplement: Supplement.findOne,
    save: Analysis.prototype.save, update: Analysis.updateOne, analyze: matchAnalyzer.analyze,
    immediate: global.setImmediate, error: console.error,
  };
  let background;
  let write;
  JD.findOne = async () => ({ parsed: {} });
  Resume.findOne = async () => ({ parsed: {} });
  Supplement.findOne = async () => null;
  Analysis.prototype.save = async function save() { this._id = 'analysis-2'; return this; };
  Analysis.updateOne = async (filter, update) => { write = { filter, update }; return { matchedCount: 1 }; };
  matchAnalyzer.analyze = async () => { throw new Error('analysis failed'); };
  global.setImmediate = (callback) => { background = callback; };
  console.error = () => {};
  t.after(() => {
    JD.findOne = originals.jd; Resume.findOne = originals.resume; Supplement.findOne = originals.supplement;
    Analysis.prototype.save = originals.save; Analysis.updateOne = originals.update;
    matchAnalyzer.analyze = originals.analyze; global.setImmediate = originals.immediate; console.error = originals.error;
  });

  const res = response();
  await analysisController.create({ userId: 'u2', body: { jdId: 'jd2', resumeId: 'r2' } }, res);
  await background();
  assert.deepEqual(write.filter, { _id: res.body.id, userId: 'u2' });
  assert.equal(write.update.$set.status, 'failed');
  assert.equal(write.update.$set.errorMessage, 'analysis failed');
});

test('Analysis detail and reevaluation use owner base queries and owner-conditional mutation', async (t) => {
  const oldFindOne = Analysis.findOne;
  const oldUpdateOne = Analysis.updateOne;
  const oldReevaluate = sectionReevaluator.reevaluate;
  const filters = [];
  const populateCalls = [];
  let writeFilter;
  const section = { sectionType: 'experience', sectionIndex: 0, matchScore: 1 };
  const owned = {
    _id: 'a3',
    jdId: { parsed: {} },
    analysis: { sectionAnalysis: [section] },
    markModified() {},
  };
  Analysis.findOne = (filter) => {
    filters.push(filter);
    return {
      populate(options) { populateCalls.push(options); return this; },
      then(resolve) { resolve(owned); },
    };
  };
  Analysis.updateOne = async (filter) => { writeFilter = filter; return { matchedCount: 1 }; };
  sectionReevaluator.reevaluate = async () => ({
    matchScore: 90, comparisons: [], suggestions: [],
    通用优势: [], 通用差距: [], 垂直优势: [], 垂直差距: [],
  });
  t.after(() => {
    Analysis.findOne = oldFindOne; Analysis.updateOne = oldUpdateOne;
    sectionReevaluator.reevaluate = oldReevaluate;
  });

  await analysisController.getById({ userId: 'u3', params: { id: 'a3' } }, response());
  await analysisController.reevaluateSection({
    userId: 'u3', params: { id: 'a3' },
    body: { sectionType: 'experience', sectionIndex: 0, revisedText: 'new' },
  }, response());
  assert.deepEqual(filters, [
    { _id: 'a3', userId: 'u3' },
    { _id: 'a3', userId: 'u3' },
  ]);
  assert.deepEqual(populateCalls.slice(0, 2), [
    { path: 'jdId', select: 'rawText parsed', match: { userId: 'u3' } },
    { path: 'resumeId', select: 'rawText parsed', match: { userId: 'u3' } },
  ]);
  assert.deepEqual(writeFilter, { _id: 'a3', userId: 'u3' });
});

test('history update and delete mutations include the current owner', async (t) => {
  const oldUpdate = Analysis.findOneAndUpdate;
  const oldDelete = Analysis.findOneAndDelete;
  let updateFilter;
  let deleteFilter;
  Analysis.findOneAndUpdate = async (filter) => { updateFilter = filter; return { _id: 'a4', name: 'new' }; };
  Analysis.findOneAndDelete = async (filter) => { deleteFilter = filter; return { _id: 'a4' }; };
  t.after(() => { Analysis.findOneAndUpdate = oldUpdate; Analysis.findOneAndDelete = oldDelete; });
  await historyController.updateName({ userId: 'u4', params: { id: 'a4' }, body: { name: 'new' } }, response());
  await historyController.remove({ userId: 'u4', params: { id: 'a4' } }, response());
  assert.deepEqual(updateFilter, { _id: 'a4', userId: 'u4' });
  assert.deepEqual(deleteFilter, { _id: 'a4', userId: 'u4' });
});

test('Agent repository rejects wrong-owner renew, analysis save, and normal save without mutation', async (t) => {
  const oldUpdate = AgentSession.findOneAndUpdate;
  const oldFind = AgentSession.findOne;
  const state = {
    _id: 's1', userId: 'owner', state: 'parsing',
    analysisClaimToken: 'valid-token', analysisClaimExpiresAt: new Date('2030-01-01'),
  };
  const filters = [];
  AgentSession.findOneAndUpdate = async (filter, update) => {
    filters.push(filter);
    if (filter._id !== state._id || filter.userId !== state.userId) return null;
    if (filter.analysisClaimToken && filter.analysisClaimToken !== state.analysisClaimToken) return null;
    Object.assign(state, update.$set || {});
    return { ...state };
  };
  AgentSession.findOne = async (filter) => (
    filter._id === state._id && filter.userId === state.userId ? { ...state, tasks: [] } : null
  );
  t.after(() => { AgentSession.findOneAndUpdate = oldUpdate; AgentSession.findOne = oldFind; });
  const repository = createAgentSessionRepository();
  const before = structuredClone(state);

  assert.equal(await repository.renewAnalysisClaim('s1', 'intruder', 'valid-token', new Date('2040-01-01')), null);
  await assert.rejects(
    () => repository.saveAnalysis({ id: 's1', state: 'completed' }, 'intruder', 'valid-token'),
    /AGENT_ANALYSIS_CLAIM_LOST/,
  );
  assert.equal(await repository.save({ id: 's1', state: 'completed' }, 'intruder'), null);
  const orchestrator = new AgentOrchestrator({ repository, tools: {} });
  await assert.rejects(
    () => orchestrator.selectTask('s1', 'intruder', 'task-1'),
    /AGENT_SESSION_NOT_FOUND/,
  );
  assert.deepEqual(state, before);
  assert.deepEqual(filters.map(({ _id, userId, analysisClaimToken }) => ({ _id, userId, analysisClaimToken })), [
    { _id: 's1', userId: 'intruder', analysisClaimToken: 'valid-token' },
    { _id: 's1', userId: 'intruder', analysisClaimToken: 'valid-token' },
    { _id: 's1', userId: 'intruder', analysisClaimToken: undefined },
  ]);
});

test('cross-user agent command cannot claim, renew, save, or mutate', async () => {
  const session = { id: 's1', userId: 'owner', state: 'draft', inputSnapshot: {}, transitions: [] };
  const calls = { claim: 0, renew: 0, saveAnalysis: 0, save: 0 };
  const repository = {
    async claimAnalysis(id, userId) { calls.claim += 1; assert.equal(userId, 'intruder'); return null; },
    async get(id, userId) { return userId === session.userId ? session : null; },
    async renewAnalysisClaim() { calls.renew += 1; },
    async saveAnalysis() { calls.saveAnalysis += 1; },
    async save() { calls.save += 1; },
  };
  const app = new AgentOrchestrator({ repository, tools: {} });
  await assert.rejects(() => app.startAnalysis('s1', 'intruder'), /AGENT_SESSION_NOT_FOUND/);
  assert.deepEqual(calls, { claim: 1, renew: 0, saveAnalysis: 0, save: 0 });
  assert.equal(session.state, 'draft');
});
