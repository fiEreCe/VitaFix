# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

## Commands

```bash
# 启动后端（需要先配好 .env 和 MongoDB）
cd server && npm run dev    # node --watch app.js（热重启）

# 启动前端
cd web && npm run dev       # Vite dev server on :5173

# 构建前端
cd web && npm run build

# 仅启动后端（无热重启）
cd server && npm start
```

### 环境要求
- Node.js 18+（推荐 20+）
- MongoDB Atlas 或本地 MongoDB
- 配置 `server/.env`:
  - `MONGODB_URI` — MongoDB 连接串（Atlas 使用 mongodb+srv://，本地用 mongodb://localhost:27017/...）
  - `DEEPSEEK_API_KEY` — DeepSeek API Key

## Architecture

### 前后端分离
```
web/  (Vue 3 + Vite + Vant UI)  →  :5173
  └── 代理 /api/* → http://localhost:3000

server/  (Express 5 + Mongoose 9 + MongoDB)
  └── :3000
```

Vite 开发服务器代理所有 `/api` 请求到后端。生产部署时后端需独立部署并提供 API。

### 用户流程
```
首页 → JD输入(粘贴/截图OCR) → 简历输入(粘贴/上传PDF/DOCX) → 补充经历(可选)
  → AI分析(异步) → 查看匹配结果(打分+维度雷达图+需求清单) → 历史记录管理
```

### 后端架构（MVC 模式）

```
server/
├── routes/          # 路由定义，挂载中间件（multer、userIdMiddleware）
├── controllers/     # 请求处理，参数校验，调用 service
├── services/        # 业务逻辑 + AI 调用
│   ├── deepseekService.js    # DeepSeek API 封装（chat, chatJSON）
│   ├── jdParser.js           # JD 文本 → AI解析结构化字段
│   ├── resumeParser.js       # 简历文本 → AI自动分板块
│   ├── matchAnalyzer.js      # 核心：JD vs 简历匹配分析（6维度）
│   ├── fileParser.js         # PDF/DOCX/TXT → 纯文本提取
│   └── ocrService.js         # 图片 → Tesseract.js OCR → 文字
├── models/          # Mongoose 数据模型
├── middleware/
│   └── userId.js    # 从 X-User-Id 请求头提取用户标识
└── utils/
    └── promptTemplates.js    # DeepSeek 提示词模板
```

### 前端架构

```
web/src/
├── views/           # 6 个页面视图
│   ├── Home.vue             # 首页 + 最近历史
│   ├── JdInput.vue          # JD输入（文本粘贴/截图识别）
│   ├── ResumeInput.vue      # 简历输入（文本粘贴/文件上传）
│   ├── Supplement.vue       # 补充经历（可选）
│   ├── AnalysisResult.vue   # 分析结果（核心页面）
│   └── History.vue          # 历史记录管理
├── components/      # 5 个组件
│   ├── ScoreCircle.vue      # SVG 环形分数
│   ├── RadarChart.vue       # SVG 六维雷达图
│   ├── DimensionCard.vue    # 可展开的维度分析卡片
│   ├── RequirementItem.vue  # JD需求匹配项（含简历原文映射）
│   └── SectionAnalysis.vue  # 简历板块分析卡片
├── router/          # Hash-based 路由，6 条
├── api/index.js     # fetch 封装，自动携带 X-User-Id
└── utils/
    ├── format.js    # 日期/分数/状态格式化
    └── id.js        # 设备ID（localStorage 自动生成）
```

## Key Patterns

### 用户隔离（无登录）
前端首次访问自动在 `localStorage` 生成设备 ID（`user_时间戳_随机数`），所有 API 请求通过 `X-User-Id` 请求头发送。后端 `userIdMiddleware` 提取并挂载到 `req.userId`，数据查询按 `userId` 过滤。无注册登录流程。

### 分析异步执行
`POST /api/analysis` 立即返回 `202 Accepted` + `analysisId`，AI 分析在 `setImmediate` 中后台执行。前端轮询 `GET /api/analysis/:id/status`（每 2 秒），status 从 `processing` 变为 `completed` 后加载完整结果。

### 文件上传
- **JD截图OCR**: `POST /api/jd/ocr` (multer + Tesseract.js)
- **简历文件**: `POST /api/resume/upload` (multer + pdf-parse/mammoth)
- multer 用内存存储（非磁盘），限制 20MB，错误手动包装（Express 5 不自动捕获）

### AI 提示词
所有提示词模板集中在 `utils/promptTemplates.js`，DeepSeek 返回 JSON 格式，服务层用 `chatJSON()` 解析并校验。低温度（0.1~0.2）确保结构化输出稳定性。

### PC 端适配
PC 浏览器上页面居中显示为 480px 宽的手机布局（全局 `#app` max-width），左右灰色背景。

## Critical Gotchas

### pdf-parse v2 API
`pdf-parse` 是 v2 版本，API 与 v1 不兼容：
```js
// ✅ v2 正确用法
const { PDFParse } = require('pdf-parse');
const parser = new PDFParse(new Uint8Array(buffer.buffer, buffer.byteOffset, buffer.byteLength));
const result = await parser.getText();
```

### Mongoose 9 pre('save')
Mongoose 9 移除 `next` 回调参数：
```js
// ✅ 正确
schema.pre('save', function () {
  this.updatedAt = new Date();
});
// ❌ 错误（TypeError: next is not a function）
schema.pre('save', function (next) { next(); });
```

### Express 5 + multer
Express 5 不自动捕获 multer 中间件的错误，需手动包装：
```js
router.post('/upload', (req, res, next) => {
  upload.single('file')(req, res, (err) => {
    if (err) return res.status(400).json({ error: err.message });
    next();
  });
}, controller.upload);
```

### 全局错误处理
Express 5 需要显式添加全局错误处理中间件，否则未捕获错误会导致连接挂起。

### FormData + 自定义 Header
前端 `upload()` 函数发送 FormData 时带 `X-User-Id` 自定义头，浏览器会自动设置 `Content-Type: multipart/form-data; boundary=...`。**不要手动设置 Content-Type**。
