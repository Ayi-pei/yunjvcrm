import express from 'express';
import cors from 'cors';
import helmet from 'helmet';
import compression from 'compression';
import morgan from 'morgan';
import { createServer } from 'http';
import { Server } from 'socket.io';
import dotenv from 'dotenv';
import { fileURLToPath } from 'url';
import { dirname, join } from 'path';

// 路由导入
import authRoutes from './routes/auth.js';
import keyRoutes from './routes/keys.js';
import agentRoutes from './routes/agents.js';
import chatRoutes from './routes/chat.js';
import uploadRoutes from './routes/upload.js';
import adminRoutes from './routes/admin.js';

// 中间件导入
import { errorHandler } from './middleware/errorHandler.js';
import { rateLimiter } from './middleware/rateLimiter.js';
import { authMiddleware } from './middleware/auth.js';

// Socket处理器
import { setupSocketHandlers } from './socket/handlers.js';

const __filename = fileURLToPath(import.meta.url);
const __dirname = dirname(__filename);

// 加载环境变量
dotenv.config();

const app = express();
const server = createServer(app);
const io = new Server(server, {
  cors: {
    origin: process.env.SOCKET_CORS_ORIGIN || "http://localhost:5173",
    methods: ["GET", "POST"]
  }
});

const PORT = process.env.PORT || 3001;

// 基础中间件
app.use(helmet());
app.use(compression());
app.use(morgan('combined'));
app.use(cors({
  origin: process.env.SOCKET_CORS_ORIGIN || "http://localhost:5173",
  credentials: true
}));
app.use(express.json({ limit: '10mb' }));
app.use(express.urlencoded({ extended: true, limit: '10mb' }));

// 速率限制
app.use(rateLimiter);

// 静态文件服务
app.use('/uploads', express.static(join(__dirname, 'uploads')));

// API路由
app.use('/api/auth', authRoutes);
app.use('/api/keys', authMiddleware, keyRoutes);
app.use('/api/agents', authMiddleware, agentRoutes);
app.use('/api/chat', authMiddleware, chatRoutes);
app.use('/api/upload', authMiddleware, uploadRoutes);
app.use('/api/admin', authMiddleware, adminRoutes);

// 健康检查
app.get('/health', (req, res) => {
  res.json({
    status: 'ok',
    timestamp: new Date().toISOString(),
    uptime: process.uptime(),
    environment: process.env.NODE_ENV
  });
});

// Socket.io处理
setupSocketHandlers(io);

// 错误处理中间件
app.use(errorHandler);

// 404处理
app.use('*', (req, res) => {
  res.status(404).json({
    error: 'Not Found',
    message: `Route ${req.originalUrl} not found`
  });
});

// 启动服务器
server.listen(PORT, () => {
  console.log(`🚀 云聚CRM服务器启动成功`);
  console.log(`📍 端口: ${PORT}`);
  console.log(`🌍 环境: ${process.env.NODE_ENV}`);
  console.log(`🔗 API地址: http://localhost:${PORT}/api`);
  console.log(`⚡ Socket.io: http://localhost:${PORT}`);
});

// 优雅关闭
process.on('SIGTERM', () => {
  console.log('收到SIGTERM信号，正在关闭服务器...');
  server.close(() => {
    console.log('服务器已关闭');
    process.exit(0);
  });
});

process.on('SIGINT', () => {
  console.log('收到SIGINT信号，正在关闭服务器...');
  server.close(() => {
    console.log('服务器已关闭');
    process.exit(0);
  });
});

export default app;