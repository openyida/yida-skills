---
name: yida-create-form-page
description: 宜搭表单页面创建与更新技能，支持创建新表单（saveFormSchemaInfo + saveFormSchema + updateFormConfig）和更新已有表单（getFormSchema + saveFormSchema + updateFormConfig），支持 19 种字段类型（含 SerialNumberField 流水号）和字段增删改操作。
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
    - form
    - schema
---

# 宜搭表单页面创建与更新技能

## 概述

本技能描述如何通过 HTTP 请求调用宜搭接口**创建**或**更新**表单页面。支持两种模式：

- **create 模式**：创建新表单页面，定义字段列表、字段类型、选项等。先创建空白表单获取 formUuid，再保存表单 Schema。
- **update 模式**：更新已有表单页面，支持对字段进行增删改、调整属性等操作。先获取现有 Schema，应用修改后保存。

## 何时使用

当以下场景发生时使用此技能：
- 用户需要在应用中创建数据收集表单（如报名表、调查表）
- 用户需要创建带有字段的表单页面来存储数据
- 用户需要更新已有表单的字段（增删改）
- 已通过 yida-create-app 创建应用后，需要创建表单来收集数据

## 使用示例

### 示例 1：创建新表单
**场景**：在应用中创建一个简单的用户信息表单
**命令**：
```bash
node .claude/skills/yida-create-form-page/scripts/create-form-page.js create "APP_XXX" "用户信息表" '[{"type":"TextField","label":"姓名","required":true},{"type":"SelectField","label":"部门","options":["技术部","产品部"]}]'
```
**输出**：
```json
{"success":true,"formUuid":"FORM-XXX","formTitle":"用户信息表","appType":"APP_XXX","fieldCount":2}
```

### 示例 2：更新已有表单
**场景**：为已存在的表单添加新字段
**命令**：
```bash
node .claude/skills/yida-create-form-page/scripts/create-form-page.js update "APP_XXX" "FORM-XXX" '[{"action":"add","field":{"type":"TextField","label":"备注"}}]'
```

## 使用方式

### create 模式（创建新表单）

```bash
node .claude/skills/yida-create-form-page/scripts/create-form-page.js create <appType> <formTitle> <fieldsJsonOrFile>
```

**参数说明**：

| 参数 | 必填 | 说明 |
| --- | --- | --- |
| `appType` | 是 | 应用 ID，如 `APP_XXX` |
| `formTitle` | 是 | 表单名称 |
| `fieldsJsonOrFile` | 是 | 字段定义，支持两种格式：JSON 字符串（以 `[` 开头）或 JSON 文件路径 |

**示例**：

```bash
node .claude/skills/yida-create-form-page/scripts/create-form-page.js create "APP_xxx" "图片生成表" .claude/skills/yida-create-form-page/scripts/fields.json
```

**输出**：日志输出到 stderr，JSON 结果输出到 stdout：

```json
{"success":true,"formUuid":"FORM-XXX","formTitle":"图片生成表","appType":"APP_xxx","fieldCount":4,"url":"{base_url}/APP_xxx/workbench/FORM-XXX"}
```

### update 模式（更新已有表单）

```bash
node .claude/skills/yida-create-form-page/scripts/create-form-page.js update <appType> <formUuid> <changesJsonOrFile>
```

**参数说明**：

| 参数 | 必填 | 说明 |
| --- | --- | --- |
| `appType` | 是 | 应用 ID，如 `APP_XXX` |
| `formUuid` | 是 | 表单页面的唯一标识，如 `FORM-XXX` |
| `changesJsonOrFile` | 是 | 修改定义，支持两种格式：JSON 字符串（以 `[` 开头自动识别）或 JSON 文件路径 |

**示例（JSON 字符串，推荐）**：

```bash
node .claude/skills/yida-create-form-page/scripts/create-form-page.js update "APP_xxx" "FORM-yyy" '[{"action":"add","field":{"type":"TextField","label":"备注"}}]'
```

**示例（JSON 文件）**：

```bash
node .claude/skills/yida-create-form-page/scripts/create-form-page.js update "APP_xxx" "FORM-yyy" changes.json
```

**输出**：日志输出到 stderr，JSON 结果输出到 stdout：

