const crypto = require('crypto');
const { evaluateCandidate } = require('./pf002Evaluator');
function diff(before, after) { return { before, after, changed: before !== after }; }
function validate({ baselineText, currentText, facts, factRefs = [], semanticJudge }) {
  const safety = evaluateCandidate({ text: currentText, factRefs }, facts);
  const semantic = semanticJudge ? semanticJudge({ baselineText, currentText }) : { relevance: currentText.length >= baselineText.length ? 'improved' : 'unchanged', quality: currentText !== baselineText ? 'improved' : 'unchanged' };
  const changeOutcome = safety.status === 'blocked' ? 'tradeoff' : currentText === baselineText ? 'unchanged' : semantic.quality === 'regressed' ? 'regressed' : 'improved';
  return { id: crypto.randomUUID(), baselineText, currentText, diff: diff(baselineText, currentText), changeOutcome, safetyStatus: safety.status, evidenceCoverage: { before: 0, after: safety.factRefs?.length || 0 }, improvements: changeOutcome === 'improved' ? ['表达更贴近岗位要求'] : [], remainingIssues: safety.findings, nextActions: safety.status === 'blocked' ? ['修正风险表述或确认事实'] : ['可采用当前文本或继续优化'], evaluationVersion: safety.evaluationVersion, createdAt: new Date().toISOString() };
}
module.exports = { validate };
