const test = require('node:test');
const assert = require('node:assert/strict');
const { createAgentSessionController } = require('../controllers/agentSessionController');

function response() { return { statusCode: 200, body: null, status(code) { this.statusCode = code; return this; }, json(value) { this.body = value; return this; } }; }

test('create validates ids and returns the new agent session', async () => {
  const controller = createAgentSessionController({
    orchestrator: { createSession: async () => ({ id: 'session-1', state: 'draft' }) },
    loadInputs: async () => ({ jdText: 'JD', resumeText: '简历' }),
  });
  const res = response();
  await controller.create({ userId: 'u1', body: { jdId: 'jd1', resumeId: 'resume1' } }, res);
  assert.equal(res.statusCode, 201);
  assert.equal(res.body.id, 'session-1');
});
