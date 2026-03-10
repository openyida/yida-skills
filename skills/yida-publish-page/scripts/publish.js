#!/usr/bin/env node
/**
 * publish.js - 宜搭自定义页面发布工具（Node.js 版）
 *
 * 用法：
 *   node publish.js <appType> <formUuid> <源文件路径>
 *
 * 示例：
 *   node publish.js APP_XXX FORM-XXX pages/xxx.js
 *
 * 流程：
 * 1. 读取源文件，通过 @ali/vu-babel-transform 编译 + UglifyJS 压缩
 * 2. 用代码动态构建 Schema，将 source/compiled 填入 actions.module
 * 3. 读取本地 .cache/cookies.json 获取登录态；若未登录或接口返回 302，则调用 login.py 重新登录
 * 4. 通过 HTTP POST 调用 saveFormSchema 接口发布 Schema
 */

const fs = require("fs");
const path = require("path");
const { execSync } = require("child_process");
const https = require("https");
const http = require("http");
const querystring = require("querystring");
const { default: babelTransform } = require("./babel-transform/build");
const UglifyJS = require("uglify-js");

// ── 配置读取 ──────────────────────────────────────────

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

const CONFIG_PATH = path.resolve(findProjectRoot(), "config.json");
const CONFIG = fs.existsSync(CONFIG_PATH) ? JSON.parse(fs.readFileSync(CONFIG_PATH, "utf-8")) : {};
const DEFAULT_BASE_URL = CONFIG.defaultBaseUrl || "https://www.aliwork.com";
const SCHEMA_VERSION = "V5";
const DOMAIN_CODE = "tEXDRG";
const PREFIX = "_view";

const LOGIN_SCRIPT = path.join(findProjectRoot(), ".claude", "skills", "yida-login", "scripts", "login.py");

// ── 参数解析 ─────────────────────────────────────────

function parseArgs() {
  const args = process.argv.slice(2);
  if (args.length < 3) {
    console.error("用法: node publish.js <appType> <formUuid> <源文件路径>");
    console.error("示例：node publish.js APP_XXX FORM-XXX pages/src/xxx.js");
    process.exit(1);
  }
  return {
    appType: args[0],
    formUuid: args[1],
    sourceFile: args[2],
  };
}

// ── 从登录态解析 baseUrl ─────────────────────────────

function resolveBaseUrl(loginResult) {
  return (loginResult.base_url || DEFAULT_BASE_URL).replace(/\/+$/, "");
}

// ── 1. 编译源码 ──────────────────────────────────────

function compileSource(sourcePath) {
  const sourceFileName = path.basename(sourcePath);
  const parsedPath = path.parse(sourcePath);
  const compiledFileName = `${parsedPath.name}.js`;
  const compiledPath = path.join(findProjectRoot(), "pages", "dist", compiledFileName);

  console.log(`[1/4] 读取 ${sourceFileName} 源码...`);
  const sourceCode = fs.readFileSync(sourcePath, "utf-8");

  console.log(`[2/4] Babel 编译 ${sourceFileName}...`);
  const babelResult = babelTransform(sourceCode, {}, false, { RE_VERSION: "7.4.0" });
  if (babelResult.error instanceof Error) {
    console.error(`  编译失败：${babelResult.error.message}`);
    process.exit(1);
  }

  console.log(`[3/4] UglifyJS 压缩 → ${compiledFileName}...`);
  const uglifyResult = UglifyJS.minify(babelResult.compiled);
  if (uglifyResult.error) {
    console.error(`  压缩失败：${uglifyResult.error.message}`);
    process.exit(1);
  }

  // 确保输出目录存在
  const outputDir = path.dirname(compiledPath);
  if (!fs.existsSync(outputDir)) {
    fs.mkdirSync(outputDir, { recursive: true });
  }

  fs.writeFileSync(compiledPath, uglifyResult.code, "utf-8");
  console.log(`  ✅ 编译压缩完成：${compiledPath}`);

  return { sourceCode, compiledCode: uglifyResult.code };
}

// ── ID 生成工具 ──────────────────────────────────────

let nodeIdCounter = 1;

function nextNodeId() {
  return "node_oc" + Date.now().toString(36) + (nodeIdCounter++).toString(36);
}

function generateSuffix() {
  return Date.now().toString(36) + Math.random().toString(36).substring(2, 8);
}

