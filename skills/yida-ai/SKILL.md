---
name: yida-ai
description: 宜搭 AI 能力调用技能，封装宜搭平台内置 AI 接口，支持文本生成、内容校验、智能分析等场景，复用宜搭平台的 AI 配额和权限体系。
license: MIT
compatibility:
  - opencode
  - claude-code
metadata:
  audience: developers
  workflow: yida-ai
  version: 1.0.0
  tags:
    - yida
    - ai
    - llm
    - text-generation
---

# 宜搭 AI 调用技能

## 概述

本技能封装宜搭平台提供的 AI 接口（`txtFromAI`），让 AI 助手能够直接调用宜搭内置的 AI 能力，实现文本生成、内容校验、智能分析、格式转换等功能，并复用宜搭平台的 AI 配额和权限体系。

## 何时使用

当以下场景发生时使用此技能：
- 需要调用宜搭平台 AI 能力生成文本内容
- 需要对用户输入进行智能校验或分析
- 需要将非结构化文本转换为结构化数据
- 在自定义页面开发过程中需要 AI 辅助生成内容

## 使用示例

### 示例 1：基础文本生成
**场景**：生成产品介绍文案
**命令**：
```bash
node .claude/skills/yida-ai/scripts/ai.js "请帮我生成一段产品介绍"
```
**输出**：
```
我们的产品致力于...（AI 生成的文本内容）
```

### 示例 2：内容校验
**场景**：校验用户输入是否符合规则
**命令**：
```bash
node .claude/skills/yida-ai/scripts/ai.js "检查以下项目描述是否清晰完整：本项目旨在提升团队协作效率" --skill ToText
```

### 示例 3：数据分析
**场景**：对销售数据进行智能解读
**命令**：
```bash
node .claude/skills/yida-ai/scripts/ai.js "分析以下销售数据的趋势：Q1: 120万, Q2: 145万, Q3: 98万, Q4: 167万" --max-tokens 5000
```

### 示例 4：内容生成（大 token）
**场景**：生成周报摘要
**命令**：
```bash
node .claude/skills/yida-ai/scripts/ai.js "根据以下工作内容生成周报摘要：完成了用户登录模块开发，修复了3个线上 bug，参与了产品需求评审" --max-tokens 5000
```

## 使用方式

```bash
node .claude/skills/yida-ai/scripts/ai.js <prompt> [选项]
```

**参数说明**：

| 参数 | 说明 | 默认值 |
| --- | --- | --- |
| `prompt` | 提示词内容（必填） | - |
| `--max-tokens <n>` | 最大 token 数 | `3000` |
| `--skill <type>` | 技能类型 | `ToText` |
| `--help, -h` | 显示帮助信息 | - |

> `Cookie` 和 `csrf_token` 无需手动传入，脚本会自动从 `.cache/cookies.json` 读取登录态（若不存在或过期，则自动触发扫码登录）。

## 工作流程

1. **读取登录态**：读取项目根目录的 `.cache/cookies.json`；若不存在或 csrf_token 缺失，则自动调用 `login.py` 触发扫码登录
2. **调用 AI 接口**：通过 HTTP POST 调用宜搭 `txtFromAI` 接口，携带 prompt、maxTokens、skill 等参数
3. **自动重试**：网络超时时指数退避重试；csrf_token 过期时自动刷新；Cookie 失效时自动重新登录
4. **输出结果**：将 AI 返回的文本内容输出到 stdout，供 AI 助手读取和使用

## 接口说明

### txtFromAI

- **地址**：`POST /query/intelligent/txtFromAI.json?_api=nattyFetch&_mock=false`
- **Content-Type**：`application/x-www-form-urlencoded`
- **参数**：

| 参数 | 类型 | 说明 |
| --- | --- | --- |
| `_csrf_token` | string | CSRF Token（从 Cookie 自动获取） |
| `prompt` | string | 提示词内容 |
| `maxTokens` | number | 最大 token 数（默认 3000） |
| `skill` | string | 技能类型（默认 `ToText`） |

- **返回值**：

```json
{
  "success": true,
  "content": "AI 生成的文本内容"
}
```

## 典型场景

| 场景 | 说明 |
| --- | --- |
| **文本校验** | 校验用户输入是否符合规则（如项目价值描述完整性校验） |
| **内容生成** | 自动生成报告、摘要、产品描述等 |
| **智能分析** | 对数据进行智能解读和趋势分析 |
| **格式转换** | 将非结构化文本转为结构化数据 |

## 前置依赖

- Node.js 16+
- Python 3.10+（用于调用 yida-login）
- playwright（Python 版，yida-login 依赖）
- `yida-login` skill 已安装（登录态管理）

## 文件结构

```
yida-ai/
├── SKILL.md            # 本文档
└── scripts/
    └── ai.js           # AI 调用主脚本（Node.js）
```

> 本技能无额外 npm 依赖，直接使用 Node.js 内置模块和 `shared/fetch-with-retry.js` 公共模块。

## 注意事项

- 需要有效的宜搭登录态（`tianshu_csrf_token`）
- AI 调用受宜搭平台配额限制，请合理控制调用频率
- 返回内容由宜搭平台 AI 生成，建议对结果进行人工审核后再使用

## 与其他技能配合

- **`yida-login`**：登录态失效时自动调用（Cookie 持久化，首次或过期时需扫码）
- **`yida-custom-page`**：在自定义页面开发中结合 AI 能力生成内容
- **`yida-publish-page`**：AI 生成内容后发布到宜搭平台
