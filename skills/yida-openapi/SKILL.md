---
name: yida-openapi
description: 宜搭 OpenAPI 数据操作技能，通过宜搭 OpenAPI 查询、创建、更新、删除表单数据，以及查询和发起流程实例。
metadata: {"openclaw":{"emoji":"🔌","requires":{"bins":["node"]}}}
---

# 宜搭 OpenAPI 数据操作技能

## 概述

本技能通过宜搭 OpenAPI 直接操作宜搭平台数据，支持表单数据的增删改查，以及流程实例的查询和发起。无需打开浏览器，纯 HTTP 接口调用。

## 何时使用

- 查询宜搭表单中的数据（按条件搜索）
- 向宜搭表单提交新数据
- 更新已有的表单实例数据
- 删除表单实例
- 查询流程实例状态和详情
- 发起宜搭审批流程

## 前置条件

需要先完成登录（`yida-login` 技能），确保 `.cache/cookies.json` 存在且有效。

## 使用方式

```bash
node {baseDir}/scripts/openapi.js <action> [options]
```

### action 列表

| action | 说明 |
|--------|------|
| `search` | 搜索表单数据列表 |
| `get` | 根据实例 ID 查询表单详情 |
| `create` | 新建表单实例 |
| `update` | 更新表单实例 |
| `delete` | 删除表单实例 |
| `process-search` | 搜索流程实例 |
| `process-get` | 查询流程实例详情 |
| `process-start` | 发起流程实例 |

## 使用示例

### 示例 1：搜索表单数据

**场景**：查询报销单表单中上个月的数据
```bash
node {baseDir}/scripts/openapi.js search \
  --app APP_XXXX \
  --form FORM-XXXX \
  --page 1 \
  --page-size 20 \
  --search '{"textField_xxx":"张三"}'
```

**输出**：
```json
{
  "success": true,
  "totalCount": 3,
  "data": [
    { "formInstId": "FINST-XXX", "formData": { "textField_xxx": "张三" } }
  ]
}
```

### 示例 2：新建表单实例

**场景**：向客户跟进记录表单提交一条新数据
```bash
node {baseDir}/scripts/openapi.js create \
  --app APP_XXXX \
  --form FORM-XXXX \
  --data '{"textField_name":"李四","numberField_amount":1000}'
```

**输出**：
```json
{ "success": true, "formInstId": "FINST-XXXX" }
```

### 示例 3：更新表单实例

```bash
node {baseDir}/scripts/openapi.js update \
  --app APP_XXXX \
  --inst FINST-XXXX \
  --data '{"textField_name":"王五"}'
```

### 示例 4：删除表单实例

```bash
node {baseDir}/scripts/openapi.js delete \
  --app APP_XXXX \
  --inst FINST-XXXX
```

### 示例 5：查询流程实例列表

```bash
node {baseDir}/scripts/openapi.js process-search \
  --app APP_XXXX \
  --form FORM-XXXX \
  --status RUNNING
```

### 示例 6：发起流程

```bash
node {baseDir}/scripts/openapi.js process-start \
  --app APP_XXXX \
  --form FORM-XXXX \
  --process TPROC--XXXX \
  --data '{"textField_title":"审批申请"}'
```

## 参数说明

| 参数 | 说明 | 示例 |
|------|------|------|
| `--app` | 应用 ID | `APP_XXXX` |
| `--form` | 表单 ID | `FORM-XXXX` |
| `--inst` | 表单实例 ID | `FINST-XXXX` |
| `--process` | 流程 code | `TPROC--XXXX` |
| `--data` | 表单数据 JSON 字符串 | `'{"textField_xxx":"值"}'` |
| `--search` | 搜索条件 JSON 字符串 | `'{"textField_xxx":"值"}'` |
| `--page` | 当前页（默认 1） | `1` |
| `--page-size` | 每页条数（默认 20） | `20` |
| `--status` | 流程实例状态 | `RUNNING` / `COMPLETED` / `TERMINATED` |
| `--dry-run` | 预览模式，不实际执行 | - |

## 文件结构

```
yida-openapi/
├── SKILL.md           # 本文档
└── scripts/
    └── openapi.js     # 核心脚本
```

## 错误处理

- **登录态失效**：自动提示执行 `yida-login` 重新登录
- **CSRF Token 过期**：自动从 Cookie 重新提取
- **接口报错**：输出 `errorCode` 和 `errorMsg` 供排查

## 表单数据格式参考

| 组件类型 | 数据格式 | 示例 |
|----------|----------|------|
| 单行/多行输入框 | 字符串 | `"文本内容"` |
| 数字输入框 | 数字 | `100` |
| 单选/下拉单选 | 字符串 | `"选项一"` |
| 多选/下拉多选 | 字符串数组 | `["选项一", "选项二"]` |
| 日期 | 时间戳 | `1516636800000` |
| 人员搜索框 | 字符串数组 | `["userId1"]` |
| 子表单 | JSON 数组 | `[{"textField_xxx": "值"}]` |

> 详细格式参考：`yida-custom-page/reference/open-api.md`
