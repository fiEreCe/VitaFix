const test = require('node:test');
const assert = require('node:assert/strict');

const {
  buildSupplementFacts,
  normalizeSupplementItems,
} = require('../services/agent/supplementEvidence');

test('normalizes the Supplement schema fields and drops unusable items', () => {
  const items = normalizeSupplementItems([
    {
      _id: 'supplement-1',
      userId: 'u1',
      type: '实习',
      title: '  数据分析实习  ',
      period: ' 2024.06-2024.09 ',
      description: ' 使用SQL分析用户行为 ',
      includedInResume: true,
    },
    { type: '其他', title: '   ', description: '' },
    null,
    'invalid',
  ]);

  assert.deepEqual(items, [{
    type: '实习',
    title: '数据分析实习',
    period: '2024.06-2024.09',
    description: '使用SQL分析用户行为',
    includedInResume: true,
  }]);
});

test('builds pending supplement evidence with title, period, and description', () => {
  const facts = buildSupplementFacts([{
    type: '项目',
    title: '数据分析项目',
    period: '2024',
    description: '使用SQL分析用户行为',
    includedInResume: false,
  }], { resumeText: '与补充经历无关的简历正文', startIndex: 2 });

  assert.deepEqual(facts, [{
    id: 'fact-3',
    sourceText: '数据分析项目 | 时间：2024 | 使用SQL分析用户行为',
    action: '使用SQL分析用户行为',
    context: '数据分析项目',
    contribution: '用户补充的项目经历',
    method: '',
    result: '',
    quantity: '',
    confirmation: 'pending_confirmation',
    confirmationSource: 'auto',
    source: 'supplement',
  }]);
});

test('skips items already included in the resume or duplicated in resume facts', () => {
  const facts = buildSupplementFacts([{
    type: '项目',
    title: '校园项目',
    period: '',
    description: '参与问卷设计',
    includedInResume: true,
  }, {
    type: '项目',
    title: '校园项目',
    period: '',
    description: '参与问卷设计',
    includedInResume: false,
  }], {
    resumeText: '校园项目：参与问卷设计',
    resumeFacts: [{ id: 'fact-1', sourceText: '参与问卷设计' }],
  });

  assert.deepEqual(facts, []);
});

test('deduplicates repeated supplement items and tolerates missing fields', () => {
  const facts = buildSupplementFacts([
    { type: '实习', title: '数据分析实习', description: '使用SQL分析用户行为' },
    { type: '实习', title: '数据分析实习', description: '使用SQL分析用户行为' },
    { type: '其他', title: '', description: '只有描述的用户补充经历' },
    { type: '竞赛', title: '数学建模', period: '2023', description: '' },
  ], { resumeText: '' });

  assert.deepEqual(facts.map((fact) => fact.id), ['fact-1', 'fact-2', 'fact-3']);
  assert.match(facts[0].sourceText, /使用SQL分析用户行为/);
  assert.match(facts[1].sourceText, /只有描述的用户补充经历/);
  assert.match(facts[2].sourceText, /数学建模/);
  assert.match(facts[2].sourceText, /时间：2023/);
});

test('empty or missing supplements produce no evidence', () => {
  assert.deepEqual(buildSupplementFacts(undefined), []);
  assert.deepEqual(buildSupplementFacts([]), []);
  assert.deepEqual(buildSupplementFacts(null, { resumeText: '简历' }), []);
});
