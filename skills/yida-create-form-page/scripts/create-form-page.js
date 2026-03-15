#!/usr/bin/env node
/**
 * create-form-page.js - 宜搭表单页面创建 & 更新工具
 *
 * 支持两种模式：
 *
 * 1. create 模式 - 创建新表单页面：
 *   node create-form-page.js create <appType> <formTitle> <fieldsJsonFile>
 *
 * 2. update 模式 - 更新已有表单页面：
 *   node create-form-page.js update <appType> <formUuid> <changesJsonOrFile>
 *
 * create 模式参数：
 *   appType        - 应用 ID（必填），如 APP_XXX
 *   formTitle      - 表单名称（必填）
 *   fieldsJsonFile - 字段定义 JSON 文件路径（必填）
 *
 * update 模式参数：
 *   appType          - 应用 ID（必填）
 *   formUuid         - 表单 UUID（必填），如 FORM-XXX
 *   changesJsonOrFile - 修改定义，支持 JSON 字符串（以 [ 开头）或 JSON 文件路径
 *
 * 字段定义 JSON 格式（create 模式）：
 *   [
 *     { "type": "TextField", "label": "姓名", "required": true },
 *     { "type": "SelectField", "label": "部门", "options": ["技术部", "产品部"] },
 *     { "type": "DateField", "label": "入职日期" },
 *     { "type": "TableField", "label": "费用明细", "children": [
 *       { "type": "TextField", "label": "项目" },
 *       { "type": "NumberField", "label": "金额" }
 *     ]}
 *   ]
 *
 * 修改定义 JSON 格式（update 模式）：
 *   [
 *     { "action": "add", "field": { "type": "TextField", "label": "备注" } },
 *     { "action": "add", "field": { "type": "SelectField", "label": "部门", "options": ["技术部", "产品部"] }, "after": "姓名" },
 *     { "action": "delete", "label": "备注" },
 *     { "action": "update", "label": "年龄", "changes": { "required": true, "placeholder": "请输入年龄" } }
 *   ]
 *
 * 支持的字段类型：
 *   TextField, TextareaField, RadioField, SelectField, CheckboxField,
 *   MultiSelectField, NumberField, RateField, DateField, CascadeDateField,
 *   EmployeeField, DepartmentSelectField, CountrySelectField, AddressField,
 *   AttachmentField, ImageField, TableField, AssociationFormField, SerialNumberField
 *
 * 前置条件：
 *   项目根目录下需存在 .cache/cookies.json（由 yida-login 生成）。
 *   若接口返回 302（登录失效），脚本会自动调用 login.py 重新登录后重试。
 *
 * 示例：
 *   # 创建表单
 *   node .claude/skills/yida-create-form-page/scripts/create-form-page.js create "APP_xxx" "员工信息登记" fields.json
 *   # 更新表单
 *   node .claude/skills/yida-create-form-page/scripts/create-form-page.js update "APP_XXX" "FORM-YYY" '[{"action":"add","field":{"type":"TextField","label":"备注"}}]'
 */

const https = require("https");
const http = require("http");
const fs = require("fs");
const path = require("path");
const querystring = require("querystring");
const { execSync } = require("child_process");

// ── 配置读取 ──────────────────────────────────────────
const CONFIG_PATH = path.resolve(findProjectRoot(), "config.json");

function findProjectRoot() {
  // 优先从调用者工作目录向上找，确保在其他项目中调用时能正确定位
  for (const startDir of [process.cwd(), __dirname]) {
    let currentDir = startDir;
    while (currentDir !== path.dirname(currentDir)) {
      if (fs.existsSync(path.join(currentDir, "README.md")) ||
          fs.existsSync(path.join(currentDir, ".git"))) {
        return currentDir;
      }
      currentDir = path.dirname(currentDir);
    }
  }
  return process.cwd();
}
const CONFIG = fs.existsSync(CONFIG_PATH) ? JSON.parse(fs.readFileSync(CONFIG_PATH, "utf-8")) : {};
const DEFAULT_BASE_URL = CONFIG.defaultBaseUrl || "https://www.aliwork.com";
const PROJECT_ROOT = findProjectRoot();
const COOKIE_FILE = path.join(PROJECT_ROOT, ".cache", "cookies.json");
const LOGIN_SCRIPT = path.join(PROJECT_ROOT, ".claude", "skills", "yida-login", "scripts", "login.py");

// ── 选项类字段类型 ───────────────────────────────────
const OPTION_FIELD_TYPES = ["RadioField", "SelectField", "CheckboxField", "MultiSelectField"];

// ── 接口路径生成 ──────────────────────────────────────

/**
 * 生成宜搭接口请求路径
 * @param {string} appType - 应用 ID
 * @param {string} apiName - 接口名称，如 'saveFormSchema', 'getFormSchema', 'saveFormSchemaInfo', 'updateFormConfig'
 * @param {Object} options - 可选参数
 * @param {string} options.prefix - 路径前缀，如 '_view'，默认为空
 * @param {string} options.namespace - 命名空间，如 'alibaba' 或 'dingtalk'，默认 'dingtalk'
 * @param {boolean} options.addTimestamp - 是否添加时间戳参数，默认 false
 * @returns {string} 完整的接口路径
 */
function buildApiPath(appType, apiName, options = {}) {
  const { prefix = "", namespace = "dingtalk", addTimestamp = false } = options;
  const prefixPath = prefix ? `/${prefix}` : "";
  const timestamp = addTimestamp ? `?_stamp=${Date.now()}` : "";
  return `/${namespace}/web/${appType}${prefixPath}/query/formdesign/${apiName}.json${timestamp}`;
}

// ── 参数解析 ─────────────────────────────────────────

function parseArgs() {
  const args = process.argv.slice(2);
  const mode = args[0];

  if (mode === "create") {
    if (args.length < 4) {
      console.error("用法: node create-form-page.js create <appType> <formTitle> <fieldsJsonFile>");
      console.error('示例：node .claude/skills/yida-create-form-page/scripts/create-form-page.js create "APP_XXX" "员工信息登记" fields.json');
      process.exit(1);
    }
    return { mode: "create", appType: args[1], formTitle: args[2], fieldsJsonOrFile: args[3] };
  }

  if (mode === "update") {
    if (args.length < 4) {
      console.error("用法: node create-form-page.js update <appType> <formUuid> <changesJsonOrFile>");
      console.error('示例：node .claude/skills/yida-create-form-page/scripts/create-form-page.js update "APP_XXX" "FORM-YYY" \'[{"action":"add","field":{"type":"TextField","label":"备注"}}]\'');
      process.exit(1);
    }
    return { mode: "update", appType: args[1], formUuid: args[2], changesJsonOrFile: args[3] };
  }

  // 兼容旧用法（无 mode 参数，默认 create 模式）
  if (args.length >= 3 && mode !== "create" && mode !== "update") {
    return { mode: "create", appType: args[0], formTitle: args[1], fieldsJsonOrFile: args[2] };
  }

  console.error("用法:");
  console.error("  创建: node create-form-page.js create <appType> <formTitle> <fieldsJsonFile>");
  console.error("  更新: node create-form-page.js update <appType> <formUuid> <changesJsonOrFile>");
  console.error("\n示例:");
  console.error('  node .claude/skills/yida-create-form-page/scripts/create-form-page.js create "APP_XXX" "员工信息登记" fields.json');
  console.error('  node .claude/skills/yida-create-form-page/scripts/create-form-page.js update "APP_XXX" "FORM-YYY" \'[{"action":"add","field":{"type":"TextField","label":"备注"}}]\'');
  process.exit(1);
}

// ── 登录态管理 ───────────────────────────────────────

/**
 * 从 Cookie 列表中提取 csrf_token 和 corp_id
 * - csrf_token：name="tianshu_csrf_token" 的 cookie value
 * - corp_id：name="tianshu_corp_user" 的 cookie value，格式 "{corpId}_{userId}"，按最后一个 "_" 分隔
 */
function extractInfoFromCookies(cookies) {
  let csrfToken = null;
  let corpId = null;
  for (const cookie of cookies) {
    if (cookie.name === "tianshu_csrf_token") {
      csrfToken = cookie.value;
    } else if (cookie.name === "tianshu_corp_user") {
      const lastUnderscore = cookie.value.lastIndexOf("_");
      if (lastUnderscore > 0) {
        corpId = cookie.value.slice(0, lastUnderscore);
      }
    }
  }
  return { csrfToken, corpId };
}

function loadCookieData() {
  if (!fs.existsSync(COOKIE_FILE)) return null;
  try {
    const raw = fs.readFileSync(COOKIE_FILE, "utf-8").trim();
    if (!raw) return null;
    const parsed = JSON.parse(raw);
    let cookieData;
    if (Array.isArray(parsed)) {
      cookieData = { cookies: parsed, base_url: DEFAULT_BASE_URL };
    } else {
      cookieData = parsed;
    }
    // 从 Cookie 中提取 csrf_token 和 corp_id（优先使用 Cookie 中的值）
    if (cookieData.cookies && cookieData.cookies.length > 0) {
      const { csrfToken, corpId } = extractInfoFromCookies(cookieData.cookies);
      if (csrfToken) cookieData.csrf_token = csrfToken;
      if (corpId) cookieData.corp_id = corpId;
    }
    return cookieData;
  } catch {
    return null;
  }
}

function triggerLogin() {
  console.error("\n🔐 登录态失效，正在调用 login.py 重新登录...\n");
  if (!fs.existsSync(LOGIN_SCRIPT)) {
    console.error(`  ❌ 登录脚本不存在: ${LOGIN_SCRIPT}`);
    process.exit(1);
  }
  const stdout = execSync(`python3 "${LOGIN_SCRIPT}"`, {
    encoding: "utf-8",
    stdio: ["inherit", "pipe", "inherit"],
    timeout: 180_000,
  });
  const lines = stdout.trim().split("\n");
  const jsonLine = lines[lines.length - 1];
  try {
    const loginResult = JSON.parse(jsonLine);
    if (!loginResult.cookies) throw new Error("登录结果缺少 cookies");
    return loginResult;
  } catch (err) {
    console.error(`  ❌ 解析登录结果失败: ${err.message}`);
    process.exit(1);
  }
}

function resolveBaseUrl(cookieData) {
  return ((cookieData && cookieData.base_url) || DEFAULT_BASE_URL).replace(/\/+$/, "");
}

/**
 * 检测响应体是否表示登录过期
 * 登录过期响应：{"success":false,"errorCode":"307","errorMsg":"登录状态已过期，请刷新页面后重新访问"}
 */
function isLoginExpired(responseJson) {
  return responseJson && responseJson.success === false && (responseJson.errorCode === "307" || responseJson.errorCode === "302");
}

/**
 * 检测响应体是否表示 csrf_token 过期
 * csrf 过期响应：{"success":false,"errorCode":"TIANSHU_000030","errorMsg":"csrf校验失败"}
 */
function isCsrfTokenExpired(responseJson) {
  return responseJson && responseJson.success === false && responseJson.errorCode === "TIANSHU_000030";
}

