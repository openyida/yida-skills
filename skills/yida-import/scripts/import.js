#!/usr/bin/env node
/**
 * import.js - 宜搭应用导入工具
 *
 * 将 yida-export 导出的应用迁移包导入到目标宜搭环境，
 * 自动重建应用、所有表单页面和自定义页面，并输出迁移报告。
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
 *   4. 逐个重建自定义页面（创建页面 → 发布源码 → 更新配置）
 *   5. 输出迁移报告（新旧 formUuid 映射）
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
        headers: {
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
          if (isLoginExpired(parsed)) {
            resolve({ __needLogin: true });
            return;
          }
          if (isCsrfTokenExpired(parsed)) {
            resolve({ __csrfExpired: true });
            return;
          }
          resolve(parsed);
        });
      }
    );
    req.on("timeout", () => { req.destroy(); reject(new Error("请求超时")); });
    req.on("error", reject);
    req.end();
  });
}

function sendPostRequest(baseUrl, cookies, requestPath, postData, contentType = "application/x-www-form-urlencoded") {
  return new Promise((resolve, reject) => {
    const cookieHeader = buildCookieHeader(cookies);
    const parsedUrl = new URL(baseUrl);
    const isHttps = parsedUrl.protocol === "https:";
    const requestModule = isHttps ? https : http;

    const bodyData = contentType === "application/json"
      ? JSON.stringify(postData)
      : querystring.stringify(postData);

    const req = requestModule.request(
      {
        hostname: parsedUrl.hostname,
        port: parsedUrl.port || (isHttps ? 443 : 80),
        path: requestPath,
        method: "POST",
        headers: {
          "Content-Type": contentType,
          "Content-Length": Buffer.byteLength(bodyData),
          Origin: baseUrl,
          Referer: baseUrl + "/",
          Cookie: cookieHeader,
        },
        timeout: 60000,
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
          if (isLoginExpired(parsed)) {
            resolve({ __needLogin: true });
            return;
          }
          if (isCsrfTokenExpired(parsed)) {
            resolve({ __csrfExpired: true });
            return;
          }
          resolve(parsed);
        });
      }
    );
    req.on("timeout", () => { req.destroy(); reject(new Error("请求超时")); });
    req.on("error", reject);
    req.write(bodyData);
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

// ── 宜搭 API 调用 ─────────────────────────────────────

/**
 * 创建新应用
 * 返回 { appType, appName }
 */
async function createApp(authRef, appName, corpId) {
  const result = await requestWithAutoLogin(
    (auth) =>
      sendPostRequest(
        auth.baseUrl,
        auth.cookies,
        `/dingtalk/web/${corpId}/v1/app/registerApp.json`,
        {
          _csrf_token: auth.csrfToken,
          name: appName,
          desc: `从迁移包导入: ${appName}`,
          icon: "https://img.alicdn.com/tfs/TB1nqEhRVXXXXXPaXXXXXXXXXXX-72-72.png",
        }
      ),
    authRef
  );

  if (!result || result.success === false) {
    throw new Error(`创建应用失败: ${result ? result.errorMsg : "请求失败"}`);
  }

  const appType = result.content?.appType || result.result?.appType || result.appType;
  if (!appType) {
    throw new Error(`创建应用成功但未返回 appType: ${JSON.stringify(result)}`);
  }
  return { appType, appName };
}

/**
 * 创建空白表单页面
 * 返回 { formUuid, formType }
 */
async function createFormPage(authRef, appType, formTitle, formType) {
  const result = await requestWithAutoLogin(
    (auth) =>
      sendPostRequest(
        auth.baseUrl,
        auth.cookies,
        `/alibaba/web/${appType}/_view/query/formdesign/saveFormSchemaInfo.json`,
        {
          _csrf_token: auth.csrfToken,
          name: formTitle,
          formType: formType || "receipt",
        }
      ),
    authRef
  );

  if (!result || result.success === false) {
    throw new Error(`创建表单失败: ${result ? result.errorMsg : "请求失败"}`);
  }

  const formUuid = result.content?.formUuid || result.result?.formUuid || result.formUuid;
  if (!formUuid) {
    throw new Error(`创建表单成功但未返回 formUuid: ${JSON.stringify(result)}`);
  }
  return { formUuid, formType };
}

/**
 * 保存表单 Schema
 */
async function saveFormSchema(authRef, appType, formUuid, schemaContent) {
  const result = await requestWithAutoLogin(
    (auth) =>
      sendPostRequest(
        auth.baseUrl,
        auth.cookies,
        `/alibaba/web/${appType}/_view/query/formdesign/saveFormSchema.json`,
        {
          _csrf_token: auth.csrfToken,
          prefix: "_view",
          content: typeof schemaContent === "string" ? schemaContent : JSON.stringify(schemaContent),
          formUuid: formUuid,
          schemaVersion: "V5",
          domainCode: "yida",
          importSchema: true,
        }
      ),
    authRef
  );

  if (!result || result.success === false) {
    throw new Error(`保存 Schema 失败: ${result ? result.errorMsg : "请求失败"}`);
  }

  return result.content || result.result || result;
}

