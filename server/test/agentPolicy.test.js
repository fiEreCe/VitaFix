const test = require('node:test');
const assert = require('node:assert/strict');
const {
  applyAnswerQuality,
  calculateSufficiency,
  classifyGap,
  mergeFacts,
  nextInsufficientAction,
} = require('../domain/agent/policy');

test('strong needs action, context, contribution, and method or result', () => {
  assert.equal(calculateSufficiency({ action: '设计问卷', context: '校园用户', contribution: '独立完成', method: '访谈', result: '' }), 'strong');
  assert.equal(calculateSufficiency({ action: '设计问卷', context: '校园用户', contribution: '独立完成' }), 'basic');
});

test('off-topic clarification does not consume a round and only happens once', () => {
  assert.deepEqual(applyAnswerQuality({ effectiveRounds: 1, clarificationUsed: false }, 'off_topic'), { effectiveRounds: 1, clarificationUsed: true, next: 'clarify' });
  assert.equal(applyAnswerQuality({ effectiveRounds: 1, clarificationUsed: true }, 'off_topic').next, 'return_control');
});

test('only explicit not-done becomes capability gap', () => {
  assert.equal(classifyGap('not_done'), 'capability');
  assert.equal(classifyGap('unknown'), 'information');
  assert.equal(nextInsufficientAction({ effectiveRounds: 3, sufficiency: 'insufficient' }), 'return_control');
});

test('merges complementary confirmed facts before calculating sufficiency', () => {
  const merged = mergeFacts([
    { action: '设计访谈提纲', context: '', contribution: '' },
    { action: '', context: '校园产品', contribution: '本人负责提纲设计' },
  ]);

  assert.equal(calculateSufficiency(merged), 'basic');
});
