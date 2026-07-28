---
title: PF-001 至 PF-004 逻辑加固开发交接
owner: 开发负责人（待指定）
reviewers:
  - 产品负责人
  - 后端负责人
  - 前端负责人
  - AI 负责人
  - 测试负责人
status: in_progress
version: "1.0"
created_at: 2026-07-27
updated_at: 2026-07-28
related_docs:
  - ./00-version-specification-and-roadmap.md
  - ./10-v0.1-development-readiness-and-execution-plan.md
  - ../superpowers/specs/2026-07-26-pf001-pf004-logic-hardening-design.md
  - ../superpowers/plans/2026-07-26-pf001-pf004-logic-hardening.md
---

# PF-001 至 PF-004 逻辑加固开发交接

## 1. 交接摘要

本轮开发从 PF-001 至 PF-004 代码审查开始。审查发现状态持久化、并发启动、数据归属、中文证据匹配、安全审核、修改效果验证、最终交接和演示契约等问题。

截至 2026-07-28：

- 已完成状态持久化、状态迁移、并发启动保护、崩溃恢复租约和用户数据归属加固。
- 已完成旧 JD、Resume、Supplement 所有权迁移工具及维护路径加固。
- PF-001 的中文证据匹配、结构化回答评估、多轮事实合并、动态追问和失败重试已完成。
- PF-002 的确定性红线、独立语义审核、安全降级和固定评测已完成。
- PF-003 的异步修改验证、不可变记录、状态同步和最终 handoff 已完成。
- PF-004 的真实 fixture 契约、演示漏斗隔离、结构化错误展示和最终全链路回归已完成。
- PF-001 至 PF-004 已完成代码级验收；在真实 MongoDB 迁移 dry-run、索引验证和部署验证完成前，仍不建议用于公开处理真实简历。

当前结论：

| 范围 | 状态 | 说明 |
|---|---|---|
| PF-001 至 PF-004 代码开发 | `completed` | 三个开发批次和自动化回归均已完成 |
| 本地质量门禁 | `passed` | 后端 114/114、PF-002 评测 42/42、前端 4/4、生产构建通过 |
| 功能提交 | `completed` | `308e3e4 feat: complete PF001-PF004 logic hardening` |
| 真实数据迁移 | `pending` | 尚未运行真实 MongoDB dry-run 和正式迁移 |
| 发布就绪 | `blocked` | 等待迁移报告审查、索引验证和部署环境回归 |

文档头部继续保留 `status: in_progress`，表示发布交接尚未结束，不表示 PF-001 至 PF-004 的代码仍未完成。

## 2. 工作位置与分支

| 项目 | 当前值 |
|---|---|
| 工作树 | `D:\Code\VitaFix` |
| 分支 | `main` |
| PF-001 至 PF-004 功能基线 | `308e3e4` |
| 设计文档 | `docs/superpowers/specs/2026-07-26-pf001-pf004-logic-hardening-design.md` |
| 原详细计划 | `docs/superpowers/plans/2026-07-26-pf001-pf004-logic-hardening.md` |
| 最近全量后端验证 | 114 个测试通过，0 个失败 |

原详细计划拆分较细。后续交接执行应聚焦原审查缺陷，可合并为三个开发批次，不必继续扩展周边能力。

## 3. 本次已完成工作

### 3.1 Agent 状态持久化和并发安全

已完成：

- `pendingFactId`、问题上下文、验证基线和风险确认等任务字段可以通过 Mongoose 持久化。
- `return_control`、`parsing_failed` 和 `matching_failed` 等状态进入正式枚举。
- 状态迁移统一记录真实 `from` 和 `to`，会话状态不再停留在 `draft`。
- 重复启动采用原子 claim，避免两个请求重复调用解析和匹配工具。
- claim 使用 token、过期时间和心跳续租；活跃任务不能被抢占。
- 进程崩溃或心跳停止后，过期任务可以恢复。
- 旧 worker 的 token 无法覆盖新 worker 的结果。

