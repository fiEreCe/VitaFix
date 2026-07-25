# PF-001 Evidence-Driven Resume Agent Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Deliver the V0.1 vertical slice in which one recommended resume task moves through evidence assessment, dynamic questioning, fact confirmation, candidate generation, PF-002 verification, user decision, and recoverable persistence.

**Architecture:** Add an independent `AgentSession` module beside the legacy score-based `Analysis` flow. Keep business rules pure and deterministic, place DeepSeek behind an injectable tool adapter, persist the server-owned state machine in MongoDB, and render the Vue workbench only from server-returned state.

**Tech Stack:** Node.js 18+, Express 5, Mongoose 9, Node built-in test runner, Vue 3, Vue Router, Vant 4, Vite 8, DeepSeek chat completions.

---

## File map

New server files:

- `server/domain/agent/contracts.js`: enums, required-field schemas, ID/reference validation.
- `server/domain/agent/policy.js`: sufficiency, answer-round, clarification, and gap rules.
- `server/domain/agent/guardrails.js`: deterministic PF-002 candidate and user-edit checks.
- `server/models/AgentSession.js`: persisted session, task, fact, candidate, transition, and handoff data.
- `server/services/agent/agentToolService.js`: injectable AI tool adapter and structured prompts.
- `server/services/agent/agentOrchestrator.js`: server-owned workflow and state transitions.
- `server/controllers/agentSessionController.js`: HTTP validation and response mapping.
- `server/routes/agentSession.js`: `/api/agent-sessions` routes.
- `server/test/helpers/inMemoryAgentRepository.js`: deterministic repository for orchestration tests.
- `server/test/*.test.js`: unit, orchestration, and controller tests.

Modified server files:

- `server/package.json`: test scripts.
- `server/services/deepseekService.js`: bounded retry inside one concurrency slot and sanitized errors.
- `server/utils/promptTemplates.js`: PF-001 structured prompt builders.
- `server/app.js`: mount Agent routes.

New web files:

- `web/src/views/AgentWorkbench.vue`: state-driven workbench.
- `web/src/components/agent/TaskList.vue`: task selection and recommendation.
- `web/src/components/agent/EvidencePanel.vue`: JD source, resume source, facts, and gaps.
- `web/src/components/agent/QuestionCard.vue`: one-question interaction and special answers.
- `web/src/components/agent/FactConfirmationCard.vue`: confirm, correct, reject.
- `web/src/components/agent/InsufficientOptionsCard.vue`: continue, conservative draft, manual edit, or skip.
- `web/src/components/agent/CandidateDecisionCard.vue`: verified candidate and user decision.

Modified web files:

- `web/src/api/index.js`: Agent API client.
- `web/src/router/index.js`: workbench route.
- `web/src/views/Supplement.vue`: create Agent session instead of legacy analysis for the new flow.

## Task 1: Establish tests and repair DeepSeek retry safety

**Files:**
- Modify: `server/package.json`
- Modify: `server/services/deepseekService.js`
- Test: `server/test/deepseekService.test.js`

- [ ] **Step 1: Add the test command**

Add:

```json
{
  "scripts": {
    "start": "node app.js",
    "dev": "node --watch app.js",
    "test": "node --test",
    "test:agent": "node --test test/agent*.test.js test/deepseekService.test.js"
  }
}
```

- [ ] **Step 2: Write failing retry tests**

```js
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
```

- [ ] **Step 3: Run tests and verify the current implementation fails**

Run: `cd server; npm test -- test/deepseekService.test.js`

Expected: FAIL because `DeepSeekService` is not exported/injectable and recursive retry acquires more than one slot.

- [ ] **Step 4: Replace recursive retry with a bounded loop**

Implement a constructor accepting `{ client, delay }`, export the class plus the singleton, and make `chat()` acquire once:

