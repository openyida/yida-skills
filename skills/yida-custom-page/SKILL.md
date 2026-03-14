---
name: yida-custom-page
description: 宜搭自定义页面开发技能，包含宜搭表单 JS API 调用（增删改查/流程/工具类共 27 个）、React 16 JSX 组件开发规范、状态管理模式与编码约束。
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
    - react
    - custom-page
---

# 宜搭自定义页面开发技能

## 概述

本技能提供在阿里宜搭低代码平台上开发**自定义页面**的完整能力，涵盖从编码到部署的全流程：

| 能力 | 说明 |
| --- | --- |
| **表单数据操作** | 通过宜搭前端 JS API（`this.utils.yida.*`）对表单数据进行增删改查 |
| **JSX 组件开发** | 编写 React 16 兼容的 JSX 代码，实现个性化定制页面 |
| **AI 能力集成** | 调用大模型 AI 接口（`/query/intelligent/txtFromAI.json`）实现智能文本生成 |
| **自动编译部署** | 通过工具链将源码编译、压缩，并自动合并到宜搭 Schema 中保存 |

## 何时使用

当以下场景发生时使用此技能：
- 用户需要开发自定义展示页面（非表单）
- 用户需要实现复杂的页面交互逻辑
- 用户需要调用宜搭 JS API 进行数据操作
- 已有自定义页面，需要编写或修改 JSX 代码

## 使用示例

> **注意**：编译和发布功能由 `yida-publish-page` 技能提供，此处仅作流程说明。

### 示例 1：编译源码
**场景**：将 JSX 源码编译为宜搭可用的格式
**依赖**：需先安装 yida-publish-page 依赖
**命令**：
```bash
cd .claude/skills/yida-publish-page/scripts && npm install
node babel-transform/transform.js pages/src/my-page.js
```

### 示例 2：发布页面
**场景**：编译并发布自定义页面到宜搭平台
**命令**：
```bash
node .claude/skills/yida-publish-page/scripts/publish.js APP_XXX FORM-XXX pages/src/my-page.js
```

---

## 快速开始

### 前置条件

- Node.js 16+（用于 Babel 编译和发布）
- Python 3.12+ + `playwright`（用于登录态管理）
- 首次使用需安装依赖：

```bash
cd .claude/skills/yida-publish/scripts && npm install
pip install playwright && playwright install chromium
```

### 编译源码

```bash
node scripts/babel-transform/transform.js <源文件路径>
```

**编译流程**：

```
源文件(.js) → @ali/vu-babel-transform (Babel 转换) → UglifyJS (压缩) → <name>.compile.js
```

### 部署到宜搭

```bash
cd .claude/skills/yida-publish-page/scripts
npm install  # 首次需要安装依赖
node publish.js <appType> <formUuid> <源文件路径>
```

**部署流程**：

```
编译源码（Babel + UglifyJS） → 代码动态构建 Schema JSON（填入 source/compiled）
→ 调用 yida-login 获取登录态（Cookie 持久化） → 调用 saveFormSchema 接口保存
```

**参数说明**：

| 参数 | 说明 | 示例 |
| --- | --- | --- |
| `appType` | 应用 ID | `APP_XXX` |
| `formUuid` | 表单 ID | `FORM-XXX` |
| `源文件路径` | 源码文件路径 | `pages/src/xxx.js` |

> `baseUrl` 无需手动传入，脚本会自动调用 `login.py` 获取登录态并从中读取 `base_url`。

---

## 开发规范

> **以下规范是编写宜搭自定义页面代码的核心约束，必须严格遵守。**

### 运行环境与约束

宜搭自定义页面的 JSX 组件本质上是 **React 类组件中的 render 方法**，而非独立的 React 组件。因此存在以下关键约束：

