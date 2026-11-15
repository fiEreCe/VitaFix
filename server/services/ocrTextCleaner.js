/**
 * OCR 文本后处理
 *
 * 只做格式整理：
 * - 清除高置信度的网页 UI 文案（分享、举报、导航、广告按钮）
 * - 修复中文字符之间被 OCR 拆开的空格
 * - 合并被错误换行拆开的句子
 * - 恢复标题、编号列表的段落结构
 *
 * 不翻译、不改写、不补充 OCR 没有识别到的内容。
 * 不确定的行一律保留，避免误删真实岗位信息。
 */

const CJK_RANGE = '\\u3400-\\u4dbf\\u4e00-\\u9fff';
const CJK_RE = new RegExp(`[${CJK_RANGE}]`);

const HEADINGS = [
  '公司基本信息',
  '职位描述',
  '岗位职责',
  '工作职责',
  '职责描述',
  '岗位要求',
  '任职要求',
  '任职资格',
  '教育背景',
  '技术能力',
  '技能要求',
  '优先项',
  '加分项',
  '工作地点',
  '薪资待遇',
  '福利待遇',
];

// 整行都是网页 UI 时才删除
const WHOLE_LINE_UI = [
  /^(收藏|立即沟通|举报|微信扫码分享|微信扫一扫|分享|查看全部职位|查看更多优选职位|查看更多职位|完善在线简历|新增附件简历|下载app|找工作)$/i,
  /^(团建聚餐|零食下午茶|餐补|车补)(?:[\s、,，]*(?:团建聚餐|零食下午茶|餐补|车补))*$/,
];

// 网页 UI 的弱信号：必须同时出现多个，才用于“标题 + UI 混在一行”的拆分
const UI_SIGNAL_RE = /微信|扫码|扫一扫|分享|(?<!共)享(?!受)|举报|收藏|立即沟通|查看全部职位|查看更多|完善在线简历|新增附件简历|下载\s*app|boss|直接谈|找工作/gi;

const TERMINAL_RE = /[。！？!?；;：:、，,）)\]】》]$|[-–—~]$/;
const NUMBERED_RE = /^(?:[0-9]{1,2}[、.．)）]|[0-9]{1,2}(?=[㐀-䶿一-鿿])|[0-9]{1,2}\s+(?=[A-Za-z㐀-䶿一-鿿])|[一二三四五六七八九十]{1,3}[、.．]|[-•·—])\s*/;
const CONTINUATION_RE = /^(?:与|及|和|并|或|而|且|其|该|此|如|若|但|为|对|由|从|向|将|把|被|所|之|以及|并且|或者|其中|同时|此外|例如|包括|能够|可以|需要|[a-z])/;
const SALARY_RE = /(?:\d+\s*[-–~]\s*)?\d+\s*元\s*\/\s*[天月年周]/;

function countUiSignals(text) {
  const matches = text.match(UI_SIGNAL_RE);
  return matches ? matches.length : 0;
}

function normalizeSpaces(input) {
  let text = input.replace(/ |　/g, ' ').replace(/[ \t]+/g, ' ').trim();

  // 中文字符两侧的空格全部去掉（OCR 最常见的“中文被拆散”问题）
  text = text.replace(new RegExp(`\\s+(?=[${CJK_RANGE}])`, 'g'), '');
  text = text.replace(new RegExp(`(?<=[${CJK_RANGE}])\\s+`, 'g'), '');

  // 中文标点两侧的空格
  text = text.replace(/\s+([，。、；：！？）】》])/g, '$1');
  text = text.replace(/([（【《])\s+/g, '$1');
  text = text.replace(/([，。、；：！？）】》])\s+/g, '$1');

  // 中文旁边的 ASCII 标点也去掉空格
  text = text.replace(new RegExp(`(?<=[${CJK_RANGE}])\\s*([:;,!?])\\s*`, 'g'), '$1');
  text = text.replace(new RegExp(`\\s*([:;,!?])\\s*(?=[${CJK_RANGE}])`, 'g'), '$1');

  // 数字区间、日期/周数写法中的空格
  text = text.replace(/(\d)\s*[-–~]\s*(?=\d)/g, '$1-');
  text = text.replace(/\s*\/\s*/g, '/');

  // 圆括号后、薪资前的“收藏”图标误识别
  text = text.replace(/(\))\s*[“”]\s*(?=\d)/g, '$1');

  // 剩余连续空格压成一个（主要保留英文单词之间的分隔）
  return text.replace(/\s{2,}/g, ' ').trim();
}

function isWholeLineUi(compact) {
  return WHOLE_LINE_UI.some((re) => re.test(compact));
}

function splitHeadingAndUi(compact) {
  if (compact.length > 30 || countUiSignals(compact) < 2) return null;

  const headings = HEADINGS
    .filter((heading) => compact.includes(heading))
    .sort((a, b) => compact.indexOf(a) - compact.indexOf(b));

  // 只有确认是标题与 UI 文案混在一行时，才只保留标题，避免误删正文
  return headings.length > 0 ? headings : null;
}

/**
 * 清洗单行，返回 0 到多行
 */
