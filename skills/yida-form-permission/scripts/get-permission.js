const https = require("https");
const http = require("http");
const fs = require("fs");
const path = require("path");
const { execSync } = require("child_process");

// 权限接口域名
const PERMISSION_BASE_URL = "https://www.aliwork.com";

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
  if (args.length < 2) {
    console.error("用法: node get-permission.js <appType> <formUuid>");
    console.error('示例: node .claude/skills/yida-form-permission/scripts/get-permission.js "APP_XXX" "FORM-XXX"');
    process.exit(1);
  }
  return {
    appType: args[0],
    formUuid: args[1],
  };
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
      cookieData = { cookies: parsed };
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
    if (!result.csrf_token || !result.cookies)
      throw new Error("刷新结果缺少 csrf_token 或 cookies");
    return result;
  } catch (err) {
    console.error(`  ❌ 解析刷新结果失败: ${err.message}`);
    process.exit(1);
  }
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

/**
 * 获取权限组列表
 * 接口：GET /{appType}/permission/manage/listPermitPackages.json
 * 域名：yidalogin.aliwork.com
 */
function listPermitPackages(cookies, appType, formUuid, csrfToken) {
  const cookieHeader = cookies.map((c) => `${c.name}=${c.value}`).join("; ");
  const parsedUrl = new URL(PERMISSION_BASE_URL);
  const isHttps = parsedUrl.protocol === "https:";
  const requestModule = isHttps ? https : http;

  const queryParams = new URLSearchParams({
    _api: "Permission.getPermitGroupList",
    _mock: "false",
    _csrf_token: csrfToken,
    _locale_time_zone_offset: "28800000",
    formUuid: formUuid,
    packageName: "",
    packageType: "FORM_PACKAGE_VIEW",
    pageIndex: "1",
    pageSize: "20",
    appType: appType,
    _stamp: String(Date.now()),
  });

  const requestPath = `/${appType}/permission/manage/listPermitPackages.json?${queryParams.toString()}`;

  return new Promise((resolve, reject) => {
    const options = {
      hostname: parsedUrl.hostname,
      port: parsedUrl.port || (isHttps ? 443 : 80),
      path: requestPath,
      method: "GET",
      headers: {
        Cookie: cookieHeader,
        Accept: "application/json, text/json",
        "X-Requested-With": "XMLHttpRequest",
        Referer: `${PERMISSION_BASE_URL}/${appType}/admin/${formUuid}/settings/permission`,
      },
      timeout: 30000,
    };

    const req = requestModule.request(options, (res) => {
      let data = "";
      res.on("data", (chunk) => (data += chunk));
      res.on("end", () => {
        console.error(`  HTTP 状态码: ${res.statusCode}`);
        try {
          const parsed = JSON.parse(data);
          if (isLoginExpired(parsed)) {
            resolve({ __needLogin: true });
            return;
          }
          if (isCsrfTokenExpired(parsed)) {
            resolve({ __csrfExpired: true });
            return;
          }
          resolve(parsed);
        } catch {
          console.error(`  响应内容: ${data.substring(0, 500)}`);
          resolve({ success: false, errorMsg: "响应非 JSON" });
        }
      });
    });
    req.on("error", reject);
    req.on("timeout", () => { req.destroy(); reject(new Error("请求超时")); });
    req.end();
  });
}

/**
 * 将权限组列表格式化为可读的权限配置摘要
 */
