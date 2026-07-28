const crypto = require('crypto');
const { validateToolResult } = require('../../domain/agent/contracts');
const { evaluateCandidate } = require('./pf002Evaluator');

const PROMPT_VERSION = 'pf003-validation-prompt-1';

function diff(before, after) {
  return { before, after, changed: before !== after };
}

function uniqueKnownRefs(refs, knownIds) {
  return [...new Set(refs)].filter((id) => knownIds.has(id));
}

function changeOutcomeFor(baselineText, currentText, semantic) {
  if (baselineText === currentText) return 'unchanged';
  const values = [semantic.relevance, semantic.quality];
  const improved = values.includes('improved');
  const regressed = values.includes('regressed');
  if (improved && regressed) return 'tradeoff';
  if (regressed) return 'regressed';
  if (improved) return 'improved';
  return 'unchanged';
}

function safetyStatusFor(deterministic, semantic) {
  if (semantic.safetyStatus === 'unavailable' || deterministic.status === 'unavailable') {
    return 'unavailable';
  }
  if (deterministic.status === 'blocked' || semantic.safetyStatus === 'blocked') {
    return 'blocked';
  }
  if (deterministic.status === 'warning' || semantic.safetyStatus === 'warning') {
    return 'warning';
  }
  return 'passed';
}

function unavailableRecord({
  baselineText,
  currentText,
  deterministic,
  message,
}) {
  return {
    id: crypto.randomUUID(),
    baselineText,
    currentText,
    diff: diff(baselineText, currentText),
    changeOutcome: 'unchanged',
    safetyStatus: 'unavailable',
    evidenceCoverage: { before: 0, after: 0 },
    improvements: [],
    remainingIssues: [
      ...(deterministic.findings || []),
      { type: 'semantic_evaluation_unavailable', message },
    ],
    nextActions: ['语义验证暂不可用，请稍后重试'],
    evaluationVersion: {
      ...(deterministic.evaluationVersion || {}),
      promptVersion: PROMPT_VERSION,
    },
    createdAt: new Date().toISOString(),
  };
}

async function validate({
  baselineText,
  currentText,
  facts,
  factRefs = [],
  requirement,
  semanticJudge,
}) {
  const deterministic = evaluateCandidate({ text: currentText, factRefs }, facts);
  if (typeof semanticJudge !== 'function') {
    return unavailableRecord({
      baselineText,
      currentText,
      deterministic,
      message: 'SEMANTIC_JUDGE_NOT_CONFIGURED',
    });
  }

  let semantic;
  try {
    semantic = validateToolResult('evaluateModification', await semanticJudge({
      baselineText,
      currentText,
      facts,
      factRefs,
      requirement,
    }));
    const knownIds = new Set(facts.map((fact) => fact.id));
    const semanticRefs = [...semantic.beforeFactRefs, ...semantic.afterFactRefs];
    if (semanticRefs.some((id) => !knownIds.has(id))) {
      throw new Error('UNKNOWN_MODIFICATION_FACT_REF');
    }
  } catch (error) {
    return unavailableRecord({
      baselineText,
      currentText,
      deterministic,
      message: error.message,
    });
  }

  const knownIds = new Set(facts.map((fact) => fact.id));
  const beforeFactRefs = uniqueKnownRefs(semantic.beforeFactRefs, knownIds);
  const afterFactRefs = uniqueKnownRefs(semantic.afterFactRefs, knownIds);
  const safetyStatus = safetyStatusFor(deterministic, semantic);
  return {
    id: crypto.randomUUID(),
    baselineText,
    currentText,
    diff: diff(baselineText, currentText),
    changeOutcome: changeOutcomeFor(baselineText, currentText, semantic),
    safetyStatus,
    evidenceCoverage: {
      before: beforeFactRefs.length,
      after: afterFactRefs.length,
    },
    improvements: semantic.improvements,
    remainingIssues: [
      ...(deterministic.findings || []),
      ...semantic.remainingIssues,
      ...semantic.safetyFindings,
    ],
    nextActions: semantic.nextActions,
    evaluationVersion: {
      ...(deterministic.evaluationVersion || {}),
      promptVersion: PROMPT_VERSION,
    },
    createdAt: new Date().toISOString(),
  };
}

module.exports = { PROMPT_VERSION, validate };
