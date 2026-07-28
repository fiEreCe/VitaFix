const test = require('node:test');
const assert = require('node:assert/strict');
const cases = require('../evaluations/pf002Cases');
const { runEvaluationSuite } = require('../services/agent/pf002EvaluationRunner');

test('PF-002 fixed evaluation suite covers 12 orchestrated and 30 atomic safety cases', async () => {
  assert.equal(cases.filter((item) => item.id.startsWith('E2E-')).length, 12);
  assert.equal(cases.filter((item) => item.id.startsWith('A-')).length, 30);
  assert.equal(new Set(cases.map((item) => item.title)).size, 42);
  assert.ok(cases.filter((item) => item.id.startsWith('E2E-')).every((item) => item.flow.length === 5));
  const report = await runEvaluationSuite(cases);
  assert.equal(report.total, 42);
  assert.equal(report.failed, 0, JSON.stringify(report.results.filter((item) => !item.pass)));
  assert.ok(report.results
    .filter((item) => item.caseId.startsWith('E2E-'))
    .every((item) => item.execution === 'orchestrator'));
  assert.ok(report.ruleVersion); assert.ok(report.schemaVersion); assert.ok(report.generatedAt);
});