| 约束 | 说明 |
| --- | --- |
| **React 版本** | 必须兼容 **React 16**，禁止使用 Hooks（`useState`、`useEffect` 等） |
| **单文件** | 所有代码写在一个文件中（如 `index.js`） |
| **函数导出格式** | 使用 `export function xxx() {}` 格式导出函数 |
| **样式** | 所有 css 必须写在 renderJsx 的方法中，通过 style 的方式引入 |
| **`this` 上下文** | 所有导出函数中的 `this` 指向宜搭页面的 React 类实例 |
| **禁止使用 `this.setState` 管理业务状态** | `this.setState` 已被覆盖，仅用于 `forceUpdate`（通过更新 `timestamp`） |
| **必须定义 renderJsx 函数** | renderJsx 是宜搭自定义页面核心渲染函数，也是入口函数，必须严格定义，不要改为其他名称 |

### 文件结构

一个完整的宜搭自定义页面源文件必须包含以下三个导出函数和状态管理模块：

```javascript
// ============================================================
// 状态管理
// ============================================================

const _customState = {
  // 在此定义所有业务状态的初始值
  count: 0,
  loading: false,
};

/**
 * 获取状态
 * @param {string} [key] - 传入 key 返回单个值，不传返回全部状态的浅拷贝
 */
export function getCustomState(key) {
  if (key) {
    return _customState[key];
  }
  return { ..._customState };
}

/**
 * 设置状态（合并更新，自动触发重新渲染）
 * @param {Object} newState - 需要更新的状态键值对
 */
export function setCustomState(newState) {
  Object.keys(newState).forEach(function(key) {
    _customState[key] = newState[key];
  });
  this.forceUpdate();
}

/**
 * 强制重新渲染（通过更新 timestamp 触发 React 重渲染）
 */
export function forceUpdate() {
  this.setState({ timestamp: new Date().getTime() });
}

// ============================================================
// 生命周期
// ============================================================

/**
 * 页面加载完成时调用
 * 用于：初始化数据、启动定时器、绑定事件等
 */
export function didMount() {
  // 初始化逻辑
}

/**
 * 页面卸载时调用
 * 用于：清理定时器、解绑事件、释放资源等
 */
export function didUnmount() {
  // 清理逻辑
}

// ============================================================
// 渲染
// ============================================================

/**
 * 页面渲染函数（等同于 React 类组件的 render 方法）
 * 注意：必须包含隐藏的 timestamp div 以支持 forceUpdate 机制
 */
export function renderJsx() {
  const { timestamp } = this.state;

  return (
    <div>
      {/* 必须保留：用于触发重新渲染 */}
      <div style={{ display: "none" }}>{timestamp}</div>

      {/* 页面内容写在这里 */}
    </div>
  );
}
```

### 状态管理使用方式

```javascript
// 获取全部状态（返回浅拷贝）
const state = this.getCustomState();

// 获取单个状态值
const count = this.getCustomState('count');

// 设置状态并自动触发重新渲染
this.setCustomState({ count: count + 1, loading: true });

// 仅触发重新渲染（不修改状态）
this.forceUpdate();
```

### 生命周期钩子

| 钩子函数 | 触发时机 | 典型用途 |
| --- | --- | --- |
| `didMount()` | 页面 DOM 加载渲染完毕 | 初始化数据加载、启动定时器、绑定事件 |
| `didUnmount()` | 页面节点从 DOM 移除 | 清理 `setInterval` / `setTimeout`、解绑事件 |

### 全局变量

| 变量 | 类型 | 说明 |
| --- | --- | --- |
| `window.g_config._csrf_token` | `String` | CSRF Token，调用需认证的接口（如 AI 接口、Schema 保存）时必须携带 |
| `window.loginUser.userId` | `String` | 当前登录用户的工号 |
| `window.loginUser.userName` | `String` | 当前登录用户的姓名 |
| `this.state.urlParams` | `Object` | 页面 URL 中的查询参数 |

### 编码注意事项

