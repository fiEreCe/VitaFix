const jdParser = require('../jdParser');
const resumeParser = require('../resumeParser');
const deepseekService = require('../deepseekService');
const auditService = require('./agentAuditService');
const skillSynonyms = require('../../data/skill-synonyms.json');
const { validateToolResult } = require('../../domain/agent/contracts');
const { evidenceOverlap, normalizeText } = require('../../domain/agent/textEvidence');
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
  async parseResume(rawText) {
    const parsed = await resumeParser.parse(rawText);
    const entries = [...(parsed.projects || []), ...(parsed.experience || [])];
    const facts = entries.map((item, index) => ({
      id: `fact-${index + 1}`, sourceText: item.description || item.name || item.position || '', action: item.description || item.role || '',
      context: item.name || item.company || '', contribution: item.role || '参与相关工作', method: '', result: '', quantity: '', confirmation: 'confirmed',
    })).filter((item) => item.sourceText);
    return { facts: facts.length ? facts : [{ id: 'fact-1', sourceText: rawText.slice(0, 300), action: '', context: '', contribution: '', confirmation: 'confirmed' }] };
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
    const result = await this.ai.chatJSON(ASSESS_ANSWER_PROMPT(input), {
      temperature: 0,
      maxTokens: 1000,
    });
    return validateToolResult('assessAnswer', result);
  }
  async evaluateModification(input) {
    const result = await this.ai.chatJSON(MODIFICATION_VALIDATION_PROMPT(input), {
      temperature: 0,
      maxTokens: 1600,
    });
    return validateToolResult('evaluateModification', result);
  }
  async draftRevision({ requirement, facts, sufficiency }) {
    const fact = facts[0];
    const text = sufficiency === 'basic'
      ? `${fact.action || fact.sourceText}，围绕${fact.context || requirement.sourceText}开展相关工作。`
      : `${fact.action || fact.sourceText}，在${fact.context || '相关场景'}中${fact.method ? `通过${fact.method}` : '推进'}，${fact.result || '形成可验证产出'}。`;
    return { text, factRefs: facts.map((item) => item.id), requirementRefs: [requirement.id], rationaleSummary: `对应岗位要求：${requirement.sourceText}` };
  }
  async repairRevision({ requirement, facts, sufficiency }) { return this.draftRevision({ requirement, facts, sufficiency }); }
  async verifyRevision(input) { return auditService.verifyRevision(input); }
}
module.exports = new AgentToolService();
module.exports.AgentToolService = AgentToolService;
