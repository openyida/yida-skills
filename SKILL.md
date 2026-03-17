---
name: yida
description: >
  宜搭 AI 应用开发总入口技能。通过有 AI Coding 能力的智能体（悟空/Claude/Open Code 等）+ 宜搭低代码平台，实现一句话生成完整应用。
  包含应用创建、表单设计、自定义页面开发、页面发布、登录态管理等完整开发流程。
  当用户提到"宜搭"、"yida"、"低代码"、"创建应用"、"创建表单"、"发布页面"、"搭建"、"系统"、等关键词时，使用此技能。
license: MIT
compatibility:
  - opencode
  - claude-code
metadata:
  audience: developers
  workflow: yida-development
  version: 3.0.0
  tags:
    - yida
    - low-code
    - app
    - form
    - custom-page
---

# 宜搭 AI 应用开发指南

## 概述

本技能通过有 AI Coding 能力的智能体（悟空/Claude/Open Code 等） + 宜搭低代码平台，实现一句话生成完整应用。涵盖从应用创建、表单设计、自定义页面开发到页面发布的完整链路。

所有操作通过 **`yidacli`** 命令行工具统一执行，无需关心脚本路径或运行环境差异。

**登录态说明**：所有命令自动读取 `.cache/cookies.json`，首次运行或 Cookie 失效时自动触发登录流程，无需手动执行登录命令。

---

## 环境依赖

| 依赖 | 版本 | 用途 |
|------|------|------|
| Node.js | ≥ 16 | 运行 yidacli |
| yida-cli | 最新 | 宜搭命令行工具 |

```bash
# 安装 yida-cli（首次使用前执行）
npm install -g @openyida/yidacli

# 更新 yida-cli 到最新版本
npm install -g @openyida/yidacli@latest
```

---

## 更新 yida-cli

`yidacli` 内置了**自动版本检测**：每天首次运行时会在后台检查 npm 是否有新版本，有更新时会在命令结束后打印提示：

```
💡 发现新版本 1.0.5（当前 1.0.1）
   运行以下命令更新：
   npm install -g @openyida/yidacli@latest
```

**手动更新**：
```bash
npm install -g @openyida/yidacli@latest
```

**让 AI 帮你更新**：

看到版本提示，或执行 `yidacli` 命令出现报错时，直接告诉 AI：

> "yidacli 有新版本，请帮我更新"
> 或："yidacli 命令出错了，请帮我更新 openyida-cli"

AI 会自动执行以下命令完成更新：
```bash
npm install -g @openyida/yidacli@latest
```

更新完成后重新执行出错的命令即可。

---

## ⚡ 首要步骤：检测运行环境（必须先执行）

**在执行任何宜搭操作前，必须先运行环境检测命令**，确认当前 AI 工具环境和登录态：

```bash
yidacli env
```

**输出解读**：

| 字段 | 说明 |
|------|------|
| AI 工具检测 | 显示当前活跃的 AI 工具（悟空/OpenCode/Aone Copilot 等） |
| 当前生效环境 | 显示项目根目录路径 |
| 登录态检测 | 显示是否已登录、域名、组织 ID |

> **若显示"未登录"，自动执行 `yidacli login`，无需手动操作。**。

---

## 🔧 初始化 openyida 工作目录

**如果当前工程目录下没有 `openyida/` 目录**（例如切换了 AI 工具、或在新工程中首次使用），需要手动执行初始化：

```bash
yidacli copy
```

### 复制目标说明

| AI 工具 | openyida 目录位置 | 说明 |
|---------|-----------------|------|
| **悟空（Wukong）** | `~/.real/workspace/openyida` | 悟空有专属 workspace，与工程目录无关 |
| **其他工具**（Aone Copilot、Cursor、Claude Code、OpenCode 等） | `<当前工程目录>/openyida` | 以项目为单位，需在工程根目录下执行 |

### AI 执行规则

**在执行任何宜搭操作前，先检查 openyida 目录是否存在**：

- **悟空**：检查 `~/.real/workspace/openyida` 是否存在
- **其他工具**：检查当前工程目录下的 `openyida/` 是否存在

若不存在，执行初始化：
```bash
yidacli copy
```

> ⚠️ 对于非悟空工具，必须先 `cd` 到工程根目录再执行 `yidacli copy`。

---

## 何时使用

当用户提出以下需求时，使用本技能并按照完整开发流程执行：
- 创建宜搭应用、表单、自定义页面
- 发布或更新宜搭页面
- 配置页面公开访问/组织内分享
- 查询表单 Schema 或字段 ID
- 管理宜搭登录态（登录/退出）

---

## 完整开发流程

```
[Step 1] 创建应用 → yidacli create-app          → 获得 appType
              ↓
[Step 2] 需求分析 → 写入 prd/<项目名>.md
              ↓
[Step 3] 创建自定义页面 → yidacli create-page    → 获得 formUuid（自定义页面）
              ↓
[Step 4]（按需）创建/更新表单 → yidacli create-form → 获得 formUuid（表单）
              ↓
[Step 5] 编写自定义页面代码 → yida-custom-page 规范 → pages/src/<项目名>.js
              ↓
[Step 6] 发布页面 → yidacli publish
              ↓
[Step 7]（按需）配置公开访问 → yidacli verify-short-url / save-share-config
              ↓
[Step 8] 输出访问链接，用系统浏览器打开
```

---

## 子技能速查

> 每个子技能均有独立的 SKILL.md，执行前请读取对应文档获取详细参数说明。

