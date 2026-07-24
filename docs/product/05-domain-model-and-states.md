---
title: 精投助手领域模型与状态定义
owner: 产品负责人（待指定）
reviewers:
  - 后端负责人
  - 前端负责人
  - AI 负责人
  - 测试负责人
status: draft
version: "0.4"
created_at: 2026-07-23
updated_at: 2026-07-24
related_docs:
  - ./03-core-user-flows.md
  - ./06-ai-product-specification.md
  - ./modules/evidence-library.md
  - ./modules/modification-effect-validation.md
---

# 精投助手领域模型与状态定义

## 1. 文档目标

统一产品对象、关系、字段、确认状态和生命周期。本文件定义产品语义；数据库 Schema、索引、迁移和 API 合同由技术设计进一步确定。

## 2. 核心术语

| 术语 | 定义 |
|---|---|
| 基础简历 | 用户导入并确认的原始简历结构，是证据库的初始来源 |
| 职业证据库 | 跨岗位复用的真实经历、技能使用场景和确认记录集合 |
| 事实 | 用户真实发生的背景、角色、行动、方法、协作、结果或证明材料 |
| 表达 | 面向某条 JD 对事实进行选择和组织后的简历文本 |
| 岗位投递版本 | 一份基础简历针对一条已确认 JD 的完整工作空间 |
| 岗位要求 | 从 JD 中提取并经用户确认的可匹配要求 |
| 证据匹配项 | 一条岗位要求与一组职业证据之间的关联和判断 |
| 修改任务 | 为解决表达缺口或补充事实而创建的可执行任务 |
| 可信强化 | 不改变事实前提下强化行动、因果、协作和结果表达 |

## 3. 领域关系

```text
UserIdentity
├─ BaseResume
│  └─ EvidenceLibrary
│     ├─ ExperienceEvidence
│     ├─ SkillEvidence
│     └─ CapabilityTag
└─ ApplicationVersion
   ├─ JobDescription
   │  └─ JobRequirement
   ├─ EvidenceMatch ──引用──> EvidenceLibrary
   ├─ ModificationTask
   │  ├─ RewriteCandidate
   │  └─ ChangeRecord
   ├─ TailoredResumeVersion
   ├─ FinalCheckResult
   └─ LearningRecord
```

## 4. 对象定义

### 4.1 UserIdentity

表示数据所有者。当前实现使用 localStorage 生成的设备 ID，并通过 `X-User-Id` 传递。

目标要求：

- 所有用户拥有对象均关联同一个身份 ID。
- 所有读取、修改和删除接口执行所有权校验。
- 设备 ID 清除或换设备后的恢复能力取决于账号策略，当前尚未解决。

### 4.2 BaseResume

| 字段 | 含义 | 来源 | 用户确认 |
|---|---|---|---|
| id | 基础简历标识 | 系统 | 否 |
| userId | 所有者 | 设备/账号 | 否 |
| rawText | 提取后的原始文本 | 粘贴/文件 | 是 |
| sourceType | text/pdf/docx/txt | 系统 | 否 |
| sourceFileName | 原文件名，可选 | 上传 | 否 |
| parsedSnapshot | 解析结果快照 | AI | 是 |
| status | importing/parsing/pending_confirmation/confirmed/failed/archived | 系统 | 否 |
| parserVersion | 解析模型和规则版本 | 系统 | 否 |
| createdAt/updatedAt | 时间 | 系统 | 否 |

确认后不应被岗位表达直接覆盖；重新导入或重大修改产生新版本或明确的变更记录。

### 4.3 ExperienceEvidence

| 字段 | 含义 |
|---|---|
| type | 实习、项目、校园/社团、竞赛、课程、志愿者、其他 |
| title/organization/period | 经历基本信息 |
| contextAndGoal | 背景、目标或问题 |
| personalRole | 用户角色和责任边界 |
| actionsAndDecisions | 关键行动、判断和方法 |
| toolsAndMethods | 实际使用工具和方法 |
| collaborators | 协作对象及协作方式 |
| challengesAndSolutions | 困难与解决过程 |
| personalResults | 可归因个人的结果 |
| teamResults | 团队共享成果 |
| evidenceArtifacts | 作品、证书、链接或材料描述 |
| sourceRefs | 原简历、用户回答、文件等来源 |
| confirmationStatus | draft/pending/confirmed/disputed |
| evidenceLevel | green/yellow/red |

