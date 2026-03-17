# 更新日志

All notable changes to this project will be documented in this file.

The format is based on [Keep a Changelog](https://keepachangelog.com/en/1.0.0/),
and this project adheres to [Semantic Versioning](https://semver.org/spec/v2.0.0.html).

## [Unreleased]

## [1.0.0] - 2026-03-18

### Changed
- **架构重构**：将执行脚本抽离为独立 npm 包 `@openyida/yidacli`
- 本仓库改为纯技能文档仓库，更轻量、更易维护
- 所有命令统一通过 `yidacli` 命令行工具执行

### Added
- 支持多 AI 工具环境：悟空、Aone Copilot、OpenCode、Claude Code、Cursor、Qoder、iFlow
- `yidacli env` 命令检测当前 AI 工具环境和登录态
- `yidacli copy` 命令初始化 openyida 工作目录
- yidacli 内置自动版本检测（每天检查一次新版本）
- 悟空环境支持 CDP 协议从内置浏览器提取 Cookie
- 完整开发流程文档和子技能 SKILL.md

### Fixed
- 修复 get-page-config.js 严重 bug（引用未定义变量、GET/POST 路径写反）
- 修复 postinstall.js 复用 env.js 的环境检测逻辑，避免重复维护
- prepublish.js 增加 diff 校验，确保 openyida 模板拷贝完整性

## [0.1.0] - 2026-03-11

### Added
- 初始版本发布
- yida-login 登录管理
- yida-logout 退出登录
- yida-create-app 创建应用
- yida-create-page 创建自定义页面
- yida-create-form-page 创建表单页面
- yida-custom-page 自定义页面开发
- yida-publish-page 发布页面
- yida-get-schema 获取表单 Schema
- GitHub Actions CI/CD 流程
- 最佳实践文档
- 留资表单完整示例

### Fixed
- create-form-page 支持 JSON 字符串格式
- 优化 Babel 编译错误提示
- 修复 SKILL.md 编号问题
