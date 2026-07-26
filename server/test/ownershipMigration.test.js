const test = require('node:test');
const assert = require('node:assert/strict');

const JD = require('../models/JD');
const Resume = require('../models/Resume');
const Supplement = require('../models/Supplement');
const {
  createMongooseOwnershipRepositories,
  runOwnershipMigration,
} = require('../services/ownershipMigration');

function collection(rows) {
  return {
    rows: rows.map((row) => ({ ...row })),
    updates: [],
    scans: [],
    reads: [],
    async *scan(options) {
      this.scans.push(options);
      const keys = options.projection.split(/\s+/);
      for (const row of [...this.rows].sort((a, b) => String(a._id).localeCompare(String(b._id)))) {
        yield Object.fromEntries(keys.filter((key) => key in row).map((key) => [key, row[key]]));
      }
    },
    async findById(id, options) {
      this.reads.push({ id, ...options });
      const row = this.rows.find((item) => item._id === id);
      return row ? { found: true, ...row } : { found: false };
    },
    async updateOne(filter, update) {
      this.updates.push({ filter, update });
      const row = this.rows.find((item) => item._id === filter._id && (!filter.userId || item.userId === filter.userId));
      if (!row) return { matchedCount: 0, modifiedCount: 0 };
      Object.assign(row, update.$set);
      return { matchedCount: 1, modifiedCount: 1 };
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
    jd: { updated: 1, unchanged: 0, conflicts: 1, orphaned: 1, updatedIds: ['jd-unique'], conflictIds: ['jd-conflict'], orphanedIds: ['jd-orphan'] },
    resume: { updated: 1, unchanged: 0, conflicts: 2, orphaned: 0, updatedIds: ['resume-unique'], conflictIds: ['resume-conflict', 'resume-owned-different'], orphanedIds: [] },
    supplement: { updated: 0, unchanged: 1, conflicts: 0, orphaned: 1, updatedIds: [], conflictIds: [], orphanedIds: ['supp-orphan'] },
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

test('concurrent owner assignment is re-read and reported exactly instead of as updated', async () => {
  const repos = {
    analyses: collection([{ _id: 'a1', userId: 'u1', jdId: 'jd1' }]),
    agentSessions: collection([]),
    jds: collection([{ _id: 'jd1' }]),
    resumes: collection([]),
    supplements: collection([]),
  };
  repos.jds.updateOne = async () => {
    repos.jds.rows[0].userId = 'u2';
    return { matchedCount: 0, modifiedCount: 0 };
  };
  const summary = await runOwnershipMigration(repos, { dryRun: false });
  assert.equal(summary.jd.updated, 0);
  assert.equal(summary.jd.conflicts, 1);
  assert.deepEqual(summary.jd.updatedIds, []);
  assert.deepEqual(summary.jd.conflictIds, ['jd1']);
});

test('concurrent assignment to the proven owner is re-read as unchanged', async () => {
  const repos = {
    analyses: collection([{ _id: 'a1', userId: 'u1', jdId: 'jd1' }]),
    agentSessions: collection([]),
    jds: collection([{ _id: 'jd1' }]),
    resumes: collection([]),
    supplements: collection([]),
  };
  repos.jds.updateOne = async () => {
    repos.jds.rows[0].userId = 'u1';
    return { matchedCount: 0, modifiedCount: 0 };
  };
  const summary = await runOwnershipMigration(repos, { dryRun: false });
  assert.equal(summary.jd.updated, 0);
  assert.equal(summary.jd.unchanged, 1);
  assert.deepEqual(summary.jd.conflictIds, []);
});

test('duplicate Supplement owner-resume index collision is a conflict and later resources still migrate', async () => {
  const repos = {
    analyses: collection([
      { _id: 'a1', userId: 'u1', supplementId: 'supp-collision' },
      { _id: 'a2', userId: 'u2', supplementId: 'supp-independent' },
    ]),
    agentSessions: collection([]),
    jds: collection([]),
    resumes: collection([]),
    supplements: collection([
      { _id: 'supp-collision', resumeId: 'resume-1' },
      { _id: 'supp-existing', userId: 'u1', resumeId: 'resume-1' },
      { _id: 'supp-independent', resumeId: 'resume-2' },
    ]),
  };
  const baseUpdate = repos.supplements.updateOne.bind(repos.supplements);
  repos.supplements.updateOne = async (filter, update) => {
    if (filter._id === 'supp-collision') {
      const error = new Error('duplicate owner-resume');
      error.code = 11000;
      throw error;
    }
    return baseUpdate(filter, update);
  };

  const summary = await runOwnershipMigration(repos, { dryRun: false });
  assert.equal(repos.supplements.rows.find((row) => row._id === 'supp-collision').userId, undefined);
  assert.equal(repos.supplements.rows.find((row) => row._id === 'supp-independent').userId, 'u2');
  assert.equal(summary.supplement.updated, 1);
  assert.deepEqual(summary.supplement.updatedIds, ['supp-independent']);
  assert.equal(summary.supplement.conflicts, 1);
  assert.deepEqual(summary.supplement.conflictIds, ['supp-collision']);
  assert.deepEqual(repos.supplements.reads, [{
    id: 'supp-collision',
    projection: '_id userId resumeId',
  }]);
});

test('E11000 reread with the proven owner is unchanged rather than conflicted', async () => {
  const repos = {
    analyses: collection([{ _id: 'a1', userId: 'u1', supplementId: 'supp1' }]),
    agentSessions: collection([]),
    jds: collection([]),
    resumes: collection([]),
    supplements: collection([{ _id: 'supp1', resumeId: 'resume1' }]),
  };
  repos.supplements.updateOne = async () => {
    repos.supplements.rows[0].userId = 'u1';
    const error = new Error('duplicate');
    error.code = 11000;
    throw error;
  };
  const summary = await runOwnershipMigration(repos, { dryRun: false });
  assert.equal(summary.supplement.unchanged, 1);
  assert.equal(summary.supplement.conflicts, 0);
  assert.deepEqual(summary.supplement.conflictIds, []);
});

test('E11000 reread of a missing resource is unchanged rather than conflicted', async () => {
  const repos = {
    analyses: collection([{ _id: 'a1', userId: 'u1', supplementId: 'supp1' }]),
    agentSessions: collection([]),
    jds: collection([]),
    resumes: collection([]),
    supplements: collection([{ _id: 'supp1', resumeId: 'resume1' }]),
  };
  repos.supplements.updateOne = async () => {
    repos.supplements.rows.splice(0, 1);
    const error = new Error('duplicate');
    error.code = 11000;
    throw error;
  };
  const summary = await runOwnershipMigration(repos, { dryRun: false });
  assert.equal(summary.supplement.unchanged, 1);
  assert.equal(summary.supplement.conflicts, 0);
  assert.deepEqual(summary.supplement.conflictIds, []);
});

test('non-duplicate migration write failures are not reclassified as ownership conflicts', async () => {
  const repos = {
    analyses: collection([{ _id: 'a1', userId: 'u1', supplementId: 'supp1' }]),
    agentSessions: collection([]),
    jds: collection([]),
    resumes: collection([]),
    supplements: collection([{ _id: 'supp1', resumeId: 'resume1' }]),
  };
  repos.supplements.updateOne = async () => {
    const error = new Error('database unavailable');
    error.code = 91;
    throw error;
  };
  await assert.rejects(
    () => runOwnershipMigration(repos, { dryRun: false }),
    /database unavailable/,
  );
  assert.deepEqual(repos.supplements.reads, []);
});

test('migration scans sorted projections only and never requests raw payload fields', async () => {
  const repos = repositories();
  await runOwnershipMigration(repos, { dryRun: true });
  assert.deepEqual(repos.analyses.scans, [{
    projection: '_id userId jdId resumeId supplementId',
    sort: { _id: 1 },
  }]);
  assert.deepEqual(repos.agentSessions.scans, [{
    projection: '_id userId jdId resumeId',
    sort: { _id: 1 },
  }]);
  for (const repository of [repos.jds, repos.resumes, repos.supplements]) {
    assert.deepEqual(repository.scans, [{
      projection: '_id userId',
      sort: { _id: 1 },
    }]);
  }
  const allRequested = Object.values(repos).flatMap((repo) => repo.scans.map((scan) => scan.projection)).join(' ');
  assert.doesNotMatch(allRequested, /rawText|inputSnapshot|analysis/);
});

test('Mongoose adapters build projected sorted lean cursors instead of materializing full documents', async () => {
  const calls = [];
  function Model(name) {
    return {
      find(filter, projection) {
        const call = { name, filter, projection };
        calls.push(call);
        return {
          sort(value) { call.sort = value; return this; },
          lean() { call.lean = true; return this; },
          cursor() {
            call.cursor = true;
            return (async function* rows() {})();
          },
        };
      },
    };
  }
  const repositories = createMongooseOwnershipRepositories({
    Analysis: Model('analysis'),
    AgentSession: Model('session'),
    JD: Model('jd'),
    Resume: Model('resume'),
    Supplement: Model('supplement'),
  });
  for await (const ignored of repositories.analyses.scan({
    projection: '_id userId jdId resumeId supplementId',
    sort: { _id: 1 },
  })) void ignored;
  assert.deepEqual(calls, [{
    name: 'analysis',
    filter: {},
    projection: '_id userId jdId resumeId supplementId',
    sort: { _id: 1 },
    lean: true,
    cursor: true,
  }]);
});

test('audit ID ordering is stable across shuffled input and matches dry-run ordering', async () => {
  const shuffled = repositories();
  shuffled.jds.rows.reverse();
  shuffled.resumes.rows.reverse();
  shuffled.supplements.rows.reverse();
  shuffled.analyses.rows.reverse();
  const dry = await runOwnershipMigration(shuffled, { dryRun: true });
  const actual = await runOwnershipMigration(repositories(), { dryRun: false });
  for (const key of ['jd', 'resume', 'supplement']) {
    assert.deepEqual(dry[key].updatedIds, actual[key].updatedIds);
    assert.deepEqual(dry[key].conflictIds, actual[key].conflictIds);
    assert.deepEqual(dry[key].orphanedIds, actual[key].orphanedIds);
  }
});
