# 管理后台 - 后端服务

Node.js + Express + MySQL 后端 API 服务，支持 JWT 认证，配套前端 React 管理后台使用。

---

## 架构文档（必读）

- 全系统整合架构文档：`docs/system-architecture.md`
- 要求：凡是涉及 API、权限、Workflow、数据库结构、前端路由权限变更，必须同步更新该文档。

---

## 技术栈

- Node.js + Express
- MySQL（阿里云 RDS）
- JWT 登录认证
- bcryptjs 密码加密
- dotenv 环境变量管理
- CORS 跨域支持

---

## 项目结构

```
backend/
├── controllers/
│   └── authController.js   # 注册、登录、获取用户信息逻辑
├── middleware/
│   └── auth.js             # JWT 认证中间件
├── models/
│   └── User.js             # 用户数据库操作
├── routes/
│   ├── authRoutes.js       # 认证相关路由
│   └── testRoutes.js       # 测试路由
├── utils/
│   ├── db.js               # MySQL 连接池
│   └── jwt.js              # Token 生成与验证
├── .env                    # 环境变量（不提交 Git）
├── .env.example            # 环境变量模板
├── server.js               # 入口文件
└── package.json
```

---

## 快速开始

### 1. 安装依赖

```bash
cd backend
npm install
```

### 2. 配置环境变量

复制 `.env.example` 为 `.env`，填入真实配置：

```bash
cp .env.example .env
```

编辑 `.env`：

```env
PORT=3000

DB_HOST=your-rds-host.aliyuncs.com
DB_PORT=3306
DB_USER=your_db_user
DB_PASSWORD=your_db_password
DB_NAME=your_db_name

JWT_SECRET=your_super_secret_key
JWT_EXPIRES_IN=7d

CLIENT_ORIGIN=http://localhost:5173
```

### 3. 初始化数据库

在 MySQL 中执行以下建表语句：

```sql
CREATE TABLE users (
  id INT AUTO_INCREMENT PRIMARY KEY,
  username VARCHAR(50) NOT NULL UNIQUE,
  password VARCHAR(255) NOT NULL,
  role ENUM('admin', 'user') DEFAULT 'user',
  created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
);
```

### 4. 启动服务

```bash
# 开发模式（热重载）
npm run dev

# 生产模式
npm start
```

服务启动后访问：`http://localhost:3000`

---

## 接口文档

### 基础说明

- Base URL：`http://localhost:3000`
- 所有接口返回 JSON 格式
- 需要认证的接口，请在请求头中携带 Token：

```
Authorization: Bearer <your_token>
```

---

### 健康检查

#### `GET /api/ping`

测试服务是否正常运行。

**请求示例：**
```bash
curl http://localhost:3000/api/ping
```

**响应：**
```json
{
  "message": "pong"
}
```

---

### 认证接口

#### `POST /api/auth/register` — 用户注册

**请求体：**
```json
{
  "username": "admin",
  "password": "123456",
  "role": "admin"
}
```

| 字段       | 类型   | 必填 | 说明                        |
|------------|--------|------|-----------------------------|
| username   | string | ✅   | 用户名，唯一                |
| password   | string | ✅   | 密码（服务端自动加密存储）  |
| role       | string | ❌   | 角色：`admin` / `user`，默认 `user` |

**成功响应（201）：**
```json
{
  "success": true,
  "message": "注册成功",
  "data": {
    "id": 1,
    "username": "admin"
  }
}
```

**失败响应（409）：**
```json
{
  "success": false,
  "message": "用户名已存在"
}
```

---

#### `POST /api/auth/login` — 用户登录

**请求体：**
```json
{
  "username": "admin",
  "password": "123456"
}
```

| 字段     | 类型   | 必填 | 说明   |
|----------|--------|------|--------|
| username | string | ✅   | 用户名 |
| password | string | ✅   | 密码   |

**成功响应（200）：**
```json
{
  "success": true,
  "message": "登录成功",
  "data": {
    "token": "eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9...",
    "user": {
      "id": 1,
      "username": "admin",
      "role": "admin"
    }
  }
}
```

**失败响应（401）：**
```json
{
  "success": false,
  "message": "用户名或密码错误"
}
```

---

#### `GET /api/auth/profile` — 获取当前用户信息

> 需要携带 Token

**请求头：**
```
Authorization: Bearer <token>
```

**成功响应（200）：**
```json
{
  "success": true,
  "data": {
    "id": 1,
    "username": "admin",
    "role": "admin",
    "created_at": "2024-01-01T00:00:00.000Z"
  }
}
```

**未携带 Token（401）：**
```json
{
  "success": false,
  "message": "未提供认证 Token"
}
```

**Token 无效或过期（401）：**
```json
{
  "success": false,
  "message": "Token 无效或已过期"
}
```

---

## 错误码说明

| HTTP 状态码 | 含义               |
|-------------|--------------------|
| 200         | 请求成功           |
| 201         | 创建成功           |
| 400         | 请求参数错误       |
| 401         | 未认证或 Token 无效 |
| 404         | 接口不存在         |
| 409         | 资源冲突（如用户名重复） |
| 500         | 服务器内部错误     |

---

## 部署到阿里云服务器

```bash
# 1. 上传代码（排除 node_modules 和 .env）
# 2. 在服务器上安装依赖
npm install --production

# 3. 配置 .env 文件

# 4. 使用 PM2 守护进程启动
npm install -g pm2
pm2 start server.js --name admin-backend
pm2 save
pm2 startup
```
