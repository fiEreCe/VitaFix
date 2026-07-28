const test = require('node:test');
const assert = require('node:assert/strict');

const { AppError, toErrorResponse } = require('../utils/appError');

test('formats a structured public error', () => {
  const error = new AppError('INPUT_NOT_FOUND', '输入不存在或无权访问', {
    status: 404,
    retryable: false,
  });

  assert.deepEqual(toErrorResponse(error), {
    status: 404,
    body: {
      error: {
        code: 'INPUT_NOT_FOUND',
        message: '输入不存在或无权访问',
        retryable: false,
      },
    },
  });
});

test('unknown errors do not expose internal details', () => {
  const result = toErrorResponse(new Error('database password leaked'));

  assert.equal(result.status, 500);
  assert.equal(result.body.error.code, 'INTERNAL_ERROR');
  assert.equal(result.body.error.message, '服务暂时不可用，请稍后重试');
  assert.equal(result.body.error.retryable, true);
  assert.doesNotMatch(JSON.stringify(result), /password/);
});

test('non-public application errors do not expose internal details', () => {
  const result = toErrorResponse(new AppError('DATABASE_WRITE_FAILED', 'private detail', {
    status: 503,
    retryable: true,
    expose: false,
  }));

  assert.equal(result.status, 500);
  assert.equal(result.body.error.code, 'INTERNAL_ERROR');
  assert.doesNotMatch(JSON.stringify(result), /private detail|DATABASE_WRITE_FAILED/);
});
