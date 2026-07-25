const SESSION_STATES = Object.freeze([
  'draft', 'parsing', 'matching', 'evidence_ready', 'task_in_progress',
  'ready_for_reevaluation', 'completed', 'cancelled', 'expired',
]);

const TASK_STATES = Object.freeze([
  'pending', 'assessing_evidence', 'questioning', 'awaiting_fact_confirmation',
  'generating', 'verifying', 'awaiting_user_decision', 'accepted', 'user_edited',
  'rejected', 'skipped', 'capability_gap', 'ready_for_reevaluation',
  'completed_with_risk',
  'parse_failed', 'match_failed', 'question_failed', 'generation_failed', 'verification_failed',
]);

const ANSWER_QUALITIES = Object.freeze(['relevant', 'partial', 'off_topic', 'contradictory', 'unknown', 'not_done']);
const FACT_CONFIRMATIONS = Object.freeze(['extracted', 'pending_confirmation', 'confirmed', 'corrected', 'rejected']);
const SUFFICIENCY = Object.freeze(['strong', 'basic', 'insufficient']);
const GAP_TYPES = Object.freeze(['expression', 'information', 'capability']);
const VERIFICATION_RESULTS = Object.freeze(['passed', 'warning', 'blocked', 'unavailable', 'repairable', 'needs_confirmation', 'unsupported', 'system_error']);

function fail(code) {
  const error = new Error(code);
  error.code = code;
  throw error;
}

function assertEnum(value, allowed, code) {
  if (!allowed.includes(value)) fail(code);
}

function validateToolResult(toolName, value) {
  if (!value || typeof value !== 'object') fail('INVALID_TOOL_RESULT');
  if (toolName === 'matchEvidence') {
    if (!Array.isArray(value.requirements) || !Array.isArray(value.facts) || !Array.isArray(value.matches)) fail('INVALID_MATCH_SCHEMA');
    const requirementIds = new Set(value.requirements.map((item) => item.id));
    const factIds = new Set(value.facts.map((item) => item.id));
    value.matches.forEach((match) => {
      if (!requirementIds.has(match.requirementId)) fail('UNKNOWN_REQUIREMENT_REF');
      (match.factIds || []).forEach((id) => { if (!factIds.has(id)) fail('UNKNOWN_FACT_REF'); });
      assertEnum(match.gapType, GAP_TYPES, 'INVALID_GAP_TYPE');
    });
  }
  if (toolName === 'assessAnswer') assertEnum(value.quality, ANSWER_QUALITIES, 'INVALID_ANSWER_QUALITY');
  if (toolName === 'verifyRevision') assertEnum(value.status, VERIFICATION_RESULTS, 'INVALID_VERIFICATION_STATUS');
  if (toolName === 'draftRevision' && (!value.text || !Array.isArray(value.factRefs))) fail('INVALID_DRAFT_SCHEMA');
  return value;
}

module.exports = {
  SESSION_STATES, TASK_STATES, ANSWER_QUALITIES, FACT_CONFIRMATIONS, SUFFICIENCY,
  GAP_TYPES, VERIFICATION_RESULTS, validateToolResult,
};
