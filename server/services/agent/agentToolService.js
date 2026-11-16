const jdParser = require('../jdParser');
const resumeParser = require('../resumeParser');
const deepseekService = require('../deepseekService');
const auditService = require('./agentAuditService');
const skillSynonyms = require('../../data/skill-synonyms.json');
const { validateToolResult } = require('../../domain/agent/contracts');
const { evidenceOverlap, normalizeText } = require('../../domain/agent/textEvidence');
const { buildSupplementFacts } = require('./supplementEvidence');
const {
  ASSESS_ANSWER_PROMPT,
  MODIFICATION_VALIDATION_PROMPT,
} = require('../../utils/promptTemplates');

const synonymGroups = Object.entries(skillSynonyms)
  .filter(([key, values]) => !key.startsWith('_') && Array.isArray(values))
  .map(([key, values]) => [key, ...values].map(normalizeText).filter(Boolean));

function hasSynonymMatch(left, right) {
  const leftText = normalizeText(left);
  const rightText = normalizeText(right);
  return synonymGroups.some((group) => (
    group.some((term) => leftText.includes(term))
    && group.some((term) => rightText.includes(term))
  ));
}

class AgentToolService {
  constructor({ ai = deepseekService } = {}) {
    this.ai = ai;
  }

  async parseJD(rawText) {
    const parsed = await jdParser.parse(rawText);
    const requirements = [...(parsed.requirements || []), ...(parsed.responsibilities || [])].map((sourceText, index) => ({ id: `req-${index + 1}`, sourceText, priority: 100 - index }));
    return { requirements: requirements.length ? requirements : [{ id: 'req-1', sourceText: parsed.position || '岗位要求', priority: 100 }] };
  }
  async parseResume(rawText, supplements = []) {
    const parsed = await resumeParser.parse(rawText);
    const entries = [...(parsed.projects || []), ...(parsed.experience || [])];
    // 自动解析只产生“待确认”事实：用户核对前不得进入候选生成与审核。
    const resumeFacts = entries.map((item, index) => ({
      id: `fact-${index + 1}`, sourceText: item.description || item.name || item.position || '', action: item.description || item.role || '',
      context: item.name || item.company || '', contribution: item.role || '参与相关工作', method: '', result: '', quantity: '',
      confirmation: 'pending_confirmation', confirmationSource: 'auto', source: 'resume',
    })).filter((item) => item.sourceText);
    const facts = resumeFacts.length
      ? resumeFacts
      : [{ id: 'fact-1', sourceText: rawText.slice(0, 300), action: '', context: '', contribution: '', confirmation: 'pending_confirmation', confirmationSource: 'auto', source: 'resume' }];
    const supplementFacts = buildSupplementFacts(supplements, {
      resumeText: rawText,
      resumeFacts: facts,
      startIndex: facts.length,
    });
    return { facts: [...facts, ...supplementFacts] };
  }
  async matchEvidence({ requirements, facts }) {
    return { matches: requirements.map((requirement) => {
      const matched = facts.filter((fact) => (
        evidenceOverlap(requirement.sourceText, fact.sourceText) >= 0.25
        || hasSynonymMatch(requirement.sourceText, fact.sourceText)
      )).map((fact) => fact.id);
      return { requirementId: requirement.id, factIds: matched, gapType: matched.length ? 'expression' : 'information', priority: requirement.priority };
    }) };
  }
  async assessAnswer(input) {
    // 推理模型的 reasoning_tokens 也计入 max_tokens；1000 会被推理耗尽导致 content 为空。
    const result = await this.ai.chatJSON(ASSESS_ANSWER_PROMPT(input), {
      temperature: 0,
      maxTokens: 8192,
      rejectTruncated: true,
    });
    return validateToolResult('assessAnswer', result);
  }
  async evaluateModification(input) {
    // 同一模型下 1600 也可能被推理耗尽；结构化输出不允许截断。
    const result = await this.ai.chatJSON(MODIFICATION_VALIDATION_PROMPT(input), {
      temperature: 0,
      maxTokens: 8192,
      rejectTruncated: true,
    });
    return validateToolResult('evaluateModification', result);
  }
  async draftRevision({ requirement, facts = [] }) {
    // Never merge slots across experiences. Each evidence record keeps its own clause.
    const eligible = facts.filter(f => ['confirmed', 'corrected'].includes(f.confirmation));
    const fields = ['context', 'contribution', 'action', 'method', 'result', 'quantity'];
    const evidence = f => fields.map(k => f[k]).filter(Boolean).join(' ') || f.sourceText || '';
    const seeds = eligible.filter(f => evidenceOverlap(requirement.sourceText, evidence(f)) >= 0.25
      || hasSynonymMatch(requirement.sourceText, evidence(f)));
    const contexts = new Set(seeds.map(f => normalizeText(f.context)).filter(Boolean));
    const selected = eligible.filter(f => seeds.includes(f)
      || (f.context && contexts.has(normalizeText(f.context))));
    const clauses = [];
    const factRefs = [];
    for (const fact of selected) {
      let parts = [...new Set(fields.map(k => String(fact[k] || '').trim()).filter(Boolean))];
      if (!parts.length && fact.sourceText) parts = [fact.sourceText];
      let clause = parts.join('；');
      if (!clause) continue;
      // Source qualifiers survive even when structured extraction omitted them.
      for (const qualifier of ['课程项目', '团队', '共同', '参与', '协助', '配合']) {
        if (String(fact.sourceText || '').includes(qualifier) && !clause.includes(qualifier)) clause = `${qualifier}；${clause}`;
      }
      if (fact.quantityType === 'unconfirmed' && /\d/.test(clause)) {
        throw new Error('INSUFFICIENT_CONFIRMED_QUANTITY');
      }
      if (fact.quantityType === 'estimated') clause = clause.replace(/(?<![约\d])(\d+(?:\.\d+)?)/g, '约$1');
      clauses.push(clause);
      factRefs.push(fact.id);
    }
    if (!clauses.length) throw new Error('INSUFFICIENT_RELEVANT_EVIDENCE');
    return validateToolResult('draftRevision', {
      text: clauses.join('。\n') + '。', factRefs, requirementRefs: [requirement.id],
      rationaleSummary: `对应岗位要求：${requirement.sourceText}`,
    });
  }
  async repairRevision({ requirement, facts, candidate, findings = [] }) {
    const repairable = new Set([
      'unconfirmed_number', 'number_context_expansion', 'unqualified_estimate',
      'attribution_expansion', 'responsibility_expansion', 'unsupported_claim',
      'unsupported_claim_semantics', 'semantic_irrelevance', 'irrelevant',
      'project_status_expansion', 'credential_fabrication', 'skill_fabrication',
      'learning_to_experience_expansion', 'missing_fact_reference',
    ]);
    const risks = findings.filter(f => f.type !== 'estimated_number');
    if (!candidate?.text || !risks.length || risks.some(f => !repairable.has(f.type))) {
      throw new Error('UNSAFE_REPAIR_FINDING');
    }
    // Rebuild the affected claims from confirmed evidence rather than patching
    // arbitrary prose, which can retain an unsupported implication.
    const repaired = await this.draftRevision({ requirement, facts });
    if (repaired.text === candidate.text
      && JSON.stringify(repaired.factRefs) === JSON.stringify(candidate.factRefs)
      && JSON.stringify(repaired.requirementRefs) === JSON.stringify(candidate.requirementRefs)) {
      throw new Error('REPAIR_UNCHANGED');
    }
    return repaired;
  }
  async verifyRevision(input) { return auditService.verifyRevision(input); }
}
module.exports = new AgentToolService();
module.exports.AgentToolService = AgentToolService;