| 技能 | SKILL.md 路径 | 用途 | 典型命令 |
|------|--------------|------|---------|
| `yida-login` | `skills/yida-login/SKILL.md` | 登录态管理（通常自动触发） | `yidacli login` |
| `yida-logout` | `skills/yida-logout/SKILL.md` | 退出登录 / 切换账号 | `yidacli logout` |
| `yida-create-app` | `skills/yida-create-app/SKILL.md` | 创建应用，获取 appType | `yidacli create-app "<名称>"` |
| `yida-create-page` | `skills/yida-create-page/SKILL.md` | 创建自定义页面，获取 formUuid | `yidacli create-page <appType> "<页面名>"` |
| `yida-create-form-page` | `skills/yida-create-form-page/SKILL.md` | 创建/更新表单页面 | `yidacli create-form create <appType> "<表单名>" <字段JSON>` |
| `yida-get-schema` | `skills/yida-get-schema/SKILL.md` | 获取表单 Schema，确认字段 ID | `yidacli get-schema <appType> <formUuid>` |
| `yida-custom-page` | `skills/yida-custom-page/SKILL.md` | 编写自定义页面 JSX 代码规范 | 详见 SKILL.md |
| `yida-publish-page` | `skills/yida-publish-page/SKILL.md` | 编译并发布自定义页面 | `yidacli publish <源文件路径> <appType> <formUuid>` |
| `yida-page-config` | `skills/yida-page-config/SKILL.md` | 页面公开访问/组织内分享配置 | `yidacli verify-short-url <appType> <formUuid> <url>` |

---

## 关键规则

### 1. 执行子技能前必须读取其 SKILL.md

每个子技能的详细参数、注意事项、示例均在其 SKILL.md 中。**执行任何子技能前，必须先读取对应的 SKILL.md**，不要凭记忆猜测参数格式。

### 2. corpId 一致性检查（必须遵守）

在创建页面前，**必须对比 prd 文档中的 corpId 与 `.cache/cookies.json` 中的 corpId 是否一致**：

- **一致** → 继续执行
- **不一致** → 询问用户：重新登录到正确组织，还是在当前组织新建应用？

### 3. 配置信息分两处存储

| 信息类型 | 存储位置 | 内容示例 |
|---------|---------|---------|
| 业务语义信息 | `prd/<项目名>.md` | 字段名称、字段类型、字段说明 |
| Schema ID | `.cache/<项目名>-schema.json` | `appType`、`formUuid`、`fieldId` |

> **prd 文档不记录 `formUuid`、`fieldId` 等 ID**，这些写入 `.cache/` 临时文件。

### 4. 临时文件规范

所有临时文件（cookies、schema 缓存等）**必须写在项目根目录的 `.cache/` 文件夹中**，不要写在系统其他位置。

---

## 表单字段类型速查

| 类型 | 说明 | 特殊属性 |
|------|------|---------|
| `TextField` | 单行文本 | — |
| `TextareaField` | 多行文本 | — |
| `NumberField` | 数字 | `precision`（小数位）、`innerAfter`（单位） |
| `RadioField` | 单选 | `options` |
| `CheckboxField` | 多选 | `options` |
| `SelectField` | 下拉单选 | `options` |
| `MultiSelectField` | 下拉多选 | `options` |
| `DateField` | 日期 | `format`（如 `"YYYY-MM-DD"`） |
| `CascadeDateField` | 级联日期（范围） | `format` |
| `EmployeeField` | 成员选择 | `multiple` |
| `DepartmentSelectField` | 部门选择 | `multiple` |
| `AddressField` | 地址 | — |
| `AttachmentField` | 附件上传 | — |
| `ImageField` | 图片上传 | — |
| `TableField` | 子表格 | `children`（子字段列表） |
| `AssociationFormField` | 关联表单 | `associationForm` |
| `SerialNumberField` | 流水号 | `serialNumberRule` |
| `RateField` | 评分 | `count`（星级数） |
| `CountrySelectField` | 国家选择 | `multiple` |

---

## 宜搭应用 URL 规则

| 页面类型 | URL 格式 |
|---------|---------|
| 应用首页 | `{base_url}/{appType}/workbench` |
| 表单提交页 | `{base_url}/{appType}/submission/{formUuid}` |
| 自定义页面 | `{base_url}/{appType}/custom/{formUuid}` |
| 自定义页面（隐藏导航） | `{base_url}/{appType}/custom/{formUuid}?isRenderNav=false` |
| 表单详情页 | `{base_url}/{appType}/formDetail/{formUuid}?formInstId={formInstId}` |
| 表单详情页（编辑模式） | `{base_url}/{appType}/formDetail/{formUuid}?formInstId={formInstId}&mode=edit` |

> 所有地址拼接 `&corpid={corpId}` 可自动切换到对应组织。

---

## 常见问题

**Q：发布时提示登录失效？**

重新登录后再发布：
```bash
yidacli login
yidacli publish <源文件路径> <appType> <formUuid>
```

**Q：如何查看已有表单的字段 ID？**

使用 `yida-get-schema` 技能获取表单 Schema，从中读取各字段的 `fieldId`：
```bash
yidacli get-schema <appType> <formUuid>
```

**Q：如何更新已有表单字段？**

使用 `yida-create-form-page` 的 update 模式，详见 `skills/yida-create-form-page/SKILL.md`：
```bash
yidacli create-form update <appType> <formUuid> '[{"action":"add","field":{"type":"TextField","label":"新字段"}}]'
```

**Q：发布时提示 corpId 不匹配？**

询问用户是否在当前组织创建新应用发布，或重新登录到正确组织：
```bash
yidacli logout
yidacli login
```
