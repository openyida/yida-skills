#!/usr/bin/env node
/**
 * get-schema.js - 宜搭表单 Schema 获取工具
 *
 * 用法：
 *   node get-schema.js <appType> <formUuid>
 *
 * 参数：
 *   appType  - 应用 ID（必填），如 APP_XXX
 *   formUuid - 表单 UUID（必填），如 FORM-XXX
 *
 * 前置条件：
 *   项目根目录下需存在 .cache/cookies.json（由 yida-login 生成）。
 *   若接口返回 302（登录失效），脚本会自动调用 login.py 重新登录后重试。
 *
 * 示例：
 *   node .claude/skills/yida-get-schema/scripts/get-schema.js "APP_XXX" "FORM-XXX"
 *
 * 输出：
 *   - 日志输出到 stderr
 *   - Schema JSON 输出到 stdout
 *
 * 流程：
 * 1. 从 .cache/cookies.json 读取登录态（cookies + base_url）
 * 2. 调用 getFormSchema 接口获取表单 Schema
 * 3. 若接口返回 302，自动调用 login.py 重新登录后重试
 * 4. 输出 Schema 到 stdout
 */

const https = require("https");
const http = require("http");
const fs = require("fs");
const path = require("path");
const querystring = require("querystring");

const {
  findProjectRoot,
  PROJECT_ROOT,
  DEFAULT_BASE_URL,
  COOKIE_FILE,
  extractInfoFromCookies,
  loadCookieData,
  resolveBaseUrl,
  isLoginExpired,
  isCsrfTokenExpired,
  triggerLogin,
  refreshCsrfToken,
} = require("../../shared/scripts/yida-utils");

// ── 参数解析 ─────────────────────────────────────────

function parseArgs() {
  const args = process.argv.slice(2);
  if (args.length < 2) {
    console.error("用法: node get-schema.js <appType> <formUuid>");
    console.error('示例：node .claude/skills/yida-get-schema/scripts/get-schema.js "APP_XXX" "FORM-XXX"');
    process.exit(1);
  }
  return {
    appType: args[0],
    formUuid: args[1],
  };
}

// ── 发送 GET 请求（支持 302 自动重登录） ─────────────

function sendGetRequest(baseUrl, cookies, requestPath, queryParams) {
  return new Promise((resolve, reject) => {
    const queryString = querystring.stringify(queryParams);
    const fullPath = `${requestPath}?${queryString}`;

    const cookieHeader = cookies
      .map((cookie) => `${cookie.name}=${cookie.value}`)
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

    request.end();
  });
}

// ── 主流程 ────────────────────────────────────────────

async function main() {
  const { appType, formUuid } = parseArgs();

  console.error("=".repeat(50));
  console.error("  get-schema - 宜搭表单 Schema 获取工具");
  console.error("=".repeat(50));
  console.error(`\n  应用 ID:    ${appType}`);
  console.error(`  表单 UUID:  ${formUuid}`);

  // Step 1: 读取本地登录态
  console.error("\n🔑 Step 1: 读取登录态");
  let cookieData = loadCookieData();
  if (!cookieData) {
    console.error("  ⚠️  未找到本地登录态，触发登录...");
    cookieData = triggerLogin();
  }
  let { cookies } = cookieData;
  let baseUrl = resolveBaseUrl(cookieData);
  console.error(`  ✅ 登录态已就绪（${baseUrl}）`);

  // Step 2: 获取表单 Schema（307 时刷新 csrf_token，302 时自动重登录，均自动重试）
  console.error("\n📄 Step 2: 获取表单 Schema");
  console.error("  发送 getFormSchema 请求...");
  let { csrf_token: csrfToken } = cookieData;
  let result = await sendGetRequest(
    baseUrl,
    cookies,
    `/alibaba/web/${appType}/_view/query/formdesign/getFormSchema.json`,
    { formUuid, schemaVersion: "V5" }
  );

  if (result && result.__csrfExpired) {
    cookieData = refreshCsrfToken();
    csrfToken = cookieData.csrf_token;
    cookies = cookieData.cookies;
    baseUrl = resolveBaseUrl(cookieData);
    console.error("  🔄 重新发送 getFormSchema 请求（csrf_token 已刷新）...");
    result = await sendGetRequest(
      baseUrl,
      cookies,
      `/alibaba/web/${appType}/_view/query/formdesign/getFormSchema.json`,
      { formUuid, schemaVersion: "V5" }
    );
  }

  if (result && result.__needLogin) {
    cookieData = triggerLogin();
    csrfToken = cookieData.csrf_token;
    cookies = cookieData.cookies;
    baseUrl = resolveBaseUrl(cookieData);
    console.error("  🔄 重新发送 getFormSchema 请求...");
    result = await sendGetRequest(
      baseUrl,
      cookies,
      `/alibaba/web/${appType}/_view/query/formdesign/getFormSchema.json`,
      { formUuid, schemaVersion: "V5" }
    );
  }

  // 输出结果
  console.error("\n" + "=".repeat(50));
  if (result && result.success !== false && !result.__needLogin && !result.__csrfExpired) {
    console.error("  ✅ Schema 获取成功！");
    console.error("=".repeat(50));
    console.log(JSON.stringify(result, null, 2));
  } else {
    const errorMsg = result ? result.errorMsg || "未知错误" : "请求失败";
    console.error(`  ❌ 获取 Schema 失败: ${errorMsg}`);
    if (result && !result.__needLogin && !result.__csrfExpired) {
      console.error(`  响应详情: ${JSON.stringify(result, null, 2)}`);
    }
    console.error("=".repeat(50));
    process.exit(1);
  }
}

main().catch((error) => {
  console.error(`\n❌ 获取异常: ${error.message}`);
  process.exit(1);
});
