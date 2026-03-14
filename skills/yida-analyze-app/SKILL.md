---
name: yida-analyze-app
description: 分析已经导入到本地工作台的宜搭存量应用，读取本地 schema cache 和 PRD，输出页面结构、字段统计、风险信号与后续改造建议。适用于首次接管存量应用后建立上下文、评估结构复杂度、判断下一步该使用哪个技能的场景。
---

# yida-analyze-app

基于已经导入到本地的应用结构，生成一份适合后续 AI 开发使用的分析结果。

## 技能定位

这个技能解决的是“看懂当前应用结构”的问题，而不是重新导入或同步线上应用。

它依赖 `yida-import-app` 已经生成的本地产物：

- `.cache/<app>-schema.json`
- `prd/<app>.md`

## AI 阅读顺序

1. 先读本文件，确认当前任务是否属于“分析已导入应用”
2. 需要理解分析结果应该回答哪些问题时，读取 `references/analysis-report.md`
3. 需要理解脚本逻辑时，读取：
   - `scripts/analyze-app.js`
   - `../yida-import-app/scripts/app-import-lib.js`

## 适用场景

- 刚完成 `yida-import-app`，需要快速建立上下文
- 需要知道应用有多少页面、多少字段、主要风险是什么
- 需要判断下一步优先用 `yida-custom-page`、`yida-create-form-page` 还是 `yida-sync-app`
- 需要给后续 AI 开发生成一份结构摘要

## 前提

- 目标应用必须已经通过 `yida-import-app` 导入
- 本地必须存在对应的 `.cache/<app>-schema.json`

## 输入

支持两种方式指定目标应用：

1. 不传 `appType`
   - 打开浏览器，从“我的应用”列表中选择目标应用
   - 选择动作只用于确认目标应用，不会重新从线上拉 Schema
2. 直接传入 `appType`
   - 适用于已经明确知道要分析哪个应用

## 输出

- 默认输出 JSON 分析结果到 `stdout`
- 传入 `--write-prd-report` 时，额外生成 `prd/<app>-analysis.md`

JSON 输出重点包括：

- `stats`
- `risks`
- `recommendations`
- `reportPath`

## 推荐命令

```bash
node skills/yida-analyze-app/scripts/analyze-app.js --write-prd-report
```

不传 `appType` 时，会自动进入浏览器选应用模式。

## 其他命令

```bash
node skills/yida-analyze-app/scripts/analyze-app.js <appType> [--report-name 输出名] [--write-prd-report]
node skills/yida-analyze-app/scripts/analyze-app.js --select-app [--report-name 输出名] [--write-prd-report]
```

## 分析内容

- 页面数量与类型分布
- 字段总数、字段类型分布、必填字段数量
- 结构风险与潜在缺口
- 表单页与自定义页覆盖情况
- 后续适合使用的开发技能建议

## 与其他技能的关系

- 上游依赖：`yida-import-app`
- 下游常见动作：
  - 结构不完整：`yida-sync-app`
  - 字段不够或字段设计不合理：`yida-create-form-page update`
  - 页面体验优化：`yida-custom-page`

## 读取哪些文件

- 必读：`scripts/analyze-app.js`
- 需要理解报告目标和风险信号时：`references/analysis-report.md`
- 需要理解 cache 读取逻辑时：`../yida-import-app/scripts/app-import-lib.js`