function refreshCsrfToken() {
  console.error("\n🔄 csrf_token 已过期，正在刷新...\n");
  if (!fs.existsSync(LOGIN_SCRIPT)) {
    console.error(`  ❌ 登录脚本不存在: ${LOGIN_SCRIPT}`);
    process.exit(1);
  }
  const stdout = execSync(`python3 "${LOGIN_SCRIPT}" --refresh-csrf`, {
    encoding: "utf-8",
    stdio: ["inherit", "pipe", "inherit"],
    timeout: 60_000,
  });
  const lines = stdout.trim().split("\n");
  const jsonLine = lines[lines.length - 1];
  try {
    const result = JSON.parse(jsonLine);
    if (!result.csrf_token || !result.cookies) throw new Error("刷新结果缺少 csrf_token 或 cookies");
    return result;
  } catch (err) {
    console.error(`  ❌ 解析刷新结果失败: ${err.message}`);
    process.exit(1);
  }
}

// ── 读取字段定义 ─────────────────────────────────────

function readFieldsDefinition(fieldsJsonOrFile) {
  var rawContent;

  // 判断是 JSON 字符串还是文件路径
  if (fieldsJsonOrFile.trimStart().startsWith("[")) {
    rawContent = fieldsJsonOrFile;
  } else if (fieldsJsonOrFile.trimStart().startsWith("{")) {
    rawContent = fieldsJsonOrFile;
  } else {
    var resolvedPath = path.resolve(fieldsJsonOrFile);
    if (!fs.existsSync(resolvedPath)) {
      console.error("  ❌ 字段定义文件不存在: " + resolvedPath);
      process.exit(1);
    }
    rawContent = fs.readFileSync(resolvedPath, "utf-8");
  }

  try {
    const parsed = JSON.parse(rawContent);
    
    // 支持两种格式：
    // 1. 数组格式: [{type: "TextField", label: "姓名"}, ...]
    // 2. 对象格式: { columns: 2, fields: [{type: "TextField", label: "姓名"}, ...] }
    let fields;
    let columns = 1; // 默认单列
    
    if (Array.isArray(parsed)) {
      fields = parsed;
    } else if (typeof parsed === "object" && parsed !== null) {
      fields = parsed.fields || [];
      columns = parsed.columns !== undefined ? parsed.columns : 1;
    } else {
      throw new Error("字段定义格式不正确");
    }
    
    if (!Array.isArray(fields) || fields.length === 0) {
      throw new Error("字段定义必须是非空数组");
    }
    
    return { fields, columns };
  } catch (parseError) {
    console.error("  ❌ 解析字段定义失败: " + parseError.message);
    process.exit(1);
  }
}

// ── 读取修改定义（update 模式） ─────────────────────

function readChangesDefinition(changesJsonOrFile) {
  var rawContent;

  // 判断是 JSON 字符串还是文件路径
  if (changesJsonOrFile.trimStart().startsWith("[")) {
    rawContent = changesJsonOrFile;
  } else {
    var resolvedPath = path.resolve(changesJsonOrFile);
    if (!fs.existsSync(resolvedPath)) {
      console.error("  ❌ 修改定义文件不存在: " + resolvedPath);
      process.exit(1);
    }
    rawContent = fs.readFileSync(resolvedPath, "utf-8");
  }

  try {
    var changes = JSON.parse(rawContent);
    if (!Array.isArray(changes) || changes.length === 0) {
      throw new Error("修改定义必须是非空数组");
    }
    return changes;
  } catch (parseError) {
    console.error("  ❌ 解析修改定义失败: " + parseError.message);
    process.exit(1);
  }
}

// ── 自增 ID 计数器 ───────────────────────────────────
let nodeIdCounter = 1;

function nextNodeId() {
  return "node_oc" + Date.now().toString(36) + (nodeIdCounter++).toString(36);
}

function generateFieldId(componentName) {
  const prefix = componentName.charAt(0).toLowerCase() + componentName.slice(1);
  // 使用 4 位时间戳 + 4 位随机数，共 8 位
  const timePart = Date.now().toString(36).slice(-4);
  const randomPart = Math.random().toString(36).substring(2, 6);
  const suffix = timePart + randomPart;
  return prefix + "_" + suffix;
}

// ── i18n 辅助 ────────────────────────────────────────

function i18n(text, enText) {
  return { type: "i18n", zh_CN: text, en_US: enText || text };
}

// ── 默认占位符 ───────────────────────────────────────

const PLACEHOLDER_INPUT = i18n("请输入", "Please enter");
const PLACEHOLDER_SELECT = i18n("请选择", "please select");

// ── 生成选项数据源 ───────────────────────────────────

function buildOptionDataSource(options) {
  return options.map(function (optionText, optionIndex) {
    return {
      text: { zh_CN: optionText, en_US: optionText, type: "i18n" },
      value: optionText,
      sid: "serial_" + Date.now().toString(36) + optionIndex,
      disable: false,
      defaultChecked: false,
    };
  });
}

// ── 生成字段组件 ─────────────────────────────────────

