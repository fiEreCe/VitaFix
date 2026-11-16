const test = require('node:test');
const assert = require('node:assert/strict');
const { createRetentionService } = require('../services/retention');
test('retention service exposes atomic deletion and sweeping', () => {
 const service = createRetentionService({});
 assert.equal(typeof service.remove, 'function');
 assert.equal(typeof service.cleanup, 'function');
});
