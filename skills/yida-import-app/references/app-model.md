# 导入模型

`yida-import-app` 会把线上应用归一化为一份本地应用模型，再输出到 PRD 和 cache。

## cache 文件结构

```json
{
  "appType": "APP_xxx",
  "appName": "薪资计算器",
  "corpId": "dingxxx",
  "baseUrl": "https://xxx.aliwork.com",
  "importedAt": "2026-03-12T12:00:00.000Z",
  "discovery": {
    "source": "remote",
    "usedManifest": false,
    "warnings": []
  },
  "pages": [
    {
      "name": "首页",
      "title": "首页",
      "type": "custom",
      "formUuid": "FORM-AAA",
      "url": "https://xxx.aliwork.com/APP_xxx/custom/FORM-AAA",
      "schemaSummary": {
        "schemaType": "superform",
        "componentCount": 6,
        "fieldCount": 0
      },
      "fields": {}
    },
    {
      "name": "薪资参数表",
      "title": "薪资参数表",
      "type": "form",
      "formUuid": "FORM-BBB",
      "url": "https://xxx.aliwork.com/APP_xxx/submission/FORM-BBB",
      "schemaSummary": {
        "schemaType": "superform",
        "componentCount": 14,
        "fieldCount": 6
      },
      "fields": {
        "月薪": {
          "fieldId": "numberField_xxx",
          "componentName": "NumberField",
          "required": true
        }
      }
    }
  ]
}
```

## 字段归一化规则

- `label` 作为业务字段名
- `fieldId` 保留宜搭原始 ID
- `componentName` 保留组件类型
- `required` 从 `validation` 或 `required` 推断
- `options` 仅在单选、多选、下拉等字段存在时输出

## PRD 输出规则

- PRD 记录业务语义和页面现状
- `.cache/<app>-schema.json` 记录表单 ID、字段 ID、导入元信息
- 原始完整 Schema 不写入 PRD，避免文档噪音

## 自动发现失败时的处理

1. 使用 manifest 明确给出页面清单
2. 再次运行导入
3. 保持 cache 中 `discovery.usedManifest = true`