```js
async chat(prompt, options = {}, retries = 2) {
  await this._acquireSlot();
  try {
    for (let attempt = 0; attempt <= retries; attempt += 1) {
      try {
        const response = await this.client.post('/chat/completions', this._buildPayload(prompt, options));
        return response.data.choices[0].message.content.trim();
      } catch (error) {
        if (attempt === retries || !this._isRetryable(error)) throw this._publicError(error);
        await this.delay(1000 * (attempt + 1));
      }
    }
  } finally {
    this._releaseSlot();
  }
}
```

In `chatJSON()`, log only `{ errorName, responseLength }`, then throw `AI 返回结果解析失败，请重试`.

- [ ] **Step 5: Run tests**

Run: `cd server; npm test -- test/deepseekService.test.js`

Expected: 2 tests pass.

- [ ] **Step 6: Commit**

```bash
git add server/package.json server/services/deepseekService.js server/test/deepseekService.test.js
git commit -m "fix: make AI retries bounded and privacy safe"
```

## Task 2: Freeze PF-001 contracts and reference validation

**Files:**
- Create: `server/domain/agent/contracts.js`
- Test: `server/test/agentContracts.test.js`

- [ ] **Step 1: Write failing contract tests**

```js
const test = require('node:test');
const assert = require('node:assert/strict');
const { validateToolResult, SESSION_STATES } = require('../domain/agent/contracts');

test('rejects an evidence match that references an unknown fact', () => {
  assert.throws(() => validateToolResult('matchEvidence', {
    requirements: [{ id: 'req-1' }],
    facts: [{ id: 'fact-1' }],
    matches: [{ requirementId: 'req-1', factIds: ['fact-missing'], gapType: 'information' }],
  }), /UNKNOWN_FACT_REF/);
});

test('exports the complete V0.1 session state set', () => {
  assert.deepEqual(SESSION_STATES, [
    'draft', 'parsing', 'matching', 'evidence_ready', 'task_in_progress',
    'ready_for_reevaluation', 'completed', 'cancelled', 'expired',
  ]);
});
```

- [ ] **Step 2: Run and verify RED**

Run: `cd server; npm test -- test/agentContracts.test.js`

Expected: FAIL with module-not-found.

- [ ] **Step 3: Implement exact enums and validators**

Export frozen arrays for session states, task states, answer qualities, fact confirmations, sufficiency, gap types, verification results, and decisions. Implement:

```js
function requireFields(value, fields, code) {
  if (!value || fields.some((field) => value[field] === undefined)) {
    throw Object.assign(new Error(code), { code });
  }
}

function assertReferences(items, validIds, field, code) {
  for (const item of items) {
    for (const id of item[field] || []) {
      if (!validIds.has(id)) throw Object.assign(new Error(code), { code });
    }
  }
}

function validateToolResult(toolName, value) {
  if (toolName === 'matchEvidence') {
    requireFields(value, ['requirements', 'facts', 'matches'], 'INVALID_MATCH_SCHEMA');
    const requirementIds = new Set(value.requirements.map((x) => x.id));
    for (const match of value.matches) {
      if (!requirementIds.has(match.requirementId)) {
        throw Object.assign(new Error('UNKNOWN_REQUIREMENT_REF'), { code: 'UNKNOWN_REQUIREMENT_REF' });
      }
    }
    assertReferences(value.matches, new Set(value.facts.map((x) => x.id)), 'factIds', 'UNKNOWN_FACT_REF');
  }
  return value;
}
```

Add tool-specific required fields and enum checks for `parseJD`, `parseResume`, `assessAnswer`, `draftRevision`, and `verifyRevision`. The task-state enum must include the normal states plus `parse_failed`, `match_failed`, `question_failed`, `generation_failed`, and `verification_failed`.

- [ ] **Step 4: Run tests**

Run: `cd server; npm test -- test/agentContracts.test.js`

Expected: all contract tests pass.

- [ ] **Step 5: Commit**

```bash
git add server/domain/agent/contracts.js server/test/agentContracts.test.js
git commit -m "feat: define PF-001 agent contracts"
```

## Task 3: Implement deterministic questioning and gap policy

**Files:**
- Create: `server/domain/agent/policy.js`
- Test: `server/test/agentPolicy.test.js`