function buildFieldComponent(field) {
  const componentName = field.type;
  const fieldId = generateFieldId(componentName);
  const nodeId = nextNodeId();

  // 基础 validation
  const validation = [];
  if (field.required) {
    validation.push({ type: "required" });
  }

  // 基础 props（所有字段通用）
  const props = {
    __useMediator: "value",
    fieldId: fieldId,
    label: i18n(field.label, componentName),
    __category__: "form",
    behavior: "NORMAL",
    visibility: ["PC", "MOBILE"],
    dataEntryMode: false,
    submittable: "DEFAULT",
    validation: validation,
    labelAlign: "top",
    labelTextAlign: "left",
    labelColSpan: 4,
    size: "medium",
    submittable: "ALWAYS",
  };

  // 文本类字段
  if (componentName === "TextField" || componentName === "TextareaField") {
    props.hasClear = true;
    props.placeholder = field.placeholder ? i18n(field.placeholder) : PLACEHOLDER_INPUT;
    props.valueType = "custom";
    props.validationType = "text";
    props.value = i18n("", "");
    props.hasLimitHint = false;
    props.maxLength = 200;
    props.rows = 4;
    props.linkage = "";
    props.__gridSpan = 1;
    props.tips = i18n("", "");
    props.autoHeight = false;
    props.scanCode = { enabled: false, type: "all", editable: true };
    props.complexValue = {
      complexType: "custom",
      formula: "",
      value: { en_US: "", zh_CN: "", type: "i18n" },
    };
    props.variable = "";
    props.formula = "";
    props.isCustomStore = true;
    
    // TextareaField 特有属性
    if (componentName === "TextareaField") {
      props.htmlType = "textarea";
      props.showEmptyRows = false;
    }
  }

  // 数字字段
  if (componentName === "NumberField") {
    props.hasClear = true;
    props.placeholder = field.placeholder ? i18n(field.placeholder) : i18n("请输入数字", "Please enter a number");
    props.valueType = "custom";
    props.__gridSpan = 1;
    props.tips = i18n("", "");
    props.linkage = "";
    props.precision = 0;
    props.step = 1;
    props.thousandsSeparators = false;
    props.innerAfter = field.innerAfter || "";
    props.value = "";
    props.labelColOffset = 0;
    props.wrapperColSpan = 0;
    props.wrapperColOffset = 0;
    props.complexValue = {
      complexType: "custom",
      formula: "",
      value: "",
    };
    props.variable = "";
    props.formula = "";
    props.isCustomStore = true;
  }

  // 评分字段
  if (componentName === "RateField") {
    props.count = 5;
    props.allowHalf = false;
    props.showGrade = false;
    props.__gridSpan = 1;
    props.tips = i18n("", "");
  }

  // 日期字段
  if (componentName === "DateField") {
    props.placeholder = field.placeholder ? i18n(field.placeholder) : PLACEHOLDER_SELECT;
    props.__gridSpan = 1;
    props.tips = i18n("", "");
    props.linkage = "";
    props.format = field.format || "YYYY-MM-DD";
    props.hasClear = true;
    props.disabledDate = { type: "none" };
    props.valueType = "custom";
    props.value = "";
    props.formula = "";
    props.variable = "";
    props.resetTime = false;
    props.complexValue = {
      complexType: "custom",
      value: "",
      formula: "",
    };
  }

  // 级联日期字段
  if (componentName === "CascadeDateField") {
    props.__gridSpan = 1;
    props.tips = i18n("", "");
    props.format = field.format || "YYYY-MM-DD";
    props.hasClear = true;
    props.resetTime = false;
    props.disabledDate = false;
  }

  // 选项类字段（RadioField、SelectField、CheckboxField、MultiSelectField）
  if (OPTION_FIELD_TYPES.indexOf(componentName) !== -1) {
    const options = field.options || ["选项一", "选项二", "选项三"];
    const dataSource = buildOptionDataSource(options);

    props.dataSource = dataSource;
    props.dataSourceType = "custom";
    props.defaultDataSource = {
      customStashOptions: [],
      complexType: "custom",
      options: dataSource,
      formula: { data: [], event: { "onPageReady,onChange": [] } },
      url: "",
      searchConfig: { afterFetch: "", type: "JSONP", beforeFetch: "", url: "" },
    };
    props.__gridSpan = 1;
    props.tips = i18n("", "");
    props.linkage = "";

    if (componentName === "RadioField" || componentName === "CheckboxField") {
      props.value = "";
      props.valueType = "custom";
      props.complexValue = { complexType: "custom", formula: "", value: "" };
      props.variable = "";
      props.formula = "";
    }

    if (componentName === "SelectField" || componentName === "MultiSelectField") {
      props.hasClear = true;
      props.showSearch = true;
      props.autoWidth = true;
      props.placeholder = field.placeholder ? i18n(field.placeholder) : PLACEHOLDER_SELECT;
      props.value = "";
      props.valueType = "custom";
      props.reusePrivilege = false;
      props.isUseDataSourceColor = false;
      props.dataSourceLinkage = "";
      props.filterLocal = true;
      props.notFoundContent = i18n("无数据", "Not Found");
      props.searchConfig = {
        dataType: "jsonp",
        url: "",
        beforeFetch: "function willFetch(params) {\n  return params;\n}",
        afterFetch: "function didFetch(content) {\n  return content;\n}",
      };
      props.complexValue = { complexType: "custom", formula: "", value: "" };
      props.variable = "";
      props.formula = "";
    }

    if (componentName === "SelectField") {
      props.mode = "single";
    } else if (componentName === "MultiSelectField") {
      props.mode = "multiple";
    }
  }

  // 成员字段
  if (componentName === "EmployeeField") {
    props.placeholder = PLACEHOLDER_SELECT;
    props.__gridSpan = 1;
    props.tips = i18n("", "");
    props.multiple = field.multiple || false;
    props.hasClear = true;
    props.userRangeType = "ALL";
    props.roleRange = [];
    props.userRange = [];
    props.showEmpIdType = "NAME";
    props.startWithDepartmentId = "SELF";
    props.renderLinkForView = true;
    props.showEmplId = false;
    props.closeOnSelect = false;
    props.useAliworkUrl = false;
    props.linkage = "";

    props.valueType = "variable";
    props.complexValue = {
      complexType: "formula",
      formula: "USER()",
      value: [],
    };
    props.variable = { type: "user" };
    props.formula = "";
    props.value = [];
  }

  // 部门字段
  if (componentName === "DepartmentSelectField") {
    props.placeholder = i18n("请输入关键字进行搜索", "Please enter keyword");
    props.__gridSpan = 1;
    props.tips = i18n("", "");
    props.multiple = field.multiple || false;
    props.valueType = "custom";
    props.value = [];
    props.deptRangeType = "ALL";
    props.deptRange = [];
    props.mode = "single";
    props.hasClear = true;
    props.dataSource = {
      searchConfig: {
        dataType: "json",
        url: "/query/deptService/searchDepts.json",
        beforeFetch: "function willFetch(data) {\n  data.key = data.key || data.q || \"\";\n  return data;\n}",
        afterFetch: "function didFetch(content) {\n  var data = [];\n  if (content && content.values) {\n    content.values.forEach(function (item) {\n      data.push({ value: item.emplId, text: item.name, deptFullPath: item.deptFullPath });\n    });\n  }\n  return data;\n}",
      },
    };
    props.complexValue = {
      complexType: "custom",
      value: [],
      formula: "",
    };
    props.variable = "";
    props.formula = "";
    props.linkage = "";
    props.isShowDeptFullName = false;
    props.hasSelectAll = false;
  }

  // 国家字段
  if (componentName === "CountrySelectField") {
    props.placeholder = PLACEHOLDER_SELECT;
    props.__gridSpan = 1;
    props.tips = i18n("", "");
    props.multiple = field.multiple || false;
    props.value = [];
    props.mode = "single";
    props.hasClear = true;
    props.showSearch = true;
    props.hasSelectAll = false;
  }

  // 地址字段
  if (componentName === "AddressField") {
    props.__gridSpan = 1;
    props.tips = i18n("", "");
    props.placeholder = field.placeholder ? i18n(field.placeholder) : PLACEHOLDER_SELECT;
    props.countryMode = "default";
    props.countryScope = 1;
    props.addressType = "ADDRESS";
    props.subLabel = i18n("详细地址", "Detailed Address");
    props.detailPlaceholder = i18n("请输入详细地址", "Please input detailed address");
    props.hasClear = true;
    props.enableLocation = true;
    props.value = {};
    props.optionAutoWidth = true;
    props.showCountry = false;
  }

  // 附件字段
  if (componentName === "AttachmentField") {
    props.__gridSpan = 1;
    props.tips = i18n("", "");
    props.valueType = "custom";
    props.value = "";
    props.complexValue = {
      complexType: "custom",
      value: "",
      formula: "",
    };
    props.type = "normal";
    props.listType = "text";
    props.buttonText = i18n("上传文件", "Upload");
    props.buttonSize = "medium";
    props.buttonType = "normal";
    props.multiple = true;
    props.method = "post";
    props.limit = 9;
    props.maxFileSize = 100;
    props.autoUpload = true;
    props.accept = "";
    props.formula = "";
    props.linkage = "";
    props.variable = "";
    props.onlineEdit = false;
    props.withCredentials = false;
  }

  // 图片上传字段
  if (componentName === "ImageField") {
    props.__gridSpan = 1;
    props.tips = i18n("", "");
    props.valueType = "custom";
    props.value = "";
    props.complexValue = {
      complexType: "custom",
      value: "",
      formula: "",
    };
    props.aiRecognitionConfig = {};
    props.type = "normal";
    props.normalListType = "image";
    props.cardListType = "card";
    props.listType = "image";
    props.buttonText = i18n("图片上传", "Upload");
    props.buttonSize = "medium";
    props.buttonType = "normal";
    props.enableCameraDate = true;
    props.enableCameraLocation = true;
    props.saveCameraImageToLocal = true;
    props.multiple = true;
    props.method = "post";
    props.limit = 9;
    props.maxFileSize = 50;
    props.autoUpload = true;
    props.accept = "image/*";
    props.formula = "";
    props.linkage = "";
    props.variable = "";
    props.aiRecognitionSwitch = false;
    props.onlyCameraUpload = false;
    props.enableCameraWatermark = false;
    props.enableCameraCompression = false;
  }

  // 子表字段
  if (componentName === "TableField") {
    props.__gridSpan = 1;
    props.linkage = "";
    props.tips = i18n("", "");
    props.showIndex = true;
    props.copyButtonText = i18n("复制", "Copy");
    props.addButtonBehavior = "NORMAL";
    props.pageSize = 20;
    props.addButtonText = i18n("新增一项", "Add item");
    props.enableExport = true;
    props.addButtonPosition = "bottom";
    props.actionsColumnWidth = 70;
    props.theme = "split";
    props.delButtonText = i18n("删除", "Remove");
    props.useCustomColumnsWidth = false;
    props.showSortable = false;
    props.moveUp = i18n("上移", "Up");
    props.maxItems = 500;
    props.tableLayout = "fixed";
    props.showActions = true;
    props.indexName = i18n("项目", "Line");
    props.showCopyAction = false;
    props.showDelAction = true;
    props.showTableHead = true;
    props.moveDown = i18n("下移", "Down");
    props.pcFreezeColumnStartCounts = "0";
    props.layout = "TABLE";
    props.showDeleteConfirm = true;
    props.minItems = 1;
    props.enableImport = true;
    props.defaultCollapseStatus = true;
    props.isFreezeOperateColumn = true;
    props.actions = [];
    props.complexValue = { complexType: "custom", formula: "" };
    props.valueType = "custom";
    props.__designerDevice = "pc";
    props.mobileLayout = "TILED";
    props.mobileFreezeColumnStartCounts = "0";
    props.enableBatchDelete = false;
    props.filterEmptyRowData = false;
    props.enableSummary = false;
  }

  // 关联表单字段
  if (componentName === "AssociationFormField") {
    var assocConfig = field.associationForm || {};

    props.__gridSpan = 1;
    props.tips = i18n("", "");
    props.placeholder = PLACEHOLDER_SELECT;
    props.notFoundContent = i18n("无数据", "Not Found");
    props.hasClear = true;
    props.multiple = field.multiple || false;
    props.dataEntryMode = false;
    props.submittable = "ALWAYS";
    props.isCustomStore = true;
    props.isShowSearchBar = true;
    props.validateFilter = false;
    props.__useMediator = "value";

    // 关联表单核心配置
    props.associationForm = {
      formType: "receipt",
      formUuid: assocConfig.formUuid || "",
      appType: assocConfig.appType || "",
      appName: assocConfig.appName || "",
      formTitle: assocConfig.formTitle || "",
      mainFieldId: assocConfig.mainFieldId || "",
      mainFieldLabel: assocConfig.mainFieldLabel
        ? i18n(assocConfig.mainFieldLabel)
        : i18n("", ""),
      mainComponentName: assocConfig.mainComponentName || "TextField",
      tableShowType: assocConfig.tableShowType || "all",
      customTableFields: assocConfig.customTableFields || [],
      subFieldId: assocConfig.subFieldId || "",
      subComponentName: assocConfig.subComponentName || "",
      linkageFields: assocConfig.linkageFields || [],
    };

    // 数据过滤规则（条件筛选）
    var hasFilterRules = assocConfig.dataFilterRules && 
                         assocConfig.dataFilterRules.rules && 
                         assocConfig.dataFilterRules.rules.length > 0;
    props.dataFilterRules = hasFilterRules ? assocConfig.dataFilterRules : {
      condition: "AND",
      rules: [],
      ruleId: "group-" + Date.now().toString(36),
      instanceFieldId: "",
      version: "v2",
    };
    props.supportDataFilter = hasFilterRules;

    // 数据回填规则（选中后自动填充本表单字段）
    // 规范化每条规则，补充 source/target/sourceType/targetType 字段（宜搭回填必须）
    var hasFillingRules = assocConfig.dataFillingRules && 
                          ((assocConfig.dataFillingRules.mainRules && assocConfig.dataFillingRules.mainRules.length > 0) || 
                           (assocConfig.dataFillingRules.tableRules && assocConfig.dataFillingRules.tableRules.length > 0));
    props.dataFillingRules = hasFillingRules ? normalizeFillingRules(assocConfig.dataFillingRules) : {
      mainRules: [],
      tableRules: [],
      version: "v2",
    };
    props.supportDataFilling = hasFillingRules;

    // 排序配置
    props.orderEnable = !!(assocConfig.orderConfig && assocConfig.orderConfig.length > 0);
    props.orderConfig = assocConfig.orderConfig || [];
  }

  // 流水号字段
  if (componentName === "SerialNumberField") {
    props.__gridSpan = 1;
    props.tips = i18n("", "");
    props.dataEntryMode = false;
    props.submittable = "DEFAULT";
    // 流水号字段固定为空校验规则，不支持 required
    props.validation = [];
    
    // 默认流水号规则：前缀 + 自动递增数字
    var defaultSerialNumberRule = [
      {
        __hide_delete__: false,
        ruleType: "character",
        content: "serial",
        formField: "",
        dateFormat: "yyyyMMdd",
        timeZone: "+8",
        digitCount: 4,
        isFixed: true,
        isFixedTips: "",
        resetPeriod: "noClean",
        resetPeriodTips: "",
        initialValue: 1,
        __sid: "item_" + Date.now().toString(36) + "1",
        __sid__: "serial_" + Date.now().toString(36) + "1"
      },
      {
        __hide_delete__: true,
        ruleType: "autoCount",
        content: "",
        formField: "",
        dateFormat: "yyyyMMdd",
        timeZone: "+8",
        digitCount: 5,
        isFixed: true,
        isFixedTips: "",
        resetPeriod: "noClean",
        resetPeriodTips: "",
        initialValue: 1,
        __sid: "item_" + Date.now().toString(36) + "2",
        __sid__: "serial_" + Date.now().toString(36) + "2"
      }
    ];
    
    props.serialNumberRule = field.serialNumberRule || defaultSerialNumberRule;
    props.serialNumPreview = "serial00001";
    props.serialNumReset = 1;
    props.syncSerialConfig = false;
    
    // formula 字段需要在 buildFormSchema 中设置，因为需要 corpId 和 formUuid
    // 这里先设置为空对象，后续会被替换
    props.formula = {};
  }

  // ── 通用属性覆盖（字段定义中显式传入的属性优先级最高）──────────

  // behavior：NORMAL / READONLY / HIDDEN
  if (field.behavior !== undefined) {
    props.behavior = field.behavior;
  }

  // visibility：控制在哪些端显示，如 ["PC", "MOBILE"] / ["PC"] / ["MOBILE"]
  if (field.visibility !== undefined) {
    props.visibility = field.visibility;
  }

  // labelAlign：标签对齐方式，top / left / right
  if (field.labelAlign !== undefined) {
    props.labelAlign = field.labelAlign;
  }

  // placeholder：占位提示文本（部分字段类型已在上方按类型设置，这里统一覆盖）
  if (field.placeholder !== undefined) {
    props.placeholder = i18n(field.placeholder);
  }

  const component = {
    componentName: componentName,
    id: nodeId,
    fieldId: fieldId,
    props: props,
    condition: true,
    hidden: false,
    title: "",
    isLocked: false,
    conditionGroup: "",
  };

  // TableField：递归处理子字段
  if (componentName === "TableField" && field.children) {
    component.children = field.children.map(function (childField) {
      return buildFieldComponent(childField);
    });
  }

  return component;
}

