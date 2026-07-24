---
title: 精投助手产品文档中心
owner: 产品负责人（待指定）
reviewers:
  - 设计负责人
  - 前端负责人
  - 后端负责人
  - AI 负责人
  - 测试负责人
status: draft
version: "0.5"
created_at: 2026-07-23
updated_at: 2026-07-23
---

# 精投助手产品文档中心

## 1. 文档基线

本目录是精投助手 MVP 核心能力重构的正式产品文档基线，面向产品、设计、研发、AI 和测试协作。

文档采用两层事实来源：

- 目标产品基线：[原始 MVP 产品设计](../superpowers/specs/2026-07-23-product-resume-coach-mvp-design.md)，定义“证据驱动的应届生产品岗简历教练”。
- 当前实现基线：仓库 README、Vue 页面、Express API 和 MongoDB 模型，代表已有“简历—JD 六维匹配分析 Demo”。

当两者冲突时，以目标产品基线为需求方向；当前实现仅用于评估可复用能力和迁移成本，不自动成为目标需求。

## 2. 产品演进说明

当前首要交付目标不是直接完成完整产品 MVP，而是先完成 **V0.1 求职作品版**。该版本集中证明 AI PM、Agent、AI 评测与工程落地能力；账号、长期证据库、30 天保留和导入导出属于后续产品 MVP。版本归属以 [版本规范与路线图](./00-version-specification-and-roadmap.md)为准。

| 维度 | 当前 Demo | 目标 MVP |
|---|---|---|
| 产品定位 | 通用简历—JD 匹配分析工具 | 应届生产品岗、证据驱动的简历教练 |
| 核心产物 | 匹配分数、雷达图、逐项分析 | 岗位定制简历、证据来源、修改记录、能力差距、学习结果 |
| 用户行为 | 输入 JD 和简历后查看分析 | 确认事实、处理修改任务、独立练习、完成投递检查 |
| 数据底座 | 单次 Resume/JD/Analysis | 可复用职业证据库 + 多个岗位投递版本 |
| AI 边界 | 评分与建议 | 先找证据、证据不足追问、禁止补写无依据事实 |
| 主要目标 | 提高匹配分数 | 产出真实、针对岗位且可解释的简历表达 |

## 3. 文档导航

| 文档 | 唯一职责 | 成熟度 |
|---|---|---|
| [00-version-specification-and-roadmap.md](./00-version-specification-and-roadmap.md) | 版本定义、范围归属、准入条件和变更规则 | 已形成讨论基线 |
| [01-product-prd.md](./01-product-prd.md) | 产品定位、范围、目标、原则和风险 | 已形成讨论基线 |
| [02-information-architecture.md](./02-information-architecture.md) | 页面树、路由、导航和访问条件 | 已形成目标草案 |
| [03-core-user-flows.md](./03-core-user-flows.md) | 端到端主路径、分支、恢复与完成条件 | 已形成目标草案 |
| [04-page-specifications.md](./04-page-specifications.md) | 页面展示、操作、状态和跳转 | 已形成需求草案 |
| [05-domain-model-and-states.md](./05-domain-model-and-states.md) | 领域对象、关系、确认状态和生命周期 | 已形成需求草案 |
| [06-ai-product-specification.md](./06-ai-product-specification.md) | AI 任务、输入输出、可信边界和评测 | 已形成需求草案 |
| [07-exceptions-privacy-and-permissions.md](./07-exceptions-privacy-and-permissions.md) | 异常恢复、权限、隐私和删除 | 已形成需求草案 |
| [08-analytics-and-metrics.md](./08-analytics-and-metrics.md) | 指标口径、漏斗和埋点事件 | 已形成需求草案 |
| [09-mvp-acceptance.md](./09-mvp-acceptance.md) | 端到端验收、AI 门槛和上线阻断条件 | 已形成需求草案 |

## 4. 模块规格

| 模块 | 文档 | 模块职责 |
|---|---|---|
| V0.1 简历优化 Agent | [portfolio-resume-agent.md](./modules/portfolio-resume-agent.md) | 单次会话中的证据追溯、动态追问、候选生成、事实审核和用户决定 |
| 职业证据库 | [evidence-library.md](./modules/evidence-library.md) | 简历导入、事实确认、经历深挖和长期沉淀 |
| 岗位版本与 JD 分析 | [job-version-and-jd-analysis.md](./modules/job-version-and-jd-analysis.md) | 新建岗位版本、解析 JD、识别岗位方向和要求 |
| 证据地图与修改任务 | [evidence-map-and-tasks.md](./modules/evidence-map-and-tasks.md) | 匹配岗位要求与证据、识别缺口、生成优先级任务 |
| 单条修改工作台 | [editing-workbench.md](./modules/editing-workbench.md) | 追问、事实确认、生成建议、用户编辑和教学反馈 |
| 简历组装与投递检查 | [resume-assembly-and-final-check.md](./modules/resume-assembly-and-final-check.md) | 组装岗位版本、检查真实性和完成投递方案 |

## 5. 唯一事实来源

| 问题 | 权威文档 |
|---|---|
| 哪个版本做、何时可以发布、如何调整范围 | 00 版本规范与路线图 |
| 为什么做、做什么、不做什么 | 01 产品 PRD |
| 页面是否存在、入口在哪里 | 02 信息架构 |
| 用户何时进入下一步 | 03 核心流程 |
| 页面上显示什么、按钮做什么 | 04 页面规格 |
| 对象有哪些状态、数据如何关联 | 05 领域模型 |
| AI 能否生成、何时追问 | 06 AI 规格 |
| 失败、删除、隐私如何处理 | 07 异常与隐私 |
| 如何统计产品效果 | 08 指标与埋点 |
| 什么算开发完成和可上线 | 09 MVP 验收 |
| 模块内部业务规则 | 对应模块规格 |

## 6. 推荐阅读顺序

- 产品与管理：00 → 01 → 03 → 模块规格 → 08 → 09
- 设计：01 → 02 → 03 → 04 → 07
- 前端：02 → 03 → 04 → 05 → 模块规格
- 后端与 AI：01 → 05 → 06 → 07 → 模块规格
- 测试：03 → 04 → 05 → 07 → 09

## 7. 文档治理

1. `draft` 表示可讨论但不可直接作为上线基线；评审通过后改为 `approved`。
2. 产品范围变化必须同步更新 PRD、相关模块规格、页面规格和验收文档。
3. 页面、流程、对象、AI 任务、事件和验收项分别使用 `P/F/AI/M/AC` 编号。
4. 没有现有依据的数字门槛标记为“待基线评测后确认”，不得伪造。
5. 当前代码与目标需求不一致时，在文档中记录“实现差距”，不修改目标定义迁就旧实现。

## 8. 当前 P0 待决策

- 首次使用时“两段代表经历深挖”是强制门槛还是可跳过任务。
- 快速优化与教学模式的默认关系及切换规则。
- “岗位投递版本完成”的最低任务条件。
- AI 质量指标的数值门槛，需要先建立 30—50 个案例评测集。

已确认：V0.1 求职作品版是首个实现版本；账号、免费账号 30 天保留以及证据库导入导出进入后续产品 MVP。完整决策见 [版本规范与路线图](./00-version-specification-and-roadmap.md)。
