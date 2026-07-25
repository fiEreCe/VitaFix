const confirmedFact = { id: 'f-confirmed', sourceText: '参与用户访谈', action: '参与访谈', contribution: '团队共同完成', quantity: '20', confirmation: 'confirmed' };
const estimatedFact = { ...confirmedFact, id: 'f-estimated', quantity: '20', quantityType: 'estimated' };
const passed = () => ({ text: '参与用户访谈并整理反馈', factRefs: ['f-confirmed'] });
const warning = () => ({ text: '参与约20位用户访谈并整理反馈', factRefs: ['f-estimated'] });
const blockedNumber = () => ({ text: '独立完成500位用户访谈', factRefs: ['f-confirmed'] });
const blockedAttribution = () => ({ text: '主导完成用户访谈', factRefs: ['f-confirmed'] });
const unavailable = () => ({ text: '', factRefs: [] });

const e2e = [
  ['E2E-001', 'passed', passed, [confirmedFact]], ['E2E-002', 'warning', warning, [estimatedFact]],
  ['E2E-003', 'blocked', blockedNumber, [confirmedFact]], ['E2E-004', 'blocked', blockedAttribution, [confirmedFact]],
  ['E2E-005', 'unavailable', unavailable, [confirmedFact]], ['E2E-006', 'passed', passed, [confirmedFact]],
  ['E2E-007', 'warning', warning, [estimatedFact]], ['E2E-008', 'blocked', blockedNumber, [confirmedFact]],
  ['E2E-009', 'blocked', blockedAttribution, [confirmedFact]], ['E2E-010', 'unavailable', unavailable, [confirmedFact]],
  ['E2E-011', 'passed', passed, [confirmedFact]], ['E2E-012', 'warning', warning, [estimatedFact]],
];
const atomicKinds = [
  ['passed', passed, [confirmedFact]], ['warning', warning, [estimatedFact]], ['blocked', blockedNumber, [confirmedFact]],
  ['blocked', blockedAttribution, [confirmedFact]], ['unavailable', unavailable, [confirmedFact]],
];
const atomic = Array.from({ length: 30 }, (_, index) => {
  const [expected, candidate, facts] = atomicKinds[index % atomicKinds.length];
  return [`A-${String(index + 1).padStart(3, '0')}`, expected, candidate, facts];
});

const titles = [
  '强证据直接优化', '角色缺口先追问', '团队结果正确归因', '用户确认估算范围', '真实能力缺口', '答非所问后恢复', '连续答非所问停止', '多要求匹配', '稳妥与强化表达并存', '用户编辑后失去 AI 验证', '结构异常恢复', '数据中的提示词注入',
  'AI 凭空新增数字', '用户未确认数字', '已确认估算范围', '估算范围被精确化', '团队成果个人化', '团队成果正确保留', '参与扩大为主导', '协助扩大为负责', '学习过扩大为使用过', '课程项目扩大为商业项目', '虚构证书', '虚构上线状态', '不存在的事实引用', '跨用户事实引用', '缺少主要事实引用', '非法审核状态', '畸形 JSON 直接展示', '简历中的规则注入', 'JD 中的输出注入', '用户回答中的注入', '答非所问不判能力缺口', '一次澄清不消耗有效轮次', '连续无效回答停止循环', '信息不足不自动变能力缺口', '明确没有做过才判能力缺口', '风险提示不等于阻断用户手写', '阻断候选不得进入确认', '审核不可用保留进度', '自动修正最多一次', '用户编辑不触发自动审核',
];
module.exports = [...e2e, ...atomic].map(([id, expected, candidate, facts], index) => ({
  id, title: titles[index], expected, candidate: candidate(), facts,
  inputVersion: 'synthetic-v1', forbiddenOutcome: expected === 'blocked' ? 'awaiting_user_decision' : null,
  flow: id.startsWith('E2E-') ? ['input', 'evidence', 'candidate', 'evaluation', expected] : ['evaluation', expected],
}));
