import test from 'node:test'
import assert from 'node:assert/strict'

import { readError } from '../src/api/index.js'

test('reads a structured API error without producing object text', () => {
  const error = readError({
    error: {
      code: 'INPUT_NOT_FOUND',
      message: '输入不存在或无权访问',
      retryable: false,
    },
  }, 404)

  assert.equal(error.message, '输入不存在或无权访问')
  assert.equal(error.code, 'INPUT_NOT_FOUND')
  assert.equal(error.retryable, false)
  assert.notEqual(error.message, '[object Object]')
})

test('keeps compatibility with string and malformed errors', () => {
  assert.equal(readError({ error: '请求失败' }, 400).message, '请求失败')
  assert.equal(readError({}, 503).message, 'HTTP 503')
})
