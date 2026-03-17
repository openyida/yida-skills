# yida-skills

> 宜搭（Yida）AI 技能合集 —— 让 AI 助手具备完整的宜搭平台开发能力

[![MIT License](https://img.shields.io/badge/license-MIT-green.svg)](./LICENSE)
[![GitHub Stars](https://img.shields.io/github/stars/openyida/yida-skills)](https://github.com/openyida/yida-skills/stargazers)
[![GitHub Forks](https://img.shields.io/github/forks/openyida/yida-skills)](https://github.com/openyida/yida-skills/fork)

一套专为 [钉钉宜搭](https://www.aliwork.com) 平台设计的 AI Skills，覆盖从登录、建应用、建表单、开发自定义页面到发布的完整研发链路。配合 **悟空、OpenCode** 或 **ClaudeCode** 使用，让 AI 真正能帮你端到端地完成宜搭应用开发。

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
| `yida-custom-page` | 自定义页面开发 | 宜搭 JSX 组件开发规范、JS API 调用（31 个 API）、代码编译与 Schema 部署 |
| `yida-publish-page` | 发布页面 | 将源码编译并部署 Schema 到宜搭平台 |
| `yida-page-config` | 页面配置 | 公开访问/分享 URL 验证与配置、隐藏顶部导航等页面设置 |
| `yida-app` | 完整应用开发 | 从零到一搭建完整宜搭应用的全流程编排（编排型技能，无独立脚本） |
| `yida-get-schema` | 获取表单 Schema | 调用 getFormSchema 接口获取表单完整 Schema 结构 |

---

## 快速开始

### 第一步：安装技能

**下载技能包**：[yida-skills.zip](https://github.com/openyida/yida-skills/releases/download/v1.0.0/yida-skills.zip)

**安装方式**：

- **悟空 (Wukong)**：直接上传技能，选择下载的 yida-skills.zip

- **OpenCode**：解压到 `~/.opencode/skills/`

- **Claude Code**：解压到 `~/.claudecode/skills/`

* Cursor: 手动解压到 ~/.cursor/skills/

* Qoder: 手动解压到 ~/.qoder/skills/

* iFlow: 手动解压到 ~/.iflow/skills/

* Aone Copilot: 手动解压到 ~/.aone-copilot/skills/

---

### 第二步：使用

**1. 悟空**

直接对话即可：

- `帮我创建一个访客系统应用`
- `帮我搭建一个生日祝福小游戏应用`
- `帮我搭建个人薪资计算器应用`

**2. 其他 AI 编程工具**

在任意地方创建一个空文件夹，用 AI 编程工具打开该文件夹，开始对话即可。

---


## 依赖环境

| 依赖 | 版本要求 | 用途 |
|------|----------|------|
| Node.js | ≥ 16 | yida-publish、yida-create-* 系列脚本 |

---

## DEMO 展示

### 业务系统 - IPD/CRM

![IPD](https://img.alicdn.com/imgextra/i2/O1CN01YBEMa929J7sD9v8U1_!!6000000008046-2-tps-3840-3366.png)

![CRM](https://img.alicdn.com/imgextra/i3/O1CN01kn0Vcn1H5OkbQaizA_!!6000000000706-2-tps-3840-2168.png)

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
  <a href="https://github.com/yize"><img src="https://avatars.githubusercontent.com/u/1578814?v=4&s=48" width="48" height="48" alt="九神" title="九神"/></a> <a href="https://github.com/alex-mm"><img src="https://avatars.githubusercontent.com/u/3302053?v=4&s=48" width="48" height="48" alt="天晟" title="天晟"/></a> <a href="https://github.com/angelinheys"><img src="https://avatars.githubusercontent.com/u/49426983?v=4&s=48" width="48" height="48" alt="angelinheys" title="angelinheys"/></a> <a href="https://github.com/yipengmu"><img src="https://avatars.githubusercontent.com/u/3232735?v=4&s=48" width="48" height="48" alt="yipengmu" title="yipengmu"/></a> <a href="https://github.com/Waawww"><img src="https://avatars.githubusercontent.com/u/31886449?v=4&s=48" width="48" height="48" alt="Waawww" title="Waawww"/></a>
</p>

欢迎提交 PR！一起完善宜搭 AI 技能库。

---

## 常见问题

**Q: yidacli 命令不存在？**
> 需要先安装：`npm install -g @openyida/yidacli`

**Q: 登录态失效怎么办？**
> 运行 `yidacli login` 重新扫码登录，或告诉 AI "yidacli 登录态失效了，帮我重新登录"

**Q: 如何更新 yidacli？**
> yidacli 内置自动版本检测，看到更新提示后运行：`npm install -g @openyida/yidacli@latest`

**Q: 编译报错如何排查？**
> 错误信息会显示具体行号和列号，确保代码符合 `yida-custom-page` 规范（禁止使用 React Hooks）

## License

[MIT](./LICENSE) © 2026 [Alibaba Group](https://github.com/alibaba)

---

## 致谢

- [Anthropic](https://www.anthropic.com/) - Claude & Skills 规范
- [阿里巴巴 Low Code Engine](https://github.com/alibaba/lowcode-engine) - 企业级低代码技术体系（15.8k⭐）
- [钉钉宜搭](https://www.aliwork.com/) - 低代码平台
- [OpenCode](https://opencode.com/) - AI Coding 工具
