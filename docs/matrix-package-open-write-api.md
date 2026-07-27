# 矩阵包开放写入接口联调文档

## 基本信息

| 项目 | 内容 |
|------|------|
| 生产环境地址 | `http://39.97.253.194/` |
| 接口前缀 | `/api/open` |
| 认证方式 | 固定 token |
| Token | `fecb0ad62082abd324dffdec5609af4208504df30ee44d19e9ce1622fba35177` |

建议通过请求头传 token：

```http
x-open-api-token: fecb0ad62082abd324dffdec5609af4208504df30ee44d19e9ce1622fba35177
```

也支持在 JSON 请求体中传：

```json
{
  "token": "fecb0ad62082abd324dffdec5609af4208504df30ee44d19e9ce1622fba35177"
}
```

## 矩阵包匹配规则

写入接口通过 `match` 定位矩阵包，至少传一个字段。

推荐优先级：

| 字段 | 说明 |
|------|------|
| `package_id` | 矩阵包记录 ID，最精确 |
| `app_id` | 包ID（应用ID） |
| `domain_info` | 域名，接口会做域名归一化匹配 |
| `package_name` | 矩阵包名 |

示例：

```json
{
  "match": {
    "domain_info": "storylume.com"
  }
}
```

如果匹配到多个矩阵包，接口会返回 `409`，调用方需要补充更精确的匹配条件。

## 接口一：获取文件上传凭证

用于外部团队上传前端补充信息里的文件。该接口只生成 OSS 直传凭证，不接收文件二进制。

### URL

```http
POST http://39.97.253.194/api/open/matrix-packages/upload-policy
```

### 当前支持字段

| section | field | 说明 | 文件类型 |
|---------|-------|------|----------|
| `frontend` | `googleServiceJsonFile` | google-service.json文件 | `.json` |
| `frontend` | `pushFcmFile` | push-fcm文件 | `.json` |

### 请求示例

```bash
curl -X POST "http://39.97.253.194/api/open/matrix-packages/upload-policy" \
  -H "Content-Type: application/json" \
  -H "x-open-api-token: fecb0ad62082abd324dffdec5609af4208504df30ee44d19e9ce1622fba35177" \
  -d '{
    "match": {
      "domain_info": "storylume.com"
    },
    "section": "frontend",
    "field": "googleServiceJsonFile",
    "file_name": "google-services.json",
    "file_size": 12345
  }'
```

### 成功响应

```json
{
  "success": true,
  "message": "上传凭证已生成",
  "data": {
    "package_id": 1,
    "package_name": "Storylume",
    "section": "frontend",
    "field": "googleServiceJsonFile",
    "upload": {
      "provider": "ALIYUN_OSS",
      "bucket_name": "bucket-name",
      "endpoint": "oss-cn-hangzhou.aliyuncs.com",
      "region": "oss-cn-hangzhou",
      "object_key": "beixin-store/matrix-packages/1/frontend/googleServiceJsonFile/PKG_1/xxx-google-services.json",
      "object_url": "https://example.com/beixin-store/matrix-packages/1/frontend/googleServiceJsonFile/PKG_1/xxx-google-services.json",
      "host": "https://bucket-name.oss-cn-hangzhou.aliyuncs.com",
      "expire_at": "2026-07-27T10:00:00.000Z",
      "max_file_size": 52428800,
      "fields": {
        "key": "beixin-store/matrix-packages/1/frontend/googleServiceJsonFile/PKG_1/xxx-google-services.json",
        "policy": "xxx",
        "OSSAccessKeyId": "xxx",
        "Signature": "xxx",
        "success_action_status": "200"
      }
    }
  }
}
```

### OSS 直传示例

拿到上一步响应后，用 `upload.host` 和 `upload.fields` 做 `multipart/form-data` 上传。

```bash
curl -X POST "https://bucket-name.oss-cn-hangzhou.aliyuncs.com" \
  -F "key=beixin-store/matrix-packages/1/frontend/googleServiceJsonFile/PKG_1/xxx-google-services.json" \
  -F "policy=xxx" \
  -F "OSSAccessKeyId=xxx" \
  -F "Signature=xxx" \
  -F "success_action_status=200" \
  -F "file=@./google-services.json;type=application/json"
```

上传成功后，OSS 会返回 HTTP `200`。

## 接口二：写回前端补充信息

文件上传到 OSS 后，需要调用该接口把文件信息写回矩阵包。文本字段也通过该接口写入。

### URL

```http
POST http://39.97.253.194/api/open/matrix-packages/update-fields
```

### 当前支持写入字段

