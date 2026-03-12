---
name: yida-seed-data
description: 宜搭表单测试数据写入技能，通过 Playwright 在浏览器上下文中调用宜搭前端 JS API 批量写入测试数据，是验证应用功能的标准方式。
license: MIT
compatibility:
  - opencode
  - claude-code
metadata:
  audience: developers
  workflow: yida-testing
  version: 1.0.0
  tags:
    - yida
    - low-code
    - testing
    - seed-data
---

# 宜搭测试数据写入技能

## 概述

本技能提供向宜搭表单批量写入测试数据的**标准方式**：通过 Playwright 打开已发布的宜搭自定义页面，在浏览器上下文中调用 `window.fetch` 调用宜搭内部 API 写入数据。

> ⚠️ **重要**：宜搭表单数据**不能**通过 Node.js 直接发送 HTTP 请求写入（接口会返回 302 重定向或 404），必须在已登录的浏览器上下文中调用。本技能是唯一经过验证的正确方案。

## 何时使用

- 应用开发完成后，需要录入测试数据验证页面功能
- 需要批量初始化表单数据
- 验证自定义页面的数据读取、展示逻辑是否正确

## 使用方式

```bash
python3 .claude/skills/yida-seed-data/scripts/seed-data.py \
  --app-type <appType> \
  --page-url <已发布的自定义页面URL> \
  --records '<JSON格式的数据列表>'
```

**参数说明**：

| 参数 | 必填 | 说明 |
| --- | --- | --- |
| `--app-type` | 是 | 应用 ID，如 `APP_XXX` |
| `--page-url` | 是 | 已发布的宜搭自定义页面完整 URL（用于建立登录态上下文） |
| `--records` | 是 | JSON 字符串，格式见下方示例 |

**records 格式**：

```json
[
  {
    "formUuid": "FORM-XXX",
    "data": {
      "fieldId_1": "值1",
      "fieldId_2": 100,
      "fieldId_3": 1700000000000
    }
  }
]
```

**完整示例**：

```bash
python3 .claude/skills/yida-seed-data/scripts/seed-data.py \
  --app-type APP_XXX \
  --page-url "https://www.aliwork.com/APP_XXX/custom/FORM-YYY" \
  --records '[{"formUuid":"FORM-AAA","data":{"node_xxx1":"商品A","node_xxx2":99.9}}]'
```

## 工作原理

1. 读取 `.cache/cookies.json` 获取登录态；若不存在则自动调用 `login.py` 触发扫码登录
2. 用 Playwright 打开指定的宜搭自定义页面（携带 Cookie，建立已登录的浏览器上下文）
3. 在页面上下文中通过 `window.fetch` 调用宜搭内部 `saveFormData` 接口写入数据
4. 逐条写入，输出成功/失败统计

## 前置依赖

- Python 3.8+
- playwright（`pip install playwright && playwright install chromium`）
- `.cache/cookies.json` 存在（首次运行会自动触发扫码登录）

## 与其他技能配合

- **写入前**：使用 `yida-create-form-page` 创建表单，获取 `formUuid` 和 `fieldId`
- **写入后**：打开自定义页面验证数据是否正确展示
- **登录失效**：使用 `yida-logout` 清空 Cookie，重新运行脚本会自动触发登录

## 常见问题

**Q：为什么不能直接用 Node.js 发 HTTP 请求写入？**
A：宜搭的 `saveFormData` 接口在 `/alibaba/web/` 路径下会返回 302 重定向，在 `/dingtalk/web/` 路径下返回 404。该接口只能在已登录的浏览器上下文中通过 `fetch` 调用，Playwright 方案是唯一经过验证的正确方式。

**Q：写入失败怎么办？**
A：检查 `formUuid` 和 `fieldId` 是否正确（使用 `yida-get-schema` 获取），以及登录态是否有效。