### 4.4 SkillEvidence

技能不能只保存名称，至少关联：

- 熟练程度（用户描述，不作为唯一判断）。
- 实际使用场景和任务。
- 关联经历。
- 最近使用时间。
- 产出或结果。
- 证据强度和确认状态。

没有使用场景的技能只能视为“学习过/自述”，不能自动写成业务成果。

### 4.5 CapabilityTag

需求分析、用户研究、数据分析、产品设计、项目推动、结果复盘等系统推断标签。标签必须关联证据，可由用户确认或修正，不允许直接主观打分生成强证据。

### 4.6 JobDescription

| 字段 | 含义 |
|---|---|
| rawText | 用户确认的 JD 原文 |
| company/position | 公司和岗位 |
| productDirection | AI/C 端/B 端/增长/数据/其他 |
| graduateSuitability | 适合/不适合/不确定及理由 |
| responsibilities | 主要职责 |
| parserVersion | 模型、Prompt 和规则版本 |
| confirmationStatus | draft/pending/confirmed/superseded |

### 4.7 JobRequirement

| 字段 | 取值 |
|---|---|
| category | threshold/tool_method/product_capability/collaboration/domain |
| priority | core/important/normal |
| nature | must_have/bonus/unknown |
| text/sourceQuote | 归纳要求和 JD 原文 |
| verificationType | 客观门槛、工具任务、完整经历、协作案例、场景知识 |
| confirmationStatus | pending/confirmed/edited/removed |

### 4.8 ApplicationVersion

一条 JD 对应的岗位投递工作空间。

关键字段：名称、基础简历引用、JD 引用、当前步骤、模式（教学/快速）、状态、完成时间、模型和规则版本。

### 4.9 EvidenceMatch

| 字段 | 含义 |
|---|---|
| requirementId | 对应岗位要求 |
| evidenceRefs | 引用的一条或多条证据 |
| matchStatus | strong/weak_expression/needs_confirmation/no_evidence |
| evidenceStrength | green/yellow/red |
| diagnosis | 表达缺口/事实待确认/真实能力缺口 |
| rationaleSummary | 可核验的判断摘要 |
| nextAction | 修改任务、补充事实、学习建议或无需处理 |
| modelVersion | 生成该判断的版本 |

### 4.10 ModificationTask

| 字段 | 含义 |
|---|---|
| type | strengthen/add_context/clarify_attribution/reorder/remove/practice |
| priority | high/medium/not_recommended |
| requirementRefs | 对应岗位要求 |
| evidenceRefs | 可使用证据 |
| targetSection | 目标经历或技能段落 |
| status | todo/in_progress/blocked/completed/completed_with_risk/skipped_with_risk |
| assistLevel | demonstrate/hint/independent |
| expectedBenefit | 完成后的改善 |
| blockingReason | 缺事实、无证据、AI 失败等 |

### 4.11 RewriteCandidate

候选表达包括：

- `safe`：只使用绿色证据和归属明确的黄色证据。
- `enhanced`：在不改变事实下强化行动、因果、协作和结果。
- `user_written`：用户自主输入。

每条候选表达必须保存事实引用、JD 要求引用、生成方式、模型版本、风险标记和用户处理状态。

### 4.12 ChangeRecord

不可变修改记录，包含原文、用户当前文本、修改原因、事实来源、JD 要求、用户动作（接受/编辑/拒绝/撤销）、时间和版本。

用户认为本轮修改完成并主动触发 PF-003 后，追加一条不可变验证记录，保存：

- 修改前快照和修改后文本。
- 确定性文本 Diff。
- `changeOutcome`：`improved/unchanged/regressed/tradeoff`。
- `safetyStatus`：`passed/warning/blocked/unavailable`。
- 证据覆盖变化。
- 改善点、剩余问题和下一步。

每次验证记录还保存模型、Prompt、Schema、规则版本和验证时间。页面默认读取最新一条记录，同时保留任务最初原文；V0.1 不提供任意历史版本自由比较。

