const https = require("https");
const http = require("http");
const fs = require("fs");
const path = require("path");
const querystring = require("querystring");
const { execSync } = require("child_process");

const CONFIG_PATH = path.resolve(findProjectRoot(), "config.json");

function findProjectRoot() {
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

function parseArgs() {
  const args = process.argv.slice(2);
  if (args.length < 4) {
    console.error("用法: node save-share-config.js <appType> <formUuid> <openUrl> <isOpen> [openAuth]");
    console.error("示例: node .claude/skills/yida-save-share-config/scripts/save-share-config.js \"APP_XXX\" \"FORM-XXX\" \"/o/xxx\" \"y\" \"n\"");
    console.error("  isOpen: y=开启公开访问, n=关闭公开访问");
    console.error("  openAuth: y=需要授权, n=不需要授权（默认）");
    process.exit(1);
  }
  return {
    appType: args[0],
    formUuid: args[1],
    openUrl: args[2],
    isOpen: args[3],
    openAuth: args[4] || "n",
  };
}

function validateParams(params) {
  if (params.isOpen !== "y" && params.isOpen !== "n") {
    throw new Error(`isOpen 必须为 y 或 n，当前值: ${params.isOpen}`);
  }
  if (params.openAuth !== "y" && params.openAuth !== "n") {
    throw new Error(`openAuth 必须为 y 或 n，当前值: ${params.openAuth}`);
  }
  if (params.isOpen === "y" && !params.openUrl) {
    throw new Error("开启公开访问时，openUrl 不能为空");
  }
  if (params.isOpen === "n") {
    return true;
  }
  if (!params.openUrl.startsWith("/o/")) {
    throw new Error(`openUrl 必须以 /o/ 开头，当前值: ${params.openUrl}`);
  }
  const pathPart = params.openUrl.slice(3);
  if (!/^[a-zA-Z0-9_-]+$/.test(pathPart)) {
    throw new Error(`openUrl 路径部分只支持 a-z A-Z 0-9 _ -，当前值: ${params.openUrl}`);
  }
  return true;
}

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
    if (Array.isArray(parsed)) {
      cookieData = { cookies: parsed, base_url: DEFAULT_BASE_URL };
    } else {
      cookieData = parsed;
    }
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

function isLoginExpired(responseJson) {
  return responseJson && responseJson.success === false && responseJson.errorCode === "307";
}

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

function sendPostRequest(baseUrl, cookies, requestPath, postData) {
  return new Promise((resolve, reject) => {
    const cookieHeader = cookies
      .map((cookie) => `${cookie.name}=${cookie.value}`)
      .join("; ");

    const parsedUrl = new URL(baseUrl);
    const isHttps = parsedUrl.protocol === "https:";
    const requestModule = isHttps ? https : http;

    const requestOptions = {
      hostname: parsedUrl.hostname,
      port: parsedUrl.port || (isHttps ? 443 : 80),
      path: requestPath,
      method: "POST",
      headers: {
        Origin: baseUrl,
        Referer: baseUrl + "/",
        Cookie: cookieHeader,
        Accept: "application/json, text/json",
        "Content-Type": "application/x-www-form-urlencoded",
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
        if (isLoginExpired(parsed)) {
          console.error(`  检测到登录过期: ${parsed.errorMsg}`);
          resolve({ __needLogin: true });
          return;
        }
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

    request.write(postData);
    request.end();
  });
}

async function main() {
  const { appType, formUuid, openUrl, isOpen, openAuth } = parseArgs();

  console.error("=".repeat(50));
  console.error("  save-share-config - 宜搭公开访问配置保存工具");
  console.error("=".repeat(50));
  console.error(`\n  应用 ID:      ${appType}`);
  console.error(`  表单 UUID:    ${formUuid}`);
  console.error(`  公开访问路径: ${openUrl || "(空)"}`);
  console.error(`  是否开放:     ${isOpen === "y" ? "是" : "否"}`);
  console.error(`  是否需要授权: ${openAuth === "y" ? "是" : "否"}`);

  console.error("\n📋 Step 0: 验证参数");
  try {
    validateParams({ openUrl, isOpen, openAuth });
    console.error("  ✅ 参数验证通过");
  } catch (err) {
    console.error(`  ❌ 参数验证失败: ${err.message}`);
    process.exit(1);
  }

  console.error("\n🔑 Step 1: 读取登录态");
  let cookieData = loadCookieData();
  if (!cookieData) {
    console.error("  ⚠️  未找到本地登录态，触发登录...");
    cookieData = triggerLogin();
  }
  let { cookies } = cookieData;
  let baseUrl = resolveBaseUrl(cookieData);
  console.error(`  ✅ 登录态已就绪（${baseUrl}）`);

  console.error("\n💾 Step 2: 保存公开访问配置");
  console.error("  发送 saveShareConfig 请求...");
  let { csrf_token: csrfToken } = cookieData;

  const authConfig = JSON.stringify({
    openAuth: openAuth,
    authSources: [],
  });

  const postData = querystring.stringify({
    _api: "Share.saveShareConfig",
    _csrf_token: csrfToken,
    _locale_time_zone_offset: "28800000",
    formUuid: formUuid,
    shareUrl: "",
    openUrl: openUrl,
    isOpen: isOpen,
    openPageAuthConfig: authConfig,
  });

  let result = await sendPostRequest(
    baseUrl,
    cookies,
    `/dingtalk/web/${appType}/query/formdesign/saveShareConfig.json`,
    postData
  );

  if (result && result.__csrfExpired) {
    cookieData = refreshCsrfToken();
    csrfToken = cookieData.csrf_token;
    cookies = cookieData.cookies;
    baseUrl = resolveBaseUrl(cookieData);
    const newPostData = querystring.stringify({
      _api: "Share.saveShareConfig",
      _csrf_token: csrfToken,
      _locale_time_zone_offset: "28800000",
      formUuid: formUuid,
      shareUrl: "",
      openUrl: openUrl,
      isOpen: isOpen,
      openPageAuthConfig: authConfig,
    });
    console.error("  🔄 重新发送 saveShareConfig 请求（csrf_token 已刷新）...");
    result = await sendPostRequest(
      baseUrl,
      cookies,
      `/dingtalk/web/${appType}/query/formdesign/saveShareConfig.json`,
      newPostData
    );
  }

  if (result && result.__needLogin) {
    cookieData = triggerLogin();
    csrfToken = cookieData.csrf_token;
    cookies = cookieData.cookies;
    baseUrl = resolveBaseUrl(cookieData);
    const newPostData = querystring.stringify({
      _api: "Share.saveShareConfig",
      _csrf_token: csrfToken,
      _locale_time_zone_offset: "28800000",
      formUuid: formUuid,
      shareUrl: "",
      openUrl: openUrl,
      isOpen: isOpen,
      openPageAuthConfig: authConfig,
    });
    console.error("  🔄 重新发送 saveShareConfig 请求...");
    result = await sendPostRequest(
      baseUrl,
      cookies,
      `/dingtalk/web/${appType}/query/formdesign/saveShareConfig.json`,
      newPostData
    );
  }

  console.error("\n" + "=".repeat(50));
  if (result && !result.__needLogin && !result.__csrfExpired) {
    if (result.success) {
      console.error("  ✅ 配置保存成功！");
      console.error("=".repeat(50));
      console.log(JSON.stringify({
        success: true,
        openUrl: isOpen === "y" ? openUrl : null,
        isOpen: isOpen === "y",
        message: "公开访问配置已保存"
      }, null, 2));
    } else {
      console.error(`  ❌ 保存失败: ${result.errorMsg || "未知错误"}`);
      console.error("=".repeat(50));
      console.log(JSON.stringify({
        success: false,
        message: result.errorMsg || "保存失败",
        errorCode: result.errorCode
      }, null, 2));
    }
  } else {
    console.error("  ❌ 请求失败");
    console.error("=".repeat(50));
    process.exit(1);
  }
}

main().catch((error) => {
  console.error(`\n❌ 保存异常: ${error.message}`);
  process.exit(1);
});
