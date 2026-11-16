const { service } = require('./retention');
module.exports = async function cleanupOldData() {
  try { await service().cleanup(); }
  catch (error) { console.error('[cleanup] Failed; retry on next run', error.code || error.name); throw error; }
};
