---
name: yida-get-schema
description: 宜搭表单 Schema 获取技能，通过调用 getFormSchema 接口获取指定表单的完整 Schema 结构，用于分析字段定义、组件配置、确认字段 ID（fieldId）等。
---

# 宜搭表单 Schema 获取技能

## 概述

本技能描述如何通过 `getFormSchema` 接口获取宜搭表单的完整 Schema 结构。获取到的 Schema 可用于分析字段定义、组件配置、学习表单结构等场景，也可用于在编码时确认字段 ID（fieldId）。

## 使用方式

```bash
node .claude/skills/get-schema/scripts/get-schema.js <appType> <formUuid>
```

**参数说明**：

| 参数 | 必填 | 说明 |
| --- | --- | --- |
| `appType` | 是 | 应用 ID，如 `APP_XXX` |
| `formUuid` | 是 | 表单 UUID，如 `FORM-XXX` |

**示例**：

```bash
node .claude/skills/get-schema/scripts/get-schema.js "APP_XXX" "FORM-XXX"
```

**输出**：日志输出到 stderr，Schema JSON 输出到 stdout。

## 前置依赖

- Node.js
- 项目根目录存在 `.cache/cookies.json`（首次运行会自动触发扫码登录）

## 调用流程

1. 读取项目根目录的 `.cache/cookies.json` 获取登录态；若不存在则自动调用 `login.py` 触发扫码登录
2. 调用 `getFormSchema` 接口获取表单 Schema；若接口返回 302 登录重定向，自动重新登录后重试（最多一次）
3. 将 Schema 输出到 stdout

## 文件结构

```
get-schema/
├── SKILL.md                      # 本文档
├── getFormSchema.ts              # 接口类型定义参考
└── scripts/
    └── get-schema.js             # Schema 获取脚本
```

## 接口说明

### getFormSchema（获取表单 Schema）

- **地址**：`GET /alibaba/web/{appType}/_view/query/formdesign/getFormSchema.json`
- **参数**：

| 参数 | 类型 | 必填 | 说明 |
| --- | --- | --- | --- |
| `formUuid` | String | 是 | 表单 UUID |
| `schemaVersion` | String | 否 | Schema 版本，默认 `V5` |

- **返回值**：
完整的表单 Schema JSON，包含 `pages` 数组，结构与 `saveFormSchema` 保存的格式一致。各字段的 `fieldId`（如 `textField_xxxxxxxx`）可从 Schema 中读取。

## 与其他技能配合

- **获取已有表单 Schema** → 本技能，用于确认字段 ID 或学习字段结构
- **创建表单页面** → 使用 `yida-create-form-page` 技能
- **部署页面代码** → 使用 `yida-publish` 技能
