---
name: yida-publish-page
description: 宜搭自定义页面发布技能，将 JSX 源码经 Babel 编译、UglifyJS 压缩后构建 Schema，并通过 saveFormSchema 接口部署到宜搭平台。
---

# 宜搭页面发布技能

## 概述

本技能提供宜搭自定义页面的完整发布流程：源码编译 → Schema 构建 → 读取登录态（按需触发登录）→ 接口发布。

## 使用方式

```bash
cd .claude/skills/yida-publish/scripts
npm install  # 首次需要安装依赖
node publish.js <appType> <formUuid> <源文件路径>
```

**参数说明**：

| 参数 | 说明 | 示例 |
| --- | --- | --- |
| `appType` | 应用 ID | `APP_E0MZ4VB75ZMB1BIGNVT4` |
| `formUuid` | 自定义页面 ID | `FORM-XXX` |
| `源文件路径` | 源码文件路径（相对于项目根目录） | `pages/src/xxx.js` |

> `baseUrl` 无需手动传入，脚本会自动从 `.cache/cookies.json` 读取登录态（若不存在或接口返回 302，则自动触发扫码登录），并从中读取 `base_url`。

**示例**：

```bash
node publish.js APP_XXX FORM-XXXXXX pages/src/xxx.js
```

## 工作流程

1. **编译源码**：通过 `@ali/vu-babel-transform` 将 JSX 转换为 ES5，再通过 UglifyJS 压缩
2. **构建 Schema**：通过代码动态构建完整的 Schema JSON，将编译后的 `source` 和 `compiled` 填入 `actions.module`
3. **读取登录态**：读取项目根目录的 `.cache/cookies.json`；若不存在则自动调用 `login.py` 触发扫码登录
4. **发布 Schema**：通过 HTTP POST 调用 `saveFormSchema` 接口保存 Schema；若接口返回 302 登录重定向，自动重新登录后重试（最多一次）
5. **更新表单配置**：调用 `updateFormConfig` 接口，设置 `MINI_RESOURCE` 配置为 `8`；若接口返回 302 登录重定向，自动重新登录后重试（最多一次）

> **注意**：发布目标地址由 `.cache/cookies.json` 中保存的 `base_url` 决定（即登录后浏览器实际跳转到的域名），而非 `config.json` 中的 `loginUrl`。详见 `yida-login` 技能文档。
> **注意**：当发布页面碰到组织 corpId 不匹配 或  "您当前未在「xxx」组织内" 时，可以询问是否创建新的应用发布。

## 前置依赖

- Node.js 16+
- Python 3.12+（用于调用 yida-login）
- playwright（Python 版，yida-login 依赖）

```bash
cd .claude/skills/yida-publish/scripts && npm install
```

## 文件结构

```
yida-publish/
├── SKILL.md            # 本文档
└── scripts/
    ├── publish.js      # 发布主脚本（Node.js，内含 Schema 动态构建逻辑）
    ├── package.json    # Node.js 依赖声明
    └── node_modules/   # 依赖包（npm install 后生成）
```

## 接口说明

### saveFormSchema

- **地址**：`POST /alibaba/web/{appType}/_view/query/formdesign/saveFormSchema.json`
- **Content-Type**：`application/x-www-form-urlencoded`
- **参数**：

| 参数 | 值 |
| --- | --- |
| `_csrf_token` | 从 yida-login 获取 |
| `prefix` | `_view` |
| `content` | Schema JSON 字符串 |
| `formUuid` | 自定义页面 ID |
| `schemaVersion` | `V5` |
| `domainCode` | `tEXDRG` |
| `importSchema` | `true` |

- **返回值**：

```json
{
  "success": true,
  "content": {
    "formUuid": "FORM-XXX",
    "version": 0
  }
}
```

### updateFormConfig

- **地址**：`POST /dingtalk/web/{appType}/query/formdesign/updateFormConfig.json`
- **Content-Type**：`application/x-www-form-urlencoded`
- **参数**：

| 参数 | 值 |
| --- | --- |
| `_csrf_token` | 从 yida-login 获取 |
| `formUuid` | 自定义页面 ID（从 saveFormSchema 返回值获取） |
| `version` | 版本号（从 saveFormSchema 返回值获取，从 0 开始递增） |
| `configType` | 固定 `MINI_RESOURCE` |
| `value` | 固定 `8`（自定义页面配置值） |

- **返回值**：

```json
{
  "success": true,
  "traceId": null,
  "throwable": null,
  "errorCode": null,
  "content": null,
  "errorMsg": null
}
```

## 与其他技能配合

- **`yida-login`**：登录态失效时自动调用（Cookie 持久化，首次或 302 时需扫码）
- **`yida`**：编写源码后调用本技能发布
- **`yida-app`**：完整应用开发流程的最后一步