```json
{"success":true,"formUuid":"FORM-YYY","appType":"APP_XXX","changesApplied":3,"changes":[...],"url":"https://www.aliwork.com/APP_XXX/workbench/FORM-YYY"}
```

## 字段定义 JSON 格式

字段定义是一个 JSON 数组，每个元素描述一个字段。**支持两种格式**：

### 格式一（推荐）

直接在对象中定义 `type` 和 `label`：

```json
[
  { "type": "TextField", "label": "姓名", "required": true },
  { "type": "SelectField", "label": "部门", "options": ["技术部", "产品部", "设计部"] },
  { "type": "DateField", "label": "入职日期" }
]
```

### 格式二（兼容）

将字段属性放在 `field` 子对象中：

```json
[
  { "field": { "type": "TextField", "label": "姓名" }, "required": true },
  { "field": { "type": "SelectField", "label": "部门", "options": ["技术部"] } }
]
```

> 两种格式效果相同，推荐使用格式一，更简洁。

**字段属性**：

| 属性 | 类型 | 必填 | 说明 |
| --- | --- | --- | --- |
| `type` | String | 是 | 字段类型（见下方支持的字段类型） |
| `label` | String | 是 | 字段标签 |
| `required` | Boolean | 否 | 是否必填，**默认 `false`（非必填）** |
| `placeholder` | String | 否 | 占位提示文本 |
| `behavior` | String | 否 | 字段行为，`NORMAL`（正常，默认）/ `READONLY`（只读）/ `HIDDEN`（隐藏） |
| `visibility` | String[] | 否 | 显示端，`["PC", "MOBILE"]`（默认）/ `["PC"]`（仅 PC）/ `["MOBILE"]`（仅移动端） |
| `labelAlign` | String | 否 | 标签对齐方式，`top`（默认）/ `left` / `right` |
| `options` | String[] | 条件必填 | 选项列表，选项类字段必填 |
| `multiple` | Boolean | 否 | 是否多选，`EmployeeField`/`DepartmentSelectField`/`CountrySelectField`/`AssociationFormField` 可用 |
| `children` | Object[] | 条件必填 | 子字段列表，`TableField` 必填 |
| `associationForm` | Object | 条件必填 | 关联表单配置对象，`AssociationFormField` 必填，详见下方说明 |

### 各字段类型默认属性

以下列出各字段类型创建时自动设置的**特有**默认属性（通用属性如 `fieldId`、`label`、`behavior`、`visibility` 等所有字段共享，不再重复列出）。

#### TextField / TextareaField

| 属性 | 默认值 | 说明 |
| --- | --- | --- |
| `validationType` | `"text"` | 校验类型 |
| `maxLength` | `200` | 最大字符数 |
| `hasClear` | `true` | 显示清除按钮 |
| `isCustomStore` | `true` | 自定义存储 |
| `scanCode.enabled` | `false` | 扫码输入 |

#### NumberField

| 属性 | 默认值 | 说明 |
| --- | --- | --- |
| `precision` | `0` | 小数位数 |
| `step` | `1` | 步进值 |
| `thousandsSeparators` | `false` | 千分位分隔符 |
| `isCustomStore` | `true` | 自定义存储 |
| `innerAfter` | "" | 单位 |


#### RateField

| 属性 | 默认值 | 说明 |
| --- | --- | --- |
| `count` | `5` | 星级总数 |
| `allowHalf` | `false` | 允许半星 |
| `showGrade` | `false` | 显示等级文案 |

#### RadioField / CheckboxField

| 属性 | 默认值 | 说明 |
| --- | --- | --- |
| `dataSourceType` | `"custom"` | 数据源类型 |
| `valueType` | `"custom"` | 值类型 |

#### SelectField / MultiSelectField

| 属性 | 默认值 | 说明 |
| --- | --- | --- |
| `showSearch` | `true` | 支持搜索 |
| `autoWidth` | `true` | 自动宽度 |
| `filterLocal` | `true` | 本地过滤 |
| `mode` | `"single"` / `"multiple"` | 选择模式 |

#### DateField