// ── 收集使用到的组件名称 ─────────────────────────────

function collectComponentNames(fields) {
  const names = new Set(["Page", "RootHeader", "RootContent", "RootFooter", "FooterYida", "FormContainer"]);
  fields.forEach(function (field) {
    names.add(field.type);
    if (field.type === "TableField" && field.children) {
      field.children.forEach(function (child) {
        names.add(child.type);
      });
    }
  });
  return Array.from(names);
}

// ── 生成 componentsMap ───────────────────────────────

function buildComponentsMap(componentNames) {
  return componentNames.map(function (name) {
    return {
      package: "@ali/vc-deep-yida",
      version: "1.5.169",
      componentName: name,
    };
  });
}

// ── 从 fieldId 前缀推断组件类型 ─────────────────────
// 例如：serialNumberField_xxx → SerialNumberField，textField_xxx → TextField

function inferComponentNameFromFieldId(fieldId) {
  if (!fieldId || typeof fieldId !== "string") return "";
  // fieldId 格式：camelCaseComponentName_xxxxxxxx
  var underscoreIndex = fieldId.lastIndexOf("_");
  if (underscoreIndex === -1) return "";
  var prefix = fieldId.slice(0, underscoreIndex);
  // 将首字母大写，还原为 PascalCase 组件名
  return prefix.charAt(0).toUpperCase() + prefix.slice(1);
}

// ── 规范化单条回填规则，补充 source/target/sourceType/targetType ──
// 宜搭要求 mainRules 和 tableRules 中的每条规则同时包含：
//   sourceFieldId、targetFieldId（旧格式）
//   source（同 sourceFieldId）、target（同 targetFieldId）
//   sourceType（源字段组件类型）、targetType（目标字段组件类型）

function normalizeFillingRule(rule) {
  // 兼容两种格式：旧格式用 sourceFieldId/targetFieldId，新格式用 source/target
  var sourceId = rule.sourceFieldId || rule.source || "";
  var targetId = rule.targetFieldId || rule.target || "";
  var sourceType = rule.sourceType || inferComponentNameFromFieldId(sourceId);
  var targetType = rule.targetType || inferComponentNameFromFieldId(targetId);

  return {
    sourceFieldId: sourceId,
    targetFieldId: targetId,
    source: sourceId,
    sourceType: sourceType,
    target: targetId,
    targetType: targetType,
  };
}

// ── 规范化整个 dataFillingRules 对象 ─────────────────

function normalizeFillingRules(fillingRules) {
  if (!fillingRules) return fillingRules;
  var normalized = Object.assign({}, fillingRules);

  if (Array.isArray(normalized.mainRules)) {
    normalized.mainRules = normalized.mainRules.map(normalizeFillingRule);
  }

  if (Array.isArray(normalized.tableRules)) {
    normalized.tableRules = normalized.tableRules.map(function (tableRule) {
      var normalizedTableRule = Object.assign({}, tableRule);
      if (Array.isArray(normalizedTableRule.rules)) {
        normalizedTableRule.rules = normalizedTableRule.rules.map(normalizeFillingRule);
      }
      return normalizedTableRule;
    });
  }

  return normalized;
}

// ── 解析 @label:字段名 语法，将其替换为对应字段的真实 fieldId ──

function resolveFieldIdReferences(fieldComponents) {
  // 构建 label → fieldId 的映射表
  var labelToFieldId = {};
  fieldComponents.forEach(function (component) {
    var labelText = extractLabelText(component);
    if (labelText && component.props && component.props.fieldId) {
      labelToFieldId[labelText] = component.props.fieldId;
    }
  });

  // 遍历所有 AssociationFormField，解析回填规则中的 @label:xxx 引用
  fieldComponents.forEach(function (component) {
    if (component.componentName !== "AssociationFormField") return;
    var fillingRules = component.props.dataFillingRules;
    if (!fillingRules) return;

    /**
     * 解析普通规则（mainRules 或 tableRules 中的 rules 数组）
     * 支持格式: [{source, target, sourceType, targetType}, ...]
     */
    function resolveRules(rules) {
      if (!Array.isArray(rules)) return;
      rules.forEach(function (rule) {
        // 解析 target 中的 @label:xxx 引用
        if (rule.target && typeof rule.target === "string" && rule.target.startsWith("@label:")) {
          var targetLabel = rule.target.slice(7);
          var resolvedId = labelToFieldId[targetLabel];
          if (resolvedId) {
            console.error("  🔗 回填规则解析: @label:" + targetLabel + " → " + resolvedId);
            rule.target = resolvedId;
          } else {
            console.error("  ⚠️ 回填规则解析失败: 找不到标签为「" + targetLabel + "」的字段，请检查字段名是否正确");
          }
        }
        // 解析 source 中的 @label:xxx 引用
        if (rule.source && typeof rule.source === "string" && rule.source.startsWith("@label:")) {
          var sourceLabel = rule.source.slice(7);
          var resolvedSourceId = labelToFieldId[sourceLabel];
          if (resolvedSourceId) {
            console.error("  🔗 回填规则解析: @label:" + sourceLabel + " → " + resolvedSourceId);
            rule.source = resolvedSourceId;
          } else {
            console.error("  ⚠️ 回填规则解析失败: 找不到标签为「" + sourceLabel + "」的字段，请检查字段名是否正确");
          }
        }
      });
    }

    /**
     * 解析子表填充子表规则（tableRules）
     * 支持格式: [{tableId, rules: [{source, target, sourceType, targetType}], filters}, ...]
     */
    function resolveTableRules(tableRules) {
      if (!Array.isArray(tableRules)) return;
      tableRules.forEach(function (tableRule, tableIndex) {
        if (!tableRule.rules || !Array.isArray(tableRule.rules)) return;
        
        console.error("  📋 处理子表回填规则 [" + (tableIndex + 1) + "]: tableId=" + tableRule.tableId);
        
        tableRule.rules.forEach(function (rule, ruleIndex) {
          if (rule.target && typeof rule.target === "string" && rule.target.startsWith("@label:")) {
            var targetLabel = rule.target.slice(7);
            var resolvedId = labelToFieldId[targetLabel];
            if (resolvedId) {
              console.error("    🔗 子表规则解析 [" + (ruleIndex + 1) + "]: @label:" + targetLabel + " → " + resolvedId);
              rule.target = resolvedId;
            } else {
              console.error("    ⚠️ 子表规则解析失败: 找不到标签为「" + targetLabel + "」的字段，请检查字段名是否正确");
            }
          }
        });
      });
    }

    // 解析主表回填规则
    if (fillingRules.mainRules) {
      resolveRules(fillingRules.mainRules);
    }

    // 解析子表回填规则（支持子表填充子表）
    if (fillingRules.tableRules) {
      resolveTableRules(fillingRules.tableRules);
    }

    // 解析完 @label 后，规范化规则（补充 source/target/sourceType/targetType）
    component.props.dataFillingRules = normalizeFillingRules(fillingRules);

    // 解析后重新判断是否有有效回填规则
    var hasMainRules = fillingRules.mainRules && fillingRules.mainRules.length > 0;
    var hasTableRules = fillingRules.tableRules && fillingRules.tableRules.some(function (tr) {
      return tr.rules && tr.rules.length > 0;
    });
    component.props.supportDataFilling = hasMainRules || hasTableRules;
  });
}

// ── 生成表单 Schema ──────────────────────────────────

