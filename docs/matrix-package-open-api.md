# 矩阵包开放查询接口文档

## 1. 接口说明

该接口用于给外部团队查询矩阵包配置数据。接口支持全量查询，也支持按矩阵包名或包 ID 查询单个或部分矩阵包。

接口返回矩阵包下已配置的全部主要信息，包括：

- 矩阵包基础信息
- 开发者账号信息
- 关联项目管理需求信息
- 各侧补充信息
- 前置准备节点信息
- 图片、zip、json 等附件的文件元信息与临时访问 URL

## 2. 基本信息

| 项目 | 说明 |
|------|------|
| 请求方式 | `GET` |
| 接口路径 | `/api/open/matrix-packages` |
| 认证方式 | 固定 token |
| 响应格式 | `application/json` |
| 字符编码 | `UTF-8` |

完整地址示例：

```text
http://localhost:3000/api/open/matrix-packages
```

生产环境请替换为实际域名。

## 3. 服务端配置

后端需要配置固定 token：

```env
MATRIX_PACKAGE_OPEN_API_TOKEN=<your-open-api-token>
MATRIX_PACKAGE_OPEN_API_SIGN_EXPIRE_SECONDS=300
MATRIX_PACKAGE_OPEN_API_CORS_ORIGINS=*
```

| 环境变量 | 必填 | 说明 |
|----------|:----:|------|
| `MATRIX_PACKAGE_OPEN_API_TOKEN` | 是 | 外部接口固定访问 token |
| `MATRIX_PACKAGE_OPEN_API_SIGN_EXPIRE_SECONDS` | 否 | 附件签名 URL 有效期，单位秒，默认 `300` |
| `MATRIX_PACKAGE_OPEN_API_CORS_ORIGINS` | 否 | 开放接口允许跨域访问的来源，多个用英文逗号分隔，默认 `*` |

跨域说明：

- `/api/open/*` 使用独立 CORS 配置，不影响后台管理接口。
- 默认允许任意来源跨域读取开放接口，但不会允许 cookie 凭证。
- 如需限制到固定系统，配置示例：`MATRIX_PACKAGE_OPEN_API_CORS_ORIGINS=https://team-a.example.com,https://team-b.example.com`。

## 4. 鉴权方式

支持两种传 token 的方式，二选一即可。

### 方式一：Query 参数

```http
GET /api/open/matrix-packages?token=<your-open-api-token>
```

### 方式二：请求头

```http
GET /api/open/matrix-packages
x-open-api-token: <your-open-api-token>
```

## 5. 请求参数

| 参数 | 类型 | 必填 | 说明 |
|------|------|:----:|------|
| `token` | string | 条件必填 | 固定访问 token。使用 `x-open-api-token` 请求头时可不传 |
| `package_name` | string | 否 | 矩阵包名，精确匹配 |
| `app_id` | string | 否 | 包 ID（应用 ID），精确匹配 |

查询规则：

- 只传 `token`：返回全部矩阵包。
- 传 `package_name`：按矩阵包名精确查询。
- 传 `app_id`：按包 ID 精确查询。
- 同时传 `package_name` 和 `app_id`：两个条件同时满足才返回。

## 6. 请求示例

### 查询全部矩阵包

```bash
curl "http://localhost:3000/api/open/matrix-packages?token=<your-open-api-token>"
```

### 按矩阵包名查询

```bash
curl "http://localhost:3000/api/open/matrix-packages?token=<your-open-api-token>&package_name=Photora（测试版本）"
```

### 按包 ID 查询

```bash
curl "http://localhost:3000/api/open/matrix-packages?token=<your-open-api-token>&app_id=com.example.app"
```

### 使用请求头传 token

```bash
curl \
  -H "x-open-api-token: <your-open-api-token>" \
  "http://localhost:3000/api/open/matrix-packages?package_name=Photora（测试版本）"
```

## 7. 响应结构

成功响应：

