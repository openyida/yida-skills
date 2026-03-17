#!/usr/bin/env node
/**
 * import.js - 宜搭应用导入工具
 *
 * 将 yida-export 导出的应用迁移包导入到目标宜搭环境，
 * 自动重建应用和所有表单页面，并输出迁移报告。
 *
 * 用法：
 *   node import.js <exportFile> [appName]
 *
 * 参数：
 *   exportFile - 导出文件路径（必填），由 yida-export 生成的 yida-export.json
 *   appName    - 目标应用名称（可选，默认使用源应用 ID）
 *
 * 示例：
 *   node skills/yida-import/scripts/import.js ./yida-export.json
 *   node skills/yida-import/scripts/import.js ./yida-export.json "质量追溯系统（生产）"
 *
 * 迁移流程：
 *   1. 读取导出包
 *   2. 在目标环境创建新应用
 *   3. 逐个重建表单（创建空白表单 → 适配 Schema → 保存 Schema → 更新配置）
 *   4. 输出迁移报告（新旧 formUuid 映射）
 */

"use strict";

const https = require("https");
const http = require("http");
const fs = require("fs");
const path = require("path");
const querystring = require("querystring");
const { execSync } = require("child_process");

// ── 项目根目录查找 ────────────────────────────────────

function findProjectRoot() {
  for (const startDir of [process.cwd(), __dirname]) {
    let currentDir = startDir;
    while (currentDir !== path.dirname(currentDir)) {
      if (
        fs.existsSync(path.join(currentDir, "README.md")) ||
        fs.existsSync(path.join(currentDir, ".git"))
      ) {
        return currentDir;
      }
      currentDir = path.dirname(currentDir);
    }
  }
  return process.cwd();
}

const PROJECT_ROOT = findProjectRoot();
const CONFIG_PATH = path.join(PROJECT_ROOT, "config.json");
const CONFIG = fs.existsSync(CONFIG_PATH)
  ? JSON.parse(fs.readFileSync(CONFIG_PATH, "utf-8"))
  : {};
const DEFAULT_BASE_URL = CONFIG.defaultBaseUrl || "https://www.aliwork.com";
const COOKIE_FILE = path.join(PROJECT_ROOT, ".cache", "cookies.json");
const LOGIN_SCRIPT = path.join(
  PROJECT_ROOT,
  ".claude",
  "skills",
  "yida-login",
  "scripts",
  "login.py"
);

// ── 参数解析 ─────────────────────────────────────────

function parseArgs() {
  const args = process.argv.slice(2);
  if (args.length < 1) {
    console.error("用法: node import.js <exportFile> [appName]");
    console.error("示例: node skills/yida-import/scripts/import.js ./yida-export.json");
    console.error(
      '      node skills/yida-import/scripts/import.js ./yida-export.json "质量追溯系统（生产）"'
    );
    process.exit(1);
  }
  return {
    exportFile: path.resolve(args[0]),
    appName: args[1] || null,
  };
}

// ── 登录态管理 ───────────────────────────────────────

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
    const cookieData = Array.isArray(parsed)
      ? { cookies: parsed, base_url: DEFAULT_BASE_URL }
      : parsed;
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
    if (!result.csrf_token || !result.cookies) {
      throw new Error("刷新结果缺少 csrf_token 或 cookies");
    }
    return result;
  } catch (err) {
    console.error(`  ❌ 解析刷新结果失败: ${err.message}`);
    process.exit(1);
  }
}

function resolveBaseUrl(cookieData) {
  return ((cookieData && cookieData.base_url) || DEFAULT_BASE_URL).replace(/\/+$/, "");
}

function resolveCorpId(cookieData) {
  if (cookieData.corp_id) return cookieData.corp_id;
  if (cookieData.cookies) {
    const corpUserCookie = cookieData.cookies.find((c) => c.name === "tianshu_corp_user");
    if (corpUserCookie && corpUserCookie.value) {
      const lastUnderscore = corpUserCookie.value.lastIndexOf("_");
      if (lastUnderscore > 0) {
        return corpUserCookie.value.slice(0, lastUnderscore);
      }
    }
  }
  return "";
}

function isLoginExpired(responseJson) {
  return (
    responseJson &&
    responseJson.success === false &&
    (responseJson.errorCode === "307" || responseJson.errorCode === "302")
  );
}

function isCsrfTokenExpired(responseJson) {
  return (
    responseJson &&
    responseJson.success === false &&
    responseJson.errorCode === "TIANSHU_000030"
  );
}