function formatPermissions(packages) {
  return packages.map((pkg) => {
    const packageName = pkg.packageName
      ? (pkg.packageName.zh_CN || pkg.packageName.en_US || JSON.stringify(pkg.packageName))
      : "未命名";
    const description = pkg.description
      ? (pkg.description.zh_CN || pkg.description.en_US || "")
      : "";

    // 解析权限成员
    const roleMembers = (pkg.roleMembers || []).map((rm) => ({
      roleType: rm.roleType,
      label: rm.label,
      roleValue: rm.roleValue,
    }));

    // 解析数据权限
    let dataPermit = {};
    if (pkg.dataPermit) {
      try {
        dataPermit = typeof pkg.dataPermit === "string" ? JSON.parse(pkg.dataPermit) : pkg.dataPermit;
      } catch { dataPermit = {}; }
    }

    // 解析操作权限
    let operatePermit = {};
    if (pkg.operatePermit) {
      try {
        operatePermit = typeof pkg.operatePermit === "string" ? JSON.parse(pkg.operatePermit) : pkg.operatePermit;
      } catch { operatePermit = {}; }
    }

    // 解析字段权限
    let fieldPermit = {};
    if (pkg.fieldPermit) {
      try {
        fieldPermit = typeof pkg.fieldPermit === "string" ? JSON.parse(pkg.fieldPermit) : pkg.fieldPermit;
      } catch { fieldPermit = {}; }
    }

    return {
      packageUuid: pkg.packageUuid,
      packageName,
      description,
      packageType: pkg.packageType,
      roleMembers,
      dataPermit,
      operatePermit,
      fieldPermit,
    };
  });
}

async function main() {
  const { appType, formUuid } = parseArgs();

  console.error("=".repeat(50));
  console.error("  get-permission - 宜搭表单权限配置查询工具");
  console.error("=".repeat(50));
  console.error(`\n  应用 ID:   ${appType}`);
  console.error(`  表单 UUID: ${formUuid}`);
  console.error(`  接口域名:  ${PERMISSION_BASE_URL}`);

  console.error("\n🔑 Step 1: 读取登录态");
  let cookieData = loadCookieData();
  if (!cookieData) {
    console.error("  ⚠️  未找到本地登录态，触发登录...");
    cookieData = triggerLogin();
  }
  let { cookies } = cookieData;
  let csrfToken = cookieData.csrf_token;
  console.error("  ✅ 登录态已就绪");

  console.error("\n📋 Step 2: 查询权限组列表");
  console.error("  发送 listPermitPackages 请求...");

  let result = await listPermitPackages(cookies, appType, formUuid, csrfToken);

  // 处理 csrf_token 过期
  if (result && result.__csrfExpired) {
    cookieData = refreshCsrfToken();
    csrfToken = cookieData.csrf_token;
    cookies = cookieData.cookies;
    console.error("  🔄 重新发送请求（csrf_token 已刷新）...");
    result = await listPermitPackages(cookies, appType, formUuid, csrfToken);
  }

  // 处理登录过期
  if (result && result.__needLogin) {
    cookieData = triggerLogin();
    csrfToken = cookieData.csrf_token;
    cookies = cookieData.cookies;
    console.error("  🔄 重新发送请求（已重新登录）...");
    result = await listPermitPackages(cookies, appType, formUuid, csrfToken);
  }

  console.error("\n" + "=".repeat(50));
  if (result && !result.__needLogin && !result.__csrfExpired) {
    if (result.success) {
      const packages = (result.content && result.content.formPermit) || [];
      console.error(`  ✅ 权限配置查询成功！共 ${packages.length} 个权限组`);
      console.error("=".repeat(50));

      const formattedPermissions = formatPermissions(packages);
      console.log(JSON.stringify({
        success: true,
        totalPackages: packages.length,
        permissions: formattedPermissions,
        message: "权限配置查询成功",
      }, null, 2));
    } else {
      console.error(`  ❌ 查询失败: ${result.errorMsg || "未知错误"}`);
      console.error("=".repeat(50));
      console.log(JSON.stringify({
        success: false,
        message: result.errorMsg || "查询失败",
        errorCode: result.errorCode,
      }, null, 2));
    }
  } else {
    console.error("  ❌ 请求失败");
    console.error("=".repeat(50));
    process.exit(1);
  }
}

main().catch((error) => {
  console.error(`\n❌ 查询异常: ${error.message}`);
  process.exit(1);
});