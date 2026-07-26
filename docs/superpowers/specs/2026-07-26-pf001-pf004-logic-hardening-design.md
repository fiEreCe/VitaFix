# PF-001 至 PF-004 逻辑加固设计

## 1. 背景与目标

PF-001 至 PF-004 已具备基本代码骨架，但当前实现存在状态无法持久化、追问无法形成充分事实、安全审核误放行、修改验证误判、最终交接缺失、数据归属不完整以及演示结构漂移等问题。

本次工作以现有 `feature/pf001-agent` 实现为基础，采用原地兼容升级：

- 保留现有 JD、简历、分析、Agent 会话和演示数据。
- 不创建平行的 V2 业务模型。
- 修复 PF-001 至 PF-004 的完整闭环，而不扩大到无关产品功能。
- 对能可靠确定归属的旧数据进行回填；无法可靠确定归属的数据保留但隔离。
- 所有缺陷先建立可失败的回归测试，再修改生产代码。

## 2. 总体架构

业务链路保持为：

1. 用户创建或上传 JD 与简历。
2. PF-001 解析材料、匹配证据、动态追问、确认事实并生成候选。
3. PF-002 对 AI 候选执行确定性规则和独立语义审核。
4. 用户采用或编辑文本。
5. PF-003 对本轮修改执行一次语义评估，并与确定性安全规则合并。
6. 系统保存不可变验证记录并生成完整 handoff。
7. PF-004 使用与真实链路兼容的预计算 fixture 回放上述关键状态。

代码责任边界：

- `domain/agent`：枚举、Schema 契约、确定性规则、充分度与轮次政策。
- `services/agent`：流程编排、AI 工具调用、安全审核、修改验证和 handoff 构建。
- `models`：持久化约束与向后兼容字段。
- `controllers`：身份、归属、输入和错误响应边界。
- `evaluations` 与 `test`：固定案例、真实流程回归和 Mongoose 持久化回归。
- `web/src/demo`：版本化、只读、契约兼容的演示数据。

## 3. 数据模型与兼容策略

### 3.1 AgentSession

任务模型补充当前流程已经使用但尚未持久化的字段：

- `pendingFactId`
- `currentQuestion`
- `questionTarget`
- `lastAnswerAssessment`
- `initialText`
- `riskAcknowledged`

任务状态枚举补充 `return_control`。所有状态迁移通过统一函数完成，该函数必须：

1. 先读取真实旧状态作为 `from`。
2. 更新任务或会话的当前状态。
3. 追加包含 `from`、`to`、`event`、`toolName` 和时间的迁移记录。

已有文档缺少新字段时使用安全默认值，不要求离线重写每个 AgentSession。

### 3.2 JD、Resume 与 Supplement 归属

JD、Resume 和 Supplement 增加可索引的 `userId`。新数据创建时必须写入当前 `X-User-Id`，后续读取、修改、分析和 Agent 会话创建均按 `_id + userId` 查询。

提供一次性迁移脚本：

- 从 `Analysis.userId + jdId + resumeId + supplementId` 推断归属。
- 从 `AgentSession.userId + jdId + resumeId` 补充尚未覆盖的关系。
- 同一资源只有一个可证明用户时自动回填。
- 同一资源关联多个用户时标记冲突，不自动选择用户。
- 没有任何归属证据的孤立资源保留但不允许通过用户接口读取。
- 脚本支持 dry-run，输出回填、冲突和孤立记录统计；重复运行结果一致。

这保证现有数据不会被删除，同时不再把 ObjectId 当作访问凭证。

## 4. PF-001：证据、追问与状态机

### 4.1 中文证据匹配

中文匹配不再把整句作为单个词。确定性匹配使用：

- 规范化后的英文单词。
- 中文二元和三元字符片段。
- 已有技能同义词表。
- 最低重叠阈值，避免一个常见字造成误匹配。

匹配输出继续保持 `requirementId`、`factIds`、`gapType` 和 `priority` 契约。

### 4.2 动态回答评估

每次回答先调用 `assessAnswer`，输出：

