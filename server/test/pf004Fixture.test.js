const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('fs');
const path = require('path');
const { pathToFileURL } = require('url');

test('PF-004 fixture replays real PF-001 through PF-003 contracts without live APIs', async () => {
  const fixturePath = path.join(__dirname, '../../web/src/demo/fixture.js');
  const { demoFixture } = await import(pathToFileURL(fixturePath).href);
  const task = demoFixture.session.tasks[0];
  const fact = demoFixture.session.resumeFacts[0];
  const record = task.validationRecords.at(-1);

  assert.equal(demoFixture.isDemo, true);
  assert.equal(demoFixture.session.state, 'ready_for_reevaluation');
  assert.equal(task.state, 'ready_for_reevaluation');
  assert.equal(fact.confirmation, 'confirmed');
  assert.equal(task.candidate.verification.status, 'passed');
  assert.ok(task.candidate.factRefs.every((id) => task.factIds.includes(id)));
  assert.ok(record.id);
  assert.deepEqual(record.diff, {
    before: record.baselineText,
    after: record.currentText,
    changed: true,
  });
  assert.deepEqual(Object.keys(record.evidenceCoverage).sort(), ['after', 'before']);
  assert.equal(record.evaluationVersion.promptVersion, 'pf003-validation-prompt-1');

  const source = fs.readFileSync(fixturePath, 'utf8');
  assert.doesNotMatch(source, /fetch\(|agentSessionApi|analysisApi/);
});
