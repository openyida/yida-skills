#!/usr/bin/env node
/**
 * export.js - 宜搭应用导出工具
 *
 * 将宜搭应用的所有表单 Schema 和自定义页面导出为可移植的迁移包（JSON 文件），
 * 供 yida-import 在目标环境重建应用使用。
 *
 * 用法：
 *   node export.js <appType> [outputFile]
 *
 * 参数：
 *   appType    - 应用 ID（必填），如 APP_XXX
 *   outputFile - 导出文件路径（可选，默认 ./yida-export.json）
 *
 * 示例：
 *   node skills/yida-export/scripts/export.js APP_XXX
 *   node skills/yida-export/scripts/export.js APP_XXX ./backup.json
 *
 * 导出格式：
 *   {
 *     "version": "1.1",
 *     "exportedAt": "ISO 时间戳",
 *     "sourceAppType": "APP_XXX",
 *     "sourceBaseUrl": "https://www.aliwork.com",
 *     "forms": [
 *       {
 *         "formUuid": "FORM-XXX",
 *         "formTitle": "表单名称",
 *         "formType": "receipt",
 *         "schema": { ... }
 *       }
 *     ],
 *     "customPages": [
 *       {
 *         "formUuid": "FORM-YYY",
 *         "pageTitle": "页面名称",
 *         "pageType": "custom",
 *         "sourceCode": "// 源码...",
 *         "compiledCode": "// 编译后代码...",
 *         "schema": { ... }
 *       }
 *     ]
 *   }
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
    console.error("用法: node export.js <appType> [outputFile]");
    console.error("示例: node skills/yida-export/scripts/export.js APP_XXX");
    console.error("      node skills/yida-export/scripts/export.js APP_XXX ./backup.json");
    process.exit(1);
  }
  return {
    appType: args[0],
    outputFile: args[1] || path.join(process.cwd(), "yida-export.json"),
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
 * 获取应用下所有表单列表
 * 返回 [{ formUuid, name, formType }]
 */
async function fetchFormList(authRef, appType) {
  const result = await requestWithAutoLogin(
    (auth) =>
      sendGetRequest(
        auth.baseUrl,
        auth.cookies,
        `/dingtalk/web/${appType}/v1/form/getForms.json`,
        {}
      ),
    authRef
  );

  if (!result || result.success === false) {
    throw new Error(`获取表单列表失败: ${result ? result.errorMsg : "请求失败"}`);
  }

  // 兼容两种响应结构
  const formList = result.content || result.result || result.data || result;
  if (!Array.isArray(formList)) {
    throw new Error(`表单列表格式异常: ${JSON.stringify(formList).substring(0, 200)}`);
  }
  return formList;
}

/**
 * 获取单个表单的完整 Schema
 */
async function fetchFormSchema(authRef, appType, formUuid) {
  const result = await requestWithAutoLogin(
    (auth) =>
      sendGetRequest(
        auth.baseUrl,
        auth.cookies,
        `/alibaba/web/${appType}/_view/query/formdesign/getFormSchema.json`,
        { formUuid, schemaVersion: "V5" }
      ),
    authRef
  );

  if (!result || result.success === false) {
    throw new Error(`获取 Schema 失败: ${result ? result.errorMsg : "请求失败"}`);
  }

  // 提取 schema 内容
  if (result.content) {
    return typeof result.content === "string" ? JSON.parse(result.content) : result.content;
  }
  if (result.pages) {
    return result;
  }
  throw new Error(`无法从响应中提取 Schema: ${JSON.stringify(Object.keys(result))}`);
}

/**
 * 从 Schema 中提取表单标题
 */
function extractFormTitle(schema) {
  try {
    const page = schema.pages && schema.pages[0];
    if (!page) return "未知表单";
    const tree = page.componentsTree && page.componentsTree[0];
    if (!tree) return "未知表单";
    const titleObj = tree.props && tree.props.title;
    if (!titleObj) return "未知表单";
    if (typeof titleObj === "string") return titleObj;
    return titleObj.zh_CN || titleObj.en_US || "未知表单";
  } catch {
    return "未知表单";
  }
}

/**
 * 从 Schema 中提取自定义页面源码和编译后代码
 */
function extractPageSourceCode(schema) {
  try {
    const actions = schema.actions;
    if (!actions || !actions.module) {
      return { sourceCode: null, compiledCode: null };
    }
    return {
      sourceCode: actions.module.source || null,
      compiledCode: actions.module.compiled || null,
    };
  } catch {
    return { sourceCode: null, compiledCode: null };
  }
}

/**
 * 判断表单是否为自定义页面
 * 自定义页面的 formType 通常为 "custom" 或包含特定的 schema 结构
 */
