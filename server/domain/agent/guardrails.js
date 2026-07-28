const {
  evidenceOverlap,
  extractNumberClaims,
} = require('./textEvidence');

const matches = (text, expression) => expression.test(String(text || ''));
const RESPONSIBILITY_EXPANSION = /主导|牵头|带领|统筹|独立|负责|决策|全权负责/;
const PARTICIPATION = /参与|协助|配合/;
const TEAM_ATTRIBUTION = /团队|共同/;

function factSource(fact) {
  return [
    fact.sourceText,
    fact.action,
    fact.context,
    fact.contribution,
    fact.method,
    fact.result,
    fact.quantity,
  ].filter(Boolean).join(' ');
}

function numberClaimsForFacts(facts) {
  return facts.flatMap((fact) => extractNumberClaims(factSource(fact)).map((claim) => ({
    ...claim,
    quantityType: fact.quantityType || 'exact',
  })));
}

function numberContextCompatible(candidateClaim, factClaim) {
  if (
    candidateClaim.unitCategory
    && factClaim.unitCategory
    && candidateClaim.unitCategory !== factClaim.unitCategory
  ) return false;
  if (
    candidateClaim.purpose
    && factClaim.purpose
    && candidateClaim.purpose !== factClaim.purpose
  ) return false;
  return true;
}

function findingsFor(text, facts) {
  const findings = [];
  const source = facts.map(factSource).join(' ');
  const factNumberClaims = numberClaimsForFacts(facts);
  const candidateNumberClaims = extractNumberClaims(text);
  const unknownNumber = candidateNumberClaims.some((claim) => (
    !factNumberClaims.some((factClaim) => factClaim.value === claim.value)
  ));
  if (unknownNumber) findings.push({ type: 'unconfirmed_number' });
  const changedNumberContext = candidateNumberClaims.some((claim) => {
    const sameValue = factNumberClaims.filter((factClaim) => factClaim.value === claim.value);
    return sameValue.length > 0
      && !sameValue.some((factClaim) => numberContextCompatible(claim, factClaim));
  });
  if (changedNumberContext) findings.push({ type: 'number_context_expansion' });
  const estimatedNumbers = new Set(
    factNumberClaims
      .filter((claim) => claim.quantityType === 'estimated')
      .map((claim) => claim.value),
  );
  const usedNumbers = candidateNumberClaims.map((claim) => claim.value);
  const hasEstimateQualifier = /\u7ea6|\u5927\u7ea6|\u4f30\u7b97/.test(text);
  if (usedNumbers.some((number) => estimatedNumbers.has(number))) findings.push({ type: hasEstimateQualifier ? 'estimated_number' : 'unqualified_estimate' });
  if (facts.some((fact) => matches(factSource(fact), TEAM_ATTRIBUTION)) && matches(text, RESPONSIBILITY_EXPANSION)) findings.push({ type: 'attribution_expansion' });
  else if (facts.some((fact) => matches(factSource(fact), PARTICIPATION)) && matches(text, RESPONSIBILITY_EXPANSION)) findings.push({ type: 'responsibility_expansion' });
  if (matches(text, /\u4e0a\u7ebf|\u5546\u4e1a\u9879\u76ee/) && !matches(source, /\u4e0a\u7ebf|\u5546\u4e1a/)) findings.push({ type: 'project_status_expansion' });
  if (matches(text, /\u8bc1\u4e66|\u8ba4\u8bc1/) && !matches(source, /\u8bc1\u4e66|\u8ba4\u8bc1/)) findings.push({ type: 'credential_fabrication' });
  const skills = String(text).match(/\b(?:Python|Java|Go|React|Vue|SQL|Docker|Kubernetes)\b/gi) || [];
  if (skills.some((skill) => !new RegExp(`\\b${skill}\\b`, 'i').test(source))) findings.push({ type: 'skill_fabrication' });
  if (matches(text, /\u4f7f\u7528|\u5e94\u7528/) && matches(source, /\u5b66\u4e60|\u8bfe\u7a0b|\u7ec3\u4e60/) && !matches(source, /\u4f7f\u7528|\u5e94\u7528/)) findings.push({ type: 'learning_to_experience_expansion' });
  if (text && source && evidenceOverlap(text, source) < 0.15) findings.push({ type: 'unsupported_claim_semantics' });
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