| 属性 | 默认值 | 说明 |
| --- | --- | --- |
| `format` | `"YYYY-MM-DD"` | 日期格式 |
| `hasClear` | `true` | 显示清除按钮 |
| `resetTime` | `false` | 重置时间 |
| `disabledDate.type` | `"none"` | 禁用日期规则 |
format 格式：
- `"YYYY"`：年
- `"YYYY-MM"`：年-月
- `"YYYY-MM-DD"`：年-月-日
- `"YYYY-MM-DD HH:mm"`：年-月-日 时分
- `"YYYY-MM-DD HH:mm:ss"`：年-月-日 时分秒


#### CascadeDateField

| 属性 | 默认值 | 说明 |
| --- | --- | --- |
| `format` | `"YYYY-MM-DD"` | 日期格式 |
| `hasClear` | `true` | 显示清除按钮 |
| `resetTime` | `false` | 重置时间 |
format 格式：
- `"YYYY"`：年
- `"YYYY-MM"`：年-月
- `"YYYY-MM-DD"`：年-月-日
- `"YYYY-MM-DD HH:mm"`：年-月-日 时分
- `"YYYY-MM-DD HH:mm:ss"`：年-月-日 时分秒


#### EmployeeField

| 属性 | 默认值 | 说明 |
| --- | --- | --- |
| `userRangeType` | `"ALL"` | 人员范围 |
| `showEmpIdType` | `"NAME"` | 显示方式 |
| `startWithDepartmentId` | `"SELF"` | 起始部门 |
| `renderLinkForView` | `true` | 查看时渲染链接 |
| `closeOnSelect` | `false` | 选择后关闭 |

#### DepartmentSelectField

| 属性 | 默认值 | 说明 |
| --- | --- | --- |
| `deptRangeType` | `"ALL"` | 部门范围 |
| `mode` | `"single"` | 选择模式 |
| `isShowDeptFullName` | `false` | 显示部门全路径 |
| `hasSelectAll` | `false` | 全选按钮 |

#### CountrySelectField

| 属性 | 默认值 | 说明 |
| --- | --- | --- |
| `mode` | `"single"` | 选择模式 |
| `showSearch` | `true` | 支持搜索 |
| `hasSelectAll` | `false` | 全选按钮 |

#### AddressField

| 属性 | 默认值 | 说明 |
| --- | --- | --- |
| `countryMode` | `"default"` | 国家模式 |
| `addressType` | `"ADDRESS"` | 地址类型 |
| `enableLocation` | `true` | 启用定位 |
| `showCountry` | `false` | 显示国家 |

#### AttachmentField

| 属性 | 默认值 | 说明 |
| --- | --- | --- |
| `listType` | `"text"` | 列表展示类型 |
| `multiple` | `true` | 允许多文件 |
| `limit` | `9` | 最大文件数 |
| `maxFileSize` | `100` | 最大文件大小(MB) |
| `autoUpload` | `true` | 自动上传 |
| `onlineEdit` | `false` | 在线编辑 |

#### ImageField

| 属性 | 默认值 | 说明 |
| --- | --- | --- |
| `listType` | `"image"` | 列表展示类型 |
| `multiple` | `true` | 允许多图片 |
| `limit` | `9` | 最大图片数 |
| `maxFileSize` | `50` | 最大文件大小(MB) |
| `accept` | `"image/*"` | 接受文件类型 |
| `enableCameraDate` | `true` | 拍照水印日期 |
| `enableCameraLocation` | `true` | 拍照水印定位 |
| `onlyCameraUpload` | `false` | 仅拍照上传 |

#### TableField

| 属性 | 默认值 | 说明 |
| --- | --- | --- |
| `showIndex` | `true` | 显示行号 |
| `pageSize` | `20` | 每页行数 |
| `maxItems` | `500` | 最大行数 |
| `minItems` | `1` | 最小行数 |
| `layout` | `"TABLE"` | PC 端布局 |
| `mobileLayout` | `"TILED"` | 移动端布局 |
| `theme` | `"split"` | 表格主题 |
| `showActions` | `true` | 显示操作列 |
| `showDelAction` | `true` | 显示删除按钮 |
| `showCopyAction` | `false` | 显示复制按钮 |
| `enableExport` | `true` | 允许导出 |
| `enableImport` | `true` | 允许导入 |
| `enableBatchDelete` | `false` | 批量删除 |
| `enableSummary` | `false` | 启用汇总 |
| `isFreezeOperateColumn` | `true` | 冻结操作列 |

#### AssociationFormField

> 详细用法参考 `reference/AssociationFormField.md`

