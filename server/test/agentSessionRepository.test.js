const test = require('node:test');
const assert = require('node:assert/strict');

const AgentSession = require('../models/AgentSession');
const { createAgentSessionRepository } = require('../controllers/agentSessionController');

test('claimAnalysis marks aggregation pipeline updates with updatePipeline', async (t) => {
  const original = AgentSession.findOneAndUpdate;
  let captured = null;

  AgentSession.findOneAndUpdate = async (filter, update, options) => {
    captured = { filter, update, options };
    return { state: 'parsing', analysisClaimToken: 'token' };
  };
  t.after(() => {
    AgentSession.findOneAndUpdate = original;
  });

  const repository = createAgentSessionRepository();
  const now = new Date();
  const result = await repository.claimAnalysis('session-1', 'user-1', {
    fromStates: ['draft'],
    activeStates: ['parsing'],
    to: 'parsing',
    event: 'ANALYSIS_STARTED',
    recoveryEvent: 'ANALYSIS_RECOVERED',
    toolName: '',
    at: now.toISOString(),
    token: 'token',
    expiresAt: new Date(now.getTime() + 60 * 1000),
  });

  assert.ok(Array.isArray(captured.update), 'claimAnalysis should use an aggregation pipeline');
  assert.equal(captured.options.updatePipeline, true);
  assert.equal(captured.options.new, true);
  assert.equal(result.state, 'parsing');
});

test('claimAnalysis can recover active sessions only after their lease expires', async (t) => {
  const original = AgentSession.findOneAndUpdate;
  let captured = null;

  AgentSession.findOneAndUpdate = async (filter, update, options) => {
    captured = { filter, update, options };
    return { state: 'parsing', analysisClaimToken: 'recovery-token' };
  };
  t.after(() => {
    AgentSession.findOneAndUpdate = original;
  });

  const repository = createAgentSessionRepository();
  const now = new Date('2026-01-01T00:00:00.000Z');
  await repository.claimAnalysis('session-1', 'user-1', {
    fromStates: ['draft', 'parsing_failed', 'matching_failed'],
    activeStates: ['parsing', 'matching'],
    to: 'parsing',
    event: 'ANALYSIS_STARTED',
    recoveryEvent: 'ANALYSIS_RECOVERED',
    toolName: '',
    at: now.toISOString(),
    token: 'recovery-token',
    expiresAt: new Date(now.getTime() + 60 * 1000),
  });

  const activeBranch = captured.filter.$or[1];
  assert.deepEqual(activeBranch.state.$in, ['parsing', 'matching']);
  assert.ok(activeBranch.$or.some((clause) => clause.analysisClaimExpiresAt?.$lte));
  assert.ok(activeBranch.$or.some((clause) => clause.analysisClaimExpiresAt === null));
  assert.ok(activeBranch.$or.some((clause) => clause.analysisClaimExpiresAt?.$exists === false));
});
