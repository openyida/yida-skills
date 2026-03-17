---
name: yida-export
description: 宜搭应用导出技能，将应用下所有表单 Schema 和自定义页面打包为可移植的迁移包（yida-export.json），用于跨环境应用迁移。
license: MIT
compatibility:
  - opencode
  - claude-code
metadata:
  audience: developers
  workflow: yida-development
  version: 1.1.0
  tags:
    - yida
    - low-code
    - migration
    - export
    - api
---

# yida-export

导出宜搭应用的所有表单 Schema 和自定义页面，生成可移植的迁移包，用于跨环境应用迁移。

## 用法

```bash
node skills/yida-export/scripts/export.js <appType> [outputFile]
```

## 参数

- `appType`：应用 ID（必填），如 `APP_XXX`
- `outputFile`：导出文件路径（可选，默认 `./yida-export.json`）

## 示例

```bash
# 导出到默认文件
node skills/yida-export/scripts/export.js APP_XXX

# 导出到指定文件
node skills/yida-export/scripts/export.js APP_XXX ./my-app-backup.json
```

## 导出格式

```json
{
  "version": "1.1",
  "exportedAt": "2026-03-17T00:00:00.000Z",
  "sourceAppType": "APP_XXX",
  "sourceBaseUrl": "https://www.aliwork.com",
  "forms": [
    {
      "formUuid": "FORM-XXX",
      "formTitle": "表单名称",
      "formType": "receipt",
      "schema": { ... }
    }
  ],
  "customPages": [
    {
      "formUuid": "FORM-YYY",
      "pageTitle": "页面名称",
      "pageType": "custom",
      "sourceCode": "// 页面源码...",
      "compiledCode": "// 编译后代码...",
      "schema": { ... }
    }
  ]
}
```

## 导出内容

| 类型 | 说明 |
|------|------|
| 表单 Schema | 所有表单页面的完整 Schema（字段定义、布局、校验规则等） |
| 自定义页面 | 自定义页面的源码和编译后代码 |
| 页面配置 | 自定义页面的配置信息（公开访问、分享 URL 等） |

## 前置条件

项目根目录下需存在 `.cache/cookies.json`（由 `yida-login` 生成）。

## 注意事项

- 导出的表单 Schema 包含完整的字段定义和布局信息
- 自定义页面会同时导出源码和编译后的代码
- 关联表单（associationFormField）的引用关系会保留在 Schema 中，导入时需要根据迁移报告手动更新
- 流水号字段（SerialNumberField）的 formula 会在导入时自动适配新应用

## 与其他技能配合

- **`yida-import`**：将导出的迁移包导入到目标环境
- **`yida-login`**：登录态失效时自动调用