```json
{
  "success": true,
  "data": [
    {
      "package_id": {
        "description": "矩阵包记录ID",
        "value": 4
      },
      "package_name": {
        "description": "矩阵包名",
        "value": "Photora（测试版本）"
      },
      "app_id": {
        "description": "包ID（应用ID）",
        "value": "com.example.app"
      },
      "domain_info": {
        "description": "域名信息",
        "value": "photora.lol"
      },
      "linked_demand": {
        "description": "关联项目管理需求",
        "value": {
          "demand_id": {
            "description": "需求ID",
            "value": "D202607160001"
          },
          "demand_name": {
            "description": "需求名称",
            "value": "【矩阵包生产】Photora（测试版本）"
          }
        }
      },
      "side_notes": {
        "description": "各侧补充信息",
        "value": {}
      },
      "production_nodes": {
        "description": "前置准备",
        "value": []
      }
    }
  ],
  "total": 1
}
```

顶层字段：

| 字段 | 类型 | 说明 |
|------|------|------|
| `success` | boolean | 是否成功 |
| `data` | array | 矩阵包列表 |
| `total` | number | 返回数量 |

业务字段统一格式：

```json
{
  "description": "中文字段说明",
  "value": "字段值"
}
```

## 8. 矩阵包基础字段

| 字段 | description | 说明 |
|------|-------------|------|
| `package_id` | 矩阵包记录ID | 系统内部矩阵包记录 ID |
| `package_name` | 矩阵包名 | 矩阵包名称 |
| `app_id` | 包ID（应用ID） | 应用包 ID |
| `domain_info` | 域名信息 | 矩阵包域名 |
| `new_package_version` | 新包版本 | 新包版本 |
| `status` | 包状态 | 返回 `{ code, name }` |
| `health` | 健康度 | 返回 `{ code, name }` |
| `expected_cold_ready_date` | 统一截止时间 | 信息录入统一截止时间 |
| `owner_name` | 矩阵包负责人 | 矩阵包总负责人 |
| `linked_demand` | 关联项目管理需求 | 自动创建的项目管理需求信息 |
| `developer_account` | 开发者账号 | 开发者账号信息 |
| `side_notes` | 各侧补充信息 | 各侧配置内容 |
| `production_nodes` | 前置准备 | 生产详情页前置准备模块 |
| `created_at` | 创建时间 | 矩阵包创建时间 |
| `updated_at` | 更新时间 | 矩阵包更新时间 |

## 9. 关联需求字段

`linked_demand.value` 结构：

| 字段 | description | 说明 |
|------|-------------|------|
| `demand_id` | 需求ID | 项目管理需求 ID，未关联时为空字符串 |
| `demand_name` | 需求名称 | 项目管理需求名称，未关联时为空字符串 |

## 10. 开发者账号字段

`developer_account.value` 结构：

| 字段 | description | 说明 |
|------|-------------|------|
| `company_name` | 公司主体 | 公司主体中文名称 |
| `company_english_name` | 主体英文名称 | 公司主体英文名称 |
| `account_name` | 开发者账号名称 | 开发者账号名称 |
| `account_id` | 开发者账号ID | 开发者账号平台 ID |
| `status` | 开发者账号状态 | 返回 `{ code, name }` |

## 11. 各侧补充信息

`side_notes.value` 按模块返回：

| 字段 | description | 说明 |
|------|-------------|------|
| `delivery` | PUSH信息补充 | PUSH 生产/测试环境配置 |
| `design` | 设计侧补充 | 设计资源、图片、压缩包等 |
| `operation` | 运营侧补充 | 商店、隐私、说明、送审账号等运营信息 |
| `frontend` | 前端补充 | sha1/sha256 指纹 |
| `backend` | GP初始化配置信息 | GP 初始化相关信息 |
| `devops` | 运维补充 | 谷歌鉴权、Firebase、支付、json 文件等 |
| `requirement` | 需求侧补充 | 兼容历史字段 |
| `development` | 研发侧补充 | 兼容历史字段 |

每个模块除 `description/value` 外，还会返回：

| 字段 | 类型 | 说明 |
|------|------|------|
| `updated_at` | string/null | 该模块最近更新时间 |
| `updated_by_name` | string | 该模块最近更新人 |
| `is_confirmed` | boolean | 该模块是否已确认完成 |

