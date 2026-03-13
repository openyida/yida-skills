#!/usr/bin/env node
/**
 * yida-openapi: 宜搭 OpenAPI 数据操作
 *
 * 用法：
 *   node openapi.js <action> [options]
 *
 * action 列表：
 *   search          搜索表单数据列表
 *   get             根据实例 ID 查询表单详情
 *   create          新建表单实例
 *   update          更新表单实例
 *   delete          删除表单实例
 *   process-search  搜索流程实例列表
 *   process-get     查询流程实例详情
 *   process-start   发起流程实例
 *
 * 示例：
 *   node openapi.js search --app APP_XXX --form FORM-XXX --page 1 --page-size 20
 *   node openapi.js create --app APP_XXX --form FORM-XXX --data '{"textField_xxx":"值"}'
 *   node openapi.js update --app APP_XXX --inst FINST-XXX --data '{"textField_xxx":"新值"}'
 *   node openapi.js delete --app APP_XXX --inst FINST-XXX
 *   node openapi.js process-start --app APP_XXX --form FORM-XXX --process TPROC--XXX --data '{}'
 */

"use strict";

const path = require("path");
const {
  fetchWithRetry,
  loadCookieData,
  resolveBaseUrl,
  triggerLogin,
} = require("../../shared/fetch-with-retry");

// ── 参数解析 ──────────────────────────────────────────────────────────

function parseArgs(argv) {
  const args = argv.slice(2);
  const action = args[0];
  const options = {
    action,
    appType: null,
    formUuid: null,
    formInstId: null,
    processCode: null,
    processInstId: null,
    data: null,
    searchCondition: null,
    currentPage: 1,
    pageSize: 20,
    instanceStatus: null,
    dryRun: false,
  };

  for (let i = 1; i < args.length; i++) {
    switch (args[i]) {
      case "--app":
        options.appType = args[++i];
        break;
      case "--form":
        options.formUuid = args[++i];
        break;
      case "--inst":
        options.formInstId = args[++i];
        break;
      case "--process":
        options.processCode = args[++i];
        break;
      case "--process-inst":
        options.processInstId = args[++i];
        break;
      case "--data":
        options.data = args[++i];
        break;
      case "--search":
        options.searchCondition = args[++i];
        break;
      case "--page":
        options.currentPage = parseInt(args[++i], 10) || 1;
        break;
      case "--page-size":
        options.pageSize = parseInt(args[++i], 10) || 20;
        break;
      case "--status":
        options.instanceStatus = args[++i];
        break;
      case "--dry-run":
        options.dryRun = true;
        break;
      default:
        break;
    }
  }

  return options;
}

// ── 参数校验 ──────────────────────────────────────────────────────────

function requireOptions(options, requiredKeys) {
  const missing = requiredKeys.filter((key) => !options[key]);
  if (missing.length > 0) {
    const keyToFlag = {
      appType: "--app",
      formUuid: "--form",
      formInstId: "--inst",
      processCode: "--process",
      processInstId: "--process-inst",
      data: "--data",
    };
    const flags = missing.map((key) => keyToFlag[key] || `--${key}`);
    console.error(`❌ 缺少必填参数：${flags.join("、")}`);
    process.exit(1);
  }
}

// ── API 调用封装 ──────────────────────────────────────────────────────

/**
 * 构建宜搭 OpenAPI 的完整 URL
 */
function buildApiUrl(baseUrl, appType, apiPath) {
  return `${baseUrl}/dingtalk/web/${appType}${apiPath}`;
}

/**
 * 构建通用请求头
 */
function buildCommonHeaders(baseUrl, csrfToken) {
  return {
    "Content-Type": "application/json",
    "X-Csrf-Token": csrfToken || "",
    Origin: baseUrl,
    Referer: `${baseUrl}/`,
  };
}

/**
 * 发起 GET 请求
 */
