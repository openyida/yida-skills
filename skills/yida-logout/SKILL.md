---
name: yida-logout
description: 宜搭平台退出登录技能，清空本地 Cookie 缓存内容。
license: MIT
compatibility:
  - opencode
  - claude-code
metadata:
  audience: developers
  workflow: yida-auth
  version: 1.0.0
  tags:
    - yida
    - auth
    - logout
    - cookie
---

# 宜搭退出登录技能

## 概述

本技能提供宜搭平台的退出登录能力，通过清空本地 Cookie 缓存文件内容使登录态失效。下次使用 `yida-login` 时将重新打开浏览器进行扫码登录。

## 何时使用

当以下场景发生时使用此技能：
- 用户需要切换账号
- Cookie 失效且无法自动刷新
- 用户要求退出登录
- 需要切换到另一个组织

## 使用示例

### 示例 1：退出登录
**场景**：清空登录态缓存
**命令**：
```bash
yidacli logout
```

## 使用方式

```bash
yidacli logout
```

## 工作流程

1. 清空项目根目录下的 `.cache/cookies.json` 文件内容（写入空字符串）
2. 下次调用 `yida-login` 时，因缓存内容为空，将自动打开浏览器要求重新扫码登录

> **注意**：Cookie 缓存文件位于**项目根目录**（含 `README.md` 或 `.git` 的目录）的 `.cache/` 目录下。

## 与其他技能配合

- **`yida-login`**：退出后需重新登录时使用，会自动检测 Cookie 缓存为空并打开浏览器
- 退出登录不影响已部署的页面和已保存的数据