#### SerialNumberField

| 属性 | 默认值 | 说明 |
| --- | --- | --- |
| `serialNumberRule` | 默认规则（前缀+自动递增） | 流水号生成规则数组 |
| `serialNumPreview` | `"serial00001"` | 流水号预览 |
| `serialNumReset` | `1` | 重置起始值 |
| `syncSerialConfig` | `false` | 是否同步流水号配置 |
| `formula` | 自动生成 | 流水号公式（由系统自动生成，包含 corpId、appType、formUuid、fieldId 和规则配置） |

**默认流水号规则**：
- 规则1：固定前缀 "serial"（4位）
- 规则2：自动递增数字（5位，从1开始，不重置）

**formula 格式**（对象格式，不是字符串）：
```json
{
  "formula": {
    "expression": "SERIALNUMBER(\"<corpId>\", \"<appType>\", \"<formUuid>\", \"<fieldId>\", \"<escapedRuleJson>\")"
  }
}
```

其中 `<escapedRuleJson>` 是 `{ "type": "custom", "value": <serialNumberRule数组> }` 的 JSON 字符串，需对双引号转义（`"` → `\"`）。

## 修改定义 JSON 格式（update 模式）

修改定义是一个 JSON 数组，每个元素描述一条修改操作。可以直接作为命令行参数传入 JSON 字符串，也可以写入文件后传入文件路径。

```json
[
  { "action": "add", "field": { "type": "TextField", "label": "姓名", "required": true } },
  { "action": "add", "field": { "type": "SelectField", "label": "部门", "options": ["技术部", "产品部"] }, "after": "姓名" },
  { "action": "delete", "label": "备注" },
  { "action": "update", "label": "年龄", "changes": { "required": true, "placeholder": "请输入年龄" } },
  { "action": "update", "label": "状态", "changes": { "label": "审批状态", "options": ["待审批", "已通过", "已拒绝"] } }
]
```

### 操作类型

| 操作 | 必填属性 | 可选属性 | 说明 |
| --- | --- | --- | --- |
| `add` | `field.type`, `field.label` | `after`, `before`, `field.required`, `field.options`, `field.placeholder`, `field.multiple`, `field.children`, `field.behavior`, `field.visibility`, `field.labelAlign` | 新增字段，`after`/`before` 指定插入位置（按字段标签匹配） |
| `delete` | `label` | — | 删除指定标签的字段 |
| `update` | `label`, `changes` | `tableLabel` | 修改指定标签字段的属性；若字段在子表内，需通过 `tableLabel` 指定父子表标签 |

### update 的 changes 支持的属性

| 属性 | 类型 | 说明 |
| --- | --- | --- |
| `label` | String | 修改字段标签 |
| `required` | Boolean | 修改是否必填 |
| `placeholder` | String | 修改占位提示 |
| `options` | String[] | 修改选项列表（选项类字段：RadioField/SelectField/CheckboxField/MultiSelectField） |
| `multiple` | Boolean | 修改是否多选（EmployeeField/DepartmentSelectField/CountrySelectField） |
| `behavior` | String | 修改字段行为：`NORMAL` / `READONLY` / `HIDDEN` |
| `visibility` | String[] | 修改显示端：`["PC", "MOBILE"]` / `["PC"]` / `["MOBILE"]` |
| `innerAfter` | String | 修改数字字段单位（仅 `NumberField` 可用），如 `"H"`、`"元"` |

### add 的 field 字段定义

与 create 模式的字段定义格式完全一致，参见上方「字段定义 JSON 格式」章节。

## 前置依赖

- Node.js
- 项目根目录存在 `.cache/cookies.json`（首次运行会自动触发扫码登录）

## 调用流程

### create 模式

1. 准备字段定义 JSON 文件
2. 读取项目根目录的 `.cache/cookies.json` 获取登录态（包含 corpId）；若不存在则自动调用 `login.py` 触发扫码登录
3. 调用 `saveFormSchemaInfo` 接口创建空白表单，获取 formUuid；根据响应体 `errorCode` 自动处理异常（详见 `yida-login` 技能文档「错误处理机制」章节）
4. 根据字段定义生成表单 Schema JSON（SerialNumberField 的 formula 会自动使用 corpId、appType、formUuid 和 fieldId 构建）
5. 调用 `saveFormSchema` 接口保存 Schema；同样根据响应体 `errorCode` 自动处理异常
6. 调用 `updateFormConfig` 接口更新表单配置（MINI_RESOURCE = 0）；同样根据响应体 `errorCode` 自动处理异常

