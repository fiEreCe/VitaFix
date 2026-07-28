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

test('blocks responsibility expansion synonyms and unrelated claims', () => {
  const result = verifyCandidate({
    text: '牵头制定公司战略并推动营收增长',
    factRefs: ['fact-1'],
  }, [{
    id: 'fact-1',
    confirmation: 'confirmed',
    sourceText: '参与用户访谈并整理反馈',
    contribution: '团队共同完成',
  }]);

  assert.equal(result.status, 'unsupported');
  assert.ok(result.findings.some((item) => item.type === 'attribution_expansion'));
  assert.ok(result.findings.some((item) => item.type === 'unsupported_claim_semantics'));
});

test('does not reuse a people count as a revenue percentage', () => {
  const result = verifyCandidate({
    text: '实现营收增长20%',
    factRefs: ['fact-1'],
  }, [{
    id: 'fact-1',
    confirmation: 'confirmed',
    sourceText: '访谈20位用户',
    quantity: '20位用户',
    quantityType: 'exact',
  }]);

  assert.equal(result.status, 'unsupported');
  assert.ok(result.findings.some((item) => item.type === 'number_context_expansion'));
});

test('allows a confirmed number when unit and purpose remain consistent', () => {
  const result = verifyCandidate({
    text: '访谈20位用户并整理反馈',
    factRefs: ['fact-1'],
  }, [{
    id: 'fact-1',
    confirmation: 'confirmed',
    sourceText: '访谈20位用户并整理反馈',
    quantity: '20位用户',
    quantityType: 'exact',
  }]);

  assert.equal(result.status, 'passed');
  assert.ok(!result.findings.some((item) => item.type === 'number_context_expansion'));
});
