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

test('validates the complete assess-answer contract', () => {
  assert.throws(() => validateToolResult('assessAnswer', {
    quality: 'relevant',
  }), /INVALID_ANSWER_SCHEMA/);

  assert.doesNotThrow(() => validateToolResult('assessAnswer', {
    quality: 'partial',
    factPatch: { action: '设计访谈提纲' },
    missingFields: ['context', 'contribution'],
    questionHint: '服务什么场景，你负责什么？',
  }));
});

test('validates the complete modification evaluation contract', () => {
  assert.throws(() => validateToolResult('evaluateModification', {
    relevance: 'improved',
    quality: 'improved',
    safetyStatus: 'passed',
  }), /INVALID_MODIFICATION_SCHEMA/);

  assert.doesNotThrow(() => validateToolResult('evaluateModification', {
    relevance: 'improved',
    quality: 'improved',
    beforeFactRefs: ['f1'],
    afterFactRefs: ['f1'],
    improvements: ['表达更具体'],
    remainingIssues: [],
    nextActions: ['可采用'],
    safetyStatus: 'passed',
    safetyFindings: [],
  }));
});