### update 模式

1. 读取项目根目录的 `.cache/cookies.json` 获取登录态（包含 corpId）；若不存在则自动调用 `login.py` 触发扫码登录
2. 调用 `getFormSchema` 接口获取当前表单的完整 Schema；根据响应体 `errorCode` 自动处理异常：
   - `errorCode: "TIANSHU_000030"`（csrf 校验失败）→ 自动刷新 csrf_token 后重试
   - `errorCode: "307"`（登录过期）→ 自动重新登录后重试
3. 解析修改定义（JSON 字符串或 JSON 文件）
4. 按顺序执行每条修改操作：
   - **add**：构建新字段组件，插入到指定位置（或末尾）
   - **delete**：按标签查找并移除字段
   - **update**：按标签查找字段并更新其属性
5. 为所有 SerialNumberField 设置 formula（使用 corpId、appType、formUuid 和 fieldId）
6. 调用 `saveFormSchema` 接口保存修改后的 Schema；同样根据响应体 `errorCode` 自动处理异常（同上）
7. 调用 `updateFormConfig` 接口更新表单配置（MINI_RESOURCE = 0）；同样根据响应体 `errorCode` 自动处理异常（同上）

## 文件结构

```
yida-create-form-page/
├── SKILL.md                    # 本文档
└── scripts/
    ├── create-form-page.js     # 表单页面创建 & 更新脚本
```

## 接口说明

### saveFormSchemaInfo（创建空白表单，create 模式）

- **地址**：`POST /dingtalk/web/{appType}/query/formdesign/saveFormSchemaInfo.json`
- **Content-Type**：`application/x-www-form-urlencoded`
- **参数**：

| 参数 | 类型 | 必填 | 说明 |
| --- | --- | --- | --- |
| `_csrf_token` | String | 是 | CSRF Token（由 yida-login 获取） |
| `formType` | String | 是 | 表单类型，固定 `receipt` |
| `title` | String (JSON) | 是 | 表单名称，i18n 格式：`{"zh_CN":"名称","en_US":"名称","type":"i18n"}` |

- **返回值**：

```json
{
  "content": { "formUuid": "FORM-XXX" },
  "success": true
}
```

### getFormSchema（获取表单 Schema，update 模式）

- **地址**：`GET /alibaba/web/{appType}/_view/query/formdesign/getFormSchema.json`
- **参数**：

| 参数 | 类型 | 必填 | 说明 |
| --- | --- | --- | --- |
| `formUuid` | String | 是 | 表单 UUID |
| `schemaVersion` | String | 否 | Schema 版本，默认 `V5` |

- **返回值**：完整的表单 Schema JSON，包含 `pages` 数组，结构与 `saveFormSchema` 保存的格式一致

### saveFormSchema（保存表单 Schema，两种模式共用）

- **地址**：`POST /dingtalk/web/{appType}/_view/query/formdesign/saveFormSchema.json`
- **Content-Type**：`application/x-www-form-urlencoded`
- **参数**：

| 参数 | 类型 | 必填 | 说明 |
| --- | --- | --- | --- |
| `_csrf_token` | String | 是 | CSRF Token（由 yida-login 获取） |
| `formUuid` | String | 是 | 表单 UUID |
| `content` | String (JSON) | 是 | 表单 Schema 内容（`schemaType: "superform"`） |
| `schemaVersion` | String | 是 | 固定 `V5` |
| `importSchema` | String | 是 | 固定 `"true"` |

- **返回值**：

```json
{ "success": true }
```

### updateFormConfig（更新表单配置）

- **地址**：`POST /dingtalk/web/{appType}/query/formdesign/updateFormConfig.json`
- **Content-Type**：`application/x-www-form-urlencoded`
- **参数**：

| 参数 | 类型 | 必填 | 说明 |
| --- | --- | --- | --- |
| `_csrf_token` | String | 是 | CSRF Token（由 yida-login 获取） |
| `formUuid` | String | 是 | 表单 UUID |
| `version` | Number | 是 | 版本号（新创建的表单从 1 开始） |
| `configType` | String | 是 | 固定 `MINI_RESOURCE` |
| `value` | Number | 是 | 固定 `0`（表单页面配置值） |

