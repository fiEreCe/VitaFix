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
updated_at: 2026-07-27
related_docs:
  - ./00-version-specification-and-roadmap.md
  - ./10-v0.1-development-readiness-and-execution-plan.md
  - ../superpowers/specs/2026-07-26-pf001-pf004-logic-hardening-design.md
  - ../superpowers/plans/2026-07-26-pf001-pf004-logic-hardening.md
---

# PF-001 至 PF-004 逻辑加固开发交接

## 1. 交接摘要

本轮开发从 PF-001 至 PF-004 代码审查开始。审查发现状态持久化、并发启动、数据归属、中文证据匹配、安全审核、修改效果验证、最终交接和演示契约等问题。

截至 2026-07-27：

- 已完成状态持久化、状态迁移、并发启动保护、崩溃恢复租约和用户数据归属加固。
- 已完成旧 JD、Resume、Supplement 所有权迁移工具及维护路径加固。
- PF-001 的中文证据匹配和多轮追问修复尚未开始落地；此前执行代理被中断，未留下对应代码差异。
- PF-002、PF-003、PF-004 和前端错误展示的审查缺陷仍待修复。
- 当前不能把 PF-001 至 PF-004 标记为 `verified`，也不建议用于公开处理真实简历。

## 2. 工作位置与分支

| 项目 | 当前值 |
|---|---|
| 工作树 | `.worktrees/pf001-agent` |
| 分支 | `feature/pf001-agent` |
| 当前 HEAD | `c928d7454df8284cf9d4b57734248ca763300ea7` |
| 设计文档 | `docs/superpowers/specs/2026-07-26-pf001-pf004-logic-hardening-design.md` |
| 原详细计划 | `docs/superpowers/plans/2026-07-26-pf001-pf004-logic-hardening.md` |
| 最近全量后端验证 | 84 个测试通过，0 个失败 |

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

## 4. 仍未完成的开发

### 4.1 批次 A：PF-001 中文匹配和动态追问

状态：`not_started`

需要完成：

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

状态：`not_started`

PF-002 需要完成：

- 数字审核同时比较数值、单位和语义用途，禁止把“20 位用户”复用为“营收增长 20%”。
- 扩大职责同义词覆盖，例如牵头、带领、统筹和全权负责。
- 对候选主张与引用事实执行独立语义审核；不能只依赖关键词黑名单。
- 审核不可用时返回 `unavailable`，不得默认通过。
- 固定评测增加与现有正则不同构的对抗案例，并让端到端案例真正经过 orchestrator。

PF-003 需要完成：

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

状态：`not_started`

需要完成：

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

### 5.4 工作区已有非本轮变更

交接时以下状态已存在，未纳入本轮提交：

- `web/package-lock.json`：modified
- 根目录 `package-lock.json`：untracked

接手者不得直接执行会覆盖用户改动的 reset/checkout，也不要把这两个文件混入功能提交，除非先确认来源和必要性。

## 6. 建议接手顺序

后续无需继续按九个细任务展开，建议按三个批次执行：

1. PF-001 中文匹配、回答评估、事实合并和动态追问。
2. PF-002 独立审核与 PF-003 修改验证、handoff。
3. PF-004 契约、前端错误显示和全链路回归。

每个批次仍应遵循：

1. 先写最小失败测试，确认能够复现交接中列出的缺陷。
2. 只修改对应根因，不顺带扩展无关功能。
3. 跑对应聚焦测试。
4. 跑完整后端测试；涉及前端时再跑前端测试和生产构建。
5. 检查未误提交两个既有 lockfile 状态。

## 7. 接手验证命令

```powershell
cd C:\Users\1\Desktop\精投助手demo\.worktrees\pf001-agent
git status --short
git log --oneline -15

cd server
npm.cmd test

cd ..\web
npm.cmd run build
```

预期基线：

- HEAD 为 `c928d74` 或其后续交接文档提交。
- 后端最近一次已验证为 84/84。
- 前端在 Task 1–2 开发前的基线构建通过；交接文档完成后应重新执行一次构建确认。
- `web/package-lock.json` 和根目录 `package-lock.json` 保持既有状态，不被自动清理。

## 8. 完成定义

只有同时满足以下条件，才能把本轮逻辑加固标记为完成：

- 本文第 4 节三个批次全部完成。
- 原审查中的最小复现全部转为自动回归测试并通过。
- PF-001 至 PF-004 的核心验收项逐条复核。
- PF-002 固定评测无红线失败，并保留版本化报告。
- 后端全量测试、前端测试和生产构建通过。
- 所有权迁移至少完成 dry-run 审核；若准备部署真实数据，则迁移和索引创建已在备份后验证。
