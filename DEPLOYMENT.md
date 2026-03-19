# 云服务器部署指南

## 前置要求
- Node.js 14+
- npm 或 yarn
- pm2 全局安装：`npm install -g pm2`

## 部署步骤

### 1. 上传代码到服务器
```bash
# 使用 scp 或 git clone
git clone <your-repo-url> /path/to/admin-backend
cd /path/to/admin-backend/backend
```

### 2. 安装依赖
```bash
npm install
```

### 3. 配置环境变量
```bash
# 复制生产环境配置
cp .env.production .env

# 编辑 .env 文件，填入实际的数据库和 JWT 密钥
nano .env
```

### 4. 启动应用（使用 pm2）

**方式一：使用配置文件启动**
```bash
pm2 start ecosystem.config.js --env production
```

**方式二：使用 npm 脚本启动**
```bash
npm run pm2:start
```

### 5. 常用 pm2 命令

```bash
# 查看应用状态
pm2 status

# 查看实时日志
pm2 logs admin-backend

# 监控应用
pm2 monit

# 重启应用
pm2 restart admin-backend

# 停止应用
pm2 stop admin-backend

# 删除应用
pm2 delete admin-backend

# 保存 pm2 进程列表（开机自启）
pm2 save
pm2 startup
```

### 6. 开机自启设置
```bash
# 生成开机自启脚本
pm2 startup

# 保存当前进程列表
pm2 save

# 验证开机自启
pm2 show admin-backend
```

### 7. 日志管理
```bash
# 查看日志文件位置
ls -la logs/

# 实时查看日志
tail -f logs/out.log

# 查看错误日志
tail -f logs/error.log

# 清空日志
pm2 flush
```

### 8. 健康检查
```bash
# 测试 API 是否正常运行
curl http://your-server-ip:3000/health

# 应该返回
# {"status":"ok","timestamp":"2024-01-01T12:00:00.000Z"}
```

### 9. 更新应用
```bash
# 拉取最新代码
git pull

# 重新安装依赖（如果有新依赖）
npm install

# 重启应用
pm2 restart admin-backend
```

### 10. 故障排查

**应用无法启动**
```bash
# 查看详细错误日志
pm2 logs admin-backend --err

# 检查端口是否被占用
lsof -i :3000
```

**数据库连接失败**
- 检查 .env 中的数据库配置
- 确保数据库服务正在运行
- 检查防火墙规则

**内存占用过高**
- 检查 ecosystem.config.js 中的 max_memory_restart 设置
- pm2 会自动重启超过限制的进程

## 监控和告警

pm2 支持集成监控服务：
```bash
# 连接到 pm2 Plus（可选）
pm2 link <secret_key> <public_key>
```

## 备份和恢复

```bash
# 备份 pm2 进程列表
pm2 save

# 恢复进程列表
pm2 resurrect
```