// ── 2. 构建 Schema ──────────────────────────────────

function buildSchemaContent(sourceCode, compiledCode, formUuid) {
  console.log("[4/4] 构建 Schema...");

  // 构造函数代码（固定模板）
  const constructorCode = "function constructor() {\nvar module = { exports: {} };\nvar _this = this;\nthis.__initMethods__(module.exports, module);\nObject.keys(module.exports).forEach(function(item) {\n  if(typeof module.exports[item] === 'function'){\n    _this[item] = module.exports[item];\n  }\n});\n\n}";

  // 全局数据源 fit 函数（固定模板）
  const fitCompiled = "'use strict';\n\nvar __preParser__ = function fit(response) {\n  var content = response.content !== undefined ? response.content : response;\n  var error = {\n    message: response.errorMsg || response.errors && response.errors[0] && response.errors[0].msg || response.content || '远程数据源请求出错，success is false'\n  };\n  var success = true;\n  if (response.success !== undefined) {\n    success = response.success;\n  } else if (response.hasError !== undefined) {\n    success = !response.hasError;\n  }\n  return {\n    content: content,\n    success: success,\n    error: error\n  };\n};";
  const fitSource = "function fit(response) {\r\n  const content = (response.content !== undefined) ? response.content : response;\r\n  const error = {\r\n    message: response.errorMsg ||\r\n      (response.errors && response.errors[0] && response.errors[0].msg) ||\r\n      response.content || '远程数据源请求出错，success is false',\r\n  };\r\n  let success = true;\r\n  if (response.success !== undefined) {\r\n    success = response.success;\r\n  } else if (response.hasError !== undefined) {\r\n    success = !response.hasError;\r\n  }\r\n  return {\r\n    content,\r\n    success,\r\n    error,\r\n  };\r\n}";

  const schema = {
    schemaType: "superform",
    schemaVersion: "5.0",
    pages: [
      {
        utils: [
          {
            name: "legaoBuiltin",
            type: "npm",
            content: {
              package: "@ali/vu-legao-builtin",
              version: "3.0.0",
              exportName: "legaoBuiltin",
            },
          },
          {
            name: "yidaPlugin",
            type: "npm",
            content: {
              package: "@ali/vu-yida-plugin",
              version: "1.1.0",
              exportName: "yidaPlugin",
            },
          },
        ],
        componentsMap: [
          { package: "@ali/vc-deep-yida", version: "1.5.169", componentName: "RootHeader" },
          { package: "@ali/vc-deep-yida", version: "1.5.169", componentName: "Jsx" },
          { package: "@ali/vc-deep-yida", version: "1.5.169", componentName: "RootContent" },
          { package: "@ali/vc-deep-yida", version: "1.5.169", componentName: "RootFooter" },
          { package: "@ali/vc-deep-yida", version: "1.5.169", componentName: "Page" },
        ],
        componentsTree: [
          {
            componentName: "Page",
            id: nextNodeId(),
            props: {
              contentBgColor: "white",
              pageStyle: { backgroundColor: "#f2f3f5" },
              contentMargin: "0",
              contentPadding: "0",
              showTitle: false,
              contentPaddingMobile: "0",
              templateVersion: "1.0.0",
              contentMarginMobile: "0",
              className: "page_" + generateSuffix(),
              contentBgColorMobile: "white",
            },
            condition: true,
            css: "body{background-color:#f2f3f5}",
            methods: {
              __initMethods__: {
                type: "js",
                source: "function (exports, module) { /*set actions code here*/ }",
                compiled: "function (exports, module) { /*set actions code here*/ }",
              },
            },
            dataSource: {
              offline: [],
              globalConfig: {
                fit: {
                  compiled: fitCompiled,
                  source: fitSource,
                  type: "js",
                  error: {},
                },
              },
              online: [
                {
                  id: "VCB660714833IBHEOXK376TA7XJH2AXUWR8MMW",
                  name: "urlParams",
                  description: "当前页面地址的参数：如 aliwork.com/APP_XXX/workbench?id=1&name=宜搭，可通过 this.state.urlParams.name 获取到宜搭",
                  formUuid: formUuid,
                  protocal: "URI",
                  isReadonly: true,
                },
                {
                  id: "",
                  name: "timestamp",
                  description: "",
                  formUuid: formUuid,
                  protocal: "VALUE",
                  initialData: "",
                },
              ],
              list: [
                {
                  id: "VCB660714833IBHEOXK376TA7XJH2AXUWR8MMW",
                  name: "urlParams",
                  description: "当前页面地址的参数：如 aliwork.com/APP_XXX/workbench?id=1&name=宜搭，可通过 this.state.urlParams.name 获取到宜搭",
                  formUuid: formUuid,
                  protocal: "URI",
                  isReadonly: true,
                },
                {
                  id: "",
                  name: "timestamp",
                  description: "",
                  formUuid: formUuid,
                  protocal: "VALUE",
                  initialData: "",
                },
              ],
              sync: true,
            },
            lifeCycles: {
              constructor: {
                type: "js",
                compiled: constructorCode,
                source: constructorCode,
              },
              componentWillUnmount: {
                name: "didUnmount",
                id: "didUnmount",
                type: "actionRef",
                params: {},
              },
              componentDidMount: {
                name: "didMount",
                id: "didMount",
                params: {},
                type: "actionRef",
              },
            },
            hidden: false,
            title: "",
            isLocked: false,
            conditionGroup: "",
            children: [
              {
                componentName: "RootHeader",
                id: nextNodeId(),
                props: {},
                condition: true,
                hidden: false,
                title: "",
                isLocked: false,
                conditionGroup: "",
              },
              {
                componentName: "RootContent",
                id: nextNodeId(),
                props: {},
                condition: true,
                hidden: false,
                title: "",
                isLocked: false,
                conditionGroup: "",
                children: [
                  {
                    componentName: "Jsx",
                    id: nextNodeId(),
                    props: {
                      render: {
                        type: "js",
                        compiled: "function main(){\n    \n    \"use strict\";\n\nvar __compiledFunc__ = function render() {\n  return this.renderJsx();\n};\n    return __compiledFunc__.apply(this, arguments);\n  }",
                        source: "function render() {\n  return this.renderJsx();\n}",
                        error: {},
                      },
                      __style__: {},
                      fieldId: "jsx_" + generateSuffix(),
                    },
                    condition: true,
                    hidden: false,
                    title: "",
                    isLocked: false,
                    conditionGroup: "",
                  },
                ],
              },
              {
                componentName: "RootFooter",
                id: nextNodeId(),
                props: {},
                condition: true,
                hidden: false,
                title: "",
                isLocked: false,
                conditionGroup: "",
              },
            ],
          },
        ],
        id: formUuid,
        connectComponent: [],
      },
    ],
    // ★ 核心：source 和 compiled 由编译结果动态填入
    actions: {
      module: {
        compiled: compiledCode,
        source: sourceCode,
      },
      type: "FUNCTION",
      list: [
        { id: "getCustomState", title: "getCustomState" },
        { id: "setCustomState", title: "setCustomState" },
        { id: "forceUpdate", title: "forceUpdate" },
        { id: "didMount", title: "didMount" },
        { id: "didUnmount", title: "didUnmount" },
        { id: "renderJsx", title: "renderJsx" },
      ],
    },
    config: {
      connectComponent: [],
    },
  };

  return JSON.stringify(schema);
}


