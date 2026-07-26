function asId(value) {
  if (value === null || value === undefined) return null;
  return String(value);
}

function addProof(map, resourceId, userId) {
  const id = asId(resourceId);
  if (!id || !userId) return;
  if (!map.has(id)) map.set(id, new Set());
  map.get(id).add(String(userId));
}

function createMongooseRepository(Model) {
  return {
    scan({ projection, sort }) {
      return Model.find({}, projection).sort(sort).lean().cursor();
    },
    updateOne: (...args) => Model.updateOne(...args),
    async findById(id, { projection }) {
      const value = await Model.findOne({ _id: id }, projection).lean();
      return value ? { found: true, ...value } : { found: false };
    },
  };
}

function createMongooseOwnershipRepositories({
  Analysis,
  AgentSession,
  JD,
  Resume,
  Supplement,
}) {
  return {
    analyses: createMongooseRepository(Analysis),
    agentSessions: createMongooseRepository(AgentSession),
    jds: createMongooseRepository(JD),
    resumes: createMongooseRepository(Resume),
    supplements: createMongooseRepository(Supplement),
  };
}

function emptyResult() {
  return {
    updated: 0,
    unchanged: 0,
    conflicts: 0,
    orphaned: 0,
    updatedIds: [],
    conflictIds: [],
    orphanedIds: [],
  };
}

function record(result, classification, id) {
  if (classification === 'updated') {
    result.updated += 1;
    result.updatedIds.push(id);
  } else if (classification === 'conflict') {
    result.conflicts += 1;
    result.conflictIds.push(id);
  } else if (classification === 'orphaned') {
    result.orphaned += 1;
    result.orphanedIds.push(id);
  } else {
    result.unchanged += 1;
  }
}

async function migrateResources(repository, proofs, dryRun) {
  const result = emptyResult();
  const resources = repository.scan({
    projection: '_id userId',
    sort: { _id: 1 },
  });

  for await (const resource of resources) {
    const id = asId(resource._id);
    const owners = proofs.get(id) || new Set();
    if (owners.size > 1) {
      record(result, 'conflict', id);
      continue;
    }
    if (owners.size === 0) {
      record(result, resource.userId ? 'unchanged' : 'orphaned', id);
      continue;
    }

    const [provenOwner] = owners;
    if (resource.userId) {
      record(result, String(resource.userId) === provenOwner ? 'unchanged' : 'conflict', id);
      continue;
    }
    if (dryRun) {
      record(result, 'updated', id);
      continue;
    }

    let write;
    try {
      write = await repository.updateOne(
        { _id: resource._id, userId: resource.userId ?? null },
        { $set: { userId: provenOwner } },
      );
    } catch (error) {
      if (error?.code !== 11000) throw error;
      await repository.findById(resource._id, {
        projection: '_id userId resumeId',
      });
      record(result, 'conflict', id);
      continue;
    }
    if (write.modifiedCount === 1) {
      record(result, 'updated', id);
      continue;
    }

    const current = await repository.findById(resource._id, {
      projection: '_id userId resumeId',
    });
    if (!current.found) record(result, 'unchanged', id);
    else if (current.userId && String(current.userId) === provenOwner) record(result, 'unchanged', id);
    else record(result, 'conflict', id);
  }

  result.updatedIds.sort();
  result.conflictIds.sort();
  result.orphanedIds.sort();
  return result;
}

async function runOwnershipMigration(repositories, { dryRun = false } = {}) {
  const proofs = { jd: new Map(), resume: new Map(), supplement: new Map() };
  for await (const analysis of repositories.analyses.scan({
    projection: '_id userId jdId resumeId supplementId',
    sort: { _id: 1 },
  })) {
    addProof(proofs.jd, analysis.jdId, analysis.userId);
    addProof(proofs.resume, analysis.resumeId, analysis.userId);
    addProof(proofs.supplement, analysis.supplementId, analysis.userId);
  }
  for await (const session of repositories.agentSessions.scan({
    projection: '_id userId jdId resumeId',
    sort: { _id: 1 },
  })) {
    addProof(proofs.jd, session.jdId, session.userId);
    addProof(proofs.resume, session.resumeId, session.userId);
  }

  return {
    dryRun: Boolean(dryRun),
    jd: await migrateResources(repositories.jds, proofs.jd, dryRun),
    resume: await migrateResources(repositories.resumes, proofs.resume, dryRun),
    supplement: await migrateResources(repositories.supplements, proofs.supplement, dryRun),
  };
}

module.exports = {
  createMongooseOwnershipRepositories,
  runOwnershipMigration,
};