### 11.1 PUSH 信息补充

| 字段 | description |
|------|-------------|
| `prodAppId` | 生产环境个推Push APP ID |
| `prodAppKey` | 生产环境个推PUSH APP KEY |
| `prodAppSecret` | 生产环境个推APPSecret |
| `prodMasterSecret` | 生产环境个推MasterSecret |
| `testAppId` | 测试环境个推Push APP ID |
| `testAppKey` | 测试环境个推PUSH APP KEY |
| `testAppSecret` | 测试环境个推APPSecret |
| `testMasterSecret` | 测试环境个推MasterSecret |

### 11.2 运营侧补充

| 字段 | description |
|------|-------------|
| `appOrigin` | appOrigin |
| `contactEmail` | 联系邮箱 |
| `privacyPolicyUrl` | 隐私政策网址 |
| `termsUrl` | 服务条款网址 |
| `dataDeletionUrl` | 数据删除说明网址 |
| `officialEmail` | 官方邮箱 |
| `materialUrl` | 运营提供物料地址链接 |
| `feedbackSurveyUrl` | 用户反馈问卷地址 |
| `reportSurveyUrl` | 举报问卷地址 |
| `reviewAccount` | 送审账号 |
| `appName` | 应用名称 |
| `shortDescription` | 简短说明 |
| `fullDescription` | 完整说明 |

### 11.3 设计侧补充

| 字段 | description | 类型 |
|------|-------------|------|
| `dynamicWatermarkImage` | 动态水印图 | 附件 |
| `emailLogoImage` | 邮箱 logo 图 | 附件 |
| `dynamicWatermarkBrandImage` | 动态水印结尾品牌图 | 附件 |
| `designPreviewUrl` | 设计稿预览地址 | 文本/链接 |
| `designSliceDeliveryUrl` | 设计资源切图交付 | 附件 |
| `tokenDocUrl` | TOKEN文档 | 附件 |
| `productFiveImagesZipPackage` | 商品5图的压缩包 | 附件 |

### 11.4 前端补充

| 字段 | description | 类型 |
|------|-------------|------|
| `appVersion` | APP版本号 | 文本 |
| `appConsoleUrl` | APP谷歌平台发版地址 | 文本/链接 |
| `googleServiceJsonFile` | google-service.json文件 | 附件 |
| `prodGooglePlatformAppId` | 生产环境Google平台应用ID | 文本 |
| `prodSha1Fingerprint` | 生产环境sha1指纹 | 文本 |
| `prodSha256Fingerprint` | 生产环境sha256指纹 | 文本 |
| `testGooglePlatformAppId` | 测试环境Google平台应用ID | 文本 |
| `testSha1Fingerprint` | 测试环境sha1指纹 | 文本 |
| `testSha256Fingerprint` | 测试环境sha256指纹 | 文本 |

### 11.5 运维补充

| 字段 | description | 类型 |
|------|-------------|------|
| `prodGoogleAuthClientId` | 生产环境谷歌鉴权认证ClientId | 文本 |
| `prodGoogleAuthClientSecret` | 生产环境谷歌鉴权认证ClientSecret | 文本 |
| `prodGooglePayCertificateUrl` | 生产环境谷歌支付证书地址 | 文本/链接 |
| `prodGooglePayPackageName` | 生产环境谷歌支付包名 | 文本 |
| `testGoogleAuthClientId` | 测试环境谷歌鉴权认证ClientId | 文本 |
| `testGoogleAuthClientSecret` | 测试环境谷歌鉴权认证ClientSecret | 文本 |
| `testGooglePayCertificateUrl` | 测试环境谷歌支付证书地址 | 文本/链接 |
| `testGooglePayPackageName` | 测试环境谷歌支付包名 | 文本 |
| `pushFcmFile` | push-fcm文件 | 附件 |

### 11.6 投放侧补充

| 字段 | description | 类型 |
|------|-------------|------|
| `MATRIX_FACEBOOK_INSTALL_DECRYPT_SECRET` | Facebook 投放解析安装来源密钥 | 文本 |
| `facebook_app_id` | android 内 facebook app id 配置 | 文本 |
| `facebook_client_token` | android app 内 facebook 密钥 | 文本 |

