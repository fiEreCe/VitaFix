function calculateSufficiency(fact = {}) {
  const basic = Boolean(fact.action && fact.context && fact.contribution);
  if (!basic) return 'insufficient';
  return fact.method || fact.result ? 'strong' : 'basic';
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

module.exports = { calculateSufficiency, applyAnswerQuality, classifyGap, nextInsufficientAction };
