const fs = require('fs');
const path = require('path');
const cases = require('../evaluations/pf002Cases');
const { runCases, RULE_VERSION, SCHEMA_VERSION } = require('../services/agent/pf002Evaluator');

const report = { ...runCases(cases), modelVersion: process.env.AI_MODEL || 'deepseek-chat', promptVersion: 'pf001-agent-prompt-1', codeVersion: process.env.GIT_COMMIT || 'local' };
const markdown = `# PF-002 评测报告\n\n- 规则版本：${RULE_VERSION}\n- Schema 版本：${SCHEMA_VERSION}\n- 模型版本：${report.modelVersion}\n- 总数：${report.total}\n- 通过：${report.passed}\n- 失败：${report.failed}\n`;
const output = process.argv[2];
if (output) {
  const directory = path.resolve(output); fs.mkdirSync(directory, { recursive: true });
  fs.writeFileSync(path.join(directory, 'pf002-report.json'), JSON.stringify(report, null, 2));
  fs.writeFileSync(path.join(directory, 'pf002-report.md'), markdown);
}
console.log(JSON.stringify(report));
process.exitCode = report.failed ? 1 : 0;
