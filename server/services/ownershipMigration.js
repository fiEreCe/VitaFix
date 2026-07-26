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

async function migrateResources(repository, proofs, dryRun) {
  const result = { updated: 0, unchanged: 0, conflicts: 0, orphaned: 0 };
  const resources = await repository.find({});
  resources.sort((left, right) => asId(left._id).localeCompare(asId(right._id)));

  for (const resource of resources) {
    const owners = proofs.get(asId(resource._id)) || new Set();
    if (owners.size > 1) {
      result.conflicts += 1;
      continue;
    }
    if (owners.size === 0) {
      if (resource.userId) result.unchanged += 1;
      else result.orphaned += 1;
      continue;
    }

    const [provenOwner] = owners;
    if (resource.userId) {
      if (String(resource.userId) === provenOwner) result.unchanged += 1;
      else result.conflicts += 1;
      continue;
    }

    result.updated += 1;
    if (!dryRun) {
      await repository.updateOne(
        { _id: resource._id, userId: resource.userId ?? null },
        { $set: { userId: provenOwner } },
      );
    }
  }
  return result;
}

async function runOwnershipMigration(repositories, { dryRun = false } = {}) {
  const proofs = { jd: new Map(), resume: new Map(), supplement: new Map() };
  const [analyses, sessions] = await Promise.all([
    repositories.analyses.find({}),
    repositories.agentSessions.find({}),
  ]);

  for (const analysis of analyses) {
    addProof(proofs.jd, analysis.jdId, analysis.userId);
    addProof(proofs.resume, analysis.resumeId, analysis.userId);
    addProof(proofs.supplement, analysis.supplementId, analysis.userId);
  }
  for (const session of sessions) {
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

module.exports = { runOwnershipMigration };
