const test = require('node:test');
const assert = require('node:assert/strict');
const {
  buildSessionSummary,
  buildSessionListItem,
  buildTaskSummary,
} = require('../services/agent/agentSummary');

const CREATED_AT = '2026-08-08T00:00:00.000Z';
const UPDATED_AT = '2026-08-09T00:00:00.000Z';

function fact(id, sourceText, confirmation = 'confirmed') {
  return { id, sourceText, confirmation };
}

function task(overrides = {}) {
  return {
    id: 'task-1',
    requirementId: 'requirement-1',
    factIds: ['fact-1'],
    state: 'pending',
    effectiveRounds: 0,
    ...overrides,
  };
}

function session(overrides = {}) {
  return {
    id: 'session-1',
    state: 'task_in_progress',
    createdAt: CREATED_AT,
    updatedAt: UPDATED_AT,
    requirements: [
      { id: 'requirement-1', sourceText: '负责用户研究并形成洞察' },
      { id: 'requirement-2', sourceText: '推动跨团队协作' },
    ],
    resumeFacts: [
      fact('fact-1', '设计访谈提纲并访谈 8 位用户'),
      fact('fact-2', '协调设计与研发完成两轮验证'),
    ],
    tasks: [],
    ...overrides,
  };
}

test('aggregates every task and never loses an earlier adopted result when a later one overwrites handoff', () => {
  const summary = buildSessionSummary(session({
    tasks: [
      task({
        id: 'task-1',
        state: 'accepted',
        currentText: '设计访谈提纲并访谈 8 位用户',
        candidate: {
          text: '设计访谈提纲并访谈 8 位用户',
          factRefs: ['fact-1'],
          verification: { status: 'passed', findings: [] },
        },
      }),
      task({
        id: 'task-2',
        requirementId: 'requirement-2',
        factIds: ['fact-2'],
        state: 'ready_for_reevaluation',
        currentText: '协调设计与研发完成两轮验证',
        candidate: {
          text: '协调设计与研发完成两轮验证',
          factRefs: ['fact-2'],
          verification: { status: 'passed', findings: [] },
        },
        validationRecords: [{
          currentText: '协调设计与研发完成两轮验证',
          safetyStatus: 'passed',
          changeOutcome: 'improved',
          createdAt: '2026-08-09T00:00:00.000Z',
        }],
      }),
    ],
    // 现有 getHandoff 只保存最后一个任务的结果，汇总不能据此生成。
    handoff: { taskId: 'task-2', finalText: '协调设计与研发完成两轮验证' },
  }));

  assert.equal(summary.tasks.length, 2);
  assert.equal(summary.tasks[0].id, 'task-1');
  assert.equal(summary.tasks[0].currentText, '设计访谈提纲并访谈 8 位用户');
  assert.equal(summary.tasks[1].id, 'task-2');
  assert.equal(summary.tasks[1].currentText, '协调设计与研发完成两轮验证');
  assert.equal(summary.tasks[1].verificationStatus, 'passed');
  assert.deepEqual(summary.totals, {
    taskCount: 2,
    completedCount: 2,
    adoptedCount: 2,
    decisionPendingCount: 0,
    draftCount: 0,
    incompleteCount: 0,
  });
  assert.equal(summary.handoff.taskId, 'task-2');
});

test('a later user edit invalidates the old passing validation for the new text', () => {
  const summary = buildTaskSummary(session(), task({
    state: 'user_edited',
    currentText: '独立完成用户研究与洞察输出',
    candidate: {
      text: '独立完成用户研究与洞察输出',
      factRefs: ['fact-1'],
      contentSource: 'user_edited',
      verification: {
        status: 'unverified_user_content',
        findings: [{ type: 'unsupported_ownership', message: '需要确认个人贡献' }],
      },
    },
    validationRecords: [{
      baselineText: '参与用户访谈',
      currentText: '参与用户访谈并整理洞察',
      safetyStatus: 'passed',
      changeOutcome: 'improved',
      remainingIssues: [],
    }],
  }));

  assert.equal(summary.currentText, '独立完成用户研究与洞察输出');
  assert.equal(summary.expressionKind, 'draft');
  assert.equal(summary.verificationStatus, 'unverified_user_content');
  assert.equal(summary.completed, false);
  assert.equal(summary.validation.stale, true);
  assert.equal(summary.validation.safetyStatus, 'passed');
  assert.ok(summary.risks.some((item) => item.type === 'unsupported_ownership'));
});

