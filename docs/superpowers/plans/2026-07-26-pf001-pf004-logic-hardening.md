# PF-001 至 PF-004 逻辑加固实施计划

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** 在保留并兼容现有数据的前提下，修复 PF-001 至 PF-004 的持久化、状态机、证据追问、安全审核、修改验证、交接、数据隔离、演示契约和错误显示问题。

**Architecture:** 保留现有 MVC 与 `domain/agent`、`services/agent` 分层；将确定性契约和红线留在 domain，将 AI 结构化判断放在可注入的 service，将 orchestrator 作为唯一状态迁移入口。旧数据通过可重复运行的归属迁移服务回填，无法证明归属的数据继续保留但不向用户接口暴露。

**Tech Stack:** Node.js 18+、Express 5、Mongoose 9、Node test runner、Vue 3、Vite 8、DeepSeek JSON API。

---

## 文件结构

新增文件：

- `server/domain/agent/textEvidence.js`：中英文规范化、中文 n-gram、语义重叠和数字用途提取。
- `server/services/ownershipMigration.js`：可注入、可 dry-run、幂等的数据归属迁移服务。
- `server/scripts/migrate-ownership.js`：迁移命令入口。
- `server/test/agentPersistence.test.js`：真实 Mongoose 文档序列化与枚举回归。
- `server/test/textEvidence.test.js`：中文匹配和数字用途回归。
- `server/test/ownershipMigration.test.js`：唯一归属、冲突、孤立和幂等回归。
- `server/test/ownershipControllers.test.js`：JD、Resume、Supplement、Analysis 和 AgentSession 越权回归。
- `web/test/demo.test.mjs`：PF-004 运行时 fixture 和演示埋点隔离测试。

主要修改文件：

- `server/domain/agent/contracts.js`：补齐状态和工具结果契约。
- `server/domain/agent/policy.js`：合并事实后的充分度计算和轮次政策。
- `server/domain/agent/guardrails.js`：数字用途、职责同义词和语义重叠红线。
- `server/models/{AgentSession,JD,Resume,Supplement}.js`：持久化字段和归属。
- `server/controllers/*.js`、`server/routes/*.js`、`server/app.js`：归属查询、错误契约和中间件。
- `server/services/agent/{agentOrchestrator,agentToolService,agentAuditService,modificationValidator,pf002Evaluator}.js`：PF-001 至 PF-003 主流程。
- `server/utils/promptTemplates.js`：回答评估、独立审核和修改验证提示词。
- `web/src/{api/index.js,router/index.js,utils/analytics.js,demo/fixture.js,views/GuidedDemo.vue,views/AgentWorkbench.vue}`：错误解析、demo 隔离和新状态展示。

## Task 1：修复持久化契约和状态迁移

**Files:**

- Create: `server/test/agentPersistence.test.js`
- Modify: `server/domain/agent/contracts.js`
- Modify: `server/models/AgentSession.js`
- Modify: `server/services/agent/agentOrchestrator.js`
- Test: `server/test/agentPersistence.test.js`
- Test: `server/test/agentOrchestrator.test.js`

- [ ] **Step 1：写 Mongoose 持久化失败测试**

```js
const test = require('node:test');
const assert = require('node:assert/strict');
const AgentSession = require('../models/AgentSession');
const { AgentOrchestrator } = require('../services/agent/agentOrchestrator');

function repositoryHarness() {
  const store = new Map();
  return {
    store,
    repository: {
      async create(value) {
        store.set(value.id, structuredClone(value));
        return store.get(value.id);
      },
      async get(id) { return store.get(id); },
      async save(value) {
        store.set(value.id, structuredClone(value));
        return store.get(value.id);
      },
    },
  };
}

test('persists pending fact metadata and return_control', () => {
  const doc = new AgentSession({
    userId: 'u1',
    tasks: [{
      id: 't1',
      state: 'questioning',
      factIds: [],
      effectiveRounds: 0,
      pendingFactId: 'f1',
      currentQuestion: '你具体负责了什么？',
      questionTarget: 'contribution',
    }],
  });
  doc.tasks[0].state = 'return_control';
  assert.equal(doc.validateSync(), undefined);
  assert.equal(doc.toObject().tasks[0].pendingFactId, 'f1');
  assert.equal(doc.toObject().tasks[0].questionTarget, 'contribution');
});

test('transition changes current state and records the actual previous state', async () => {
  const h = repositoryHarness();
  const app = new AgentOrchestrator({
    repository: h.repository,
    tools: {
      parseJD: async () => ({
        requirements: [{ id: 'r1', sourceText: '用户研究', priority: 1 }],
      }),
      parseResume: async () => ({
        facts: [{ id: 'f1', sourceText: '参与访谈', confirmation: 'confirmed' }],
      }),
      matchEvidence: async () => ({
        matches: [{
          requirementId: 'r1',
          factIds: ['f1'],
          gapType: 'expression',
          priority: 1,
        }],
      }),
    },
  });
  const created = await app.createSession({
    userId: 'u1',
    jdText: 'JD',
    resumeText: '简历',
  });
  const result = await app.startAnalysis(created.id, 'u1');
  assert.equal(result.state, 'evidence_ready');
  assert.deepEqual(
    result.transitions.map(({ from, to }) => `${from}->${to}`),
    ['draft->parsing', 'parsing->matching', 'matching->evidence_ready'],
  );
});
```

- [ ] **Step 2：运行测试确认 RED**

Run: `cd server && npm.cmd test -- test/agentPersistence.test.js`

Expected: `return_control` 枚举校验失败、`pendingFactId` 序列化后缺失或最终会话仍为 `draft`。