- [ ] **Step 1: Write failing policy tests**

```js
const test = require('node:test');
const assert = require('node:assert/strict');
const {
  calculateSufficiency, applyAnswerQuality, classifyGap, nextInsufficientAction,
} = require('../domain/agent/policy');

test('strong needs action, object, contribution, and method or result', () => {
  assert.equal(calculateSufficiency({
    action: '设计问卷', context: '校园交易用户', contribution: '独立完成',
    method: '访谈与问卷', result: '',
  }), 'strong');
});

test('off-topic clarification does not consume a round and only happens once', () => {
  assert.deepEqual(applyAnswerQuality({ effectiveRounds: 1, clarificationUsed: false }, 'off_topic'),
    { effectiveRounds: 1, clarificationUsed: true, next: 'clarify' });
  assert.equal(applyAnswerQuality({ effectiveRounds: 1, clarificationUsed: true }, 'off_topic').next,
    'return_control');
});

test('only explicit not-done becomes a capability gap', () => {
  assert.equal(classifyGap('not_done'), 'capability');
  for (const quality of ['unknown', 'off_topic', 'contradictory']) {
    assert.equal(classifyGap(quality), 'information');
  }
});

test('three rounds never force generation from insufficient evidence', () => {
  assert.equal(nextInsufficientAction({ effectiveRounds: 3, sufficiency: 'insufficient' }), 'return_control');
});
```

- [ ] **Step 2: Run and verify RED**

Run: `cd server; npm test -- test/agentPolicy.test.js`

Expected: FAIL with module-not-found.

- [ ] **Step 3: Implement pure policy functions**

```js
function calculateSufficiency(fact) {
  const hasAction = Boolean(fact.action);
  const hasObject = Boolean(fact.context);
  const hasBoundary = Boolean(fact.contribution);
  if (hasAction && hasObject && hasBoundary && (fact.method || fact.result)) return 'strong';
  if (hasAction && hasObject && hasBoundary) return 'basic';
  return 'insufficient';
}

function applyAnswerQuality(turn, quality) {
  if (quality === 'off_topic') {
    return turn.clarificationUsed
      ? { ...turn, next: 'return_control' }
      : { ...turn, clarificationUsed: true, next: 'clarify' };
  }
  const consumes = ['relevant', 'partial', 'unknown', 'not_done'].includes(quality);
  return { ...turn, effectiveRounds: turn.effectiveRounds + Number(consumes), next: 'confirm_or_reassess' };
}
```

Implement `classifyGap()` and `nextInsufficientAction()` with the exact rules in the tests.

- [ ] **Step 4: Run tests**

Run: `cd server; npm test -- test/agentPolicy.test.js`

Expected: all policy tests pass.

- [ ] **Step 5: Commit**

```bash
git add server/domain/agent/policy.js server/test/agentPolicy.test.js
git commit -m "feat: add evidence and questioning policy"
```

## Task 4: Implement PF-002 candidate guardrails

**Files:**
- Create: `server/domain/agent/guardrails.js`
- Test: `server/test/agentGuardrails.test.js`

- [ ] **Step 1: Write failing red-line tests**

```js
const test = require('node:test');
const assert = require('node:assert/strict');
const { verifyCandidate, inspectUserEdit } = require('../domain/agent/guardrails');

const facts = [{
  id: 'fact-1', confirmation: 'confirmed', action: '设计问卷',
  contribution: '团队共同完成', quantity: '', sourceText: '参与问卷设计',
}];

test('blocks unknown facts, numbers, and personal attribution', () => {
  const result = verifyCandidate({
    text: '独立设计问卷并收集 500 份样本，上线后转化率提升 30%',
    factRefs: ['fact-1'],
  }, facts);
  assert.equal(result.status, 'unsupported');
  assert.deepEqual(new Set(result.findings.map((x) => x.type)),
    new Set(['unconfirmed_number', 'attribution_expansion', 'unsupported_claim']));
});

test('user edits warn without blocking save', () => {
  const result = inspectUserEdit('独立负责完整产品设计', facts);
  assert.equal(result.canSave, true);
  assert.equal(result.verificationStatus, 'unverified_user_content');
  assert.ok(result.findings.length > 0);
});
```

