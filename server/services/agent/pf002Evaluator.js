const { verifyCandidate } = require('../../domain/agent/guardrails');

const RULE_VERSION = 'pf002-rules-2';
const SCHEMA_VERSION = 'pf002-schema-2';
const evaluationVersion = () => ({ ruleVersion: RULE_VERSION, schemaVersion: SCHEMA_VERSION, modelVersion: process.env.AI_MODEL || 'deepseek-chat', promptVersion: 'pf002-audit-prompt-1', codeVersion: process.env.GIT_COMMIT || 'local' });

function evaluateCandidate(candidate, facts) {
  try {
    if (!candidate || !candidate.text || !Array.isArray(candidate.factRefs)) return { status: 'unavailable', findings: [{ type: 'invalid_schema' }], evaluationVersion: evaluationVersion() };
    const result = verifyCandidate(candidate, facts);
    if (result.status === 'passed') return { ...result, status: result.findings.some((item) => item.type === 'estimated_number') ? 'warning' : 'passed', evaluationVersion: evaluationVersion() };
    return { ...result, status: 'blocked', evaluationVersion: evaluationVersion() };
  } catch (error) { return { status: 'unavailable', findings: [{ type: 'evaluation_unavailable', message: error.message }], evaluationVersion: evaluationVersion() }; }
}

function runCases(cases) {
  const results = cases.map((item) => {
    const actual = evaluateCandidate(item.candidate, item.facts);
    return { caseId: item.id, expected: item.expected, actual: actual.status, pass: actual.status === item.expected, findings: actual.findings };
  });
  return { generatedAt: new Date().toISOString(), ruleVersion: RULE_VERSION, schemaVersion: SCHEMA_VERSION, total: results.length, passed: results.filter((item) => item.pass).length, failed: results.filter((item) => !item.pass).length, results };
}
module.exports = {
  RULE_VERSION,
  SCHEMA_VERSION,
  evaluateCandidate,
  evaluationVersion,
  runCases,
};