相关提交：

| 提交 | 内容 |
|---|---|
| `985885e` | 持久化 Agent 状态迁移 |
| `cb7a3fb` | 串行化并发分析启动 |
| `3ed73dc` | 恢复过期分析 claim |
| `efb2cfb` | 为活跃分析 claim 续租 |

### 3.2 用户数据归属和旧数据迁移

已完成：

- JD、Resume 和 Supplement 增加可为空的 `userId`，兼容旧数据。
- 新建、上传、读取、更新和分析输入均按 `_id + userId` 校验。
- Analysis 的详情、状态、重评和异步完成/失败写回均带用户条件。
- AgentSession 的读取、claim、续租、普通保存和 token 保存均深层携带 `userId`。
- Supplement 先校验父 Resume 归属，再执行原子 upsert。
- cleanup 删除资源时按 `_id + userId` 限定，避免冲突旧引用导致跨用户删除。
- 所有权迁移支持 dry-run、唯一归属回填、冲突保留、孤立数据保留、稳定 ID 报告和重复执行幂等。
- 迁移使用字段投影和有序 cursor，不加载完整简历、JD、Analysis 或 AgentSession 内容。
- unique index 冲突和并发迁移竞态会被稳定分类，不会终止整个迁移或覆盖数据。

相关提交：

| 提交 | 内容 |
|---|---|
| `04b52e7` | 所有权校验和旧数据迁移 |
| `8c162cb` | 补齐异步写回和越权测试 |
| `15c4fe3` | 加固 cleanup、Supplement 和迁移维护路径 |
| `6cdbcbe` | 报告迁移索引冲突 |
| `c928d74` | 统一迁移竞态分类 |

### 3.3 PF-001 中文证据匹配和动态追问

已完成：

- 中文证据匹配使用二元、三元字符片段和技能同义词，不再把整句中文作为单个词。
- 普通回答通过 `assessAnswer` 输出回答质量、结构化事实补丁、缺失字段和下一问。
- 多轮回答会合并 action、context、contribution、method、result 和数量信息。
- 充分度基于任务全部已确认事实计算，达到 basic 或 strong 后进入候选生成。
- 第一次答非所问触发不计轮次的澄清，第二次进入 `return_control`。
- 确认、修正或拒绝 pending fact 后会清理临时状态，并根据充分度继续追问或生成。
- 回答评估失败时进入 `question_failed`，保留原回答和既有事实，可从失败步骤重试。
- 前端展示服务端 `currentQuestion`，并提供回答分析失败的原回答展示和重试入口。

验证结果：

- 后端全量测试：94 个通过，0 个失败。
- 前端 Vite 生产构建：通过。

### 3.4 PF-002 确定性红线和独立语义审核

已完成：

- 数字审核同时比较数值、单位类别和语义用途，阻断“20 位用户”复用为“营收增长 20%”。
- 职责扩大覆盖主导、牵头、带领、统筹、负责、独立、决策和全权负责等表达。
- 候选与引用事实缺少最低语义重叠时，确定性审核返回 `unsupported_claim_semantics`。
- 确定性检查通过后执行独立语义审核，逐项返回支持和不支持的主张。
- 独立审核异常或输出不符合契约时返回 `unavailable`，不再默认通过。
- 语义审核失败会保留候选和确认事实；重试仅重新执行审核，不重新生成候选。
- 固定评测已加入无关商业主张、职责同义扩大和跨用途数字案例。
- 12 个端到端固定案例真实经过 orchestrator，30 个原子案例执行确定性规则。
- 评测版本更新为 `pf002-rules-2`、`pf002-schema-2` 和 `pf002-audit-prompt-1`。

验证结果：

- PF-002 固定评测：42 个通过，0 个失败。
- 后端全量测试：104 个通过，0 个失败。

### 3.5 PF-003 异步修改验证和 handoff

已完成：