/**
 * 更新表单配置
 */
async function updateFormConfig(authRef, appType, formUuid, version, configType, value) {
  const result = await requestWithAutoLogin(
    (auth) =>
      sendPostRequest(
        auth.baseUrl,
        auth.cookies,
        `/dingtalk/web/${appType}/query/formdesign/updateFormConfig.json`,
        {
          _csrf_token: auth.csrfToken,
          formUuid: formUuid,
          version: version || 0,
          configType: configType,
          value: value,
        }
      ),
    authRef
  );

  if (!result || result.success === false) {
    throw new Error(`更新配置失败: ${result ? result.errorMsg : "请求失败"}`);
  }

  return result;
}

/**
 * 适配表单 Schema（替换 appType、流水号 formula 等）
 */
function adaptFormSchema(schema, newAppType, formUuidMapping) {
  const schemaStr = JSON.stringify(schema);
  let adaptedStr = schemaStr;

  // 替换 appType（在流水号 formula 中）
  // 匹配模式：APP_旧appType → APP_新appType
  const appTypePattern = /APP_[A-Z0-9]+/g;
  adaptedStr = adaptedStr.replace(appTypePattern, newAppType);

  // 替换 formUuid（如果有映射）
  if (formUuidMapping && Object.keys(formUuidMapping).length > 0) {
    for (const [oldUuid, newUuid] of Object.entries(formUuidMapping)) {
      adaptedStr = adaptedStr.split(oldUuid).join(newUuid);
    }
  }

  return JSON.parse(adaptedStr);
}

/**
 * 适配自定义页面源码（替换 formUuid、fieldId）
 */
function adaptPageSourceCode(sourceCode, formUuidMapping, fieldIdMapping) {
  if (!sourceCode) return sourceCode;

  let adaptedCode = sourceCode;

  // 替换 formUuid
  if (formUuidMapping) {
    for (const [oldUuid, newUuid] of Object.entries(formUuidMapping)) {
      adaptedCode = adaptedCode.split(oldUuid).join(newUuid);
    }
  }

  // 替换 fieldId
  if (fieldIdMapping) {
    for (const [oldId, newId] of Object.entries(fieldIdMapping)) {
      adaptedCode = adaptedCode.split(oldId).join(newId);
    }
  }

  return adaptedCode;
}

/**
 * 发布自定义页面
 * 复用 yida-publish-page 的逻辑
 */
async function publishCustomPage(authRef, appType, formUuid, sourceCode, compiledCode, schema) {
  // 构建包含源码的 Schema
  const adaptedSchema = { ...schema };
  
  // 确保 actions.module 包含源码和编译后代码
  if (!adaptedSchema.actions) {
    adaptedSchema.actions = { module: {}, type: "FUNCTION", list: [] };
  }
  if (!adaptedSchema.actions.module) {
    adaptedSchema.actions.module = {};
  }
  
  if (sourceCode) {
    adaptedSchema.actions.module.source = sourceCode;
  }
  if (compiledCode) {
    adaptedSchema.actions.module.compiled = compiledCode;
  }

  // 保存 Schema
  const saveResult = await saveFormSchema(authRef, appType, formUuid, adaptedSchema);
  
  // 更新配置（MINI_RESOURCE = 8 表示自定义页面）
  await updateFormConfig(authRef, appType, formUuid, saveResult.version || 0, "MINI_RESOURCE", 8);

  return saveResult;
}

// ── 主流程 ────────────────────────────────────────────