// ── HTTP 请求封装 ─────────────────────────────────────

function buildCookieHeader(cookies) {
  return cookies.map((c) => `${c.name}=${c.value}`).join("; ");
}

function sendGetRequest(baseUrl, cookies, requestPath, queryParams) {
  return new Promise((resolve, reject) => {
    const queryString = querystring.stringify(queryParams || {});
    const fullPath = queryString ? `${requestPath}?${queryString}` : requestPath;
    const cookieHeader = buildCookieHeader(cookies);
    const parsedUrl = new URL(baseUrl);
    const isHttps = parsedUrl.protocol === "https:";
    const requestModule = isHttps ? https : http;

    const req = requestModule.request(
      {
        hostname: parsedUrl.hostname,
        port: parsedUrl.port || (isHttps ? 443 : 80),
        path: fullPath,
        method: "GET",
        headers: { Origin: baseUrl, Referer: baseUrl + "/", Cookie: cookieHeader },
        timeout: 30000,
      },
      (res) => {
        let data = "";
        res.on("data", (chunk) => { data += chunk; });
        res.on("end", () => {
          console.error(`  HTTP ${res.statusCode}`);
          let parsed;
          try {
            parsed = JSON.parse(data);
          } catch {
            resolve({ success: false, errorMsg: `HTTP ${res.statusCode}: 响应非 JSON` });
            return;
          }
          if (isLoginExpired(parsed)) { resolve({ __needLogin: true }); return; }
          if (isCsrfTokenExpired(parsed)) { resolve({ __csrfExpired: true }); return; }
          resolve(parsed);
        });
      }
    );
    req.on("timeout", () => { req.destroy(); reject(new Error("请求超时")); });
    req.on("error", reject);
    req.end();
  });
}

function sendPostRequest(baseUrl, csrfToken, cookies, requestPath, bodyParams) {
  return new Promise((resolve, reject) => {
    const postData = querystring.stringify({ _csrf_token: csrfToken, ...bodyParams });
    const cookieHeader = buildCookieHeader(cookies);
    const parsedUrl = new URL(baseUrl);
    const isHttps = parsedUrl.protocol === "https:";
    const requestModule = isHttps ? https : http;

    const req = requestModule.request(
      {
        hostname: parsedUrl.hostname,
        port: parsedUrl.port || (isHttps ? 443 : 80),
        path: requestPath,
        method: "POST",
        headers: {
          "Content-Type": "application/x-www-form-urlencoded",
          "Content-Length": Buffer.byteLength(postData),
          Origin: baseUrl,
          Referer: baseUrl + "/",
          Cookie: cookieHeader,
        },
        timeout: 30000,
      },
      (res) => {
        let data = "";
        res.on("data", (chunk) => { data += chunk; });
        res.on("end", () => {
          console.error(`  HTTP ${res.statusCode}`);
          let parsed;
          try {
            parsed = JSON.parse(data);
          } catch {
            resolve({ success: false, errorMsg: `HTTP ${res.statusCode}: 响应非 JSON` });
            return;
          }
          if (isLoginExpired(parsed)) { resolve({ __needLogin: true }); return; }
          if (isCsrfTokenExpired(parsed)) { resolve({ __csrfExpired: true }); return; }
          resolve(parsed);
        });
      }
    );
    req.on("timeout", () => { req.destroy(); reject(new Error("请求超时")); });
    req.on("error", reject);
    req.write(postData);
    req.end();
  });
}

// ── 带自动重登录的请求封装 ────────────────────────────

async function requestWithAutoLogin(requestFn, authRef) {
  let result = await requestFn(authRef);
  if (result && result.__csrfExpired) {
    const refreshed = refreshCsrfToken();
    authRef.cookieData = refreshed;
    authRef.csrfToken = refreshed.csrf_token;
    authRef.cookies = refreshed.cookies;
    authRef.baseUrl = resolveBaseUrl(refreshed);
    console.error("  🔄 csrf_token 已刷新，重试...");
    result = await requestFn(authRef);
  }
  if (result && result.__needLogin) {
    const newCookieData = triggerLogin();
    authRef.cookieData = newCookieData;
    authRef.csrfToken = newCookieData.csrf_token;
    authRef.cookies = newCookieData.cookies;
    authRef.baseUrl = resolveBaseUrl(newCookieData);
    console.error("  🔄 重新登录后重试...");
    result = await requestFn(authRef);
  }
  return result;
}

// ── Schema 适配：将源 Schema 适配到新应用 ─────────────