function buildFormSchema(formTitle, fields, formUuid, corpId, appType, columns) {
  columns = columns || 1;
  const fieldComponents = fields.map(function (field) {
    return buildFieldComponent(field);
  });

  // 为 SerialNumberField 设置 formula（需要 corpId、appType 和 formUuid）
  fieldComponents.forEach(function (component) {
    if (component.componentName === "SerialNumberField" && component.props) {
      var fieldId = component.props.fieldId;
      var serialNumberRule = component.props.serialNumberRule;
      
      // 直接使用 serialNumberRule 构建 formula.expression
      // value 的值就是 serialNumberRule 数组本身
      var ruleJson = JSON.stringify({
        type: "custom",
        value: serialNumberRule
      });
      
      // 转义 JSON 字符串中的引号和反斜杠，用于嵌入到 expression 字符串中
      var escapedRuleJson = ruleJson.replace(/\\/g, "\\\\").replace(/"/g, '\\"');
      
      component.props.formula = {
        expression: 'SERIALNUMBER("' + corpId + '", "' + appType + '", "' + formUuid + '", "' + fieldId + '", "' + escapedRuleJson + '")'
      };
    }
  });

  // 解析 @label:字段名 引用（必须在所有字段构建完成后执行）
  resolveFieldIdReferences(fieldComponents);

  const componentNames = collectComponentNames(fields);

  // 构造函数代码（与模板完全一致）
  const constructorCode = "function constructor() {\nvar module = { exports: {} };\nvar _this = this;\nthis.__initMethods__(module.exports, module);\nObject.keys(module.exports).forEach(function(item) {\n  if(typeof module.exports[item] === 'function'){\n    _this[item] = module.exports[item];\n  }\n});\n\n}";

  // actions 模块代码（与模板一致的默认空实现）
  const actionsCompiled = "\"use strict\";\n\nexports.__esModule = true;\nexports.didMount = didMount;\nfunction didMount() {\n  console.log(\"\\u300C\\u9875\\u9762 JS\\u300D\\uFF1A\\u5F53\\u524D\\u9875\\u9762\\u5730\\u5740 \" + location.href);\n}\n";
  const actionsSource = "export function didMount() {\n  console.log(`「页面 JS」：当前页面地址 ${location.href}`);\n}";

  // Page 组件树（FormContainer 外层结构与模板保持一致，仅 id 随机生成）
  const pageComponentsTree = [
    {
      componentName: "Page",
      id: nextNodeId(),
      props: {
        contentBgColor: "white",
        pageStyle: { backgroundColor: "#f2f3f5" },
        contentMargin: "20",
        contentPadding: "20",
        showTitle: false,
        contentPaddingMobile: "0",
        templateVersion: "1.0.0",
        contentMarginMobile: "0",
        className: "page_" + Date.now().toString(36),
        contentBgColorMobile: "white",
        titleName: i18n("标题名称", "title"),
        titleDesc: i18n("标题描述", "title"),
        titleColor: "light",
        titleBg: "https://img.alicdn.com/imgextra/i2/O1CN0143ATPP1wIa9TrVvzN_!!6000000006285-2-tps-3360-400.png_.webp",
        backgroundColorCustom: "#f1f2f3",
        sizePc: "medium",
        labelAlignPc: "top",
        labelWidthPc: "130px",
        labelWeightPc: "normal",
        labelAlignMobile: "top",
        labelWidthMobile: "80px",
        labelWeightMobile: "normal",
      },
      condition: true,
      css: "body{background-color:#f2f3f5}",
      methods: {
        __initMethods__: {
          type: "js",
          source: "function (exports, module) { /*set actions code here*/ }",
          compiled: "function (exports, module) { /*set actions code here*/ }",
        },
      },
      dataSource: {
        offline: [],
        globalConfig: {
          fit: {
            compiled: "'use strict';\n\nvar __preParser__ = function fit(response) {\n  var content = response.content !== undefined ? response.content : response;\n  var error = {\n    message: response.errorMsg || response.errors && response.errors[0] && response.errors[0].msg || response.content || '远程数据源请求出错，success is false'\n  };\n  var success = true;\n  if (response.success !== undefined) {\n    success = response.success;\n  } else if (response.hasError !== undefined) {\n    success = !response.hasError;\n  }\n  return {\n    content: content,\n    success: success,\n    error: error\n  };\n};",
            source: "function fit(response) {\r\n  const content = (response.content !== undefined) ? response.content : response;\r\n  const error = {\r\n    message: response.errorMsg ||\r\n      (response.errors && response.errors[0] && response.errors[0].msg) ||\r\n      response.content || '远程数据源请求出错，success is false',\r\n  };\r\n  let success = true;\r\n  if (response.success !== undefined) {\r\n    success = response.success;\r\n  } else if (response.hasError !== undefined) {\r\n    success = !response.hasError;\r\n  }\r\n  return {\r\n    content,\r\n    success,\r\n    error,\r\n  };\r\n}",
            type: "js",
            error: {},
          },
        },
        online: [],
        list: [],
        sync: true,
      },
      lifeCycles: {
        constructor: {
          type: "js",
          compiled: constructorCode,
          source: constructorCode,
        },
      },
      hidden: false,
      title: "",
      isLocked: false,
      conditionGroup: "",
      children: [
        {
          componentName: "RootHeader",
          id: nextNodeId(),
          props: {},
          condition: true,
          hidden: false,
          title: "",
          isLocked: false,
          conditionGroup: "",
        },
        {
          componentName: "RootContent",
          id: nextNodeId(),
          props: {},
          condition: true,
          hidden: false,
          title: "",
          isLocked: false,
          conditionGroup: "",
          children: [
            {
              componentName: "FormContainer",
              id: nextNodeId(),
              props: {
                formLabel: i18n(formTitle, formTitle),
                formLabelVisible: true,
                columns: columns,
                labelAlign: "top",
                submitText: i18n("提交", "Submit"),
                stageText: i18n("暂存", "Stage"),
                submitAndNewText: i18n("提交并继续", "Submit and New"),
                fieldId: "formContainer_" + Date.now().toString(36),
                aiFormConfig: { systemPrompt: "", model: "qwen" },
                beforeSubmit: false,
                afterSubmit: false,
                onProcessActionValidate: false,
                afterFormDataInit: false,
              },
              condition: true,
              hidden: false,
              title: "",
              isLocked: false,
              conditionGroup: "",
              // ★ 核心：FormContainer 内层的字段组件
              children: fieldComponents,
            },
          ],
        },
        {
          componentName: "RootFooter",
          id: nextNodeId(),
          props: {},
          condition: true,
          hidden: false,
          title: "",
          isLocked: false,
          conditionGroup: "",
          children: [
            {
              componentName: "FooterYida",
              id: nextNodeId(),
              props: {},
              condition: true,
              hidden: false,
              title: "",
              isLocked: false,
              conditionGroup: "",
            },
          ],
        },
      ],
    },
  ];

  // 页面 Schema（与模板结构一致）- utils 放在 pages[0] 内
  const pageSchema = {
    utils: [
      {
        name: "legaoBuiltin",
        type: "npm",
        content: {
          package: "@ali/vu-legao-builtin",
          version: "3.0.0",
          exportName: "legaoBuiltin",
        },
      },
      {
        name: "yidaPlugin",
        type: "npm",
        content: {
          package: "@ali/vu-yida-plugin",
          version: "1.1.0",
          exportName: "yidaPlugin",
        },
      },
    ],
    componentsMap: buildComponentsMap(componentNames),
    componentsTree: pageComponentsTree,
    componentAlias: {
      items: [],
    },
    id: formUuid,
    connectComponent: [],
  };

  // 顶层 Schema（与模板结构完全一致）- actions 和 config 与 pages 平级
  return {
    schemaType: "superform",
    schemaVersion: "5.0",
    pages: [pageSchema],
    actions: {
      module: {
        compiled: actionsCompiled,
        source: actionsSource,
      },
      type: "FUNCTION",
      list: [
        {
          id: "didMount",
          title: "didMount",
        },
      ],
    },
    config: {
      connectComponent: [],
    },
  };
}

// ── 发送 GET 请求（支持 302 自动重登录） ─────────────

function sendGetRequest(baseUrl, cookies, requestPath, queryParams) {
  return new Promise((resolve, reject) => {
    const queryString = querystring.stringify(queryParams);
    const fullPath = requestPath + "?" + queryString;

    const cookieHeader = cookies
      .map((cookie) => cookie.name + "=" + cookie.value)
      .join("; ");

    const parsedUrl = new URL(baseUrl);
    const isHttps = parsedUrl.protocol === "https:";
    const requestModule = isHttps ? https : http;

    const requestOptions = {
      hostname: parsedUrl.hostname,
      port: parsedUrl.port || (isHttps ? 443 : 80),
      path: fullPath,
      method: "GET",
      headers: {
        Origin: baseUrl,
        Referer: baseUrl + "/",
        Cookie: cookieHeader,
      },
      timeout: 30000,
    };

    const request = requestModule.request(requestOptions, (response) => {
      let responseData = "";
      response.on("data", (chunk) => { responseData += chunk; });
      response.on("end", () => {
        console.error("  HTTP 状态码: " + response.statusCode);
        let parsed;
        try {
          parsed = JSON.parse(responseData);
        } catch (parseError) {
          console.error("  响应内容: " + responseData.substring(0, 500));
          resolve({ success: false, errorMsg: "HTTP " + response.statusCode + ": 响应非 JSON" });
          return;
        }
        // 检测登录过期（errorCode: "307"）
        if (isLoginExpired(parsed)) {
          console.error("  检测到登录过期: " + parsed.errorMsg);
          resolve({ __needLogin: true });
          return;
        }
        // 检测 csrf_token 过期（errorCode: "TIANSHU_000030"）
        if (isCsrfTokenExpired(parsed)) {
          console.error("  检测到 csrf_token 过期: " + parsed.errorMsg);
          resolve({ __csrfExpired: true });
          return;
        }
        resolve(parsed);
      });
    });

    request.on("timeout", () => {
      console.error("  ❌ 请求超时");
      request.destroy();
      reject(new Error("请求超时"));
    });

    request.on("error", (requestError) => {
      reject(requestError);
    });

    request.end();
  });
}

// ── 空白表单 Schema 模板（update 模式） ─────────────

function buildEmptyFormSchema() {
  var constructorCode = "function constructor() {\nvar module = { exports: {} };\nvar _this = this;\nthis.__initMethods__(module.exports, module);\nObject.keys(module.exports).forEach(function(item) {\n  if(typeof module.exports[item] === 'function'){\n    _this[item] = module.exports[item];\n  }\n});\n\n}";
  var actionsCompiled = "\"use strict\";\n\nexports.__esModule = true;\nexports.didMount = didMount;\nfunction didMount() {\n  console.log(\"\\u300C\\u9875\\u9762 JS\\u300D\\uFF1A\\u5F53\\u524D\\u9875\\u9762\\u5730\\u5740 \" + location.href);\n}\n";
  var actionsSource = "export function didMount() {\n  console.log(`「页面 JS」：当前页面地址 ${location.href}`);\n}";

  return {
    schemaType: "superform",
    schemaVersion: "5.0",
    actions: {
      module: { compiled: actionsCompiled, source: actionsSource },
      type: "FUNCTION",
      list: [{ id: nextNodeId(), type: "lifeCycleEvent", name: "didMount", relatedEventId: "lifecycle:didMount", params: {} }],
    },
    pages: [{
      utils: [
        { name: "legaoBuiltin", type: "npm", content: { package: "@ali/vu-legao-builtin", version: "3.0.0", exportName: "legaoBuiltin" } },
        { name: "yidaPlugin", type: "npm", content: { package: "@ali/vu-yida-plugin", version: "1.1.0", exportName: "yidaPlugin" } },
      ],
      componentsTree: [
          {
            componentName: "Page",
            id: nextNodeId(),
            props: {
              contentBgColor: "white",
              pageStyle: { backgroundColor: "#f2f3f5" },
              contentMargin: "20",
              contentPadding: "20",
              showTitle: false,
              contentPaddingMobile: "0",
              templateVersion: "1.0.0",
              contentMarginMobile: "0",
              className: "page_" + Date.now().toString(36),
              contentBgColorMobile: "white",
            },
            condition: true,
            css: "body{background-color:#f2f3f5}",
            methods: {
              __initMethods__: {
                type: "js",
                source: "function (exports, module) { /*set actions code here*/ }",
                compiled: "function (exports, module) { /*set actions code here*/ }",
              },
            },
            dataSource: { offline: [], globalConfig: {}, online: [], list: [], sync: true },
            lifeCycles: {
              constructor: { type: "js", compiled: constructorCode, source: constructorCode },
              componentDidMount: { name: "didMount", id: "didMount", params: {}, type: "actionRef" },
            },
            hidden: false,
            title: "",
            isLocked: false,
            conditionGroup: "",
            children: [
              { componentName: "RootHeader", id: nextNodeId(), props: {}, condition: true, hidden: false, title: "", isLocked: false, conditionGroup: "" },
              {
                componentName: "RootContent",
                id: nextNodeId(),
                props: {},
                condition: true,
                hidden: false,
                title: "",
                isLocked: false,
                conditionGroup: "",
                children: [
                  {
                    componentName: "FormContainer",
                    id: nextNodeId(),
                    props: {
                      beforeSubmit: false,
                      "submitProps.text": i18n("提交", "Submit"),
                      submitText: i18n("提交", "Submit"),
                      submitProps: { text: i18n("提交", "Submit") },
                      labelAlign: "top",
                      columns: 1,
                      afterSubmit: false,
                      fieldId: "formContainer_" + Date.now().toString(36),
                      stageText: i18n("暂存", "Stage"),
                      submitAndNewText: i18n("提交并继续", "Submit and New"),
                      onProcessActionValidate: false,
                      afterFormDataInit: false,
                    },
                    condition: true,
                    hidden: false,
                    title: "",
                    isLocked: false,
                    conditionGroup: "",
                    children: [],
                  },
                ],
              },
              {
                componentName: "RootFooter",
                id: nextNodeId(),
                props: {},
                condition: true,
                hidden: false,
                title: "",
                isLocked: false,
                conditionGroup: "",
                children: [
                  { componentName: "FooterYida", id: nextNodeId(), props: {}, condition: true, hidden: false, title: "", isLocked: false, conditionGroup: "" },
                ],
              },
            ],
          },
        ],
        componentsMap: [
          { package: "@ali/vc-deep-yida", version: "1.5.169", componentName: "RootHeader" },
          { package: "@ali/vc-deep-yida", version: "1.5.169", componentName: "FormContainer" },
          { package: "@ali/vc-deep-yida", version: "1.5.169", componentName: "RootContent" },
          { package: "@ali/vc-deep-yida", version: "1.5.169", componentName: "FooterYida" },
          { package: "@ali/vc-deep-yida", version: "1.5.169", componentName: "RootFooter" },
          { package: "@ali/vc-deep-yida", version: "1.5.169", componentName: "Page" },
        ],
      },
    ],
  };
}

// ── Schema 字段操作辅助函数（update 模式） ──────────

function extractLabelText(component) {
  if (!component || !component.props || !component.props.label) {
    return "";
  }
  var label = component.props.label;
  if (typeof label === "string") {
    return label;
  }
  if (label.zh_CN) {
    return label.zh_CN;
  }
  return "";
}

function findFormContainer(node) {
  if (node.componentName === "FormContainer") {
    return node;
  }
  if (node.children && Array.isArray(node.children)) {
    for (var childIndex = 0; childIndex < node.children.length; childIndex++) {
      var found = findFormContainer(node.children[childIndex]);
      if (found) return found;
    }
  }
  return null;
}

function findFieldIndexByLabel(fields, label) {
  for (var fieldIndex = 0; fieldIndex < fields.length; fieldIndex++) {
    if (extractLabelText(fields[fieldIndex]) === label) {
      return fieldIndex;
    }
  }
  return -1;
}

function applyFieldChanges(component, changes) {
  var props = component.props;

  // 需要特殊处理的属性 key 集合（不走通用透传）
  var specialKeys = ["label", "required", "placeholder", "options", "associationForm",
    "linkageFields", "mainFieldId", "mainComponentName", "mainFieldLabel",
    "subFieldId", "subComponentName", "dataFillingRules"];

  // ── 特殊处理：label（需要 i18n 包装）
  if (changes.label !== undefined) {
    props.label = i18n(changes.label, component.componentName);
  }

  // ── 特殊处理：required（操作 validation 数组）
  if (changes.required !== undefined) {
    if (changes.required) {
      var hasRequired = (props.validation || []).some(function (rule) {
        return rule.type === "required";
      });
      if (!hasRequired) {
        props.validation = props.validation || [];
        props.validation.push({ type: "required" });
      }
    } else {
      props.validation = (props.validation || []).filter(function (rule) {
        return rule.type !== "required";
      });
    }
  }

  // ── 特殊处理：placeholder（需要 i18n 包装）
  if (changes.placeholder !== undefined) {
    props.placeholder = i18n(changes.placeholder);
  }

  // ── 特殊处理：options（需要转换为 dataSource 格式）
  if (changes.options !== undefined && OPTION_FIELD_TYPES.indexOf(component.componentName) !== -1) {
    var newDataSource = buildOptionDataSource(changes.options);
    props.dataSource = newDataSource;
    if (props.defaultDataSource) {
      props.defaultDataSource.options = newDataSource;
    }
  }

  // ── 特殊处理：AssociationFormField 的 associationForm 内部属性
  if (component.componentName === "AssociationFormField") {
    if (!props.associationForm) {
      props.associationForm = {};
    }
    if (changes.linkageFields !== undefined) {
      props.associationForm.linkageFields = changes.linkageFields;
    }
    if (changes.mainFieldId !== undefined) {
      props.associationForm.mainFieldId = changes.mainFieldId;
    }
    if (changes.mainComponentName !== undefined) {
      props.associationForm.mainComponentName = changes.mainComponentName;
    }
    if (changes.mainFieldLabel !== undefined) {
      props.associationForm.mainFieldLabel = i18n(changes.mainFieldLabel);
    }
    if (changes.subFieldId !== undefined) {
      props.associationForm.subFieldId = changes.subFieldId;
    }
    if (changes.subComponentName !== undefined) {
      props.associationForm.subComponentName = changes.subComponentName;
    }
    // dataFillingRules：直接替换整个回填规则对象，并同步更新 supportDataFilling
    // 同时规范化每条规则，补充 source/target/sourceType/targetType 字段
    if (changes.dataFillingRules !== undefined) {
      props.dataFillingRules = normalizeFillingRules(changes.dataFillingRules);
      var hasMainRules = changes.dataFillingRules.mainRules && changes.dataFillingRules.mainRules.length > 0;
      var hasTableRules = changes.dataFillingRules.tableRules && changes.dataFillingRules.tableRules.some(function (tr) {
        return tr.rules && tr.rules.length > 0;
      });
      props.supportDataFilling = hasMainRules || hasTableRules;
    }
  }

  // ── 通用透传：将 changes 中所有未被特殊处理的属性直接写入 props
  // 新增属性支持时无需修改此函数，直接在 changes 中传入对应 key 即可
  Object.keys(changes).forEach(function (key) {
    if (specialKeys.indexOf(key) === -1 && changes[key] !== undefined) {
      props[key] = changes[key];
    }
  });
}

function ensureComponentsMap(schema, componentName) {
  var pageSchema = schema.pages[0];
  var existingNames = pageSchema.componentsMap.map(function (entry) {
    return entry.componentName;
  });
  if (existingNames.indexOf(componentName) === -1) {
    pageSchema.componentsMap.push({
      package: "@ali/vc-deep-yida",
      version: "1.5.169",
      componentName: componentName,
    });
  }
}

// ── 应用修改操作（update 模式） ─────────────────────

function applyChangesToSchema(schema, changes) {
  var componentsTree = schema.pages[0].componentsTree;
  if (!componentsTree || componentsTree.length === 0) {
    console.error("  ❌ Schema 中未找到 componentsTree");
    process.exit(1);
  }

  var formContainer = findFormContainer(componentsTree[0]);
  if (!formContainer) {
    console.error("  ❌ Schema 中未找到 FormContainer");
    process.exit(1);
  }

  var formFields = formContainer.children || [];
  var appliedChanges = [];

  changes.forEach(function (change, changeIndex) {
    var actionDesc = "操作 " + (changeIndex + 1) + ": " + change.action;

    if (change.action === "add") {
      if (!change.field || !change.field.type || !change.field.label) {
        console.error("  ⚠️ " + actionDesc + " - 缺少 field.type 或 field.label，跳过");
        return;
      }

      var newComponent = buildFieldComponent(change.field);
      ensureComponentsMap(schema, change.field.type);

      if (change.field.type === "TableField" && change.field.children) {
        change.field.children.forEach(function (childField) {
          ensureComponentsMap(schema, childField.type);
        });
      }

      if (change.after) {
        var afterIndex = findFieldIndexByLabel(formFields, change.after);
        if (afterIndex !== -1) {
          formFields.splice(afterIndex + 1, 0, newComponent);
          console.error("  ✅ " + actionDesc + " - 在「" + change.after + "」后新增字段「" + change.field.label + "」(" + change.field.type + ")");
        } else {
          formFields.push(newComponent);
          console.error("  ⚠️ " + actionDesc + " - 未找到「" + change.after + "」，字段「" + change.field.label + "」追加到末尾");
        }
      } else if (change.before) {
        var beforeIndex = findFieldIndexByLabel(formFields, change.before);
        if (beforeIndex !== -1) {
          formFields.splice(beforeIndex, 0, newComponent);
          console.error("  ✅ " + actionDesc + " - 在「" + change.before + "」前新增字段「" + change.field.label + "」(" + change.field.type + ")");
        } else {
          formFields.push(newComponent);
          console.error("  ⚠️ " + actionDesc + " - 未找到「" + change.before + "」，字段「" + change.field.label + "」追加到末尾");
        }
      } else {
        formFields.push(newComponent);
        console.error("  ✅ " + actionDesc + " - 新增字段「" + change.field.label + "」(" + change.field.type + ")");
      }

      appliedChanges.push({ action: "add", label: change.field.label, type: change.field.type });

    } else if (change.action === "delete") {
      if (!change.label) {
        console.error("  ⚠️ " + actionDesc + " - 缺少 label，跳过");
        return;
      }

      var deleteIndex = findFieldIndexByLabel(formFields, change.label);
      if (deleteIndex !== -1) {
        formFields.splice(deleteIndex, 1);
        console.error("  ✅ " + actionDesc + " - 删除字段「" + change.label + "」");
        appliedChanges.push({ action: "delete", label: change.label });
      } else {
        console.error("  ⚠️ " + actionDesc + " - 未找到字段「" + change.label + "」，跳过删除");
      }

    } else if (change.action === "update") {
      if (!change.label) {
        console.error("  ⚠️ " + actionDesc + " - 缺少 label，跳过");
        return;
      }
      if (!change.changes || Object.keys(change.changes).length === 0) {
        console.error("  ⚠️ " + actionDesc + " - 缺少 changes，跳过");
        return;
      }

      // 支持通过 tableLabel 指定父子表，在子表 children 中查找字段
      var searchFields = formFields;
      var locationDesc = "";
      if (change.tableLabel) {
        var tableIndex = findFieldIndexByLabel(formFields, change.tableLabel);
        if (tableIndex === -1) {
          console.error("  ⚠️ " + actionDesc + " - 未找到子表「" + change.tableLabel + "」，跳过更新");
          return;
        }
        var tableComponent = formFields[tableIndex];
        if (tableComponent.componentName !== "TableField" || !tableComponent.children) {
          console.error("  ⚠️ " + actionDesc + " - 「" + change.tableLabel + "」不是有效的子表字段，跳过更新");
          return;
        }
        searchFields = tableComponent.children;
        locationDesc = "子表「" + change.tableLabel + "」中的";
      }

      var updateIndex = findFieldIndexByLabel(searchFields, change.label);
      if (updateIndex !== -1) {
        applyFieldChanges(searchFields[updateIndex], change.changes);
        var changedProps = Object.keys(change.changes).join(", ");
        console.error("  ✅ " + actionDesc + " - 更新" + locationDesc + "字段「" + change.label + "」的属性: " + changedProps);
        appliedChanges.push({ action: "update", label: change.label, tableLabel: change.tableLabel || null, changedProps: changedProps });
      } else {
        console.error("  ⚠️ " + actionDesc + " - 未找到" + locationDesc + "字段「" + change.label + "」，跳过更新");
      }

    } else {
      console.error("  ⚠️ " + actionDesc + " - 未知操作类型「" + change.action + "」，跳过");
    }
  });

  // 遍历所有字段，确保顶层 fieldId 存在（宜搭回填引擎依赖顶层 fieldId）
  function ensureTopLevelFieldId(comps) {
    comps.forEach(function (comp) {
      if (!comp.fieldId && comp.props && comp.props.fieldId) {
        comp.fieldId = comp.props.fieldId;
      }
      if (comp.children && Array.isArray(comp.children)) {
        ensureTopLevelFieldId(comp.children);
      }
    });
  }
  ensureTopLevelFieldId(formFields);

  // 解析 @label:xxx 引用并规范化回填规则
  resolveFieldIdReferences(formFields);

  formContainer.children = formFields;
  return appliedChanges;
}

// ── 发送 POST 请求（支持 302 自动重登录） ────────────

function sendPostRequest(baseUrl, csrfToken, cookies, requestPath, extraParams, formUuid) {
  return new Promise((resolve, reject) => {
    const postData = querystring.stringify(
      Object.assign({ _csrf_token: csrfToken }, extraParams)
    );

    const cookieHeader = cookies
      .map((cookie) => `${cookie.name}=${cookie.value}`)
      .join("; ");

    const parsedUrl = new URL(baseUrl);
    const isHttps = parsedUrl.protocol === "https:";
    const requestModule = isHttps ? https : http;

    // 构建 Referer，如果提供了 formUuid 则使用页面设计器的地址
    const referer = formUuid
      ? `${baseUrl}/alibaba/web/${extraParams.appType || ""}/design/pageDesigner?formUuid=${formUuid}`
      : baseUrl + "/";

    const requestOptions = {
      hostname: parsedUrl.hostname,
      port: parsedUrl.port || (isHttps ? 443 : 80),
      path: requestPath,
      method: "POST",
      headers: {
        "Content-Type": "application/x-www-form-urlencoded",
        "Content-Length": Buffer.byteLength(postData),
        Origin: baseUrl,
        Referer: referer,
        Cookie: cookieHeader,
      },
      timeout: 30000,
    };

    const request = requestModule.request(requestOptions, (response) => {
      let responseData = "";
      response.on("data", (chunk) => { responseData += chunk; });
      response.on("end", () => {
        console.error(`  HTTP 状态码: ${response.statusCode}`);
        let parsed;
        try {
          parsed = JSON.parse(responseData);
        } catch (parseError) {
          console.error(`  响应内容: ${responseData.substring(0, 500)}`);
          resolve({ success: false, errorMsg: `HTTP ${response.statusCode}: 响应非 JSON` });
          return;
        }
        // 检测登录过期（errorCode: "307"）
        if (isLoginExpired(parsed)) {
          console.error(`  检测到登录过期: ${parsed.errorMsg}`);
          resolve({ __needLogin: true });
          return;
        }
        // 检测 csrf_token 过期（errorCode: "TIANSHU_000030"）
        if (isCsrfTokenExpired(parsed)) {
          console.error(`  检测到 csrf_token 过期: ${parsed.errorMsg}`);
          resolve({ __csrfExpired: true });
          return;
        }
        resolve(parsed);
      });
    });

    request.on("timeout", () => {
      console.error("  ❌ 请求超时");
      request.destroy();
      reject(new Error("请求超时"));
    });

    request.on("error", (requestError) => {
      reject(requestError);
    });

    request.write(postData);
    request.end();
  });
}

// ── 发送 updateFormConfig 请求 ───────────────────────

function sendUpdateConfigRequest(baseUrl, csrfToken, cookies, appType, formUuid, version, value) {
  return new Promise((resolve, reject) => {
    const postData = querystring.stringify({
      _csrf_token: csrfToken,
      formUuid: formUuid,
      version: version,
      configType: "MINI_RESOURCE",
      value: value,
    });

    const cookieHeader = cookies
      .map((cookie) => `${cookie.name}=${cookie.value}`)
      .join("; ");

    const parsedUrl = new URL(baseUrl);
    const isHttps = parsedUrl.protocol === "https:";
    const requestModule = isHttps ? https : http;

    const requestOptions = {
      hostname: parsedUrl.hostname,
      port: parsedUrl.port || (isHttps ? 443 : 80),
      path: `/dingtalk/web/${appType}/query/formdesign/updateFormConfig.json`,
      method: "POST",
      headers: {
        "Content-Type": "application/x-www-form-urlencoded",
        "Content-Length": Buffer.byteLength(postData),
        Origin: baseUrl,
        Referer: baseUrl + "/",
        Cookie: cookieHeader,
      },
      timeout: 30000,
    };

    const request = requestModule.request(requestOptions, (response) => {
      let responseData = "";
      response.on("data", (chunk) => { responseData += chunk; });
      response.on("end", () => {
        console.error(`  HTTP 状态码: ${response.statusCode}`);
        let parsed;
        try {
          parsed = JSON.parse(responseData);
        } catch (parseError) {
          console.error(`  响应内容: ${responseData.substring(0, 500)}`);
          resolve({ success: false, errorMsg: `HTTP ${response.statusCode}: 响应非 JSON` });
          return;
        }
        // 检测登录过期（errorCode: "307"）
        if (isLoginExpired(parsed)) {
          console.error(`  检测到登录过期: ${parsed.errorMsg}`);
          resolve({ __needLogin: true });
          return;
        }
        // 检测 csrf_token 过期（errorCode: "TIANSHU_000030"）
        if (isCsrfTokenExpired(parsed)) {
          console.error(`  检测到 csrf_token 过期: ${parsed.errorMsg}`);
          resolve({ __csrfExpired: true });
          return;
        }
        resolve(parsed);
      });
    });

    request.on("timeout", () => {
      console.error("  ❌ 请求超时");
      request.destroy();
      reject(new Error("请求超时"));
    });

    request.on("error", (requestError) => {
      reject(requestError);
    });

    request.write(postData);
    request.end();
  });
}

// ── 登录态辅助：从 cookieData 中提取 corpId ──────────

function resolveCorpId(cookieData) {
  // 优先使用已提取的 corp_id 字段
  if (cookieData.corp_id) return cookieData.corp_id;
  // 从 tianshu_corp_user Cookie 中提取（格式："{corpId}_{userId}"）
  if (cookieData.cookies) {
    var corpUserCookie = cookieData.cookies.find(function (c) {
      return c.name === "tianshu_corp_user";
    });
    if (corpUserCookie && corpUserCookie.value) {
      var lastUnderscore = corpUserCookie.value.lastIndexOf("_");
      if (lastUnderscore > 0) {
        return corpUserCookie.value.slice(0, lastUnderscore);
      }
    }
  }
  return "";
}

// ── 带自动重登录的请求封装 ────────────────────────────
//
// 接受一个返回 Promise 的工厂函数 requestFn，以及一个持有当前登录态的对象 authRef。
// 若接口返回 __needLogin，自动触发重登录并用新登录态重试一次。
// authRef 是一个对象引用，重登录后会原地更新其 csrfToken / cookies / baseUrl / cookieData 字段，
// 调用方无需额外处理。

async function requestWithAutoLogin(requestFn, authRef) {
  var result = await requestFn(authRef);
  // 307：csrf_token 过期，刷新后重试
  if (result && result.__csrfExpired) {
    var refreshedData = refreshCsrfToken();
    authRef.cookieData = refreshedData;
    authRef.csrfToken = refreshedData.csrf_token;
    authRef.cookies = refreshedData.cookies;
    authRef.baseUrl = resolveBaseUrl(refreshedData);
    console.error("  🔄 csrf_token 已刷新，重试...");
    result = await requestFn(authRef);
  }
  // 302/301：登录态失效，重新登录后重试
  if (result && result.__needLogin) {
    var newCookieData = triggerLogin();
    authRef.cookieData = newCookieData;
    authRef.csrfToken = newCookieData.csrf_token;
    authRef.cookies = newCookieData.cookies;
    authRef.baseUrl = resolveBaseUrl(newCookieData);
    console.error("  🔄 重新登录后重试...");
    result = await requestFn(authRef);
  }
  return result;
}

// ── 保存 Schema 并更新表单配置（create/update 共用）──
//
// 封装了 saveFormSchema + updateFormConfig 两步，以及各自的 302 自动重登录重试。
// 返回 { saveResult, configResult }。

async function saveSchemaAndUpdateConfig(authRef, appType, formUuid, schema, version, stepOffset) {
  var saveStep = stepOffset || 4;
  var configStep = saveStep + 1;

  console.error("\n📝 Step " + saveStep + ": 保存表单 Schema");
  console.error("  发送 saveFormSchema 请求...");

  var saveResult = await requestWithAutoLogin(function (auth) {
    return sendPostRequest(
      auth.baseUrl, auth.csrfToken, auth.cookies,
      buildApiPath(appType, "saveFormSchema", { prefix: "_view" }),
      { appType: appType, formUuid: formUuid, content: JSON.stringify(schema), schemaVersion: "V5", prefix: "_view" },
      formUuid
    );
  }, authRef);

  if (!saveResult || !saveResult.success) {
    var saveErrorMsg = saveResult ? saveResult.errorMsg || "未知错误" : "请求失败";
    console.error("\n❌ 保存 Schema 失败: " + saveErrorMsg);
    if (saveResult && !saveResult.__needLogin) {
      console.error("  响应详情: " + JSON.stringify(saveResult, null, 2));
    }
    console.error("=".repeat(50));
    console.log(JSON.stringify({ success: false, formUuid: formUuid, error: saveErrorMsg }));
    process.exit(1);
  }

  console.error("  ✅ Schema 保存成功！");
  if (version !== undefined) {
    console.error("  当前版本号: " + version);
  }

  console.error("\n⚙️  Step " + configStep + ": 更新表单配置");
  console.error("  发送 updateFormConfig 请求...");

  var configResult = await requestWithAutoLogin(function (auth) {
    return sendUpdateConfigRequest(auth.baseUrl, auth.csrfToken, auth.cookies, appType, formUuid, version || 1, 0);
  }, authRef);

  return { saveResult: saveResult, configResult: configResult };
}

// ── create 模式主流程 ─────────────────────────────────

async function mainCreate(parsedArgs, csrfToken, cookies, baseUrl, cookieData) {
  const { appType, formTitle, fieldsJsonOrFile } = parsedArgs;

  console.error("=".repeat(50));
  console.error("  yida-create-form-page - 宜搭表单页面创建工具");
  console.error("=".repeat(50));
  console.error("\n  应用 ID:    " + appType);
  console.error("  表单名称:   " + formTitle);
  console.error("  字段定义:   " + fieldsJsonOrFile);

  // 登录态引用对象，供 requestWithAutoLogin 原地更新
  var authRef = { csrfToken: csrfToken, cookies: cookies, baseUrl: baseUrl, cookieData: cookieData };

  // Step 2: 读取字段定义
  console.error("\n📋 Step 2: 读取字段定义");
  const { fields, columns } = readFieldsDefinition(fieldsJsonOrFile);
  console.error("  ✅ 已读取 " + fields.length + " 个字段定义");
  console.error("  PC端列数: " + columns);
  fields.forEach(function (field, index) {
    console.error("     " + (index + 1) + ". " + field.type + ": " + field.label);
  });

  // Step 3: 创建空白表单
  console.error("\n📄 Step 3: 创建空白表单");
  console.error("  发送 saveFormSchemaInfo 请求...");
  var createResult = await requestWithAutoLogin(function (auth) {
    return sendPostRequest(
      auth.baseUrl, auth.csrfToken, auth.cookies,
      buildApiPath(appType, "saveFormSchemaInfo"),
      { formType: "receipt", title: JSON.stringify(i18n(formTitle)) }
    );
  }, authRef);

  if (!createResult || !createResult.success || !createResult.content) {
    const errorMsg = createResult ? createResult.errorMsg || "未知错误" : "请求失败";
    console.error("  ❌ 创建空白表单失败: " + errorMsg);
    console.log(JSON.stringify({ success: false, error: errorMsg }));
    process.exit(1);
  }

  const formUuid = createResult.content.formUuid || createResult.content;
  console.error("  ✅ 空白表单已创建: " + formUuid);

  // Step 4 & 5: 生成 Schema 并保存，然后更新表单配置
  var corpId = resolveCorpId(authRef.cookieData);
  if (!corpId) {
    console.error("  ⚠️ 警告: 未能获取 corpId，SerialNumberField 的 formula 可能无法正常工作");
  } else {
    console.error("  ✅ corpId: " + corpId);
  }

  const schema = buildFormSchema(formTitle, fields, formUuid, corpId, appType, columns);
  var { configResult } = await saveSchemaAndUpdateConfig(authRef, appType, formUuid, schema, 1, 4);

  // 输出结果
  console.error("\n" + "=".repeat(50));
  const formUrl = authRef.baseUrl + "/" + appType + "/workbench/" + formUuid;
  if (configResult && configResult.success) {
    console.error("  ✅ 表单创建成功！");
    console.error("  formUuid: " + formUuid);
    console.error("  访问地址: " + formUrl);
    console.error("  配置已更新: MINI_RESOURCE = 0");
    console.error("=".repeat(50));
    console.log(JSON.stringify({ success: true, formUuid, formTitle, appType, fieldCount: fields.length, url: formUrl }));
  } else {
    const errorMsg = configResult ? configResult.errorMsg || "未知错误" : "请求失败";
    console.error("  ⚠️  配置更新失败: " + errorMsg);
    console.error("  Schema 已保存，但配置更新失败");
    console.error("  formUuid: " + formUuid);
    console.error("  访问地址: " + formUrl);
    if (configResult && !configResult.__needLogin) {
      console.error("  响应详情: " + JSON.stringify(configResult, null, 2));
    }
    console.error("=".repeat(50));
    console.log(JSON.stringify({ success: true, formUuid, formTitle, appType, fieldCount: fields.length, url: formUrl, configWarning: errorMsg }));
  }
}

// ── 为 SerialNumberField 补全 formula（递归处理子表）──
//
// 遍历字段列表，对每个 SerialNumberField：
//   - 若 formula 已有有效的 expression（从宜搭获取的已有字段），则跳过，不覆盖
//   - 若 formula 为空对象 {} 或 expression 为空（新增字段），则自动构建 expression
// 同时递归处理 TableField 的子字段（子表内也可能有流水号字段）

function fillSerialNumberFormulas(components, corpId, appType, formUuid) {
  if (!Array.isArray(components)) return;
  components.forEach(function (component) {
    if (component.componentName === "SerialNumberField" && component.props) {
      var existingFormula = component.props.formula;
      var hasValidFormula = existingFormula &&
        typeof existingFormula === "object" &&
        typeof existingFormula.expression === "string" &&
        existingFormula.expression.length > 0;

      if (!hasValidFormula) {
        var fieldId = component.props.fieldId;
        var serialNumberRule = component.props.serialNumberRule;
        if (serialNumberRule) {
          var ruleJson = JSON.stringify({ type: "custom", value: serialNumberRule });
          var escapedRuleJson = ruleJson.replace(/\\/g, "\\\\").replace(/"/g, '\\"');
          component.props.formula = {
            expression: 'SERIALNUMBER("' + corpId + '", "' + appType + '", "' + formUuid + '", "' + fieldId + '", "' + escapedRuleJson + '")'
          };
          console.error("  🔢 SerialNumberField 「" + (component.props.label && component.props.label.zh_CN || fieldId) + "」formula 已设置");
        }
      }
    }
    // 递归处理子表内的字段
    if (component.componentName === "TableField" && Array.isArray(component.children)) {
      fillSerialNumberFormulas(component.children, corpId, appType, formUuid);
    }
  });
}

// ── update 模式主流程 ─────────────────────────────────

async function mainUpdate(parsedArgs, csrfToken, cookies, baseUrl, cookieData) {
  const { appType, formUuid, changesJsonOrFile } = parsedArgs;

  console.error("=".repeat(50));
  console.error("  yida-create-form-page - 宜搭表单页面更新工具");
  console.error("=".repeat(50));
  console.error("\n  应用 ID:    " + appType);
  console.error("  表单 UUID:  " + formUuid);
  console.error("  修改定义:   " + changesJsonOrFile);

  // 登录态引用对象，供 requestWithAutoLogin 原地更新
  var authRef = { csrfToken: csrfToken, cookies: cookies, baseUrl: baseUrl, cookieData: cookieData };

  // Step 2: 获取当前表单 Schema
  console.error("\n📄 Step 2: 获取当前表单 Schema");
  console.error("  发送 getFormSchema 请求...");
  var schemaResult = await requestWithAutoLogin(function (auth) {
    return sendGetRequest(
      auth.baseUrl, auth.cookies,
      buildApiPath(appType, "getFormSchema", { prefix: "_view", namespace: "alibaba" }),
      { formUuid: formUuid, schemaVersion: "V5" }
    );
  }, authRef);

  if (!schemaResult || schemaResult.success === false || schemaResult.__needLogin) {
    const errorMsg = schemaResult ? schemaResult.errorMsg || "未知错误" : "请求失败";
    console.error("  ❌ 获取表单 Schema 失败: " + errorMsg);
    console.log(JSON.stringify({ success: false, error: errorMsg }));
    process.exit(1);
  }

  // 从返回结果中提取 schema 内容和版本号
  var schema;
  var version = 1;

  if (schemaResult.content && typeof schemaResult.content === "object" && schemaResult.content.version !== undefined) {
    version = schemaResult.content.version;
  } else if (schemaResult.version !== undefined) {
    version = schemaResult.version;
  }

  if (schemaResult.content) {
    schema = typeof schemaResult.content === "string" ? JSON.parse(schemaResult.content) : schemaResult.content;
  } else if (schemaResult.pages) {
    schema = schemaResult;
  } else {
    console.error("  ❌ 无法从返回结果中提取 Schema");
    console.error("  响应结构: " + JSON.stringify(Object.keys(schemaResult)));
    console.log(JSON.stringify({ success: false, error: "无法解析 Schema 结构" }));
    process.exit(1);
  }

  if (!schema.pages || !Array.isArray(schema.pages) || schema.pages.length === 0) {
    console.error("  ⚠️ Schema 为空，使用基础表单模板初始化");
    schema = buildEmptyFormSchema();
  }

  const formContainer = findFormContainer(schema.pages[0].componentsTree[0]);
  if (formContainer && formContainer.children) {
    console.error("  ✅ Schema 获取成功，当前共 " + formContainer.children.length + " 个字段：");
    formContainer.children.forEach(function (child, childIndex) {
      const labelText = extractLabelText(child);
      console.error("     " + (childIndex + 1) + ". " + child.componentName + ": " + labelText);
    });
  } else {
    console.error("  ✅ Schema 获取成功（表单暂无字段）");
  }

  // Step 3: 读取修改定义
  console.error("\n📋 Step 3: 读取修改定义");
  const changes = readChangesDefinition(changesJsonOrFile);
  console.error("  ✅ 已读取 " + changes.length + " 条修改操作");
  changes.forEach(function (change, changeIndex) {
    if (change.action === "add") {
      console.error("     " + (changeIndex + 1) + ". [新增] " + change.field.type + ": " + change.field.label);
    } else if (change.action === "delete") {
      console.error("     " + (changeIndex + 1) + ". [删除] " + change.label);
    } else if (change.action === "update") {
      console.error("     " + (changeIndex + 1) + ". [修改] " + change.label + " → " + Object.keys(change.changes || {}).join(", "));
    }
  });

  // Step 4: 应用修改
  console.error("\n🔧 Step 4: 应用修改");
  const appliedChanges = applyChangesToSchema(schema, changes);

  // 为 SerialNumberField 补全 formula（若尚未设置）
  var corpId = resolveCorpId(authRef.cookieData);
  if (!corpId) {
    console.error("  ⚠️ 警告: 未能获取 corpId，SerialNumberField 的 formula 可能无法正常工作");
  }

  const formContainerUpdate = findFormContainer(schema.pages[0].componentsTree[0]);
  if (formContainerUpdate && formContainerUpdate.children) {
    fillSerialNumberFormulas(formContainerUpdate.children, corpId, appType, formUuid);
  }

  // Step 5 & 6: 保存 Schema 并更新表单配置
  var { configResult } = await saveSchemaAndUpdateConfig(authRef, appType, formUuid, schema, version, 5);

  // 输出结果
  console.error("\n" + "=".repeat(50));
  const formUrl = authRef.baseUrl + "/" + appType + "/workbench/" + formUuid;
  if (configResult && configResult.success) {
    console.error("  ✅ 表单更新成功！");
    console.error("  formUuid: " + formUuid);
    console.error("  访问地址: " + formUrl);
    console.error("  应用修改: " + appliedChanges.length + " 条");
    console.error("  配置已更新: MINI_RESOURCE = 0");
    console.error("=".repeat(50));
    console.log(JSON.stringify({ success: true, formUuid, appType, changesApplied: appliedChanges.length, changes: appliedChanges, url: formUrl }));
  } else {
    const errorMsg = configResult ? configResult.errorMsg || "未知错误" : "请求失败";
    console.error("  ⚠️  配置更新失败: " + errorMsg);
    console.error("  Schema 已保存，但配置更新失败");
    console.error("  formUuid: " + formUuid);
    console.error("  访问地址: " + formUrl);
    console.error("  应用修改: " + appliedChanges.length + " 条");
    if (configResult && !configResult.__needLogin) {
      console.error("  响应详情: " + JSON.stringify(configResult, null, 2));
    }
    console.error("=".repeat(50));
    console.log(JSON.stringify({ success: true, formUuid, appType, changesApplied: appliedChanges.length, changes: appliedChanges, url: formUrl, configWarning: errorMsg }));
  }
}

// ── 主入口 ────────────────────────────────────────────

async function main() {
  const parsedArgs = parseArgs();

  // Step 1: 读取本地登录态
  console.error("\n🔑 Step 1: 读取登录态");
  let cookieData = loadCookieData();
  if (!cookieData) {
    console.error("  ⚠️  未找到本地登录态，触发登录...");
    cookieData = triggerLogin();
  }
  let { csrf_token: csrfToken, cookies } = cookieData;
  let baseUrl = resolveBaseUrl(cookieData);
  console.error("  ✅ 登录态已就绪（" + baseUrl + "）");

  if (parsedArgs.mode === "update") {
    await mainUpdate(parsedArgs, csrfToken, cookies, baseUrl, cookieData);
  } else {
    await mainCreate(parsedArgs, csrfToken, cookies, baseUrl, cookieData);
  }
}

main().catch((error) => {
  console.error("\n❌ 异常: " + error.message);
  process.exit(1);
});