- [ ] **Step 2: Run and verify RED**

Run: `cd server; npm test -- test/agentGuardrails.test.js`

Expected: FAIL with module-not-found.

- [ ] **Step 3: Implement deterministic checks**

Implement number extraction, allowed confirmed numbers, fact-reference existence, contribution keywords, team/personal attribution, and unsupported phrase comparison:

```js
function verifyCandidate(candidate, facts) {
  const referenced = facts.filter((fact) => candidate.factRefs.includes(fact.id));
  const findings = [
    ...findUnknownNumbers(candidate.text, referenced),
    ...findAttributionExpansion(candidate.text, referenced),
    ...findUnsupportedClaims(candidate.text, referenced),
  ];
  return {
    status: findings.length === 0 ? 'passed' : 'unsupported',
    findings,
    factRefs: referenced.map((fact) => fact.id),
  };
}
```

`inspectUserEdit()` reuses the findings but always returns `canSave: true`.

- [ ] **Step 4: Run tests**

Run: `cd server; npm test -- test/agentGuardrails.test.js`

Expected: all guardrail tests pass.

- [ ] **Step 5: Commit**

```bash
git add server/domain/agent/guardrails.js server/test/agentGuardrails.test.js
git commit -m "feat: add PF-002 deterministic guardrails"
```

## Task 5: Persist recoverable Agent sessions

**Files:**
- Create: `server/models/AgentSession.js`
- Test: `server/test/agentSessionModel.test.js`

- [ ] **Step 1: Write a failing model-shape test**

```js
const test = require('node:test');
const assert = require('node:assert/strict');
const AgentSession = require('../models/AgentSession');

test('model preserves confirmed facts, user text, and transition history', () => {
  const session = new AgentSession({
    userId: 'user-1',
    jdId: '507f1f77bcf86cd799439011',
    resumeId: '507f1f77bcf86cd799439012',
    inputSnapshot: { jdText: 'JD', resumeText: 'resume', frozenAt: new Date() },
    tasks: [{ id: 'task-1', state: 'questioning', confirmedFacts: [{ id: 'fact-1', confirmation: 'confirmed' }], userText: '我的文本' }],
    transitions: [{ from: 'evidence_ready', to: 'task_in_progress', event: 'TASK_SELECTED' }],
  });
  const error = session.validateSync();
  assert.equal(error, undefined);
  assert.equal(session.tasks[0].confirmedFacts[0].confirmation, 'confirmed');
  assert.equal(session.tasks[0].userText, '我的文本');
});
```

- [ ] **Step 2: Run and verify RED**

Run: `cd server; npm test -- test/agentSessionModel.test.js`

Expected: FAIL with module-not-found.

- [ ] **Step 3: Define focused subdocuments**

Create sub-schemas for input snapshot, requirement, fact, evidence match, question turn, candidate, verification, task, transition, and PF-003 handoff. Required top-level fields:

```js
const agentSessionSchema = new mongoose.Schema({
  userId: { type: String, required: true, index: true },
  jdId: { type: mongoose.Schema.Types.ObjectId, ref: 'JD', required: true },
  resumeId: { type: mongoose.Schema.Types.ObjectId, ref: 'Resume', required: true },
  state: { type: String, enum: SESSION_STATES, default: 'draft' },
  currentStep: { type: String, default: 'input_confirmation' },
  inputSnapshot: inputSnapshotSchema,
  requirements: [requirementSchema],
  resumeFacts: [factSchema],
  matches: [matchSchema],
  tasks: [taskSchema],
  transitions: [transitionSchema],
  handoff: handoffSchema,
  expiresAt: { type: Date, index: { expires: 0 } },
}, { timestamps: true });
```

Use explicit string IDs inside nested arrays so AI references never depend on unstable array indexes.

- [ ] **Step 4: Run tests**

