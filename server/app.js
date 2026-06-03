const express = require('express');
const cors = require('cors');
const path = require('path');
const config = require('./config');
const connectDB = require('./config/db');

const jdRoutes = require('./routes/jd');
const resumeRoutes = require('./routes/resume');
const supplementRoutes = require('./routes/supplement');
const analysisRoutes = require('./routes/analysis');
const historyRoutes = require('./routes/history');
const userIdMiddleware = require('./middleware/userId');
const cleanupOldData = require('./services/cleanup');

const app = express();

// 中间件
app.use(cors());
app.use(express.json({ limit: '10mb' }));
app.use(express.urlencoded({ extended: true }));
app.use('/uploads', express.static(path.join(__dirname, 'uploads')));

// 路由（需要用户隔离的接口挂载 userId 中间件）
app.use('/api/jd', jdRoutes);
app.use('/api/resume', resumeRoutes);
app.use('/api/supplement', supplementRoutes);
app.use('/api/analysis', userIdMiddleware, analysisRoutes);
app.use('/api/analysis', userIdMiddleware, historyRoutes);

// 健康检查
app.get('/api/health', (req, res) => {
  res.json({ status: 'ok', timestamp: new Date().toISOString() });
});

// 生产环境下托管前端静态文件
if (process.env.NODE_ENV === 'production') {
  const frontendPath = path.join(__dirname, '../web/dist');
  app.use(express.static(frontendPath));
  // SPA fallback：非 API 路由都返回 index.html（不用 app.get('*')，Express 5 已弃用通配符）
  app.use((req, res) => {
    if (!req.path.startsWith('/api')) {
      res.sendFile(path.join(frontendPath, 'index.html'));
    }
  });
}

// 全局错误处理
app.use((err, req, res, next) => {
  console.error('未捕获错误:', err);
  res.status(500).json({ error: err.message || '服务器内部错误' });
});

// 启动
const startServer = async () => {
  await connectDB();
  app.listen(config.port, () => {
    console.log(`精投助手服务端启动成功，端口: ${config.port}`);
  });

  // 启动时清理过期数据，之后每天清理一次
  cleanupOldData();
  setInterval(cleanupOldData, 24 * 60 * 60 * 1000);
};

startServer();

module.exports = app;