- [ ] **Step 3：补齐 Schema 和状态枚举**

在 `TASK_STATES` 中加入 `return_control`；在任务 Schema 中加入：

```js
pendingFactId: String,
pendingBaseFactId: String,
currentQuestion: String,
questionTarget: String,
lastAnswerAssessment: mongoose.Schema.Types.Mixed,
initialText: String,
riskAcknowledged: { type: Boolean, default: false },
```

会话状态增加 `parsing_failed` 和 `matching_failed`，用于恢复输入工具失败。

- [ ] **Step 4：让 `_transition` 成为唯一状态写入口**

```js
_transition(session, task, to, event, toolName = '') {
  const target = task || session;
  const from = target.state;
  target.state = to;
  session.transitions.push({
    from, to, event, toolName, at: new Date().toISOString(),
  });
}
```

删除每个调用点在 `_transition` 前对同一 state 的提前赋值。`startAnalysis` 捕获解析和匹配异常，分别迁移至 `parsing_failed`、`matching_failed`，保存后重新抛出可重试错误。若状态已经是 `evidence_ready` 或之后的业务状态，重复 start 直接返回原会话。

- [ ] **Step 5：验证 GREEN**

Run: `cd server && npm.cmd test -- test/agentPersistence.test.js test/agentOrchestrator.test.js`

Expected: 两个测试文件全部通过。

- [ ] **Step 6：提交**

```bash
git add server/domain/agent/contracts.js server/models/AgentSession.js server/services/agent/agentOrchestrator.js server/test/agentPersistence.test.js server/test/agentOrchestrator.test.js
git commit -m "fix: persist agent state transitions"
```

## Task 2：建立数据归属和兼容迁移

**Files:**

- Create: `server/services/ownershipMigration.js`
- Create: `server/scripts/migrate-ownership.js`
- Create: `server/test/ownershipMigration.test.js`
- Create: `server/test/ownershipControllers.test.js`
- Modify: `server/models/JD.js`
- Modify: `server/models/Resume.js`
- Modify: `server/models/Supplement.js`
- Modify: `server/controllers/jdController.js`
- Modify: `server/controllers/resumeController.js`
- Modify: `server/controllers/supplementController.js`
- Modify: `server/controllers/analysisController.js`
- Modify: `server/controllers/agentSessionController.js`
- Modify: `server/app.js`
- Modify: `server/package.json`

- [ ] **Step 1：写归属失败测试**

`ownershipControllers.test.js` 必须验证：

```js
test('agent session input loader requires both inputs to belong to the caller', async () => {
  const loadInputs = createOwnedInputLoader({
    JD: { findOne: async (query) => query.userId === 'u1' ? { rawText: 'JD' } : null },
    Resume: { findOne: async () => ({ rawText: 'R', userId: 'u2' }) },
  });
  await assert.rejects(
    () => loadInputs('jd1', 'resume1', 'u1'),
    /INPUT_NOT_FOUND/,
  );
});
```

并通过注入模型验证 JD、Resume、Supplement 与 Analysis 的 get/update 查询都包含 `userId`。

`ownershipMigration.test.js` 使用内存 repositories 验证：

```js
assert.deepEqual(report, {
  dryRun: true,
  jd: { updated: 1, conflicts: 1, orphaned: 1 },
  resume: { updated: 1, conflicts: 0, orphaned: 1 },
  supplement: { updated: 1, conflicts: 0, orphaned: 0 },
});
```

第二次非 dry-run 执行不得产生额外更新。

- [ ] **Step 2：运行测试确认 RED**

Run: `cd server && npm.cmd test -- test/ownershipControllers.test.js test/ownershipMigration.test.js`

Expected: 模型没有 `userId`，控制器查询未带归属，迁移服务不存在。

- [ ] **Step 3：扩展归属 Schema 和路由边界**

在 JD、Resume、Supplement 增加：

```js
userId: { type: String, index: true, default: null },
```

所有新建记录写入 `req.userId`。在 `app.js` 将 `userIdMiddleware` 应用于 `/api/jd`、`/api/resume`、`/api/supplement`。所有 get/update/create-analysis 查询使用：

```js
Model.findOne({ _id: id, userId: req.userId })
```

无权或不存在统一返回 404。Agent 输入加载器签名为：

```js
async function loadOwnedInputs(jdId, resumeId, userId) {
  const [jd, resume] = await Promise.all([
    JD.findOne({ _id: jdId, userId }),
    Resume.findOne({ _id: resumeId, userId }),
  ]);
  if (!jd || !resume) {
    const error = new Error('INPUT_NOT_FOUND');
    error.status = 404;
    error.retryable = false;
    throw error;
  }
  return { jdText: jd.rawText, resumeText: resume.rawText };
}
```

Controller 调用 `loadInputs(jdId, resumeId, req.userId)`；每个 orchestrator 命令也把 `req.userId` 传给底层 `_get(id, userId)`。

- [ ] **Step 4：实现可注入、幂等迁移**

`runOwnershipMigration({ Analysis, AgentSession, JD, Resume, Supplement }, { dryRun })`：

1. 读取 Analysis 和 AgentSession 的 `userId/jdId/resumeId/supplementId`。
2. 按资源 ID 建立用户集合。
3. 单一用户且资源 `userId` 为空时回填。
4. 多用户计入 conflicts。
5. 无关联且 `userId` 为空计入 orphaned。
6. 已有相同 userId 跳过，已有不同 userId 计入 conflicts。

脚本仅输出计数和资源 ID，不输出 rawText。`server/package.json` 增加：

```json
"migrate:ownership": "node scripts/migrate-ownership.js",
"migrate:ownership:dry": "node scripts/migrate-ownership.js --dry-run"
```

