const test = require('node:test');
const assert = require('node:assert/strict');

const JD = require('../models/JD');
const Resume = require('../models/Resume');
const Supplement = require('../models/Supplement');
const { runOwnershipMigration } = require('../services/ownershipMigration');

function collection(rows) {
  return {
    rows: rows.map((row) => ({ ...row })),
    updates: [],
    async find() { return this.rows.map((row) => ({ ...row })); },
    async updateOne(filter, update) {
      this.updates.push({ filter, update });
      const row = this.rows.find((item) => item._id === filter._id && (!filter.userId || item.userId === filter.userId));
      if (!row) return { modifiedCount: 0 };
      Object.assign(row, update.$set);
      return { modifiedCount: 1 };
    },
  };
}

function repositories() {
  return {
    analyses: collection([
      { _id: 'a1', userId: 'u1', jdId: 'jd-unique', resumeId: 'resume-conflict', supplementId: 'supp-same' },
      { _id: 'a2', userId: 'u2', jdId: 'jd-conflict', resumeId: 'resume-conflict' },
      { _id: 'a3', userId: 'u1', jdId: 'jd-conflict', resumeId: 'resume-owned-different' },
    ]),
    agentSessions: collection([
      { _id: 's1', userId: 'u1', jdId: 'jd-unique', resumeId: 'resume-unique' },
    ]),
    jds: collection([
      { _id: 'jd-unique' },
      { _id: 'jd-conflict' },
      { _id: 'jd-orphan' },
    ]),
    resumes: collection([
      { _id: 'resume-unique', userId: null },
      { _id: 'resume-conflict' },
      { _id: 'resume-owned-different', userId: 'u9' },
    ]),
    supplements: collection([
      { _id: 'supp-same', userId: 'u1' },
      { _id: 'supp-orphan' },
    ]),
  };
}

test('legacy ownership fields are nullable and serialize when present', () => {
  for (const Model of [JD, Resume, Supplement]) {
    assert.equal(Model.schema.path('userId').options.index, true);
    const legacy = new Model(Model === Supplement ? { resumeId: '507f1f77bcf86cd799439011' } : { rawText: 'legacy' });
    assert.equal(legacy.toObject().userId, undefined);
    const owned = new Model(Model === Supplement
      ? { resumeId: '507f1f77bcf86cd799439011', userId: 'u1' }
      : { rawText: 'owned', userId: 'u1' });
    assert.equal(owned.toObject().userId, 'u1');
  }
});

test('migration assigns only uniquely proven owners and reports conflicts and orphans', async () => {
  const repos = repositories();
  const summary = await runOwnershipMigration(repos, { dryRun: false });

  assert.deepEqual(summary, {
    dryRun: false,
    jd: { updated: 1, unchanged: 0, conflicts: 1, orphaned: 1 },
    resume: { updated: 1, unchanged: 0, conflicts: 2, orphaned: 0 },
    supplement: { updated: 0, unchanged: 1, conflicts: 0, orphaned: 1 },
  });
  assert.equal(repos.jds.rows.find((row) => row._id === 'jd-unique').userId, 'u1');
  assert.equal(repos.jds.rows.find((row) => row._id === 'jd-conflict').userId, undefined);
  assert.equal(repos.resumes.rows.find((row) => row._id === 'resume-owned-different').userId, 'u9');
});

test('dry run reports prospective updates without writing and repeated migration is idempotent', async () => {
  const dryRepos = repositories();
  const drySummary = await runOwnershipMigration(dryRepos, { dryRun: true });
  assert.equal(drySummary.jd.updated, 1);
  assert.equal(drySummary.resume.updated, 1);
  assert.equal(dryRepos.jds.updates.length + dryRepos.resumes.updates.length, 0);

  const repos = repositories();
  await runOwnershipMigration(repos, { dryRun: false });
  const repeated = await runOwnershipMigration(repos, { dryRun: false });
  assert.equal(repeated.jd.updated, 0);
  assert.equal(repeated.jd.unchanged, 1);
  assert.equal(repeated.resume.updated, 0);
  assert.equal(repeated.resume.unchanged, 1);
});
