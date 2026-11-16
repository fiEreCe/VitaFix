const { normalizeText } = require('../../domain/agent/textEvidence');

function cleanText(value) {
  return typeof value === 'string' ? value.trim() : '';
}

/**
 * 将补充经历归一化为可冻结的纯对象，只保留 Supplement Schema 中的展示字段。
 * 标题或描述都为空的条目视为没有可用内容，直接丢弃。
 */
function normalizeSupplementItems(items) {
  if (!Array.isArray(items)) return [];
  return items
    .filter((item) => item && typeof item === 'object')
    .map((item) => ({
      type: cleanText(item.type),
      title: cleanText(item.title),
      period: cleanText(item.period),
      description: cleanText(item.description),
      includedInResume: item.includedInResume === true,
    }))
    .filter((item) => item.title || item.description);
}

/**
 * 把补充经历转换为与简历事实同构的证据。
 * - includedInResume=true 表示该经历已在简历正文中，跳过以避免重复计算。
 * - 与简历正文或已解析简历事实重复的条目同样跳过。
 * - 返回的事实继续使用已有事实确认与审核规则（confirmation=confirmed）。
 */
function buildSupplementFacts(supplements, { resumeText = '', resumeFacts = [], startIndex = 0 } = {}) {
  const resumeCorpus = normalizeText([
    resumeText,
    ...resumeFacts.map((fact) => [
      fact.sourceText,
      fact.action,
      fact.context,
      fact.contribution,
    ].filter(Boolean).join(' ')),
  ].join(' '));

  const seen = new Set();
  const facts = [];

  for (const item of normalizeSupplementItems(supplements)) {
    if (item.includedInResume) continue;

    const title = normalizeText(item.title);
    const description = normalizeText(item.description);
    const signature = [title, description].filter(Boolean).join(' ');
    if (!signature) continue;

    // 描述通常比标题更具体；有描述时用描述做补充去重，没有描述时用标题。
    const keys = [signature];
    if (description.length >= 4) keys.push(description);
    const duplicate = keys.some((key) => (
      seen.has(key) || (key.length >= 4 && resumeCorpus.includes(key))
    ));
    if (duplicate) continue;
    keys.forEach((key) => seen.add(key));

    const sourceParts = [
      item.title,
      item.period ? `时间：${item.period}` : '',
      item.description,
    ].filter(Boolean);

    facts.push({
      id: `fact-${startIndex + facts.length + 1}`,
      sourceText: [...new Set(sourceParts)].join(' | '),
      action: item.description || item.title,
      context: item.title || item.type || '',
      contribution: item.type ? `用户补充的${item.type}经历` : '用户补充的经历',
      method: '',
      result: '',
      quantity: '',
      confirmation: 'confirmed',
      source: 'supplement',
    });
  }

  return facts;
}

module.exports = {
  buildSupplementFacts,
  normalizeSupplementItems,
};