- [ ] **Step 5：验证 GREEN**

Run: `cd server && npm.cmd test -- test/ownershipControllers.test.js test/ownershipMigration.test.js test/agentSessionController.test.js`

Expected: 全部通过，dry-run 不调用 update。

- [ ] **Step 6：提交**

```bash
git add server/models server/controllers server/services/ownershipMigration.js server/scripts/migrate-ownership.js server/test/ownershipControllers.test.js server/test/ownershipMigration.test.js server/app.js server/package.json
git commit -m "fix: enforce ownership with legacy migration"
```

## Task 3：修复中文证据匹配和 PF-001 多轮追问

**Files:**

- Create: `server/domain/agent/textEvidence.js`
- Create: `server/test/textEvidence.test.js`
- Modify: `server/domain/agent/contracts.js`
- Modify: `server/domain/agent/policy.js`
- Modify: `server/services/agent/agentToolService.js`
- Modify: `server/services/agent/agentOrchestrator.js`
- Modify: `server/utils/promptTemplates.js`
- Modify: `server/test/agentPolicy.test.js`
- Modify: `server/test/agentOrchestrator.test.js`
- Modify: `web/src/views/AgentWorkbench.vue`

- [ ] **Step 1：写中文匹配和追问失败测试**

```js
test('matches overlapping Chinese requirement and evidence', () => {
  const score = evidenceOverlap(
    '具备用户研究与需求分析能力',
    '参与校园产品用户研究，完成访谈和需求分析',
  );
  assert.ok(score >= 0.25);
});

test('confirmed structured answer becomes sufficient', async () => {
  const h = makeQuestioningHarness([{
    quality: 'relevant',
    factPatch: {
      action: '设计访谈提纲',
      context: '校园产品',
      contribution: '本人负责提纲设计',
      method: '半结构化访谈',
      result: '整理用户反馈',
      quantity: '',
      quantityType: 'exact',
    },
    missingFields: [],
    questionHint: '',
  }]);
  const answer = await h.app.submitAnswer(
    h.sessionId,
    'task-1',
    '我为校园产品设计访谈提纲并整理反馈',
    'u1',
  );
  assert.equal(answer.tasks[0].state, 'awaiting_fact_confirmation');
  const reviewed = await h.app.reviewFact(
    h.sessionId,
    'task-1',
    answer.tasks[0].pendingFactId,
    'confirm',
    {},
    'u1',
  );
  assert.equal(reviewed.tasks[0].state, 'generating');
  const generated = await h.app.generateCandidate(h.sessionId, 'task-1', 'u1');
  assert.equal(generated.tasks[0].state, 'awaiting_user_decision');
});

test('off topic answer clarifies once without creating a fact', async () => {
  const assessment = {
    quality: 'off_topic',
    factPatch: {},
    missingFields: ['contribution'],
    questionHint: '请说明你本人负责的部分',
  };
  const h = makeQuestioningHarness([assessment, assessment]);
  const first = await h.app.submitAnswer(h.sessionId, 'task-1', '公司规模很大', 'u1');
  assert.equal(first.tasks[0].effectiveRounds, 0);
  assert.equal(first.tasks[0].clarificationUsed, true);
  assert.equal(first.tasks[0].state, 'questioning');
  const second = await h.app.submitAnswer(h.sessionId, 'task-1', '福利也很好', 'u1');
  assert.equal(second.tasks[0].state, 'return_control');
  assert.equal(second.resumeFacts.length, 0);
});

test('a later answer merges missing fields instead of being ignored', async () => {
  const h = makeQuestioningHarness([
    {
      quality: 'partial',
      factPatch: { action: '设计访谈提纲' },
      missingFields: ['context', 'contribution'],
      questionHint: '服务什么场景，你负责什么？',
    },
    {
      quality: 'relevant',
      factPatch: { context: '校园产品', contribution: '本人负责提纲设计' },
      missingFields: [],
      questionHint: '',
    },
  ]);
  const first = await h.app.submitAnswer(h.sessionId, 'task-1', '设计访谈提纲', 'u1');
  await h.app.reviewFact(
    h.sessionId, 'task-1', first.tasks[0].pendingFactId, 'confirm', {}, 'u1',
  );
  const second = await h.app.submitAnswer(
    h.sessionId, 'task-1', '校园产品，由我负责提纲设计', 'u1',
  );
  const reviewed = await h.app.reviewFact(
    h.sessionId, 'task-1', second.tasks[0].pendingFactId, 'confirm', {}, 'u1',
  );
  assert.equal(reviewed.tasks[0].sufficiency, 'basic');
  assert.equal(reviewed.tasks[0].state, 'generating');
});
```

在同一测试文件定义完整 `makeQuestioningHarness`：

```js
function makeQuestioningHarness(assessments) {
  const store = new Map();
  let assessmentIndex = 0;
  const repository = {
    async create(value) {
      store.set(value.id, structuredClone(value));
      return store.get(value.id);
    },
    async get(id) { return store.get(id); },
    async save(value) {
      store.set(value.id, structuredClone(value));
      return store.get(value.id);
    },
  };
  const tools = {
    assessAnswer: async () => assessments[assessmentIndex++],
    draftRevision: async ({ facts }) => ({
      text: facts[0].sourceText,
      factRefs: facts.map((fact) => fact.id),
      requirementRefs: ['r1'],
    }),
    verifyRevision: async ({ candidate }) => ({
      status: 'passed',
      findings: [],
      factRefs: candidate.factRefs,
    }),
  };
  const app = new AgentOrchestrator({ repository, tools });
  const session = {
    id: 'session-1',
    userId: 'u1',
    state: 'task_in_progress',
    requirements: [{ id: 'r1', sourceText: '用户研究' }],
    resumeFacts: [],
    transitions: [],
    tasks: [{
      id: 'task-1',
      requirementId: 'r1',
      factIds: [],
      state: 'questioning',
      effectiveRounds: 0,
      clarificationUsed: false,
    }],
  };
  store.set(session.id, structuredClone(session));
  return { app, sessionId: session.id };
}
```