- **返回值**：

```json
{
  "success": true,
  "traceId": null,
  "throwable": null,
  "errorCode": null,
  "content": null,
  "errorMsg": null
}
```

## 支持的字段类型

| 字段类型 | componentName | 说明 | 特殊属性 |
| --- | --- | --- | --- |
| `TextField` | TextField | 单行文本，用于姓名、标题、编号等 | — |
| `TextareaField` | TextareaField | 多行文本，用于描述、备注等 | — |
| `RadioField` | RadioField | 单选，用于性别、状态等互斥选项 | `options` |
| `SelectField` | SelectField | 下拉单选，适合选项较多（>5）的场景 | `options` |
| `CheckboxField` | CheckboxField | 多选，用于兴趣爱好、技能标签等 | `options` |
| `MultiSelectField` | MultiSelectField | 下拉多选，适合选项较多（>5）的场景 | `options` |
| `NumberField` | NumberField | 数字，用于金额、数量、年龄等 | — |
| `RateField` | RateField | 评分，用于满意度评价等星级打分 | — |
| `DateField` | DateField | 日期，用于生日、截止日期等 | — |
| `CascadeDateField` | CascadeDateField | 级联日期，用于日期范围选择 | — |
| `EmployeeField` | EmployeeField | 成员，选择组织内成员 | `multiple` |
| `DepartmentSelectField` | DepartmentSelectField | 部门，选择组织内部门 | `multiple` |
| `CountrySelectField` | CountrySelectField | 国家，选择国家/地区 | `multiple` |
| `AddressField` | AddressField | 地址，用于收货地址等 | — |
| `AttachmentField` | AttachmentField | 附件上传 | — |
| `ImageField` | ImageField | 图片上传 | — |
| `TableField` | TableField | 表格（子表），用于结构化数据 | `children` |
| `AssociationFormField` | AssociationFormField | 关联表单 | `associationForm` |
| `SerialNumberField` | SerialNumberField | 流水号，自动生成唯一编号 | `serialNumberRule` |

## 与其他技能配合

1. **创建应用** → 使用 `yida-create-app` 技能获取 `appType`
2. **创建表单页面** → 本技能（create 模式），获取 `formUuid` 和字段 ID
3. **更新表单页面** → 本技能（update 模式），对已有表单进行字段增删改
4. **获取表单 Schema** → 可使用 `get-schema` 技能预先查看当前表单结构
5. **记录配置** → 将 `formUuid` 和字段 ID 写入 `prd/<项目名>.md`
6. **创建自定义页面** → 使用 `yida-create-page` 技能
7. **部署页面代码** → 使用 `yida-publish` 技能

> **提示**：如果需要创建的是自定义展示页面（无字段，用于部署 JSX 代码），请使用 `yida-create-page` 技能。

## 表单数据操作 API

> 以下 API 用于在自定义页面或脚本中对表单数据进行增删改查，通过 `this.utils.yida.<方法名>(params)` 调用，所有接口返回 Promise。

### saveFormData — 新建表单实例

| 参数 | 类型 | 必填 | 说明 |
| --- | --- | --- | --- |
| `formUuid` | String | 是 | 表单 UUID |
| `appType` | String | 是 | 应用 ID |
| `formDataJson` | String | 是 | 表单数据（JSON 字符串） |

```javascript
this.utils.yida.saveFormData({
  formUuid: 'FORM-XXX',
  appType: window.pageConfig.appType,
  formDataJson: JSON.stringify({
    textField_xxx: '单行文本',
    numberField_xxx: 100,
  }),
}).then(function(res) {
  console.log('新建成功，实例ID:', res.result);
}).catch(function(err) {
  console.error('新建失败:', err.message);
});
```

### updateFormData — 更新表单实例

| 参数 | 类型 | 必填 | 说明 |
| --- | --- | --- | --- |
| `formInstId` | String | 是 | 表单实例 ID |
| `updateFormDataJson` | String | 是 | 需要更新的字段（JSON 字符串） |

```javascript
this.utils.yida.updateFormData({
  formInstId: 'FINST-XXX',
  updateFormDataJson: JSON.stringify({ textField_xxx: '新值' }),
});
```

