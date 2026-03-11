# yida-skills

> 宜搭（Yida）AI 技能合集 —— 让 AI 助手具备完整的宜搭平台开发能力

[![MIT License](https://img.shields.io/badge/license-MIT-green.svg)](./LICENSE)
[![GitHub Stars](https://img.shields.io/github/stars/openyida/yida-skills)](https://github.com/openyida/yida-skills/stargazers)
[![GitHub Forks](https://img.shields.io/github/forks/openyida/yida-skills)](https://github.com/openyida/yida-skills/fork)

一套专为 [钉钉宜搭](https://www.aliwork.com) 平台设计的 AI Skills，覆盖从登录、建应用、建表单、开发自定义页面到发布的完整研发链路。配合 **OpenCode** 或 **ClaudeCode** 使用，让 AI 真正能帮你端到端地完成宜搭应用开发。

## 功能特性

- 🔐 **登录态管理** - Cookie 持久化 + 扫码登录，自动续期
- 📱 **应用创建** - 一句话创建宜搭应用
- 📝 **表单开发** - 支持 19 种字段类型，CRUD 操作
- ⚛️ **自定义页面** - React 16 JSX 开发，27 个 API
- 🚀 **一键发布** - Babel 编译 + Schema 部署
- 🔄 **完整工作流** - 从需求到发布，端到端自动化

---

## 技能列表

| Skill | 名称 | 功能描述 |
|-------|------|----------|
| `yida-login` | 登录管理 | 通过 Playwright 管理登录态（Cookie 持久化 + 扫码登录），获取 CSRF Token |
| `yida-logout` | 退出登录 | 清空本地 Cookie 缓存 |
| `yida-create-app` | 创建应用 | 调用 registerApp 接口快速创建宜搭应用 |
| `yida-create-page` | 创建自定义页面 | 调用 saveFormSchemaInfo 接口创建自定义展示页面 |
| `yida-create-form-page` | 创建表单页面 | 支持 19 种字段类型的表单创建与更新 |
| `yida-custom-page` | 自定义页面开发 | 宜搭 JSX 组件开发规范、JS API 调用、代码编译与 Schema 部署 |
| `yida-publish-page` | 发布页面 | 将源码编译并部署 Schema 到宜搭平台 |
| `yida-app` | 完整应用开发 | 从零到一搭建完整宜搭应用的全流程编排（编排型技能，无独立脚本） |
| `yida-get-schema` | 获取表单 Schema | 调用 getFormSchema 接口获取表单完整 Schema 结构 |

---

## 快速开始

### 使用 openyida 默认工程模板（推荐）

```bash
# 1.克隆仓库

  git clone https://github.com/openyida/openyida.git

# 2. 使用代码编辑器打开项目，打开 AI Coding 工具，输入：执行安装脚本
# 3. Skills 安装完成后，AI Coding 工具，输入：帮我搭建一个生日祝福小游戏应用

```

### 使用自己的项目工程，请参考文件结构约定

```
项目根目录/
├── README.md                # 用来判断根目录路径，必须存在
├── config.json              # 全局配置（loginUrl、defaultBaseUrl）
├── .cache/
│   └── cookies.json         # 登录态缓存和其他临时文件（运行时自动生成）
├── pages/src/
│   └── <项目名>.js          # 自定义页面源码
├── pages/dist/
│   └── <项目名>.js          # 自定义页面编译后的代码
├── prd/
│   └── <项目名>.md          # 需求文档（含所有配置信息）
└── .claude/
    └── skills/              # 各子技能目录
```
---

## 目录结构

```
yida-skills/
├── skills/                        # 技能源文件
│   ├── yida-login/                # 登录管理
│   │   ├── SKILL.md               # 技能说明（AI 读取）
│   │   └── scripts/               # 执行脚本
│   │       └── login.py
│   ├── yida-logout/
│   ├── yida-create-app/
│   │   └── scripts/
│   │       └── create-app.js
│   ├── yida-create-page/
│   ├── yida-create-form-page/
│   │   └── reference/             # 参考文档
│   ├── yida-custom-page/
│   │   └── reference/            # 参考文档
│   │       ├── yida-api.md
│   │       └── model-api.md
│   ├── yida-publish-page/
│   │   └── scripts/
│   │       ├── publish.js
│   │       ├── babel-transform/
│   │       └── package.json
│   ├── yida-app/
│   └── yida-get-schema/
├── examples/                      # 示例代码
│   └── contact-form/
├── .github/
│   └── workflows/                 # CI 配置
├── install.sh                     # 一键安装脚本
├── getting-started.md             # 快速上手指南
├── README.md
└── LICENSE
```

---

## 依赖环境

| 依赖 | 版本要求 | 用途 |
|------|----------|------|
| Node.js | ≥ 16 | yida-publish、yida-create-* 系列脚本 |
| Python | ≥ 3.8 | yida-login、yida-logout |
| Playwright | latest | 登录态管理 |

---

## DEMO 展示

### 💰 小工具 - 个人薪资计算器

![薪资计算器](https://gw.alicdn.com/imgextra/i2/O1CN017TeJuE1reVH2Dj7b7_!!6000000005656-2-tps-5114-2468.png)

---

### 🌐  Landing Page - 智联协同

企业级产品介绍页，一句话生成完整 Landing Page。

![智联协同](https://gw.alicdn.com/imgextra/i1/O1CN01EZtvfs1cxXV00UaXi_!!6000000003667-2-tps-5118-2470.png)

---

### 🏮 运营场景 - 看图猜灯谜

AI 生成灯谜图片，用户猜答案，猜错了有 AI 幽默提示。

![看图猜灯谜-2](https://img.alicdn.com/imgextra/i3/O1CN01dCoscP25jSAtAB9o3_!!6000000007562-2-tps-2144-1156.png)

---


## 贡献指南

欢迎提交 PR！请确保 CI 检查通过。

### 本地测试

```bash
node --check skills/*/scripts/*.js
```

### 贡献者

Thanks to all contributors:

<p align="left">
  <a href="https://github.com/yize"><img src="https://avatars.githubusercontent.com/u/1578814?v=4&s=48" width="48" height="48" alt="九神" title="九神"/></a> <a href="https://github.com/alexmm"><img src="https://avatars.githubusercontent.com/u/324539017?v=4&s=48" width="48" height="48" alt="天晟" title="天晟"/></a>
</p>

欢迎提交 PR！一起完善宜搭 AI 技能库。

---

## 示例代码

详见 `examples/` 目录：

| 示例 | 说明 |
|------|------|
| `examples/contact-form/` | 留资表单完整示例 |

---

## 常见问题

**Q: 运行脚本报错 "node_modules not found"？**
> 需要先安装依赖：`npm install --prefix skills/yida-publish-page/scripts`

**Q: 编译报错如何排查？**
> 错误信息会显示具体行号和列号

## License

[MIT](./LICENSE) © 2026 [天晟](https://github.com/alexmm)

---

## 致谢

- [Anthropic](https://www.anthropic.com/) - Claude & Skills 规范
- [钉钉宜搭](https://www.aliwork.com/) - 低代码平台
- [OpenCode](https://opencode.com/) - AI Coding 工具