- [ ] **Step 2：运行测试确认 RED**

Run: `cd server && npm.cmd test -- test/textEvidence.test.js test/agentPolicy.test.js test/agentOrchestrator.test.js`

Expected: 中文重叠为 0，普通回答未调用评估，确认后仍 insufficient。

- [ ] **Step 3：实现文本证据工具**

`textEvidence.js` 导出：

```js
function normalizeText(value) {
  return String(value || '')
    .toLowerCase()
    .normalize('NFKC')
    .replace(/[，。；：、！？,.!?;:()[\]{}"'“”‘’]/g, ' ')
    .replace(/\s+/g, ' ')
    .trim();
}

function chineseNgrams(value, sizes = [2, 3]) {
  const runs = normalizeText(value).match(/[\u4e00-\u9fff]+/g) || [];
  const result = new Set();
  for (const run of runs) {
    for (const size of sizes) {
      for (let index = 0; index <= run.length - size; index += 1) {
        result.add(run.slice(index, index + size));
      }
    }
  }
  return result;
}

function meaningfulTokens(value) {
  const normalized = normalizeText(value);
  const english = normalized.match(/[a-z][a-z0-9+#.-]{1,}/g) || [];
  return new Set([...english, ...chineseNgrams(normalized)]);
}

function evidenceOverlap(left, right) {
  const leftTokens = meaningfulTokens(left);
  const rightTokens = meaningfulTokens(right);
  const denominator = Math.min(leftTokens.size, rightTokens.size);
  if (!denominator) return 0;
  const common = [...leftTokens].filter((token) => rightTokens.has(token)).length;
  return common / denominator;
}

function extractNumberClaims(value) {
  const text = normalizeText(value);
  const expression = /(\d+(?:\.\d+)?)\s*(%|％|位用户|人|份|元|万元|天|个月|年|次)?/g;
  return [...text.matchAll(expression)].map((match) => {
    const start = Math.max(0, match.index - 8);
    const end = Math.min(text.length, match.index + match[0].length + 8);
    return {
      value: match[1],
      unit: match[2] || '',
      context: text.slice(start, end),
    };
  });
}
```

`matchEvidence` 使用 `evidenceOverlap >= 0.25`，同时保留技能同义词直接命中。

- [ ] **Step 4：实现回答评估契约和 AI 工具**

`validateToolResult('assessAnswer', result)` 校验 quality、factPatch、missingFields 和 questionHint。新增 `ASSESS_ANSWER_PROMPT`，要求只返回：

```json
{
  "quality": "relevant",
  "factPatch": {
    "action": "",
    "context": "",
    "contribution": "",
    "method": "",
    "result": "",
    "quantity": "",
    "quantityType": "exact"
  },
  "missingFields": [],
  "questionHint": ""
}
```

`agentToolService.assessAnswer` 调用 `deepseekService.chatJSON` 后做契约校验。

- [ ] **Step 5：实现安全的事实合并**

Orchestrator 处理顺序：

1. 特殊回答走确定性分支。
2. 普通回答调用 `assessAnswer`。
3. `off_topic` 使用 `applyAnswerQuality`，不创建事实。
4. relevant/partial 创建一个 pending 事实，其字段为当前任务已确认事实合并值加 `factPatch`。
5. 记录 `pendingBaseFactId`；用户确认新事实时，用新事实替换 task.factIds 中的旧基础事实，旧事实保留在 session 中但标记 rejected。
6. 充分度对任务已确认事实执行 `mergeFacts` 后计算，不再只看第一条。
7. 根据 `missingFields` 设置一个 `currentQuestion` 和 `questionTarget`。

UI 展示 `task.currentQuestion`，没有时才使用保底问题。

- [ ] **Step 6：验证 GREEN**

Run: `cd server && npm.cmd test -- test/textEvidence.test.js test/agentPolicy.test.js test/agentOrchestrator.test.js test/pf002E2E.test.js`

Expected: 新旧 PF-001 流程测试全部通过。

- [ ] **Step 7：提交**

```bash
git add server/domain/agent server/services/agent/agentToolService.js server/services/agent/agentOrchestrator.js server/utils/promptTemplates.js server/test web/src/views/AgentWorkbench.vue
git commit -m "fix: make PF001 evidence questioning effective"
```

## Task 4：强化 PF-002 确定性审核

**Files:**

- Modify: `server/domain/agent/guardrails.js`
- Modify: `server/domain/agent/textEvidence.js`
- Modify: `server/services/agent/pf002Evaluator.js`
- Modify: `server/evaluations/pf002Cases.js`
- Modify: `server/test/agentGuardrails.test.js`
- Modify: `server/test/pf002Evaluator.test.js`
- Modify: `server/test/pf002Regression.test.js`

- [ ] **Step 1：写已复现误放行的失败测试**

```js
test('blocks unrelated claims and responsibility synonyms', () => {
  const facts = [{
    id: 'f1',
    sourceText: '参与用户访谈并整理反馈',
    contribution: '团队共同完成',
    confirmation: 'confirmed',
  }];
  assert.equal(evaluateCandidate({
    text: '牵头制定公司战略并推动营收增长',
    factRefs: ['f1'],
  }, facts).status, 'blocked');
});

test('does not reuse a people count as a revenue percentage', () => {
  const facts = [{
    id: 'f1',
    sourceText: '访谈20位用户',
    quantity: '20位用户',
    quantityType: 'exact',
    confirmation: 'confirmed',
  }];
  assert.equal(evaluateCandidate({
    text: '实现营收增长20%',
    factRefs: ['f1'],
  }, facts).status, 'blocked');
});
```

