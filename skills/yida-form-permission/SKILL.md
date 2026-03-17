---
name: yida-form-permission
description: 宜搭表单权限配置技能，支持查询和配置表单的字段权限（可见/隐藏/只读/可编辑）、数据权限（全部/本人/本部门/自定义）和操作权限（增删改查导出）。
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
  - permission
  - form-permission
---

# 宜搭表单权限配置技能

## 概述

本技能提供宜搭表单的权限配置功能，支持三种维度的权限控制：

| 权限维度 | 说明 |
|---------|------|
| **字段权限** | 控制不同角色对表单字段的可见性：可见、隐藏、只读、可编辑、脱敏 |
| **数据权限** | 控制不同角色可访问的数据范围：全部数据、本人数据、本部门数据、自定义规则 |
| **操作权限** | 控制不同角色对表单的操作能力：新增、查看、编辑、删除、导出 |

> ⚠️ **当前限制**：
> - **权限成员**：仅支持「全部人员」（`DEFAULT`）和「管理员」（`MANAGER`）两种类型，暂不支持「权限矩阵」
> - **数据范围**：暂不支持「自定义部门」（`CUSTOM_DEPARTMENT`）和「自定义过滤条件」（`FORMULA`/`CUSTOM`）
> - **字段权限**：暂不支持自定义字段权限配置（接口尚未验证），如需配置请通过宜搭管理后台手动操作

## 何时使用

当以下场景发生时使用此技能：

- 用户需要配置表单的字段级权限（如隐藏敏感字段）
- 用户需要配置数据范围权限（如只能看自己的数据）
- 用户需要配置操作权限（如禁止删除）
- 用户需要查看当前表单的权限配置

## 使用示例

### 示例 1：查询表单权限配置

```bash
node .claude/skills/yida-form-permission/scripts/get-permission.js APP_XXX FORM-XXX
```

### 示例 2：保存字段权限配置

```bash
node .claude/skills/yida-form-permission/scripts/save-permission.js APP_XXX FORM-XXX '[{"fieldId":"textField_xxx","behavior":"HIDDEN","roles":["member"]},{"fieldId":"numberField_xxx","behavior":"READONLY","roles":["member"]}]'
```

### 示例 3：保存数据权限配置

```bash
node .claude/skills/yida-form-permission/scripts/save-permission.js APP_XXX FORM-XXX --data-permission '{"role":"member","dataRange":"SELF"}'
```

### 示例 4：保存操作权限配置

```bash
node .claude/skills/yida-form-permission/scripts/save-permission.js APP_XXX FORM-XXX --action-permission '{"role":"member","actions":{"create":true,"view":true,"edit":false,"delete":false,"export":false}}'
```

## 工具说明

### 1. get-permission - 获取权限配置

获取表单当前的权限配置信息。

```bash
node .claude/skills/yida-form-permission/scripts/get-permission.js <appType> <formUuid>
```

**参数**：

| 参数 | 必填 | 说明 |
| --- | --- | --- |
| `appType` | 是 | 应用 ID，如 `APP_XXX` |
| `formUuid` | 是 | 表单 UUID，如 `FORM-XXX` |

**输出**：

```json
{
  "success": true,
  "permissions": {
    "fieldPermissions": [
      {
        "fieldId": "textField_xxx",
        "label": "姓名",
        "behavior": "NORMAL",
        "roles": ["all"]
      }
    ],
    "dataPermissions": [
      {
        "role": "member",
        "dataRange": "SELF"
      }
    ],
    "actionPermissions": [
      {
        "role": "member",
        "actions": {
          "create": true,
          "view": true,
          "edit": false,
          "delete": false,
          "export": false
        }
      }
    ]
  }
}
```

### 2. save-permission - 保存权限配置

保存表单的权限配置。

```bash
node .claude/skills/yida-form-permission/scripts/save-permission.js <appType> <formUuid> [fieldPermissionsJson] [--data-permission <json>] [--action-permission <json>]
```

**参数**：

| 参数 | 必填 | 说明 |
| --- | --- | --- |
| `appType` | 是 | 应用 ID |
| `formUuid` | 是 | 表单 UUID |
| `fieldPermissionsJson` | 否 | 字段权限 JSON 数组 |
| `--data-permission` | 否 | 数据权限 JSON |
| `--action-permission` | 否 | 操作权限 JSON |

#### 字段权限 JSON 格式

