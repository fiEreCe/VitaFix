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
