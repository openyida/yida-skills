---
name: yida-import-app
description: 导入并接管宜搭上已存在的应用，生成本地 PRD 和 schema cache，供后续 AI 分析、字段修改、自定义页面开发和同步使用。适用于首次接入线上存量应用、需要从“我的应用”中选择目标应用、或需要根据 manifest 兜底导入页面结构的场景。
---

# yida-import-app

将线上已有的宜搭应用接入当前工作台，并在本地生成可持续使用的结构上下文。

## 技能定位

这个技能解决的是“把存量应用带到本地”的问题，而不是直接修改线上应用。

完成导入后，后续技能可以基于本地产物继续工作：

- `yida-analyze-app`：分析当前应用结构
- `yida-sync-app`：刷新线上变更并输出差异
- `yida-custom-page`：开发或改造自定义页面
- `yida-create-form-page`：增量调整表单结构

## AI 阅读顺序

1. 先读本文件，确认当前任务是否属于“首次接入存量应用”
2. 需要理解 cache 结构和导入产物时，读取 `references/app-model.md`
3. 需要理解真实导入逻辑时，读取：
   - `scripts/import-app.js`
   - `scripts/app-import-lib.js`
   - `scripts/discover-live.py`

## 适用场景

- 线上已经有一个宜搭应用，需要接入到当前本地工作台
- 需要为存量应用生成 PRD 与 `.cache/<app>-schema.json`
- 后续准备对该应用做分析、同步、字段调整或自定义页面开发
- 自动发现页面不完整时，需要使用 manifest 兜底导入

## 输入

支持三种输入方式：

1. 不传 `appType`
   - 自动打开浏览器
   - 从“我的应用”列表中选择目标应用
2. 直接传入 `appType`
   - 适用于已经明确知道目标应用 ID
3. 传入 `appType + manifest`
   - 适用于自动发现页面不完整时手工兜底

## 输出

导入成功后会生成：

- `prd/<app>.md`
- `.cache/<app>-schema.json`

脚本同时会输出 JSON 结果到 `stdout`，包含：

- `success`
- `appType`
- `appName`
- `corpId`
- `pagesCount`
- `prdPath`
- `schemaCachePath`

## 推荐命令

```bash
node skills/yida-import-app/scripts/import-app.js
```

不传 `appType` 时，会自动进入浏览器选应用模式。

## 其他命令

```bash
node skills/yida-import-app/scripts/import-app.js <appType> [--output-name 输出名] [--force]
node skills/yida-import-app/scripts/import-app.js --select-app [--output-name 输出名] [--force]
node skills/yida-import-app/scripts/import-app.js <appType> [--manifest 文件路径] [--output-name 输出名] [--force]
```

## 执行顺序

1. 运行 `scripts/import-app.js`
2. 如果没有传 `appType`，脚本会打开浏览器应用选择器
3. 选择目标应用
4. 读取真实应用导航和页面结构
5. 拉取页面 Schema
6. 归一化生成本地 app model
7. 输出 PRD 和 schema cache

## manifest 何时使用

只有在以下情况才使用 `manifest`：

- 自动发现页面不完整
- 你已经明确知道要导入的页面清单
- 某些页面无法通过默认发现链路拿到

manifest 示例：

```json
{
  "appName": "薪资计算器",
  "pages": [
    {
      "name": "首页",
      "type": "custom",
      "formUuid": "FORM-AAA"
    },
    {
      "name": "薪资参数表",
      "type": "form",
      "formUuid": "FORM-BBB"
    }
  ]
}
```

## 真实导入链路

当前版本优先通过浏览器态发现真实结构：

- 在“我的应用”页读取真实应用列表
- 在应用后台页读取真实导航接口
- 再通过 HTTP 拉取每个页面的 `getFormSchema`

如果自动发现失败，再使用 `manifest` 补齐页面清单。

## 成功后的建议动作

1. 先运行 `yida-analyze-app` 生成结构分析
2. 再确认 PRD 是否需要补充业务描述
3. 如果线上结构可能会继续变化，后续使用 `yida-sync-app` 做同步
4. 如果需要开发页面或字段改造，再转到 `yida-custom-page` / `yida-create-form-page`

## 读取哪些文件

- 必读：`scripts/import-app.js`
- 主要逻辑：`scripts/app-import-lib.js`
- 浏览器选应用与真实发现：`scripts/discover-live.py`
- 需要理解本地 cache 结构时：`references/app-model.md`
