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

const CONFIG = fs.existsSync(CONFIG_PATH)
  ? JSON.parse(fs.readFileSync(CONFIG_PATH, "utf-8"))
  : {};
const DEFAULT_BASE_URL = CONFIG.defaultBaseUrl || "https://www.aliwork.com";
// 权限接口域名
const PERMISSION_BASE_URL = "https://www.aliwork.com";
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
    console.error(
      "用法: node save-permission.js <appType> <formUuid> [fieldPermissionsJson] [--data-permission <json>] [--action-permission <json>]"
    );
    console.error("");
    console.error("示例:");
    console.error(
      '  字段权限: node save-permission.js APP_XXX FORM-XXX \'[{"fieldId":"textField_xxx","behavior":"HIDDEN","roles":["member"]}]\''
    );
    console.error(
      '  数据权限: node save-permission.js APP_XXX FORM-XXX --data-permission \'{"role":"member","dataRange":"SELF"}\''
    );
    console.error(
      '  操作权限: node save-permission.js APP_XXX FORM-XXX --action-permission \'{"role":"DEFAULT","operations":{"OPERATE_VIEW":true,"OPERATE_EDIT":false,"OPERATE_DELETE":false}}\''
    );
    process.exit(1);
  }

  const parsed = {
    appType: args[0],
    formUuid: args[1],
    fieldPermissions: null,
    dataPermission: null,
    actionPermission: null,
  };

  let index = 2;
  while (index < args.length) {
    if (args[index] === "--data-permission" && args[index + 1]) {
      parsed.dataPermission = parseJsonArg(args[index + 1], "data-permission");
      index += 2;
    } else if (args[index] === "--action-permission" && args[index + 1]) {
      parsed.actionPermission = parseJsonArg(args[index + 1], "action-permission");
      index += 2;
    } else if (!parsed.fieldPermissions) {
      parsed.fieldPermissions = parseJsonArg(args[index], "fieldPermissions");
      index += 1;
    } else {
      index += 1;
    }
  }

  if (!parsed.fieldPermissions && !parsed.dataPermission && !parsed.actionPermission) {
    console.error("❌ 至少需要提供一种权限配置（字段权限/数据权限/操作权限）");
    process.exit(1);
  }

  return parsed;
}

function parseJsonArg(jsonStr, paramName) {
  if (fs.existsSync(jsonStr)) {
    try {
      return JSON.parse(fs.readFileSync(jsonStr, "utf-8"));
    } catch (err) {
      console.error(`❌ 解析 ${paramName} 文件失败: ${err.message}`);
      process.exit(1);
    }
  }
  try {
    return JSON.parse(jsonStr);
  } catch (err) {
    console.error(`❌ 解析 ${paramName} JSON 失败: ${err.message}`);
    process.exit(1);
  }
}

function validateFieldPermissions(fieldPermissions) {
  if (!Array.isArray(fieldPermissions)) {
    throw new Error("字段权限必须是数组格式");
  }
  const validBehaviors = ["NORMAL", "READONLY", "HIDDEN", "MASKED"];
  for (const permission of fieldPermissions) {
    if (!permission.fieldId) {
      throw new Error("每个字段权限必须包含 fieldId");
    }
    if (permission.behavior && !validBehaviors.includes(permission.behavior)) {
      throw new Error(
        `无效的 behavior: ${permission.behavior}，有效值: ${validBehaviors.join(", ")}`
      );
    }
  }
}

function validateDataPermission(dataPermission) {
  const validRanges = [
    // 用户友好别名
    "ALL", "SELF", "DEPARTMENT", "CUSTOM",
    // 接口原始值
    "ORIGINATOR", "ORIGINATOR_DEPARTMENT",
    "SAME_LEVEL_DEPARTMENT", "SUBORDINATE_DEPARTMENT",
    "FREE_LOGIN", "CUSTOM_DEPARTMENT", "FORMULA",
  ];
  if (dataPermission.dataRange && !validRanges.includes(dataPermission.dataRange)) {
    throw new Error(
      `无效的 dataRange: ${dataPermission.dataRange}，有效值: ${validRanges.join(", ")}`
    );
  }
}