async function apiGet(baseUrl, appType, apiPath, queryParams, authContext) {
  const queryString = new URLSearchParams(
    Object.entries(queryParams).filter(([, value]) => value !== null && value !== undefined)
  ).toString();
  const url = buildApiUrl(baseUrl, appType, apiPath) + (queryString ? `?${queryString}` : "");
  const csrfToken = authContext.cookieData && authContext.cookieData.csrf_token;

  return fetchWithRetry(
    { url, method: "GET", headers: buildCommonHeaders(baseUrl, csrfToken) },
    authContext
  );
}

/**
 * 发起 POST 请求
 */
async function apiPost(baseUrl, appType, apiPath, bodyData, authContext) {
  const url = buildApiUrl(baseUrl, appType, apiPath);
  const csrfToken = authContext.cookieData && authContext.cookieData.csrf_token;
  const body = JSON.stringify(bodyData);

  return fetchWithRetry(
    { url, method: "POST", body, headers: buildCommonHeaders(baseUrl, csrfToken) },
    authContext
  );
}

// ── 各 action 实现 ────────────────────────────────────────────────────

/**
 * 搜索表单数据列表
 */
async function actionSearch(options, baseUrl, authContext) {
  requireOptions(options, ["appType", "formUuid"]);
  console.error(`🔍 搜索表单数据：${options.formUuid}（第 ${options.currentPage} 页，每页 ${options.pageSize} 条）`);

  const queryParams = {
    formUuid: options.formUuid,
    currentPage: options.currentPage,
    pageSize: options.pageSize,
  };
  if (options.searchCondition) {
    queryParams.searchFieldJson = options.searchCondition;
  }

  const { response } = await apiGet(
    baseUrl,
    options.appType,
    "/v1/form/searchFormDatas.json",
    queryParams,
    authContext
  );

  if (!response.success) {
    console.error(`❌ 搜索失败：[${response.errorCode}] ${response.errorMsg}`);
    process.exit(1);
  }

  const result = response.result || {};
  const data = result.data || [];
  console.error(`✅ 共找到 ${result.totalCount || data.length} 条记录`);
  console.log(JSON.stringify({ success: true, totalCount: result.totalCount || data.length, data }, null, 2));
}

/**
 * 根据实例 ID 查询表单详情
 */
async function actionGet(options, baseUrl, authContext) {
  requireOptions(options, ["appType", "formInstId"]);
  console.error(`🔍 查询表单实例：${options.formInstId}`);

  const { response } = await apiGet(
    baseUrl,
    options.appType,
    "/v1/form/getFormDataById.json",
    { formInstId: options.formInstId },
    authContext
  );

  if (!response.success) {
    console.error(`❌ 查询失败：[${response.errorCode}] ${response.errorMsg}`);
    process.exit(1);
  }

  console.error("✅ 查询成功");
  console.log(JSON.stringify({ success: true, data: response.result }, null, 2));
}

/**
 * 新建表单实例
 */
async function actionCreate(options, baseUrl, authContext) {
  requireOptions(options, ["appType", "formUuid", "data"]);

  let formData;
  try {
    formData = JSON.parse(options.data);
  } catch {
    console.error("❌ --data 参数不是合法的 JSON 字符串");
    process.exit(1);
  }

  console.error(`📝 新建表单实例：${options.formUuid}`);
  if (options.dryRun) {
    console.error("🔍 [dry-run] 预览数据：");
    console.error(JSON.stringify(formData, null, 2));
    console.error("✅ dry-run 完成，未实际创建");
    return;
  }

  const { response } = await apiPost(
    baseUrl,
    options.appType,
    "/v1/form/saveFormData.json",
    {
      formUuid: options.formUuid,
      appType: options.appType,
      formDataJson: JSON.stringify(formData),
    },
    authContext
  );

  if (!response.success) {
    console.error(`❌ 创建失败：[${response.errorCode}] ${response.errorMsg}`);
    process.exit(1);
  }

  const formInstId = response.result;
  console.error(`✅ 创建成功：${formInstId}`);
  console.log(JSON.stringify({ success: true, formInstId }, null, 2));
}

/**
 * 更新表单实例
 */
