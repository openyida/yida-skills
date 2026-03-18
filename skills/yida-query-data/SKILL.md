---
name: yida-query-data
description: 宜搭表单数据查询技能，支持查询表单实例列表和详情，支持分页、条件搜索。
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
    - query
    - data
    - api
---

# 宜搭表单数据查询技能

## 概述

本技能用于查询宜搭表单的实例数据，支持以下功能：
- 查询表单实例列表（分页）
- 查询单个实例详情
- 条件搜索（按字段值）
- 自动管理登录态

## 前置依赖

- Python 3.8+
- 项目根目录存在 `.cache/cookies.json`（首次运行会自动触发扫码登录）

## 使用方式

### 查询数据列表

```bash
python3 yida-query-data/scripts/query-data.py <appType> <formUuid> [options]
```

**参数说明**：

| 参数 | 必填 | 说明 | 示例 |
|------|------|------|------|
| `appType` | 是 | 应用 ID | `APP_CQ2P5NRFI5L1D6PB8Q7J` |
| `formUuid` | 是 | 表单 UUID | `FORM-E7E63583C4C143AE95F8C218D443B6CAC157` |
| `--page` | 否 | 当前页码，默认 1 | `1` |
| `--size` | 否 | 每页记录数，默认 20，最大 100 | `20` |
| `--search-json` | 否 | 搜索条件 JSON 字符串 | `'{"textField_xxx": "值"}'` |
| `--inst-id` | 否 | 实例 ID（查询详情时使用） | `FINST-XXX` |

### 使用示例

#### 示例 1：查询所有数据
```bash
python3 yida-query-data/scripts/query-data.py \
  "APP_CQ2P5NRFI5L1D6PB8Q7J" \
  "FORM-E7E63583C4C143AE95F8C218D443B6CAC157"
```

#### 示例 2：分页查询
```bash
python3 yida-query-data/scripts/query-data.py \
  "APP_CQ2P5NRFI5L1D6PB8Q7J" \
  "FORM-E7E63583C4C143AE95F8C218D443B6CAC157" \
  --page 1 \
  --size 20
```

#### 示例 3：条件搜索
```bash
python3 yida-query-data/scripts/query-data.py \
  "APP_CQ2P5NRFI5L1D6PB8Q7J" \
  "FORM-E7E63583C4C143AE95F8C218D443B6CAC157" \
  --search-json '{"textField_w2805e7u": "测试2"}'
```

#### 示例 4：查询指定实例详情
```bash
python3 yida-query-data/scripts/query-data.py \
  "APP_CQ2P5NRFI5L1D6PB8Q7J" \
  "FORM-E7E63583C4C143AE95F8C218D443B6CAC157" \
  --inst-id "FINST-B5G66KD1F824XFCKLRFC9CSOVN592M0TLBUMM219"
```

## API 说明

### searchFormDatas

**接口地址**：`GET /dingtalk/web/{appType}/v1/form/searchFormDatas.json`

**参数**：

| 参数 | 类型 | 说明 |
|------|------|------|
| `_api` | String | 固定值 `nattyFetch` |
| `_mock` | String | 固定值 `false` |
| `_csrf_token` | String | CSRF Token（从 Cookie 获取） |
| `_stamp` | String | 时间戳（毫秒） |
| `formUuid` | String | 表单 UUID |
| `appType` | String | 应用 ID |
| `currentPage` | Number | 当前页码 |
| `pageSize` | Number | 每页记录数 |
| `searchFieldJson` | String | 搜索条件（可选） |

**响应示例**：

```json
{
  "success": true,
  "content": {
    "totalCount": 2,
    "currentPage": 1,
    "data": [
      {
        "formInstId": "FINST-XXX",
        "formUuid": "FORM-XXX",
        "title": "标题",
        "formData": {
          "textField_xxx": "值",
          "numberField_xxx": 10
        },
        "originator": {
          "name": {"zh_CN": "张三"},
          "userId": "2212173665758008"
        },
        "gmtCreate": 1773728209286,
        "gmtModified": 1773734300040
      }
    ]
  }
}
```

### getFormDataById

**接口地址**：`GET /dingtalk/web/{appType}/v1/form/getFormDataById.json`

**参数**：

| 参数 | 类型 | 说明 |
|------|------|------|
| `_api` | String | 固定值 `nattyFetch` |
| `_mock` | String | 固定值 `false` |
| `_csrf_token` | String | CSRF Token |
| `_stamp` | String | 时间戳（毫秒） |
| `formInstId` | String | 表单实例 ID |

## 文件结构

```
yida-query-data/
├── SKILL.md           # 本文档
└── scripts/
    └── query-data.py  # 查询脚本
```

## 与其他技能配合

- **登录管理**：自动调用 `yida-login` 技能获取/刷新登录态
- **表单设计**：使用 `yida-get-schema` 技能获取表单字段 ID
- **数据更新**：使用 `yida-save-data` 技能（需另行实现）

## 注意事项

1. **Cookie 位置**：脚本优先从 `openyida/.cache/cookies.json` 读取 Cookie
2. **CSRF Token**：自动从 Cookie 的 `tianshu_csrf_token` 字段提取
3. **时间戳**：每次请求自动生成当前时间的毫秒时间戳
4. **错误处理**：
   - `TIANSHU_000030`：csrf_token 过期，自动刷新
   - `307`/`302`：登录态过期，自动重新登录

## 搜索条件格式

`--search-json` 参数支持以下字段类型：

```json
{
  "textField_xxx": "精确匹配",
  "numberField_xxx": ["1", "10"],
  "radioField_xxx": "选项一",
  "selectField_xxx": "选项一",
  "dateField_xxx": [1514736000000, 1517414399000]
}
```
