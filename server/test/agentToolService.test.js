const test = require('node:test');
const assert = require('node:assert/strict');

const { AgentToolService } = require('../services/agent/agentToolService');

test('PF-003 modification evaluation calls the model exactly once and validates output', async () => {
  let calls = 0;
  let capturedOptions = null;
  const service = new AgentToolService({
    ai: {
      chatJSON: async (prompt, options) => {
        calls += 1;
        capturedOptions = options;
        return {
          relevance: 'improved',
          quality: 'improved',
          beforeFactRefs: ['f1'],
          afterFactRefs: ['f1'],
          improvements: ['补充场景'],
          remainingIssues: [],
          nextActions: ['可采用'],
          safetyStatus: 'passed',
          safetyFindings: [],
        };
      },
    },
  });

  const result = await service.evaluateModification({
    baselineText: '参与访谈',
    currentText: '参与用户访谈',
    facts: [{ id: 'f1', sourceText: '参与用户访谈' }],
    factRefs: ['f1'],
  });

  assert.equal(calls, 1);
  assert.equal(result.safetyStatus, 'passed');
  assert.deepEqual(capturedOptions, { temperature: 0, maxTokens: 8192, rejectTruncated: true });
});

test('answer assessment uses enough tokens and rejects truncated output', async () => {
  let capturedOptions = null;
  const service = new AgentToolService({
    ai: {
      chatJSON: async (prompt, options) => {
        capturedOptions = options;
        return {
          quality: 'relevant',
          factPatch: { action: '参与用户访谈' },
          missingFields: [],
          questionHint: '',
        };
      },
    },
  });

  const result = await service.assessAnswer({
    requirement: { id: 'r1', sourceText: '用户研究' },
    confirmedFact: {},
    question: '你具体做了什么？',
    answer: '我参与用户访谈并整理反馈。',
  });

  assert.equal(result.quality, 'relevant');
  assert.deepEqual(capturedOptions, { temperature: 0, maxTokens: 8192, rejectTruncated: true });
});