test('ready_for_reevaluation with a stale validation record does not claim the new text is verified', () => {
  const summary = buildTaskSummary(session(), task({
    state: 'ready_for_reevaluation',
    currentText: '再次编辑后的新文本',
    candidate: {
      text: '再次编辑后的新文本',
      verification: { status: 'passed', findings: [] },
    },
    validationRecords: [{
      currentText: '早先通过验证的文本',
      safetyStatus: 'passed',
    }],
  }));

  assert.equal(summary.verificationStatus, 'unverified_user_content');
  assert.equal(summary.validation.stale, true);
  assert.equal(summary.adopted, true);
});

test('completed_with_risk keeps blocked verification, acknowledgement, and risk warnings', () => {
  const summary = buildTaskSummary(session(), task({
    state: 'completed_with_risk',
    currentText: '独立访谈 500 位用户',
    riskAcknowledged: true,
    candidate: {
      text: '独立访谈 500 位用户',
      factRefs: ['fact-1'],
      verification: { status: 'blocked', findings: [{ type: 'estimated_number' }] },
    },
    validationRecords: [{
      currentText: '独立访谈 500 位用户',
      safetyStatus: 'blocked',
      changeOutcome: 'improved',
      remainingIssues: [{ type: 'evidence_gap', message: '数量缺少事实依据' }],
    }],
  }));

  assert.equal(summary.verificationStatus, 'blocked');
  assert.equal(summary.riskAcknowledged, true);
  assert.equal(summary.expressionKind, 'adopted_with_risk');
  assert.equal(summary.adopted, true);
  assert.equal(summary.completed, true);
  assert.equal(summary.validation.safetyStatus, 'blocked');
  assert.ok(summary.risks.some((item) => item.type === 'estimated_number'));
  assert.ok(summary.risks.some((item) => item.type === 'evidence_gap'));
});

test('an unadopted candidate stays pending instead of being reported as adopted', () => {
  const summary = buildTaskSummary(session(), task({
    state: 'awaiting_user_decision',
    candidate: {
      text: '主导用户研究并输出关键洞察',
      factRefs: ['fact-1'],
      verification: { status: 'warning', findings: [{ type: 'estimated_number' }] },
    },
  }));

  assert.equal(summary.adopted, false);
  assert.equal(summary.decisionPending, true);
  assert.equal(summary.expressionKind, 'candidate');
  assert.equal(summary.currentText, '');
  assert.equal(summary.candidateText, '主导用户研究并输出关键洞察');
  assert.equal(summary.verificationStatus, 'warning');
  assert.equal(summary.completed, false);
});

test('a failed candidate remains visible but is not labeled as awaiting a decision', () => {
  const summary = buildSessionSummary(session({
    tasks: [task({
      state: 'verification_failed',
      candidate: {
        text: '存在风险的候选表达',
        factRefs: ['fact-1'],
        verification: { status: 'blocked', findings: [{ type: 'unsupported_claim' }] },
      },
    })],
  }));

  assert.equal(summary.tasks[0].expressionKind, 'candidate_unverified');
  assert.equal(summary.tasks[0].candidateText, '存在风险的候选表达');
  assert.equal(summary.tasks[0].decisionPending, false);
  assert.equal(summary.tasks[0].adopted, false);
  assert.equal(summary.tasks[0].verificationStatus, 'blocked');
  assert.equal(summary.totals.completedCount, 0);
});

test('rejected, skipped, capability_gap, and unfinished tasks keep accurate states and source text', () => {
  const summary = buildSessionSummary(session({
    tasks: [
      task({ id: 'task-1', state: 'rejected' }),
      task({ id: 'task-2', state: 'skipped' }),
      task({ id: 'task-3', state: 'capability_gap', gapType: 'capability' }),
      task({ id: 'task-4', state: 'questioning' }),
      task({ id: 'task-5', state: 'awaiting_user_decision', candidate: { text: '候选表达' } }),
      task({ id: 'task-6', state: 'user_edited', currentText: '草稿表达' }),
    ],
  }));

  const byId = new Map(summary.tasks.map((item) => [item.id, item]));
  ['task-1', 'task-2', 'task-3'].forEach((id) => {
    assert.equal(byId.get(id).completed, true, `${id} should be handled`);
    assert.equal(byId.get(id).adopted, false, `${id} should not be adopted`);
    assert.equal(byId.get(id).verificationStatus, 'not_applicable');
    assert.equal(byId.get(id).originalText, '设计访谈提纲并访谈 8 位用户');
    assert.equal(byId.get(id).expressionKind, 'none');
    assert.equal(byId.get(id).currentText, '');
  });
  assert.equal(byId.get('task-4').completed, false);
  assert.equal(byId.get('task-4').verificationStatus, 'not_generated');
  assert.equal(byId.get('task-5').decisionPending, true);
  assert.equal(byId.get('task-5').completed, false);
  assert.equal(byId.get('task-6').verificationStatus, 'unverified_user_content');
  assert.equal(byId.get('task-6').completed, false, 'a saved draft must not count as completed');

  assert.deepEqual(summary.totals, {
    taskCount: 6,
    completedCount: 3,
    adoptedCount: 0,
    decisionPendingCount: 1,
    draftCount: 1,
    incompleteCount: 3,
  });
});

