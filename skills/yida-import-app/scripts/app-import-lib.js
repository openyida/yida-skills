#!/usr/bin/env node

const fs = require("fs");
const path = require("path");
const http = require("http");
const https = require("https");
const querystring = require("querystring");
const { execSync } = require("child_process");
const { renderPrd } = require("./render-prd");

function findProjectRoot() {
  for (const startDir of [process.cwd(), __dirname]) {
    let currentDir = startDir;
    while (currentDir !== path.dirname(currentDir)) {
      if (fs.existsSync(path.join(currentDir, "README.md")) || fs.existsSync(path.join(currentDir, ".git"))) {
        return currentDir;
      }
      currentDir = path.dirname(currentDir);
    }
  }
  return process.cwd();
}

const PROJECT_ROOT = findProjectRoot();
const CONFIG_PATH = path.join(PROJECT_ROOT, "config.json");
const COOKIE_FILE = path.join(PROJECT_ROOT, ".cache", "cookies.json");
const DEFAULT_CONFIG = {
  loginUrl: "https://www.aliwork.com/workPlatform",
  defaultBaseUrl: "https://www.aliwork.com"
};
const CONFIG = fs.existsSync(CONFIG_PATH)
  ? Object.assign({}, DEFAULT_CONFIG, JSON.parse(fs.readFileSync(CONFIG_PATH, "utf-8")))
  : DEFAULT_CONFIG;

function resolvePythonCommand() {
  return process.env.PYTHON || "python";
}

function resolveLoginScript() {
  const candidates = [
    path.join(PROJECT_ROOT, ".agents", "skills", "yida-login", "scripts", "login.py"),
    path.join(PROJECT_ROOT, ".claude", "skills", "yida-login", "scripts", "login.py"),
    path.join(PROJECT_ROOT, ".Codex", "skills", "yida-login", "scripts", "login.py")
  ];

  for (const candidate of candidates) {
    if (fs.existsSync(candidate)) {
      return candidate;
    }
  }
  throw new Error("未找到 yida-login 脚本，请检查 .agents/.claude/.Codex 目录");
}

function resolveLiveDiscoverScript() {
  const scriptPath = path.join(PROJECT_ROOT, ".agents", "skills", "yida-import-app", "scripts", "discover-live.py");
  if (!fs.existsSync(scriptPath)) {
    throw new Error("discover-live.py not found");
  }
  return scriptPath;
}

function parseArgs(argv) {
  const args = argv.slice(2);
  if (!args.length) {
    return {
      appType: "",
      appName: "",
      manifestPath: "",
      outputName: "",
      force: false,
      selectApp: true
    };
  }
  if (!args.length) {
    throw new Error("用法: node import-app.js <appType> [--app-name 名称] [--manifest 文件路径] [--output-name 输出名] [--force]");
  }

  const parsed = {
    appType: args[0] && !args[0].startsWith("--") ? args[0] : "",
    appName: "",
    manifestPath: "",
    outputName: "",
    force: false,
    selectApp: !args.length || (args[0] && args[0].startsWith("--"))
  };

  const startIndex = parsed.appType ? 1 : 0;

  for (let i = startIndex; i < args.length; i += 1) {
    const current = args[i];
    if (current === "--app-name") {
      parsed.appName = args[++i] || "";
    } else if (current === "--manifest") {
      parsed.manifestPath = args[++i] || "";
    } else if (current === "--output-name") {
      parsed.outputName = args[++i] || "";
    } else if (current === "--force") {
      parsed.force = true;
    } else if (current === "--select-app") {
      parsed.selectApp = true;
    } else {
      throw new Error("未知参数: " + current);
    }
  }

  return parsed;
}

function slugifyName(name) {
  return String(name || "")
    .trim()
    .toLowerCase()
    .replace(/[^a-z0-9\u4e00-\u9fa5]+/g, "-")
    .replace(/^-+|-+$/g, "");
}

