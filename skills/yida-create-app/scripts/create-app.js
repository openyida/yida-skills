#!/usr/bin/env node
/**
 * create-app.js - 宜搭应用创建工具
 *
 * 用法：
 *   node create-app.js <appName> [description] [icon] [iconColor]
 *
 * 参数：
 *   appName     - 应用名称（必填）
 *   description - 应用描述（可选，默认同 appName）
 *   icon        - 图标标识（可选，默认 xian-yingyong）
 *   iconColor   - 图标颜色（可选，默认 #0089FF）
 *
 * 前置条件：
 *   项目根目录下需存在 .cache/cookies.json（由 yida-login 生成）。
 *   若接口返回 302（登录失效），脚本会自动调用 login.py 重新登录后重试。
 *
 * 示例：
 *   node .claude/skills/yida-create-app/scripts/create-app.js "考勤管理"
 *   node .claude/skills/yida-create-app/scripts/create-app.js "考勤管理" "员工考勤打卡系统" "xian-daka" "#00B853"
 *
 * 流程：
 * 1. 从 .cache/cookies.json 读取登录态（cookies + base_url）
 * 2. 构建 registerApp 请求参数
 * 3. 发送 POST 请求到 /query/app/registerApp.json
 * 4. 若接口返回 302，自动调用 login.py 重新登录后重试
 * 5. 输出创建结果（appType）到 stdout
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

// ── prd 文档工具 ───────────────────────────────────────

/**
 * 查找项目根目录下的 prd/<项目名>.md 文件
 * 通过向上查找包含 prd 文件夹的目录来确定项目根目录
 */
function findRdFile() {
  // 尝试从当前工作目录开始查找
  let currentDir = process.cwd();
  
  // 向上查找最多 5 层
  for (let i = 0; i < 5; i++) {
    const rdDir = path.join(currentDir, "prd");
    if (fs.existsSync(rdDir)) {
      const files = fs.readdirSync(rdDir);
      // 找到第一个 .md 文件（假设是需求文档）
      const mdFile = files.find(f => f.endsWith(".md"));
      if (mdFile) {
        return path.join(rdDir, mdFile);
      }
    }
    const parentDir = path.dirname(currentDir);
    if (parentDir === currentDir) break;
    currentDir = parentDir;
  }
  return null;
}

/**
 * 更新 prd 文档中的应用配置，添加/更新 corpId
 */
