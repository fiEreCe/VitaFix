const test = require('node:test');
const assert = require('node:assert/strict');
const { calculateSufficiency, applyAnswerQuality, classifyGap, nextInsufficientAction } = require('../domain/agent/policy');

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
