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
# yidacli 已包含所有依赖，无需单独安装
node babel-transform/transform.js pages/src/my-page.js
```

### 示例 2：发布页面
**场景**：编译并发布自定义页面到宜搭平台
**命令**：
```bash
yidacli publish pages/src/my-page.js APP_XXX FORM-XXX
```

---

## 快速开始

### 前置条件

- Node.js 16+（用于 Babel 编译和发布）
- Python 3.12+ + `playwright`（用于登录态管理）
- 首次使用需安装依赖：

```bash
# yidacli 已包含所有依赖，无需单独安装
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
yidacli publish <源文件路径> <appType> <formUuid>
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

> `baseUrl` 无需手动传入，`yidacli` 会自动获取登录态并从中读取 `base_url`。

---

## 开发规范

> **以下规范是编写宜搭自定义页面代码的核心约束，必须严格遵守。**

### 运行环境与约束

宜搭自定义页面的 JSX 组件本质上是 **React 类组件中的 render 方法**，而非独立的 React 组件。因此存在以下关键约束：

| 约束 | 说明 |
| --- | --- |
| **React 版本** | 必须兼容 **React 16**，禁止使用 Hooks（`useState`、`useEffect` 等） |
| **单文件** | 所有代码写在一个文件中（如 `index.js`）|
| **三方包引入** | 禁止使用 `import/require` 语法，如需使用第三方库，必须通过 `this.utils.loadScript` 加载 CDN 脚本，参考 [yida-api.md](../../reference/yida-api.md) 的「工具类 API」章节。|
| **函数导出格式** | 使用 `export function xxx() {}` 格式导出函数 |
| **样式** | 所有 css 必须写在 renderJsx 的方法中，通过 style 的方式引入 |
| **`this` 上下文** | 所有导出函数中的 `this` 指向宜搭页面的 React 类实例 |
| **禁止使用 `this.setState` 管理业务状态** | `this.setState` 已被覆盖，仅用于 `forceUpdate`（通过更新 `timestamp`） |
| **JavaScript 版本** | 使用 ES2015 (ES6) 语法，不能高于 ES2015 版本 |
| **必须定义 renderJsx 函数** | renderJsx 是宜搭自定义页面核心渲染函数，也是入口函数，必须严格定义，不要改为其他名称 |

### 文件结构

**一个完整的宜搭自定义页面源文件必须包含：**
- `_customState` 变量
- getCustomState 函数
- setCustomState 函数
- forceUpdate 函数
- didMount 函数
- didUnmount 函数
- renderJsx 函数

以下是一个完整自定义页面示例，包含状态管理、生命周期钩子、渲染函数

