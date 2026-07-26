const test = require('node:test');
const assert = require('node:assert/strict');

const { validateToolResult, SESSION_STATES } = require('../domain/agent/contracts');

test('rejects an evidence match that references an unknown fact', () => {
  assert.throws(() => validateToolResult('matchEvidence', {
    requirements: [{ id: 'req-1' }],
    facts: [{ id: 'fact-1' }],
    matches: [{ requirementId: 'req-1', factIds: ['fact-missing'], gapType: 'information' }],
  }), /UNKNOWN_FACT_REF/);
});

test('exports the complete V0.1 session state set', () => {
  assert.deepEqual(SESSION_STATES, [
    'draft', 'parsing', 'parsing_failed', 'matching', 'matching_failed', 'evidence_ready', 'task_in_progress',
    'ready_for_reevaluation', 'completed', 'cancelled', 'expired',
  ]);
});
