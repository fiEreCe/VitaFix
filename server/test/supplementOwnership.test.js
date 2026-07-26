const test = require('node:test');
const assert = require('node:assert/strict');
const Supplement = require('../models/Supplement');
const { createSupplementController } = require('../controllers/supplementController');

function response() {
  return {
    statusCode: 200, body: null,
    status(code) { this.statusCode = code; return this; },
    json(value) { this.body = value; return this; },
  };
}

test('Supplement schema enforces one record per owner and resume while allowing legacy null owners', () => {
  const index = Supplement.schema.indexes().find(([keys]) => keys.userId === 1 && keys.resumeId === 1);
  assert.deepEqual(index, [
    { userId: 1, resumeId: 1 },
    { unique: true, partialFilterExpression: { userId: { $type: 'string' } } },
  ]);
  const legacy = new Supplement({ resumeId: '507f1f77bcf86cd799439011' });
  assert.equal(legacy.userId, undefined);
});

test('foreign or missing Resume returns 404 without a supplement write', async () => {
  let writes = 0;
  const controller = createSupplementController({
    Resume: { exists: async () => null },
    Supplement: { findOneAndUpdate: async () => { writes += 1; } },
  });
  for (const resumeId of ['missing', 'foreign']) {
    const res = response();
    await controller.upsert({ userId: 'u1', body: { resumeId, items: [] } }, res);
    assert.equal(res.statusCode, 404);
  }
  assert.equal(writes, 0);
});

test('upsert is atomic and owner-qualified so an ownership race cannot mutate another user', async () => {
  let filter;
  let update;
  let options;
  const controller = createSupplementController({
    Resume: { exists: async (value) => value.userId === 'u1' },
    Supplement: {
      findOneAndUpdate: async (...args) => {
        [filter, update, options] = args;
        return { _id: 's1', items: update.$set.items };
      },
    },
  });
  const res = response();
  await controller.upsert({ userId: 'u1', body: { resumeId: 'r1', items: [{ title: 'x' }] } }, res);
  assert.deepEqual(filter, { userId: 'u1', resumeId: 'r1' });
  assert.equal(update.$setOnInsert.userId, 'u1');
  assert.equal(update.$setOnInsert.resumeId, 'r1');
  assert.deepEqual(options, { upsert: true, new: true, runValidators: true });
  assert.equal(res.body.id, 's1');
});

test('duplicate-key race retries without upsert and cannot create a duplicate', async () => {
  const calls = [];
  const controller = createSupplementController({
    Resume: { exists: async () => true },
    Supplement: {
      async findOneAndUpdate(filter, update, options) {
        calls.push({ filter, update, options });
        if (calls.length === 1) {
          const error = new Error('duplicate');
          error.code = 11000;
          throw error;
        }
        return { _id: 'existing', items: update.$set.items };
      },
    },
  });
  const res = response();
  await controller.upsert({ userId: 'u1', body: { resumeId: 'r1', items: [] } }, res);
  assert.equal(calls.length, 2);
  assert.deepEqual(calls[1].filter, { userId: 'u1', resumeId: 'r1' });
  assert.deepEqual(calls[1].options, { new: true, runValidators: true });
  assert.equal(res.body.id, 'existing');
});
