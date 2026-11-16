# 数据生命周期及验证

JD 保存原文和结构化岗位；Resume 保存原文、联系方式及结构化经历；Supplement 按 userId + resumeId 唯一保存补充经历。Analysis 引用 JD、Resume 和可选 supplementId，保存评分、原文片段和结果。旧版创建读取同用户 resumeId 下的补充经历，但不持久化 supplementId，因此清理必须同时检查 resumeId。AgentSession 引用 JD、Resume，同时在 inputSnapshot、事实、任务、候选文本及 handoff 内复制输入和结果；删除文档会移除这些内嵌副本。输入 ID 可以被多个任务重用，不能级联无条件删除。

统一 retention 服务先删记录再查两类引用，均在同一事务内。引用检查不限制用户，以保守保护归属异常的引用；实际删除始终有 _id 和 userId。过期扫描逐记录提交，单次失败中止本轮，已完成部分无需重做，失败部分在下一轮恢复。TTL 不触发级联，但按材料 createdAt 的独立扫描可回收遗留材料。共享材料在引用仍存在时保留，过期引用由扫描先行移除；未过期任务含处理中任务受到保护，任务到期为硬期限。

并发创建通过事务更新 JD、Resume 的 retentionVersion 后插入任务；与删除相同材料发生写冲突，避免“检查无引用后新建任务、随后材料被删”。失败事务不能留下新引用。删除和写回并发时，更新既有文档不使用 upsert；Agent 分析另有 claim token。无事务的数据库拒绝执行，不使用进程内锁假装提供多实例一致性。

测试仅使用合成内存仓储及临时 MongoDB 副本集。内存测试覆盖独占任务两种类型、跨类型共享、归属异常、毫秒边界、TTL 遗留材料、重复清理和失败回滚。组件测试验证两类删除接口、相同 ID 的类型隔离和列表更新。真实数据库测试使用 mongodb-memory-server，显式 RUN_RETENTION_MONGO=1 才运行，不读取项目数据库连接配置；验证 TTL 索引、实际 TTL 删除、事务和并发引用。常规后端测试默认跳过该项。

不应把测试通过解释为生产部署已验证。生产拓扑、现有数据数量、备份或第三方 AI 服务的保留政策未在本次开发中检查。尚未执行任何真实数据迁移、批量清理或生产启动。

2026-11-16 验证结果：后端完整测试 227 通过、1 项真实库测试默认跳过；该项已单独在 MongoDB 8.2.6 临时单节点副本集执行通过，验证真实 TTL 索引及删除、事务回滚、并发引用与无 upsert 写回。前端契约测试 15 通过、组件测试及生产构建通过。页面验收采用挂载真实 History 组件的自动化交互测试，未执行浏览器人工验收。

复现真实库测试：在项目根目录执行 `npm.cmd install --prefix .retention-test --no-package-lock --no-save mongodb-memory-server`，设置 `RUN_RETENTION_MONGO=1` 和 `MONGOMS_DOWNLOAD_DIR` 为工作区内缓存目录，再执行 `node --test server/test/retentionMongo.test.js`。仅启动临时数据库，不使用项目连接配置。
