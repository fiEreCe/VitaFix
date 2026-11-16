const test = require('node:test');
const assert = require('node:assert/strict');

const resumeParser = require('../services/resumeParser');
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

test('resume parsing adds supplement facts and skips duplicate or included items', async (t) => {
  const originalParse = resumeParser.parse;
  resumeParser.parse = async () => ({
    projects: [{ name: '校园项目', role: '成员', description: '参与问卷设计' }],
    experience: [],
  });
  t.after(() => { resumeParser.parse = originalParse; });

  const service = new AgentToolService();
  const { facts } = await service.parseResume('简历：校园项目 参与问卷设计', [{
    type: '实习',
    title: '数据分析实习',
    period: '2024.06-2024.09',
    description: '使用SQL分析用户行为',
    includedInResume: false,
  }, {
    // 与简历正文重复，不能重复计为新增证据
    type: '项目',
    title: '校园项目',
    period: '',
    description: '参与问卷设计',
    includedInResume: false,
  }, {
    // 用户标记已在简历中包含，跳过
    type: '竞赛',
    title: '数学建模竞赛',
    period: '2023',
    description: '负责模型构建',
    includedInResume: true,
  }, {
    // 没有可用内容
    type: '其他',
    title: '  ',
    period: '',
    description: '',
    includedInResume: false,
  }]);

  assert.equal(facts.length, 2);
  assert.equal(facts[0].source, 'resume');
  const supplement = facts.find((fact) => fact.source === 'supplement');
  assert.equal(supplement.id, 'fact-2');
  assert.match(supplement.sourceText, /数据分析实习/);
  assert.match(supplement.sourceText, /2024\.06-2024\.09/);
  assert.match(supplement.sourceText, /使用SQL分析用户行为/);
  assert.equal(supplement.confirmation, 'confirmed');

  const matched = await service.matchEvidence({
    requirements: [{ id: 'r1', sourceText: '熟练使用SQL进行数据分析', priority: 10 }],
    facts,
  });
  assert.deepEqual(matched.matches[0].factIds, [supplement.id]);
});

test('resume parsing without supplements keeps the original fact flow', async (t) => {
  const originalParse = resumeParser.parse;
  resumeParser.parse = async () => ({
    projects: [{ name: '校园项目', role: '成员', description: '参与问卷设计' }],
    experience: [],
  });
  t.after(() => { resumeParser.parse = originalParse; });

  const service = new AgentToolService();
  const withoutSupplement = await service.parseResume('简历');
  const withEmptySupplement = await service.parseResume('简历', []);

  assert.deepEqual(withEmptySupplement, withoutSupplement);
  assert.deepEqual(withoutSupplement.facts.map((fact) => fact.id), ['fact-1']);
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
