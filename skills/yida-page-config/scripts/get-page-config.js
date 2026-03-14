const https = require("https");
const http = require("http");
const fs = require("fs");
const path = require("path");
const querystring = require("querystring");
const { execSync } = require("child_process");

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

const PROJECT_ROOT = findProjectRoot();
const COOKIE_FILE = path.join(PROJECT_ROOT, ".cache", "cookies.json");
const LOGIN_SCRIPT = path.join(PROJECT_ROOT, "skills", "yida-login", "scripts", "login.py");

function loadCookieData() {
  if (!fs.existsSync(COOKIE_FILE)) return null;
  try {
    const parsed = JSON.parse(fs.readFileSync(COOKIE_FILE, "utf-8"));
    const cookies = Array.isArray(parsed) ? parsed : parsed.cookies;
    const base_url = parsed.base_url || "https://www.aliwork.com";
    let csrfToken = null;
    for (const c of cookies || []) {
      if (c.name === "tianshu_csrf_token") csrfToken = c.value;
    }
    return { cookies, base_url, csrf_token: csrfToken };
  } catch { return null; }
}

function sendRequest(baseUrl, cookies, method, requestPath, postData = null) {
  return new Promise((resolve, reject) => {
    const cookieHeader = cookies.map(c => `${c.name}=${c.value}`).join("; ");
    const parsedUrl = new URL(baseUrl);
    const isHttps = parsedUrl.protocol === "https:";
    const req = (isHttps ? https : http).request({
      hostname: parsedUrl.hostname,
      port: parsedUrl.port || (isHttps ? 443 : 80),
      path: postData ? requestPath : `${requestPath}?${querystring.stringify(postData)}`,
      method: method,
      headers: {
        Origin: baseUrl, Referer: baseUrl + "/", Cookie: cookieHeader,
        Accept: "application/json", "Content-Type": "application/x-www-form-urlencoded",
        "x-requested-with": "XMLHttpRequest",
      },
      timeout: 30000,
    }, res => {
      let data = "";
      res.on("data", chunk => data += chunk);
      res.on("end", () => resolve(JSON.parse(data)));
    });
    req.on("error", reject);
    req.on("timeout", () => { req.destroy(); reject(new Error("timeout")); });
    if (postData) req.write(querystring.stringify(postData));
    req.end();
  });
}

async function main() {
  const [appType, formUuid] = process.argv.slice(2);
  if (!appType || !formUuid) {
    console.error("用法: node get-page-config.js <appType> <formUuid>");
    process.exit(1);
  }

  let cookieData = loadCookieData();
  if (!cookieData) cookieData = JSON.parse(execSync(`python3 "${LOGIN_SCRIPT}"`).toString().split("\n").pop());
  const { cookies, base_url, csrf_token } = cookieData;

  const shareConfig = await sendRequest(base_url, cookies, "POST", `/dingtalk/web/${appType}/query/formdesign/getShareConfig.json`, {
    _api: "Share.getShareConfig", formUuid, _csrf_token: csrf_token, _locale_time_zone_offset: "28800000"
  });

  const result = {
    isOpen: shareConfig.content?.isOpen === "y",
    openUrl: shareConfig.content?.openUrl,
    shareUrl: shareConfig.content?.shareUrl,
  };

  console.log(JSON.stringify(result, null, 2));
  if (result.openUrl) console.error(`公开访问: ${base_url}${result.openUrl}`);
  if (result.shareUrl) console.error(`组织内分享: ${base_url}${result.shareUrl}`);
}

main().catch(e => { console.error(e.message); process.exit(1); });
