const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');

const scriptPath = path.join(__dirname, '../scripts/migrate-ownership.js');
const source = fs.readFileSync(scriptPath, 'utf8');
const isImportSafe = source.includes('require.main === module') && source.includes('module.exports');

test('migration CLI is import-safe and exports a testable runner', () => {
  assert.equal(isImportSafe, true);
});

test('disconnect rejection is handled and produces a nonzero exit code', async (t) => {
  if (!isImportSafe) return t.skip('runner is not import-safe yet');
  const { runMigrationCli } = require('../scripts/migrate-ownership');
  const processState = { exitCode: 0 };
  const errors = [];
  const result = await runMigrationCli({
    argv: ['--dry-run'],
    mongoose: {
      connect: async () => {},
      disconnect: async () => { throw new Error('disconnect failed'); },
    },
    repositories: {},
    runMigration: async () => ({ dryRun: true }),
    processState,
    logger: { log() {}, error(value) { errors.push(value); } },
  });
  assert.equal(result, null);
  assert.equal(processState.exitCode, 1);
  assert.match(errors.at(-1), /disconnect failed/);
});