```jsx
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

export function handleSubmit(e) {
  this.setCustomState({ submitted: true });
  this.utils.toast({ title: '提交成功', type: 'success' });
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
      <div onClick={(e) => {this.handleSubmit(e)}>提交</div>
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

1. **自定义方法必须用 `export function` 定义**：凡是需要在方法内部使用 `this`（包括 `this.utils.yida.*`、`this.setCustomState` 等）的自定义方法，**必须且只能**使用 `export function 方法名() {}` 的形式定义，调用时使用 `this.方法名()`。**禁止**使用 `const fn = () => {}`、`const fn = function() {}` 等形式定义需要访问 `this` 的方法，这些形式无法被宜搭运行时正确绑定 `this`：
   ```javascript
   // ✅ 正确：export function + this.方法名() 调用
   export function didMount() {
     this.loadStatistics();
   }
   export function loadStatistics() {
     this.utils.yida.searchFormDatas({ formUuid: 'FORM-XXX', pageSize: 10 });
   }

   // ❌ 错误①：缺少 export，无法被宜搭运行时识别，this 丢失
   export function didMount() {
     loadStatistics();  // 直接调用，this 丢失
   }
   function loadStatistics() {
     this.utils.yida.searchFormDatas(...);  // 报错：this is undefined
   }

   // ❌ 错误②：箭头函数/函数表达式形式，缺少 export，无法被宜搭运行时绑定 this，禁止使用
   const loadStatistics = () => {
     this.utils.yida.searchFormDatas(...);  // 报错：this is undefined
   };
   const loadStatistics = function() {
     this.utils.yida.searchFormDatas(...);  // 报错：this is undefined
   };
   ```
2. **【严格禁止】事件绑定必须使用箭头函数包裹**：在 `renderJsx` 中绑定任何事件处理器（`onClick`、`onChange`、`onSubmit` 等）时，**必须且只能**使用箭头函数 `(e) => { this.方法名(e) }` 的形式，**严禁**直接写 `this.方法名` 作为事件处理器，否则 `this` 会丢失导致运行时报错：

   ```javascript
   export function handleSubmit(e) {
     this.setCustomState({ submitted: true });
     this.utils.toast({ title: '提交成功', type: 'success' });
   }

   // ✅ 正确：箭头函数包裹，this 正确捕获
   export function renderJsx() {
     return <button onClick={(e) => { this.handleSubmit(e); }}>提交</button>;
   }

   // ❌ 错误①：直接传方法引用，this 丢失，运行时报错，绝对禁止！
   export function renderJsx() {
     return <button onClick={this.handleSubmit}>提交</button>;
   }

   // ❌ 错误②：使用 .bind(this) 绑定，虽然能运行但不符合规范，禁止使用！
   export function renderJsx() {
     return <button onClick={function() { this.handleSubmit(); }.bind(this)}>提交</button>;
   }
   ```

   > **生成代码时的自检清单**：检查 `renderJsx` 中所有 `onClick`、`onChange`、`onSubmit` 等事件属性，确保每一个都是 `(e) => { this.xxx(e) }` 形式，不存在任何 `onClick={this.xxx}` 的写法。

3. **输入法组合输入处理**：使用 `_isComposing` 标记配合 `compositionstart` / `compositionend` 事件，正确处理中文输入法的组合输入状态，避免输入过程中触发提交
4. **定时器清理**：在 `didUnmount` 中必须清理所有通过 `setInterval` / `setTimeout` 创建的定时器，防止内存泄漏
5. **错误处理**：所有 API 调用（`this.utils.yida.*`、`fetch`）必须使用 `.catch()` 处理异常，并通过 `this.utils.toast({ title: message, type: 'error' })` 向用户展示错误提示
6. **样式方式**：所有样式通过 JavaScript 对象定义（内联样式），在 `renderJsx` 中通过 `style` 属性应用，不使用外部 CSS 文件
7. **异步操作**：可以使用 `async/await` 语法，Babel 编译会自动转换为 ES5 兼容代码
8. **pageSize 上限**：调用 `searchFormDatas`、`searchFormDataIds`、`getProcessInstances`、`getProcessInstanceIds` 等分页接口时，`pageSize` 最大值为 **100**，超过会导致接口报错。禁止将 `pageSize` 设置为超过 100 的值，推荐使用 `10`～`100` 之间的合理值。
9. **输入框使用非受控组件**：在宜搭环境中，`<input>` 的 `value` 属性绑定状态后会触发重渲染导致输入异常。**正确做法**：使用 `defaultValue`，在 `onChange` 中更新 `_customState` 而不调用 `setCustomState`：
   ```javascript
   // ❌ 错误：受控组件，每次输入都触发重渲染导致无法输入
   <input value={userAnswer} onChange={function(e) { this.setCustomState({ userAnswer: e.target.value }); }} />

   // ✅ 正确：非受控组件，仅静默更新状态，不触发重渲染
   <input id="my-input" defaultValue="" onChange={function(e) { _customState.userAnswer = e.target.value; }} />

   // 需要清空时通过 DOM 操作
   var inputEl = document.getElementById("my-input");
   if (inputEl) { inputEl.value = ""; }
   ```

10. **DateField 时间戳格式**：保存日期字段时，值必须是 **时间戳（毫秒）**，不能是字符串：
    ```javascript
    // ❌ 错误：字符串格式
    dateField_xxx: '2024-01-15'

    // ✅ 正确：时间戳格式
    dateField_xxx: new Date().getTime()
    ```

11. **多端适配**：宜搭自定义页面会在 PC 端和移动端同时展示，使用 `this.utils.isMobile()` 判断设备类型：
    ```javascript
    const isMobile = this.utils.isMobile();
    var styles = {
      container: { padding: isMobile ? '12px' : '16px', minHeight: '100vh' },
      card: { padding: isMobile ? '12px' : '16px', marginBottom: isMobile ? '8px' : '12px' },
    };
    ```

12. **清除默认样式**：宜搭自定义页面容器有默认 padding 和圆角，需要强制覆盖：
    ```javascript
    var styles = {
      container: { padding: '0 16px', borderRadius: '0 !important', minHeight: '100vh' },
    };
    ```

13. **性能优化**：
    - 不要在每次 `onChange` 都调用 `setCustomState`，可直接写入 `_customState` 静默更新
    - 只在需要触发重渲染时才调用 `forceUpdate`
    - 在 `renderJsx` 顶部定义事件处理函数，避免每次渲染都创建新的内联函数

14. **调试技巧**：
    ```javascript
    // 打印当前状态到控制台
    console.log('当前状态:', _customState);

    // 弹窗提示（适合快速验证逻辑）
    this.utils.toast({ title: '调试信息', type: 'info' });
    ```

15. **iframe 嵌入表单 URL 规范**：在自定义页面中通过 iframe 嵌入宜搭表单时，需使用正确的 URL 格式：

    | 场景 | URL 格式 |
    |------|----------|
    | 表单提交页 | `{base_url}/{appType}/submission/{formUuid}` |
    | 数据管理页（列表） | `{base_url}/{appType}/workbench/{formUuid}?iframe=true` |
    | 数据管理页（指定视图） | `{base_url}/{appType}/workbench/{formUuid}?viewUuid={viewUuid}&iframe=true` |

    ```javascript
    // ❌ 错误：formDetail 是表单详情页，不是数据列表
    const wrongUrl = `${baseUrl}/${appType}/formDetail/${formUuid}`;

    // ✅ 正确：workbench 是运行态数据管理页
    const listUrl = `${baseUrl}/${appType}/workbench/${formUuid}?iframe=true`;
    ```

    > `viewUuid` 可选，从宜搭「数据管理」→「报表视图」页面的 URL 中获取，不传则使用默认视图。

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

### 表单设计类 API

以下接口用于表单页面的创建和配置，通过 HTTP 请求调用：

| 方法 | 说明 | 调用方式 |
| --- | --- | --- |
| `saveFormSchemaInfo` | 创建空白表单 | `POST /dingtalk/web/{appType}/query/formdesign/saveFormSchemaInfo.json` |
| `getFormSchema` | 获取表单 Schema | `GET /alibaba/web/{appType}/_view/query/formdesign/getFormSchema.json` |
| `saveFormSchema` | 保存表单 Schema | `POST /dingtalk/web/{appType}/_view/query/formdesign/saveFormSchema.json` |
| `updateFormConfig` | 更新表单配置 | `POST /dingtalk/web/{appType}/query/formdesign/updateFormConfig.json` |

完整参数说明请参考 [yida-api.md](../../reference/yida-api.md) 的「表单设计类 API」章节。

### 大模型 AI 接口

以下接口用于调用大模型 AI 文本生成能力：

| 方法 | 说明 | 调用方式 |
| --- | --- | --- |
| `txtFromAI` | AI 文本生成 | `POST /query/intelligent/txtFromAI.json` |

**主要参数**：`_csrf_token`（CSRF 令牌）、`prompt`（提示词）、`skill`（技能类型，如 `ToText`）、`maxTokens`（最大返回 token 数）

完整参数说明和示例请参考 [model-api.md](../../reference/model-api.md)。

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
| `getLocale` | 获取语言环境 | 多语言适配 |
| `isMobile` | 判断移动端 | 响应式布局适配 |
| `isSubmissionPage` | 判断是否提交页面 | 页面逻辑区分 |
| `isViewPage` | 判断是否查看页面 | 页面逻辑区分 |
| `openPage` | 打开新页面 | 页面跳转、外链打开 |
| `router.push` | 页面路由跳转工具 | 页面路由跳转、避免新开页面 |
| `previewImage` | 图片预览 | 图片查看、多图轮播 |
| `loadScript` | 动态加载脚本 | 引入第三方库（如二维码生成） |

完整参数说明和示例请参考 [yida-api.md](../../reference/yida-api.md) 的「工具类 API」章节。

## 工具链

| Skill | 说明 | 用法 |
| --- | --- | --- |
| **yida-login** | 登录态管理（Cookie 持久化 + 扫码登录） | `yidacli login` |
| **yida-publish-page** | 编译源码 + 构建 Schema + 发布到宜搭 | `yidacli publish <源文件路径> <appType> <formUuid>` |
| **yida-page-config** | 页面配置（URL 验证、公开访问/分享配置） | 详见 `yida-page-config` 技能文档 |

### 编译 + 发布（一键完成）

```bash
yidacli publish <源文件路径> <appType> <formUuid>
```

**处理流程**：
1. 通过 `@ali/vu-babel-transform` 将 JSX 转换为 ES5 + UglifyJS 压缩
2. 通过代码动态构建完整的 Schema JSON，将 `source` 和 `compiled` 填入 `actions.module`
3. 调用 `yida-login` 获取登录态（Cookie 持久化，首次需扫码登录）
4. 通过 HTTP POST 调用 `saveFormSchema` 接口保存 Schema

### 仅编译（不发布）

```bash
yidacli publish <源文件路径> <appType> <formUuid>
```

输入 JSX 源文件，输出编译压缩后的 `<name>.compile.js`（与源文件同目录）。

---