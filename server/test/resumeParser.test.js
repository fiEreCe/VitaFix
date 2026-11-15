const test = require('node:test');
const assert = require('node:assert/strict');

const deepseekService = require('../services/deepseekService');
const resumeParser = require('../services/resumeParser');
const { AppError } = require('../utils/appError');

test('passes the truncation guard and token limit to chatJSON', async (t) => {
  const originalChatJSON = deepseekService.chatJSON;
  let captured = null;
  deepseekService.chatJSON = async (prompt, options) => {
    captured = options;
    return { personalInfo: { name: '张三' } };
  };
  t.after(() => {
    deepseekService.chatJSON = originalChatJSON;
  });

  const parsed = await resumeParser.parse('张三 前端开发工程师');

  assert.deepEqual(captured, { maxTokens: 16384, rejectTruncated: true });
  assert.equal(parsed.personalInfo.name, '张三');
  assert.deepEqual(parsed.education, []);
});

test('empty AI result is rejected instead of being saved as an empty resume', async (t) => {
  const originalChatJSON = deepseekService.chatJSON;
  deepseekService.chatJSON = async () => ({});
  t.after(() => {
    deepseekService.chatJSON = originalChatJSON;
  });

  await assert.rejects(
    resumeParser.parse('张三 前端开发工程师'),
    (error) => error instanceof AppError
      && error.code === 'RESUME_AI_EMPTY_RESULT'
      && error.status === 503
      && error.retryable === true,
  );
});

test('null or non-object AI result is rejected', async (t) => {
  const originalChatJSON = deepseekService.chatJSON;
  deepseekService.chatJSON = async () => null;
  t.after(() => {
    deepseekService.chatJSON = originalChatJSON;
  });

  await assert.rejects(
    resumeParser.parse('张三 前端开发工程师'),
    (error) => error instanceof AppError && error.code === 'RESUME_AI_EMPTY_RESULT',
  );
});

test('a partially populated but meaningful result is accepted', async (t) => {
  const originalChatJSON = deepseekService.chatJSON;
  deepseekService.chatJSON = async () => ({ skills: ['Vue', 'TypeScript'] });
  t.after(() => {
    deepseekService.chatJSON = originalChatJSON;
  });

  const parsed = await resumeParser.parse('张三 前端开发工程师');
  assert.deepEqual(parsed.skills, ['Vue', 'TypeScript']);
  assert.deepEqual(parsed.education, []);
});

test('empty text is a 400 client error', async () => {
  await assert.rejects(
    resumeParser.parse('   '),
    (error) => error instanceof AppError
      && error.code === 'RESUME_TEXT_EMPTY'
      && error.status === 400,
  );
});