- [ ] **Step 2：运行测试确认 RED**

Run: `cd server && npm.cmd test -- test/agentGuardrails.test.js test/pf002Evaluator.test.js`

Expected: 两个候选都错误返回 passed。

- [ ] **Step 3：实现最小确定性修复**

- 职责扩大词覆盖 `主导|牵头|带领|统筹|独立|个人负责|决策|全权负责`。
- 从事实 sourceText、quantity 和候选文本提取 `{value, unit, context}`。
- 相同数字但单位类别不同直接 `number_context_expansion`。
- 候选与全部引用事实的 meaningful token 重叠低于阈值时添加 `unsupported_claim_semantics`。
- 保留估算数字 warning 语义。

- [ ] **Step 4：扩展固定评测**

保持 12 个 E2E 和 30 个原子案例的对外数量不变，用重复或低价值案例替换为：

- “牵头制定公司战略并推动营收增长”。
- “20 位用户”改为“营收提升 20%”。
- “参与调研”改为“建立商业化增长体系”。

每个替换案例 expected 为 blocked。

- [ ] **Step 5：验证 GREEN**

Run: `cd server && npm.cmd test -- test/agentGuardrails.test.js test/pf002Evaluator.test.js test/pf002Regression.test.js`

Expected: 全部通过且固定评测 failed 为 0。

- [ ] **Step 6：提交**

```bash
git add server/domain/agent/guardrails.js server/domain/agent/textEvidence.js server/services/agent/pf002Evaluator.js server/evaluations/pf002Cases.js server/test
git commit -m "fix: block unsupported PF002 claims"
```

## Task 5：接入独立 PF-002 语义审核

**Files:**

- Modify: `server/services/agent/agentAuditService.js`
- Modify: `server/services/agent/agentToolService.js`
- Modify: `server/services/agent/agentOrchestrator.js`
- Modify: `server/utils/promptTemplates.js`
- Modify: `server/domain/agent/contracts.js`
- Create: `server/test/agentAuditService.test.js`
- Modify: `server/test/agentOrchestrator.test.js`

- [ ] **Step 1：写独立审核失败测试**

```js
test('semantic audit blocks a deterministically plausible unsupported claim', async () => {
  const service = new AgentAuditService({
    judge: async () => ({
      status: 'blocked',
      findings: [{ type: 'unsupported_claim', claim: '推动营收增长' }],
      supportedClaims: [],
      unsupportedClaims: ['推动营收增长'],
      factRefs: ['f1'],
    }),
  });
  const result = await service.verifyRevision({
    candidate: { text: '推动营收增长', factRefs: ['f1'] },
    facts: [{ id: 'f1', sourceText: '参与访谈', confirmation: 'confirmed' }],
  });
  assert.equal(result.status, 'blocked');
});

test('judge failure returns unavailable rather than passed', async () => {
  const service = new AgentAuditService({
    judge: async () => { throw new Error('timeout'); },
  });
  const result = await service.verifyRevision({
    candidate: { text: '参与访谈', factRefs: ['f1'] },
    facts: [{ id: 'f1', sourceText: '参与访谈', confirmation: 'confirmed' }],
  });
  assert.equal(result.status, 'unavailable');
});
```

- [ ] **Step 2：运行测试确认 RED**

Run: `cd server && npm.cmd test -- test/agentAuditService.test.js`

Expected: `AgentAuditService` 不可注入 judge，且当前实现不会调用独立语义审核。

- [ ] **Step 3：实现两层审核**

`AgentAuditService` 导出 class 和默认实例。流程：

1. 调用 `evaluateCandidate`。
2. deterministic 为 blocked/unavailable 时直接返回。
3. 调用注入 judge；默认 judge 使用 `AUDIT_REVISION_PROMPT` 和 `chatJSON`。
4. 使用 `validateToolResult('verifyRevision', value)` 校验。
5. 合并 deterministic warning 与 judge 结果；任一 blocked 即 blocked，异常即 unavailable。
6. 附加 `evaluationVersion`。

提示词把规则与 JSON 数据分开，并明确数据中的指令不得执行。

- [ ] **Step 4：确保 orchestrator 安全降级**

AI 候选只有 `passed` 或 `warning` 才进入 `awaiting_user_decision`。语义审核 unavailable 时保留候选、事实和任务，进入 `verification_failed`；重试只重新执行当前生成/审核步骤，不丢失确认事实。

- [ ] **Step 5：验证 GREEN**

Run: `cd server && npm.cmd test -- test/agentAuditService.test.js test/agentOrchestrator.test.js test/pf002E2E.test.js`

Expected: 全部通过。

- [ ] **Step 6：提交**

```bash
git add server/services/agent server/utils/promptTemplates.js server/domain/agent/contracts.js server/test/agentAuditService.test.js server/test/agentOrchestrator.test.js
git commit -m "fix: add independent PF002 semantic audit"
```

## Task 6：重做 PF-003 异步验证和 handoff

**Files:**

- Modify: `server/services/agent/modificationValidator.js`
- Modify: `server/services/agent/agentToolService.js`
- Modify: `server/services/agent/agentOrchestrator.js`
- Modify: `server/utils/promptTemplates.js`
- Modify: `server/test/pf003Validator.test.js`
- Modify: `server/test/agentOrchestrator.test.js`
- Modify: `server/test/pf001to004Flow.test.js`
- Modify: `web/src/views/AgentWorkbench.vue`