/**
 * 深度克隆对象（避免修改原始导出数据）
 */
function deepClone(obj) {
  return JSON.parse(JSON.stringify(obj));
}

/**
 * 递归遍历 Schema 中的所有组件，对每个组件执行回调
 */
function walkComponents(components, callback) {
  if (!Array.isArray(components)) return;
  for (const component of components) {
    callback(component);
    if (component.children && Array.isArray(component.children)) {
      walkComponents(component.children, callback);
    }
  }
}

/**
 * 从 Schema 中找到表单容器（FormContainer 或 RecordContainer）
 */
function findFormContainer(tree) {
  if (!tree) return null;
  if (
    tree.componentName === "FormContainer" ||
    tree.componentName === "RecordContainer"
  ) {
    return tree;
  }
  if (tree.children && Array.isArray(tree.children)) {
    for (const child of tree.children) {
      const found = findFormContainer(child);
      if (found) return found;
    }
  }
  return null;
}

/**
 * 重置 SerialNumberField 的 formula，适配新应用的 appType 和 formUuid
 *
 * SerialNumberField 的 formula.expression 格式：
 *   SERIALNUMBER("{corpId}", "{appType}", "{formUuid}", "{fieldId}", "{ruleJson}")
 *
 * 迁移时需要将 appType 和 formUuid 替换为新值，corpId 和 fieldId 保持不变。
 */
