const test = require('node:test');
const assert = require('node:assert/strict');

const { validate } = require('../services/agent/modificationValidator');

const facts = [{
  id: 'f1',
  sourceText: '参与用户访谈并整理反馈',
  confirmation: 'confirmed',
}];

test('does not call unrelated text improved', async () => {
  const result = await validate({
    baselineText: '参与用户访谈并整理反馈',
    currentText: '完全无关的自我介绍',
    facts,
    factRefs: ['f1'],
    semanticJudge: async () => ({
      relevance: 'regressed',
      quality: 'regressed',
      beforeFactRefs: ['f1'],
      afterFactRefs: [],
      improvements: [],
      remainingIssues: [{ type: 'irrelevant_content' }],
      nextActions: ['恢复与岗位相关的事实'],
      safetyStatus: 'passed',
      safetyFindings: [],
    }),
  });

  assert.equal(result.changeOutcome, 'regressed');
  assert.equal(result.safetyStatus, 'blocked');
  assert.deepEqual(result.evidenceCoverage, { before: 1, after: 0 });
});

test('keeps change outcome independent when improved text has a safety block', async () => {
  const result = await validate({
    baselineText: '参与访谈',
    currentText: '独立访谈500位用户',
    facts,
    factRefs: ['f1'],
    semanticJudge: async () => ({
      relevance: 'improved',
      quality: 'improved',
      beforeFactRefs: ['f1'],
      afterFactRefs: ['f1'],
      improvements: ['表达更具体'],
      remainingIssues: [],
      nextActions: ['核实数字和个人职责'],
      safetyStatus: 'passed',
      safetyFindings: [],
    }),
  });

  assert.equal(result.changeOutcome, 'improved');
  assert.equal(result.safetyStatus, 'blocked');
  assert.ok(result.remainingIssues.some((item) => item.type === 'unconfirmed_number'));
});

test('semantic judge failure does not fabricate an improvement', async () => {
  const result = await validate({
    baselineText: '参与访谈',
    currentText: '参与用户访谈并整理反馈',
    facts,
    factRefs: ['f1'],
    semanticJudge: async () => { throw new Error('timeout'); },
  });

  assert.equal(result.changeOutcome, 'unchanged');
  assert.equal(result.safetyStatus, 'unavailable');
  assert.equal(result.baselineText, '参与访谈');
  assert.equal(result.currentText, '参与用户访谈并整理反馈');
  assert.ok(result.remainingIssues.some((item) => item.type === 'semantic_evaluation_unavailable'));
});

test('calls semantic judge once and computes evidence coverage from its references', async () => {
  let calls = 0;
  const result = await validate({
    baselineText: '参与访谈',
    currentText: '参与用户访谈并整理反馈',
    facts,
    factRefs: ['f1'],
    semanticJudge: async () => {
      calls += 1;
      return {
        relevance: 'improved',
        quality: 'improved',
        beforeFactRefs: [],
        afterFactRefs: ['f1'],
        improvements: ['补充对象和结果'],
        remainingIssues: [],
        nextActions: ['可采用当前文本'],
        safetyStatus: 'passed',
        safetyFindings: [],
      };
    },
  });

  assert.equal(calls, 1);
  assert.equal(result.changeOutcome, 'improved');
  assert.deepEqual(result.evidenceCoverage, { before: 0, after: 1 });
});
