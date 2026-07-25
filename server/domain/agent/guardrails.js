const matches = (text, expression) => expression.test(String(text || ''));

function findingsFor(text, facts) {
  const findings = [];
  const source = facts.map((fact) => [fact.sourceText, fact.action, fact.context, fact.contribution, fact.method, fact.result].join(' ')).join(' ');
  const allowedNumbers = new Set(facts.flatMap((fact) => String(fact.quantity || '').match(/\d+(?:\.\d+)?/g) || []));
  const usedNumbers = String(text).match(/\d+(?:\.\d+)?/g) || [];
  if (usedNumbers.some((number) => !allowedNumbers.has(number))) findings.push({ type: 'unconfirmed_number' });
  const estimatedNumbers = new Set(facts.filter((fact) => fact.quantityType === 'estimated').flatMap((fact) => String(fact.quantity || '').match(/\d+(?:\.\d+)?/g) || []));
  const hasEstimateQualifier = /\u7ea6|\u5927\u7ea6|\u4f30\u7b97/.test(text);
  if (usedNumbers.some((number) => estimatedNumbers.has(number))) findings.push({ type: hasEstimateQualifier ? 'estimated_number' : 'unqualified_estimate' });
  if (facts.some((fact) => matches(fact.contribution, /\u56e2\u961f|\u5171\u540c/)) && matches(text, /\u72ec\u7acb|\u4e2a\u4eba\u8d1f\u8d23|\u4e3b\u5bfc/)) findings.push({ type: 'attribution_expansion' });
  if (facts.some((fact) => matches([fact.sourceText, fact.contribution].join(' '), /\u53c2\u4e0e|\u534f\u52a9/)) && matches(text, /\u8d1f\u8d23|\u4e3b\u5bfc|\u51b3\u7b56/)) findings.push({ type: 'responsibility_expansion' });
  if (matches(text, /\u4e0a\u7ebf|\u5546\u4e1a\u9879\u76ee/) && !matches(source, /\u4e0a\u7ebf|\u5546\u4e1a/)) findings.push({ type: 'project_status_expansion' });
  if (matches(text, /\u8bc1\u4e66|\u8ba4\u8bc1/) && !matches(source, /\u8bc1\u4e66|\u8ba4\u8bc1/)) findings.push({ type: 'credential_fabrication' });
  const skills = String(text).match(/\b(?:Python|Java|Go|React|Vue|SQL|Docker|Kubernetes)\b/gi) || [];
  if (skills.some((skill) => !new RegExp(`\\b${skill}\\b`, 'i').test(source))) findings.push({ type: 'skill_fabrication' });
  if (matches(text, /\u4f7f\u7528|\u5e94\u7528/) && matches(source, /\u5b66\u4e60|\u8bfe\u7a0b|\u7ec3\u4e60/) && !matches(source, /\u4f7f\u7528|\u5e94\u7528/)) findings.push({ type: 'learning_to_experience_expansion' });
  return findings;
}

function verifyCandidate(candidate, facts) {
  if (!Array.isArray(candidate.factRefs) || candidate.factRefs.length === 0) return { status: 'unsupported', findings: [{ type: 'missing_fact_reference' }], factRefs: [] };
  const referenced = facts.filter((fact) => candidate.factRefs.includes(fact.id) && ['confirmed', 'corrected'].includes(fact.confirmation));
  const findings = findingsFor(candidate.text, referenced);
  if (referenced.length !== candidate.factRefs.length) findings.push({ type: 'unsupported_claim' });
  const blockingFindings = findings.filter((item) => item.type !== 'estimated_number');
  return { status: blockingFindings.length ? 'unsupported' : 'passed', findings, factRefs: referenced.map((fact) => fact.id) };
}

function inspectUserEdit(text, facts) { return { canSave: true, verificationStatus: 'unverified_user_content', findings: findingsFor(text, facts) }; }

module.exports = { verifyCandidate, inspectUserEdit };