- 修改验证改为异步流程，每次主动验证只调用一次语义评估。
- 修改效果不再依据文本长度或“是否发生变化”推断。
- `changeOutcome` 与 `safetyStatus` 独立计算，改善文本仍可因事实风险被阻断。
- `evidenceCoverage.before/after` 使用语义评估返回的有效事实引用计算。
- 语义评估不可用时保留 baseline、当前文本和历史记录，不宣称改善。
- 每次验证追加包含 diff、覆盖率、反馈、版本和时间的不可变记录。
- 验证后同步 `candidate.text`、`currentText`、任务状态、会话状态和 handoff。
- 只有 passed 或 warning 进入 `ready_for_reevaluation`；blocked 和 unavailable 保持可编辑/重试。
- `completed_with_risk` handoff 使用当前最终文本，保持 `verificationStatus=blocked` 和 `riskAcknowledged=true`。
- 验证后再次编辑会使当前验证失效为 `unverified_user_content`，但不删除历史验证记录。
- 前端区分已验证、验证暂不可用和已确认保留风险内容，并提供验证重试入口。

验证结果：

- 后端全量测试：110 个通过，0 个失败。
- 前端 Vite 生产构建：通过。

### 3.6 PF-004 演示契约、错误协议和最终回归

已完成：

- fixture 改为深冻结的真实会话快照，仅保留 `version`、`isDemo`、`evaluationVersion` 和 `session` 顶层字段。
- 验证记录补齐 id、diff、evidenceCoverage、反馈、版本和时间字段；候选审核记录补齐支持/不支持主张。
- GuidedDemo 只从 `fixture.session` 派生展示，从第一步开始，可重复重启，且不调用实时 API。
- GuidedDemo 从真实产品 `page_view` 漏斗中排除。
- JD、Resume、Supplement、Analysis 和 AgentSession 控制器统一返回 `error.code/message/retryable`，未知内部错误不再泄漏。
- 前端 API 客户端兼容结构化、字符串和非 JSON 错误，不再显示 `[object Object]`。
- PF-001 至 PF-004 全链路回归覆盖追问、事实确认、独立候选审核、修改验证、交接和风险确认。

验证结果：

- 后端全量测试：114 个通过，0 个失败。
- PF-002 固定评测：42 个通过，0 个失败。
- 前端契约测试：4 个通过，0 个失败。
- 前端 Vite 生产构建：通过。

## 4. 开发批次状态

### 4.1 批次 A：PF-001 中文匹配和动态追问

状态：`completed`

已完成：

- 修复中文匹配把整句视为一个词导致的明显漏匹配。
- 接入 `assessAnswer`，区分 relevant、partial、off_topic、contradictory、unknown 和 not_done。
- 普通回答提取结构化事实，不再把整段文本只写入 action。
- 多轮回答合并 action、context、contribution、method 和 result。
- 充分度基于任务全部已确认事实，而不是只看第一条事实。
- 答非所问只允许一次不计轮次的澄清，第二次交还控制权。
- 确认、修正和拒绝 pending fact 后正确清理状态并生成下一主要问题。
- UI 展示服务端生成的 `currentQuestion`。
- 工具失败保留原回答和已确认事实，并支持从 `question_failed` 重试。

原始缺陷证据：

- 有效回答确认后仍为 `insufficient/questioning`。
- 中文“用户研究与需求分析”与对应简历事实被错误判为无证据。

### 4.2 批次 B：PF-002 安全审核和 PF-003 修改验证

状态：PF-002 `completed`；PF-003 `completed`

PF-002 已完成：

- 数字审核同时比较数值、单位和语义用途，禁止把“20 位用户”复用为“营收增长 20%”。
- 扩大职责同义词覆盖，例如牵头、带领、统筹和全权负责。
- 对候选主张与引用事实执行独立语义审核；不能只依赖关键词黑名单。
- 审核不可用时返回 `unavailable`，不得默认通过。
- 固定评测增加与现有正则不同构的对抗案例，并让端到端案例真正经过 orchestrator。

