---
name: yida-page-config
description: 宜搭页面配置技能，提供页面公开访问和组织内分享的 URL 验证与配置保存功能。包括公开访问（/o/xxx）和组织内分享（/s/xxx）两种模式。
license: MIT
compatibility:
  - opencode
  - claude-code
metadata:
  audience: developers
  workflow: yida-development
  version: 1.0.0
  tags:
    - yida
    - low-code
    - page-config
    - public-url
    - share-url
---

# 宜搭页面配置技能

## 概述

本技能提供宜搭页面的公开访问和组织内分享配置功能：

| 功能 | 说明 |
|------|------|
| **URL 验证** | 验证公开访问/分享 URL 是否可用（是否被占用） |
| **配置保存** | 保存页面的公开访问/分享配置 |

支持的 URL 类型：

| 类型 | 前缀 | 示例 | 访问范围 |
|------|------|------|----------|
| 公开访问 | `/o/` | `/o/myapp` | 任何人可访问 |
| 组织内分享 | `/s/` | `/s/myapp` | 仅组织内成员 |

## 何时使用

当以下场景发生时使用此技能：
- 用户需要设置页面的公开访问功能
- 用户需要设置页面的组织内分享功能
- 在配置公开访问/分享之前需要检查 URL 是否被占用
- 需要修改或关闭已有页面的分享配置

## URL 格式要求

- 公开访问：`/o/xxx`，如 `/o/myapp`
- 组织内分享：`/s/xxx`，如 `/s/myapp`
- 只支持 a-z A-Z 0-9 _ -
- 路径部分是唯一的，不能与已有页面冲突

## 使用示例

### 示例 1：验证公开访问 URL
```bash
node .claude/skills/yida-page-config/scripts/verify-short-url.js APP_XXX FORM-XXX /o/myapp
```

### 示例 2：开启公开访问
```bash
node .claude/skills/yida-page-config/scripts/save-share-config.js APP_XXX FORM-XXX /o/myapp y n
```

### 示例 3：关闭公开访问
```bash
node .claude/skills/yida-page-config/scripts/save-share-config.js APP_XXX FORM-XXX "" n
```

### 示例 4：查询页面配置
```bash
node .claude/skills/yida-page-config/scripts/get-page-config.js APP_XXX FORM-XXX
```

### 示例 5：隐藏顶部导航
```bash
node .claude/skills/yida-page-config/scripts/update-form-config.js APP_XXX FORM-XXX false "页面标题"
```

## 工具说明

### 1. verify-short-url - URL 验证

验证短链接 URL 是否已被占用。

```bash
node .claude/skills/yida-page-config/scripts/verify-short-url.js <appType> <formUuid> <url>
```

**参数**：

| 参数 | 必填 | 说明 |
| --- | --- | --- |
| `appType` | 是 | 应用 ID，如 `APP_XXX` |
| `formUuid` | 是 | 表单 UUID，如 `FORM-XXX` |
| `url` | 是 | 短链接路径，`/o/xxx` 或 `/s/xxx` |

**输出**：

```json
{
  "available": true,
  "url": "/o/myapp",
  "urlType": "open",
  "message": "该公开访问路径可用"
}
```

### 2. save-share-config - 配置保存

保存页面的公开访问或组织内分享配置。

```bash
node .claude/skills/yida-page-config/scripts/save-share-config.js <appType> <formUuid> <url> <isOpen> [openAuth]
```

**参数**：

| 参数 | 必填 | 说明 |
| --- | --- | --- |
| `appType` | 是 | 应用 ID |
| `formUuid` | 是 | 表单 UUID |
| `url` | 是 | 短链接路径，关闭时传空字符串 `""` |
| `isOpen` | 是 | 是否开放，`y` 开启，`n` 关闭 |
| `openAuth` | 否 | 是否需要授权，`y` 需要，`n` 不需要，默认 `n` |

**输出**：

```json
{
  "success": true,
  "url": "/o/myapp",
  "isOpen": true,
  "message": "公开访问配置已保存"
}
```

### 3. get-page-config - 查询页面配置

查询页面的公开访问/分享配置。

```bash
node .claude/skills/yida-page-config/scripts/get-page-config.js <appType> <formUuid>
```

**输出**：

```json
{
  "isOpen": true,
  "openUrl": "/o/myapp",
  "shareUrl": "/s/myapp"
}
```

### 4. update-form-config - 表单配置更新

更新表单的基本配置，如显示/隐藏顶部导航。

```bash
node .claude/skills/yida-page-config/scripts/update-form-config.js <appType> <formUuid> <isRenderNav> <title>
```

**参数**：

| 参数 | 必填 | 说明 |
| --- | --- | --- |
| `appType` | 是 | 应用 ID |
| `formUuid` | 是 | 表单 UUID |
| `isRenderNav` | 是 | `true` 显示顶部导航，`false` 隐藏顶部导航 |
| `title` | 是 | 页面标题 |

**输出**：

```json
{
  "success": true,
  "isRenderNav": false,
  "message": "已隐藏顶部导航"
}
```

## 前置依赖

- Node.js
- 项目根目录存在 `.cache/cookies.json`（首次运行会自动触发扫码登录）

## 调用流程

1. 读取项目根目录的 `.cache/cookies.json` 获取登录态；若不存在则自动触发扫码登录
2. 验证 URL 格式
3. 调用对应接口进行验证或保存
4. 返回操作结果

## 文件结构

```
yida-page-config/
├── SKILL.md                      # 本文档
└── scripts/
    ├── verify-short-url.js        # URL 验证脚本
    ├── save-share-config.js       # 公开访问/分享配置保存脚本
    ├── get-page-config.js         # 查询页面配置脚本
    └── update-form-config.js      # 表单配置更新脚本（如隐藏导航）
```

## 接口说明

### verifyShortUrl（验证短链接 URL）

- **地址**：`GET /dingtalk/web/{appType}/query/formdesign/verifyShortUrl.json`
- **参数**：

| 参数 | 类型 | 必填 | 说明 |
| --- | --- | --- | --- |
| `_api` | String | 是 | `App.verifyShortUrlForm` |
| `openUrl` | String | 否 | 公开访问路径 `/o/xxx` |
| `shareUrl` | String | 否 | 组织内分享路径 `/s/xxx` |
| `formUuid` | String | 是 | 表单 UUID |
| `_csrf_token` | String | 是 | CSRF Token |

- **返回值**：`content: true` 可用，`content: false` 被占用

### saveShareConfig（保存分享配置）

- **地址**：`POST /dingtalk/web/{appType}/query/formdesign/saveShareConfig.json`
- **参数**：

| 参数 | 类型 | 必填 | 说明 |
| --- | --- | --- | --- |
| `_api` | String | 是 | `Share.saveShareConfig` |
| `formUuid` | String | 是 | 表单 UUID |
| `openUrl` | String | 是 | 短链接路径 |
| `isOpen` | String | 是 | `y` 开启，`n` 关闭 |
| `openPageAuthConfig` | String | 否 | 权限配置 JSON |
| `_csrf_token` | String | 是 | CSRF Token |

- **返回值**：`success: true` 表示成功

## 与其他技能配合

- **页面开发** → 使用 `yida-custom-page` 技能
- **页面发布** → 使用 `yida-publish-page` 技能
- **获取表单 Schema** → 使用 `yida-get-schema` 技能