// 所有支持的操作权限 key（来自宜搭接口实际值）
const VALID_OPERATE_KEYS = [
  "OPERATE_VIEW",              // 查看
  "OPERATE_EDIT",              // 编辑
  "OPERATE_DELETE",            // 删除
  "OPERATE_HISTORY",           // 变更记录
  "OPERATE_COMMENT",           // 评论
  "OPERATE_PRINT",             // 打印
  "OPERATE_BATCH_IMPORT",      // 批量导入
  "OPERATE_BATCH_EXPORT",      // 批量导出
  "OPERATE_BATCH_EDIT",        // 批量修改
  "OPERATE_BATCH_DELETE",      // 批量删除
  "OPERATE_BATCH_PRINT",       // 批量打印
  "OPERATE_BATCH_DOWNLOAD",    // 批量下载文件
  "OPERATE_BATCH_DOWNLOAD_QRCODE", // 批量下载二维码
  "OPERATE_CREATE",            // 新增（提交）
];

function validateActionPermission(actionPermission) {
  if (!actionPermission.operations || typeof actionPermission.operations !== "object") {
    throw new Error(
      "操作权限必须包含 operations 对象，格式为 {\"OPERATE_VIEW\": true, \"OPERATE_EDIT\": false, ...}"
    );
  }
  for (const key of Object.keys(actionPermission.operations)) {
    if (!VALID_OPERATE_KEYS.includes(key)) {
      throw new Error(
        `无效的操作权限 key: ${key}，有效值: ${VALID_OPERATE_KEYS.join(", ")}`
      );
    }
  }
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
      response.on("data", (chunk) => {
        responseData += chunk;
      });
      response.on("end", () => {
        console.error(`  HTTP 状态码: ${response.statusCode}`);
        let parsed;
        try {
          parsed = JSON.parse(responseData);
        } catch (parseError) {
          console.error(`  响应内容: ${responseData.substring(0, 500)}`);
          resolve({
            success: false,
            errorMsg: `HTTP ${response.statusCode}: 响应非 JSON`,
          });
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

// 数据权限范围映射：用户友好的 dataRange 值 -> 接口实际使用的 type 值
// 同时也支持直接传入接口原始值（如 ORIGINATOR_DEPARTMENT）
const DATA_RANGE_TO_PERMIT_TYPE = {
  // 用户友好别名
  ALL: "ALL",                                       // 全部数据
  SELF: "ORIGINATOR",                               // 本人提交（别名）
  DEPARTMENT: "ORIGINATOR_DEPARTMENT",              // 本部门提交（别名）
  CUSTOM: "FORMULA",                                // 自定义过滤条件（别名）
  // 接口原始值（直接透传）
  ORIGINATOR: "ORIGINATOR",                         // 本人提交
  ORIGINATOR_DEPARTMENT: "ORIGINATOR_DEPARTMENT",   // 本部门提交
  SAME_LEVEL_DEPARTMENT: "SAME_LEVEL_DEPARTMENT",   // 同级部门提交
  SUBORDINATE_DEPARTMENT: "SUBORDINATE_DEPARTMENT", // 下级部门提交
  FREE_LOGIN: "FREE_LOGIN",                         // 免登提交
  CUSTOM_DEPARTMENT: "CUSTOM_DEPARTMENT",           // 自定义部门
  FORMULA: "FORMULA",                               // 自定义过滤条件
};

function buildPermissionConfig(fieldPermissions, dataPermission, actionPermission) {
  const config = {};

  if (fieldPermissions) {
    config.fieldPermissions = fieldPermissions.map((permission) => ({
      fieldId: permission.fieldId,
      behavior: permission.behavior || "NORMAL",
      roles: permission.roles || ["all"],
    }));
  }

  if (dataPermission) {
    config.dataPermissions = [
      {
        role: dataPermission.role || "member",
        dataRange: dataPermission.dataRange || "ALL",
        customRule: dataPermission.customRule || null,
      },
    ];
  }

  if (actionPermission) {
    config.actionPermissions = [
      {
        role: actionPermission.role || "member",
        actions: {
          create: actionPermission.actions.create !== false,
          view: actionPermission.actions.view !== false,
          edit: actionPermission.actions.edit !== false,
          delete: actionPermission.actions.delete !== false,
          export: actionPermission.actions.export !== false,
        },
      },
    ];
  }

  return config;
}

/**
 * 获取权限组列表
 * 接口：GET /{appType}/permission/manage/listPermitPackages.json
 */
async function listPermitPackages(cookies, appType, formUuid, csrfToken) {
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
        try {
          resolve(JSON.parse(data));
        } catch {
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
 * 保存单个权限组
 * 接口：POST /{appType}/permission/manage/saveOrUpdatePermit.json
 */
async function savePermitPackage(cookies, appType, formUuid, csrfToken, permitPackage) {
  const cookieHeader = cookies.map((c) => `${c.name}=${c.value}`).join("; ");
  const parsedUrl = new URL(PERMISSION_BASE_URL);
  const isHttps = parsedUrl.protocol === "https:";
  const requestModule = isHttps ? https : http;

  const requestPath = `/${appType}/permission/manage/saveOrUpdatePermit.json?_api=Permission.saveOrUpdatePermitGroup&_mock=false&_stamp=${Date.now()}`;

  const postParams = {
    _csrf_token: csrfToken,
    _locale_time_zone_offset: "28800000",
    formUuid: formUuid,
    packageType: permitPackage.packageType || "FORM_PACKAGE_VIEW",
    packageName: JSON.stringify(permitPackage.packageName),
    description: JSON.stringify(permitPackage.description),
    roleData: JSON.stringify({
      include: (permitPackage.roleMembers || []).map((rm) => {
        // roleValue 可能是字符串（如 "ALL"）或数组（如 [{key: "xxx"}]）
        let roleValue;
        if (typeof rm.roleValue === "string") {
          roleValue = rm.roleValue || "ALL";
        } else if (Array.isArray(rm.roleValue) && rm.roleValue.length > 0) {
          roleValue = rm.roleValue.map((rv) => rv.key).join(",");
        } else {
          roleValue = "ALL";
        }
        return { label: rm.label, roleType: rm.roleType, roleValue };
      }),
    }),
    dataPermit: permitPackage.dataPermit,
    operatePermit: permitPackage.operatePermit,
    customButtonPermit: permitPackage.customButtonPermit || "[]",
    fieldPermit: permitPackage.fieldPermit,
    packageUuid: permitPackage.packageUuid,
    viewData: permitPackage.viewData,
  };

  const postData = querystring.stringify(postParams);

  return new Promise((resolve, reject) => {
    const options = {
      hostname: parsedUrl.hostname,
      port: parsedUrl.port || (isHttps ? 443 : 80),
      path: requestPath,
      method: "POST",
      headers: {
        "Content-Type": "application/x-www-form-urlencoded",
        "Content-Length": Buffer.byteLength(postData),
        Cookie: cookieHeader,
        Accept: "application/json, text/json",
        Origin: PERMISSION_BASE_URL,
        Referer: `${PERMISSION_BASE_URL}/${appType}/admin/${formUuid}/settings/permission`,
        "X-Requested-With": "XMLHttpRequest",
      },
      timeout: 30000,
    };

    const req = requestModule.request(options, (res) => {
      let data = "";
      res.on("data", (chunk) => (data += chunk));
      res.on("end", () => {
        try {
          resolve(JSON.parse(data));
        } catch {
          resolve({ success: false, errorMsg: "响应非 JSON" });
        }
      });
    });
    req.on("error", reject);
    req.on("timeout", () => { req.destroy(); reject(new Error("请求超时")); });
    req.write(postData);
    req.end();
  });
}

async function main() {
  const { appType, formUuid, fieldPermissions, dataPermission, actionPermission } =
    parseArgs();

  console.error("=".repeat(50));
  console.error("  save-permission - 宜搭表单权限配置保存工具");
  console.error("=".repeat(50));
  console.error(`\n  应用 ID:   ${appType}`);
  console.error(`  表单 UUID: ${formUuid}`);

  console.error("\n📋 Step 0: 验证参数");
  try {
    if (fieldPermissions) {
      validateFieldPermissions(fieldPermissions);
      console.error(`  ✅ 字段权限验证通过（${fieldPermissions.length} 条规则）`);
    }
    if (dataPermission) {
      validateDataPermission(dataPermission);
      console.error(`  ✅ 数据权限验证通过（${dataPermission.dataRange || "ALL"}）`);
    }
    if (actionPermission) {
      validateActionPermission(actionPermission);
      console.error("  ✅ 操作权限验证通过");
    }
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
  let csrfToken = cookieData.csrf_token;
  console.error(`  ✅ 登录态已就绪（接口域名: ${PERMISSION_BASE_URL}）`);

  // 数据权限和操作权限都走新接口（先获取权限组列表，再逐个更新）
  if (dataPermission || actionPermission) {
    console.error("\n📋 Step 2: 获取当前权限组列表");
    const listResult = await listPermitPackages(cookies, appType, formUuid, csrfToken);

    if (!listResult.success) {
      console.error(`  ❌ 获取权限组失败: ${listResult.errorMsg}`);
      process.exit(1);
    }

    const packages = listResult.content && listResult.content.formPermit;
    if (!packages || packages.length === 0) {
      console.error("  ⚠️  未找到任何权限组");
      process.exit(1);
    }
    console.error(`  ✅ 获取到 ${packages.length} 个权限组`);

    // 根据 role 筛选要更新的权限组
    const targetRole = (dataPermission || actionPermission).role || "DEFAULT";
    const packagesToUpdate = packages.filter((pkg) => {
      if (targetRole === "DEFAULT") {
        return pkg.roleMembers && pkg.roleMembers.some((rm) => rm.roleType === "DEFAULT");
      }
      if (targetRole === "MANAGER") {
        return pkg.roleMembers && pkg.roleMembers.some((rm) => rm.roleType === "MANAGER");
      }
      return true;
    });

    if (packagesToUpdate.length === 0) {
      console.error(`  ⚠️  未找到匹配角色 "${targetRole}" 的权限组`);
      process.exit(1);
    }

    console.error(`  将更新 ${packagesToUpdate.length} 个权限组`);

    // 准备数据权限的 permitType
    let permitType = null;
    if (dataPermission) {
      permitType = DATA_RANGE_TO_PERMIT_TYPE[dataPermission.dataRange] || dataPermission.dataRange;
      console.error(`\n💾 Step 3: 更新权限组（数据权限: ${dataPermission.dataRange} → ${permitType}${actionPermission ? "，操作权限: 同步更新" : ""}）`);
    } else {
      console.error(`\n💾 Step 3: 更新权限组操作权限`);
    }

    let allSuccess = true;
    for (const pkg of packagesToUpdate) {
      const pkgName = pkg.packageName && (pkg.packageName.zh_CN || pkg.packageName.en_US);
      console.error(`  → 更新权限组: ${pkgName} (${pkg.packageUuid})`);

      const updatedPkg = { ...pkg };

      // 更新数据权限
      if (dataPermission) {
        updatedPkg.dataPermit = JSON.stringify({ rule: [{ type: permitType, value: "y" }] });
      }

      // 更新操作权限：将 {OPERATE_VIEW: true, OPERATE_EDIT: false} 转为 {"OPERATE_VIEW":"y"} 格式
      if (actionPermission) {
        const currentOperatePermit = pkg.operatePermit
          ? (typeof pkg.operatePermit === "string" ? JSON.parse(pkg.operatePermit) : pkg.operatePermit)
          : {};
        const newOperatePermit = { ...currentOperatePermit };
        for (const [key, enabled] of Object.entries(actionPermission.operations)) {
          if (enabled) {
            newOperatePermit[key] = "y";
          } else {
            delete newOperatePermit[key];
          }
        }
        updatedPkg.operatePermit = JSON.stringify(newOperatePermit);
      }

      const saveResult = await savePermitPackage(cookies, appType, formUuid, csrfToken, updatedPkg);

      if (saveResult && saveResult.success) {
        console.error(`    ✅ 更新成功`);
      } else {
        console.error(`    ❌ 更新失败: ${saveResult && saveResult.errorMsg}`);
        allSuccess = false;
      }
    }

    console.error("\n" + "=".repeat(50));
    if (allSuccess) {
      console.error("  ✅ 权限配置保存成功！");
      console.error("=".repeat(50));
      const summary = {};
      if (dataPermission) summary.dataPermission = `数据范围: ${dataPermission.dataRange}`;
      if (actionPermission) summary.actionPermission = `操作权限: ${Object.keys(actionPermission.operations).join(", ")}`;
      console.log(JSON.stringify({ success: true, summary, message: "权限配置已保存" }, null, 2));
    } else {
      console.error("  ❌ 部分权限组更新失败");
      console.error("=".repeat(50));
      process.exit(1);
    }
    return;
  }

  // 字段权限暂不支持（原接口已失效，需要进一步探索）
  if (fieldPermissions) {
    console.error("\n⚠️  注意：字段权限的配置接口尚未验证，当前仅支持数据权限和操作权限配置。");
    console.error("  如需配置字段权限，请通过宜搭管理后台手动操作。");
    process.exit(1);
  }
}

main().catch((error) => {
  console.error(`\n❌ 保存异常: ${error.message}`);
  process.exit(1);
});