const COOKIES_PATH = path.join(findProjectRoot(), ".cache", "cookies.json");

function loadCookieData() {
  if (!fs.existsSync(COOKIES_PATH)) return null;
  try {
    const raw = fs.readFileSync(COOKIES_PATH, "utf-8").trim();
    if (!raw) return null;
    const parsed = JSON.parse(raw);
    // 兼容旧版纯数组格式
    if (Array.isArray(parsed)) {
      return { cookies: parsed, base_url: DEFAULT_BASE_URL };
    }
    if (parsed.cookies && parsed.cookies.length > 0) return parsed;
    return null;
  } catch {
    return null;
  }
}

function isLoginRedirect(statusCode, location) {
  if (statusCode !== 301 && statusCode !== 302) return false;
  if (!location) return false;
  const lower = location.toLowerCase();
  return (
    lower.includes("login") ||
    lower.includes("sso") ||
    lower.includes("workplatform") ||
    lower.includes("sign")
  );
}

function triggerLogin() {
  console.log("\n🔐 检测到登录失效，调用 yida-login 重新登录...\n");

  if (!fs.existsSync(LOGIN_SCRIPT)) {
    console.error(`  ❌ 登录脚本不存在: ${LOGIN_SCRIPT}`);
    console.error("  请确保 yida-login skill 已正确安装。");
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
    if (!loginResult.csrf_token || !loginResult.cookies) {
      throw new Error("登录结果缺少 csrf_token 或 cookies");
    }
    return loginResult;
  } catch (parseError) {
    console.error(`  ❌ 解析登录结果失败: ${parseError.message}`);
    console.error(`  原始输出: ${jsonLine.substring(0, 200)}`);
    process.exit(1);
  }
}

