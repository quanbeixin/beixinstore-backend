# 谷歌支付证书内容写入接口文档

## 1. 接口说明

该接口用于外部运维系统向矩阵包写入「谷歌支付证书内容」。

系统会根据传入的域名匹配矩阵包，并根据 `env` 写入对应环境的运维补充字段。

## 2. 基本信息

| 项目 | 说明 |
|------|------|
| 请求方式 | `POST` |
| 接口路径 | `/api/open/matrix-packages/google-pay-certificate-content` |
| 认证方式 | 固定 token |
| 请求格式 | `application/json` |
| 响应格式 | `application/json` |
| 字符编码 | `UTF-8` |

生产环境地址：

```text
http://39.97.253.194/api/open/matrix-packages/google-pay-certificate-content
```

## 3. 鉴权方式

该接口复用矩阵包开放接口 token：

```env
MATRIX_PACKAGE_OPEN_API_TOKEN=fecb0ad62082abd324dffdec5609af4208504df30ee44d19e9ce1622fba35177
```

支持两种传 token 的方式，推荐使用请求头。

### 方式一：请求头

```http
x-open-api-token: fecb0ad62082abd324dffdec5609af4208504df30ee44d19e9ce1622fba35177
```

### 方式二：请求体

```json
{
  "token": "fecb0ad62082abd324dffdec5609af4208504df30ee44d19e9ce1622fba35177"
}
```

## 4. 请求参数

| 参数 | 类型 | 必填 | 说明 |
|------|------|:----:|------|
| `token` | string | 条件必填 | 固定访问 token。使用 `x-open-api-token` 请求头时可不传 |
| `domain` | string | 是 | 域名，用于匹配矩阵包 |
| `env` | string | 是 | 环境标识，仅支持 `prod` / `test` |
| `content` | string | 是 | 谷歌支付证书内容 |

兼容字段：

- `content`
- `Content`
- `CONTENT`

## 5. 字段映射

| `env` | 写入位置 | 字段名 |
|------|----------|--------|
| `prod` | 运维补充 - 生产环境信息 | `prodGooglePayCertificateContent` |
| `test` | 运维补充 - 测试环境信息 | `testGooglePayCertificateContent` |

## 6. 域名匹配规则

接口会对传入的 `domain` 和矩阵包里的 `domain_info` 做标准化匹配：

- 去掉 `http://` / `https://`
- 去掉路径、查询参数、hash
- 转为小写
- 去掉首尾点号
- `domain_info` 支持逗号、中文逗号、分号、中文分号、空格、换行分隔多个域名

示例：

| 传入 domain | 可匹配 domain_info |
|-------------|--------------------|
| `storylume.com` | `storylume.com` |
| `https://storylume.com/path?a=1` | `storylume.com` |
| `storylume.com` | `storylume.com, other.com` |

如果同一个域名匹配到多个矩阵包，接口会返回 `409`，需要先校准矩阵包域名配置。

## 7. 请求示例

### 使用请求头传 token

```bash
curl -X POST "http://39.97.253.194/api/open/matrix-packages/google-pay-certificate-content" \
  -H "Content-Type: application/json" \
  -H "x-open-api-token: fecb0ad62082abd324dffdec5609af4208504df30ee44d19e9ce1622fba35177" \
  -d '{
    "domain": "storylume.com",
    "env": "prod",
    "content": "certificate content"
  }'
```

### 使用请求体传 token

```bash
curl -X POST "http://39.97.253.194/api/open/matrix-packages/google-pay-certificate-content" \
  -H "Content-Type: application/json" \
  -d '{
    "token": "fecb0ad62082abd324dffdec5609af4208504df30ee44d19e9ce1622fba35177",
    "domain": "storylume.com",
    "env": "test",
    "content": "certificate content"
  }'
```

## 8. 成功响应

```json
{
  "success": true,
  "message": "保存成功",
  "data": {
    "package_id": 123,
    "package_name": "Storylume",
    "domain": "storylume.com",
    "env": "prod",
    "field": "prodGooglePayCertificateContent",
    "updated_at": "2026-07-23 12:00:00"
  }
}
```

## 9. 错误响应

### token 未配置

HTTP 状态码：`503`

```json
{
  "success": false,
  "message": "开放接口 token 未配置"
}
```

### token 无效

HTTP 状态码：`401`

```json
{
  "success": false,
  "message": "token 无效"
}
```

### domain 为空

HTTP 状态码：`400`

```json
{
  "success": false,
  "message": "domain 不能为空"
}
```

### env 不合法

HTTP 状态码：`400`

```json
{
  "success": false,
  "message": "env 仅支持 prod / test"
}
```

### content 为空

HTTP 状态码：`400`

```json
{
  "success": false,
  "message": "content 不能为空"
}
```

### 未找到矩阵包

HTTP 状态码：`404`

```json
{
  "success": false,
  "message": "未找到匹配域名的矩阵包"
}
```

### 域名匹配到多个矩阵包

HTTP 状态码：`409`

```json
{
  "success": false,
  "message": "域名匹配到多个矩阵包，请检查域名配置",
  "data": [
    {
      "package_id": 123,
      "package_name": "Storylume",
      "domain_info": "storylume.com"
    }
  ]
}
```

## 10. 注意事项

- 该接口只覆盖对应环境的谷歌支付证书内容，不会清空运维补充里的其他字段。
- 请求日志不会输出证书内容，只记录内容长度。
- 建议使用 `x-open-api-token` 请求头传 token，避免 token 出现在 URL 或日志中。
- 单次 `content` 建议控制在 500000 字符以内。