```json
[
  {
    "fieldId": "textField_xxx",
    "behavior": "HIDDEN",
    "roles": ["member"]
  },
  {
    "fieldId": "numberField_xxx",
    "behavior": "READONLY",
    "roles": ["member"]
  }
]
```

**behavior 取值**：

| 值 | 说明 |
|---|------|
| `NORMAL` | 正常（可见可编辑） |
| `READONLY` | 只读（可见不可编辑） |
| `HIDDEN` | 隐藏（不可见） |
| `MASKED` | 脱敏展示 |

#### 数据权限 JSON 格式

```json
{
  "role": "member",
  "dataRange": "SELF",
  "customRule": null
}
```

**dataRange 取值**：

| 值 | 说明 | 是否支持 |
|---|------|---------|
| `ALL` | 全部数据 | ✅ |
| `SELF` / `ORIGINATOR` | 本人提交的数据 | ✅ |
| `DEPARTMENT` / `ORIGINATOR_DEPARTMENT` | 本部门提交的数据 | ✅ |
| `SAME_LEVEL_DEPARTMENT` | 同级部门提交的数据 | ✅ |
| `SUBORDINATE_DEPARTMENT` | 下级部门提交的数据 | ✅ |
| `FREE_LOGIN` | 免登提交的数据 | ✅ |
| `CUSTOM_DEPARTMENT` | 自定义部门 | ❌ 暂不支持 |
| `FORMULA` / `CUSTOM` | 自定义过滤条件 | ❌ 暂不支持 |

#### 操作权限 JSON 格式

```json
{
  "role": "member",
  "actions": {
    "create": true,
    "view": true,
    "edit": false,
    "delete": false,
    "export": false
  }
}
```

## 前置依赖

- Node.js
- 项目根目录存在 `.cache/cookies.json`（首次运行会自动触发扫码登录）

## 调用流程

1. 读取项目根目录的 `.cache/cookies.json` 获取登录态；若不存在则自动触发扫码登录
2. 调用对应接口进行权限查询或保存
3. 根据响应体 `errorCode` 自动处理异常（csrf 过期自动刷新、登录过期自动重新登录）
4. 返回操作结果

## 文件结构

```
yida-form-permission/
├── SKILL.md                          # 本文档
└── scripts/
    ├── get-permission.js             # 权限配置查询脚本
    └── save-permission.js            # 权限配置保存脚本
```

## 接口说明

### getFormPermission（获取表单权限配置）

- **地址**：`GET /dingtalk/web/{appType}/query/formdesign/getFormPermission.json`
- **参数**：

| 参数 | 类型 | 必填 | 说明 |
| --- | --- | --- | --- |
| `_api` | String | 是 | `Form.getFormPermission` |
| `formUuid` | String | 是 | 表单 UUID |
| `_csrf_token` | String | 是 | CSRF Token |

- **返回值**：包含 `fieldPermissions`、`dataPermissions`、`actionPermissions` 的权限配置对象

### saveFormPermission（保存表单权限配置）

- **地址**：`POST /dingtalk/web/{appType}/query/formdesign/saveFormPermission.json`
- **参数**：

| 参数 | 类型 | 必填 | 说明 |
| --- | --- | --- | --- |
| `_api` | String | 是 | `Form.saveFormPermission` |
| `formUuid` | String | 是 | 表单 UUID |
| `permissionConfig` | String | 是 | 权限配置 JSON |
| `_csrf_token` | String | 是 | CSRF Token |

- **返回值**：`success: true` 表示成功

## 与其他技能配合

- **创建表单** → 使用 `yida-create-form-page` 技能
- **获取表单 Schema** → 使用 `yida-get-schema` 技能（获取 fieldId）
- **页面配置** → 使用 `yida-page-config` 技能
- **发布页面** → 使用 `yida-publish-page` 技能

## 注意事项

- 配置权限前，建议先通过 `yida-get-schema` 技能获取表单的字段列表和 fieldId
- 字段权限中的 `fieldId` 必须与表单 Schema 中的字段 ID 一致
- 临时文件写在当前工程根目录的 `.cache` 文件夹中

### 当前功能限制

| 功能 | 限制说明 |
|------|---------|
| **权限成员** | 仅支持「全部人员」（`DEFAULT`）和「管理员」（`MANAGER`），**暂不支持「权限矩阵」** |
| **数据范围** | **暂不支持**「自定义部门」（`CUSTOM_DEPARTMENT`）和「自定义过滤条件」（`FORMULA`/`CUSTOM`） |
| **字段权限** | **暂不支持自定义字段权限**，如需配置请通过宜搭管理后台手动操作 |
