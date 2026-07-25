const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('fs');
const path = require('path');

test('PF-004 fixture replays PF-001, PF-002 and PF-003 state fields without live AI', () => {
  const file = fs.readFileSync(path.join(__dirname, '../../web/src/demo/fixture.js'), 'utf8');
  ['isDemo: true', 'session:', 'requirements:', 'resumeFacts:', 'tasks:', 'validationRecords:', 'jd:', 'fact:', 'question:', 'candidate:', 'safetyStatus:', 'changeOutcome:'].forEach((field) => assert.match(file, new RegExp(field)));
  assert.doesNotMatch(file, /fetch\(|agentSessionApi|analysisApi/);
});
