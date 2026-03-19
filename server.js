const express = require('express');
const cors = require('cors');
const dotenv = require('dotenv');

// 加载环境变量
dotenv.config();

// 导入路由
const authRoutes = require('./routes/authRoutes');
const testRoutes = require('./routes/testRoutes');
const userRoutes = require('./routes/userRoutes');

// 创建 Express 应用
const app = express();
const PORT = process.env.PORT || 3000;
const HOST = process.env.HOST || '0.0.0.0';

// 中间件配置
app.use(cors({
  origin: process.env.CLIENT_ORIGIN || 'http://localhost:5173',
  credentials: true
}));
app.use(express.json());
app.use(express.urlencoded({ extended: true }));

// 请求日志中间件
app.use((req, res, next) => {
  console.log(`[${new Date().toISOString()}] ${req.method} ${req.path}`);
  next();
});

// 路由配置
app.use('/api/auth', authRoutes);
app.use('/api/users', userRoutes);
app.use('/api', testRoutes);

// 根路径
app.get('/', (req, res) => {
  res.json({
    message: '管理后台 API 服务',
    version: '1.0.0',
    status: 'running',
    timestamp: new Date().toISOString()
  });
});

// 健康检查端点（用于 pm2 监控）
app.get('/health', (req, res) => {
  res.status(200).json({
    status: 'ok',
    timestamp: new Date().toISOString()
  });
});

// 404 处理
app.use((req, res) => {
  res.status(404).json({
    success: false,
    message: '接口不存在'
  });
});

// 错误处理中间件
app.use((err, req, res, next) => {
  console.error('服务器错误:', err);
  res.status(500).json({
    success: false,
    message: '服务器内部错误',
    error: process.env.NODE_ENV === 'development' ? err.message : undefined
  });
});

// 启动服务器
const server = app.listen(PORT, HOST, () => {
  console.log(`✅ 服务器运行在 http://${HOST}:${PORT}`);
  console.log(`📝 环境: ${process.env.NODE_ENV || 'development'}`);
  console.log(`🔗 CORS 源: ${process.env.CLIENT_ORIGIN || 'http://localhost:5173'}`);
});

// 优雅关闭
process.on('SIGTERM', () => {
  console.log('SIGTERM 信号已接收，开始优雅关闭...');
  server.close(() => {
    console.log('服务器已关闭');
    process.exit(0);
  });
});

process.on('SIGINT', () => {
  console.log('SIGINT 信号已接收，开始优雅关闭...');
  server.close(() => {
    console.log('服务器已关闭');
    process.exit(0);
  });
});

// 未捕获的异常处理
process.on('uncaughtException', (err) => {
  console.error('未捕获的异常:', err);
  process.exit(1);
});

process.on('unhandledRejection', (reason, promise) => {
  console.error('未处理的 Promise 拒绝:', reason);
  process.exit(1);
});