async function actionUpdate(options, baseUrl, authContext) {
  requireOptions(options, ["appType", "formInstId", "data"]);

  let updateData;
  try {
    updateData = JSON.parse(options.data);
  } catch {
    console.error("❌ --data 参数不是合法的 JSON 字符串");
    process.exit(1);
  }

  console.error(`✏️  更新表单实例：${options.formInstId}`);
  if (options.dryRun) {
    console.error("🔍 [dry-run] 预览更新数据：");
    console.error(JSON.stringify(updateData, null, 2));
    console.error("✅ dry-run 完成，未实际更新");
    return;
  }

  const { response } = await apiPost(
    baseUrl,
    options.appType,
    "/v1/form/updateFormData.json",
    {
      formInstId: options.formInstId,
      updateFormDataJson: JSON.stringify(updateData),
    },
    authContext
  );

  if (!response.success) {
    console.error(`❌ 更新失败：[${response.errorCode}] ${response.errorMsg}`);
    process.exit(1);
  }

  console.error("✅ 更新成功");
  console.log(JSON.stringify({ success: true }, null, 2));
}

/**
 * 删除表单实例
 */
async function actionDelete(options, baseUrl, authContext) {
  requireOptions(options, ["appType", "formInstId"]);

  console.error(`🗑️  删除表单实例：${options.formInstId}`);
  if (options.dryRun) {
    console.error("🔍 [dry-run] 将删除实例：" + options.formInstId);
    console.error("✅ dry-run 完成，未实际删除");
    return;
  }

  const { response } = await apiPost(
    baseUrl,
    options.appType,
    "/v1/form/deleteFormData.json",
    { formInstId: options.formInstId },
    authContext
  );

  if (!response.success) {
    console.error(`❌ 删除失败：[${response.errorCode}] ${response.errorMsg}`);
    process.exit(1);
  }

  console.error("✅ 删除成功");
  console.log(JSON.stringify({ success: true }, null, 2));
}

/**
 * 搜索流程实例列表
 */
async function actionProcessSearch(options, baseUrl, authContext) {
  requireOptions(options, ["appType", "formUuid"]);
  console.error(`🔍 搜索流程实例：${options.formUuid}`);

  const queryParams = {
    formUuid: options.formUuid,
    currentPage: options.currentPage,
    pageSize: options.pageSize,
  };
  if (options.instanceStatus) {
    queryParams.instanceStatus = options.instanceStatus;
  }

  const { response } = await apiGet(
    baseUrl,
    options.appType,
    "/v1/process/getInstances.json",
    queryParams,
    authContext
  );

  if (!response.success) {
    console.error(`❌ 搜索失败：[${response.errorCode}] ${response.errorMsg}`);
    process.exit(1);
  }

  const result = response.result || {};
  const data = result.data || [];
  console.error(`✅ 共找到 ${result.totalCount || data.length} 条流程实例`);
  console.log(JSON.stringify({ success: true, totalCount: result.totalCount || data.length, data }, null, 2));
}

/**
 * 查询流程实例详情
 */
async function actionProcessGet(options, baseUrl, authContext) {
  requireOptions(options, ["appType", "processInstId"]);
  console.error(`🔍 查询流程实例：${options.processInstId}`);

  const { response } = await apiGet(
    baseUrl,
    options.appType,
    "/v1/process/getInstanceById.json",
    { processInstanceId: options.processInstId },
    authContext
  );

  if (!response.success) {
    console.error(`❌ 查询失败：[${response.errorCode}] ${response.errorMsg}`);
    process.exit(1);
  }

  console.error("✅ 查询成功");
  console.log(JSON.stringify({ success: true, data: response.result }, null, 2));
}

/**
 * 发起流程实例
 */