## 12. 附件字段格式

图片、zip、json 等上传文件不会直接返回文件内容，而是返回文件信息和临时访问 URL。

附件字段示例：

```json
{
  "description": "google-service.json文件",
  "value": {
    "file_name": "google-service.json",
    "mime_type": "application/json",
    "file_size": 12345,
    "url": "https://example.oss-cn-shanghai.aliyuncs.com/xxx?Expires=...",
    "object_key": "matrix-packages/4/FRONTEND/googleServiceJsonFile/google-service.json",
    "storage_provider": "ALIYUN_OSS",
    "uploaded_at": "2026-07-10T10:00:00.000Z"
  }
}
```

| 字段 | 类型 | 说明 |
|------|------|------|
| `file_name` | string | 文件名 |
| `mime_type` | string | 文件 MIME 类型 |
| `file_size` | number/null | 文件大小，单位字节 |
| `url` | string | 临时访问 URL |
| `object_key` | string | OSS 对象 key |
| `storage_provider` | string | 存储服务商 |
| `uploaded_at` | string/null | 上传时间 |

注意：

- `url` 是临时签名地址，默认有效期 `300` 秒。
- 外部系统如需长期保存文件，请在 URL 有效期内下载并转存。
- 如果附件不存在，字段 `value` 通常为空字符串或附件元信息为空。

## 13. 前置准备字段

`production_nodes.value` 是数组，目前包含：

| 节点编码 | 节点名称 |
|----------|----------|
| `OPERATION_MATERIAL` | 运营物料信息提供 |
| `DESIGN_PRODUCTION` | 前端空包构建上传 |

每个节点结构：

```json
{
  "description": "运营物料信息提供",
  "value": {
    "node_code": {
      "description": "节点编码",
      "value": "OPERATION_MATERIAL"
    },
    "status": {
      "description": "节点状态",
      "value": {
        "code": "COMPLETED",
        "name": "已完成"
      }
    },
    "owner_name": {
      "description": "责任人",
      "value": "张三"
    },
    "expected_delivery_date": {
      "description": "预期交付时间",
      "value": "2026-07-10 18:00:00"
    }
  }
}
```

节点字段：

| 字段 | description | 说明 |
|------|-------------|------|
| `node_code` | 节点编码 | 节点唯一编码 |
| `node_name` | 节点名称 | 节点展示名称 |
| `owner_side` | 负责侧 | 负责团队 |
| `status` | 节点状态 | 返回 `{ code, name }` |
| `block_reason` | 阻塞原因 | 阻塞说明 |
| `owner_name` | 责任人 | 节点责任人 |
| `expected_delivery_date` | 预期交付时间 | 节点预期交付时间 |
| `started_by_name` | 开始操作人 | 标记开始的人 |
| `started_at` | 开始时间 | 标记开始时间 |
| `completed_by_name` | 完成操作人 | 标记完成的人 |
| `completed_at` | 完成时间 | 标记完成时间 |
| `updated_by_name` | 最近更新人 | 最近更新人 |
| `updated_at` | 最近更新时间 | 最近更新时间 |

节点状态：

| code | name |
|------|------|
| `NOT_STARTED` | 未开始 |
| `IN_PROGRESS` | 进行中 |
| `COMPLETED` | 已完成 |
| `BLOCKED` | 阻塞 |

## 14. 错误响应

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

### 服务端错误

HTTP 状态码：`500`

```json
{
  "success": false,
  "message": "获取矩阵包配置失败"
}
```

## 15. 对接建议

- 外部调用方建议优先使用 `x-open-api-token` 请求头传 token，避免 token 出现在日志 URL 中。
- 如果只需要单个矩阵包，优先传 `app_id`，因为包 ID 更稳定。
- 附件 URL 不建议入库长期使用，应下载后自行保存或在每次需要时重新调用接口获取。
- 字段中文含义以 `description` 为准，字段英文 key 保持稳定用于程序读取。
