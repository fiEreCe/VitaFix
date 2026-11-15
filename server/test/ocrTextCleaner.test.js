const test = require('node:test');
const assert = require('node:assert/strict');

const {
  cleanOcrText,
  normalizeSpaces,
  cleanLine,
  isHeading,
  isNumbered,
} = require('../services/ocrTextCleaner');

test('normalizeSpaces removes OCR spaces inside Chinese sentences', () => {
  assert.equal(
    normalizeSpaces('产品 实习 生 ( 北京 ) ”150-200 元 /天'),
    '产品实习生(北京)150-200元/天',
  );
  assert.equal(
    normalizeSpaces('负责 Web 前端 开发 ， 熟悉 Vue 或 React'),
    '负责Web前端开发，熟悉Vue或React',
  );
});

test('whole-line web UI is removed', () => {
  assert.deepEqual(cleanLine('立即 沟通'), []);
  assert.deepEqual(cleanLine('微信 扫 码 分 享'), []);
  assert.deepEqual(cleanLine('查看 更 多 优选 职位'), []);
  assert.deepEqual(cleanLine('团建聚餐 零食下午茶 餐补 车补'), []);
});

test('heading mixed with UI keeps only the heading', () => {
  assert.deepEqual(cleanLine('职位 描述 短信 扫 码 分 字 。 人 举报'), ['职位描述']);
  assert.deepEqual(
    cleanLine('职位 描述 向 语 HS 享 举报 公司 基本 信息'),
    ['职位描述', '公司基本信息'],
  );
});

test('job information is kept and salary icon noise is stripped', () => {
  assert.deepEqual(
    cleanLine('产品 实习 生 (北京 ) ”150-200 元 /天 Ca ]'),
    ['产品实习生(北京)150-200元/天'],
  );
  assert.deepEqual(cleanLine('北京 “ 4 天 周 6 个 月 “ 本科'), ['北京4天周6个月本科']);
});

test('real content that merely mentions UI words is not deleted', () => {
  const [line] = cleanLine('岗位职责:负责用户举报流程的设计与优化');
  assert.match(line, /岗位职责/);
  assert.match(line, /举报流程/);
});

test('numbered items stay on separate lines and wrapped lines are merged', () => {
  const raw = [
    '职位 描述',
    '1、 参与 公司 软件 产品 设计 相关 工作 ， 协调 产品 经理 推进 优化',
    '2、 参与 制定 产品 目标 、 系统 需求 等 ， 进行 产品 原型 制作',
    '3、 编写 产品 手册',
  ].join('\n');

  const { text } = cleanOcrText(raw);
  const lines = text.split('\n').filter(Boolean);
  assert.deepEqual(lines, [
    '职位描述',
    '1、参与公司软件产品设计相关工作，协调产品经理推进优化',
    '2、参与制定产品目标、系统需求等，进行产品原型制作',
    '3、编写产品手册',
  ]);
});

test('tag line is not merged into the following section', () => {
  const raw = [
    '职位 描述',
    '产品 。 ERP 产品 。 A 产品 。 物 联网 产品',
    '岗 位 职 责',
    '1、 参与 产品 设计',
  ].join('\n');

  const { text } = cleanOcrText(raw);
  assert.match(text, /产品。ERP产品。A产品。物联网产品\n+岗位职责/);
});

test('a sidebar fragment does not swallow the next numbered item', () => {
  const raw = [
    '4、 组织 与 流程 优化 支持',
    '作 昌 TaAp" 届 地',
    '5 AI 行业 与 市场 信息 研究',
  ].join('\n');

  const { text } = cleanOcrText(raw);
  assert.doesNotMatch(text, /作昌TaAp"届地5 AI/);
  assert.match(text, /作昌TaAp"届地\n+5 AI行业与市场信息研究/);
});

test('uncertain short line is kept instead of being deleted', () => {
  const { text } = cleanOcrText('职位描述\n8\n');
  assert.match(text, /\n8$/);
});

test('empty OCR result returns empty text with stats', () => {
  const result = cleanOcrText('   \n  ');
  assert.equal(result.text, '');
  assert.equal(result.stats.originalLength, 6);
  assert.equal(result.stats.cleanedLines, 0);
});

test('heading and numbered detectors work on cleaned lines', () => {
  assert.equal(isHeading('职位描述'), true);
  assert.equal(isHeading('任职要求：'), true);
  assert.equal(isNumbered('1、参与产品设计'), true);
  assert.equal(isNumbered('二、岗位要求'), true);
  assert.equal(isNumbered('2024年毕业'), false);
});
