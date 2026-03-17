---
name: yida-get-schema
description: 宜搭表单 Schema 获取技能，通过调用 getFormSchema 接口获取指定表单的完整 Schema 结构，用于分析字段定义、组件配置、确认字段 ID（fieldId）等。
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
    - schema
    - api
---

# 宜搭表单 Schema 获取技能

## 概述

本技能描述如何通过 `getFormSchema` 接口获取宜搭表单的完整 Schema 结构。获取到的 Schema 可用于分析字段定义、组件配置、学习表单结构等场景，也可用于在编码时确认字段 ID（fieldId）。

## 何时使用

当以下场景发生时使用此技能：
- 用户需要查看已有表单的字段结构
- 需要确认表单中各字段的 fieldId
- 在编码前需要了解表单的组件配置
- 需要分析现有表单作为参考

## 使用示例

### 示例 1：获取表单 Schema
**场景**：获取表单的完整 Schema 结构
**命令**：
```bash
yidacli get-schema APP_XXX FORM-XXX
```
**输出**：完整的 Schema JSON，包含 pages、componentsMap 等

## 使用方式

```bash
yidacli get-schema <appType> <formUuid>
```

**参数说明**：

| 参数 | 必填 | 说明 |
| --- | --- | --- |
| `appType` | 是 | 应用 ID，如 `APP_XXX` |
| `formUuid` | 是 | 表单 UUID，如 `FORM-XXX` |

**示例**：

```bash
yidacli get-schema "APP_XXX" "FORM-XXX"
```

**输出**：日志输出到 stderr，Schema JSON 输出到 stdout。

## 前置依赖

- Node.js
- 项目根目录存在 `.cache/cookies.json`（首次运行会自动触发扫码登录）

## 调用流程

1. 读取项目根目录的 `.cache/cookies.json` 获取登录态；若不存在则自动触发扫码登录
2. 调用 `getFormSchema` 接口获取表单 Schema；根据响应体 `errorCode` 自动处理异常（详见 `yida-login` 技能文档「错误处理机制」章节）
3. 将 Schema 输出到 stdout

## 文件结构

```
yida-get-schema/
└── SKILL.md                      # 本文档
```

## 接口说明

`getFormSchema` 接口的完整参数、返回值和错误处理机制，请参考 `../../reference/yida-api.md` 文档中的「表单设计类 API」章节。

## 与其他技能配合

- **获取已有表单 Schema** → 本技能，用于确认字段 ID 或学习字段结构
- **创建表单页面** → 使用 `yida-create-form-page` 技能
- **部署页面代码** → 使用 `yida-publish` 技能
