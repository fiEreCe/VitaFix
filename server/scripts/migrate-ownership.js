const mongoose = require('mongoose');
process.env.DOTENV_CONFIG_QUIET = 'true';
const config = require('../config');
const Analysis = require('../models/Analysis');
const AgentSession = require('../models/AgentSession');
const JD = require('../models/JD');
const Resume = require('../models/Resume');
const Supplement = require('../models/Supplement');
const {
  createMongooseOwnershipRepositories,
  runOwnershipMigration,
} = require('../services/ownershipMigration');

async function runMigrationCli({
  argv = process.argv.slice(2),
  mongoose: database = mongoose,
  repositories = createMongooseOwnershipRepositories({
    Analysis,
    AgentSession,
    JD,
    Resume,
    Supplement,
  }),
  runMigration = runOwnershipMigration,
  processState = process,
  logger = console,
} = {}) {
  const dryRun = argv.includes('--dry-run');
  let summary = null;
  try {
    await database.connect(config.mongodbUri, { serverSelectionTimeoutMS: 5000 });
    summary = await runMigration(repositories, { dryRun });
  } catch (error) {
    logger.error(`Ownership migration failed: ${error.message}`);
    processState.exitCode = 1;
  } finally {
    try {
      await database.disconnect();
    } catch (error) {
      logger.error(`Ownership migration disconnect failed: ${error.message}`);
      processState.exitCode = 1;
      summary = null;
    }
  }
  if (summary && processState.exitCode !== 1) logger.log(JSON.stringify(summary));
  return summary;
}

if (require.main === module) {
  runMigrationCli().catch((error) => {
    console.error(`Ownership migration failed: ${error.message}`);
    process.exitCode = 1;
  });
}

module.exports = { runMigrationCli };