function cleanLine(line) {
  let text = normalizeSpaces(line);
  if (!text) return [];

  const compact = text.replace(/\s+/g, '');
  if (isWholeLineUi(compact)) return [];

  const headings = splitHeadingAndUi(compact);
  if (headings) return headings;

  // 侧边栏“0-20人”这类公司规模误识别粘在正文末尾
  text = text.replace(/0[.．]\d+\s*人$/, '').trim();

  // 薪资后面粘连的图标误识别（如 “150-200元/天 Ca]”）
  text = text.replace(
    /(\d+\s*[-–~]\s*\d+\s*元\s*\/\s*[天月年周])(?=[^㐀-䶿一-鿿]*$).*$/,
    '$1',
  ).trim();

  // 地点/经验/学历行里的引号多为页面图标误识别
  if (/本科|硕士|大专|博士/.test(text) && /(?:\d+\s*天\s*\/?\s*周|\d+\s*个月)/.test(text)) {
    text = text.replace(/\s*[“”]\s*/g, '').trim();
  }

  // 正文末尾粘连的“找工作”广告文案；短行不处理，避免误删正文
  if (text.length > 20) {
    text = text.replace(/找工作$/, '').trim();
  }

  return text ? [text] : [];
}

function isHeading(line) {
  const compact = line.replace(/\s+/g, '');
  if (HEADINGS.includes(compact)) return true;
  return HEADINGS.some((heading) => compact === `${heading}:` || compact === `${heading}：`);
}

function isNumbered(line) {
  return NUMBERED_RE.test(line.replace(/\s+/g, ' ').trim());
}

// 技能标签行（如“产品。ERP产品。A产品”）作为独立块，避免和下一节粘连
function isTagLine(line) {
  const segments = line.split(/[。、|·]/).map((item) => item.trim()).filter(Boolean);
  if (segments.length < 3) return false;
  const averageLength = segments.reduce((sum, item) => sum + item.length, 0) / segments.length;
  return averageLength <= 16;
}

function isHeaderLike(line, index) {
  if (index === 0) return true;
  return SALARY_RE.test(line);
}

function canMerge(previous, next) {
  if (isHeading(next) || isNumbered(next) || isTagLine(next)) return false;
  // 明显是网页 UI 的下一行不要并进岗位正文
  if (countUiSignals(next) >= 2) return false;
  if (TERMINAL_RE.test(previous)) return false;
  if (CONTINUATION_RE.test(next)) return true;
  // 长行后面跟一个很短的片段，通常是 OCR 把同一句换行了
  return previous.length >= 40 && next.length <= 8;
}

function joinLines(previous, next) {
  const left = previous.slice(-1);
  const right = next.slice(0, 1);
  const needSpace = /[A-Za-z0-9]/.test(left) && /[A-Za-z0-9]/.test(right);
  return `${previous}${needSpace ? ' ' : ''}${next}`;
}

function compactLines(rawText) {
  const originalLines = rawText.split(/\r?\n/);
  const kept = [];
  let removedUiLines = 0;

  for (const line of originalLines) {
    if (!line.trim()) continue;
    const cleaned = cleanLine(line);
    if (cleaned.length === 0) {
      removedUiLines += 1;
      continue;
    }
    kept.push(...cleaned);
  }

  // 只去掉相邻重复行，避免误删列表里合法的重复表述
  const deduped = kept.filter((line, index) => index === 0 || line !== kept[index - 1]);
  const duplicateLines = kept.length - deduped.length;

  return { lines: deduped, originalLines, removedUiLines, duplicateLines };
}

function buildBlocks(lines) {
  const blocks = [];
  let mergedLines = 0;

  lines.forEach((line, index) => {
    if (isHeading(line)) {
      blocks.push({ type: 'heading', text: line });
      return;
    }

    if (isNumbered(line)) {
      blocks.push({ type: 'item', text: line, noMerge: false });
      return;
    }

    const last = blocks[blocks.length - 1];
    if (last && last.type !== 'heading' && !last.noMerge && canMerge(last.text, line)) {
      last.text = normalizeSpaces(joinLines(last.text, line));
      mergedLines += 1;
      return;
    }

    blocks.push({
      type: 'paragraph',
      text: line,
      noMerge: isHeaderLike(line, index) || isTagLine(line),
    });
  });

  return { blocks, mergedLines };
}

function renderBlocks(blocks) {
  const parts = [];
  blocks.forEach((block, index) => {
    if (block.type === 'heading') {
      if (index > 0 && parts[parts.length - 1] !== '') parts.push('');
      parts.push(block.text);
      if (index < blocks.length - 1) parts.push('');
    } else {
      parts.push(block.text);
    }
  });
  return parts.join('\n').replace(/\n{3,}/g, '\n\n').trim();
}

/**
 * @param {string} rawText - Tesseract 原始输出
 * @returns {{ text: string, stats: Object }}
 */
function cleanOcrText(rawText) {
  const source = typeof rawText === 'string' ? rawText : '';
  if (!source.trim()) {
    return {
      text: '',
      stats: {
        originalLength: source.length,
        cleanedLength: 0,
        originalLines: 0,
        cleanedLines: 0,
        removedUiLines: 0,
        duplicateLines: 0,
        mergedLines: 0,
      },
    };
  }

  const { lines, originalLines, removedUiLines, duplicateLines } = compactLines(source);
  const { blocks, mergedLines } = buildBlocks(lines);
  const text = renderBlocks(blocks);

  return {
    text,
    stats: {
      originalLength: source.length,
      cleanedLength: text.length,
      originalLines: originalLines.filter((line) => line.trim()).length,
      cleanedLines: text ? text.split('\n').filter((line) => line.trim()).length : 0,
      removedUiLines,
      duplicateLines,
      mergedLines,
    },
  };
}

module.exports = {
  cleanOcrText,
  // 导出内部函数便于单元测试
  normalizeSpaces,
  cleanLine,
  isHeading,
  isNumbered,
};
