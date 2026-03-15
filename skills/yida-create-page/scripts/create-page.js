#!/usr/bin/env node
/**
 * create-page.js - 宜搭自定义页面创建工具
 *
 * 用法：
 *   node create-page.js <appType> <pageName>
 *
 * 参数：
 *   appType   - 应用 ID（必填），如 APP_XXX
 *   pageName  - 页面名称（必填）
 *
 * 前置条件：
 *   项目根目录下需存在 .cache/cookies.json（由 yida-login 生成）。
 *   若接口返回 302（登录失效），脚本会自动调用 login.py 重新登录后重试。
 *
 * 示例：
 *   node .claude/skills/yida-create-page/scripts/create-page.js "APP_XXX" "游戏主页"
 *
 * 流程：
 * 1. 从 .cache/cookies.json 读取登录态（cookies + base_url）
 * 2. 调用 saveFormSchemaInfo 接口创建 display 类型页面
 * 3. 若接口返回 302，自动调用 login.py 重新登录后重试
 * 4. 输出创建结果（formUuid）到 stdout
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
    console.error("用法: node create-page.js <appType> <pageName>");
    console.error('示例：node .claude/skills/yida-create-page/scripts/create-page.js "APP_XXX" "游戏主页"');
    process.exit(1);
  }
  return {
    appType: args[0],
    pageName: args[1],
  };
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

// ── 发送请求（支持 302 自动重登录） ──────────────────

function sendRequest(baseUrl, csrfToken, cookies, appType, pageName) {
  return new Promise((resolve, reject) => {
    const postData = querystring.stringify({
      _csrf_token: csrfToken,
      formType: "display",
      title: JSON.stringify({ zh_CN: pageName, en_US: pageName, type: "i18n" }),
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
      path: `/dingtalk/web/${appType}/query/formdesign/saveFormSchemaInfo.json`,
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

    console.error("  发送 saveFormSchemaInfo 请求...");

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

    request.on("error", (requestError) => { reject(requestError); });

    request.write(postData);
    request.end();
  });
}

// ── 主流程 ────────────────────────────────────────────

async function main() {
  const { appType, pageName } = parseArgs();

  console.error("=".repeat(50));
  console.error("  yida-create-page - 宜搭自定义页面创建工具");
  console.error("=".repeat(50));
  console.error(`\n  应用 ID:  ${appType}`);
  console.error(`  页面名称: ${pageName}`);

  // Step 1: 读取本地登录态
  console.error("\n🔑 Step 1: 读取登录态");
  let cookieData = loadCookieData();
  if (!cookieData) {
    console.error("  ⚠️  未找到本地登录态，触发登录...");
    cookieData = triggerLogin();
  }
  let { csrf_token: csrfToken, cookies } = cookieData;
  let baseUrl = resolveBaseUrl(cookieData);
  console.error(`  ✅ 登录态已就绪（${baseUrl}）`);

  // Step 2: 创建自定义页面（302 时自动重登录，307 时刷新 csrf_token 后重试）
  console.error("\n📄 Step 2: 创建自定义页面\n");
  let response = await sendRequest(baseUrl, csrfToken, cookies, appType, pageName);

  if (response && response.__csrfExpired) {
    cookieData = refreshCsrfToken();
    csrfToken = cookieData.csrf_token;
    cookies = cookieData.cookies;
    baseUrl = resolveBaseUrl(cookieData);
    console.error("  🔄 重新发送 saveFormSchemaInfo 请求（csrf_token 已刷新）...");
    response = await sendRequest(baseUrl, csrfToken, cookies, appType, pageName);
  }

  if (response && response.__needLogin) {
    cookieData = triggerLogin();
    csrfToken = cookieData.csrf_token;
    cookies = cookieData.cookies;
    baseUrl = resolveBaseUrl(cookieData);
    console.error("  🔄 重新发送 saveFormSchemaInfo 请求...");
    response = await sendRequest(baseUrl, csrfToken, cookies, appType, pageName);
  }

  // 输出结果
  console.error("\n" + "=".repeat(50));
  if (response && response.success && response.content) {
    const pageId = response.content.formUuid || response.content;
    const pageUrl = `${baseUrl}/${appType}/workbench/${pageId}`;

    console.error("  ✅ 页面创建成功！");
    console.error(`  pageId:   ${pageId}`);
    console.error(`  访问地址: ${pageUrl}`);
    console.error("=".repeat(50));

    console.log(JSON.stringify({ success: true, pageId, pageName, appType, url: pageUrl }));
  } else {
    const errorMsg = response ? response.errorMsg || "未知错误" : "请求失败";
    console.error(`  ❌ 创建失败: ${errorMsg}`);
    if (response && !response.__needLogin && !response.__csrfExpired) {
      console.error(`  响应详情: ${JSON.stringify(response, null, 2)}`);
    }
    console.error("=".repeat(50));
    console.log(JSON.stringify({ success: false, error: errorMsg }));
    process.exit(1);
  }
}

main().catch((error) => {
  console.error(`\n❌ 创建异常: ${error.message}`);
  process.exit(1);
});
