---
name: yida-sync-app
description: 同步已经接入到本地工作台的宜搭存量应用，重新拉取线上页面导航和 Schema，与本地 schema cache 对比，输出页面和字段差异，并覆盖更新本地 PRD 与 cache。适用于多人维护同一应用、线上结构已被改动、或本地上下文可能已经过期的场景。
---

# yida-sync-app

刷新本地镜像，让本地 PRD 与 schema cache 重新对齐线上结构。

## 技能定位

这个技能解决的是“本地结构已经过期”的问题。

它不会直接修改线上结构，只会：

1. 重新读取线上结构
2. 与本地旧 cache 对比
3. 覆盖更新本地 PRD 和 cache
4. 输出同步差异报告

## AI 阅读顺序

1. 先读本文件，确认当前任务是否属于“刷新本地镜像”
2. 需要理解同步差异的粒度时，读取 `references/sync-strategy.md`
3. 需要理解脚本实现时，读取：
   - `scripts/sync-app.js`
   - `../yida-import-app/scripts/app-import-lib.js`

## 适用场景

- 线上应用已被人工改过
- 多人同时维护同一个宜搭应用
- 本地 PRD 与线上结构疑似脱节
- 导入后过了一段时间，需要重新校准本地上下文

## 前提

- 目标应用必须已经通过 `yida-import-app` 导入过
- 本地必须存在对应的 `.cache/<app>-schema.json`

## 输入

支持两种方式指定目标应用：

1. 不传 `appType`
   - 打开浏览器，从“我的应用”列表中选择目标应用
2. 直接传入 `appType`
   - 适用于已明确知道目标应用 ID

也支持：

- `--manifest`：在自动发现不完整时兜底
- `--output-name`：自定义输出名

## 输出

- 覆盖更新 `prd/<app>.md`
- 覆盖更新 `.cache/<app>-schema.json`
- 生成 `prd/<app>-sync.md`

脚本同时会输出 JSON 结果到 `stdout`，包含：

- `schemaCachePath`
- `prdPath`
- `syncReportPath`
- `diff`

## 推荐命令

```bash
node skills/yida-sync-app/scripts/sync-app.js
```

不传 `appType` 时，会自动进入浏览器选应用模式。

## 其他命令

```bash
node skills/yida-sync-app/scripts/sync-app.js <appType> [--output-name 输出名]
node skills/yida-sync-app/scripts/sync-app.js --select-app [--output-name 输出名]
node skills/yida-sync-app/scripts/sync-app.js <appType> [--manifest 文件路径] [--output-name 输出名]
```

## 真实同步链路

当前版本会复用 `yida-import-app` 的真实发现链路：

- 在“我的应用”页获取可选应用
- 在应用后台页获取真实页面导航
- 拉取每个页面最新 Schema
- 对比本地旧 cache 和新结果
- 输出差异摘要并覆盖本地镜像

## 差异重点

同步重点关注以下变化：

- 页面新增/删除
- 页面类型变化
- 字段新增/删除
- 字段组件类型变化
- 字段必填状态变化

## 与其他技能的关系

- 上游依赖：`yida-import-app`
- 常见前置动作：先跑 `yida-analyze-app` 判断是否确实需要同步
- 常见后续动作：
  - 同步后重新分析：`yida-analyze-app`
  - 同步后继续开发：`yida-custom-page` / `yida-create-form-page`

## 读取哪些文件

- 必读：`scripts/sync-app.js`
- 需要理解同步策略与差异粒度时：`references/sync-strategy.md`
- 需要理解重新导入逻辑时：`../yida-import-app/scripts/app-import-lib.js`
