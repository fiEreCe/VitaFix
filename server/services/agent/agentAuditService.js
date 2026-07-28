const deepseekService = require('../deepseekService');
const { validateToolResult } = require('../../domain/agent/contracts');
const { AUDIT_REVISION_PROMPT } = require('../../utils/promptTemplates');
const { evaluateCandidate, evaluationVersion } = require('./pf002Evaluator');

const PROMPT_VERSION = 'pf002-audit-prompt-1';

async function defaultJudge(input) {
  return deepseekService.chatJSON(AUDIT_REVISION_PROMPT(input), {
    temperature: 0,
    maxTokens: 1600,
  });
}

class AgentAuditService {
  constructor({ judge = defaultJudge } = {}) {
    this.judge = judge;
  }

  async verifyRevision({ candidate, facts, requirement }) {
    const deterministic = evaluateCandidate(candidate, facts);
    if (['blocked', 'unavailable'].includes(deterministic.status)) return deterministic;

    let semantic;
    try {
      semantic = validateToolResult('verifyRevision', await this.judge({
        candidate,
        facts,
        requirement,
      }));
      if (!['passed', 'warning', 'blocked', 'unavailable'].includes(semantic.status)) {
        throw new Error('INVALID_SEMANTIC_AUDIT_STATUS');
      }
      const deterministicRefs = new Set(deterministic.factRefs || []);
      if (semantic.factRefs.some((id) => !deterministicRefs.has(id))) {
        throw new Error('UNKNOWN_SEMANTIC_FACT_REF');
      }
    } catch (error) {
      return {
        status: 'unavailable',
        findings: [
          ...(deterministic.findings || []),
          { type: 'semantic_audit_unavailable', message: error.message },
        ],
        supportedClaims: [],
        unsupportedClaims: [],
        factRefs: deterministic.factRefs || [],
        evaluationVersion: { ...evaluationVersion(), promptVersion: PROMPT_VERSION },
      };
    }

    if (semantic.status === 'unavailable') {
      return {
        ...semantic,
        status: 'unavailable',
        findings: [...(deterministic.findings || []), ...(semantic.findings || [])],
        evaluationVersion: { ...evaluationVersion(), promptVersion: PROMPT_VERSION },
      };
    }

    const semanticBlocked = ['blocked', 'unsupported'].includes(semantic.status)
      || semantic.unsupportedClaims.length > 0;
    const status = semanticBlocked
      ? 'blocked'
      : deterministic.status === 'warning' || semantic.status === 'warning'
        ? 'warning'
        : 'passed';
    return {
      ...semantic,
      status,
      findings: [...(deterministic.findings || []), ...(semantic.findings || [])],
      factRefs: semantic.factRefs.length ? semantic.factRefs : deterministic.factRefs,
      evaluationVersion: { ...evaluationVersion(), promptVersion: PROMPT_VERSION },
    };
  }
}

module.exports = new AgentAuditService();
module.exports.AgentAuditService = AgentAuditService;
module.exports.PROMPT_VERSION = PROMPT_VERSION;