function isCustomPage(form, schema) {
  // 方式1: 通过 formType 判断
  if (form.formType === "custom" || form.formType === "CustomPage") {
    return true;
  }
  // 方式2: 通过 schema 结构判断（自定义页面有 actions.module）
  if (schema && schema.actions && schema.actions.module) {
    return true;
  }
  // 方式3: 通过页面名称判断（自定义页面通常有特定命名）
  const name = form.name || form.formName || "";
  if (name.includes("自定义页面") || name.includes("CustomPage")) {
    return true;
  }
  return false;
}

/**
 * 获取页面配置（公开访问、分享 URL 等）
 */
function extractPageConfig(schema) {
  try {
    const config = {
      isPublic: false,
      shareUrl: null,
      navigation: null,
    };
    
    // 从 schema.config 中提取配置
    if (schema.config) {
      config.isPublic = schema.config.isPublic || false;
      config.shareUrl = schema.config.shareUrl || null;
      config.navigation = schema.config.navigation || null;
    }
    
    return config;
  } catch {
    return { isPublic: false, shareUrl: null, navigation: null };
  }
}

// ── 主流程 ────────────────────────────────────────────

async function main() {
  const { appType, outputFile } = parseArgs();

  console.error("=".repeat(50));
  console.error("  yida-export - 宜搭应用导出工具");
  console.error("=".repeat(50));
  console.error(`\n  应用 ID:  ${appType}`);
  console.error(`  输出文件: ${outputFile}`);

  // Step 1: 读取登录态
  console.error("\n🔑 Step 1: 读取登录态");
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
  console.error(`  ✅ 登录态已就绪（${authRef.baseUrl}）`);

  // Step 2: 获取表单列表
  console.error("\n📋 Step 2: 获取应用表单列表");
  const formList = await fetchFormList(authRef, appType);
  console.error(`  ✅ 共找到 ${formList.length} 个表单/页面`);
  formList.forEach((form, index) => {
    console.error(`     ${index + 1}. ${form.name || form.formName || form.formUuid} (${form.formUuid})`);
  });

  // Step 3: 逐个导出表单 Schema
  console.error("\n📦 Step 3: 导出表单和自定义页面");
  const exportedForms = [];
  const exportedCustomPages = [];
  
  for (let i = 0; i < formList.length; i++) {
    const form = formList[i];
    const formUuid = form.formUuid;
    const formName = form.name || form.formName || formUuid;
    console.error(`\n  [${i + 1}/${formList.length}] 导出: ${formName} (${formUuid})`);

    try {
      const schema = await fetchFormSchema(authRef, appType, formUuid);
      const formTitle = extractFormTitle(schema);
      
      // 判断是否为自定义页面
      if (isCustomPage(form, schema)) {
        console.error(`  📄 检测到自定义页面`);
        const { sourceCode, compiledCode } = extractPageSourceCode(schema);
        const pageConfig = extractPageConfig(schema);
        
        exportedCustomPages.push({
          formUuid,
          pageTitle: formTitle,
          pageType: "custom",
          sourceCode,
          compiledCode,
          schema,
          pageConfig,
        });
        console.error(`  ✅ 导出自定义页面成功: ${formTitle}`);
      } else {
        exportedForms.push({
          formUuid,
          formTitle,
          formType: form.formType || "receipt",
          schema,
        });
        console.error(`  ✅ 导出表单成功: ${formTitle}`);
      }
    } catch (err) {
      console.error(`  ⚠️  导出失败: ${err.message}，跳过此表单`);
    }
  }

  // Step 4: 写入导出文件
  console.error("\n💾 Step 4: 写入导出文件");
  const exportPackage = {
    version: "1.1",
    exportedAt: new Date().toISOString(),
    sourceAppType: appType,
    sourceBaseUrl: authRef.baseUrl,
    forms: exportedForms,
    customPages: exportedCustomPages,
  };

  const outputDir = path.dirname(outputFile);
  if (!fs.existsSync(outputDir)) {
    fs.mkdirSync(outputDir, { recursive: true });
  }
  fs.writeFileSync(outputFile, JSON.stringify(exportPackage, null, 2), "utf-8");

  // 输出结果
  console.error("\n" + "=".repeat(50));
  console.error("  ✅ 导出完成！");
  console.error(`  导出表单数:     ${exportedForms.length} / ${formList.length}`);
  console.error(`  导出自定义页面: ${exportedCustomPages.length} / ${formList.length}`);
  console.error(`  输出文件:       ${outputFile}`);
  console.error("=".repeat(50));

  console.log(
    JSON.stringify({
      success: true,
      appType,
      formCount: exportedForms.length,
      customPageCount: exportedCustomPages.length,
      outputFile,
    })
  );
}

main().catch((err) => {
  console.error(`\n❌ 导出异常: ${err.message}`);
  process.exit(1);
});