1. **this 指向问题**：在 `renderJsx` 内部定义的事件处理函数中，`this` 不指向页面实例。有两种解决方案：

   **方案一（推荐）：使用箭头函数**
   ```javascript
   export function renderJsx() {
     const { timestamp } = this.state;
     
     // 箭头函数自动捕获 this
     const handleSubmit = () => {
       this.setCustomState({ submitted: true });
       this.utils.toast({ title: '提交成功', type: 'success' });
     };

     return (
       <button onClick={handleSubmit}>提交</button>
     );
   }
   ```

   **方案二：保存 self 引用**
   ```javascript
   export function renderJsx() {
     const { timestamp } = this.state;
     const self = this;  // 保存 this 引用

     function handleSubmit() {
       // 使用 self 调用
       self.setCustomState({ submitted: true });
       self.utils.toast({ title: '提交成功', type: 'success' });
     }

     return (
       <button onClick={handleSubmit}>提交</button>
     );
   }
   ```

2. **输入法处理**：使用 `_isComposing` 标记配合 `compositionstart` / `compositionend` 事件，正确处理中文输入法的组合输入状态，避免输入过程中触发提交
3. **定时器清理**：在 `didUnmount` 中必须清理所有通过 `setInterval` / `setTimeout` 创建的定时器，防止内存泄漏
4. **错误处理**：所有 API 调用（`this.utils.yida.*`、`fetch`）必须使用 `.catch()` 处理异常，并通过 `this.utils.toast({ title: message, type: 'error' })` 向用户展示错误提示
5. **样式方式**：所有样式通过 JavaScript 对象定义（内联样式），在 `renderJsx` 中通过 `style` 属性应用，不使用外部 CSS 文件
6. **异步操作**：可以使用 `async/await` 语法，Babel 编译会自动转换为 ES5 兼容代码
6. **输入框必须使用非受控组件**：在宜搭环境中，`<input>` 的 `value` 属性绑定状态后，每次 `onChange` 触发 `setCustomState` → `forceUpdate` → 整个 JSX 重渲染，会导致输入框失焦或输入被吞掉，用户无法正常输入文字。**正确做法**：使用 `defaultValue` 代替 `value`，在 `onChange` 中仅更新 `_customState` 而不调用 `setCustomState`（避免触发重渲染），需要清空输入框时通过 `document.getElementById` 直接操作 DOM。示例：

```javascript
// ❌ 错误：受控组件，每次输入都触发重渲染导致无法输入
<input value={userAnswer} onChange={function(e) { self.setCustomState({ userAnswer: e.target.value }); }} />

// ✅ 正确：非受控组件，仅静默更新状态，不触发重渲染
<input id="my-input" defaultValue="" onChange={function(e) { _customState.userAnswer = e.target.value; }} />

// 需要清空时通过 DOM 操作
var inputEl = document.getElementById("my-input");
if (inputEl) { inputEl.value = ""; }
```

---

## API 参考

### 表单数据操作

通过 `this.utils.yida.<方法名>(params)` 调用，所有接口返回 Promise。

| 方法 | 说明 | 必填参数 |
| --- | --- | --- |
| `saveFormData` | 新建表单实例 | `formUuid`, `appType`, `formDataJson` |
| `updateFormData` | 更新表单实例 | `formInstId`, `updateFormDataJson` |
| `deleteFormData` | 删除表单实例 | `formUuid` |
| `getFormDataById` | 根据实例 ID 查询详情 | `formInstId` |
| `searchFormDatas` | 按条件搜索表单实例详情列表 | `formUuid` |
| `searchFormDataIds` | 按条件搜索表单实例 ID 列表 | `formUuid` |
| `getFormComponentDefinationList` | 获取表单定义 | `formUuid` |

**常用示例 — 新建表单数据**：

```javascript
this.utils.yida.saveFormData({
  formUuid: 'FORM-XXX',
  appType: window.pageConfig.appType,
  formDataJson: JSON.stringify({
    textField_xxx: '单行文本',
    textareaField_xxx: '多行文本',
  }),
}).then(function(res) {
  console.log('新建成功，实例ID:', res.result);
}).catch(function(err) {
  this.utils.toast({ title: err.message, type: 'error' });
}.bind(this));
```

