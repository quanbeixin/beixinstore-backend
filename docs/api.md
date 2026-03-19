# 管理后台 · API 接口文档

## 基本信息

| 项目 | 说明 |
|------|------|
| **Base URL** | `http://localhost:3000` |
| **版本** | v1.0.0 |
| **认证方式** | Bearer Token (JWT) |
| **Token 有效期** | 24 小时 |
| **字符编码** | UTF-8 |
| **响应格式** | JSON |

### 认证说明

需要认证的接口，请在请求头中携带：

```http
Authorization: Bearer <your_token>
```

Token 可通过 `/api/auth/login` 接口获取。

---

## 目录

| 模块 | 接口 | 方法 | 需要认证 |
|------|------|------|:--------:|
| 系统 | [`/api/ping`](#get-apiping) | GET | — |
| 认证 | [`/api/auth/register`](#post-apiauthregister) | POST | — |
| 认证 | [`/api/auth/login`](#post-apiauthlogin) | POST | — |
| 认证 | [`/api/auth/profile`](#get-apiauthprofile) | GET | ✅ |
| 用户 | [`/api/users`](#get-apiusers) | GET | ✅ |
| 用户 | [`/api/users/:id`](#get-apiusersid) | GET | ✅ |
| 用户 | [`/api/users`](#post-apiusers) | POST | ✅ |
| 用户 | [`/api/users/:id`](#put-apiusersid) | PUT | ✅ |
| 用户 | [`/api/users/:id`](#delete-apiusersid) | DELETE | ✅ |

---

## 通用响应格式

所有接口均返回统一的 JSON 结构：

```json
{
  "success": true | false,
  "message": "说明信息（可选）",
  "data": { ... }
}
```

---

## 系统

### GET `/api/ping`

> 健康检查，无需认证

```http
GET /api/ping
```

✅ **响应 200**

```json
{
  "message": "pong"
}
```

---

## 认证

### POST `/api/auth/register`

> 用户注册

```http
POST /api/auth/register
Content-Type: application/json
```

**请求体**

```json
{
  "username": "admin",
  "password": "123456",
  "email": "admin@example.com",
  "department_id": 1
}
```

| 字段 | 类型 | 必填 | 说明 |
|------|------|:----:|------|
| `username` | string | ✅ | 用户名，全局唯一 |
| `password` | string | ✅ | 密码，服务端 bcrypt 加密存储 |
| `email` | string | — | 邮箱地址 |
| `department_id` | number | — | 所属部门 ID |

✅ **响应 201**

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

❌ **响应 409** — 用户名已存在

```json
{
  "success": false,
  "message": "用户名已存在"
}
```

---

### POST `/api/auth/login`

> 用户登录，返回 JWT Token

```http
POST /api/auth/login
Content-Type: application/json
```

**请求体**

```json
{
  "username": "admin",
  "password": "123456"
}
```

✅ **响应 200**

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

❌ **响应 401** — 用户名或密码错误

```json
{
  "success": false,
  "message": "用户名或密码错误"
}
```

---

### GET `/api/auth/profile`

> 获取当前登录用户信息，需要认证

```http
GET /api/auth/profile
Authorization: Bearer <token>
```

✅ **响应 200**

```json
{
  "success": true,
  "data": {
    "id": 1,
    "username": "admin",
    "email": "admin@example.com",
    "department_id": 1,
    "department_name": "技术部",
    "role_ids": "1,2",
    "role_names": "超级管理员,运营",
    "created_at": "2024-01-01T00:00:00.000Z"
  }
}
```

---

## 用户管理

> 以下所有接口均需要 JWT 认证

### GET `/api/users`

> 获取用户列表，支持分页和关键词搜索

```http
GET /api/users?page=1&pageSize=10&keyword=admin
Authorization: Bearer <token>
```

**Query 参数**

| 参数 | 类型 | 默认值 | 说明 |
|------|------|:------:|------|
| `page` | number | `1` | 页码 |
| `pageSize` | number | `10` | 每页条数 |
| `keyword` | string | — | 搜索用户名或邮箱 |

✅ **响应 200**

```json
{
  "success": true,
  "data": {
    "list": [
      {
        "id": 1,
        "username": "admin",
        "email": "admin@example.com",
        "department_id": 1,
        "department_name": "技术部",
        "role_names": "超级管理员",
        "created_at": "2024-01-01T00:00:00.000Z"
      }
    ],
    "total": 1,
    "page": 1,
    "pageSize": 10
  }
}
```

---

### GET `/api/users/:id`

> 获取单个用户详细信息，含角色和部门

```http
GET /api/users/1
Authorization: Bearer <token>
```

✅ **响应 200**

```json
{
  "success": true,
  "data": {
    "id": 1,
    "username": "admin",
    "email": "admin@example.com",
    "department_id": 1,
    "department_name": "技术部",
    "role_ids": "1",
    "role_names": "超级管理员",
    "created_at": "2024-01-01T00:00:00.000Z"
  }
}
```

❌ **响应 404**

```json
{ "success": false, "message": "用户不存在" }
```

---

### POST `/api/users`

> 创建新用户

```http
POST /api/users
Authorization: Bearer <token>
Content-Type: application/json
```

**请求体**

```json
{
  "username": "newuser",
  "password": "123456",
  "email": "user@example.com",
  "department_id": 2,
  "role_ids": [2, 3]
}
```

| 字段 | 类型 | 必填 | 说明 |
|------|------|:----:|------|
| `username` | string | ✅ | 用户名，唯一 |
| `password` | string | ✅ | 密码 |
| `email` | string | — | 邮箱 |
| `department_id` | number | — | 部门 ID |
| `role_ids` | number[] | — | 角色 ID 数组 |

✅ **响应 201**

```json
{
  "success": true,
  "message": "创建成功",
  "data": {
    "id": 2,
    "username": "newuser",
    "email": "user@example.com",
    "department_name": "运营部",
    "role_names": "编辑,审核员",
    "created_at": "2024-03-18T00:00:00.000Z"
  }
}
```

---

### PUT `/api/users/:id`

> 更新用户信息（邮箱、部门、角色）

```http
PUT /api/users/1
Authorization: Bearer <token>
Content-Type: application/json
```

**请求体**

```json
{
  "email": "new@example.com",
  "department_id": 2,
  "role_ids": [1, 3]
}
```

| 字段 | 类型 | 必填 | 说明 |
|------|------|:----:|------|
| `email` | string | — | 新邮箱 |
| `department_id` | number | — | 新部门 ID |
| `role_ids` | number[] | — | 角色 ID 数组，全量替换 |

✅ **响应 200**

```json
{
  "success": true,
  "message": "更新成功",
  "data": { "...用户最新信息" }
}
```

---

### DELETE `/api/users/:id`

> 删除用户，同时清除角色关联。不能删除当前登录用户自身。

```http
DELETE /api/users/1
Authorization: Bearer <token>
```

✅ **响应 200**

```json
{ "success": true, "message": "删除成功" }
```

❌ **响应 400** — 不能删除自己

```json
{ "success": false, "message": "不能删除当前登录用户" }
```

---

## 错误码

| 状态码 | 含义 |
|:------:|------|
| `200` | 请求成功 |
| `201` | 创建成功 |
| `400` | 请求参数错误 |
| `401` | 未认证 / Token 无效或过期 |
| `403` | 权限不足 |
| `404` | 资源不存在 |
| `409` | 资源冲突（如用户名重复） |
| `500` | 服务器内部错误 |

### 通用错误响应示例

```json
{
  "success": false,
  "message": "具体错误描述"
}
```
