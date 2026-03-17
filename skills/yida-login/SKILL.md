---
name: yida-login
description: 宜搭平台登录态管理技能，支持标准环境（Playwright 扫码登录）和悟空环境（CDP 从内置浏览器提取 Cookie），Cookie 持久化 + 自动获取 CSRF Token。
license: MIT
compatibility:
  - opencode
  - claude-code
metadata:
  audience: developers
  workflow: yida-auth
  version: 1.1.0
  tags:
    - yida
    - auth
    - login
    - cookie
    - wukong
---

# 宜搭登录态管理技能

## 概述

本技能提供宜搭平台的登录态管理能力，支持 Cookie 持久化和自动验证，首次使用需扫码登录，后续自动复用 Cookie。

## 何时使用

当以下场景发生时使用此技能：
- 首次使用宜搭技能，需要扫码登录
- Cookie 过期或失效，需要重新登录
- 其他技能调用时提示登录态异常
- 用户要求手动执行登录

## 使用示例

### 示例 1：标准环境触发登录
**场景**：手动触发扫码登录（标准环境）
**命令**：
```bash
yidacli login
```
**输出**：
```json
{"csrf_token":"b2a5d192-xxx","corp_id":"dingxxx","user_id":"1955225xxx","base_url":"https://abcd.aliwork.com"}
```

### 示例 2：悟空环境登录
**场景**：在悟空（Real）环境中，从内置浏览器提取登录态

> ⚠️ **AI 必读**：在悟空环境中触发登录时，必须按以下步骤操作，**不能**直接运行脚本。

**步骤 1**：读取登录地址
```bash
cat config.json  # 获取 loginUrl 字段
```

**步骤 2**：使用悟空内置浏览器打开登录页面，等待用户完成扫码登录
- 悟空环境内置浏览器控制能力，可直接打开 URL（使用悟空的 `open_url` 或浏览器工具）
- 登录地址即 `config.json` 中的 `loginUrl`（如 `https://www.aliwork.com/workPlatform`）
- 等待用户在内置浏览器中完成钉钉扫码登录后，再进行步骤 3

**步骤 3**：登录完成后，运行命令从内置浏览器提取 Cookie
```bash
yidacli login --wukong
```
**输出**（与标准登录格式完全一致）：
```json
{"csrf_token":"b2a5d192-xxx","corp_id":"dingxxx","user_id":"1955225xxx","base_url":"https://abcd.aliwork.com","cookies":[...]}
```

## 使用方式

### 标准环境

```bash
yidacli login
```

无需任何参数，登录地址从项目根目录的 `config.json` 中读取（`loginUrl` 字段），登录后可能跳转到 `abcd.aliwork.com` 等域名。

### 悟空环境

```bash
yidacli login --wukong
```

**工作原理**：通过 CDP 协议连接悟空内置浏览器（端口 4249），调用 `Network.getAllCookies` 提取完整 Cookie（包括 `document.cookie` 无法获取的 HttpOnly Cookie），从中提取 `tianshu_csrf_token` 等关键字段。

**输出**：登录成功后，将 `csrf_token`、`base_url`（跳转后的实际域名）和 Cookie 信息以 JSON 格式输出到 stdout，同时 Cookie 持久化到项目根目录的 `.cache/cookies.json`。

> ⚠️ **重要**：`base_url` 取自登录成功后浏览器**实际跳转到的域名**，而非 `config.json` 中配置的 `loginUrl` 或 `defaultBaseUrl`。例如，即使 `loginUrl` 配置为 `https://www.aliwork.com`，如果你的账号所属组织对应的是 `abcd.aliwork.com`，平台会自动跳转，最终 `base_url` 将是 `https://abcd.aliwork.com`。后续所有 API 请求（包括 `yida-publish` 发布）都会使用这个 `base_url`。如需发布到特定域名，请确保 `config.json` 中的 `loginUrl` 指向该域名对应的组织，并且你的账号属于该组织。

> 项目根目录通过向上查找 `config.json` 或 `.git` 目录来定位。

## 工作流程

1. 检查本地是否存在 `.cache/cookies.json` 缓存（包含 Cookie 和 `base_url`）
2. 若存在，**直接从 Cookie 中提取** `csrf_token`（`tianshu_csrf_token`）、`corp_id` 和 `user_id`（`tianshu_corp_user`），无需访问任何页面
3. 若 Cookie 中无 `tianshu_csrf_token`，视为失效，打开有头浏览器让用户扫码登录
4. 登录成功后直接从 Cookie 中提取所需信息，保存 Cookie 和 `base_url`（从登录后实际跳转的 URL 获取）