Run: `cd server; npm test -- test/agentSessionModel.test.js`

Expected: model test passes.

- [ ] **Step 5: Commit**

```bash
git add server/models/AgentSession.js server/test/agentSessionModel.test.js
git commit -m "feat: persist recoverable agent sessions"
```

## Task 6: Add injectable PF-001 AI tools

**Files:**
- Create: `server/services/agent/agentToolService.js`
- Modify: `server/utils/promptTemplates.js`
- Test: `server/test/agentToolService.test.js`

- [ ] **Step 1: Write a failing adapter test**

```js
const test = require('node:test');
const assert = require('node:assert/strict');
const { AgentToolService } = require('../services/agent/agentToolService');

test('draftRevision only forwards confirmed or corrected facts', async () => {
  let captured;
  const ai = { chatJSON: async (prompt) => { captured = prompt; return {
    text: '设计并执行用户问卷', factRefs: ['fact-1'], requirementRefs: ['req-1'], rationaleSummary: '突出行动',
  }; } };
  const tools = new AgentToolService(ai);
  await tools.draftRevision({
    requirement: { id: 'req-1', sourceText: '用户研究' },
    originalText: '参与调研',
    facts: [
      { id: 'fact-1', confirmation: 'confirmed', action: '设计问卷' },
      { id: 'fact-2', confirmation: 'pending_confirmation', action: '访谈 30 人' },
    ],
    sufficiency: 'basic',
  });
  assert.match(captured, /fact-1/);
  assert.doesNotMatch(captured, /fact-2/);
});
```

- [ ] **Step 2: Run and verify RED**

Run: `cd server; npm test -- test/agentToolService.test.js`

Expected: FAIL with module-not-found.

- [ ] **Step 3: Add structured prompt builders**

Export prompt builders for `parseAgentJD`, `parseAgentResume`, `matchAgentEvidence`, `selectAgentQuestion`, `assessAgentAnswer`, `draftAgentRevision`, and `verifyAgentRevision`. Each prompt must include an exact JSON shape, allowed enums, source-text preservation, and “do not infer facts” instruction.

- [ ] **Step 4: Implement the adapter**

```js
class AgentToolService {
  constructor(aiClient) { this.aiClient = aiClient; }

  async _run(toolName, prompt, options = {}) {
    const value = await this.aiClient.chatJSON(prompt, options);
    return validateToolResult(toolName, value);
  }

  async draftRevision(input) {
    const facts = input.facts.filter((fact) => ['confirmed', 'corrected'].includes(fact.confirmation));
    return this._run('draftRevision', DRAFT_AGENT_REVISION_PROMPT({ ...input, facts }), { temperature: 0.1 });
  }
}
```

Implement all tool methods with the same validation boundary.

- [ ] **Step 5: Run tests**

Run: `cd server; npm test -- test/agentToolService.test.js`

Expected: adapter tests pass.

- [ ] **Step 6: Commit**

```bash
git add server/services/agent/agentToolService.js server/utils/promptTemplates.js server/test/agentToolService.test.js
git commit -m "feat: add structured PF-001 AI tools"
```

## Task 7: Orchestrate the complete high-priority task

**Files:**
- Create: `server/services/agent/agentOrchestrator.js`
- Create: `server/test/helpers/inMemoryAgentRepository.js`
- Test: `server/test/agentOrchestrator.test.js`

- [ ] **Step 1: Write failing vertical-slice tests**

Cover these independent cases in `agentOrchestrator.test.js`:

```js
test('starts analysis and recommends the highest-priority task', async () => {
  const session = await orchestrator.startAnalysis('session-1');
  assert.equal(session.state, 'evidence_ready');
  assert.equal(session.tasks.filter((task) => task.recommended).length, 1);
});

test('confirmed fact is retained when generation fails', async () => {
  await orchestrator.confirmFact('session-1', 'task-1', 'fact-1', { action: '设计问卷' });
  tools.draftRevision = async () => { throw new Error('provider down'); };
  await assert.rejects(orchestrator.generateCandidate('session-1', 'task-1'));
  const session = await repository.get('session-1');
  assert.equal(session.tasks[0].confirmedFacts[0].action, '设计问卷');
  assert.equal(session.tasks[0].state, 'generation_failed');
});

test('repairable candidate is repaired once then stops', async () => {
  tools.verifyRevision = sequence(
    { status: 'repairable', findings: [{ type: 'unconfirmed_number' }] },
    { status: 'unsupported', findings: [{ type: 'unconfirmed_number' }] },
  );
  const result = await orchestrator.generateCandidate('session-1', 'task-1');
  assert.equal(result.task.state, 'generation_failed');
  assert.equal(result.task.repairAttempts, 1);
});
```

Also test relevant/partial round consumption, one off-topic clarification, unknown/not-done split, `basic` conservative generation, and user-edit risk acknowledgement.

- [ ] **Step 2: Run and verify RED**

Run: `cd server; npm test -- test/agentOrchestrator.test.js`

Expected: FAIL with module-not-found.

- [ ] **Step 3: Implement repository and transition helpers**

The in-memory repository exposes `create`, `get`, and `save`. The production default uses `AgentSession.findOne({ _id, userId })` and `document.save()`. Centralize transitions:

```js
function transition(session, task, to, event, toolName = '') {
  const from = task ? task.state : session.state;
  if (task) task.state = to;
  else session.state = to;
  session.transitions.push({ from, to, event, toolName, startedAt: new Date(), endedAt: new Date() });
}
```

- [ ] **Step 4: Implement orchestrator commands**

Implement `createSession`, `startAnalysis`, `selectTask`, `submitAnswer`, `confirmFact`, `correctFact`, `rejectFact`, `generateCandidate`, `recordDecision`, `retryCurrentStep`, and `buildHandoff`.

`startAnalysis()` freezes the current JD/resume text, runs parse/match tools, creates tasks, sorts by priority, and marks exactly one recommended task. `generateCandidate()` recalculates sufficiency, refuses `insufficient`, performs deterministic guardrails plus AI verification, and allows at most one repair.

- [ ] **Step 5: Run orchestration tests**

Run: `cd server; npm test -- test/agentOrchestrator.test.js`

Expected: all vertical-slice and recovery tests pass.

- [ ] **Step 6: Commit**

```bash
git add server/services/agent/agentOrchestrator.js server/test/helpers/inMemoryAgentRepository.js server/test/agentOrchestrator.test.js
git commit -m "feat: orchestrate PF-001 vertical slice"
```

## Task 8: Expose Agent session APIs

**Files:**
- Create: `server/controllers/agentSessionController.js`
- Create: `server/routes/agentSession.js`
- Modify: `server/app.js`
- Test: `server/test/agentSessionController.test.js`

- [ ] **Step 1: Write failing controller tests**

Use fake Express request/response objects and an injected orchestrator:

```js
test('create returns 201 and the session id', async () => {
  const controller = createController({
    createSession: async () => ({ id: 'session-1', state: 'draft' }),
  });
  const res = fakeResponse();
  await controller.create({ userId: 'user-1', body: { jdId: 'jd-1', resumeId: 'resume-1' } }, res);
  assert.equal(res.statusCode, 201);
  assert.deepEqual(res.body, { id: 'session-1', state: 'draft' });
});

test('a session owned by another user returns 404', async () => {
  const controller = createController({ getSession: async () => null });
  const res = fakeResponse();
  await controller.get({ userId: 'other', params: { id: 'session-1' } }, res);
  assert.equal(res.statusCode, 404);
});
```

- [ ] **Step 2: Run and verify RED**

Run: `cd server; npm test -- test/agentSessionController.test.js`

Expected: FAIL with module-not-found.

- [ ] **Step 3: Implement controller actions and stable errors**

Map domain errors to `{ error: { code, message, retryable } }`. Never return raw provider output. Implement create/get/start/select-task/answer/review-fact/generate/decision/retry/handoff actions. `reviewFact` accepts only `confirm`, `correct`, or `reject`; `correct` requires the replacement fact body.

