function normalizeText(value) {
  return String(value || '')
    .toLowerCase()
    .normalize('NFKC')
    .replace(/[，。；：、！？,.!?;:()[\]{}"'“”‘’]/g, ' ')
    .replace(/\s+/g, ' ')
    .trim();
}

function chineseNgrams(value, sizes = [2, 3]) {
  const runs = normalizeText(value).match(/[\u4e00-\u9fff]+/g) || [];
  const result = new Set();
  for (const run of runs) {
    for (const size of sizes) {
      for (let index = 0; index <= run.length - size; index += 1) {
        result.add(run.slice(index, index + size));
      }
    }
  }
  return result;
}

function meaningfulTokens(value) {
  const normalized = normalizeText(value);
  const english = normalized.match(/[a-z][a-z0-9+#.-]{1,}/g) || [];
  return new Set([...english, ...chineseNgrams(normalized)]);
}

function evidenceOverlap(left, right) {
  const leftTokens = meaningfulTokens(left);
  const rightTokens = meaningfulTokens(right);
  const denominator = Math.min(leftTokens.size, rightTokens.size);
  if (!denominator) return 0;
  const common = [...leftTokens].filter((token) => rightTokens.has(token)).length;
  return common / denominator;
}

function extractNumberClaims(value) {
  const text = normalizeText(value);
  const expression = /(\d+(?:\.\d+)?)\s*(%|％|位用户|人|份|元|万元|天|个月|年|次)?/g;
  return [...text.matchAll(expression)].map((match) => {
    const start = Math.max(0, match.index - 8);
    const end = Math.min(text.length, match.index + match[0].length + 8);
    const context = text.slice(start, end);
    return {
      value: match[1],
      unit: match[2] || '',
      context,
      unitCategory: classifyNumberUnit(match[2] || '', context),
      purpose: classifyNumberPurpose(context),
    };
  });
}

function classifyNumberUnit(unit, context = '') {
  const value = `${unit} ${context}`;
  if (/%|％|百分比/.test(value)) return 'percentage';
  if (/万元|元|营收|收入|销售额|利润|成本|金额/.test(value)) return 'money';
  if (/位用户|用户|客户|受访者|人/.test(value)) return 'people';
  if (/份|样本|问卷/.test(value)) return 'samples';
  if (/个月|月|年|天|小时/.test(value)) return 'duration';
  if (/次|个|项|场/.test(value)) return 'count';
  return '';
}

function classifyNumberPurpose(context = '') {
  if (/营收|收入|销售额|利润|商业化/.test(context)) return 'revenue';
  if (/访谈|调研|用户研究|问卷|受访/.test(context)) return 'user_research';
  if (/转化|留存|点击|渗透率/.test(context)) return 'conversion';
  if (/效率|耗时|周期|时长/.test(context)) return 'efficiency';
  if (/成本|费用|预算/.test(context)) return 'cost';
  return '';
}

module.exports = {
  chineseNgrams,
  classifyNumberPurpose,
  classifyNumberUnit,
  evidenceOverlap,
  extractNumberClaims,
  meaningfulTokens,
  normalizeText,
};
