const test = require('node:test');
const assert = require('node:assert/strict');
const { validate } = require('../services/agent/modificationValidator');

test('PF-003 returns independent change and safety results with an immutable snapshot', () => {
  const result = validate({ baselineText: '参与访谈', currentText: '参与用户访谈并整理反馈', facts: [{ id: 'f1', sourceText: '参与用户访谈', confirmation: 'confirmed' }], factRefs: ['f1'] });
  assert.equal(result.changeOutcome, 'improved'); assert.equal(result.safetyStatus, 'passed'); assert.equal(result.diff.changed, true); assert.ok(result.id);
});

test('PF-003 keeps an improved text blocked when it invents a number', () => {
  const result = validate({ baselineText: '参与访谈', currentText: '参与500位用户访谈', facts: [{ id: 'f1', sourceText: '参与用户访谈', confirmation: 'confirmed' }], factRefs: ['f1'] });
  assert.equal(result.changeOutcome, 'tradeoff'); assert.equal(result.safetyStatus, 'blocked');
});
