const test = require('node:test');
const assert = require('node:assert/strict');
const { createAgentSessionController } = require('../controllers/agentSessionController');

function response() { return { statusCode: 200, body: null, status(code) { this.statusCode = code; return this; }, json(value) { this.body = value; return this; } }; }

test('create validates ids and returns the new agent session', async () => {
  const controller = createAgentSessionController({
    orchestrator: { createSession: async () => ({ id: 'session-1', state: 'draft' }) },
    loadInputs: async () => ({ jdText: 'JD', resumeText: '简历' }),
  });
  const res = response();
  await controller.create({ userId: 'u1', body: { jdId: 'jd1', resumeId: 'resume1' } }, res);
  assert.equal(res.statusCode, 201);
  assert.equal(res.body.id, 'session-1');
});

test('create forwards loaded supplementary experiences into session creation', async () => {
  let captured = null;
  const supplements = [{ type: '项目', title: '数据分析项目', period: '2024', description: '使用SQL分析用户行为', includedInResume: false }];
  const controller = createAgentSessionController({
    orchestrator: {
      createSession: async (value) => {
        captured = value;
        return { id: 'session-1', state: 'draft' };
      },
    },
    loadInputs: async () => ({ jdText: 'JD', resumeText: '简历', supplements }),
  });
  const res = response();
  await controller.create({ userId: 'u1', body: { jdId: 'jd1', resumeId: 'resume1' } }, res);
  assert.equal(res.statusCode, 201);
  assert.deepEqual(captured.supplements, supplements);
  assert.equal(captured.resumeText, '简历');
});

test('list scopes to the current user, paginates, and returns only summary fields', async () => {
  let captured = null;
  const controller = createAgentSessionController({
    orchestrator: {},
    repository: {
      list: async (args) => {
        captured = args;
        return {
          records: [{
            _id: 'session-1',
            state: 'task_in_progress',
            createdAt: '2026-08-08T00:00:00.000Z',
            updatedAt: '2026-08-09T00:00:00.000Z',
            jdId: { parsed: { company: '示例公司', position: '产品经理' } },
            tasks: [{ state: 'accepted' }, { state: 'user_edited' }],
          }],
          total: 1,
        };
      },
    },
  });
  const res = response();

  await controller.list({ userId: 'u1', query: { page: '2', pageSize: '10', sort: 'asc' } }, res);

  assert.deepEqual(captured, { userId: 'u1', page: 2, pageSize: 10, sort: 'asc' });
  assert.equal(res.body.total, 1);
  assert.equal(res.body.page, 2);
  assert.equal(res.body.pageSize, 10);
  assert.equal(res.body.list[0].type, 'agent');
  assert.equal(res.body.list[0].title, '示例公司 · 产品经理');
  assert.equal(res.body.list[0].taskCount, 2);
  assert.equal(res.body.list[0].completedCount, 1);
  assert.equal(res.body.list[0].progress.completed, 1);
  assert.equal(res.body.list[0].progress.total, 2);
  assert.equal(res.body.list[0].resumeFacts, undefined);
  assert.equal(res.body.list[0].inputSnapshot, undefined);
});

test('list clamps invalid pagination and defaults to newest first', async () => {
  let captured = null;
  const controller = createAgentSessionController({
    orchestrator: {},
    repository: {
      list: async (args) => {
        captured = args;
        return { records: [], total: 0 };
      },
    },
  });
  const res = response();

  await controller.list({ userId: 'u1', query: { page: '0', pageSize: '999', sort: 'unknown' } }, res);

  assert.deepEqual(captured, { userId: 'u1', page: 1, pageSize: 100, sort: 'desc' });
  assert.deepEqual(res.body, {
    list: [],
    total: 0,
    page: 1,
    pageSize: 100,
    totalPages: 0,
  });
});

test('summary refuses another user session and returns persisted multi-task results', async () => {
  const persisted = {
    _id: 'session-1',
    userId: 'u1',
    state: 'ready_for_reevaluation',
    createdAt: '2026-08-08T00:00:00.000Z',
    updatedAt: '2026-08-09T00:00:00.000Z',
    requirements: [{ id: 'r1', sourceText: '用户研究' }],
    resumeFacts: [{ id: 'f1', sourceText: '访谈 8 位用户', confirmation: 'confirmed' }],
    tasks: [{
      id: 'task-1',
      requirementId: 'r1',
      factIds: ['f1'],
      state: 'accepted',
      currentText: '访谈 8 位用户形成洞察',
      candidate: { text: '访谈 8 位用户形成洞察', verification: { status: 'passed' } },
    }],
    jdId: { parsed: { company: '示例公司', position: '产品经理' } },
  };
  const repository = {
    getForSummary: async (id, userId) => (id === 'session-1' && userId === 'u1' ? persisted : null),
  };
  const controller = createAgentSessionController({ orchestrator: {}, repository });

  const forbidden = response();
  await controller.summary({ userId: 'u2', params: { id: 'session-1' } }, forbidden);
  assert.equal(forbidden.statusCode, 404);
  assert.equal(forbidden.body.error.code, 'AGENT_SESSION_NOT_FOUND');

  const res = response();
  await controller.summary({ userId: 'u1', params: { id: 'session-1' } }, res);
  assert.equal(res.statusCode, 200);
  assert.equal(res.body.title, '示例公司 · 产品经理');
  assert.equal(res.body.totals.taskCount, 1);
  assert.equal(res.body.totals.completedCount, 1);
  assert.equal(res.body.tasks[0].currentText, '访谈 8 位用户形成洞察');
  assert.deepEqual(res.body.tasks[0].factRefs, ['f1']);
});