function adaptSerialNumberFields(components, newAppType, newFormUuid, newCorpId) {
  walkComponents(components, (component) => {
    if (component.componentName !== "SerialNumberField" || !component.props) return;

    const fieldId = component.props.fieldId;
    const serialNumberRule = component.props.serialNumberRule;

    if (!fieldId || !serialNumberRule) return;

    // 重新构建 formula，使用新的 appType、formUuid、corpId
    const ruleJson = JSON.stringify({ type: "custom", value: serialNumberRule });
    const escapedRuleJson = ruleJson.replace(/\\/g, "\\\\").replace(/"/g, '\\"');
    component.props.formula = {
      expression: `SERIALNUMBER("${newCorpId}", "${newAppType}", "${newFormUuid}", "${fieldId}", "${escapedRuleJson}")`,
    };
    console.error(
      `  🔢 SerialNumberField 「${component.props.label && component.props.label.zh_CN || fieldId}」formula 已适配`
    );
  });
}

/**
 * 将源 Schema 适配到新应用环境
 * - 替换 formUuid 引用
 * - 重置 SerialNumberField formula
 * - 清除可能导致冲突的运行时状态
 */
function adaptSchemaForTarget(sourceSchema, newAppType, newFormUuid, newCorpId) {
  const schema = deepClone(sourceSchema);

  if (!schema.pages || !Array.isArray(schema.pages) || schema.pages.length === 0) {
    return schema;
  }

  const page = schema.pages[0];
  if (!page.componentsTree || !Array.isArray(page.componentsTree)) {
    return schema;
  }

  const tree = page.componentsTree[0];
  const formContainer = findFormContainer(tree);

  if (formContainer && formContainer.children) {
    adaptSerialNumberFields(formContainer.children, newAppType, newFormUuid, newCorpId);
  }

  return schema;
}

// ── 宜搭 API 调用 ─────────────────────────────────────

/**
 * 创建新应用，返回 appType
 */
async function createApp(authRef, appName) {
  const i18nName = JSON.stringify({ zh_CN: appName, en_US: appName, type: "i18n" });
  const iconValue = "xian-yingyong%%#0089FF";

  const result = await requestWithAutoLogin(
    (auth) =>
      sendPostRequest(auth.baseUrl, auth.csrfToken, auth.cookies, "/query/app/registerApp.json", {
        appName: i18nName,
        description: i18nName,
        icon: iconValue,
        iconUrl: iconValue,
        colour: "blue",
        defaultLanguage: "zh_CN",
        openExclusive: "n",
        openPhysicColumn: "n",
        openIsolationDatabase: "n",
        openExclusiveUnit: "n",
        group: "全部应用",
      }),
    authRef
  );

  if (!result || !result.success || !result.content) {
    throw new Error(`创建应用失败: ${result ? result.errorMsg || "未知错误" : "请求失败"}`);
  }
  return result.content; // appType
}

/**
 * 创建空白表单，返回 formUuid
 */
async function createBlankForm(authRef, appType, formTitle) {
  const i18nTitle = JSON.stringify({ zh_CN: formTitle, en_US: formTitle, type: "i18n" });

  const result = await requestWithAutoLogin(
    (auth) =>
      sendPostRequest(
        auth.baseUrl,
        auth.csrfToken,
        auth.cookies,
        `/dingtalk/web/${appType}/query/formdesign/saveFormSchemaInfo.json`,
        { formType: "receipt", title: i18nTitle }
      ),
    authRef
  );

  if (!result || !result.success || !result.content) {
    throw new Error(`创建空白表单失败: ${result ? result.errorMsg || "未知错误" : "请求失败"}`);
  }
  return result.content.formUuid || result.content;
}

/**
 * 保存表单 Schema
 */
async function saveFormSchema(authRef, appType, formUuid, schema) {
  const result = await requestWithAutoLogin(
    (auth) =>
      sendPostRequest(
        auth.baseUrl,
        auth.csrfToken,
        auth.cookies,
        `/dingtalk/web/${appType}/_view/query/formdesign/saveFormSchema.json`,
        {
          appType,
          formUuid,
          content: JSON.stringify(schema),
          schemaVersion: "V5",
          prefix: "_view",
        }
      ),
    authRef
  );

  if (!result || !result.success) {
    throw new Error(`保存 Schema 失败: ${result ? result.errorMsg || "未知错误" : "请求失败"}`);
  }
  return result;
}

/**
 * 更新表单配置（发布表单）
 */
async function updateFormConfig(authRef, appType, formUuid) {
  const result = await requestWithAutoLogin(
    (auth) =>
      sendPostRequest(
        auth.baseUrl,
        auth.csrfToken,
        auth.cookies,
        `/dingtalk/web/${appType}/query/formdesign/updateFormConfig.json`,
        {
          formUuid,
          settingKey: "MINI_RESOURCE",
          settingValue: "0",
          version: "1",
        }
      ),
    authRef
  );

  // updateFormConfig 失败不阻断流程，只记录警告
  if (!result || !result.success) {
    console.error(
      `  ⚠️  updateFormConfig 警告: ${result ? result.errorMsg || "未知错误" : "请求失败"}`
    );
  }
  return result;
}

// ── 主流程 ────────────────────────────────────────────

async function main() {
  const { exportFile, appName: requestedAppName } = parseArgs();

  console.error("=".repeat(50));
  console.error("  yida-import - 宜搭应用导入工具");
  console.error("=".repeat(50));

  // Step 1: 读取导出包
  console.error("\n📂 Step 1: 读取导出包");
  if (!fs.existsSync(exportFile)) {
    console.error(`  ❌ 导出文件不存在: ${exportFile}`);
    process.exit(1);
  }

  let exportPackage;
  try {
    exportPackage = JSON.parse(fs.readFileSync(exportFile, "utf-8"));
  } catch (err) {
    console.error(`  ❌ 读取导出文件失败: ${err.message}`);
    process.exit(1);
  }

  const { sourceAppType, sourceBaseUrl, forms } = exportPackage;
  if (!sourceAppType || !Array.isArray(forms) || forms.length === 0) {
    console.error("  ❌ 导出文件格式无效，缺少 sourceAppType 或 forms");
    process.exit(1);
  }

  const appName = requestedAppName || `${sourceAppType}（迁移副本）`;
  console.error(`  ✅ 导出包读取成功`);
  console.error(`  源应用:   ${sourceAppType} (${sourceBaseUrl})`);
  console.error(`  表单数量: ${forms.length}`);
  console.error(`  目标名称: ${appName}`);

  // Step 2: 读取登录态
  console.error("\n🔑 Step 2: 读取登录态");
  let cookieData = loadCookieData();
  if (!cookieData) {
    console.error("  ⚠️  未找到本地登录态，触发登录...");
    cookieData = triggerLogin();
  }
  const authRef = {
    cookieData,
    csrfToken: cookieData.csrf_token,
    cookies: cookieData.cookies,
    baseUrl: resolveBaseUrl(cookieData),
  };
  const corpId = resolveCorpId(cookieData);
  console.error(`  ✅ 登录态已就绪（${authRef.baseUrl}）`);
  if (corpId) {
    console.error(`  corpId: ${corpId}`);
  } else {
    console.error("  ⚠️  未能获取 corpId，SerialNumberField formula 可能无法正常工作");
  }

  // Step 3: 创建新应用
  console.error("\n🏗️  Step 3: 创建目标应用");
  console.error(`  应用名称: ${appName}`);
  const newAppType = await createApp(authRef, appName);
  console.error(`  ✅ 应用创建成功: ${newAppType}`);
  console.error(`  访问地址: ${authRef.baseUrl}/${newAppType}/admin`);

  // Step 4: 逐个重建表单
  console.error("\n📋 Step 4: 重建表单页面");
  const formMappings = [];

  for (let i = 0; i < forms.length; i++) {
    const sourceForm = forms[i];
    const { formUuid: sourceFormUuid, formTitle, schema: sourceSchema } = sourceForm;
    console.error(`\n  [${i + 1}/${forms.length}] 重建: ${formTitle} (${sourceFormUuid})`);

    let targetFormUuid = null;
    let status = "success";
    let errorMessage = null;

    try {
      // 4.1 创建空白表单
      console.error("    → 创建空白表单...");
      targetFormUuid = await createBlankForm(authRef, newAppType, formTitle);
      console.error(`    ✅ 空白表单已创建: ${targetFormUuid}`);

      // 4.2 适配 Schema（替换 SerialNumberField formula 等）
      console.error("    → 适配 Schema...");
      const adaptedSchema = adaptSchemaForTarget(
        sourceSchema,
        newAppType,
        targetFormUuid,
        corpId
      );

      // 4.3 保存 Schema
      console.error("    → 保存 Schema...");
      await saveFormSchema(authRef, newAppType, targetFormUuid, adaptedSchema);
      console.error("    ✅ Schema 保存成功");

      // 4.4 更新表单配置
      console.error("    → 更新表单配置...");
      await updateFormConfig(authRef, newAppType, targetFormUuid);
      console.error("    ✅ 表单配置已更新");
    } catch (err) {
      status = "failed";
      errorMessage = err.message;
      console.error(`    ❌ 重建失败: ${err.message}`);
    }

    formMappings.push({
      sourceFormUuid,
      targetFormUuid,
      formTitle,
      status,
      ...(errorMessage ? { error: errorMessage } : {}),
    });
  }

  // Step 5: 生成迁移报告
  console.error("\n📊 Step 5: 生成迁移报告");
  const successCount = formMappings.filter((m) => m.status === "success").length;
  const failedCount = formMappings.filter((m) => m.status === "failed").length;

  const migrationReport = {
    migratedAt: new Date().toISOString(),
    sourceAppType,
    sourceBaseUrl,
    targetAppType: newAppType,
    targetBaseUrl: authRef.baseUrl,
    appName,
    summary: {
      totalForms: forms.length,
      successCount,
      failedCount,
    },
    formMapping: formMappings,
    notes: [
      "关联表单（associationFormField）的跨表单引用在迁移后需要手动更新",
      "请参考 formMapping 中的新旧 formUuid 对应关系进行更新",
      "流水号字段（SerialNumberField）的 formula 已自动适配新应用",
    ],
  };

  const reportFile = path.join(process.cwd(), "yida-migration-report.json");
  fs.writeFileSync(reportFile, JSON.stringify(migrationReport, null, 2), "utf-8");

  // 输出结果
  console.error("\n" + "=".repeat(50));
  console.error("  ✅ 迁移完成！");
  console.error(`  源应用:   ${sourceAppType}`);
  console.error(`  目标应用: ${newAppType}`);
  console.error(`  成功表单: ${successCount} / ${forms.length}`);
  if (failedCount > 0) {
    console.error(`  失败表单: ${failedCount}`);
  }
  console.error(`  迁移报告: ${reportFile}`);
  console.error(`  目标应用地址: ${authRef.baseUrl}/${newAppType}/admin`);
  console.error("=".repeat(50));

  if (failedCount > 0) {
    console.error("\n⚠️  部分表单迁移失败，详情请查看迁移报告");
  }

  console.error("\n📌 后续操作提示：");
  console.error("  1. 如有关联表单字段（associationFormField），请根据迁移报告手动更新关联目标");
  console.error("  2. 如有自定义页面，请使用 openyida publish 重新发布到新应用");
  console.error(`  3. 新应用访问地址: ${authRef.baseUrl}/${newAppType}/admin`);

  console.log(
    JSON.stringify({
      success: true,
      sourceAppType,
      targetAppType: newAppType,
      totalForms: forms.length,
      successCount,
      failedCount,
      reportFile,
      targetUrl: `${authRef.baseUrl}/${newAppType}/admin`,
    })
  );
}

main().catch((err) => {
  console.error(`\n❌ 导入异常: ${err.message}`);
  process.exit(1);
});
