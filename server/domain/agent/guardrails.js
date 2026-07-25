function findingsFor(text, facts) {
  const findings = [];
  const allowedNumbers = new Set(facts.flatMap((fact) => String(fact.quantity || '').match(/\d+(?:\.\d+)?/g) || []));
  const usedNumbers = String(text).match(/\d+(?:\.\d+)?/g) || [];
  if (usedNumbers.some((number) => !allowedNumbers.has(number))) findings.push({ type: 'unconfirmed_number' });
  if (facts.some((fact) => /团队|共同/.test(fact.contribution || '')) && /独立|个人负责|主导/.test(text)) {
    findings.push({ type: 'attribution_expansion' });
  }
  return findings;
}

function verifyCandidate(candidate, facts) {
  const referenced = facts.filter((fact) => candidate.factRefs.includes(fact.id) && ['confirmed', 'corrected'].includes(fact.confirmation));
  const findings = findingsFor(candidate.text, referenced);
  if (referenced.length !== candidate.factRefs.length) findings.push({ type: 'unsupported_claim' });
  return { status: findings.length ? 'unsupported' : 'passed', findings, factRefs: referenced.map((fact) => fact.id) };
}

function inspectUserEdit(text, facts) {
  return { canSave: true, verificationStatus: 'unverified_user_content', findings: findingsFor(text, facts) };
}

module.exports = { verifyCandidate, inspectUserEdit };
