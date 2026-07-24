---
title: 精投助手指标与埋点方案
owner: 产品负责人（待指定）
reviewers:
  - 数据负责人（待指定）
  - 前端负责人
  - 后端负责人
  - AI 负责人
status: draft
version: "0.2"
created_at: 2026-07-23
updated_at: 2026-07-23
related_docs:
  - ./01-product-prd.md
  - ./03-core-user-flows.md
  - ./09-mvp-acceptance.md
---

# 精投助手指标与埋点方案

## 1. 文档目标

定义产品价值、核心漏斗、AI 质量、教学效果和安全指标，以及支撑这些指标的事件、属性和数据质量规则。

## 2. 北极星指标

### 指标名称

新 JD 独立有效改写完成用户数/率。

### 业务定义

用户在一个新的岗位版本中，以“独立修改”模式提交至少一条经历表达，且：

1. 通过真实性检查。
2. 回应一条核心或重要 JD 要求。
3. 包含可追溯的已确认事实。
4. 通过 AI 或人工的最低表达质量检查。

### 统计口径

- 用户数：统计周期内满足条件的去重 userId。
- 完成率：满足条件的岗位版本数 ÷ 进入修改任务页的岗位版本数。
- 当前无登录时以设备 ID 近似用户，必须标注跨设备和清理 localStorage 的偏差。

## 3. 指标框架

| 指标 ID | 指标 | 定义 |
|---|---|---|
| M-001 | 简历导入完成率 | 确认解析结果的用户 ÷ 开始导入的用户 |
| M-002 | 证据建档完成率 | 至少确认一段代表经历的用户 ÷ 完成简历导入的用户 |
| M-003 | JD 确认率 | 确认 JD 解析的岗位版本 ÷ 提交 JD 的岗位版本 |
| M-004 | 证据地图到达率 | 成功生成地图的岗位版本 ÷ JD 已确认岗位版本 |
| M-005 | 首条修改完成率 | 完成至少一条任务的岗位版本 ÷ 地图已生成岗位版本 |
| M-006 | 投递方案完成率 | 进入 P-042 的岗位版本 ÷ 创建岗位版本 |
| M-007 | 首次有效修改耗时 | 从岗位版本创建到首条有效修改完成的中位时长 |
| M-008 | 建议采纳率 | 直接接受或轻度编辑的 AI 建议 ÷ 展示的建议 |
| M-009 | 大幅二次修改率 | 用户大幅修改 AI 建议的数量 ÷ 采纳建议数量；阈值待定义 |
| M-010 | 重复填写量 | 第二次岗位版本中用户重新提供的已知事实字段数 |
| M-011 | 独立练习完成率 | 完成 independent 任务的用户 ÷ 进入教学流程用户 |
| M-012 | 无依据生成率 | 审核判定无事实来源的 AI 候选数 ÷ AI 候选总数 |
| M-013 | 错误个人归因率 | 团队成果错误写成个人成果的候选数 ÷ 含团队成果候选数 |
| M-014 | AI 任务成功率 | succeeded AI 任务 ÷ 已受理 AI 任务 |
| M-015 | AI P95 耗时 | 各 AI 任务类型的 95 分位耗时 |

数值目标在 30—50 个案例评测和首轮可用性测试后冻结。

## 4. 核心漏斗

```text
访问工作台
→ 开始简历导入
→ 确认简历解析
→ 确认代表经历
→ 创建岗位版本
→ 确认 JD
→ 查看证据地图
→ 开始修改任务
→ 完成首条有效修改
→ 生成岗位简历
→ 完成投递前检查
→ 完成岗位方案
```

每一步同时统计人数、岗位版本数、转化率、中位耗时和失败原因。

## 5. 事件命名规范

- 使用小写 snake_case。
- 使用“对象 + 动作 + 结果”，例如 `resume_parse_confirmed`。
- 页面访问与业务完成分开记录，不能用 page_view 代替业务成功。
- 失败事件包含标准 `error_code`，不发送简历正文或个人联系方式。

## 6. 核心事件