**常用示例 — 搜索表单数据**：

```javascript
this.utils.yida.searchFormDatas({
  formUuid: 'FORM-XXX',
  searchFieldJson: JSON.stringify({ textField_xxx: '查询值' }),
  currentPage: 1,
  pageSize: 10,
}).then(function(res) {
  // res.data: [{ formUuid, formInstId, formData: { textField_xxx: '值' } }]
  // res.totalCount: 符合条件的总数
  console.log('查询结果:', res.data);
}).catch(function(err) {
  this.utils.toast({ title: err.message, type: 'error' });
}.bind(this));
```

### 流程操作

| 方法 | 说明 | 必填参数 |
| --- | --- | --- |
| `startProcessInstance` | 发起流程 | `formUuid`, `processCode`, `formDataJson` |
| `updateProcessInstance` | 更新流程实例 | `processInstanceId`, `updateFormDataJson` |
| `deleteProcessInstance` | 删除流程实例 | `processInstanceId` |
| `getProcessInstanceById` | 根据实例 ID 查询流程详情 | `processInstanceId` |
| `getProcessInstances` | 按条件搜索流程实例详情列表 | — |
| `getProcessInstanceIds` | 按条件搜索流程实例 ID 列表 | — |

---


### 工具类 API 速查

以下工具函数通过 `this.utils.<方法名>()` 调用，无需 `yida` 命名空间：

| 方法 | 用途 | 典型场景 |
| --- | --- | --- |
| `toast` | 轻提示 | 操作成功/失败提示、loading 状态 |
| `dialog` | 对话框 | 确认操作、复杂内容展示 |
| `formatter` | 格式化 | 日期、金额、手机号格式化 |
| `getDateTimeRange` | 获取时间范围 | 按日/月/周筛选数据 |
| `getLoginUserId` / `getLoginUserName` | 获取当前用户 | 记录操作人、数据权限控制 |
| `isMobile` | 判断移动端 | 响应式布局适配 |
| `openPage` | 打开新页面 | 页面跳转、外链打开 |
| `router.push` | 页面路由跳转工具 | 页面路由跳转、避免新开页面 |
| `previewImage` | 图片预览 | 图片查看、多图轮播 |
| `loadScript` | 动态加载脚本 | 引入第三方库（如二维码生成） |

完整参数说明和示例请参考 [yida-api.md](reference/yida-api.md) 的「工具类 API」章节。 |

## 工具链

编译和部署功能已拆分为独立的 skill，便于复用和维护：

| Skill | 说明 | 用法 |
| --- | --- | --- |
| **yida-login** | 登录态管理（Cookie 持久化 + 扫码登录） | `python3 .claude/skills/yida-login/scripts/login.py` |
| **yida-publish-page** | 编译源码 + 构建 Schema + 发布到宜搭 | `node .claude/skills/yida-publish-page/scripts/publish.js <appType> <formUuid> <源文件路径>` |

### 编译 + 发布（一键完成）

```bash
cd .claude/skills/yida-publish-page/scripts
npm install  # 首次需要安装依赖
node publish.js <appType> <formUuid> <源文件路径>
```

**处理流程**：
1. 通过 `@ali/vu-babel-transform` 将 JSX 转换为 ES5 + UglifyJS 压缩
2. 通过代码动态构建完整的 Schema JSON，将 `source` 和 `compiled` 填入 `actions.module`
3. 调用 `yida-login` 获取登录态（Cookie 持久化，首次需扫码登录）
4. 通过 HTTP POST 调用 `saveFormSchema` 接口保存 Schema

### 仅编译（不发布）

```bash
node .claude/skills/yida-publish-page/scripts/babel-transform/transform.js <源文件路径>
```

输入 JSX 源文件，输出编译压缩后的 `<name>.compile.js`（与源文件同目录）。

---

## 最佳实践

### 1. 代码组织

推荐将页面代码组织为以下结构：

