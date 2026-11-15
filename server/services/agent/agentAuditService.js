const deepseekService = require('../deepseekService');
const { validateToolResult } = require('../../domain/agent/contracts');
const { AUDIT_REVISION_PROMPT } = require('../../utils/promptTemplates');
const { evaluateCandidate, evaluationVersion } = require('./pf002Evaluator');

const PROMPT_VERSION = 'pf002-audit-prompt-1';
// 推理模型的 reasoning_tokens 也计入 max_tokens；1600 会被推理耗尽，
// 导致 finish_reason=length 且 content 为空。结构化审核输出不允许截断。
const SEMANTIC_AUDIT_MAX_TOKENS = 8192;

async function defaultJudge(input) {
  return deepseekService.chatJSON(AUDIT_REVISION_PROMPT(input), {
    temperature: 0,
    maxTokens: SEMANTIC_AUDIT_MAX_TOKENS,
    rejectTruncated: true,
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
      const finding = { type: 'semantic_audit_unavailable', message: error.message };
      // 保留服务层错误码，便于区分截断、非法 JSON、超时和契约失败。
      if (error.code) finding.code = error.code;
      if (error.finishReason) finding.finishReason = error.finishReason;
      return {
        status: 'unavailable',
        findings: [...(deterministic.findings || []), finding],
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
module.exports.SEMANTIC_AUDIT_MAX_TOKENS = SEMANTIC_AUDIT_MAX_TOKENS;