async function actionProcessStart(options, baseUrl, authContext) {
  requireOptions(options, ["appType", "formUuid", "processCode"]);

  let formData = {};
  if (options.data) {
    try {
      formData = JSON.parse(options.data);
    } catch {
      console.error("❌ --data 参数不是合法的 JSON 字符串");
      process.exit(1);
    }
  }

  console.error(`🚀 发起流程：${options.processCode}`);
  if (options.dryRun) {
    console.error("🔍 [dry-run] 预览流程数据：");
    console.error(JSON.stringify(formData, null, 2));
    console.error("✅ dry-run 完成，未实际发起");
    return;
  }

  const { response } = await apiPost(
    baseUrl,
    options.appType,
    "/v1/process/startInstance.json",
    {
      processCode: options.processCode,
      formUuid: options.formUuid,
      formDataJson: JSON.stringify(formData),
    },
    authContext
  );

  if (!response.success) {
    console.error(`❌ 发起失败：[${response.errorCode}] ${response.errorMsg}`);
    process.exit(1);
  }

  const processInstId = response.result;
  console.error(`✅ 流程发起成功：${processInstId}`);
  console.log(JSON.stringify({ success: true, processInstId }, null, 2));
}

// ── 主流程 ────────────────────────────────────────────────────────────

const USAGE = `
用法：node openapi.js <action> [options]

action：
  search          搜索表单数据列表
  get             根据实例 ID 查询表单详情
  create          新建表单实例
  update          更新表单实例
  delete          删除表单实例
  process-search  搜索流程实例列表
  process-get     查询流程实例详情
  process-start   发起流程实例

通用参数：
  --app <appType>       应用 ID（如 APP_XXXX）
  --form <formUuid>     表单 ID（如 FORM-XXXX）
  --inst <formInstId>   表单实例 ID（如 FINST-XXXX）
  --process <code>      流程 code（如 TPROC--XXXX）
  --process-inst <id>   流程实例 ID
  --data <json>         表单数据 JSON 字符串
  --search <json>       搜索条件 JSON 字符串
  --page <n>            当前页（默认 1）
  --page-size <n>       每页条数（默认 20）
  --status <status>     流程状态（RUNNING/COMPLETED/TERMINATED）
  --dry-run             预览模式，不实际执行写操作

示例：
  node openapi.js search --app APP_XXX --form FORM-XXX
  node openapi.js create --app APP_XXX --form FORM-XXX --data '{"textField_xxx":"值"}'
  node openapi.js update --app APP_XXX --inst FINST-XXX --data '{"textField_xxx":"新值"}'
  node openapi.js delete --app APP_XXX --inst FINST-XXX
  node openapi.js process-start --app APP_XXX --form FORM-XXX --process TPROC--XXX --data '{}'
`.trim();

async function main() {
  const options = parseArgs(process.argv);

  const validActions = ["search", "get", "create", "update", "delete", "process-search", "process-get", "process-start"];
  if (!options.action || !validActions.includes(options.action)) {
    console.error(USAGE);
    process.exit(options.action ? 1 : 0);
  }

  // 加载登录态
  let cookieData = loadCookieData();
  if (!cookieData || !cookieData.cookies || cookieData.cookies.length === 0) {
    console.error("⚠️  未找到登录态，正在触发登录...");
    cookieData = triggerLogin();
  }

  const baseUrl = resolveBaseUrl(cookieData);
  const authContext = {
    cookieData,
    onAuthUpdate: (newCookieData) => {
      cookieData = newCookieData;
      authContext.cookieData = newCookieData;
    },
  };

  console.error(`🔌 宜搭 OpenAPI | action: ${options.action} | baseUrl: ${baseUrl}`);

  switch (options.action) {
    case "search":
      await actionSearch(options, baseUrl, authContext);
      break;
    case "get":
      await actionGet(options, baseUrl, authContext);
      break;
    case "create":
      await actionCreate(options, baseUrl, authContext);
      break;
    case "update":
      await actionUpdate(options, baseUrl, authContext);
      break;
    case "delete":
      await actionDelete(options, baseUrl, authContext);
      break;
    case "process-search":
      await actionProcessSearch(options, baseUrl, authContext);
      break;
    case "process-get":
      await actionProcessGet(options, baseUrl, authContext);
      break;
    case "process-start":
      await actionProcessStart(options, baseUrl, authContext);
      break;
    default:
      console.error(USAGE);
      process.exit(1);
  }
}

main().catch((error) => {
  console.error(`❌ 执行失败：${error.message}`);
  process.exit(1);
});
