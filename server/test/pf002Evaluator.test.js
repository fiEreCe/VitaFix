const test = require('node:test');
const assert = require('node:assert/strict');
const { evaluateCandidate, runCases } = require('../services/agent/pf002Evaluator');
const facts = [{ id: 'f1', confirmation: 'confirmed', sourceText: '参与问卷设计', contribution: '团队共同完成', quantity: '' }];
test('maps red-line findings to blocked and malformed output to unavailable', () => {
  assert.equal(evaluateCandidate({ text: '独立收集500份样本', factRefs: ['f1'] }, facts).status, 'blocked');
  assert.equal(evaluateCandidate({ text: '', factRefs: [] }, facts).status, 'unavailable');
});
test('writes a reproducible result for every fixed case', () => {
  const report = runCases([{ id: 'A-001', expected: 'blocked', candidate: { text: '独立收集500份样本', factRefs: ['f1'] }, facts }]);
  assert.deepEqual({ total: report.total, passed: report.passed, failed: report.failed }, { total: 1, passed: 1, failed: 0 });
});

test('blocks an estimated number when its qualifier is removed', () => {
  const result = evaluateCandidate({ text: '参与20位用户访谈', factRefs: ['f1'] }, [{ id: 'f1', confirmation: 'confirmed', quantity: '20', quantityType: 'estimated' }]);
  assert.equal(result.status, 'blocked');
  assert.ok(result.findings.some((item) => item.type === 'unqualified_estimate'));
  assert.equal(result.evaluationVersion.ruleVersion, 'pf002-rules-1');
});
