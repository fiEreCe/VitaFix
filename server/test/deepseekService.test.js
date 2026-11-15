const test = require('node:test');
const assert = require('node:assert/strict');

const { DeepSeekService } = require('../services/deepseekService');

test('retries inside one acquired slot and releases once', async () => {
  let calls = 0;
  const client = {
    post: async () => {
      calls += 1;
      if (calls < 3) throw Object.assign(new Error('rate limited'), { response: { status: 429 } });
      return { data: { choices: [{ message: { content: 'ok' } }] } };
    },
  };
  const service = new DeepSeekService({ client, delay: async () => {} });
  let acquired = 0;
  let released = 0;
  service._acquireSlot = async () => { acquired += 1; };
  service._releaseSlot = () => { released += 1; };

  assert.equal(await service.chat('prompt', {}, 2), 'ok');
  assert.deepEqual({ calls, acquired, released }, { calls: 3, acquired: 1, released: 1 });
});

test('JSON parse failure never logs the raw model output', async () => {
  const service = new DeepSeekService({
    client: { post: async () => ({ data: { choices: [{ message: { content: 'private resume text' } }] } }) },
    delay: async () => {},
  });
  const original = console.error;
  const logged = [];
  console.error = (...args) => logged.push(args.join(' '));
  await assert.rejects(service.chatJSON('prompt'), /AI 返回结果解析失败/);
  console.error = original;
  assert.equal(logged.join(' ').includes('private resume text'), false);
});

test('rejectTruncated rejects finish_reason=length even when content is valid JSON', async () => {
  let calls = 0;
  const service = new DeepSeekService({
    client: {
      post: async () => {
        calls += 1;
        return {
          data: {
            id: 'truncated-request',
            choices: [{
              message: { role: 'assistant', content: '{"personalInfo":{}}' },
              finish_reason: 'length',
            }],
            usage: { completion_tokens_details: { reasoning_tokens: 100 } },
          },
        };
      },
    },
    delay: async () => {},
  });

  const original = console.error;
  console.error = () => {};
  try {
    await assert.rejects(
      service.chatJSON('prompt', { rejectTruncated: true }),
      /AI 返回内容被截断/,
    );
  } finally {
    console.error = original;
  }
  assert.equal(calls, 1, 'truncation should not be retried');
});

test('truncated content is still accepted when rejectTruncated is not requested', async () => {
  const service = new DeepSeekService({
    client: {
      post: async () => ({
        data: {
          choices: [{
            message: { role: 'assistant', content: '{"personalInfo":{}}' },
            finish_reason: 'length',
          }],
        },
      }),
    },
    delay: async () => {},
  });

  const result = await service.chatJSON('prompt');
  assert.deepEqual(result, { personalInfo: {} });
});

test('empty content is rejected as a JSON parse failure', async () => {
  const service = new DeepSeekService({
    client: {
      post: async () => ({
        data: {
          choices: [{ message: { role: 'assistant', content: '' }, finish_reason: 'stop' }],
        },
      }),
    },
    delay: async () => {},
  });

  const original = console.error;
  console.error = () => {};
  try {
    await assert.rejects(service.chatJSON('prompt', { rejectTruncated: true }), /AI 返回结果解析失败/);
  } finally {
    console.error = original;
  }
});

test('syntactically truncated JSON is rejected', async () => {
  const service = new DeepSeekService({
    client: {
      post: async () => ({
        data: {
          choices: [{
            message: { role: 'assistant', content: '{"personalInfo":{"name":"张' },
            finish_reason: 'stop',
          }],
        },
      }),
    },
    delay: async () => {},
  });

  const original = console.error;
  console.error = () => {};
  try {
    await assert.rejects(service.chatJSON('prompt', { rejectTruncated: true }), /AI 返回结果解析失败/);
  } finally {
    console.error = original;
  }
});
