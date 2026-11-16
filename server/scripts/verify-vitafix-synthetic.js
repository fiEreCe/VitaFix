// Opt-in, single-request synthetic live audit; never prints prompts or credentials.
const fs = require('fs');
const config = require('../config');
const { AgentToolService } = require('../services/agent/agentToolService');
const { AgentAuditService } = require('../services/agent/agentAuditService');
const { AUDIT_REVISION_PROMPT } = require('../utils/promptTemplates');
const ai = require('../services/deepseekService');
async function main() {
  const started = Date.now();
  const requirement = { id: 'r1', sourceText: '用户访谈' };
  const facts = [
    { id: 'f1', confirmation: 'confirmed', sourceText: '课程项目中参与用户访谈，团队共同整理反馈。', context: '课程项目', action: '参与用户访谈', contribution: '团队共同整理反馈' },
    { id: 'f2', confirmation: 'confirmed', sourceText: '课程项目使用访谈提纲，团队完成约20份记录。', context: '课程项目', method: '访谈提纲', result: '团队完成约20份记录', quantityType: 'estimated' },
  ];
  let calls = 0;
  const audit = new AgentAuditService({ judge: input => {
    calls++;
    return ai.chatJSON(AUDIT_REVISION_PROMPT(input), { temperature: 0, maxTokens: 8192, rejectTruncated: true }, 0);
  } });
  // Bound HTTP time and disable transport retries for this diagnostic.
  ai.client.defaults.timeout = 55000;
  const chat = ai.chat.bind(ai);
  ai.chat = (prompt, options) => chat(prompt, options, 0);
  const service = new AgentToolService();
  const candidate = await service.repairRevision({ requirement, facts,
    candidate: { text: '主导用户访谈，提升99%', factRefs: ['f1'] },
    findings: [{ type: 'unconfirmed_number' }, { type: 'responsibility_expansion' }],
  });
  const result = await audit.verifyRevision({ candidate, facts, requirement });
  const report = { model: config.deepseek.model, calls, maxOutputTokens: 8192,
    durationMs: Date.now() - started, status: result.status,
    findings: result.findings.map(f => ({ type: f.type, code: f.code })),
    material: 'synthetic', transportRetries: 0 };
  fs.writeFileSync('evaluations/reports/vitafix-20261116/live-audit.json', JSON.stringify(report, null, 2));
  console.log(JSON.stringify(report));
}
main().catch(() => { console.error('Synthetic validation failed'); process.exitCode = 1; });