- `quality`：`relevant`、`partial`、`off_topic`、`contradictory`、`unknown` 或 `not_done`。
- `factPatch`：结构化的 action、context、contribution、method、result、quantity 和 quantityType。
- `missingFields`：下一轮仍需补充的字段。
- `questionHint`：下一轮主要问题方向。

特殊回答“没有做过”“不记得”“无法证明”继续由确定性规则优先处理。普通回答的模型输出必须通过契约校验；模型不可用时保留回答并进入可重试状态，不把原始回答误判为已确认事实。

### 4.3 多轮事实合并

同一任务的后续回答补充当前事实，而不是无条件创建多个互不关联的残缺事实。用户确认前展示合并后的事实摘要；确认后再进入充分度计算。

充分度基于任务全部已确认事实的合并结果：

- action、context、contribution 齐全为 `basic`。
- 在 basic 基础上具有 method 或 result 为 `strong`。
- 其他情况为 `insufficient`。

`off_topic` 首次触发一次不计轮次的澄清；第二次停止自动追问并进入 `return_control`。`relevant`、`partial`、`unknown` 和“无法证明/不记得”按既定政策消耗有效轮次；只有明确“没有做过”进入能力缺口。

### 4.4 恢复与幂等

- 重复启动已经完成解析的会话不得覆盖用户任务。
- 解析、匹配、回答评估、生成和审核失败均保存明确失败状态和最后成功数据。
- 重试从失败步骤继续，不重复消耗有效轮次。
- 所有 HTTP 命令即使已经做过 ownership 预检，底层查询仍必须带 `userId`。

## 5. PF-002：确定性红线与独立语义审核

PF-002 分为两个层次。

### 5.1 确定性审核

程序规则负责可稳定判定的边界：

- 事实引用存在且属于当前会话。
- 引用事实已经确认或修正。
- 新增数字、估算限定词和数字单位/语义用途一致。
- 常见职责扩大表达，包括主导、牵头、带领、独立负责、决策等。
- 团队成果个人化、技能虚构、证书虚构、项目状态虚构。
- 输出 Schema 合法。

数字审核将数值与单位或用途一起比较。例如“20 位用户”不能支持“营收提升 20%”。

### 5.2 独立语义审核

通过确定性检查后，独立审核器判断候选中的每项主要主张是否被引用事实支持，并返回：

- `status`
- `findings`
- `supportedClaims`
- `unsupportedClaims`
- `factRefs`
- `evaluationVersion`

语义审核使用独立提示词，不复用生成上下文；JD、简历和回答仅作为数据输入，不能改变审核规则或输出 Schema。

审核异常统一为 `unavailable`，不得默认通过。`blocked` 候选最多自动修正一次，修正后必须重新审核。

固定评测增加审核规则之外的对抗表达，包括同义职责扩大、跨语义复用数字和完全无关主张。端到端案例必须真正经过 orchestrator，而不是仅调用被测规则生成报告。

## 6. PF-003：修改效果验证与交接

`validateModification` 改为异步流程。一次用户主动验证包含：

1. 保存本轮 baseline 和 currentText。
2. 计算确定性 Diff。
3. 执行确定性引用、数字和 Schema 检查。
4. 发起一次语义评估，同时判断岗位相关性、表达质量、证据覆盖和需要语义理解的事实风险。
5. 合并为 `changeOutcome` 与独立的 `safetyStatus`。
6. 追加不可变验证记录。
7. 更新任务最终文本、验证状态、会话状态和 handoff。

默认结果不能根据字符串长度或“是否变化”推断 improved。语义评估不可用时：

- `changeOutcome` 使用 `unchanged` 或明确的 `unavailable` 反馈，不虚构改善结论。
- `safetyStatus` 为 `unavailable`。
- 原文、当前文本和上一条验证记录保持不变。

验证记录包含：

- `id`
- `baselineText`
- `currentText`
- `diff`
- `changeOutcome`
- `safetyStatus`
- `evidenceCoverage.before/after`
- `improvements`
- `remainingIssues`
- `nextActions`
- `evaluationVersion`
- `createdAt`