PF-003 已完成：

- 修改验证改为一次异步语义评估加确定性规则。
- 禁止根据“文本发生变化”或文本长度默认判断 `improved`。
- 正确计算 `evidenceCoverage.before/after`。
- 语义评估不可用时保留文本和旧记录，不虚构改善结论。
- 验证后同步 `candidate.text`、`currentText`、任务状态、会话状态和 handoff。
- `completed_with_risk` 必须交接当前最终文本，并保持 `verificationStatus=blocked`、`riskAcknowledged=true`。
- 用户再次编辑后使最新验证状态失效，但不覆盖历史验证记录。

原始缺陷证据：

- “牵头制定公司战略并推动营收增长”和“实现营收增长20%”被错误判为 `passed`。
- “完全无关的自我介绍”被错误判为 `improved + passed`。
- PF-003 通过后 handoff 仍为空，candidate 仍是旧文本。

### 4.3 批次 C：PF-004、错误提示和最终回归

状态：`completed`

已完成：

- PF-004 fixture 补齐真实验证记录字段，包括 id、diff、evidenceCoverage、反馈和版本信息。
- GuidedDemo 直接从 `fixture.session` 派生展示，不维护重复扁平业务字段。
- 演示从第一步开始并可重复重启。
- 演示页面不进入真实业务 page_view 漏斗。
- PF-004 测试实际加载并校验对象契约，不再只搜索源文件字符串。
- 前端 API 正确读取结构化错误的 `error.message/code/retryable`，不再显示 `[object Object]`。
- 更新完整 PF-001 至 PF-004 闭环测试和 PF-002 固定评测报告。
- 运行后端全量测试、前端测试、PF-002 评测和生产构建。

## 5. 已知运行和发布事项

### 5.1 旧数据迁移尚未在真实 MongoDB 执行

代码和注入式测试已完成，但尚未对真实数据库执行。部署前按顺序运行：

```powershell
cd server
npm.cmd run migrate:ownership:dry
npm.cmd run migrate:ownership
```

执行前应备份数据库。dry-run 报告中的 conflict 和 orphan ID 需要留存；不得手工把冲突数据批量归给任一用户。

### 5.2 Supplement 唯一索引尚未在真实数据上验证

Schema 使用部分唯一索引保证同一用户和 Resume 只有一个 Supplement。部署时需要观察 MongoDB 索引创建结果；若已有重复 owned 数据，应先根据迁移报告处理，不能直接删除记录。

### 5.3 当前身份仍是设备 ID

本轮修复保证同一设备 ID 下的资源隔离，但没有建设正式账号、登录和跨设备恢复。它满足当前 V0.1 单次会话边界，不等于产品 MVP 的账号体系。

### 5.4 当前工作区状态

PF-001 至 PF-004 已合并为本地提交 `308e3e4`。该提交尚未推送远程；继续开发前应先确认工作区保持干净，并从该提交继续。

本次最终检查未发现 `web/package-lock.json` 修改或根目录 `package-lock.json` 未跟踪状态。

### 5.5 当前契约不能回退

后续开发必须保留以下行为：

- 所有用户资源查询和写入继续使用资源 ID 与 `userId` 的联合条件；“不存在”和“无权访问”对外保持相同的 404。
- Agent 状态只通过 orchestrator 的迁移入口推进；不得在调用 `_transition` 前直接改写同一个 state。
- AI 审核异常、格式错误或超时必须降级为 `unavailable`，不能默认 `passed`。
- `changeOutcome` 和 `safetyStatus` 继续独立计算；文本质量改善不等于事实安全通过。
- 每次修改验证继续追加历史记录；重新编辑只能使当前验证失效，不能覆盖旧记录。
- 风险内容只有在用户显式确认后才能进入 `completed_with_risk`，handoff 必须保留 `verificationStatus=blocked` 和 `riskAcknowledged=true`。
- 新增控制器错误必须通过统一错误 helper 返回 `error.code/message/retryable`；未知内部异常不得把堆栈、数据库信息或原始模型输出返回前端。
- GuidedDemo 只能使用静态 fixture，不得调用实时 Agent/Analysis API、写历史记录或进入真实产品 `page_view` 漏斗。

