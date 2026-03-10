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
 *   node .claude/skills/get-schema/scripts/get-schema.js "APP_XXX" "FORM-XXX"
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
const LOGIN_SCRIPT = path.join(PROJECT_ROOT, ".claude", "skills", "yida-login", "scripts", "login.py");

// ── 参数解析 ─────────────────────────────────────────

function parseArgs() {
  const args = process.argv.slice(2);
  if (args.length < 2) {
    console.error("用法: node get-schema.js <appType> <formUuid>");
    console.error('示例：node .claude/skills/get-schema/scripts/get-schema.js "APP_XXX" "FORM-XXX"');
    process.exit(1);
  }
  return {
    appType: args[0],
    formUuid: args[1],
  };
}

// ── 登录态管理 ───────────────────────────────────────

function loadCookieData() {
  if (!fs.existsSync(COOKIE_FILE)) {
    return null;
  }
  try {
    const raw = fs.readFileSync(COOKIE_FILE, "utf-8").trim();
    if (!raw) return null;
    const parsed = JSON.parse(raw);
    // 兼容旧版纯数组格式
    if (Array.isArray(parsed)) {
      return { cookies: parsed, base_url: DEFAULT_BASE_URL, csrf_token: "" };
    }
    return parsed;
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

function isLoginRedirect(statusCode, locationHeader) {
  if (statusCode !== 301 && statusCode !== 302) return false;
  if (!locationHeader) return true;
  const loc = locationHeader.toLowerCase();
  return loc.includes("login") || loc.includes("sso") || loc.includes("workplatform") || loc.includes("sign");
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
      // 检测到登录重定向，返回特殊标记
      if (isLoginRedirect(response.statusCode, response.headers.location)) {
        console.error(`  HTTP ${response.statusCode} → 检测到登录重定向`);
        resolve({ __needLogin: true });
        response.resume();
        return;
      }

      let responseData = "";
      response.on("data", (chunk) => { responseData += chunk; });
      response.on("end", () => {
        console.error(`  HTTP 状态码: ${response.statusCode}`);
        try {
          resolve(JSON.parse(responseData));
        } catch (parseError) {
          console.error(`  响应内容: ${responseData.substring(0, 500)}`);
          resolve({
            success: false,
            errorMsg: `HTTP ${response.statusCode}: 响应非 JSON`,
          });
        }
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

  // Step 2: 获取表单 Schema（302 时自动重登录重试）
  console.error("\n📄 Step 2: 获取表单 Schema");
  console.error("  发送 getFormSchema 请求...");
  let result = await sendGetRequest(
    baseUrl,
    cookies,
    `/alibaba/web/${appType}/_view/query/formdesign/getFormSchema.json`,
    { formUuid, schemaVersion: "V5" }
  );

  if (result && result.__needLogin) {
    cookieData = triggerLogin();
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
  if (result && result.success !== false && !result.__needLogin) {
    console.error("  ✅ Schema 获取成功！");
    console.error("=".repeat(50));
    console.log(JSON.stringify(result, null, 2));
  } else {
    const errorMsg = result ? result.errorMsg || "未知错误" : "请求失败";
    console.error(`  ❌ 获取 Schema 失败: ${errorMsg}`);
    if (result && !result.__needLogin) {
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
