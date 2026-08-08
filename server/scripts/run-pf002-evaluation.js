const fs = require('fs');
const path = require('path');
const cases = require('../evaluations/pf002Cases');
const { RULE_VERSION, SCHEMA_VERSION } = require('../services/agent/pf002Evaluator');
const { runEvaluationSuite } = require('../services/agent/pf002EvaluationRunner');

const titleById = new Map(cases.map((item) => [item.id, item.title]));
const findingsText = (findings = []) => (findings.length ? findings.map((f) => f.type).join('、') : '—');

// finding type -> 含义 -> 对应修复方式。供 Markdown 报告引用，保证报告可复现。
const FINDING_MEANING = {
  unconfirmed_number: '候选引用了已确认事实中不存在的数字',
  number_context_expansion: '同一数字的用途或单位类别与原事实不符',
  estimated_number: '使用了用户已确认的估算数字并保留"约"等限定，允许通过但标记 warning',
  unqualified_estimate: '使用了估算数字但未保留"约"等限定词',
  attribution_expansion: '把团队共同成果扩大为个人主导/独立完成',
  responsibility_expansion: '把参与/协助/配合扩大为负责/主导/牵头',
  project_status_expansion: '把课程/练习项目扩大为上线或商业项目',
  credential_fabrication: '虚构证书或认证',
  skill_fabrication: '声明了原事实未覆盖的技能',
  learning_to_experience_expansion: '把学习经历扩大为使用/应用经验',
  unsupported_claim_semantics: '候选与引用事实缺乏最低语义重叠',
  unsupported_claim: '引用的事实不属于用户已确认事实',
  missing_fact_reference: '候选缺少事实引用',
  invalid_schema: '候选或审核输出不符合契约，无法审核',
};