## 6. 下次开发顺序与注意事项

### 6.1 首要任务：完成发布前验证

PF-001 至 PF-004 的代码开发和本地回归已完成。后续聚焦部署前验证：

1. 备份真实 MongoDB，运行所有权迁移 dry-run 并审查 conflict/orphan。
2. 保存 dry-run 报告和 conflict/orphan ID；无法唯一证明归属的记录继续保留为未归属，不要猜测用户。
3. 只有在迁移报告经人工确认后，才执行正式迁移。
4. 验证 Supplement 部分唯一索引是否创建成功；若存在重复 owned 数据，先分析来源，不要直接删除。
5. 在部署环境执行服务端测试、前端测试、PF-002 固定评测和生产构建。
6. 完成人工烟测：正常闭环、语义审核不可用、修改验证阻断、风险确认、跨用户访问和 GuidedDemo。

### 6.2 修改代码时的边界

继续开发新功能或修复问题时：

1. 先写最小失败测试，确认能够复现交接中列出的缺陷。
2. 只修改对应根因，不顺带扩展无关功能。
3. 涉及 Agent 流程时，同时检查任务状态、会话状态、candidate、validationRecords 和 handoff 是否同步。
4. 涉及 AI 工具时，测试合法输出、非法 schema、超时和未知事实引用四类结果。
5. 涉及数据访问时，必须增加缺失资源和跨用户资源返回相同结果的回归。
6. 涉及前端错误展示时，同时覆盖结构化错误、旧字符串错误和非 JSON 响应。
7. 跑对应聚焦测试后，再跑完整后端测试；涉及前端时同时跑前端测试和生产构建。
8. 提交前检查 `git diff --check` 和 `git status --short`，确认没有意外 lockfile、构建产物、日志、真实简历或密钥文件。

### 6.3 明确不要做的事

- 不要运行 `git reset --hard`、`git checkout --` 等会覆盖当前累计改动的命令。
- 不要在没有数据库备份和 dry-run 审核的情况下执行正式所有权迁移。
- 不要为了让流程继续而把 `blocked` 或 `unavailable` 改写成 `passed`。
- 不要把设备 ID 隔离描述成正式账号体系或跨设备身份能力。
- 不要把演示数据接到实时 AI，也不要把 fixture 的业务字段再次复制为顶层扁平字段。
- 不要在日志、错误响应、评测报告或测试 fixture 中写入真实简历、模型原始敏感输出或凭据。

## 7. 接手验证命令

```powershell
cd D:\Code\VitaFix
git status --short
git log --oneline -15

cd server
npm.cmd test
npm.cmd run evaluate:pf002

cd ..\web
npm.cmd test
npm.cmd run build
```

预期基线：

- HEAD 为 `308e3e4` 或其后续提交。
- 后端最近一次已验证为 114/114。
- PF-002 固定评测最近一次已验证为 42/42。
- 前端最近一次契约测试为 4/4，Vite 生产构建通过。
- PF-001 至 PF-004 已提交为 `308e3e4`，预期工作区干净。

## 8. 完成定义

只有同时满足以下条件，才能把本轮逻辑加固标记为完成：

- 本文第 4 节三个批次全部完成。
- 原审查中的最小复现全部转为自动回归测试并通过。
- PF-001 至 PF-004 的核心验收项逐条复核。
- PF-002 固定评测无红线失败，并保留版本化报告。
- 后端全量测试、前端测试和生产构建通过。
- 所有权迁移至少完成 dry-run 审核；若准备部署真实数据，则迁移和索引创建已在备份后验证。