- [ ] **Step 1：写 PF-003 失败测试**

```js
test('does not call unrelated text improved', async () => {
  const result = await validate({
    baselineText: '参与用户访谈并整理反馈',
    currentText: '完全无关的自我介绍',
    facts: [{ id: 'f1', sourceText: '参与用户访谈并整理反馈', confirmation: 'confirmed' }],
    factRefs: ['f1'],
    semanticJudge: async () => ({
      relevance: 'regressed',
      quality: 'regressed',
      beforeFactRefs: ['f1'],
      afterFactRefs: [],
      improvements: [],
      remainingIssues: [{ type: 'irrelevant_content' }],
      nextActions: ['恢复与岗位相关的事实'],
      safetyStatus: 'passed',
    }),
  });
  assert.equal(result.changeOutcome, 'regressed');
  assert.deepEqual(result.evidenceCoverage, { before: 1, after: 0 });
});

test('validation promotes current text into handoff', async () => {
  const h = makeValidationHarness({
    safetyStatus: 'passed',
    quality: 'improved',
    relevance: 'improved',
  });
  const text = '参与校园产品用户访谈并整理反馈';
  const result = await h.app.validateModification('s1', 't1', text, 'u1');
  assert.equal(result.tasks[0].candidate.text, text);
  assert.equal(result.tasks[0].currentText, text);
  assert.equal(result.tasks[0].state, 'ready_for_reevaluation');
  assert.equal(result.state, 'ready_for_reevaluation');
  assert.equal(result.handoff.finalText, text);
  assert.equal(result.handoff.verificationStatus, 'passed');
});

test('risk completion updates handoff without claiming verification', async () => {
  const h = makeValidationHarness({
    safetyStatus: 'blocked',
    quality: 'improved',
    relevance: 'improved',
  });
  const text = '独立访谈500位用户';
  await h.app.validateModification('s1', 't1', text, 'u1');
  const result = await h.app.completeWithRisk('s1', 't1', 'u1');
  assert.equal(result.tasks[0].state, 'completed_with_risk');
  assert.equal(result.tasks[0].riskAcknowledged, true);
  assert.equal(result.handoff.finalText, text);
  assert.equal(result.handoff.verificationStatus, 'blocked');
  assert.equal(result.handoff.riskAcknowledged, true);
});
```

在测试文件加入完整 harness：

```js
function makeValidationHarness(judgeResult) {
  const session = {
    id: 's1',
    userId: 'u1',
    state: 'task_in_progress',
    transitions: [],
    resumeFacts: [{
      id: 'f1',
      sourceText: '参与用户访谈并整理反馈',
      confirmation: 'confirmed',
    }],
    tasks: [{
      id: 't1',
      factIds: ['f1'],
      state: 'awaiting_user_decision',
      candidate: {
        text: '参与用户访谈',
        factRefs: ['f1'],
        verification: { status: 'passed' },
      },
      validationRecords: [],
    }],
  };
  const store = new Map([['s1', structuredClone(session)]]);
  const repository = {
    async get(id) { return store.get(id); },
    async save(value) {
      store.set(value.id, structuredClone(value));
      return store.get(value.id);
    },
  };
  const tools = {
    evaluateModification: async () => ({
      beforeFactRefs: ['f1'],
      afterFactRefs: judgeResult.safetyStatus === 'blocked' ? [] : ['f1'],
      improvements: judgeResult.quality === 'improved' ? ['表达更具体'] : [],
      remainingIssues: judgeResult.safetyStatus === 'blocked'
        ? [{ type: 'unsupported_claim' }]
        : [],
      nextActions: ['检查并采用当前文本'],
      ...judgeResult,
    }),
  };
  return { app: new AgentOrchestrator({ repository, tools }) };
}
```

- [ ] **Step 2：运行测试确认 RED**

Run: `cd server && npm.cmd test -- test/pf003Validator.test.js test/agentOrchestrator.test.js test/pf001to004Flow.test.js`

Expected: validate 非异步、无关文本为 improved、handoff 为空或仍指向旧文本。

- [ ] **Step 3：实现一次语义评估**

新增 `MODIFICATION_VALIDATION_PROMPT`，输出：

```json
{
  "relevance": "improved",
  "quality": "improved",
  "beforeFactRefs": ["f1"],
  "afterFactRefs": ["f1"],
  "improvements": ["更明确地说明个人行动"],
  "remainingIssues": [],
  "nextActions": ["可采用当前文本"],
  "safetyStatus": "passed",
  "safetyFindings": []
}
```

`agentToolService.evaluateModification` 每次验证只调用一次 `chatJSON`。`validate` 改为 async，等待 judge，并独立合并 deterministic safety：

```js
const safetyStatus = deterministic.status === 'blocked' || semantic.safetyStatus === 'blocked'
  ? 'blocked'
  : deterministic.status === 'warning' ? 'warning' : semantic.safetyStatus;
```

Judge 异常返回 `safetyStatus: 'unavailable'` 和不宣称 improved 的反馈，保留 baseline/currentText。

- [ ] **Step 4：集中构建 handoff**

在 orchestrator 新增：

```js
_buildHandoff(session, task, {
  finalText,
  verificationStatus,
  riskAcknowledged = false,
}) {
  return {
    taskId: task.id,
    originalText: task.initialText || this._factsForTask(session, task)
      .map((fact) => fact.sourceText).join('\n'),
    finalText,
    factRefs: task.candidate?.factRefs || task.factIds,
    contentSource: 'user_edited',
    verificationStatus,
    riskAcknowledged,
  };
}
```

