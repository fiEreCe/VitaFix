const mongoose = require('mongoose');
mongoose.set('transactionAsyncLocalStorage', true);
const DAYS = 7 * 86400000;
// Reference creation and deletion write the same material document in transactions.
async function createWithInputs(value, save) {
  return mongoose.connection.transaction(async () => {
    for (const [model, id] of [['JD', value.jdId], ['Resume', value.resumeId]]) {
      const result = await mongoose.model(model).updateOne(
        { _id: id, userId: value.userId }, { $inc: { retentionVersion: 1 } },
      );
      if (result.matchedCount !== 1) throw new Error('INPUT_NOT_FOUND');
    }
    return save();
  });
}
function createRetentionService({ Analysis, AgentSession, JD, Resume, Supplement,
  transaction = (fn) => mongoose.connection.transaction(fn), now = () => new Date() } = {}) {
  const tasks = [Analysis, AgentSession];
  async function referenced(field, id) {
    if (!id) return false;
    for (const model of tasks) if (await model.countDocuments({ [field]: id })) return true;
    return false;
  }
  async function prune(model, field, row) {
    if (!row.userId || await referenced(field, row._id)) return;
    if (field === 'resumeId') {
      for (const supplement of await Supplement.find({ resumeId: row._id, userId: row.userId })) {
        if (!await referenced('supplementId', supplement._id)) {
          await Supplement.deleteOne({ _id: supplement._id, userId: row.userId });
        }
      }
    }
    await model.deleteOne({ _id: row._id, userId: row.userId });
  }
  async function pruneInputs(record) {
    for (const [model, field] of [[JD, 'jdId'], [Resume, 'resumeId']]) {
      if (!record[field]) continue;
      const row = await model.findOne({ _id: record[field], userId: record.userId });
      if (row) await prune(model, field, row);
    }
    if (record.supplementId && !await referenced('supplementId', record.supplementId)
      && !await referenced('resumeId', record.resumeId)) {
      await Supplement.deleteOne({ _id: record.supplementId, userId: record.userId });
    }
  }
  async function remove(type, id, userId) {
    if (!userId) throw new Error('OWNER_REQUIRED');
    return transaction(async () => {
      const model = type === 'agent' ? AgentSession : Analysis;
      const record = await model.findOne({ _id: id, userId });
      if (!record) return { deleted: false };
      await model.deleteOne({ _id: id, userId });
      await pruneInputs(record);
      return { deleted: true };
    });
  }
  async function cleanup() {
    const time = now();
    const cutoff = new Date(time.getTime() - DAYS);
    for (const [type, model, filter] of [
      ['analysis', Analysis, { createdAt: { $lte: cutoff } }],
      ['agent', AgentSession, { $or: [{ expiresAt: { $lte: time } }, { expiresAt: { $exists: false }, createdAt: { $lte: cutoff } }] }],
    ]) for (const row of await model.find(filter)) await remove(type, row._id, row.userId);
    for (const [model, field] of [[JD, 'jdId'], [Resume, 'resumeId'], [Supplement, 'supplementId']]) {
      for (const row of await model.find({ createdAt: { $lte: cutoff } })) {
        await transaction(async () => {
          const current = await model.findOne({ _id: row._id, userId: row.userId, createdAt: { $lte: cutoff } });
          if (!current) return;
          if (field === 'supplementId' && await referenced('resumeId', current.resumeId)) return;
          await prune(model, field, current);
        });
      }
    }
  }
  return { remove, cleanup };
}
function service() {
  return createRetentionService(Object.fromEntries(['Analysis', 'AgentSession', 'JD', 'Resume', 'Supplement'].map(name => [name, require(`../models/${name}`)])));
}
module.exports = { createRetentionService, createWithInputs, service, DAYS };