```javascript
// 状态管理
const _customState = { count: 0 };

// 状态读写函数
export function getCustomState(key) { ... }
export function setCustomState(newState) { ... }

// 生命周期
export function didMount() { ... }
export function didUnmount() { ... }

// 渲染（必须导出）
export function renderJsx() {
  const { timestamp } = this.state;
  
  // 定义样式对象
  const styles = { ... };
  
  // 事件处理函数（推荐箭头函数）
  const handleClick = () => { ... };
  
  return (
    <div style={styles.wrapper}>
      ...
    </div>
  );
}
```

### 2. 避免常见错误

| 错误 | 原因 | 解决方案 |
|------|------|----------|
| `this.setState is not a function` | 普通函数中 this 指向错误 | 使用箭头函数或保存 self 引用 |
| 输入框失焦 | 受控组件频繁重渲染 | 使用 defaultValue + _customState |
| 数据提交失败 | 缺少必要字段 | 检查 formUuid、appType、formDataJson |

### 3. 性能优化

- **减少 setCustomState 调用**：不要在每次 onChange 都调用，可使用 _customState 直接存储
- **合理使用 forceUpdate**：只在必要时触发重渲染
- **避免内联函数创建**：在 renderJsx 顶部定义事件处理函数

### 4. 调试技巧

```javascript
// 打印日志到浏览器控制台
console.log('当前状态:', _customState);

// 弹窗提示
this.utils.toast({ title: '调试信息', type: 'info' });
```

### 5. iframe 嵌入表单页面 URL 规范

在自定义页面中通过 iframe 嵌入宜搭表单时，需要使用正确的 URL 格式：

#### 场景一：嵌入表单提交页

| 类型 | URL 格式 | 说明 |
|------|----------|------|
| 提交页 | `{base_url}/{appType}/submission/{formUuid}` | 用于新建表单数据 |

**示例**：
```javascript
const formUrl = `https://www.aliwork.com/${appType}/submission/${formUuid}`;
```

#### 场景二：嵌入表单数据列表（数据管理页面）

| 类型 | URL 格式 | 说明 |
|------|----------|------|
| 数据管理页（iframe嵌入） | `{base_url}/{appType}/workbench/{formUuid}?viewUuid={viewUuid}&iframe=true` | **必须使用 workbench 路径**，viewUuid 用于指定多视图（可选） |

**示例**：
```javascript
// 嵌入默认视图
const listUrl = `https://www.aliwork.com/${appType}/workbench/${formUuid}?iframe=true`;

// 嵌入指定多视图
const viewUuid = "VIEW-DA556BB8FE1348FE904F55A247D645E5";
const listUrlWithView = `https://www.aliwork.com/${appType}/workbench/${formUuid}?viewUuid=${viewUuid}&iframe=true`;
```

**重要提示**：
- ❌ 错误：`{base_url}/{appType}/formDetail/{formUuid}` - 这是表单详情页，不是数据列表
- ✅ 正确：`{base_url}/{appType}/workbench/{formUuid}?iframe=true` - 使用运行态的 workbench 地址
- `viewUuid` 参数可选，用于指定多视图

#### 获取 viewUuid 的方法（可选）

1. 打开宜搭表单 → 点击「数据管理」
2. 创建报表视图，配置需要的字段和筛选条件
3. 创建完成后，访问该报表页面的 URL，从 URL 中提取 `viewUuid` 参数值
4. 如果不传 viewUuid，默认使用第一个视图

---

## 参考资料

| 文档 | 路径 | 说明 |
| --- | --- | --- |
| 宜搭 JS API | `../../shared/yida-api.md` | 表单数据增删改查（7 个）、流程操作（6 个）、工具类 API（14 个），共 27 个 API 的完整参数与示例 |
| 大模型 AI 接口 | `reference/model-api.md` | AI 文本生成接口的请求参数、返回值结构与调用示例 |
| Schema 保存接口 | `reference/save-schema.md` | `saveFormSchema` 接口的请求参数与返回值 |

