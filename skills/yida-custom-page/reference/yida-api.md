# 宜搭跨应用 JS API

调用方式：`this.utils.yida.<函数名>(params)`

所有接口返回 Promise，统一使用 `.then()` 和 `.catch()` 处理结果和异常。

---

## 目录

- [表单操作类 API](#表单操作类-api)
  - [saveFormData](#saveformdata) - 新建表单实例
  - [updateFormData](#updateformdata) - 更新表单组件值
  - [searchFormDataIds](#searchformdataids) - 搜索表单实例 ID 列表
  - [getFormComponentDefinationList](#getformcomponentdefinationlist) - 获取表单定义
  - [deleteFormData](#deleteformdata) - 删除表单实例
  - [getFormDataById](#getformdatabyid) - 查询表单实例详情
  - [searchFormDatas](#searchformdatas) - 搜索表单实例详情列表
- [流程操作类 API](#流程操作类-api)
  - [startProcessInstance](#startprocessinstance) - 流程发起
  - [updateProcessInstance](#updateprocessinstance) - 流程实例更新
  - [deleteProcessInstance](#deleteprocessinstance) - 删除流程实例
  - [getProcessInstances](#getprocessinstances) - 获取流程实例详情列表
  - [getProcessInstanceIds](#getprocessinstanceids) - 搜索流程实例 ID 列表
  - [getProcessInstanceById](#getprocessinstancebyid) - 获取流程实例详情
- [工具类 API](#工具类-api)
  - [dialog](#dialog) - 对话框
  - [formatter](#formatter) - 格式化工具
  - [getDateTimeRange](#getdatetimerange) - 获取日期时间范围
  - [getLocale](#getlocale) - 获取语言环境
  - [getLoginUserId](#getloginuserid) - 获取登录用户 ID
  - [getLoginUserName](#getloginusername) - 获取登录用户名称
  - [isMobile](#ismobile) - 判断是否移动端
  - [isSubmissionPage](#issubmissionpage) - 判断是否提交页面
  - [isViewPage](#isviewpage) - 判断是否查看页面
  - [loadScript](#loadscript) - 动态加载脚本
  - [openPage](#openpage) - 打开新页面
  - [previewImage](#previewimage) - 图片预览
  - [toast](#toast) - 信息提醒

---

## 表单操作类 API

### saveFormData

**描述**：新建表单实例

**参数**：

| 参数名 | 类型 | 是否必填 | 描述 | 示例 |
| :--- | :--- | :--- | :--- | :--- |
| formUuid | String | 是 | 表单ID | `FORM-XXX` |
| appType | String | 是 | 应用 ID | `APP_XXX` |
| formDataJson | String | 是 | 表单数据（JSON字符串） | `JSON.stringify({ textField_xxx: '值' })` |

**formDataJson 示例**：

```json
{
  "textField_jcr0069m": "danhang",
  "textareaField_jcr0069n": "duohang",
  "numberField_jcr0069o": 1,
  "radioField_jcr0069p": "选项一",
  "selectField_jcr0069q": "选项一",
  "checkboxField_jcr0069r": [
    "选项二",
    "选项三"
  ],
  "multiSelectField_jcr0069s": [
    "选项二",
    "选项三"
  ],
  "dateField_jcr0069t": 1516636800000,
  "cascadeDate_jcr0069u": [
    "1514736000000",
    "1517328000000"
  ],
  "employeeField_jcr0069x": [
    "xxxxx"
  ],
  "citySelectField_jcr0069y": [
    "110000",
    "110100",
    "110101"
  ],
  "departmentField_jcr0069z": 1123456,
  "cascadeSelectField_jcr006a0": [
    "part",
    "part_b"
  ],
  "attachmentField_jna1lvyb": [
    {
      "downloadUrl": "https://www.aliwork.com/fileHandle?appType=default_tianshu_app&fileName=edd07ca9-1d2e-44b5-98fe-c1e16202f90d.txt&instId=&type=download",
      "name": "test.txt",
      "previewUrl": "https://www.aliwork.com/inst/preview?appType=default_tianshu_app&fileName=test.txt&fileSize=4&downloadUrl=edd07ca9-1d2e-44b5-98fe-c1e16202f90d.txt",
      "url": "https://www.aliwork.com/fileHandle?appType=default_tianshu_app&fileName=edd07ca9-1d2e-44b5-98fe-c1e16202f90d.txt&instId=&type=download",
      "ext": "txt"
    }
  ],
  "tableField_jcr006a1": [
    {
      "cascadeDate_jcr006aa": [
        "1514736000000",
        "1517328000000"
      ],
      "cascadeSelectField_jcr006ae": [
        "product",
        "product_a"
      ],
      "checkboxField_jcr006a7": [
        "选项一",
        "选项二",
        "选项三"
      ],
      "citySelectField_jcr006ac": [
        "120000",
        "120100",
        "120102"
      ],
      "dateField_jcr006a9": 1517328000000,
      "departmentField_jcr006ad": ["1123456"],
      "employeeField_jcr006ab": [
        "yyyyy",
        "xxxxx"
      ],
      "multiSelectField_jcr006a8": [
        "选项一",
        "选项二",
        "选项三"
      ],
      "numberField_jcr006a4": 2,
      "radioField_jcr006a5": "选项二",
      "selectField_jcr006a6": "选项三",
      "textField_jcr006a2": "子表单下单行",
      "textareaField_jcr006a3": "子表单下多行"
    }
  ]
}
```

**返回值**：

| 字段 | 类型 | 描述 |
| :--- | :--- | :--- |
| success | Boolean | 请求是否成功 |
| result | String | 实例ID |
| errorMsg | String | 错误信息 |
| errorCode | String | 错误码 |

**返回值示例**：

```json
{
  "result": "FINST-XXX",
  "success": true
}
```

**请求示例**：

```javascript
this.utils.yida.saveFormData({
  formUuid: 'FORM-XXX',
  appType: pageConfig.appType,
  formDataJson: JSON.stringify({
    textField_m1g4dcpy: '单行文本',
    textareaField_m1g4dcpz: '多行文本',
  }),
}).then((res) => {
  console.log('新建结果', res);
}).catch(({ message }) => {
  this.utils.toast({ title: message, type: 'error' });
});
```

---

### updateFormData

**描述**：更新表单中指定组件值

**参数**：

| 参数名 | 类型 | 是否必填 | 描述 | 示例 |
| :--- | :--- | :--- | :--- | :--- |
| formInstId | String | 是 | 表单实例ID | `FINST-xxx` |
| updateFormDataJson | String | 是 | 需要更新的表单数据（JSON字符串） | `JSON.stringify({ textField_xxx: '值' })` |
| useLatestVersion | String | 否 | 是否使用最新版本 | `y` |

**请求示例**：

```javascript
this.utils.yida.updateFormData({
  formInstId: 'FINST-xxx',
  updateFormDataJson: JSON.stringify({
    textField_m1g4dcpy: '单行文本',
    textareaField_m1g4dcpz: '多行文本',
  }),
  useLatestVersion: 'y',
}).then((res) => {
  console.log('更新成功');
}).catch(({ message }) => {
  this.utils.toast({ title: message, type: 'error' });
});
```

---

### searchFormDataIds

**描述**：根据条件搜索表单实例 ID 列表

**参数**：

| 参数名 | 类型 | 是否必填 | 描述 | 示例 |
| :--- | :--- | :--- | :--- | :--- |
| formUuid | String | 是 | 表单ID | `FORM-XXX` |
| currentPage | Number | 否 | 当前页，默认 1 | `1` |
| pageSize | Number | 否 | 每页记录数，默认 10，最大 100 | `10` |
| searchFieldJson | String | 否 | 根据表单内组件值查询（JSON字符串） | `JSON.stringify({ textField_xxx: '值' })` |

**请求示例**：

```javascript
this.utils.yida.searchFormDataIds({
  formUuid: 'FORM-XXX',
  currentPage: 1,
  pageSize: 10,
  searchFieldJson: JSON.stringify({
    textField_m1g4dcpy: '单行文本',
  }),
}).then((res) => {
  console.log('请求结果', res);
}).catch(({ message }) => {
  this.utils.toast({ title: message, type: 'error' });
});
```

---

### getFormComponentDefinationList

**描述**：获取表单定义

**参数**：

| 参数名 | 类型 | 是否必填 | 描述 | 示例 |
| :--- | :--- | :--- | :--- | :--- |
| formUuid | String | 是 | 表单ID | `FORM-XXX` |
| version | String | 否 | 版本号 | `""` |

**请求示例**：

```javascript
this.utils.yida.getFormComponentDefinationList({
  formUuid: 'FORM-XXX',
  version: '',
}).then((res) => {
  console.log('请求结果', res);
}).catch(({ message }) => {
  this.utils.toast({ title: message, type: 'error' });
});
```

---

### deleteFormData

**描述**：删除表单实例

**参数**：

| 参数名 | 类型 | 是否必填 | 描述 | 示例 |
| :--- | :--- | :--- | :--- | :--- |
| formUuid | String | 是 | 表单ID | `FORM-XXX` |

**请求示例**：

```javascript
this.utils.yida.deleteFormData({
  formUuid: 'FORM-XXX',
}).then((res) => {
  console.log('请求结果', res);
}).catch(({ message }) => {
  this.utils.toast({ title: message, type: 'error' });
});
```

---

### getFormDataById

**描述**：根据表单实例 ID 查询表单实例详情

**参数**：

| 参数名 | 类型 | 是否必填 | 描述 | 示例 |
| :--- | :--- | :--- | :--- | :--- |
| formInstId | String | 是 | 表单实例ID | `FINST-xxxx` |

**请求示例**：

```javascript
this.utils.yida.getFormDataById({
  formInstId: 'FINST-xxxx',
}).then((res) => {
  console.log('请求结果', res);
}).catch(({ message }) => {
  this.utils.toast({ title: message, type: 'error' });
});
```

---

### searchFormDatas

**描述**：根据条件搜索表单实例详情列表

**参数**：

| 参数名 | 类型 | 是否必填 | 描述 | 示例 |
| :--- | :--- | :--- | :--- | :--- |
| formUuid | String | 是 | 表单ID | `FORM-XXX` |
| searchFieldJson | String | 否 | 根据表单内组件值查询（JSON字符串） | `JSON.stringify({ textField_xxx: '值' })` |
| currentPage | Number | 否 | 当前页，默认 1 | `1` |
| pageSize | Number | 否 | 每页记录数，默认 10，最大 100 | `10` |
| originatorId | String | 否 | 根据数据提交人工号查询 | `'2134'` |
| createFrom | String | 否 | 创建时间范围起始，格式 yyyy-MM-dd | `'2024-01-01'` |
| createTo | String | 否 | 创建时间范围结束，格式 yyyy-MM-dd | `'2024-02-01'` |
| modifiedFrom | String | 否 | 修改时间范围起始，格式 yyyy-MM-dd | `'2024-01-01'` |
| modifiedTo | String | 否 | 修改时间范围结束，格式 yyyy-MM-dd | `'2024-02-01'` |
| dynamicOrder | String | 否 | 指定排序字段 | `'{"numberField_1ac":"+"}'` |

**searchFieldJson 示例**：

```json
{
  "textField_jcr0069m": "danhang",
  "textareaField_jcr0069n": "duohang",
  "numberField_jcr0069o": ["1", "10"],
  "radioField_jcr0069p": "选项一",
  "selectField_jcr0069q": "选项一",
  "checkboxField_jcr0069r": ["选项二"],
  "multiSelectField_jcr0069s": ["选项二", "选项三"],
  "dateField_jcr0069t": [1514736000000, 1517414399000],
  "cascadeDate_jcr0069u": [
    [1514736000000, 1517414399000],
    [1514736000000, 1517414399000]
  ],
  "employeeField_jcr0069x": ["xxxxx"],
  "citySelectField_jcr0069y": ["110000", "110100", "110101"],
  "departmentField_jcr0069z": ["1123456"],
  "cascadeSelectField_jcr006a0": ["part", "part_b"],
  "tableField_jcr006a1": "子表单数据"
}
```

**返回值**：

| 字段 | 类型 | 描述 |
| :--- | :--- | :--- |
| currentPage | Number | 当前页 |
| totalCount | Number | 符合条件的实例总数 |
| data | Array | 实例详情列表 |

**请求示例**：

```javascript
this.utils.yida.searchFormDatas({
  formUuid: 'FORM-XXX',
  searchFieldJson: '',
  currentPage: 1,
  pageSize: 10,
  originatorId: '',
  createFrom: '2024-01-01',
  createTo: '2024-02-01',
  modifiedFrom: '2024-01-01',
  modifiedTo: '2024-02-01',
  dynamicOrder: '',
}).then((res) => {
  console.log('请求结果', res);
}).catch(({ message }) => {
  this.utils.toast({ title: message, type: 'error' });
});
```

**返回值示例（data 字段）**：

```json
{
  "gmtModified": "2018-01-24 11:22:01",
  "formUuid": "FORM-XXX",
  "formInstId": "FINST-xxx",
  "formData": {
    "numberField_jcr0069o": 1,
    "multiSelectField_jcr0069s": ["选项三", "选项二"],
    "textareaField_jcr0069n": "duohang",
    "employeeField_jcr0069x": ["xxxx"],
    "departmentField_jcr0069z": "xxxx",
    "cascadeDate_jcr0069u": ["1514736000000", "1517328000000"],
    "cascadeSelectField_jcr006a0": ["part", "part_b"],
    "tableField_jcr006a1": [
      {
        "departmentField_jcr006ad": "xxxx",
        "cascadeDate_jcr006aa": ["1514736000000", "1517328000000"],
        "selectField_jcr006a6": "选项三",
        "citySelectField_jcr006ac": ["天津", "天津市", "河东区"],
        "radioField_jcr006a5": "选项二",
        "employeeField_jcr006ab": ["xxxxxx", "yyyyyy"],
        "dateField_jcr006a9": 1517328000000,
        "textField_jcr006a2": "子表单下单行",
        "textareaField_jcr006a3": "子表单下多行",
        "cascadeSelectField_jcr006ae": ["product", "product_a"],
        "numberField_jcr006a4": 2,
        "checkboxField_jcr006a7": ["选项一", "选项三", "选项二"],
        "multiSelectField_jcr006a8": ["选项一", "选项三", "选项二"]
      }
    ],
    "selectField_jcr0069q": "选项一",
    "citySelectField_jcr0069y": ["北京", "北京市", "东城区"],
    "checkboxField_jcr0069r": ["选项三", "选项二"],
    "textField_jcr0069m": "danhang",
    "radioField_jcr0069p": "选项一",
    "dateField_jcr0069t": 1516636800000
  },
  "originator": {
    "name": {
      "pureEn_US": "userEnglishName",
      "en_US": "userEnglishName",
      "zh_CN": "userName",
      "type": "i18n"
    },
    "userId": "xxxx"
  }
}
```

---

## 流程操作类 API

### startProcessInstance

**描述**：流程发起

**参数**：

| 参数名 | 类型 | 是否必填 | 描述 | 示例 |
| :--- | :--- | :--- | :--- | :--- |
| formUuid | String | 是 | 表单ID | `FORM-XXX` |
| processCode | String | 是 | 流程编码 | `TPROC--xxx` |
| deptId | String | 否 | 部门ID | `''` |
| formDataJson | String | 是 | 表单数据（JSON字符串） | `JSON.stringify({ textField_xxx: '值' })` |

**请求示例**：

```javascript
this.utils.yida.startProcessInstance({
  formUuid: 'FORM-XXX',
  processCode: 'TPROC--xxx',
  deptId: '',
  formDataJson: JSON.stringify({
    textField_xxx: '单行文本',
    textareaField_xxx: '多行文本',
  }),
}).then((res) => {
  console.log('请求结果', res);
}).catch(({ message }) => {
  this.utils.toast({ title: message, type: 'error' });
});
```

---

### updateProcessInstance

**描述**：流程实例更新

**参数**：

| 参数名 | 类型 | 是否必填 | 描述 | 示例 |
| :--- | :--- | :--- | :--- | :--- |
| processInstanceId | String | 是 | 流程实例ID | `f30233fb-xxx-9ee530` |
| updateFormDataJson | String | 是 | 需要更新的表单数据（JSON字符串） | `JSON.stringify({ textField_xxx: '值' })` |

**请求示例**：

```javascript
this.utils.yida.updateProcessInstance({
  processInstanceId: 'f30233fb-xxx-9ee530',
  updateFormDataJson: JSON.stringify({
    textField_xxx: '单行文本',
    textareaField_xxx: '多行文本',
  }),
}).then((res) => {
  console.log('请求结果', res);
}).catch(({ message }) => {
  this.utils.toast({ title: message, type: 'error' });
});
```

---

### deleteProcessInstance

**描述**：删除流程实例

**参数**：

| 参数名 | 类型 | 是否必填 | 描述 | 示例 |
| :--- | :--- | :--- | :--- | :--- |
| processInstanceId | String | 是 | 流程实例ID | `f30233fb-xxx-9ee530` |

**请求示例**：

```javascript
this.utils.yida.deleteProcessInstance({
  processInstanceId: 'f30233fb-xxx-9ee530',
}).then((res) => {
  console.log('请求结果', res);
}).catch(({ message }) => {
  this.utils.toast({ title: message, type: 'error' });
});
```

---

### getProcessInstances

**描述**：根据搜索条件获取流程实例详情列表

**参数**：

| 参数名 | 类型 | 是否必填 | 描述 | 示例 |
| :--- | :--- | :--- | :--- | :--- |
| formUuid | String | 否 | 表单ID | `FORM-XXX` |
| taskId | String | 否 | 任务ID | `'2199132092'` |
| instanceStatus | String | 否 | 实例状态 | `'RUNNING'` |
| approvedResult | String | 否 | 流程审批结果 | `'agree'` |
| currentPage | Number | 否 | 当前页，默认 1 | `1` |
| pageSize | Number | 否 | 每页记录数，默认 10，最大 100 | `10` |
| originatorId | String | 否 | 流程发起人工号 | `'2134'` |
| createFrom | String | 否 | 创建时间范围起始，格式 yyyy-MM-dd | `'2024-01-01'` |
| createTo | String | 否 | 创建时间范围结束，格式 yyyy-MM-dd | `'2024-02-01'` |
| modifiedFrom | String | 否 | 修改时间范围起始，格式 yyyy-MM-dd | `'2024-01-01'` |
| modifiedTo | String | 否 | 修改时间范围结束，格式 yyyy-MM-dd | `'2024-02-01'` |
| searchFieldJson | String | 否 | 根据表单内组件值查询（JSON字符串） | `JSON.stringify({ textField_xxx: '值' })` |

**请求示例**：

```javascript
this.utils.yida.getProcessInstances({
  formUuid: 'FORM-XXX',
  taskId: '2199132092',
  instanceStatus: 'RUNNING',
  approvedResult: 'agree',
  currentPage: 1,
  pageSize: 10,
  originatorId: '2134',
  createFrom: '2024-01-01',
  createTo: '2024-02-01',
  modifiedFrom: '2024-01-01',
  modifiedTo: '2024-02-01',
  searchFieldJson: JSON.stringify({
    textField_xxx: '单行文本',
  }),
}).then((res) => {
  console.log('请求结果', res);
}).catch(({ message }) => {
  this.utils.toast({ title: message, type: 'error' });
});
```

---

### getProcessInstanceIds

**描述**：根据条件搜索流程实例 ID 列表

**参数**：

| 参数名 | 类型 | 是否必填 | 描述 | 示例 |
| :--- | :--- | :--- | :--- | :--- |
| formUuid | String | 否 | 表单ID | `FORM-XXX` |
| taskId | String | 否 | 任务ID | `'2199132092'` |
| instanceStatus | String | 否 | 实例状态 | `'RUNNING'` |
| approvedResult | String | 否 | 流程审批结果 | `'agree'` |
| currentPage | Number | 否 | 当前页，默认 1 | `1` |
| pageSize | Number | 否 | 每页记录数，默认 10，最大 100 | `10` |
| originatorId | String | 否 | 流程发起人工号 | `'2134'` |
| createFrom | String | 否 | 创建时间范围起始，格式 yyyy-MM-dd | `'2024-01-01'` |
| createTo | String | 否 | 创建时间范围结束，格式 yyyy-MM-dd | `'2024-02-01'` |
| modifiedFrom | String | 否 | 修改时间范围起始，格式 yyyy-MM-dd | `'2024-01-01'` |
| modifiedTo | String | 否 | 修改时间范围结束，格式 yyyy-MM-dd | `'2024-02-01'` |
| searchFieldJson | String | 否 | 根据表单内组件值查询（JSON字符串） | `JSON.stringify({ textField_xxx: '值' })` |

**请求示例**：

```javascript
this.utils.yida.getProcessInstanceIds({
  formUuid: 'FORM-XXX',
  taskId: '2199132092',
  instanceStatus: 'RUNNING',
  approvedResult: 'agree',
  currentPage: 1,
  pageSize: 10,
  originatorId: '2134',
  createFrom: '2024-01-01',
  createTo: '2024-02-01',
  modifiedFrom: '2024-01-01',
  modifiedTo: '2024-02-01',
  searchFieldJson: JSON.stringify({
    textField_xxx: '单行文本',
  }),
}).then((res) => {
  console.log('请求结果', res);
}).catch(({ message }) => {
  this.utils.toast({ title: message, type: 'error' });
});
```

---

### getProcessInstanceById

**描述**：根据实例 ID 获取流程实例详情

**参数**：

| 参数名 | 类型 | 是否必填 | 描述 | 示例 |
| :--- | :--- | :--- | :--- | :--- |
| processInstanceId | String | 是 | 流程实例ID | `f30233fb-xxx-530` |

**请求示例**：

```javascript
this.utils.yida.getProcessInstanceById({
  processInstanceId: 'f30233fb-xxx-530',
}).then((res) => {
  console.log('请求结果', res);
}).catch(({ message }) => {
  this.utils.toast({ title: message, type: 'error' });
});
```


---

## 工具类 API

宜搭提供了很多内置的工具类函数，帮助用户更好地实现一些常用功能。

### dialog

**描述**：弹出对话框，用户需要手动关闭。底层采用 Fusion 组件实现，支持配置所有 Dialog 组件属性。

**参数**：

| 参数名 | 类型 | 默认值 | 说明 |
| :--- | :--- | :--- | :--- |
| type | String | `'alert'` | 对话框类型：`alert` / `confirm` / `show` |
| title | String | - | 对话框标题 |
| content | String \| ReactNode | - | 内容，可传入 HTML/JSX 实现复杂布局 |
| hasMask | Boolean | `true` | 是否有遮罩 |
| footer | Boolean | `true` | 是否有底部操作按钮 |
| footerAlign | String | `'right'` | 底部操作对齐方向：`left` / `center` / `right` |
| footerActions | Array | - | 底部操作类型和顺序，如 `['cancel', 'ok']` / `['ok']` / `['cancel']` |
| onOk | Function | - | 点击确定的回调函数 |
| onCancel | Function | - | 点击取消的回调函数 |

**请求示例**：

```javascript
export function popDialog() {
  this.utils.dialog({
    type: 'confirm',
    title: '确认操作',
    content: '确定要执行此操作吗？',
    onOk: () => {
      console.log('点击了确定');
    },
    onCancel: () => {
      console.log('点击了取消');
    },
  });
}

// 支持手动关闭对话框
export function closeDialog() {
  const dialog = this.utils.dialog({
    title: '处理中',
    content: '请稍候...',
  });
  
  // 3秒后自动关闭
  setTimeout(() => dialog.hide(), 3000);
}
```

---

### formatter

**描述**：常用的格式化函数，支持日期、金额、手机号、银行卡号等格式转换。

**参数**：

| 参数名 | 类型 | 是否必填 | 说明 |
| :--- | :--- | :--- | :--- |
| type | String | 是 | 格式化类型：`date` / `money` / `cnmobile` / `card` |
| value | String \| Number \| Date | 是 | 待格式化的值 |
| format | String | 条件必填 | 日期格式模板（仅 type=date 时必填） |

**常用格式化类型**：

| 类型 | 示例 | 输出 |
| :--- | :--- | :--- |
| `date` | `formatter('date', new Date(), 'YYYY-MM-DD')` | `2022-01-29` |
| `date` | `formatter('date', new Date(), 'YYYY/MM/DD')` | `2022/01/29` |
| `date` | `formatter('date', new Date(), 'YYYY-MM-DD HH:mm:ss')` | `2022-01-29 13:01:02` |
| `money` | `formatter('money', '10000.99', ', ')` | `10, 000.99` |
| `cnmobile` | `formatter('cnmobile', '+8615652988282')` | `+86 1565 2988 282` |
| `card` | `formatter('card', '1565298828212233')` | `1565 2988 2821 2233` |

**请求示例**：

```javascript
export function format() {
  // 格式化日期
  const date1 = this.utils.formatter('date', new Date(), 'YYYY-MM-DD');
  const date2 = this.utils.formatter('date', new Date(), 'YYYY/MM/DD');
  const dateTime = this.utils.formatter('date', new Date(), 'YYYY-MM-DD HH:mm:ss');

  // 格式化金额
  const money = this.utils.formatter('money', '10000.99', ', ');

  // 格式化手机号
  const phone = this.utils.formatter('cnmobile', '+8615652988282');

  // 格式化银行卡号
  const card = this.utils.formatter('card', '1565298828212233');
}
```

---

### getDateTimeRange

**描述**：获取当前或指定日期的开始/结束区间时间戳。

**参数**：

| 参数名 | 类型 | 默认值 | 说明 |
| :--- | :--- | :--- | :--- |
| when | Number \| Date | `new Date()` | 指定日期，支持时间戳或 Date 对象 |
| type | String | `'day'` | 区间类型：`year` / `month` / `week` / `day` / `date` / `hour` / `minute` / `second` |

**返回值**：`[开始时间戳, 结束时间戳]` 数组

**请求示例**：

```javascript
export function search() {
  // 获取当天的开始和结束时间戳
  const [dayStart, dayEnd] = this.utils.getDateTimeRange();
  console.log(`当天范围: ${dayStart} ~ ${dayEnd}`);

  // 获取当月的开始和结束时间戳
  const [monthStart, monthEnd] = this.utils.getDateTimeRange(new Date(), 'month');
  console.log(`当月范围: ${monthStart} ~ ${monthEnd}`);
}
```

---

### getLocale

**描述**：获取当前页面的语言环境。

**返回值**：`String` - 语言代码，如 `zh_CN`、`en_US`

**请求示例**：

```javascript
export function locale() {
  const locale = this.utils.getLocale();
  console.log(`当前语言: ${locale}`); // 输出：当前语言: zh_CN
}
```

---

### getLoginUserId

**描述**：获取当前登录用户的 ID。

**返回值**：`String` - 用户 ID

**请求示例**：

```javascript
export function getUserInfo() {
  const userId = this.utils.getLoginUserId();
  console.log(`用户ID: ${userId}`); // 输出：用户ID: 43314767738888
}
```

---

### getLoginUserName

**描述**：获取当前登录用户的名称。

**返回值**：`String` - 用户名称

**请求示例**：

```javascript
export function getUserInfo() {
  const userName = this.utils.getLoginUserName();
  console.log(`用户名: ${userName}`); // 输出：用户名: 韩火火
}
```

---

### isMobile

**描述**：判断当前访问环境是否是移动端。

**返回值**：`Boolean` - `true` 表示移动端，`false` 表示 PC 端

**请求示例**：

```javascript
export function someFunctionName() {
  if (this.utils.isMobile()) {
    console.log('当前是移动端');
  } else {
    console.log('当前是 PC 端');
  }
}
```

---

### isSubmissionPage

**描述**：判断当前页面是否是数据提交页面。

**返回值**：`Boolean`

**请求示例**：

```javascript
export function someFunctionName() {
  console.log('是否提交页面:', this.utils.isSubmissionPage());
}
```

---

### isViewPage

**描述**：判断当前页面是否是数据查看页面。

**返回值**：`Boolean`

**请求示例**：

```javascript
export function someFunctionName() {
  console.log('是否查看页面:', this.utils.isViewPage());
}
```

---

### loadScript

**描述**：动态加载远程 JavaScript 脚本。

**参数**：

| 参数名 | 类型 | 是否必填 | 说明 |
| :--- | :--- | :--- | :--- |
| url | String | 是 | 脚本 URL 地址 |

**返回值**：`Promise` - 加载完成后 resolve

**请求示例**：

```javascript
export function didMount() {
  this.utils.loadScript('https://g.alicdn.com/code/lib/qrcodejs/1.0.0/qrcode.min.js')
    .then(() => {
      const qrcode = new QRCode(document.getElementById('qrcode'), {
        text: 'https://www.aliwork.com',
        width: 128,
        height: 128,
        colorDark: '#000000',
        colorLight: '#ffffff',
        correctLevel: QRCode.CorrectLevel.H,
      });
    });
}
```

---

### openPage

**描述**：打开新页面。在钉钉环境下会使用钉钉 API 打开，体验更友好。

**参数**：

| 参数名 | 类型 | 是否必填 | 说明 |
| :--- | :--- | :--- | :--- |
| url | String | 是 | 页面地址，支持相对路径或绝对路径 |

**请求示例**：

```javascript
export function someFunctionName() {
  // 打开应用内页面
  this.utils.openPage('/workbench');
  
  // 打开外部链接
  this.utils.openPage('https://www.dingtalk.com');
}
```

---

### previewImage

**描述**：图片预览，支持手势缩放、滑动切换。

**参数**：

| 参数名 | 类型 | 是否必填 | 说明 |
| :--- | :--- | :--- | :--- |
| current | String | 是 | 当前预览图片的 URL |
| urls | Array | 否 | 图片 URL 列表（多图预览时使用） |

**请求示例**：

```javascript
export function previewImg() {
  // 单图预览
  this.utils.previewImage({
    current: 'https://img.alicdn.com/tfs/TB1xxx.png',
  });
  
  // 多图预览
  this.utils.previewImage({
    current: 'https://img.alicdn.com/tfs/TB1xxx.png',
    urls: [
      'https://img.alicdn.com/tfs/TB1xxx.png',
      'https://img.alicdn.com/tfs/TB2xxx.png',
      'https://img.alicdn.com/tfs/TB3xxx.png',
    ],
  });
}
```

---

### toast

**描述**：信息提醒，比 Dialog 更轻量，自动消失。

**参数**：

| 参数名 | 类型 | 默认值 | 说明 |
| :--- | :--- | :--- | :--- |
| type | String | `'notice'` | 类型：`success` / `warning` / `error` / `notice` / `help` / `loading` |
| title | String | - | 提示内容 |
| size | String | `'medium'` | 尺寸：`medium` / `large` |
| duration | Number | - | 显示时长（毫秒），`loading` 类型时无效 |

**返回值**：`Function` - 关闭方法（`loading` 类型时返回）

**请求示例**：

```javascript
export function popToast() {
  // 成功提示
  this.utils.toast({
    title: '操作成功',
    type: 'success',
    size: 'large',
  });
}

// loading 提示（需手动关闭）
export function showLoadingToast() {
  const close = this.utils.toast({
    title: '加载中...',
    type: 'loading',
    size: 'large',
  });
  
  // 3秒后关闭
  setTimeout(close, 3000);
}

// 错误提示
export function showError() {
  this.utils.toast({
    title: '操作失败，请重试',
    type: 'error',
    duration: 3000,
  });
}