- [ ] **Step 4: Define routes**

```js
router.post('/', controller.create);
router.get('/:id', controller.get);
router.post('/:id/start', controller.start);
router.post('/:id/tasks/:taskId/select', controller.selectTask);
router.post('/:id/tasks/:taskId/answers', controller.submitAnswer);
router.patch('/:id/tasks/:taskId/facts/:factId', controller.reviewFact);
router.post('/:id/tasks/:taskId/generate', controller.generate);
router.post('/:id/tasks/:taskId/decision', controller.decide);
router.post('/:id/retry', controller.retry);
router.get('/:id/handoff', controller.getHandoff);
```

Mount with `userIdMiddleware` at `/api/agent-sessions`.

- [ ] **Step 5: Run tests**

Run: `cd server; npm test -- test/agentSessionController.test.js`

Expected: controller tests pass.

- [ ] **Step 6: Commit**

```bash
git add server/controllers/agentSessionController.js server/routes/agentSession.js server/app.js server/test/agentSessionController.test.js
git commit -m "feat: expose agent session APIs"
```

## Task 9: Connect the intake flow to the workbench

**Files:**
- Modify: `web/src/api/index.js`
- Modify: `web/src/router/index.js`
- Modify: `web/src/views/Supplement.vue`
- Create: `web/src/views/AgentWorkbench.vue`
- Create: `web/src/components/agent/TaskList.vue`
- Create: `web/src/components/agent/EvidencePanel.vue`
- Create: `web/src/components/agent/QuestionCard.vue`
- Create: `web/src/components/agent/FactConfirmationCard.vue`
- Create: `web/src/components/agent/InsufficientOptionsCard.vue`
- Create: `web/src/components/agent/CandidateDecisionCard.vue`

- [ ] **Step 1: Add the complete API client**

```js
export const agentSessionApi = {
  create(jdId, resumeId) {
    return request('/agent-sessions', { method: 'POST', data: { jdId, resumeId } });
  },
  get(id) { return request(`/agent-sessions/${id}`); },
  start(id) { return request(`/agent-sessions/${id}/start`, { method: 'POST' }); },
  selectTask(id, taskId) {
    return request(`/agent-sessions/${id}/tasks/${taskId}/select`, { method: 'POST' });
  },
  answer(id, taskId, answer) {
    return request(`/agent-sessions/${id}/tasks/${taskId}/answers`, { method: 'POST', data: { answer } });
  },
  reviewFact(id, taskId, factId, decision, fact) {
    return request(`/agent-sessions/${id}/tasks/${taskId}/facts/${factId}`, {
      method: 'PATCH', data: { decision, fact },
    });
  },
  generate(id, taskId) {
    return request(`/agent-sessions/${id}/tasks/${taskId}/generate`, { method: 'POST' });
  },
  decide(id, taskId, decision) {
    return request(`/agent-sessions/${id}/tasks/${taskId}/decision`, { method: 'POST', data: decision });
  },
  retry(id) { return request(`/agent-sessions/${id}/retry`, { method: 'POST' }); },
};
```

- [ ] **Step 2: Add the route and switch intake navigation**

Add `/agent/:id` → `AgentWorkbench.vue`. In `Supplement.vue`, replace `analysisApi.create()` with:

```js
const session = await agentSessionApi.create(jdId.value, resumeId.value);
await agentSessionApi.start(session.id);
router.replace(`/agent/${session.id}`);
```

Preserve the legacy result route for historical analyses.

- [ ] **Step 3: Build focused components**

Each child accepts only display data and emits semantic events:

```vue
<QuestionCard
  v-if="task.state === 'questioning'"
  :question="task.currentQuestion"
  :effective-rounds="task.effectiveRounds"
  @submit="$emit('answer', $event)"
/>
```

`QuestionCard` includes option selection, free text, `不记得`, `没有做过`, and `无法证明`. `FactConfirmationCard` emits confirm/correct/reject. `CandidateDecisionCard` clearly distinguishes AI-verified and user-edited content.