采用、用户编辑保存、验证通过/警告和风险完成都通过该函数更新 handoff。验证时同步 candidate.text、candidate.verification、currentText、task state 和 session state。用户再次编辑时将 candidate verification 改为 `unverified_user_content`，但不删除 validationRecords。

- [ ] **Step 5：更新 UI**

- `ready_for_reevaluation` 和 `completed_with_risk` 显示完成卡片。
- passed 才显示“已验证”。
- unavailable 显示重试，不显示改善结论。
- 风险完成后显示“已确认保留风险内容”。

- [ ] **Step 6：验证 GREEN**

Run: `cd server && npm.cmd test -- test/pf003Validator.test.js test/agentOrchestrator.test.js test/pf001to004Flow.test.js`

Expected: 全部通过。

- [ ] **Step 7：提交**

```bash
git add server/services/agent server/utils/promptTemplates.js server/test/pf003Validator.test.js server/test/agentOrchestrator.test.js server/test/pf001to004Flow.test.js web/src/views/AgentWorkbench.vue
git commit -m "fix: complete PF003 validation handoff"
```

## Task 7：使 PF-004 使用真实契约并隔离指标

**Files:**

- Create: `web/test/demo.test.mjs`
- Modify: `web/src/demo/fixture.js`
- Modify: `web/src/views/GuidedDemo.vue`
- Modify: `web/src/utils/analytics.js`
- Modify: `web/src/router/index.js`
- Modify: `web/package.json`
- Modify: `server/test/pf004Fixture.test.js`

- [ ] **Step 1：写运行时 fixture 和埋点失败测试**

```js
import test from 'node:test';
import assert from 'node:assert/strict';
import { demoFixture } from '../src/demo/fixture.js';
import { shouldTrackPage } from '../src/utils/analytics.js';

test('demo fixture has a complete real validation record', () => {
  const task = demoFixture.session.tasks[0];
  const record = task.validationRecords.at(-1);
  assert.ok(record.id);
  assert.equal(record.diff.before, record.baselineText);
  assert.equal(record.diff.after, record.currentText);
  assert.deepEqual(Object.keys(record.evidenceCoverage).sort(), ['after', 'before']);
  assert.ok(record.evaluationVersion.ruleVersion);
});

test('demo page is excluded from product page views', () => {
  assert.equal(shouldTrackPage('GuidedDemo'), false);
  assert.equal(shouldTrackPage('Home'), true);
});
```

- [ ] **Step 2：运行测试确认 RED**

Run: `cd web && npm.cmd test`

Expected: test script 或 `shouldTrackPage` 不存在，fixture 缺少完整验证字段。

- [ ] **Step 3：重建 fixture 和页面消费**

fixture 只导出：

```js
function deepFreeze(value) {
  if (!value || typeof value !== 'object' || Object.isFrozen(value)) return value;
  Object.values(value).forEach(deepFreeze);
  return Object.freeze(value);
}

export const demoFixture = deepFreeze({
  version: 'pf004-2',
  isDemo: true,
  evaluationVersion: {
    ruleVersion: 'pf002-rules-2',
    schemaVersion: 'pf002-schema-2',
    promptVersion: 'pf003-validation-prompt-1',
    codeVersion: 'fixture-pf004-2',
  },
  session: {
    state: 'ready_for_reevaluation',
    requirements: [{
      id: 'demo-req-1',
      sourceText: '具备用户研究与需求分析能力',
      priority: 100,
    }],
    resumeFacts: [{
      id: 'demo-fact-1',
      sourceText: '参与校园产品用户访谈并整理反馈',
      action: '设计访谈提纲并整理反馈',
      context: '校园产品',
      contribution: '本人负责访谈提纲设计',
      method: '半结构化访谈',
      result: '整理用户反馈',
      quantity: '',
      quantityType: 'exact',
      confirmation: 'confirmed',
    }],
    tasks: [{
      id: 'demo-task-1',
      requirementId: 'demo-req-1',
      factIds: ['demo-fact-1'],
      gapType: 'expression',
      state: 'ready_for_reevaluation',
      candidate: {
        text: '参与校园产品用户访谈，设计访谈提纲并整理反馈',
        factRefs: ['demo-fact-1'],
        contentSource: 'ai_generated',
        verification: { status: 'passed', findings: [] },
      },
      validationRecords: [{
        id: 'demo-validation-1',
        baselineText: '参与用户访谈',
        currentText: '参与校园产品用户访谈，设计访谈提纲并整理反馈',
        diff: {
          before: '参与用户访谈',
          after: '参与校园产品用户访谈，设计访谈提纲并整理反馈',
          changed: true,
        },
        changeOutcome: 'improved',
        safetyStatus: 'passed',
        evidenceCoverage: { before: 1, after: 1 },
        improvements: ['补充场景和个人行动'],
        remainingIssues: [],
        nextActions: ['可采用当前文本'],
        evaluationVersion: {
          ruleVersion: 'pf002-rules-2',
          schemaVersion: 'pf002-schema-2',
          promptVersion: 'pf003-validation-prompt-1',
          codeVersion: 'fixture-pf004-2',
        },
        createdAt: '2026-07-26T00:00:00.000Z',
      }],
    }],
  },
});
```

GuidedDemo 从 `session` 派生 jd、fact、gap、candidate 和 validation，不再读取扁平重复字段；`current` 初始为 0。

`analytics.js` 导出：

```js
export function shouldTrackPage(pageName) {
  return pageName !== 'GuidedDemo';
}
```

router 的 afterEach 仅在 true 时调用 `events.pageView`。`web/package.json` 增加 `"test": "node --test test/*.test.mjs"`。

