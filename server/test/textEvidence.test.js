const test = require('node:test');
const assert = require('node:assert/strict');

const { evidenceOverlap } = require('../domain/agent/textEvidence');
const { AgentToolService } = require('../services/agent/agentToolService');

test('matches overlapping Chinese requirement and evidence', () => {
  const score = evidenceOverlap(
    '具备用户研究与需求分析能力',
    '参与校园产品用户研究，完成访谈和需求分析',
  );

  assert.ok(score >= 0.25);
});

test('does not match unrelated Chinese text from a single common character', () => {
  const score = evidenceOverlap(
    '负责用户研究与需求分析',
    '负责财务报表与税务申报',
  );

  assert.ok(score < 0.25);
});

test('agent evidence matching uses Chinese overlap and skill synonyms', async () => {
  const service = new AgentToolService();
  const result = await service.matchEvidence({
    requirements: [
      { id: 'r1', sourceText: '具备用户研究与需求分析能力', priority: 10 },
      { id: 'r2', sourceText: '熟悉 TypeScript', priority: 9 },
    ],
    facts: [
      { id: 'f1', sourceText: '参与校园产品用户研究，完成访谈和需求分析' },
      { id: 'f2', sourceText: '使用 TS 开发管理后台' },
    ],
  });

  assert.deepEqual(result.matches[0].factIds, ['f1']);
  assert.deepEqual(result.matches[1].factIds, ['f2']);
});

test('agent answer assessment validates structured AI output', async () => {
  const service = new AgentToolService({
    ai: {
      chatJSON: async () => ({
        quality: 'partial',
        factPatch: { action: '设计访谈提纲' },
        missingFields: ['context'],
        questionHint: '服务什么场景？',
      }),
    },
  });

  const result = await service.assessAnswer({
    requirement: { sourceText: '用户研究' },
    confirmedFact: {},
    question: '你做了什么？',
    answer: '设计访谈提纲',
  });

  assert.equal(result.quality, 'partial');
});
