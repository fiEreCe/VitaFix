const test = require('node:test');
const assert = require('node:assert/strict');
const { verifyCandidate, inspectUserEdit } = require('../domain/agent/guardrails');

const facts = [{ id: 'fact-1', confirmation: 'confirmed', action: '设计问卷', contribution: '团队共同完成', quantity: '', sourceText: '参与问卷设计' }];

test('blocks unknown numbers and personal attribution', () => {
  const result = verifyCandidate({ text: '独立设计问卷并收集500份样本', factRefs: ['fact-1'] }, facts);
  assert.equal(result.status, 'unsupported');
  assert.deepEqual(new Set(result.findings.map((item) => item.type)), new Set(['unconfirmed_number', 'attribution_expansion']));
});

test('user edits warn without blocking save', () => {
  const result = inspectUserEdit('独立负责完整产品设计', facts);
  assert.equal(result.canSave, true);
  assert.equal(result.verificationStatus, 'unverified_user_content');
  assert.ok(result.findings.length > 0);
});