用户普通编辑和自动保存不创建验证记录；编辑后必须移除旧的 AI 验证状态，直到用户点击“完成修改并验证”。`blocked` 文本允许保存和使用，但任务只能进入 `completed_with_risk`。

### 4.13 TailoredResumeVersion

保存岗位版本的结构化简历内容、段落顺序、最终采用表达、风险项和版本号。MVP 支持内容复制，不承诺复杂排版。

### 4.14 FinalCheckResult

包含真实性、岗位相关性、表达质量三类检查；每个问题包含严重级别、关联段落、关联事实、修复入口、处理状态和检查版本。

### 4.15 LearningRecord

保存任务辅助等级、用户首次文本、AI 反馈、最终文本、掌握的原则和下一次建议辅助等级，不保存推断性人格标签。

## 5. 状态机

### 5.1 基础简历

```text
importing → parsing → pending_confirmation → confirmed
    └──────────────→ failed ──重试──> parsing
confirmed → archived
```

### 5.2 事实确认

```text
draft → pending → confirmed
              ├→ disputed → draft
              └→ rejected
confirmed → pending（事实被修改时重新确认）
```

### 5.3 岗位投递版本

```text
draft
→ jd_pending_confirmation
→ matching
→ map_ready
→ editing
→ assembling
→ checking
→ completed

任一处理中状态 → failed_step → 重试后回原状态
任一未完成状态 → archived
completed → editing（用户重新打开修改）
```

### 5.4 修改任务

```text
todo → in_progress → completed
  ├→ blocked ──补充事实/重试──> in_progress
  ├→ completed_with_risk（用户保留被 PF-003 阻断的自写内容）
  └→ skipped_with_risk（用户跳过任务或未处理风险）

completed/completed_with_risk → in_progress（用户再次编辑，或相关事实/JD 变化导致失效）
```

### 5.5 AI 任务

```text
queued → processing → succeeded
                  ├→ schema_invalid → queued（有限重试）
                  └→ failed → queued（用户重试）
```

### 5.6 最终检查问题

```text
open → fixing → resolved
  └→ accepted_risk（仅非阻断问题）

resolved → open（内容变化后重新检查发现问题）
```

## 6. 证据等级

| 等级 | 定义 | 可否生成 |
|---|---|---|
| green | 原简历或材料支持，且用户明确确认 | 可以正常使用 |
| yellow | 团队成果、估算、边缘参与、课程 Demo 等，需要谨慎归因 | 可以使用，但必须标明性质 |
| red | 无来源、未发生、属于他人或无法解释 | 不进入 AI 推荐表达 |

## 7. 数据一致性规则

1. 事实层不因岗位变化被自动改写。
2. 表达层必须引用事实层，不允许只有字符串没有来源。
3. 事实被删除或降级时，引用它的候选表达、最终版本和检查结果全部标记失效。
4. JD 重新确认后，受影响的证据匹配和修改任务重新计算。
5. AI 重试不得重复创建对象；使用幂等键或任务 ID。
6. 用户确认、删除、修改和 AI 生成必须可审计。
7. 当前实现只有 Analysis 带 `userId`，目标模型要求 Resume、JD、Supplement 及所有新对象都带所有权并在接口层校验。

## 8. 当前模型迁移映射

| 当前模型 | 可复用 | 目标变化 |
|---|---|---|
| Resume | rawText、教育/经历/项目/技能解析 | 增加 userId、版本、确认状态；拆出证据对象 |
| JD | rawText、公司、岗位、要求和职责 | 增加 userId、方向、五类要求、重要度和确认版本 |
| Supplement | 补充经历 | 合并为 ExperienceEvidence，不再仅按 resumeId 附属 |
| Analysis | 异步状态、要求匹配、板块分析 | 演进为 ApplicationVersion 及其匹配、任务、版本和检查对象 |

## 9. P0 待决策

- UserIdentity 是否在 MVP 升级为账号。
- 原始文件和原始文本保留时长。
- 被引用事实的删除是软删除还是立即物理删除。
- 用户手工保存红色内容时是否允许岗位版本进入完成状态。
