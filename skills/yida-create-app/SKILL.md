---
name: yida-create-app
description: 宜搭应用创建技能，通过调用 registerApp 接口快速创建宜搭应用，支持自定义应用名称、描述和图标。
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
    - app
---

# 宜搭应用创建技能

## 概述

本技能描述如何通过 HTTP 请求调用宜搭 `registerApp` 接口创建应用，返回应用 ID（appType）。创建应用是搭建宜搭应用的第一步，后续可在应用下创建表单页面和自定义页面。

## 何时使用

当以下场景发生时使用此技能：
- 用户需要创建新的宜搭应用
- 用户想要通过 AI 一句话生成宜搭应用
- 开始一个新的宜搭项目开发流程

## 使用示例

### 示例 1：基础用法
**场景**：创建一个简单的宜搭应用
**命令**：
```bash
yidacli create-app "考勤管理"
```
**输出**：
```json
{"success":true,"appType":"APP_XXX","appName":"考勤管理","url":"{base_url}/APP_XXX/admin"}
```

### 示例 2：完整参数
**场景**：创建带描述和图标的应用
**命令**：
```bash
yidacli create-app "考勤管理" "员工考勤打卡系统" "xian-daka" "#00B853"
```

## 使用方式

```bash
yidacli create-app <appName> [description] [icon] [iconColor]
```

**参数说明**：

| 参数 | 必填 | 默认值 | 说明 |
| --- | --- | --- | --- |
| `appName` | 是 | — | 应用名称 |
| `description` | 否 | 同 appName | 应用描述 |
| `icon` | 否 | `xian-yingyong` | 图标标识 |
| `iconColor` | 否 | `#0089FF` | 图标颜色 |

**示例**：

```bash
# 最简用法
yidacli create-app "考勤管理"

# 完整参数
yidacli create-app "考勤管理" "员工考勤打卡系统" "xian-daka" "#00B853"
```

**输出**：日志输出到 stderr，JSON 结果输出到 stdout：

```json
{"success":true,"appType":"APP_XXX","appName":"考勤管理","url":"{base_url}/APP_XXX/admin"}
```

## 前置依赖

- Node.js
- 项目根目录存在 `.cache/cookies.json`（首次运行会自动触发扫码登录）

## 调用流程

1. 读取项目根目录的 `.cache/cookies.json` 获取登录态；若不存在则自动触发扫码登录
2. 构建 `registerApp` 请求参数
3. 发送 POST 请求到 `/query/app/registerApp.json`；根据响应体 `errorCode` 自动处理异常（详见 `yida-login` 技能文档「错误处理机制」章节）
4. 从返回值中获取应用 ID（appType）
5. 将 `appType` 记录到 `prd/<项目名>.md` 备用

## 文件结构

```
yida-create-app/
└── SKILL.md                # 本文档
```

## 接口说明

### registerApp

- **地址**：`POST /query/app/registerApp.json`
- **Content-Type**：`application/x-www-form-urlencoded`
- **核心参数**：

| 参数 | 类型 | 必填 | 说明 |
| --- | --- | --- | --- |
| `_csrf_token` | String | 是 | CSRF Token（由 yida-login 获取） |
| `appName` | String (JSON) | 是 | 应用名称，i18n 格式：`{"zh_CN":"名称","en_US":"名称","type":"i18n"}` |
| `description` | String (JSON) | 否 | 应用描述，i18n 格式同上 |
| `icon` | String | 否 | 图标标识，格式：`{iconName}%%{颜色}`，如 `xian-daka%%#00B853` |
| `iconUrl` | String | 否 | 自定义图标 URL（与 icon 二选一） |
| `colour` | String | 否 | 主题颜色，固定 `blue` |

> 其他固定参数：`defaultLanguage=zh_CN`、`openExclusive=n`、`openPhysicColumn=n`、`openIsolationDatabase=n`、`openExclusiveUnit=n`、`group=全部应用`

- **返回值**：

```json
{
  "content": "APP_XXX",
  "success": true
}
```

`content` 即为新创建的应用 ID（appType）。

## 与其他技能配合

1. **创建应用** → 获取 `appType`（本技能）
2. **创建表单页面** → 使用 `yida-create-form-page` 技能在应用下创建表单
3. **创建自定义页面** → 使用 `yida-create-page` 技能在应用下创建展示页面
4. **部署页面代码** → 使用 `yida-publish` 技能将 JSX 代码部署到自定义页面

## 图标列表

| 名称 | 标识 | | 名称 | 标识 |
| --- | --- | --- | --- | --- |
| 新闻 | `xian-xinwen` | | 地球 | `xian-diqiu` |
| 政府 | `xian-zhengfu` | | 汽车 | `xian-qiche` |
| 应用 | `xian-yingyong` | | 飞机 | `xian-feiji` |
| 学术帽 | `xian-xueshimao` | | 电脑 | `xian-diannao` |
| 企业 | `xian-qiye` | | 工作证 | `xian-gongzuozheng` |
| 单据 | `xian-danju` | | 购物车 | `xian-gouwuche` |
| 市场 | `xian-shichang` | | 信用卡 | `xian-xinyongka` |
| 经理 | `xian-jingli` | | 活动 | `xian-huodong` |
| 法律 | `xian-falv` | | 奖杯 | `xian-jiangbei` |
| 报告 | `xian-baogao` | | 流程 | `xian-liucheng` |
| 火车 | `huoche` | | 查询 | `xian-chaxun` |
| 申报 | `xian-shenbao` | | 打卡 | `xian-daka` |

## 图标背景色

`#0089FF` `#00B853` `#FFA200` `#FF7357` `#5C72FF` `#85C700` `#FFC505` `#FF6B7A` `#8F66FF` `#14A9FF`
