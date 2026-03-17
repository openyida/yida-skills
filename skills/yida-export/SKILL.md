---
name: yida-export
description: 宜搭应用导出技能，将应用下所有表单的完整 Schema 打包为可移植的迁移包（yida-export.json），用于跨环境应用迁移。
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
    - migration
    - export
    - api
---

# yida-export

导出宜搭应用的所有表单 Schema，生成可移植的迁移包，用于跨环境应用迁移。

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
  "version": "1.0",
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
  ]
}
```

## 前置条件

项目根目录下需存在 `.cache/cookies.json`（由 `yida-login` 生成）。