| section | 字段 | 说明 | 类型 |
|---------|------|------|------|
| `frontend` | `appVersion` | APP版本号 | 文本 |
| `frontend` | `appConsoleUrl` | APP谷歌平台发版地址 | 文本 |
| `frontend` | `prodGooglePlatformAppId` | 生产环境Google平台应用ID | 文本 |
| `frontend` | `prodSha1Fingerprint` | 生产环境sha1指纹 | 文本 |
| `frontend` | `prodSha256Fingerprint` | 生产环境sha256指纹 | 文本 |
| `frontend` | `prodReleaseDownloadUrl` | 正式包下载地址 | 文本 |
| `frontend` | `testGooglePlatformAppId` | 测试环境Google平台应用ID | 文本 |
| `frontend` | `testSha1Fingerprint` | 测试环境sha1指纹 | 文本 |
| `frontend` | `testSha256Fingerprint` | 测试环境sha256指纹 | 文本 |
| `frontend` | `testReleaseDownloadUrl` | 测试包下载地址 | 文本 |
| `frontend` | `googleServiceJsonFile` | google-service.json文件 | 文件对象 |
| `frontend` | `pushFcmFile` | push-fcm文件 | 文件对象 |

`prodH5Url` / `testH5Url` 是系统自动生成字段，不开放写入。

### 写入文本字段示例

```bash
curl -X POST "http://39.97.253.194/api/open/matrix-packages/update-fields" \
  -H "Content-Type: application/json" \
  -H "x-open-api-token: fecb0ad62082abd324dffdec5609af4208504df30ee44d19e9ce1622fba35177" \
  -d '{
    "match": {
      "domain_info": "storylume.com"
    },
    "sections": {
      "frontend": {
        "appVersion": "1.0.3",
        "appConsoleUrl": "https://play.google.com/console/...",
        "prodGooglePlatformAppId": "1:xxx:android:xxx",
        "testGooglePlatformAppId": "1:yyy:android:yyy"
      }
    }
  }'
```

### 写回文件字段示例

文件字段的 `object_key` 必须来自“获取文件上传凭证”接口返回值。

```bash
curl -X POST "http://39.97.253.194/api/open/matrix-packages/update-fields" \
  -H "Content-Type: application/json" \
  -H "x-open-api-token: fecb0ad62082abd324dffdec5609af4208504df30ee44d19e9ce1622fba35177" \
  -d '{
    "match": {
      "domain_info": "storylume.com"
    },
    "sections": {
      "frontend": {
        "googleServiceJsonFile": {
          "file_name": "google-services.json",
          "mime_type": "application/json",
          "file_size": 12345,
          "storage_provider": "ALIYUN_OSS",
          "bucket_name": "bucket-name",
          "object_key": "beixin-store/matrix-packages/1/frontend/googleServiceJsonFile/PKG_1/xxx-google-services.json",
          "object_url": "https://example.com/beixin-store/matrix-packages/1/frontend/googleServiceJsonFile/PKG_1/xxx-google-services.json"
        }
      }
    }
  }'
```

### 成功响应

```json
{
  "success": true,
  "message": "保存成功",
  "data": {
    "package_id": 1,
    "package_name": "Storylume",
    "section": "frontend",
    "updated_fields": [
      "googleServiceJsonFile"
    ],
    "updated_at": "2026-07-27 18:30:00"
  }
}
```

## 常见错误

### token 无效

```json
{
  "success": false,
  "message": "token 无效"
}
```

### 未找到矩阵包

```json
{
  "success": false,
  "message": "未找到匹配的矩阵包"
}
```

### 匹配到多个矩阵包

```json
{
  "success": false,
  "message": "匹配到多个矩阵包，请补充更精确的匹配条件",
  "data": [
    {
      "package_id": 1,
      "package_name": "Storylume",
      "app_id": "com.example.app",
      "domain_info": "storylume.com"
    }
  ]
}
```

### 字段不允许写入

```json
{
  "success": false,
  "message": "字段不允许写入：frontend.prodH5Url"
}
```

### 文件不是通过上传凭证生成

```json
{
  "success": false,
  "message": "googleServiceJsonFile 文件未使用本接口生成的上传凭证"
}
```

## 调用建议

- token 优先放在 `x-open-api-token` 请求头，不建议放 URL。
- 文件先调上传凭证接口，再直传 OSS，最后调写回接口。
- 写入接口是合并更新，只会更新传入字段，不会清空其他前端补充字段。
- 写入接口不会自动完成各侧 check，也不会推动矩阵包生产流程。