## 前置依赖

- Node.js 16+
- `yidacli` NPM 包已安装（`npm install -g @openyida/yidacli`）

## 文件结构

```
yida-login/
└── SKILL.md           # 本文档

项目根目录/
├── config.json        # 全局配置（loginUrl、defaultBaseUrl）
└── .cache/
    └── cookies.json   # 登录态缓存（运行时自动生成，含 Cookie + base_url）
```

## 输出格式

脚本成功执行后，最后一行输出 JSON：

```json
{
  "csrf_token": "b2a5d192-db90-484c-880f-9b48edd396d5",
  "corp_id": "ding9a0954b4f9d9d40ef5bf40eda33b7ba0",
  "user_id": "19552253733782",
  "base_url": "https://abcd.aliwork.com",
  "cookies": [...]
}
```

> `csrf_token` 从 Cookie `tianshu_csrf_token` 的 value 中提取；`corp_id` 和 `user_id` 从 Cookie `tianshu_corp_user` 的 value 中提取，格式为 `{corpId}_{userId}`，按最后一个 `_` 分隔。

> `base_url` 是登录后浏览器实际跳转到的域名（如 `https://abcd.aliwork.com`），**可能与 `config.json` 中的 `loginUrl` 不同**。其他脚本应使用此值作为 API 请求的基础地址，而非硬编码域名。

其他脚本可通过管道接收并解析 stdout 最后一行获取登录态信息。

## 缓存格式

`.cache/cookies.json` 文件格式（兼容旧版纯 Cookie 数组）：

```json
{
  "cookies": [...],
  "base_url": "https://abcd.aliwork.com"
}
```

`csrf_token`、`corp_id`、`user_id` 不存储在缓存中，每次启动时直接从 Cookie 列表中提取（`tianshu_csrf_token` 和 `tianshu_corp_user` 字段）。

## 全局配置

`yidacli` 从项目根目录的 `config.json` 读取配置，不再硬编码 URL：

```json
{
  "loginUrl": "https://www.aliwork.com/workPlatform",
  "defaultBaseUrl": "https://www.aliwork.com"
}
```

| 字段 | 说明 |
| --- | --- |
| `loginUrl` | 扫码登录页面地址（登录成功后平台可能自动跳转到其他域名） |
| `defaultBaseUrl` | API 请求的默认基础地址（仅当 `base_url` 未从登录态中获取时作为兜底使用，正常流程不会用到） |

## 错误处理机制

各 skill 脚本通过解析接口响应体的 `errorCode` 字段来判断登录态异常，并自动调用本技能处理：

| errorCode | 含义 | 标准环境处理方式 | 悟空环境处理方式 |
| --- | --- | --- | --- |
| "TIANSHU_000030" | csrf 校验失败（csrf_token 过期） | `yidacli login` 自动无头刷新 csrf_token，无需重新扫码 | `yidacli login --wukong` 重新从内置浏览器提取完整 Cookie |
| "307" | 登录状态已过期（Cookie 失效） | `yidacli login` 触发完整重新登录（可能需要扫码） | `yidacli login --wukong` 重新从内置浏览器提取完整 Cookie |

> **注意**：错误判断基于响应体 JSON 的 `errorCode` 字段，而非 HTTP 状态码。

> **悟空环境说明**：悟空环境下不支持 `--refresh-csrf` 模式，csrf_token 过期和 Cookie 失效均通过重新调用 `yidacli login --wukong` 处理。由于 CDP 提取 Cookie 速度极快（无需扫码），这不会带来明显的延迟。

## 退出登录

清空本地 Cookie 缓存文件内容即可完成退出，下次调用任意技能时将自动触发重新扫码登录：

```bash
yidacli logout
```

**适用场景**：
- 需要切换账号或切换组织
- Cookie 失效且无法自动刷新
- 用户主动要求退出登录

> **注意**：Cookie 缓存文件位于**项目根目录**（含 `README.md` 或 `.git` 的目录）的 `.cache/` 目录下。退出登录不影响已部署的页面和已保存的数据。

## 与其他技能配合

- **退出登录**：需要切换账号或 Cookie 失效时，执行 `yidacli logout` 后重新运行任意技能即可触发扫码登录
- **`yida-publish`**：发布时自动调用本技能获取登录态
- **`yida-create-app`**、**`yida-create-page`**、**`yida-create-form-page`**：自动调用本技能获取登录态
