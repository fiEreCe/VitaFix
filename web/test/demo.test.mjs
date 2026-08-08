import test from 'node:test'
import assert from 'node:assert/strict'

import { demoFixture } from '../src/demo/fixture.js'
import { shouldTrackPage } from '../src/utils/analytics.js'

test('demo fixture has a complete real validation record', () => {
  assert.deepEqual(
    Object.keys(demoFixture).sort(),
    ['evaluationVersion', 'isDemo', 'session', 'version'],
  )
  assert.equal(demoFixture.isDemo, true)
  assert.equal(demoFixture.session.state, 'ready_for_reevaluation')
  const task = demoFixture.session.tasks[0]
  const record = task.validationRecords.at(-1)
  assert.ok(record.id)
  assert.equal(record.diff.before, record.baselineText)
  assert.equal(record.diff.after, record.currentText)
  assert.deepEqual(Object.keys(record.evidenceCoverage).sort(), ['after', 'before'])
  assert.equal(record.evaluationVersion.ruleVersion, 'pf002-rules-2')
  assert.ok(Object.isFrozen(demoFixture.session.tasks))
  assert.ok(Object.isFrozen(record))
})

test('demo fixture keeps workflow business data inside session only', () => {
  for (const key of ['requirements', 'resumeFacts', 'tasks']) {
    assert.equal(Object.hasOwn(demoFixture, key), false)
    assert.ok(Array.isArray(demoFixture.session[key]))
  }
})

test('demo page is excluded from product page views', () => {
  assert.equal(shouldTrackPage('GuidedDemo'), false)
  assert.equal(shouldTrackPage('Home'), true)
})