`InsufficientOptionsCard` renders only when the server returns control after three effective rounds or a repeated off-topic answer. It emits `continue`, `conservative` only when sufficiency is `basic`, `manual_edit`, or `skip`; the server validates the selected action.

- [ ] **Step 4: Implement state-driven workbench loading**

`AgentWorkbench.vue` loads the session by route ID, derives the selected task, disables actions while a request is active, refreshes after every command, and renders recoverable error state:

```js
async function run(command) {
  busy.value = true;
  try {
    await command();
    session.value = await agentSessionApi.get(route.params.id);
  } catch (error) {
    actionError.value = error.message;
  } finally {
    busy.value = false;
  }
}
```

Do not infer the next task state in Vue.

- [ ] **Step 5: Build the frontend**

Run: `cd web; npm run build`

Expected: Vite build succeeds without Vue compiler errors.

- [ ] **Step 6: Commit**

```bash
git add web/src/api/index.js web/src/router/index.js web/src/views/Supplement.vue web/src/views/AgentWorkbench.vue web/src/components/agent
git commit -m "feat: add evidence-driven agent workbench"
```

## Task 10: Verify the complete V0.1 slice

**Files:**
- Create: `server/test/agentAcceptance.test.js`
- Modify: `README.md`

- [ ] **Step 1: Add a deterministic acceptance fixture**

Create one JD requirement for user research and one resume fact with team attribution. The fake tools must produce: an information gap, one relevant answer, a pending fact, a confirmed fact, one safe candidate, and a passed verification.

- [ ] **Step 2: Write the acceptance test**

```js
test('one recommended task completes from evidence gap to PF-003 handoff', async () => {
  const created = await orchestrator.createSession({ userId: 'user-1', jdId: 'jd-1', resumeId: 'resume-1' });
  await orchestrator.startAnalysis(created.id);
  await orchestrator.selectTask(created.id, 'task-1');
  await orchestrator.submitAnswer(created.id, 'task-1', '我设计了访谈提纲并整理洞察');
  await orchestrator.confirmFact(created.id, 'task-1', 'fact-new', {
    action: '设计访谈提纲并整理洞察', context: '校园交易用户',
    contribution: '个人负责调研部分', confirmation: 'confirmed',
  });
  await orchestrator.generateCandidate(created.id, 'task-1');
  await orchestrator.recordDecision(created.id, 'task-1', { type: 'accepted' });
  const handoff = await orchestrator.buildHandoff(created.id, 'task-1');
  assert.equal(handoff.verificationStatus, 'passed');
  assert.equal(handoff.contentSource, 'ai_generated');
  assert.ok(handoff.finalText);
  assert.ok(handoff.factRefs.includes('fact-new'));
});
```

- [ ] **Step 3: Run the full server suite**

Run: `cd server; npm test`

Expected: zero failures and zero leaked raw-model-output logs.

- [ ] **Step 4: Run the production frontend build**

Run: `cd web; npm run build`

Expected: exit code 0 and generated `web/dist`.

- [ ] **Step 5: Update README**

Document the new `/agent/:id` flow, `npm test`, required `MONGODB_URI`/`DEEPSEEK_API_KEY`, temporary-session behavior, and the fact that PF-003 UI is outside this slice.

- [ ] **Step 6: Check the requirements one by one**

Confirm against the design:

- task list and one recommendation;
- one-question dynamic follow-up;
- effective round and clarification rules;
- per-round fact confirmation;
- strong/basic/insufficient behavior;
- capability versus information gap;
- PF-002 fact verification and one repair limit;
- non-blocking user-edit risks;
- refresh/failure recovery;
- complete PF-003 handoff.

- [ ] **Step 7: Commit**

```bash
git add server/test/agentAcceptance.test.js README.md
git commit -m "test: verify PF-001 V0.1 vertical slice"
```

- [ ] **Step 8: Final verification**

Run:

```bash
cd server
npm test
cd ../web
npm run build
git status --short
```

Expected: all tests pass, build exits 0, and only intentionally ignored/generated files remain.
