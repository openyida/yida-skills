---
name: yida-login
description: 宜搭平台登录态管理技能，通过 Playwright 管理登录态（Cookie 持久化 + 扫码登录），获取 CSRF Token。
---

# 宜搭登录态管理技能

## 概述

本技能提供宜搭平台的登录态管理能力，支持 Cookie 持久化和自动验证，首次使用需扫码登录，后续自动复用 Cookie。

## 使用方式

```bash
python3 .claude/skills/yida-login/scripts/login.py
```

无需任何参数，登录地址从项目根目录的 `config.json` 中读取（`loginUrl` 字段），登录后可能跳转到 `abcd.aliwork.com` 等域名。

**输出**：登录成功后，将 `csrf_token`、`base_url`（跳转后的实际域名）和 Cookie 信息以 JSON 格式输出到 stdout，同时 Cookie 持久化到项目根目录的 `.cache/cookies.json`。

> ⚠️ **重要**：`base_url` 取自登录成功后浏览器**实际跳转到的域名**，而非 `config.json` 中配置的 `loginUrl` 或 `defaultBaseUrl`。例如，即使 `loginUrl` 配置为 `https://www.aliwork.com`，如果你的账号所属组织对应的是 `abcd.aliwork.com`，平台会自动跳转，最终 `base_url` 将是 `https://abcd.aliwork.com`。后续所有 API 请求（包括 `yida-publish` 发布）都会使用这个 `base_url`。如需发布到特定域名，请确保 `config.json` 中的 `loginUrl` 指向该域名对应的组织，并且你的账号属于该组织。

> 项目根目录通过向上查找 `config.json` 或 `.git` 目录来定位。

## 工作流程

1. 检查本地是否存在 `.cache/cookies.json` 缓存（包含 Cookie 和 `base_url`）
2. 若存在，**直接用保存的 `base_url` 跳转 `/myApp`** 无头验证 Cookie 有效性（不再重走登录地址，避免域名跳转导致验证失败）
3. 若 `base_url` 验证失败，回退到默认域名再试一次
4. 若 Cookie 无效或不存在，打开有头浏览器让用户扫码登录
5. 登录成功后在同一浏览器上下文中跳转 `/myApp` 获取信息，保存所有域的 Cookie 和 `base_url`

## 前置依赖

- Python 3.12+
- playwright（`pip install playwright && playwright install chromium`）

## 文件结构

```
yida-login/
├── SKILL.md           # 本文档
└── scripts/
    └── login.py       # 登录脚本

项目根目录/
├── config.json        # 全局配置（loginUrl、defaultBaseUrl）
└── .cache/
    └── cookies.json   # 登录态缓存（运行时自动生成，含 Cookie + base_url）
```

## 输出格式

脚本成功执行后，最后一行输出 JSON：

```json
{
  "csrf_token": "xxx-xxx-xxx",
  "login_user": { "userName": "张三", "userId": "012345" },
  "corp_id": "dingxxxxxxxxx",
  "base_url": "https://abcd.aliwork.com",
  "cookies": [...]
}
```

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

缓存中同时保存 `base_url`，无头验证时直接使用，避免重新访问登录地址导致域名跳转问题。

## 全局配置

所有脚本（`login.py` 及各 JS 脚本）从项目根目录的 `config.json` 读取配置，不再硬编码 URL：

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

## 与其他技能配合

- **`yida-logout`**：需要切换账号或 Cookie 失效时，先退出再重新登录
- **`yida-publish`**：发布时自动调用本技能获取登录态
- **`yida-create-app`**、**`yida-create-page`**、**`yida-create-form-page`**：通过管道将本技能输出传入