async function main() {
  const { exportFile, appName } = parseArgs();

  console.error("=".repeat(50));
  console.error("  yida-import - 宜搭应用导入工具");
  console.error("=".repeat(50));
  console.error(`\n  导出文件: ${exportFile}`);
  console.error(`  应用名称: ${appName || "（使用源应用 ID）"}`);

  // Step 1: 读取导出包
  console.error("\n📂 Step 1: 读取导出包");
  if (!fs.existsSync(exportFile)) {
    console.error(`  ❌ 导出文件不存在: ${exportFile}`);
    process.exit(1);
  }

  const exportPackage = JSON.parse(fs.readFileSync(exportFile, "utf-8"));
  const { version, sourceAppType, forms, customPages } = exportPackage;

  console.error(`  版本:       ${version}`);
  console.error(`  源应用 ID:  ${sourceAppType}`);
  console.error(`  表单数量:   ${forms ? forms.length : 0}`);
  console.error(`  自定义页面: ${customPages ? customPages.length : 0}`);

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
  console.error(`  当前组织: ${corpId}`);

  // Step 3: 创建新应用
  console.error("\n🏗️  Step 3: 创建新应用");
  const targetAppName = appName || sourceAppType;
  const { appType: targetAppType } = await createApp(authRef, targetAppName, corpId);
  console.error(`  ✅ 新应用已创建: ${targetAppType} (${targetAppName})`);

  // 迁移映射表
  const formUuidMapping = {}; // 旧 formUuid → 新 formUuid
  const fieldIdMapping = {};  // 旧 fieldId → 新 fieldId
  const formMapping = [];     // 迁移报告
  const pageMapping = [];     // 页面迁移报告

  // Step 4: 逐个重建表单
  if (forms && forms.length > 0) {
    console.error("\n📋 Step 4: 重建表单页面");
    
    for (let i = 0; i < forms.length; i++) {
      const form = forms[i];
      const { formUuid: sourceFormUuid, formTitle, formType, schema } = form;
      
      console.error(`\n  [${i + 1}/${forms.length}] 重建: ${formTitle} (${sourceFormUuid})`);

      try {
        // 4.1 创建空白表单
        console.error("  → 创建空白表单...");
        const { formUuid: targetFormUuid } = await createFormPage(authRef, targetAppType, formTitle, formType);
        console.error(`  → 新 formUuid: ${targetFormUuid}`);

        // 4.2 适配 Schema
        console.error("  → 适配 Schema...");
        const adaptedSchema = adaptFormSchema(schema, targetAppType, formUuidMapping);

        // 4.3 保存 Schema
        console.error("  → 保存 Schema...");
        await saveFormSchema(authRef, targetAppType, targetFormUuid, adaptedSchema);

        // 4.4 更新配置
        console.error("  → 更新配置...");
        await updateFormConfig(authRef, targetAppType, targetFormUuid, 0, "MINI_RESOURCE", 0);

        // 记录映射
        formUuidMapping[sourceFormUuid] = targetFormUuid;
        formMapping.push({
          sourceFormUuid,
          targetFormUuid,
          formTitle,
          status: "success",
        });

        console.error(`  ✅ 表单重建成功: ${formTitle}`);
      } catch (err) {
        console.error(`  ⚠️  表单重建失败: ${err.message}`);
        formMapping.push({
          sourceFormUuid,
          targetFormUuid: null,
          formTitle,
          status: "failed",
          error: err.message,
        });
      }
    }
  }

  // Step 5: 逐个重建自定义页面
  if (customPages && customPages.length > 0) {
    console.error("\n📄 Step 5: 重建自定义页面");
    
    for (let i = 0; i < customPages.length; i++) {
      const page = customPages[i];
      const { formUuid: sourceFormUuid, pageTitle, sourceCode, compiledCode, schema } = page;
      
      console.error(`\n  [${i + 1}/${customPages.length}] 重建: ${pageTitle} (${sourceFormUuid})`);

      try {
        // 5.1 创建空白自定义页面
        console.error("  → 创建空白页面...");
        const { formUuid: targetFormUuid } = await createFormPage(authRef, targetAppType, pageTitle, "custom");
        console.error(`  → 新 formUuid: ${targetFormUuid}`);

        // 5.2 适配源码（替换 formUuid、fieldId）
        console.error("  → 适配源码...");
        const adaptedSourceCode = adaptPageSourceCode(sourceCode, formUuidMapping, fieldIdMapping);
        const adaptedCompiledCode = adaptPageSourceCode(compiledCode, formUuidMapping, fieldIdMapping);

        // 5.3 发布页面
        console.error("  → 发布页面...");
        await publishCustomPage(authRef, targetAppType, targetFormUuid, adaptedSourceCode, adaptedCompiledCode, schema);

        // 记录映射
        formUuidMapping[sourceFormUuid] = targetFormUuid;
        pageMapping.push({
          sourceFormUuid,
          targetFormUuid,
          pageTitle,
          status: "success",
        });

        console.error(`  ✅ 页面重建成功: ${pageTitle}`);
      } catch (err) {
        console.error(`  ⚠️  页面重建失败: ${err.message}`);
        pageMapping.push({
          sourceFormUuid,
          targetFormUuid: null,
          pageTitle,
          status: "failed",
          error: err.message,
        });
      }
    }
  }

  // Step 6: 输出迁移报告
  console.error("\n📊 Step 6: 输出迁移报告");
  const report = {
    migratedAt: new Date().toISOString(),
    sourceAppType,
    targetAppType,
    targetAppName,
    formMapping,
    pageMapping,
    formUuidMapping,
  };

  const reportFile = path.join(process.cwd(), "yida-migration-report.json");
  fs.writeFileSync(reportFile, JSON.stringify(report, null, 2), "utf-8");

  // 输出结果
  console.error("\n" + "=".repeat(50));
  console.error("  ✅ 导入完成！");
  console.error(`  表单迁移:     ${formMapping.filter(f => f.status === "success").length} / ${formMapping.length}`);
  console.error(`  页面迁移:     ${pageMapping.filter(p => p.status === "success").length} / ${pageMapping.length}`);
  console.error(`  目标应用:     ${targetAppType} (${targetAppName})`);
  console.error(`  迁移报告:     ${reportFile}`);
  console.error("=".repeat(50));

  console.log(
    JSON.stringify({
      success: true,
      sourceAppType,
      targetAppType,
      targetAppName,
      formCount: formMapping.filter(f => f.status === "success").length,
      pageCount: pageMapping.filter(p => p.status === "success").length,
      reportFile,
    })
  );
}

main().catch((err) => {
  console.error(`\n❌ 导入异常: ${err.message}`);
  process.exit(1);
});
