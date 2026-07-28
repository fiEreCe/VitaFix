const test = require('node:test');
const assert = require('node:assert/strict');

const { AgentAuditService } = require('../services/agent/agentAuditService');

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
