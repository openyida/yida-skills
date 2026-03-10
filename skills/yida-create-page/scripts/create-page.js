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

function loadCookieData() {
  if (!fs.existsSync(COOKIE_FILE)) return null;
  try {
    const raw = fs.readFileSync(COOKIE_FILE, "utf-8").trim();
    if (!raw) return null;
    const parsed = JSON.parse(raw);
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
          resolve({ success: false, errorMsg: `HTTP ${response.statusCode}: 响应非 JSON` });
        }
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

  // Step 2: 创建自定义页面（302 时自动重登录重试）
  console.error("\n📄 Step 2: 创建自定义页面\n");
  let response = await sendRequest(baseUrl, csrfToken, cookies, appType, pageName);

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
    if (response && !response.__needLogin) {
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