| 事件 | 触发时机 | 核心属性 | 对应指标 |
|---|---|---|---|
| `page_view` | 路由完成 | page_id, application_id | 页面使用 |
| `resume_import_started` | 用户首次提交文本/文件 | source_type, file_ext | M-001 |
| `resume_parse_succeeded` | 解析 Schema 有效 | parser_version, duration_ms | AI 质量 |
| `resume_parse_confirmed` | 用户确认导入 | edited_field_count | M-001 |
| `evidence_deep_dive_started` | 打开深挖任务 | evidence_type, source | M-002 |
| `evidence_confirmed` | 确认一段事实 | evidence_level, field_count | M-002 |
| `application_created` | 创建岗位版本 | source_resume_id | M-006 |
| `jd_submitted` | 提交 JD | input_method, text_length_bucket | M-003 |
| `jd_analysis_confirmed` | 用户确认解析 | direction, edited_count | M-003 |
| `evidence_map_generated` | 地图任务成功 | requirement_count, status_counts | M-004 |
| `evidence_gap_answered` | 回答证据追问 | answer_type, confirmed | 追问转化 |
| `modification_task_started` | 打开任务 | priority, assist_level, task_type | M-005 |
| `rewrite_candidate_shown` | 候选表达展示 | candidate_type, risk_flag_count | M-008 |
| `rewrite_candidate_accepted` | 直接接受 | candidate_type | M-008 |
| `rewrite_candidate_edited` | 编辑后采用 | edit_distance_bucket | M-008/M-009 |
| `rewrite_candidate_rejected` | 拒绝 | reason | 建议质量 |
| `modification_task_completed` | 任务完成 | assist_level, duration_ms | M-005/M-011 |
| `tailored_resume_generated` | 组装成功 | completed_task_count | M-006 |
| `final_check_completed` | 检查完成 | blocker_count, warning_count | M-006 |
| `application_completed` | 进入完成页 | unresolved_warning_count | M-006 |
| `content_copied` | 复制段落或全部内容 | content_scope | 实际使用代理指标 |
| `ai_task_failed` | AI 任务最终失败 | task_type, error_code, retry_count | M-014 |
| `data_deleted` | 删除版本/经历/全部档案 | object_type | 隐私运营 |

## 7. 公共属性

| 属性 | 说明 |
|---|---|
| event_id | 事件唯一 ID，用于去重 |
| occurred_at | 客户端发生时间 |
| received_at | 服务端接收时间 |
| user_id | 设备或账号 ID；不得使用邮箱/手机号 |
| session_id | 当前会话 ID |
| application_id | 岗位版本 ID，可空 |
| page_id | P-xxx 页面 ID |
| product_version | 前端/后端版本 |
| experiment_id | 实验 ID，可空 |
| source | web/mobile_web 等 |

AI 事件额外包含 task_type、model_version、prompt_version、schema_version、duration_ms、retry_count 和 status，不包含完整输入输出。

## 8. 当前实现差距

当前只记录：

- `page_view`
- `analysis_started`
- `analysis_completed`
- `section_reevaluated`
- `history_deleted`
- `history_renamed`

事件通过 `/api/track` 打印日志，不入库。前端 payload 使用 `visitorId`，服务端却从 `X-User-Id` 读取 visitor，当前请求未携带该头时会记为 anonymous。目标实现需统一身份属性并建立可查询数据存储。

## 9. AI 质量评测与线上监控

- 离线评测：每次模型、Prompt、Schema 或规则变更运行固定案例。
- 线上审核：统计候选表达的审核问题、用户拒绝和大改。
- P0 告警：出现无来源事实、错误个人归因、跨用户数据或大面积 AI 失败。
- 不把用户采纳直接等同于质量，采纳与真实性指标必须联合观察。

## 10. 数据质量

1. 服务端生成或校验 event_id，避免重复上报。
2. 业务完成事件由服务端确认，不能只依赖按钮点击。
3. 测试账号和内部流量可标记并从正式指标排除。
4. 指标定义变化需要版本号和生效日期。
5. 埋点不得包含简历原文、JD 原文、联系方式或模型完整输出。

## 11. 看板

建议最少建立：

- 核心漏斗与各步耗时。
- 证据追问与修改任务完成情况。
- AI 任务成功率、耗时和错误分布。
- 事实安全指标。
- 教学模式与快速模式对比。

## 12. 待确认

- 用户身份从设备 ID 升级后的历史指标合并规则。
- “大幅修改”的文本差异阈值。
- 内测、公开 MVP 和正式上线的数值目标。
- 埋点存储方案和保留期限。