// ── 4. 发送 saveFormSchema 请求 ──────────────────────

function sendSaveRequest(csrfToken, cookies, schemaContent, baseUrl, appType, formUuid) {
  return new Promise((resolve, reject) => {
    const saveSchemaPath = `/alibaba/web/${appType}/${PREFIX}/query/formdesign/saveFormSchema.json?_stamp=${Date.now()}`;

    const postData = querystring.stringify({
      _csrf_token: csrfToken,
      prefix: PREFIX,
      content: schemaContent,
      formUuid: formUuid,
      schemaVersion: SCHEMA_VERSION,
      domainCode: DOMAIN_CODE,
      importSchema: true,
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
      path: saveSchemaPath,
      method: "POST",
      headers: {
        "Content-Type": "application/x-www-form-urlencoded",
        "Content-Length": Buffer.byteLength(postData),
        Origin: baseUrl,
        Referer: `${baseUrl}/`,
        Cookie: cookieHeader,
      },
    };

    const request = requestModule.request(requestOptions, (response) => {
      // 检测到登录重定向，返回特殊标记
      if (isLoginRedirect(response.statusCode, response.headers.location)) {
        console.log(`  HTTP ${response.statusCode} → 检测到登录重定向`);
        resolve({ __needLogin: true });
        response.resume();
        return;
      }

      let responseData = "";
      response.on("data", (chunk) => { responseData += chunk; });
      response.on("end", () => {
        console.log(`  HTTP 状态码: ${response.statusCode}`);
        try {
          resolve(JSON.parse(responseData));
        } catch (parseError) {
          console.error(`  响应内容: ${responseData.substring(0, 500)}`);
          resolve({ success: false, errorMsg: `HTTP ${response.statusCode}: 响应非 JSON` });
        }
      });
    });

    request.on("error", (requestError) => { reject(requestError); });

    request.write(postData);
    request.end();
  });
}

// ── 5. 发送 updateFormConfig 请求 ────────────────────

function sendUpdateConfigRequest(csrfToken, cookies, baseUrl, appType, formUuid, version, value) {
  return new Promise((resolve, reject) => {
    const updateConfigPath = `/dingtalk/web/${appType}/query/formdesign/updateFormConfig.json`;

    const postData = querystring.stringify({
      _csrf_token: csrfToken,
      formUuid: formUuid,
      version: version,
      configType: "MINI_RESOURCE",
      value: value,
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
      path: updateConfigPath,
      method: "POST",
      headers: {
        "Content-Type": "application/x-www-form-urlencoded",
        "Content-Length": Buffer.byteLength(postData),
        Origin: baseUrl,
        Referer: `${baseUrl}/`,
        Cookie: cookieHeader,
      },
    };

    const request = requestModule.request(requestOptions, (response) => {
      // 检测到登录重定向，返回特殊标记
      if (isLoginRedirect(response.statusCode, response.headers.location)) {
        console.log(`  HTTP ${response.statusCode} → 检测到登录重定向`);
        resolve({ __needLogin: true });
        response.resume();
        return;
      }

      let responseData = "";
      response.on("data", (chunk) => { responseData += chunk; });
      response.on("end", () => {
        console.log(`  HTTP 状态码: ${response.statusCode}`);
        try {
          resolve(JSON.parse(responseData));
        } catch (parseError) {
          console.error(`  响应内容: ${responseData.substring(0, 500)}`);
          resolve({ success: false, errorMsg: `HTTP ${response.statusCode}: 响应非 JSON` });
        }
      });
    });

    request.on("error", (requestError) => { reject(requestError); });

    request.write(postData);
    request.end();
  });
}

// ── 主流程 ────────────────────────────────────────────

async function main() {
  const { appType, formUuid, sourceFile } = parseArgs();

  const sourcePath = path.resolve(sourceFile);
  if (!fs.existsSync(sourcePath)) {
    console.error(`❌ 源文件不存在：${sourcePath}`);
    process.exit(1);
  }

  const parsedSource = path.parse(sourcePath);
  const compiledPath = path.join(findProjectRoot(), "pages", "dist", `${parsedSource.name}.js`);

  // Step 1: 编译源码 + 构建 Schema
  console.log("\n📦 Step 1: 编译源码 & 构建 Schema\n");
  const { sourceCode, compiledCode } = compileSource(sourcePath);
  const schemaContent = buildSchemaContent(sourceCode, compiledCode, formUuid);
  console.log("  ✅ Schema 构建完成！");

  // Step 2: 通过 login.py 获取登录态（含 csrf_token）
  // .cache/cookies.json 中没有 csrf_token，必须通过 login.py 无头验证获取
  console.log("\n🔑 Step 2: 读取登录态");
  let cookieData = triggerLogin();
  let { csrf_token: csrfToken, cookies } = cookieData;
  let baseUrl = resolveBaseUrl(cookieData);

  console.log("=".repeat(50));
  console.log("  yida-publish - 宜搭页面发布工具");
  console.log("=".repeat(50));
  console.log(`\n  平台地址: ${baseUrl}`);
  console.log(`  应用ID:   ${appType}`);
  console.log(`  表单ID:   ${formUuid}`);  console.log(`  源文件：   ${sourcePath}`);
  console.log(`  编译产物：${compiledPath}`);
  console.log(`  输出目录：pages/dist/`);
  // Step 3: 发布 Schema（302 时自动重登录重试）
  console.log("\n📤 Step 3: 发布 Schema\n");
  let response = await sendSaveRequest(csrfToken, cookies, schemaContent, baseUrl, appType, formUuid);

  if (response && response.__needLogin) {
    cookieData = triggerLogin();
    csrfToken = cookieData.csrf_token;
    cookies = cookieData.cookies;
    baseUrl = resolveBaseUrl(cookieData);
    console.log("  🔄 重新发送 saveFormSchema 请求...");
    response = await sendSaveRequest(csrfToken, cookies, schemaContent, baseUrl, appType, formUuid);
  }

  if (!response || !response.success) {
    const errorMsg = response ? response.errorMsg || "未知错误" : "请求失败";
    console.error(`\n❌ 发布失败: ${errorMsg}`);
    if (response && !response.__needLogin) {
      console.error(`  响应详情: ${JSON.stringify(response, null, 2)}`);
    }
    process.exit(1);
  }

  const content = response.content || {};
  const savedFormUuid = content.formUuid || formUuid;
  const version = content.version || 0;
  console.log("  ✅ Schema 发布成功！");
  console.log(`  formUuid: ${savedFormUuid}`);
  console.log(`  version:  ${version}`);

  // Step 4: 更新表单配置（302 时自动重登录重试）
  console.log("\n⚙️  Step 4: 更新表单配置\n");
  console.log("  发送 updateFormConfig 请求...");
  let configResponse = await sendUpdateConfigRequest(csrfToken, cookies, baseUrl, appType, savedFormUuid, version, 8);

  if (configResponse && configResponse.__needLogin) {
    cookieData = triggerLogin();
    csrfToken = cookieData.csrf_token;
    cookies = cookieData.cookies;
    baseUrl = resolveBaseUrl(cookieData);
    console.log("  🔄 重新发送 updateFormConfig 请求...");
    configResponse = await sendUpdateConfigRequest(csrfToken, cookies, baseUrl, appType, savedFormUuid, version, 8);
  }

  // 输出结果
  console.log("\n" + "=".repeat(50));
  if (configResponse && configResponse.success) {
    console.log("  ✅ 发布成功！");
    console.log(`  formUuid: ${savedFormUuid}`);
    console.log(`  version:  ${version}`);
    console.log(`  配置已更新: MINI_RESOURCE = 8`);
  } else {
    const errorMsg = configResponse ? configResponse.errorMsg || "未知错误" : "请求失败";
    console.error(`  ⚠️  配置更新失败: ${errorMsg}`);
    console.error(`  Schema 已发布，但配置更新失败`);
    if (configResponse && !configResponse.__needLogin) {
      console.error(`  响应详情: ${JSON.stringify(configResponse, null, 2)}`);
    }
  }
  console.log("=".repeat(50));
}

main().catch((error) => {
  console.error(`\n❌ 发布异常: ${error.message}`);
  process.exit(1);
});
