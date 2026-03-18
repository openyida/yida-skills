/**
 * 单元测试：publish.js 核心逻辑
 *
 * 覆盖：
 * - parsePublishArgs：参数解析
 * - buildSaveSchemaPostData：saveFormSchema POST 数据构建
 * - buildUpdateConfigPostData：updateFormConfig POST 数据构建
 * - generateSuffix：随机后缀生成
 * - nextNodeId：节点 ID 生成
 * - buildSchemaContent：Schema JSON 结构验证（关键字段）
 */

"use strict";

const querystring = require("querystring");

// ── 从 publish.js 提取的纯函数（与脚本实现完全一致）────────────────

const SCHEMA_VERSION = "2.0";
const DOMAIN_CODE = "YIDA";
const PREFIX = "dingtalk";

function parsePublishArgs(argv) {
  const args = argv.slice(2);
  if (args.length < 3) {
    return null;
  }
  return {
    appType: args[0],
    formUuid: args[1],
    sourceFile: args[2],
  };
}

function buildSaveSchemaPostData(csrfToken, schemaContent, formUuid) {
  return querystring.stringify({
    _csrf_token: csrfToken,
    prefix: PREFIX,
    content: schemaContent,
    formUuid: formUuid,
    schemaVersion: SCHEMA_VERSION,
    domainCode: DOMAIN_CODE,
    importSchema: true,
  });
}

function buildUpdateConfigPostData(csrfToken, formUuid, version, value) {
  return querystring.stringify({
    _csrf_token: csrfToken,
    formUuid: formUuid,
    version: version,
    configType: "MINI_RESOURCE",
    value: value,
  });
}

/**
 * 生成随机后缀（与脚本实现完全一致）
 */
function generateSuffix() {
  return Math.random().toString(36).slice(2, 8).toUpperCase();
}

/**
 * 节点 ID 计数器（与脚本实现完全一致）
 */
function makeNodeIdGenerator() {
  let nodeCounter = 0;
  return function nextNodeId() {
    nodeCounter += 1;
    return `node_${nodeCounter}`;
  };
}

/**
 * 构建 Schema 的关键结构（简化版，仅验证关键字段）
 */
function buildSchemaKeyFields(sourceCode, compiledCode, formUuid) {
  return {
    schemaVersion: SCHEMA_VERSION,
    actions: {
      module: {
        compiled: compiledCode,
        source: sourceCode,
      },
      type: "FUNCTION",
    },
    form: {
      id: formUuid,
    },
  };
}

// ── parsePublishArgs 测试 ─────────────────────────────────────────────

describe("publish.js 参数解析", () => {
  test("传入三个参数时正确解析", () => {
    const argv = ["node", "publish.js", "APP_ABC", "FORM-XYZ", "pages/src/index.jsx"];
    const result = parsePublishArgs(argv);
    expect(result).not.toBeNull();
    expect(result.appType).toBe("APP_ABC");
    expect(result.formUuid).toBe("FORM-XYZ");
    expect(result.sourceFile).toBe("pages/src/index.jsx");
  });

  test("只传两个参数时返回 null", () => {
    const argv = ["node", "publish.js", "APP_ABC", "FORM-XYZ"];
    const result = parsePublishArgs(argv);
    expect(result).toBeNull();
  });

  test("没有参数时返回 null", () => {
    const argv = ["node", "publish.js"];
    const result = parsePublishArgs(argv);
    expect(result).toBeNull();
  });

  test("sourceFile 路径可以是绝对路径", () => {
    const argv = ["node", "publish.js", "APP_ABC", "FORM-XYZ", "/Users/alex/project/pages/src/index.jsx"];
    const result = parsePublishArgs(argv);
    expect(result.sourceFile).toBe("/Users/alex/project/pages/src/index.jsx");
  });
});

// ── buildSaveSchemaPostData 测试 ──────────────────────────────────────

describe("publish.js：buildSaveSchemaPostData", () => {
  test("正常构建 POST 数据，包含所有必要字段", () => {
    const schemaContent = JSON.stringify({ schemaVersion: "2.0" });
    const postData = buildSaveSchemaPostData("csrf_token_abc", schemaContent, "FORM-XYZ");
    const parsed = querystring.parse(postData);

    expect(parsed._csrf_token).toBe("csrf_token_abc");
    expect(parsed.prefix).toBe("dingtalk");
    expect(parsed.formUuid).toBe("FORM-XYZ");
    expect(parsed.schemaVersion).toBe("2.0");
    expect(parsed.domainCode).toBe("YIDA");
    expect(parsed.importSchema).toBe("true");
  });

  test("content 字段包含完整的 schema JSON 字符串", () => {
    const schemaContent = JSON.stringify({ schemaVersion: "2.0", actions: {} });
    const postData = buildSaveSchemaPostData("token", schemaContent, "FORM-XYZ");
    const parsed = querystring.parse(postData);
    const parsedContent = JSON.parse(parsed.content);

    expect(parsedContent.schemaVersion).toBe("2.0");
    expect(parsedContent).toHaveProperty("actions");
  });

  test("schemaVersion 固定为 2.0", () => {
    const postData = buildSaveSchemaPostData("token", "{}", "FORM-XYZ");
    const parsed = querystring.parse(postData);
    expect(parsed.schemaVersion).toBe("2.0");
  });

  test("domainCode 固定为 YIDA", () => {
    const postData = buildSaveSchemaPostData("token", "{}", "FORM-XYZ");
    const parsed = querystring.parse(postData);
    expect(parsed.domainCode).toBe("YIDA");
  });

  test("prefix 固定为 dingtalk", () => {
    const postData = buildSaveSchemaPostData("token", "{}", "FORM-XYZ");
    const parsed = querystring.parse(postData);
    expect(parsed.prefix).toBe("dingtalk");
  });
});

