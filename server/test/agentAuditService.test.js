const test = require('node:test');
const assert = require('node:assert/strict');

const {
  AgentAuditService,
  SEMANTIC_AUDIT_MAX_TOKENS,
} = require('../services/agent/agentAuditService');

const facts = [{
  id: 'f1',
  sourceText: '参与用户访谈并整理反馈',
  action: '参与用户访谈',
  confirmation: 'confirmed',
}];

test('semantic audit blocks a deterministically plausible unsupported claim', async () => {
  const service = new AgentAuditService({
    judge: async () => ({
      status: 'blocked',
      findings: [{ type: 'unsupported_claim', claim: '推动业务增长' }],
      supportedClaims: [],
      unsupportedClaims: ['推动业务增长'],
      factRefs: ['f1'],
    }),
  });

  const result = await service.verifyRevision({
    candidate: { text: '参与用户访谈并推动业务增长', factRefs: ['f1'] },
    facts,
    requirement: { id: 'r1', sourceText: '用户研究' },
  });

  assert.equal(result.status, 'blocked');
  assert.deepEqual(result.unsupportedClaims, ['推动业务增长']);
});

test('judge failure returns unavailable rather than passed', async () => {
  const service = new AgentAuditService({
    judge: async () => { throw new Error('timeout'); },
  });

  const result = await service.verifyRevision({
    candidate: { text: '参与用户访谈并整理反馈', factRefs: ['f1'] },
    facts,
  });

  assert.equal(result.status, 'unavailable');
  assert.ok(result.findings.some((item) => item.type === 'semantic_audit_unavailable'));
});

test('default judge uses a reasoning-safe budget and rejects truncated output', async () => {
  const deepseekService = require('../services/deepseekService');
  const original = deepseekService.chatJSON;
  let capturedOptions = null;
  deepseekService.chatJSON = async (prompt, options) => {
    capturedOptions = options;
    return {
      status: 'passed',
      findings: [],
      supportedClaims: ['参与用户访谈'],
      unsupportedClaims: [],
      factRefs: ['f1'],
    };
  };

  try {
    const result = await new AgentAuditService().verifyRevision({
      candidate: { text: '参与用户访谈并整理反馈', factRefs: ['f1'] },
      facts,
      requirement: { id: 'r1', sourceText: '用户研究' },
    });
    assert.equal(result.status, 'passed');
  } finally {
    deepseekService.chatJSON = original;
  }

  assert.equal(SEMANTIC_AUDIT_MAX_TOKENS, 8192);
  assert.deepEqual(capturedOptions, {
    temperature: 0,
    maxTokens: 8192,
    rejectTruncated: true,
  });
});

test('truncated semantic audit returns unavailable with the service error code', async () => {
  const service = new AgentAuditService({
    judge: async () => {
      const error = new Error('DeepSeek API 请求失败: AI 返回内容被截断');
      error.code = 'AI_RESPONSE_TRUNCATED';
      error.finishReason = 'length';
      throw error;
    },
  });

  const result = await service.verifyRevision({
    candidate: { text: '参与用户访谈并整理反馈', factRefs: ['f1'] },
    facts,
    requirement: { id: 'r1', sourceText: '用户研究' },
  });

  assert.equal(result.status, 'unavailable');
  const finding = result.findings.find((item) => item.type === 'semantic_audit_unavailable');
  assert.equal(finding.code, 'AI_RESPONSE_TRUNCATED');
  assert.equal(finding.finishReason, 'length');
});

test('empty or invalid semantic JSON returns unavailable with a diagnostic code', async () => {
  for (const code of ['AI_RESPONSE_EMPTY', 'AI_RESPONSE_INVALID_JSON']) {
    const service = new AgentAuditService({
      judge: async () => {
        const error = new Error('AI 返回结果解析失败，请重试');
        error.code = code;
        throw error;
      },
    });

    const result = await service.verifyRevision({
      candidate: { text: '参与用户访谈并整理反馈', factRefs: ['f1'] },
      facts,
      requirement: { id: 'r1', sourceText: '用户研究' },
    });

    assert.equal(result.status, 'unavailable');
    const finding = result.findings.find((item) => item.type === 'semantic_audit_unavailable');
    assert.equal(finding.code, code);
  }
});

test('deterministic block does not call the semantic judge', async () => {
  let judgeCalls = 0;
  const service = new AgentAuditService({
    judge: async () => {
      judgeCalls += 1;
      return {
        status: 'passed',
        findings: [],
        supportedClaims: [],
        unsupportedClaims: [],
        factRefs: ['f1'],
      };
    },
  });

  const result = await service.verifyRevision({
    candidate: { text: '独立访谈500位用户', factRefs: ['f1'] },
    facts,
  });

  assert.equal(result.status, 'blocked');
  assert.equal(judgeCalls, 0);
});

test('deterministic warning is retained after semantic audit passes', async () => {
  const service = new AgentAuditService({
    judge: async () => ({
      status: 'passed',
      findings: [],
      supportedClaims: ['参与约20位用户访谈'],
      unsupportedClaims: [],
      factRefs: ['f1'],
    }),
  });

  const result = await service.verifyRevision({
    candidate: { text: '参与约20位用户访谈', factRefs: ['f1'] },
    facts: [{
      ...facts[0],
      sourceText: '参与用户访谈',
      quantity: '20',
      quantityType: 'estimated',
    }],
  });

  assert.equal(result.status, 'warning');
  assert.ok(result.findings.some((item) => item.type === 'estimated_number'));
});

test('semantic audit cannot introduce a new fact reference or internal status', async () => {
  const unknownRef = new AgentAuditService({
    judge: async () => ({
      status: 'passed',
      findings: [],
      supportedClaims: ['参与用户访谈'],
      unsupportedClaims: [],
      factRefs: ['missing'],
    }),
  });
  const internalStatus = new AgentAuditService({
    judge: async () => ({
      status: 'repairable',
      findings: [],
      supportedClaims: [],
      unsupportedClaims: [],
      factRefs: ['f1'],
    }),
  });
  const input = {
    candidate: { text: '参与用户访谈并整理反馈', factRefs: ['f1'] },
    facts,
  };

  assert.equal((await unknownRef.verifyRevision(input)).status, 'unavailable');
  assert.equal((await internalStatus.verifyRevision(input)).status, 'unavailable');
});