安全通过后，handoff 必须使用当前文本和最新验证状态。用户确认保留 blocked 内容时：

- 任务进入 `completed_with_risk`。
- handoff 使用当前文本。
- `verificationStatus` 仍为 `blocked`。
- `riskAcknowledged` 为 true。
- 不显示“已验证”。

用户在验证后再次编辑时，最新验证状态失效，但历史验证记录不被覆盖。

## 7. PF-004：真实状态兼容的引导演示

演示 fixture 使用和 AgentSession、任务、候选及 PF-003 验证记录相同的字段结构，并记录：

- fixture 版本。
- 规则、Schema、Prompt 和代码版本。
- `isDemo: true`。

页面直接从 `fixture.session.requirements`、`resumeFacts`、`tasks` 和 `validationRecords` 派生展示，不维护一组与真实状态重复的扁平业务字段。

演示：

- 不调用 Agent、Analysis 或 AI API。
- 不创建历史记录。
- 全局页面埋点跳过 demo，或写入明确隔离的 demo 指标，不进入真实分析漏斗。
- 每次进入从第一步开始；用户可逐步前进并随时重新开始。
- 从演示进入真实入口时不携带 fixture 的 JD、简历或任务 ID。

契约测试实际加载 fixture 并验证字段和枚举，而不是搜索源文件字符串。

## 8. API 与错误处理

服务端统一返回：

```json
{
  "error": {
    "code": "ERROR_CODE",
    "message": "可读提示",
    "retryable": false
  }
}
```

前端请求层优先读取 `error.message`，保留 `error.code` 供页面决定重试或返回入口，不再显示 `[object Object]`。

输入不存在与无权访问对外统一返回 404，避免通过响应差异枚举其他用户数据。

## 9. 测试策略

所有生产改动执行 Red-Green-Refactor：

1. 增加真实 Mongoose 文档序列化与 `validateSync` 测试，覆盖 `pendingFactId` 和 `return_control`。
2. 增加状态迁移测试，验证当前状态和 transition 的 from/to 同步。
3. 增加回答评估、多轮事实合并、答非所问和重试测试。
4. 增加中文近义文本匹配测试。
5. 增加无关主张、同义职责扩大和数字用途变化测试。
6. 增加 PF-003 异步语义评估、不可用降级、证据覆盖、handoff 和风险完成测试。
7. 增加 JD、Resume、Supplement 和 AgentSession 越权测试。
8. 增加迁移 dry-run、唯一归属、冲突和幂等测试。
9. 增加 PF-004 运行时契约、无 API、无真实埋点和重启测试。
10. 运行全部后端测试、PF-002 固定评测和前端生产构建。

测试不得仅依赖普通对象仓库证明 Mongoose 行为；持久化契约必须直接使用 Mongoose 文档验证。

## 10. 验收条件

- 已确认事实刷新后仍可继续，三轮结束能够持久化 `return_control`。
- 有效补充可以从 insufficient 进入 basic 或 strong，并生成对应候选。
- 答非所问不会被直接写成已确认事实。
- 分析结束后的会话状态与 transition 记录一致。
- 中文语义明显重叠的要求和事实不会因整句分词而漏匹配。
- 无依据主张、同义职责扩大和跨用途数字不会获得 passed。
- PF-002 审核不可用时不展示可采用的 AI 候选。
- 无关或变差文本不会被默认标记 improved。
- PF-003 验证或风险完成后 handoff 包含当前最终文本、事实引用、安全状态和风险确认状态。
- 用户不能通过已知 ObjectId 访问其他用户的 JD、简历、补充信息、分析或 Agent 会话。
- 可证明归属的旧数据完成回填；冲突和孤立数据不丢失且不越权暴露。
- PF-004 fixture 通过真实契约校验，不调用业务 API，不进入真实业务指标。
- 前端错误提示不再出现 `[object Object]`。
- 全部自动化测试、固定评测和前端生产构建通过。