- [ ] **Step 4：替换字符串搜索测试**

服务端 PF-004 测试改为动态 import fixture，校验实际对象状态、枚举、验证记录和 `isDemo`，同时保留源文件不含 Agent/Analysis API 的断言。

- [ ] **Step 5：验证 GREEN**

Run: `cd web && npm.cmd test`

Run: `cd server && npm.cmd test -- test/pf004Fixture.test.js`

Expected: 全部通过。

- [ ] **Step 6：提交**

```bash
git add web/src/demo/fixture.js web/src/views/GuidedDemo.vue web/src/utils/analytics.js web/src/router/index.js web/package.json web/test/demo.test.mjs server/test/pf004Fixture.test.js
git commit -m "fix: align PF004 demo with real contracts"
```

## Task 8：统一错误响应和前端错误展示

**Files:**

- Create: `server/utils/appError.js`
- Create: `server/test/appError.test.js`
- Modify: `server/controllers/agentSessionController.js`
- Modify: `server/controllers/jdController.js`
- Modify: `server/controllers/resumeController.js`
- Modify: `server/controllers/supplementController.js`
- Modify: `server/controllers/analysisController.js`
- Modify: `web/src/api/index.js`
- Create: `web/test/api-error.test.mjs`

- [ ] **Step 1：写错误契约失败测试**

```js
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
```

前端导出 `readError(responseBody, status)`，测试：

```js
assert.equal(
  readError({ error: { code: 'X', message: '可读提示' } }, 400).message,
  '可读提示',
);
```

- [ ] **Step 2：运行测试确认 RED**

Run: `cd server && npm.cmd test -- test/appError.test.js`

Run: `cd web && npm.cmd test`

Expected: AppError、toErrorResponse 或 readError 不存在。

- [ ] **Step 3：实现统一错误**

`AppError` 保存 code/status/retryable/expose。`toErrorResponse` 对未知异常返回 500 和通用消息，不暴露堆栈。控制器使用统一 helper；不存在和无权访问返回相同 404。

前端：

```js
export function readError(payload, status) {
  const value = payload?.error;
  if (value && typeof value === 'object') {
    const error = new Error(value.message || `HTTP ${status}`);
    error.code = value.code;
    error.retryable = Boolean(value.retryable);
    return error;
  }
  return new Error(typeof value === 'string' ? value : `HTTP ${status}`);
}
```

request 和 upload 都使用该函数。

- [ ] **Step 4：验证 GREEN**

Run: `cd server && npm.cmd test -- test/appError.test.js test/agentSessionController.test.js test/ownershipControllers.test.js`

Run: `cd web && npm.cmd test`

Expected: 全部通过且错误 message 不为 `[object Object]`。

- [ ] **Step 5：提交**

```bash
git add server/utils/appError.js server/test/appError.test.js server/controllers web/src/api/index.js web/test/api-error.test.mjs
git commit -m "fix: return readable structured errors"
```

## Task 9：真实端到端回归和最终验证

**Files:**

- Modify: `server/test/pf001to004Flow.test.js`
- Modify: `server/test/pf002E2E.test.js`
- Modify: `server/evaluations/reports/pf002-report.json`
- Modify: `server/evaluations/reports/pf002-report.md`
- Modify: `README.md`

- [ ] **Step 1：扩展完整闭环测试**

完整测试必须经过：

1. createSession。
2. startAnalysis。
3. information gap。
4. assessAnswer。
5. reviewFact。
6. generateCandidate。
7. 独立 verifyRevision。
8. user edit。
9. evaluateModification。
10. validateModification。
11. handoff。

最终断言：

```js
assert.equal(result.sessionState, 'ready_for_reevaluation');
assert.equal(result.taskState, 'ready_for_reevaluation');
assert.equal(result.handoff.finalText, result.validatedText);
assert.equal(result.handoff.verificationStatus, 'passed');
assert.equal(result.handoff.riskAcknowledged, false);
```

另加 blocked → completed_with_risk 的完整流程。

- [ ] **Step 2：运行完整测试确认任何剩余失败**

Run: `cd server && npm.cmd test`

Run: `cd web && npm.cmd test`

Expected: 若有失败，只修复与本规格相关的回归，不修改测试要求来迁就错误实现。

- [ ] **Step 3：刷新固定评测报告**

Run: `cd server && npm.cmd run evaluate:pf002`

Expected: 42/42 通过，报告包含新的 rule/schema 版本且 `failed: 0`。

- [ ] **Step 4：更新运行与迁移说明**

README 增加：

```text
npm run migrate:ownership:dry  # 仅报告
npm run migrate:ownership      # 回填可证明归属的旧数据
```

说明冲突和孤立数据不会删除、不会自动分配给任意用户。

- [ ] **Step 5：执行最终验证**

Run: `cd server && npm.cmd test`

Expected: 0 failed。

Run: `cd server && npm.cmd run evaluate:pf002`

Expected: 42 passed，0 failed。

Run: `cd web && npm.cmd test`

Expected: 0 failed。

Run: `cd web && npm.cmd run build`

Expected: Vite production build exit 0。

Run: `git diff --check`

Expected: 无输出，exit 0。

Run: `git status --short`

Expected: 仅包含本计划产生的已知改动；不得提交任务开始前已经存在的 `web/package-lock.json` 修改或根目录未跟踪 `package-lock.json`，除非确认它们确实由本计划的依赖/脚本变化所需。

- [ ] **Step 6：提交最终回归和文档**

```bash
git add server/test/pf001to004Flow.test.js server/test/pf002E2E.test.js server/evaluations/reports README.md
git commit -m "test: verify PF001 through PF004 hardening"
```
