#!/usr/bin/env node
/**
 * yida-utils.js - 宜搭脚本公共工具函数
 *
 * 被以下脚本共享引用：
 *   - yida-create-app/scripts/create-app.js
 *   - yida-create-page/scripts/create-page.js
 *   - yida-create-form-page/scripts/create-form-page.js
 *   - yida-get-schema/scripts/get-schema.js
 *   - yida-publish-page/scripts/publish.js
 */

const fs = require("fs");
const path = require("path");
const { execSync } = require("child_process");

// ── 项目根目录 ────────────────────────────────────────

/**
 * 查找项目根目录（通过向上查找 README.md 或 .git 目录）
 * @returns {string} 项目根目录路径
 */
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
const CONFIG_PATH = path.join(PROJECT_ROOT, "config.json");
const CONFIG = fs.existsSync(CONFIG_PATH)
  ? JSON.parse(fs.readFileSync(CONFIG_PATH, "utf-8"))
  : {};

const DEFAULT_BASE_URL = CONFIG.defaultBaseUrl || "https://www.aliwork.com";
const COOKIE_FILE = path.join(PROJECT_ROOT, ".cache", "cookies.json");
const LOGIN_SCRIPT = path.join(
  PROJECT_ROOT,
  ".claude",
  "skills",
  "yida-login",
  "scripts",
  "login.py"
);

// ── Cookie 解析 ───────────────────────────────────────

/**
 * 从 Cookie 列表中提取 csrf_token 和 corp_id
 * - csrf_token：name="tianshu_csrf_token" 的 cookie value
 * - corp_id：name="tianshu_corp_user" 的 cookie value，格式 "{corpId}_{userId}"，按最后一个 "_" 分隔
 *
 * @param {Array<{name: string, value: string}>} cookies
 * @returns {{ csrfToken: string|null, corpId: string|null }}
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

/**
 * 读取并解析 .cache/cookies.json，返回含 csrf_token、corp_id 的 cookieData 对象。
 * 兼容旧版纯数组格式和新版含 base_url 的对象格式。
 *
 * @returns {object|null} cookieData，失败返回 null
 */
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
    if (!cookieData.cookies || cookieData.cookies.length === 0) return null;
    const { csrfToken, corpId } = extractInfoFromCookies(cookieData.cookies);
    if (csrfToken) cookieData.csrf_token = csrfToken;
    if (corpId) cookieData.corp_id = corpId;
    return cookieData;
  } catch {
    return null;
  }
}

/**
 * 从 cookieData 中解析 base_url，去除末尾斜杠。
 *
 * @param {object|null} cookieData
 * @returns {string}
 */
function resolveBaseUrl(cookieData) {
  return ((cookieData && cookieData.base_url) || DEFAULT_BASE_URL).replace(/\/+$/, "");
}

// ── 登录态检测 ────────────────────────────────────────

/**
 * 检测响应体是否表示登录过期
 * 登录过期响应：{"success":false,"errorCode":"307","errorMsg":"登录状态已过期，请刷新页面后重新访问"}
 *
 * @param {object} responseJson
 * @returns {boolean}
 */
function isLoginExpired(responseJson) {
  return (
    responseJson &&
    responseJson.success === false &&
    responseJson.errorCode === "307"
  );
}

/**
 * 检测响应体是否表示 csrf_token 过期
 * csrf 过期响应：{"success":false,"errorCode":"TIANSHU_000030","errorMsg":"csrf校验失败"}
 *
 * @param {object} responseJson
 * @returns {boolean}
 */
function isCsrfTokenExpired(responseJson) {
  return (
    responseJson &&
    responseJson.success === false &&
    responseJson.errorCode === "TIANSHU_000030"
  );
}

// ── 登录操作 ──────────────────────────────────────────

/**
 * 调用 login.py 触发扫码重新登录。
 * 登录成功后返回含 csrf_token、cookies 的对象。
 *
 * @returns {object} loginResult
 */
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

/**
 * 调用 login.py --refresh-csrf 刷新 csrf_token（无需重新扫码）。
 * 适用于接口响应 errorCode 为 "TIANSHU_000030" 的场景。
 *
 * @returns {object} 含 csrf_token、cookies 的对象
 */
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
    if (!result.csrf_token || !result.cookies) {
      throw new Error("刷新结果缺少 csrf_token 或 cookies");
    }
    return result;
  } catch (err) {
    console.error(`  ❌ 解析刷新结果失败: ${err.message}`);
    process.exit(1);
  }
}

module.exports = {
  findProjectRoot,
  PROJECT_ROOT,
  DEFAULT_BASE_URL,
  COOKIE_FILE,
  LOGIN_SCRIPT,
  extractInfoFromCookies,
  loadCookieData,
  resolveBaseUrl,
  isLoginExpired,
  isCsrfTokenExpired,
  triggerLogin,
  refreshCsrfToken,
};
