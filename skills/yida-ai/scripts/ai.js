#!/usr/bin/env node
/**
 * ai.js - 宜搭 AI 接口调用脚本
 *
 * 用法：
 *   node ai.js <prompt> [--max-tokens <number>] [--skill <skillType>]
 *
 * 示例：
 *   node ai.js "请帮我生成一段产品介绍"
 *   node ai.js "检查以下文本是否包含敏感词：..." --skill ToText
 *   node ai.js "分析以下销售数据的趋势：..." --max-tokens 5000
 */

"use strict";

const querystring = require("querystring");
const {
  loadCookieData,
  resolveBaseUrl,
  triggerLogin,
  refreshCsrfToken,
} = require("../../shared/fetch-with-retry");

// ── 常量 ──────────────────────────────────────────────────────────────

const AI_API_PATH = "/query/intelligent/txtFromAI.json?_api=nattyFetch&_mock=false";
const DEFAULT_MAX_TOKENS = 3000;
const DEFAULT_SKILL_TYPE = "ToText";

// ── 参数解析 ──────────────────────────────────────────────────────────

function parseArgs() {
  const args = process.argv.slice(2);

  if (args.length === 0 || args[0] === "--help" || args[0] === "-h") {
    printUsage();
    process.exit(0);
  }

  let prompt = null;
  let maxTokens = DEFAULT_MAX_TOKENS;
  let skillType = DEFAULT_SKILL_TYPE;

  for (let index = 0; index < args.length; index++) {
    const arg = args[index];
    if (arg === "--max-tokens" && args[index + 1]) {
      maxTokens = parseInt(args[index + 1], 10);
      if (isNaN(maxTokens) || maxTokens <= 0) {
        console.error("❌ --max-tokens 必须是正整数");
        process.exit(1);
      }
      index++;
    } else if (arg === "--skill" && args[index + 1]) {
      skillType = args[index + 1];
      index++;
    } else if (!arg.startsWith("--")) {
      prompt = arg;
    }
  }

  if (!prompt) {
    console.error("❌ 缺少 prompt 参数");
    printUsage();
    process.exit(1);
  }

  return { prompt, maxTokens, skillType };
}

function printUsage() {
  console.error(`
用法：
  node ai.js <prompt> [选项]

参数：
  prompt              提示词内容（必填）

选项：
  --max-tokens <n>    最大 token 数（默认 ${DEFAULT_MAX_TOKENS}）
  --skill <type>      技能类型（默认 ${DEFAULT_SKILL_TYPE}）
  --help, -h          显示帮助信息

示例：
  node ai.js "请帮我生成一段产品介绍"
  node ai.js "检查以下文本是否包含敏感词：xxx" --skill ToText
  node ai.js "分析以下销售数据的趋势：..." --max-tokens 5000
`);
}

// ── 调用宜搭 AI 接口 ──────────────────────────────────────────────────

async function callYidaAI(prompt, maxTokens, skillType, cookieData) {
  const baseUrl = resolveBaseUrl(cookieData);
  const url = `${baseUrl}${AI_API_PATH}`;

  const postBody = querystring.stringify({
    _csrf_token: cookieData.csrf_token,
    prompt,
    maxTokens,
    skill: skillType,
  });

  const { response, cookieData: updatedCookieData } = await fetchWithRetry(
    {
      url,
      method: "POST",
      body: postBody,
      headers: {
        "Content-Type": "application/x-www-form-urlencoded",
      },
    },
    {
      cookieData,
      onAuthUpdate: (newCookieData) => {
        cookieData = newCookieData;
      },
    }
  );

  return { response, cookieData: updatedCookieData };
}

// ── 格式化输出 ────────────────────────────────────────────────────────

function formatAIResponse(response) {
  if (!response || !response.success) {
    const errorMsg = response ? response.errorMsg || "未知错误" : "请求失败";
    const errorCode = response ? response.errorCode || "" : "";
    throw new Error(`AI 接口调用失败${errorCode ? `（${errorCode}）` : ""}：${errorMsg}`);
  }

  // 提取 AI 返回的文本内容
  const content = response.content;
  if (content === null || content === undefined) {
    throw new Error("AI 接口返回内容为空");
  }

  // content 可能是字符串或对象，统一处理
  if (typeof content === "string") {
    return content;
  }

  if (typeof content === "object") {
    // 尝试常见字段：text、result、data、message
    const textContent = content.text || content.result || content.data || content.message;
    if (textContent) return String(textContent);
    return JSON.stringify(content, null, 2);
  }

  return String(content);
}

// ── 主流程 ────────────────────────────────────────────────────────────

async function main() {
  const { prompt, maxTokens, skillType } = parseArgs();

  console.error("\n🤖 宜搭 AI 调用工具");
  console.error("=".repeat(50));
  console.error(`  Prompt:     ${prompt.length > 60 ? prompt.slice(0, 60) + "..." : prompt}`);
  console.error(`  MaxTokens:  ${maxTokens}`);
  console.error(`  Skill:      ${skillType}`);
  console.error("=".repeat(50));

  // Step 1: 读取登录态
  console.error("\n🔑 Step 1: 读取登录态");
  let cookieData = loadCookieData();
  if (!cookieData || !cookieData.csrf_token) {
    console.error("  ⚠️  未找到本地登录态，触发登录...");
    cookieData = triggerLogin();
  }
  const baseUrl = resolveBaseUrl(cookieData);
  console.error(`  ✅ 登录态已就绪，平台地址：${baseUrl}`);

  // Step 2: 调用 AI 接口
  console.error("\n📡 Step 2: 调用宜搭 AI 接口\n");
  const { response } = await callYidaAI(prompt, maxTokens, skillType, cookieData);
  console.error(`  HTTP 响应已收到，success=${response && response.success}`);

  // Step 3: 解析并输出结果
  console.error("\n✅ Step 3: 解析结果\n");
  const resultText = formatAIResponse(response);

  console.error("=".repeat(50));
  console.error("  AI 调用成功！");
  console.error("=".repeat(50));

  // 将 AI 返回内容输出到 stdout，供 AI 助手读取
  console.log(resultText);
}

main().catch((error) => {
  console.error(`\n❌ 调用异常：${error.message}`);
  process.exit(1);
});
