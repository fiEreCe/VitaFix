const test = require('node:test');
const assert = require('node:assert/strict');

const JD = require('../models/JD');
const Resume = require('../models/Resume');
const Supplement = require('../models/Supplement');
const Analysis = require('../models/Analysis');
const jdParser = require('../services/jdParser');
const resumeParser = require('../services/resumeParser');
const jdController = require('../controllers/jdController');
const resumeController = require('../controllers/resumeController');
const supplementController = require('../controllers/supplementController');
const analysisController = require('../controllers/analysisController');
const { loadOwnedInputs } = require('../controllers/agentSessionController');
const { AgentOrchestrator } = require('../services/agent/agentOrchestrator');

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
