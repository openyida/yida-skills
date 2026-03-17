---
name: yida-import
description: 宜搭应用导入技能，将 yida-export 导出的迁移包导入到目标宜搭环境，自动重建应用、所有表单页面和自定义页面，并生成含新旧 formUuid 映射的迁移报告。
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
    - import
    - api
---

# yida-import

将 `yida-export` 导出的应用迁移包导入到目标宜搭环境，自动重建应用、所有表单页面和自定义页面。

## 用法

```bash
node skills/yida-import/scripts/import.js <exportFile> [appName]
```

## 参数

- `exportFile`：导出文件路径（必填），由 `yida-export` 生成的 `yida-export.json`
- `appName`：目标应用名称（可选，默认使用导出包中的应用 ID 作为名称）

## 示例

```bash
# 使用默认应用名称
node skills/yida-import/scripts/import.js ./yida-export.json

# 指定目标应用名称
node skills/yida-import/scripts/import.js ./yida-export.json "质量追溯系统（生产环境）"
```

## 迁移流程

1. 读取导出包（`yida-export.json`）
2. 在目标环境创建新应用
3. 逐个重建表单页面（保留字段结构，生成新的 formUuid）
4. 逐个重建自定义页面（发布源码到新页面）
5. 输出迁移报告（新旧 formUuid 映射表）

## 迁移报告

导入完成后，会在当前目录生成 `yida-migration-report.json`：

```json
{
  "migratedAt": "ISO 时间戳",
  "sourceAppType": "APP_旧",
  "targetAppType": "APP_新",
  "formMapping": [
    {
      "sourceFormUuid": "FORM-旧",
      "targetFormUuid": "FORM-新",
      "formTitle": "表单名称",
      "status": "success"
    }
  ],
  "pageMapping": [
    {
      "sourceFormUuid": "PAGE-旧",
      "targetFormUuid": "PAGE-新",
      "pageTitle": "页面名称",
      "status": "success"
    }
  ]
}
```

## 自定义页面迁移

自定义页面的迁移包括：

| 内容 | 说明 |
|------|------|
| 源码 | 保留原始源码和编译后代码 |
| Schema | 重建页面结构 |
| 字段引用 | 自动替换 formUuid/fieldId（根据表单迁移映射） |

## 注意事项

- 关联表单（associationFormField）的跨表单引用在迁移后需要手动更新，迁移报告中提供了新旧 formUuid 映射供参考
- 流水号字段（SerialNumberField）的 formula 会自动适配新应用的 appType 和 formUuid
- 自定义页面中的字段引用会自动根据迁移报告进行替换
- 前置条件：项目根目录下需存在 `.cache/cookies.json`（由 `yida-login` 生成）

## 与其他技能配合

- **`yida-export`**：导出源应用的迁移包
- **`yida-login`**：登录态失效时自动调用
- **`yida-publish-page`**：发布自定义页面时复用其编译逻辑
