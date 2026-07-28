function calculateSufficiency(fact = {}) {
  const basic = Boolean(fact.action && fact.context && fact.contribution);
  if (!basic) return 'insufficient';
  return fact.method || fact.result ? 'strong' : 'basic';
}

const FACT_FIELDS = Object.freeze([
  'action', 'context', 'contribution', 'method', 'result', 'quantity', 'quantityType',
]);

function mergeFacts(facts = []) {
  return facts.reduce((merged, fact) => {
    FACT_FIELDS.forEach((field) => {
      const value = fact?.[field];
      if (value !== undefined && value !== null && value !== '') merged[field] = value;
    });
    return merged;
  }, {});
}

function applyAnswerQuality(turn, quality) {
  if (quality === 'off_topic') {
    return turn.clarificationUsed
      ? { ...turn, next: 'return_control' }
      : { ...turn, clarificationUsed: true, next: 'clarify' };
  }
  const consumesRound = ['relevant', 'partial', 'unknown', 'not_done'].includes(quality);
  return {
    ...turn,
    effectiveRounds: turn.effectiveRounds + Number(consumesRound),
    next: quality === 'not_done' ? 'capability_gap' : 'confirm_or_reassess',
  };
}

function classifyGap(quality) {
  return quality === 'not_done' ? 'capability' : 'information';
}

function nextInsufficientAction({ effectiveRounds, sufficiency }) {
  if (sufficiency !== 'insufficient') return 'generate';
  return effectiveRounds >= 3 ? 'return_control' : 'question';
}

module.exports = {
  FACT_FIELDS,
  applyAnswerQuality,
  calculateSufficiency,
  classifyGap,
  mergeFacts,
  nextInsufficientAction,
};