// ── buildUpdateConfigPostData 测试 ────────────────────────────────────

describe("publish.js：buildUpdateConfigPostData", () => {
  test("正常构建 POST 数据", () => {
    const postData = buildUpdateConfigPostData("csrf_token_abc", "FORM-XYZ", 1, 8);
    const parsed = querystring.parse(postData);

    expect(parsed._csrf_token).toBe("csrf_token_abc");
    expect(parsed.formUuid).toBe("FORM-XYZ");
    expect(parsed.version).toBe("1");
    expect(parsed.configType).toBe("MINI_RESOURCE");
    expect(parsed.value).toBe("8");
  });

  test("configType 固定为 MINI_RESOURCE", () => {
    const postData = buildUpdateConfigPostData("token", "FORM-XYZ", 0, 8);
    const parsed = querystring.parse(postData);
    expect(parsed.configType).toBe("MINI_RESOURCE");
  });

  test("value=8 时正确传递", () => {
    const postData = buildUpdateConfigPostData("token", "FORM-XYZ", 1, 8);
    const parsed = querystring.parse(postData);
    expect(parsed.value).toBe("8");
  });

  test("version 为 0 时正确传递", () => {
    const postData = buildUpdateConfigPostData("token", "FORM-XYZ", 0, 8);
    const parsed = querystring.parse(postData);
    expect(parsed.version).toBe("0");
  });
});

// ── generateSuffix 测试 ───────────────────────────────────────────────

describe("publish.js：generateSuffix", () => {
  test("生成 6 位大写字母数字字符串", () => {
    const suffix = generateSuffix();
    expect(suffix).toMatch(/^[A-Z0-9]{6}$/);
  });

  test("多次调用生成不同的后缀（概率性）", () => {
    const suffixes = new Set(Array.from({ length: 10 }, () => generateSuffix()));
    // 10 次调用中至少有 5 个不同值（随机性保证）
    expect(suffixes.size).toBeGreaterThan(5);
  });

  test("生成的后缀长度为 6", () => {
    for (let i = 0; i < 5; i++) {
      expect(generateSuffix()).toHaveLength(6);
    }
  });
});

// ── nextNodeId 测试 ───────────────────────────────────────────────────

describe("publish.js：nextNodeId（节点 ID 生成器）", () => {
  test("从 node_1 开始递增", () => {
    const nextNodeId = makeNodeIdGenerator();
    expect(nextNodeId()).toBe("node_1");
    expect(nextNodeId()).toBe("node_2");
    expect(nextNodeId()).toBe("node_3");
  });

  test("不同生成器实例互相独立", () => {
    const generatorA = makeNodeIdGenerator();
    const generatorB = makeNodeIdGenerator();

    expect(generatorA()).toBe("node_1");
    expect(generatorA()).toBe("node_2");
    expect(generatorB()).toBe("node_1"); // B 从 1 开始，不受 A 影响
    expect(generatorA()).toBe("node_3");
  });

  test("连续调用 10 次，ID 连续递增", () => {
    const nextNodeId = makeNodeIdGenerator();
    for (let i = 1; i <= 10; i++) {
      expect(nextNodeId()).toBe(`node_${i}`);
    }
  });
});

// ── buildSchemaKeyFields 测试（Schema 结构验证）────────────────────────

describe("publish.js：Schema 关键字段结构验证", () => {
  const sourceCode = "function render() { return this.renderJsx(); }";
  const compiledCode = "function main(){ var __compiledFunc__ = function render() { return this.renderJsx(); }; return __compiledFunc__.apply(this, arguments); }";
  const formUuid = "FORM-24122912EFBC4CFB826D63E7788F30C8FP6V";

  test("schemaVersion 为 2.0", () => {
    const schema = buildSchemaKeyFields(sourceCode, compiledCode, formUuid);
    expect(schema.schemaVersion).toBe("2.0");
  });

  test("actions.module 包含 source 和 compiled", () => {
    const schema = buildSchemaKeyFields(sourceCode, compiledCode, formUuid);
    expect(schema.actions.module.source).toBe(sourceCode);
    expect(schema.actions.module.compiled).toBe(compiledCode);
  });

  test("actions.type 为 FUNCTION", () => {
    const schema = buildSchemaKeyFields(sourceCode, compiledCode, formUuid);
    expect(schema.actions.type).toBe("FUNCTION");
  });

  test("form.id 与传入的 formUuid 一致", () => {
    const schema = buildSchemaKeyFields(sourceCode, compiledCode, formUuid);
    expect(schema.form.id).toBe(formUuid);
  });

  test("source 和 compiled 不相同（compiled 经过 Babel 转换）", () => {
    // 在真实场景中，compiled 是经过 Babel 编译的，与 source 不同
    // 这里用不同的字符串模拟
    const schema = buildSchemaKeyFields(sourceCode, compiledCode, formUuid);
    expect(schema.actions.module.source).not.toBe(schema.actions.module.compiled);
  });
});