### deleteFormData — 删除表单实例

| 参数 | 类型 | 必填 | 说明 |
| --- | --- | --- | --- |
| `formUuid` | String | 是 | 表单 UUID |
| `formInstId` | String | 是 | 表单实例 ID |

### getFormDataById — 查询单条实例详情

| 参数 | 类型 | 必填 | 说明 |
| --- | --- | --- | --- |
| `formInstId` | String | 是 | 表单实例 ID |

### searchFormDatas — 按条件搜索实例列表

| 参数 | 类型 | 必填 | 说明 |
| --- | --- | --- | --- |
| `formUuid` | String | 是 | 表单 UUID |
| `searchFieldJson` | String | 否 | 按字段值筛选（JSON 字符串） |
| `currentPage` | Number | 否 | 当前页，默认 1 |
| `pageSize` | Number | 否 | 每页记录数，默认 10，**最大 100** |

```javascript
this.utils.yida.searchFormDatas({
  formUuid: 'FORM-XXX',
  searchFieldJson: JSON.stringify({ textField_xxx: '查询值' }),
  currentPage: 1,
  pageSize: 10,
}).then(function(res) {
  // res.data: 实例列表，res.totalCount: 总数
  console.log('查询结果:', res.data);
});
```

### searchFormDataIds — 按条件搜索实例 ID 列表

参数同 `searchFormDatas`，返回实例 ID 数组（适合批量操作场景）。

### getFormComponentDefinationList — 获取表单字段定义

| 参数 | 类型 | 必填 | 说明 |
| --- | --- | --- | --- |
| `formUuid` | String | 是 | 表单 UUID |

---

## 注意事项
- **临时文件写在当前工程根目录的 .cache 文件夹中，如果没有就创建一个文件夹，注意不要写在系统的其他文件夹中**
- update 模式中，修改定义 JSON 的操作按顺序执行，注意操作间的依赖关系（如先删后加）
- 字段匹配基于中文标签（`label.zh_CN`），确保标签名称准确
- 新增字段时会自动更新 `componentsMap`，无需手动处理
- 建议在重要修改前先通过 `get-schema` 技能查看当前 Schema 结构
- 脚本兼容旧的 create 模式调用方式（不带 `create` 前缀），但推荐使用新的显式模式参数

## EmployeeField 设置默认值为当前登录人

`create-form-page.js` 的 update 模式不支持直接设置 EmployeeField 的"当前登录人"默认值，需要在 update 之后通过直接修改 Schema 的方式实现。

### 正确的 Schema 配置格式

宜搭 EmployeeField 设置默认值为当前登录人，需要同时修改以下三个属性（通过 `getFormSchema` 获取 Schema 后直接修改对应字段的 props，再调用 `saveFormSchema` 保存）：

```json
{
  "valueType": "variable",
  "complexValue": {
    "complexType": "formula",
    "formula": "USER()",
    "value": []
  },
  "variable": {
    "type": "user"
  }
}
```

> ⚠️ 注意：`formula` 必须是 `"USER()"`，不是 `"CURRENT_USER()"`（后者会被宜搭拒绝，报"表达式解析失败"错误）。

### 修改步骤

1. 调用 `getFormSchema` 获取当前 Schema（返回结构为 `{ success, content: { pages, ... } }`）
2. 在 `content` 对象中递归找到目标 `fieldId` 的字段节点
3. 将上述三个属性写入该字段节点
4. 调用 `saveFormSchema` 传入修改后的 `content`（注意：传的是 `content` 对象，不是整个响应体）
5. 调用 `updateFormConfig` 更新表单配置

## SerialNumberField 流水号规则详解

### 默认场景（无自定义需求）

只有一条 `autoCount` 规则，4 位自增，从 1 开始，不重置：

```json
{
  "serialNumberRule": [
    {
      "resetPeriod": "noClean",
      "dateFormat": "yyyyMMdd",
      "ruleType": "autoCount",
      "timeZone": "+8",
      "__sid": "item_auto_count",
      "__hide_delete__": true,
      "__sid__": "serial_auto_count",
      "digitCount": "4",
      "isFixed": true,
      "initialValue": 1,
      "content": "",
      "formField": ""
    }
  ],
  "serialNumPreview": "0001"
}
```

