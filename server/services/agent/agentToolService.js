const jdParser = require('../jdParser');
const resumeParser = require('../resumeParser');

const words = (value) => new Set(String(value || '').toLowerCase().match(/[\u4e00-\u9fa5]{2,}|[a-z]+/g) || []);

class AgentToolService {
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
      const reqWords = words(requirement.sourceText);
      const matched = facts.filter((fact) => [...reqWords].some((word) => fact.sourceText.toLowerCase().includes(word))).map((fact) => fact.id);
      return { requirementId: requirement.id, factIds: matched, gapType: matched.length ? 'expression' : 'information', priority: requirement.priority };
    }) };
  }
  async draftRevision({ requirement, facts, sufficiency }) {
    const fact = facts[0];
    const text = sufficiency === 'basic'
      ? `${fact.action || fact.sourceText}，围绕${fact.context || requirement.sourceText}开展相关工作。`
      : `${fact.action || fact.sourceText}，在${fact.context || '相关场景'}中${fact.method ? `通过${fact.method}` : '推进'}，${fact.result || '形成可验证产出'}。`;
    return { text, factRefs: facts.map((item) => item.id), requirementRefs: [requirement.id], rationaleSummary: `对应岗位要求：${requirement.sourceText}` };
  }
  async repairRevision({ requirement, facts, sufficiency }) { return this.draftRevision({ requirement, facts, sufficiency }); }
}
module.exports = new AgentToolService();