function buildMarkdown(report) {
  const lines = [
    '# PF-002 评测报告',
    '',
    '- 规则版本：' + RULE_VERSION,
    '- Schema 版本：' + SCHEMA_VERSION,
    '- Prompt 版本：' + report.promptVersion,
    '- 模型版本：' + report.modelVersion,
    '- 代码版本：' + report.codeVersion,
    '- 生成时间：' + report.generatedAt,
    '- 总数：' + report.total,
    '- 通过：' + report.passed,
    '- 失败：' + report.failed,
    '',
    '## 评测结构',
    '',
    '| 执行方式 | 用例数 | 说明 |',
    '|---|---|---|',
    '| orchestrator | ' + report.results.filter((r) => r.execution === 'orchestrator').length + ' | 端到端案例真实经过 Agent orchestrator 的输入→证据→候选→审核流程 |',
    '| deterministic | ' + report.results.filter((r) => r.execution === 'deterministic').length + ' | 原子案例直接执行确定性 guardrails 规则 |',
    '',
    '## 结果总表',
    '',
    '| 用例 | 标题 | 预期 | 实际 | 结果 | 执行 | 发现 |',
    '|---|---|---|---|---|---|---|',
    ...report.results.map((r) =>
      '| ' + r.caseId + ' | ' + (titleById.get(r.caseId) || '') + ' | ' + r.expected + ' | ' + r.actual
      + ' | ' + (r.pass ? '✅' : '❌') + ' | ' + r.execution + ' | ' + findingsText(r.findings) + ' |'),
    '',
    '## 失败案例与拦截原因',
    '',
  ];

  const failed = report.results.filter((r) => !r.pass);
  if (failed.length === 0) {
    lines.push('本次全部通过，无失败案例。以下为被测场景中必须被拦截的风险类型、规则依据和覆盖用例，作为红线清单：');
  } else {
    lines.push('以下案例未达到预期结果：');
    lines.push('');
    lines.push('| 用例 | 标题 | 预期 | 实际 | 发现 |');
    lines.push('|---|---|---|---|---|');
    failed.forEach((r) => {
      lines.push('| ' + r.caseId + ' | ' + (titleById.get(r.caseId) || '') + ' | ' + r.expected + ' | ' + r.actual + ' | ' + findingsText(r.findings) + ' |');
    });
    lines.push('');
  }
  lines.push('');

  Object.entries(FINDING_MEANING).forEach(([type, meaning]) => {
    const covered = report.results.filter((r) => r.findings.some((f) => f.type === type));
    const suffix = covered.length ? '（覆盖用例：' + covered.map((r) => r.caseId).join('、') + '）' : '';
    lines.push('- **' + type + '**：' + meaning + suffix);
  });

  lines.push(
    '',
    '## 修复方式',
    '',
    'PF-002 的核心是让"AI 改写简历候选"在事实安全上可审计、可阻断，而不只是看起来文本更长。实现分为确定性规则与独立语义审核两层：',
    '',
    '1. **数字红线（确定性）**：从事实与候选分别抽取数字主张，比较数值、单位类别和语义用途。候选使用事实中不存在的数字、或把同一数字换用途（如把"访谈 20 位用户"复用为"营收增长 20%"）都会被阻断。已确认的估算数字（带"约/大约/估算"）允许通过但标记 warning，去掉限定词则阻断。',
    '2. **职责红线（确定性）**：当原事实是"参与/协助/配合"或"团队/共同"时，候选使用"主导/牵头/带领/统筹/负责/独立/决策/全权负责"会被阻断，防止把团队成果或协作角色扩大为个人主导。',
    '3. **其他确定性红线**：课程/练习项目不得扩大为上线/商业项目；不得虚构证书或技能；"学习"经历不得扩大为"使用/应用"经验；候选必须引用已确认事实，引用不存在或跨用户的事实会被阻断。',
    '4. **独立语义审核**：确定性检查通过后，候选与引用事实还需具备最低语义重叠（evidenceOverlap < 0.15 判定为 unsupported_claim_semantics），阻断"完全无关的自我介绍"混入。独立审核由独立提示词执行，逐项返回支持/不支持的主张。',
    '5. **失败必须降级，不默认通过**：独立审核异常、输出不符合契约或格式非法时返回 unavailable，绝不降级为 passed。',
    '6. **可重试且不破坏进度**：语义审核失败时保留候选和已确认事实，重试只重新执行审核，不重新生成候选、不覆盖用户进度。',
    '',
    '## 前后回归对比',
    '',
    '以下原始缺陷来自本轮评审的实际复现，修复后已固化为自动化用例并保持拦截：',
    '',
    '| 原始缺陷（修复前误判） | 修复后结果 | 固化用例 |',
    '|---|---|---|',
    '| "牵头制定公司战略并推动营收增长"被错误判为通过 | blocked（attribution_expansion + unsupported_claim_semantics） | A-021 |',
    '| "实现营收增长20%"被错误判为通过 | blocked（number_context_expansion + unsupported_claim_semantics） | A-022 |',
    '| "完全无关的自我介绍"被错误判为 improved + passed | blocked（unsupported_claim_semantics） | A-024 |',
    '| "独立完成500位用户访谈"凭空新增数量 | blocked（unconfirmed_number；E2E-005 另有 attribution_expansion） | A-001、E2E-005 |',
    '| 把"参与/团队共同"扩大为"主导/负责" | blocked（responsibility_expansion 或 attribution_expansion） | A-007、A-029、E2E-009 |',
    '',
    '## 运行方式',
    '',
    '```powershell',
    'cd server',
    'npm.cmd run evaluate:pf002   # 固定评测，任何红线失败时进程退出码为 1',
    '```',
    '',
    '> 注意：npm script 硬编码输出到 `evaluations/reports`，每次运行会重新生成 JSON 与 Markdown。如需保留历史版本，运行前先备份或提交。',
    '',
  );

  return lines.join('\n');
}

async function main() {
  const report = {
    ...await runEvaluationSuite(cases),
    modelVersion: process.env.AI_MODEL || 'deepseek-chat',
    promptVersion: 'pf002-audit-prompt-1',
    codeVersion: process.env.GIT_COMMIT || 'local',
  };
  const markdown = buildMarkdown(report);
  const output = process.argv[2];
  if (output) {
    const directory = path.resolve(output); fs.mkdirSync(directory, { recursive: true });
    fs.writeFileSync(path.join(directory, 'pf002-report.json'), JSON.stringify(report, null, 2));
    fs.writeFileSync(path.join(directory, 'pf002-report.md'), markdown);
  }
  console.log(JSON.stringify(report));
  process.exitCode = report.failed ? 1 : 0;
}

main().catch((error) => {
  console.error(error.message);
  process.exitCode = 1;
});