function sanitizeFileBase(name, fallbackValue) {
  const base = slugifyName(name || "") || fallbackValue;
  return base.replace(/[\\/:*?"<>|]/g, "-");
}

function ensureDir(dirPath) {
  if (!fs.existsSync(dirPath)) {
    fs.mkdirSync(dirPath, { recursive: true });
  }
}

function readJsonFile(filePath) {
  return JSON.parse(fs.readFileSync(filePath, "utf-8"));
}

function extractInfoFromCookies(cookies) {
  let csrfToken = null;
  let corpId = null;

  (cookies || []).forEach(function (cookie) {
    if (cookie.name === "tianshu_csrf_token") {
      csrfToken = cookie.value;
    } else if (cookie.name === "tianshu_corp_user") {
      const index = cookie.value.lastIndexOf("_");
      if (index > 0) {
        corpId = cookie.value.slice(0, index);
      }
    }
  });

  return {
    csrfToken: csrfToken,
    corpId: corpId
  };
}

function loadCookieData() {
  if (!fs.existsSync(COOKIE_FILE)) {
    return null;
  }

  const raw = fs.readFileSync(COOKIE_FILE, "utf-8").trim();
  if (!raw) {
    return null;
  }

  const parsed = JSON.parse(raw);
  const cookieData = Array.isArray(parsed)
    ? { cookies: parsed, base_url: CONFIG.defaultBaseUrl }
    : parsed;
  const extracted = extractInfoFromCookies(cookieData.cookies || []);
  if (extracted.csrfToken) {
    cookieData.csrf_token = extracted.csrfToken;
  }
  if (extracted.corpId) {
    cookieData.corp_id = extracted.corpId;
  }
  return cookieData;
}

function runLogin(refreshCsrfOnly) {
  const loginScript = resolveLoginScript();
  const pythonCommand = resolvePythonCommand();
  const command = refreshCsrfOnly
    ? `${pythonCommand} "${loginScript}" --refresh-csrf`
    : `${pythonCommand} "${loginScript}"`;
  const stdout = execSync(command, {
    encoding: "utf-8",
    env: Object.assign({}, process.env, {
      PYTHONIOENCODING: "utf-8",
      PYTHONUTF8: "1"
    }),
    stdio: ["inherit", "pipe", "inherit"],
    timeout: refreshCsrfOnly ? 60000 : 180000
  });
  const lines = stdout.trim().split("\n");
  return JSON.parse(lines[lines.length - 1]);
}

function runLiveDiscovery(appType, selectApp) {
  const scriptPath = resolveLiveDiscoverScript();
  const pythonCommand = resolvePythonCommand();
  const commandArgs = [];
  if (appType) {
    commandArgs.push(`"${appType}"`);
  }
  if (selectApp) {
    commandArgs.push("--select-app");
  }
  const stdout = execSync(`${pythonCommand} "${scriptPath}" ${commandArgs.join(" ")}`.trim(), {
    encoding: "utf-8",
    env: Object.assign({}, process.env, {
      PYTHONIOENCODING: "utf-8",
      PYTHONUTF8: "1"
    }),
    stdio: ["inherit", "pipe", "inherit"],
    timeout: 180000
  });
  const lines = stdout.trim().split("\n");
  return JSON.parse(lines[lines.length - 1]);
}

function resolveBaseUrl(cookieData) {
  return String((cookieData && cookieData.base_url) || CONFIG.defaultBaseUrl).replace(/\/+$/, "");
}

function isLoginExpired(payload) {
  return payload && payload.success === false && payload.errorCode === "307";
}

function isCsrfExpired(payload) {
  return payload && payload.success === false && payload.errorCode === "TIANSHU_000030";
}

function makeRequest(baseUrl, method, requestPath, cookies, body, headers) {
  return new Promise(function (resolve, reject) {
    const cookieHeader = (cookies || [])
      .map(function (cookie) { return cookie.name + "=" + cookie.value; })
      .join("; ");

    const parsedUrl = new URL(baseUrl);
    const requestModule = parsedUrl.protocol === "https:" ? https : http;
    const requestOptions = {
      hostname: parsedUrl.hostname,
      port: parsedUrl.port || (parsedUrl.protocol === "https:" ? 443 : 80),
      path: requestPath,
      method: method,
      headers: Object.assign({
        Origin: baseUrl,
        Referer: baseUrl + "/",
        Cookie: cookieHeader
      }, headers || {}),
      timeout: 30000
    };

    const request = requestModule.request(requestOptions, function (response) {
      let responseData = "";
      response.on("data", function (chunk) {
        responseData += chunk;
      });
      response.on("end", function () {
        try {
          resolve(JSON.parse(responseData));
        } catch (error) {
          reject(new Error("响应不是合法 JSON: " + responseData.slice(0, 500)));
        }
      });
    });

    request.on("timeout", function () {
      request.destroy();
      reject(new Error("请求超时: " + requestPath));
    });
    request.on("error", reject);

    if (body) {
      request.write(body);
    }
    request.end();
  });
}

async function requestWithAutoAuth(authRef, requestFactory) {
  let result = await requestFactory(authRef);
  if (isCsrfExpired(result)) {
    const refreshed = runLogin(true);
    authRef.cookieData = refreshed;
    authRef.cookies = refreshed.cookies;
    authRef.csrfToken = refreshed.csrf_token;
    authRef.baseUrl = resolveBaseUrl(refreshed);
    result = await requestFactory(authRef);
  }
  if (isLoginExpired(result)) {
    const relogin = runLogin(false);
    authRef.cookieData = relogin;
    authRef.cookies = relogin.cookies;
    authRef.csrfToken = relogin.csrf_token;
    authRef.baseUrl = resolveBaseUrl(relogin);
    result = await requestFactory(authRef);
  }
  return result;
}

function buildApiPath(appType, apiName, options) {
  const finalOptions = Object.assign({
    prefix: "",
    namespace: "dingtalk",
    timestamp: false
  }, options || {});
  const prefixPath = finalOptions.prefix ? "/" + finalOptions.prefix : "";
  const stamp = finalOptions.timestamp ? `?_stamp=${Date.now()}` : "";
  return `/${finalOptions.namespace}/web/${appType}${prefixPath}/query/formdesign/${apiName}.json${stamp}`;
}

async function fetchFormSchema(authRef, appType, formUuid) {
  return requestWithAutoAuth(authRef, function (auth) {
    const requestPath = buildApiPath(appType, "getFormSchema", {
      prefix: "_view",
      namespace: "alibaba"
    }) + "?" + querystring.stringify({
      formUuid: formUuid,
      schemaVersion: "V5"
    });
    return makeRequest(auth.baseUrl, "GET", requestPath, auth.cookies);
  });
}

async function fetchCandidateJson(authRef, baseUrl, candidates) {
  const warnings = [];

  for (const candidate of candidates) {
    try {
      const response = await requestWithAutoAuth(authRef, function (auth) {
        let requestPath = candidate.path;
        if (candidate.query && Object.keys(candidate.query).length) {
          requestPath += "?" + querystring.stringify(candidate.query);
        }
        let body = null;
        let headers = null;
        if (candidate.method === "POST") {
          body = querystring.stringify(Object.assign({
            _csrf_token: auth.csrfToken
          }, candidate.body || {}));
          headers = {
            "Content-Type": "application/x-www-form-urlencoded",
            "Content-Length": Buffer.byteLength(body)
          };
        }
        return makeRequest(baseUrl || auth.baseUrl, candidate.method, requestPath, auth.cookies, body, headers);
      });

      if (response && (response.success !== false || response.content || response.data)) {
        return {
          candidate: candidate,
          response: response,
          warnings: warnings
        };
      }

      warnings.push(`候选接口返回失败: ${candidate.name}`);
    } catch (error) {
      warnings.push(`候选接口异常 ${candidate.name}: ${error.message}`);
    }
  }

  return {
    candidate: null,
    response: null,
    warnings: warnings
  };
}

function normalizeTitle(rawValue, fallbackValue) {
  if (!rawValue) {
    return fallbackValue || "";
  }
  if (typeof rawValue === "string") {
    return rawValue;
  }
  if (rawValue.zh_CN) {
    return rawValue.zh_CN;
  }
  if (rawValue.en_US) {
    return rawValue.en_US;
  }
  return fallbackValue || "";
}

function flattenComponents(nodes, bucket) {
  (nodes || []).forEach(function (node) {
    bucket.push(node);
    if (node.children && Array.isArray(node.children)) {
      flattenComponents(node.children, bucket);
    }
  });
}

function inferRequired(component) {
  const props = component.props || {};
  if (props.required === true) {
    return true;
  }
  const validation = props.validation || [];
  return validation.some(function (rule) {
    return rule && (rule.required === true || rule.type === "required");
  });
}

function normalizeOptions(props) {
  if (!props) {
    return [];
  }
  const options = [];
  const dataSource = props.dataSource || props.options || [];
  (Array.isArray(dataSource) ? dataSource : []).forEach(function (item) {
    if (typeof item === "string") {
      options.push(item);
      return;
    }
    if (item && typeof item === "object") {
      options.push(item.text || item.label || item.value || "");
    }
  });
  return options.filter(Boolean);
}

function extractFieldsFromSchema(schema) {
  if (!schema || !schema.pages || !schema.pages.length) {
    return {};
  }

  const components = [];
  flattenComponents(schema.pages[0].componentsTree || [], components);
  const fields = {};

  components.forEach(function (component) {
    const props = component.props || {};
    const label = normalizeTitle(props.label, "");
    const fieldId = props.fieldId || "";
    const componentName = component.componentName || "";
    const isField = /Field$/.test(componentName) || componentName === "TableField";

    if (!isField || !label || !fieldId) {
      return;
    }

    fields[label] = {
      fieldId: fieldId,
      componentName: componentName,
      required: inferRequired(component),
      description: "",
      options: normalizeOptions(props)
    };
  });

  return fields;
}

function classifyPage(schema, discoveredPageType) {
  if (discoveredPageType) {
    return discoveredPageType;
  }
  const fields = extractFieldsFromSchema(schema);
  return Object.keys(fields).length ? "form" : "custom";
}

function summarizeSchema(schema) {
  if (!schema || !schema.pages || !schema.pages.length) {
    return {
      schemaType: "",
      componentCount: 0,
      fieldCount: 0
    };
  }
  const components = [];
  flattenComponents(schema.pages[0].componentsTree || [], components);
  const fieldCount = Object.keys(extractFieldsFromSchema(schema)).length;
  return {
    schemaType: schema.schemaType || "",
    componentCount: components.length,
    fieldCount: fieldCount
  };
}

function normalizePageEntry(rawPage, appType, baseUrl) {
  const formUuid = rawPage.formUuid || rawPage.pageId || rawPage.id || "";
  const title = normalizeTitle(rawPage.title || rawPage.name, formUuid);
  const pageType = rawPage.type || rawPage.pageType || rawPage.formType || "";
  const normalizedType = /display|custom/i.test(pageType) ? "custom" : /form|normal/i.test(pageType) ? "form" : "";

  return {
    name: title,
    title: title,
    type: normalizedType,
    formUuid: formUuid,
    url: normalizedType === "custom"
      ? `${baseUrl}/${appType}/custom/${formUuid}`
      : `${baseUrl}/${appType}/submission/${formUuid}`,
    discoveryNote: rawPage.discoveryNote || ""
  };
}

function parseRemotePageCandidates(payload, appType, baseUrl) {
  const content = payload && (payload.content || payload.data || payload.result || payload);
  const candidates = [];

  function pushPages(items, note) {
    (items || []).forEach(function (item) {
      if (!item) {
        return;
      }
      const normalized = normalizePageEntry(Object.assign({}, item, { discoveryNote: note || "" }), appType, baseUrl);
      if (normalized.formUuid) {
        candidates.push(normalized);
      }
    });
  }

  if (Array.isArray(content)) {
    pushPages(content, "remote-list");
  }
  if (content && Array.isArray(content.forms)) {
    pushPages(content.forms, "content.forms");
  }
  if (content && Array.isArray(content.pageList)) {
    pushPages(content.pageList, "content.pageList");
  }
  if (content && Array.isArray(content.pages)) {
    pushPages(content.pages, "content.pages");
  }
  if (content && content.appConfig && Array.isArray(content.appConfig.pages)) {
    pushPages(content.appConfig.pages, "content.appConfig.pages");
  }
  if (content && content.workbench && Array.isArray(content.workbench.pages)) {
    pushPages(content.workbench.pages, "content.workbench.pages");
  }

  const seen = new Set();
  return candidates.filter(function (page) {
    if (seen.has(page.formUuid)) {
      return false;
    }
    seen.add(page.formUuid);
    return true;
  });
}

async function discoverRemotePages(authRef, appType) {
  const candidates = [
    {
      name: "getWorkbenchConfig",
      method: "GET",
      path: buildApiPath(appType, "getWorkbenchConfig", { prefix: "_view", namespace: "alibaba" }),
      query: {}
    },
    {
      name: "getAppConfig",
      method: "GET",
      path: buildApiPath(appType, "getAppConfig", { prefix: "_view", namespace: "alibaba" }),
      query: {}
    },
    {
      name: "getFormList",
      method: "GET",
      path: buildApiPath(appType, "getFormList", { prefix: "_view", namespace: "alibaba" }),
      query: {}
    }
  ];

  const fetched = await fetchCandidateJson(authRef, authRef.baseUrl, candidates);
  const pages = fetched.response ? parseRemotePageCandidates(fetched.response, appType, authRef.baseUrl) : [];
  return {
    pages: pages,
    warnings: fetched.warnings,
    source: fetched.candidate ? fetched.candidate.name : "none"
  };
}

async function discoverAppMeta(authRef, appType, fallbackName) {
  const candidates = [
    {
      name: "getAppInfo",
      method: "GET",
      path: "/query/app/getAppInfo.json",
      query: { appType: appType }
    },
    {
      name: "getAppConfig",
      method: "GET",
      path: buildApiPath(appType, "getAppConfig", { prefix: "_view", namespace: "alibaba" }),
      query: {}
    }
  ];

  const fetched = await fetchCandidateJson(authRef, authRef.baseUrl, candidates);
  const response = fetched.response || {};
  const content = response.content || response.data || response.result || {};

  return {
    appName: normalizeTitle(content.appName || content.title || content.name, fallbackName || appType),
    warnings: fetched.warnings
  };
}

function loadManifest(manifestPath, appType, baseUrl) {
  if (!manifestPath) {
    return null;
  }
  const resolvedPath = path.isAbsolute(manifestPath)
    ? manifestPath
    : path.join(PROJECT_ROOT, manifestPath);
  const manifest = readJsonFile(resolvedPath);
  return {
    appName: manifest.appName || "",
    pages: (manifest.pages || []).map(function (page) {
      return normalizePageEntry(page, appType, baseUrl);
    }),
    path: resolvedPath
  };
}

function buildAppModel(meta) {
  return {
    appType: meta.appType,
    appName: meta.appName,
    corpId: meta.corpId,
    baseUrl: meta.baseUrl,
    importedAt: new Date().toISOString(),
    discovery: {
      source: meta.discoverySource,
      usedManifest: meta.usedManifest,
      warnings: meta.warnings || []
    },
    pages: meta.pages
  };
}

function writeAppArtifacts(appModel, options) {
  const prdDir = path.join(PROJECT_ROOT, "prd");
  const cacheDir = path.join(PROJECT_ROOT, ".cache");
  ensureDir(prdDir);
  ensureDir(cacheDir);

  const fileBase = sanitizeFileBase(options.outputName || appModel.appName || appModel.appType, appModel.appType.toLowerCase());
  const prdPath = path.join(prdDir, `${fileBase}.md`);
  const cachePath = path.join(cacheDir, `${fileBase}-schema.json`);

  if (!options.force) {
    if (fs.existsSync(prdPath) || fs.existsSync(cachePath)) {
      throw new Error(`目标文件已存在，请使用 --force 覆盖: ${fileBase}`);
    }
  }

  fs.writeFileSync(prdPath, renderPrd(appModel), "utf-8");
  fs.writeFileSync(cachePath, JSON.stringify(appModel, null, 2), "utf-8");

  return {
    prdPath: prdPath,
    cachePath: cachePath
  };
}

async function importApp(options) {
  let cookieData = loadCookieData();
  if (!cookieData) {
    cookieData = runLogin(false);
  }

  const authRef = {
    cookieData: cookieData,
    cookies: cookieData.cookies,
    csrfToken: cookieData.csrf_token,
    baseUrl: resolveBaseUrl(cookieData)
  };

  const manifest = loadManifest(options.manifestPath, options.appType, authRef.baseUrl);
  let remoteMeta = { appName: options.appName || options.appType, warnings: [] };
  let remotePages = { pages: [], warnings: [], source: "none" };

  if (manifest) {
    remoteMeta = {
      appName: manifest.appName || options.appName || options.appType,
      warnings: []
    };
    remotePages = {
      pages: manifest.pages,
      warnings: [],
      source: "manifest"
    };
  } else {
    try {
      const liveDiscovery = runLiveDiscovery(options.appType, options.selectApp || !options.appType);
      options.appType = liveDiscovery.appType;
      remoteMeta = {
        appName: liveDiscovery.appName || options.appName || options.appType,
        warnings: []
      };
      remotePages = {
        pages: (liveDiscovery.pages || []).map(function (page) {
          return normalizePageEntry(page, options.appType, liveDiscovery.baseUrl || authRef.baseUrl);
        }),
        warnings: [],
        source: "browser-formnav"
      };
      if (liveDiscovery.baseUrl) {
        authRef.baseUrl = liveDiscovery.baseUrl;
      }
      if (liveDiscovery.corpId) {
        authRef.cookieData.corp_id = liveDiscovery.corpId;
      }
    } catch (liveError) {
      remoteMeta = await discoverAppMeta(authRef, options.appType, options.appName);
      remotePages = await discoverRemotePages(authRef, options.appType);
      remotePages.warnings = (remotePages.warnings || []).concat([`browser discovery failed: ${liveError.message}`]);
    }
  }

  const warnings = []
    .concat(remoteMeta.warnings || [])
    .concat(remotePages.warnings || []);

  if (!remotePages.pages.length) {
    throw new Error("未发现任何页面。请提供 --manifest 文件，或补充发现接口。");
  }

  const normalizedPages = [];

  for (const page of remotePages.pages) {
    const schemaResponse = await fetchFormSchema(authRef, options.appType, page.formUuid);
    const schema = schemaResponse && (schemaResponse.content || schemaResponse.data || schemaResponse);
    const fields = extractFieldsFromSchema(schema);
    normalizedPages.push({
      name: page.name,
      title: page.title,
      type: classifyPage(schema, page.type),
      formUuid: page.formUuid,
      url: page.url,
      discoveryNote: page.discoveryNote || "",
      schemaSummary: summarizeSchema(schema),
      fields: fields
    });
  }

  const appModel = buildAppModel({
    appType: options.appType,
    appName: options.appName || (manifest && manifest.appName) || remoteMeta.appName || options.appType,
    corpId: authRef.cookieData.corp_id || "",
    baseUrl: authRef.baseUrl,
    discoverySource: remotePages.source,
    usedManifest: Boolean(manifest),
    warnings: warnings,
    pages: normalizedPages
  });

  const artifacts = writeAppArtifacts(appModel, options);
  return {
    appModel: appModel,
    prdPath: artifacts.prdPath,
    cachePath: artifacts.cachePath
  };
}

function loadAppModelByAppType(appType) {
  const cacheDir = path.join(PROJECT_ROOT, ".cache");
  if (!fs.existsSync(cacheDir)) {
    return null;
  }
  const files = fs.readdirSync(cacheDir).filter(function (fileName) {
    return fileName.endsWith("-schema.json");
  });

  for (const fileName of files) {
    const filePath = path.join(cacheDir, fileName);
    try {
      const model = readJsonFile(filePath);
      if (model.appType === appType) {
        return {
          model: model,
          path: filePath
        };
      }
    } catch (error) {
      continue;
    }
  }

  return null;
}

module.exports = {
  PROJECT_ROOT: PROJECT_ROOT,
  parseArgs: parseArgs,
  importApp: importApp,
  runLiveDiscovery: runLiveDiscovery,
  loadAppModelByAppType: loadAppModelByAppType,
  sanitizeFileBase: sanitizeFileBase,
  renderPrd: renderPrd
};
