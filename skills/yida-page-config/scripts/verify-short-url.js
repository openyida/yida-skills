#!/usr/bin/env node
/**
 * verify-short-url.js - 宜搭公开访问 URL 验证工具
 *
 * 用法：
 *   node verify-short-url.js <appType> <formUuid> <openUrl>
 *
 * 参数：
 *   appType  - 应用 ID（必填），如 APP_XXX
 *   formUuid - 表单 UUID（必填），如 FORM-XXX
 *   openUrl  - 公开访问路径（必填），如 /o/xxx
 *
 * openUrl 格式要求：
 *   - 必须以 /o/ 开头
 *   - 只支持英文、数字、- 和 _
 *
 * 前置条件：
 *   项目根目录下需存在 .cache/cookies.json（由 yida-login 生成）。
 *   若接口返回 302（登录失效），脚本会自动调用 login.py 重新登录后重试。
 *
 * 示例：
 *   node .claude/skills/yida-verify-short-url/scripts/verify-short-url.js "APP_DQQJJMROOIPJ6BU7K055" "FORM-24122912EFBC4CFB826D63E7788F30C8FP6V" "/o/aaa"
 *
 * 输出：
 *   - 日志输出到 stderr
 *   - 验证结果 JSON 输出到 stdout
 *
 * 流程：
 * 1. 验证 openUrl 格式
 * 2. 从 .cache/cookies.json 读取登录态（cookies + base_url）
 * 3. 调用 verifyShortUrl 接口验证 URL 是否可用
 * 4. 若接口返回 302，自动调用 login.py 重新登录后重试
 * 5. 输出验证结果到 stdout
 */

const https = require("https");
const http = require("http");
const fs = require("fs");
const path = require("path");
const querystring = require("querystring");
const { execSync } = require("child_process");

// ── 配置读取 ──────────────────────────────────────────
const CONFIG_PATH = path.resolve(findProjectRoot(), "config.json");

/**
 * 查找项目根目录（通过向上查找 README.md 或 .git 目录）
 * @returns {string} 项目根目录路径
 */
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

// 支持 .claude/skills/ 和 skills/ 两种目录结构
function findLoginScript() {
  const candidates = [
    path.join(PROJECT_ROOT, ".claude", "skills", "yida-login", "scripts", "login.py"),
    path.join(PROJECT_ROOT, "skills", "yida-login", "scripts", "login.py"),
  ];
  for (const candidate of candidates) {
    if (fs.existsSync(candidate)) {
      return candidate;
    }
  }
  return candidates[0];
}
const LOGIN_SCRIPT = findLoginScript();

// ── 参数解析 ─────────────────────────────────────────

function parseArgs() {
  const args = process.argv.slice(2);
  if (args.length < 3) {
    console.error("用法: node verify-short-url.js <appType> <formUuid> <url>");
    console.error("示例: node .claude/skills/yida-verify-short-url/scripts/verify-short-url.js \"APP_XXX\" \"FORM-XXX\" \"/o/aaa\"");
    console.error("  支持两种格式：");
    console.error("    /o/xxx - 公开访问（对外）");
    console.error("    /s/xxx - 组织内分享（对内）");
    process.exit(1);
  }
  const url = args[2];
  const urlType = url.startsWith("/o/") ? "open" : url.startsWith("/s/") ? "share" : null;
  return {
    appType: args[0],
    formUuid: args[1],
    url: url,
    urlType: urlType,
  };
}

// ── 参数解析 ─────────────────────────────────────────

function parseArgs() {
  const args = process.argv.slice(2);
  if (args.length < 3) {
    console.error("用法: node verify-short-url.js <appType> <formUuid> <url>");
    console.error("示例: node .claude/skills/yida-verify-short-url/scripts/verify-short-url.js \"APP_XXX\" \"FORM-XXX\" \"/o/aaa\"");
    console.error("  支持两种格式：");
    console.error("    /o/xxx - 公开访问（对外）");
    console.error("    /s/xxx - 组织内分享（对内）");
    process.exit(1);
  }
  const url = args[2];
  const urlType = url.startsWith("/o/") ? "open" : url.startsWith("/s/") ? "share" : null;
  return {
    appType: args[0],
    formUuid: args[1],
    url: url,
    urlType: urlType,
  };
}

/**
 * 验证 URL 格式
 * - /o/xxx - 公开访问（对外）
 * - /s/xxx - 组织内分享（对内）
 */
