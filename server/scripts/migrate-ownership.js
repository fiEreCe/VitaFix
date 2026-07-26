const mongoose = require('mongoose');
process.env.DOTENV_CONFIG_QUIET = 'true';
const config = require('../config');
const Analysis = require('../models/Analysis');
const AgentSession = require('../models/AgentSession');
const JD = require('../models/JD');
const Resume = require('../models/Resume');
const Supplement = require('../models/Supplement');
const { runOwnershipMigration } = require('../services/ownershipMigration');

async function main() {
  const dryRun = process.argv.slice(2).includes('--dry-run');
  try {
    await mongoose.connect(config.mongodbUri, { serverSelectionTimeoutMS: 5000 });
    const summary = await runOwnershipMigration({
      analyses: Analysis,
      agentSessions: AgentSession,
      jds: JD,
      resumes: Resume,
      supplements: Supplement,
    }, { dryRun });
    console.log(JSON.stringify(summary));
  } catch (error) {
    console.error(`Ownership migration failed: ${error.message}`);
    process.exitCode = 1;
  } finally {
    await mongoose.disconnect();
  }
}

void main();