function updateRdCorpId(rdFilePath, corpId, appType, baseUrl) {
  if (!rdFilePath || !fs.existsSync(rdFilePath)) {
    console.error(`\n  ⚠️  未找到 prd 文档，跳过 corpId 写入`);
    return false;
  }

  try {
    let content = fs.readFileSync(rdFilePath, "utf-8");
    
    // 检查是否已有应用配置表格
    const hasAppConfig = content.includes("## 应用配置") || content.includes("| appType |");
    
    if (hasAppConfig) {
      // 更新现有配置：替换或添加 corpId 行
      // 先检查是否有 corpId 行
      const corpIdRegex = /\| corpId \| [^\|]*\|/;
      if (corpIdRegex.test(content)) {
        // 更新现有 corpId
        content = content.replace(corpIdRegex, `| corpId | ${corpId} |`);
      } else {
        // 在 appType 行后插入 corpId 行
        content = content.replace(
          /(\| appType \| [^\|]*\|)(\r?\n)/,
          `$1$2| corpId | ${corpId} |$2`
        );
      }
      
      // 同时更新 appType 和 baseUrl
      content = content.replace(/\| appType \| [^\|]*\|/, `| appType | ${appType} |`);
      content = content.replace(/\| baseUrl \| [^\|]*\|/, `| baseUrl | ${baseUrl} |`);
    } else {
      // 没有应用配置表格，在文件开头添加
      const appConfigSection = `## 应用配置

| 配置项 | 值 |
| --- | --- |
| appType | ${appType} |
| corpId | ${corpId} |
| baseUrl | ${baseUrl} |

`;
      // 在第一个标题前插入，或在文件开头插入
      if (content.startsWith("#")) {
        content = content.replace(/^(# .*\r?\n)/, `$1\n${appConfigSection}`);
      } else {
        content = appConfigSection + content;
      }
    }
    
    fs.writeFileSync(rdFilePath, content, "utf-8");
    console.error(`  ✅ 已更新 prd 文档: ${path.basename(rdFilePath)}`);
    console.error(`     - corpId: ${corpId}`);
    console.error(`     - appType: ${appType}`);
    console.error(`     - baseUrl: ${baseUrl}`);
    return true;
  } catch (err) {
    console.error(`  ⚠️  更新 prd 文档失败: ${err.message}`);
    return false;
  }
}

// ── 参数解析 ─────────────────────────────────────────

function parseArgs() {
  const args = process.argv.slice(2);
  if (args.length < 1) {
    console.error("用法: node create-app.js <appName> [description] [icon] [iconColor]");
    console.error('示例: node .claude/skills/yida-create-app/scripts/create-app.js "考勤管理" "员工考勤打卡系统" "xian-daka" "#00B853"');
    console.error("\n可用图标:");
    console.error("  xian-xinwen, xian-zhengfu, xian-yingyong, xian-xueshimao, xian-qiye,");
    console.error("  xian-danju, xian-shichang, xian-jingli, xian-falv, xian-baogao,");
    console.error("  huoche, xian-shenbao, xian-diqiu, xian-qiche, xian-feiji,");
    console.error("  xian-diannao, xian-gongzuozheng, xian-gouwuche, xian-xinyongka,");
    console.error("  xian-huodong, xian-jiangbei, xian-liucheng, xian-chaxun, xian-daka");
    console.error("\n可用颜色:");
    console.error("  #0089FF #00B853 #FFA200 #FF7357 #5C72FF");
    console.error("  #85C700 #FFC505 #FF6B7A #8F66FF #14A9FF");
    process.exit(1);
  }
  return {
    appName: args[0],
    description: args[1] || args[0],
    icon: args[2] || "xian-yingyong",
    iconColor: args[3] || "#0089FF",
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

// ── 发送 registerApp 请求（支持 302 自动重登录） ────────

function buildRegisterPostData(csrfToken, appName, description, icon, iconColor) {
  const iconValue = icon + "%%" + iconColor;
  return querystring.stringify({
    _csrf_token: csrfToken,
    appName: JSON.stringify({ zh_CN: appName, en_US: appName, type: "i18n" }),
    description: JSON.stringify({ zh_CN: description, en_US: description, type: "i18n" }),
    icon: iconValue,
    iconUrl: iconValue,
    colour: "blue",
    defaultLanguage: "zh_CN",
    openExclusive: "n",
    openPhysicColumn: "n",
    openIsolationDatabase: "n",
    openExclusiveUnit: "n",
    group: "全部应用",
  });
}

function sendRegisterRequest(baseUrl, csrfToken, cookies, appName, description, icon, iconColor) {
  return new Promise((resolve, reject) => {
    const postData = buildRegisterPostData(csrfToken, appName, description, icon, iconColor);

    const cookieHeader = cookies
      .map((cookie) => `${cookie.name}=${cookie.value}`)
      .join("; ");

    const parsedUrl = new URL(baseUrl);
    const isHttps = parsedUrl.protocol === "https:";
    const requestModule = isHttps ? https : http;

    const requestOptions = {
      hostname: parsedUrl.hostname,
      port: parsedUrl.port || (isHttps ? 443 : 80),
      path: "/query/app/registerApp.json",
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

    console.error("  发送 registerApp 请求...");

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
  const { appName, description, icon, iconColor } = parseArgs();

  console.error("=".repeat(50));
  console.error("  yida-create-app - 宜搭应用创建工具");
  console.error("=".repeat(50));
  console.error(`\n  应用名称: ${appName}`);
  console.error(`  应用描述: ${description}`);
  console.error(`  图标:     ${icon} (${iconColor})`);

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

  // Step 2: 创建应用（302 时自动重登录重试）
  console.error("\n📦 Step 2: 创建应用\n");
  let response = await sendRegisterRequest(baseUrl, csrfToken, cookies, appName, description, icon, iconColor);

  if (response && response.__needLogin) {
    cookieData = triggerLogin();
    csrfToken = cookieData.csrf_token;
    cookies = cookieData.cookies;
    baseUrl = resolveBaseUrl(cookieData);
    console.error("  🔄 重新发送 registerApp 请求...");
    response = await sendRegisterRequest(baseUrl, csrfToken, cookies, appName, description, icon, iconColor);
  }

  // 输出结果
  console.error("\n" + "=".repeat(50));
  if (response && response.success && response.content) {
    const appType = response.content;
    const appUrl = `${baseUrl}/${appType}/admin`;
    const corpId = cookieData.corpId || "";

    console.error("  ✅ 应用创建成功！");
    console.error(`  appType: ${appType}`);
    console.error(`  corpId:  ${corpId || "未获取"}`);
    console.error(`  访问地址: ${appUrl}`);
    console.error("=".repeat(50));

    // 更新 prd 文档中的 corpId
    const rdFile = findRdFile();
    if (rdFile) {
      updateRdCorpId(rdFile, corpId, appType, baseUrl);
    }

    console.log(JSON.stringify({ success: true, appType, appName, corpId, url: appUrl }));
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
