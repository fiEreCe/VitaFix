const test = require('node:test');
const assert = require('node:assert/strict');
const { createCleanupService } = require('../services/cleanup');

function model(rows) {
  return {
    rows: rows.map((row) => ({ ...row })),
    deletes: [],
    async find(filter = {}) {
      return this.rows
        .filter((row) => !filter.status?.$in || filter.status.$in.includes(row.status))
        .map((row) => ({ ...row }));
    },
    async countDocuments(filter) {
      return this.rows.filter((row) => (
        row._id !== filter._id?.$ne
        && (!filter.jdId || row.jdId === filter.jdId)
        && (!filter.resumeId || row.resumeId === filter.resumeId)
        && (!filter.supplementId || row.supplementId === filter.supplementId)
      )).length;
    },
    async deleteOne(filter) {
      this.deletes.push(filter);
      const index = this.rows.findIndex((row) => row._id === filter._id && row.userId === filter.userId);
      if (index < 0) return { deletedCount: 0 };
      this.rows.splice(index, 1);
      return { deletedCount: 1 };
    },
  };
}

test('cleanup never deletes foreign resources and counts only confirmed deletions', async () => {
  const Analysis = model([
    { _id: 'a1', userId: 'u1', jdId: 'jd-foreign', resumeId: 'r-owned', supplementId: 's-foreign', status: 'completed' },
  ]);
  const JD = model([{ _id: 'jd-foreign', userId: 'u2' }]);
  const Resume = model([{ _id: 'r-owned', userId: 'u1' }]);
  const Supplement = model([{ _id: 's-foreign', userId: 'u2' }]);
  const cleanup = createCleanupService({
    Analysis, JD, Resume, Supplement,
    now: () => new Date('2030-01-10'),
    logger: { log() {}, error() {} },
  });

  const summary = await cleanup();
  assert.deepEqual(JD.deletes, [{ _id: 'jd-foreign', userId: 'u1' }]);
  assert.deepEqual(Supplement.deletes, [{ _id: 's-foreign', userId: 'u1' }]);
  assert.equal(JD.rows.length, 1);
  assert.equal(Supplement.rows.length, 1);
  assert.deepEqual(summary, { analyses: 1, jd: 0, resumes: 1, supplements: 0 });
  assert.deepEqual(Analysis.deletes, [{ _id: 'a1', userId: 'u1' }]);
});

test('cleanup deletes matching-owner resources only when no other analysis references them', async () => {
  const Analysis = model([
    { _id: 'old', userId: 'u1', jdId: 'shared-jd', resumeId: 'unique-r', supplementId: 'unique-s', status: 'failed' },
    { _id: 'new', userId: 'u1', jdId: 'shared-jd', resumeId: 'other-r', status: 'processing' },
  ]);
  const JD = model([{ _id: 'shared-jd', userId: 'u1' }]);
  const Resume = model([{ _id: 'unique-r', userId: 'u1' }, { _id: 'other-r', userId: 'u1' }]);
  const Supplement = model([{ _id: 'unique-s', userId: 'u1' }]);
  const cleanup = createCleanupService({
    Analysis, JD, Resume, Supplement,
    logger: { log() {}, error() {} },
  });

  const summary = await cleanup();
  assert.equal(JD.deletes.length, 0);
  assert.equal(Resume.rows.some((row) => row._id === 'unique-r'), false);
  assert.equal(Supplement.rows.length, 0);
  assert.deepEqual(summary, { analyses: 1, jd: 0, resumes: 1, supplements: 1 });
});