> ⚠️ 注意：默认场景的 `autoCount` 规则 `__hide_delete__` 必须为 `true`（不可删除），`digitCount` 为字符串 `"4"`。

### 自定义场景（多规则组合）

支持以下 4 种规则类型，可任意组合排列：

| `ruleType` | 说明 | 关键字段 |
| --- | --- | --- |
| `autoCount` | 自动计数（自增数字） | `digitCount`（位数，字符串）、`initialValue`（起始值）、`resetPeriod`（重置周期） |
| `character` | 固定字符 | `content`（固定字符串内容） |
| `date` | 提交日期 | `dateFormat`（日期格式，如 `"yy"`、`"yyyyMMdd"`） |
| `form` | 取表单字段值 | `formField`（字段 fieldId） |

**自定义规则通用结构**：

```json
{
  "resetPeriod": "noClean",
  "dateFormat": "yyyyMMdd",
  "ruleType": "<类型>",
  "timeZone": "+8",
  "__sid": "item_<唯一id>",
  "__hide_delete__": false,
  "__sid__": "serial_<唯一id>",
  "digitCount": 4,
  "isFixed": true,
  "initialValue": 1,
  "content": "<固定字符，仅 character 类型填写>",
  "formField": "<字段fieldId，仅 form 类型填写>",
  "isFixedTips": "",
  "resetPeriodTips": ""
}
```

> ⚠️ 注意：自定义规则中 `digitCount` 为**数字**类型（不是字符串），`__hide_delete__` 为 `false`；而默认 `autoCount` 规则的 `digitCount` 是**字符串** `"4"`，`__hide_delete__` 为 `true`。

**`resetPeriod` 重置周期可选值**：

| 值 | 说明 |
| --- | --- |
| `"noClean"` | 不重置（永久自增） |
| `"day"` | 每天重置 |
| `"month"` | 每月重置 |
| `"year"` | 每年重置 |

**`dateFormat` 日期格式可选值**（`date` 类型规则）：

| 值 | 示例 |
| --- | --- |
| `"yy"` | `26`（年份后两位） |
| `"yyyy"` | `2026` |
| `"yyyyMM"` | `202603` |
| `"yyyyMMdd"` | `20260311` |

**示例：`YY-提交日期-自动计数4位` 的规则配置**：

```json
{
  "serialNumberRule": [
    {
      "ruleType": "character",
      "content": "YY",
      "dateFormat": "yyyyMMdd", "timeZone": "+8",
      "resetPeriod": "noClean", "digitCount": 4,
      "isFixed": true, "initialValue": 1,
      "isFixedTips": "", "resetPeriodTips": "",
      "formField": "",
      "__sid": "item_char_yy", "__sid__": "serial_char_yy", "__hide_delete__": false
    },
    {
      "ruleType": "date",
      "content": "",
      "dateFormat": "yy", "timeZone": "+8",
      "resetPeriod": "noClean", "digitCount": 4,
      "isFixed": true, "initialValue": 1,
      "isFixedTips": "", "resetPeriodTips": "",
      "formField": "",
      "__sid": "item_date_yy", "__sid__": "serial_date_yy", "__hide_delete__": false
    },
    {
      "ruleType": "autoCount",
      "content": "",
      "dateFormat": "yyyyMMdd", "timeZone": "+8",
      "resetPeriod": "noClean", "digitCount": 4,
      "isFixed": true, "initialValue": 1,
      "isFixedTips": "", "resetPeriodTips": "",
      "formField": "",
      "__sid": "item_auto", "__sid__": "serial_auto", "__hide_delete__": true
    }
  ],
  "serialNumPreview": "YY260001"
}
```

### formula 构建规则

`formula` 必须是**对象格式**（不是字符串），`expression` 的最后一个参数是 `{ "type": "custom", "value": <serialNumberRule数组> }` 的 JSON 字符串，需对双引号转义：

```javascript
var ruleJson = JSON.stringify({ type: 'custom', value: serialNumberRule });
var escapedRuleJson = ruleJson.replace(/\\/g, '\\\\').replace(/"/g, '\\"');
var expression = 'SERIALNUMBER("' + corpId + '", "' + appType + '", "' + formUuid + '", "' + fieldId + '", "' + escapedRuleJson + '")';
obj.formula = { expression: expression };
```