function validateUrl(url, urlType) {
  if (!urlType) {
    throw new Error(`URL 必须以 /o/ 或 /s/ 开头，当前值: ${url}`);
  }
  const pathPart = url.slice(3);
  if (!/^[a-zA-Z0-9_-]+$/.test(pathPart)) {
    throw new Error(`URL 路径部分只支持 a-z A-Z 0-9 _ -，当前值: ${url}`);
  }
  if (pathPart.length === 0) {
    throw new Error(`URL 路径部分不能为空: ${url}`);
  }
  return true;
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
  if (!fs.existsSync(COOKIE_FILE)) {
    return null;
  }
  try {
    const raw = fs.readFileSync(COOKIE_FILE, "utf-8").trim();
    if (!raw) return null;
    const parsed = JSON.parse(raw);
    let cookieData;
    // 兼容旧版纯数组格式
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
  return responseJson && responseJson.success === false && responseJson.errorCode === "307";
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
        Accept: "application/json, text/json",
        "x-requested-with": "XMLHttpRequest",
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
  const { appType, formUuid, url, urlType } = parseArgs();
  const urlLabel = urlType === "open" ? "公开访问路径" : "组织内分享路径";

  console.error("=".repeat(50));
  console.error("  verify-short-url - 宜搭 URL 验证工具");
  console.error("=".repeat(50));
  console.error(`\n  应用 ID:      ${appType}`);
  console.error(`  表单 UUID:    ${formUuid}`);
  console.error(`  ${urlLabel}: ${url}`);

  // Step 0: 验证 URL 格式
  console.error("\n📋 Step 0: 验证 URL 格式");
  try {
    validateUrl(url, urlType);
    console.error("  ✅ 格式验证通过");
  } catch (err) {
    console.error(`  ❌ 格式验证失败: ${err.message}`);
    process.exit(1);
  }

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

  // Step 2: 验证 URL
  console.error("\n🔍 Step 2: 验证 URL");
  console.error("  发送 verifyShortUrl 请求...");
  let { csrf_token: csrfToken } = cookieData;
  
  // 构建请求参数（根据 URL 类型选择参数名）
  const requestParams = {
    _api: "App.verifyShortUrlForm",
    formUuid: formUuid,
    _csrf_token: csrfToken,
    _locale_time_zone_offset: "28800000",
    _stamp: Date.now().toString(),
  };
  
  if (urlType === "open") {
    requestParams.openUrl = url;
  } else {
    requestParams.shareUrl = url;
  }

  let result = await sendGetRequest(
    baseUrl,
    cookies,
    `/dingtalk/web/${appType}/query/formdesign/verifyShortUrl.json`,
    requestParams
  );

  if (result && result.__csrfExpired) {
    cookieData = refreshCsrfToken();
    csrfToken = cookieData.csrf_token;
    cookies = cookieData.cookies;
    baseUrl = resolveBaseUrl(cookieData);
    requestParams._csrf_token = csrfToken;
    requestParams._stamp = Date.now().toString();
    console.error("  🔄 重新发送 verifyShortUrl 请求（csrf_token 已刷新）...");
    result = await sendGetRequest(
      baseUrl,
      cookies,
      `/dingtalk/web/${appType}/query/formdesign/verifyShortUrl.json`,
      requestParams
    );
  }

  if (result && result.__needLogin) {
    cookieData = triggerLogin();
    csrfToken = cookieData.csrf_token;
    cookies = cookieData.cookies;
    baseUrl = resolveBaseUrl(cookieData);
    requestParams._csrf_token = csrfToken;
    requestParams._stamp = Date.now().toString();
    console.error("  🔄 重新发送 verifyShortUrl 请求...");
    result = await sendGetRequest(
      baseUrl,
      cookies,
      `/dingtalk/web/${appType}/query/formdesign/verifyShortUrl.json`,
      requestParams
    );
  }

  // 输出结果
  console.error("\n" + "=".repeat(50));
  if (result && !result.__needLogin && !result.__csrfExpired) {
    if (result.success && result.content) {
      console.error("  ✅ URL 可用！");
      console.error("=".repeat(50));
      console.log(JSON.stringify({
        available: true,
        url: url,
        urlType: urlType,
        message: urlType === "open" ? "该公开访问路径可用" : "该组织内分享路径可用"
      }, null, 2));
    } else {
      console.error("  ❌ URL 被占用");
      console.error("=".repeat(50));
      console.log(JSON.stringify({
        available: false,
        url: url,
        urlType: urlType,
        message: result.errorMsg || "该短链接已被占用",
        errorCode: result.errorCode
      }, null, 2));
    }
  } else {
    console.error("  ❌ 验证请求失败");
    console.error("=".repeat(50));
    process.exit(1);
  }
}

main().catch((error) => {
  console.error(`\n❌ 验证异常: ${error.message}`);
  process.exit(1);
});
