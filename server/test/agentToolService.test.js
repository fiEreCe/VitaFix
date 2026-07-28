const test = require('node:test');
const assert = require('node:assert/strict');

const { AgentToolService } = require('../services/agent/agentToolService');

test('PF-003 modification evaluation calls the model exactly once and validates output', async () => {
  let calls = 0;
  const service = new AgentToolService({
    ai: {
      chatJSON: async () => {
        calls += 1;
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
});