test('legacy sessions missing currentText, validationRecords, factIds, and handoff still render safely', () => {
  const summary = buildSessionSummary(session({
    requirements: undefined,
    resumeFacts: undefined,
    handoff: undefined,
    tasks: [
      {
        id: 'legacy-accepted',
        requirementId: 'missing-requirement',
        state: 'accepted',
        candidate: { text: '旧版已采用表达' },
      },
      {
        id: 'legacy-ready',
        state: 'ready_for_reevaluation',
        candidate: { text: '旧版已验证表达', verification: { status: 'passed' } },
      },
    ],
  }));

  assert.equal(summary.title, '简历优化会话 2026-08-08');
  assert.equal(summary.handoff, null);
  assert.equal(summary.tasks[0].requirementText, '岗位要求');
  assert.equal(summary.tasks[0].currentText, '旧版已采用表达');
  assert.equal(summary.tasks[0].originalText, '');
  assert.deepEqual(summary.tasks[0].factRefs, []);
  assert.equal(summary.tasks[0].validation, null);
  assert.equal(summary.tasks[0].verificationStatus, 'unavailable');
  assert.equal(summary.tasks[1].currentText, '旧版已验证表达');
  assert.equal(summary.tasks[1].verificationStatus, 'passed');
});

test('legacy confirmed facts without a recorded source are marked legacy instead of user-confirmed', () => {
  const summary = buildSessionSummary(session({
    resumeFacts: [
      fact('fact-1', '设计访谈提纲并访谈 8 位用户'),
      { id: 'fact-2', sourceText: '用户本次确认的事实', confirmation: 'confirmed', confirmationSource: 'user' },
      { id: 'fact-3', sourceText: '待确认事实', confirmation: 'pending_confirmation', confirmationSource: 'auto' },
    ],
    tasks: [task({ factIds: ['fact-1', 'fact-2', 'fact-3'] })],
  }));

  assert.deepEqual(
    summary.tasks[0].facts.map(({ id, confirmation, confirmationSource }) => ({ id, confirmation, confirmationSource })),
    [
      { id: 'fact-1', confirmation: 'confirmed', confirmationSource: 'legacy' },
      { id: 'fact-2', confirmation: 'confirmed', confirmationSource: 'user' },
      { id: 'fact-3', confirmation: 'pending_confirmation', confirmationSource: 'auto' },
    ],
  );
});

test('list item uses structured JD fields, task progress, and safe defaults', () => {
  const item = buildSessionListItem({
    _id: { toString: () => 'session-1' },
    state: 'task_in_progress',
    createdAt: CREATED_AT,
    updatedAt: UPDATED_AT,
    jdId: {
      parsed: { company: '示例公司', position: '产品经理' },
    },
    tasks: [{ state: 'accepted' }, { state: 'user_edited' }, { state: 'pending' }],
  });

  assert.equal(item.id, 'session-1');
  assert.equal(item.type, 'agent');
  assert.equal(item.title, '示例公司 · 产品经理');
  assert.equal(item.taskCount, 3);
  assert.equal(item.completedCount, 1);
  assert.deepEqual(item.progress, { completed: 1, total: 3 });

  const fallback = buildSessionListItem({
    id: 'session-2',
    state: 'draft',
    createdAt: CREATED_AT,
    tasks: undefined,
  });
  assert.equal(fallback.title, '简历优化会话 2026-08-08');
  assert.equal(fallback.taskCount, 0);
  assert.equal(fallback.completedCount, 0);
  assert.deepEqual(fallback.progress, { completed: 0, total: 0 });
});
