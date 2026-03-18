/**
 * 单元测试：verify-short-url.js 核心逻辑
 *
 * 覆盖：
 * - validateUrl：URL 格式验证（/o/ 和 /s/ 两种格式）
 * - parseArgs 逻辑：参数解析和 urlType 判断
 */

"use strict";

// ── 从脚本中提取的纯函数（与脚本实现完全一致）────────────────────

/**
 * 解析命令行参数，判断 URL 类型
 */
function parseVerifyShortUrlArgs(argv) {
  const args = argv.slice(2);
  if (args.length < 3) {
    return null;
  }
  const url = args[2];
  const urlType = url.startsWith("/o/") ? "open" : url.startsWith("/s/") ? "share" : null;
  return {
    appType: args[0],
    formUuid: args[1],
    url: url,
    urlType: urlType,
  };
}

/**
 * 验证 URL 格式
 * - /o/xxx - 公开访问（对外）
 * - /s/xxx - 组织内分享（对内）
 */
function validateUrl(url, urlType) {
  if (!urlType) {
    throw new Error(`URL 必须以 /o/ 或 /s/ 开头，当前值: ${url}`);
  }
  const pathPart = url.slice(3);
  if (!/^[a-zA-Z0-9_-]+$/.test(pathPart)) {
    throw new Error(`URL 路径部分只支持 a-z A-Z 0-9 _ -，当前值: ${url}`);
  }
  if (pathPart.length === 0) {
    throw new Error(`URL 路径部分不能为空: ${url}`);
  }
  return true;
}

// ── parseVerifyShortUrlArgs 测试 ─────────────────────────────────────

describe("verify-short-url.js 参数解析", () => {
  test("传入三个参数时正确解析", () => {
    const argv = ["node", "verify-short-url.js", "APP_ABC", "FORM-XYZ", "/o/mypage"];
    const result = parseVerifyShortUrlArgs(argv);
    expect(result).not.toBeNull();
    expect(result.appType).toBe("APP_ABC");
    expect(result.formUuid).toBe("FORM-XYZ");
    expect(result.url).toBe("/o/mypage");
    expect(result.urlType).toBe("open");
  });

  test("/o/ 开头的 URL 识别为 open 类型", () => {
    const argv = ["node", "verify-short-url.js", "APP_ABC", "FORM-XYZ", "/o/abc123"];
    const result = parseVerifyShortUrlArgs(argv);
    expect(result.urlType).toBe("open");
  });

  test("/s/ 开头的 URL 识别为 share 类型", () => {
    const argv = ["node", "verify-short-url.js", "APP_ABC", "FORM-XYZ", "/s/internal"];
    const result = parseVerifyShortUrlArgs(argv);
    expect(result.urlType).toBe("share");
  });

  test("非 /o/ 或 /s/ 开头的 URL，urlType 为 null", () => {
    const argv = ["node", "verify-short-url.js", "APP_ABC", "FORM-XYZ", "/p/invalid"];
    const result = parseVerifyShortUrlArgs(argv);
    expect(result.urlType).toBeNull();
  });

  test("参数不足时返回 null", () => {
    const argv = ["node", "verify-short-url.js", "APP_ABC", "FORM-XYZ"];
    const result = parseVerifyShortUrlArgs(argv);
    expect(result).toBeNull();
  });

  test("没有参数时返回 null", () => {
    const argv = ["node", "verify-short-url.js"];
    const result = parseVerifyShortUrlArgs(argv);
    expect(result).toBeNull();
  });
});

// ── validateUrl 测试 ─────────────────────────────────────────────────

describe("validateUrl", () => {
  // 正常情况
  test("/o/ 格式的合法 URL 验证通过", () => {
    expect(validateUrl("/o/mypage", "open")).toBe(true);
  });

  test("/s/ 格式的合法 URL 验证通过", () => {
    expect(validateUrl("/s/internal", "share")).toBe(true);
  });

  test("包含数字的 URL 验证通过", () => {
    expect(validateUrl("/o/page123", "open")).toBe(true);
  });

  test("包含下划线的 URL 验证通过", () => {
    expect(validateUrl("/o/my_page", "open")).toBe(true);
  });

  test("包含连字符的 URL 验证通过", () => {
    expect(validateUrl("/o/my-page", "open")).toBe(true);
  });

  test("混合字符的 URL 验证通过", () => {
    expect(validateUrl("/o/My_Page-123", "open")).toBe(true);
  });

  // urlType 为 null 时抛出错误
  test("urlType 为 null 时抛出错误", () => {
    expect(() => validateUrl("/p/invalid", null)).toThrow("URL 必须以 /o/ 或 /s/ 开头");
  });

  test("以 /x/ 开头的 URL，urlType 为 null 时抛出错误", () => {
    expect(() => validateUrl("/x/something", null)).toThrow("URL 必须以 /o/ 或 /s/ 开头");
  });

  // 路径部分为空
  // 注意：空字符串不匹配 /^[a-zA-Z0-9_-]+$/（要求至少一个字符），
  // 因此正则校验先于长度校验触发，实际抛出"只支持..."错误。
  test("路径部分为空时抛出错误（/o/ 后无内容）", () => {
    expect(() => validateUrl("/o/", "open")).toThrow("只支持 a-z A-Z 0-9 _ -");
  });

  test("路径部分为空时抛出错误（/s/ 后无内容）", () => {
    expect(() => validateUrl("/s/", "share")).toThrow("只支持 a-z A-Z 0-9 _ -");
  });

  // 包含非法字符
  test("路径部分包含中文时抛出错误", () => {
    expect(() => validateUrl("/o/我的页面", "open")).toThrow("只支持 a-z A-Z 0-9 _ -");
  });

  test("路径部分包含空格时抛出错误", () => {
    expect(() => validateUrl("/o/my page", "open")).toThrow("只支持 a-z A-Z 0-9 _ -");
  });

  test("路径部分包含点号时抛出错误", () => {
    expect(() => validateUrl("/o/my.page", "open")).toThrow("只支持 a-z A-Z 0-9 _ -");
  });

  test("路径部分包含斜杠时抛出错误", () => {
    expect(() => validateUrl("/o/my/page", "open")).toThrow("只支持 a-z A-Z 0-9 _ -");
  });

  test("路径部分包含 @ 符号时抛出错误", () => {
    expect(() => validateUrl("/o/my@page", "open")).toThrow("只支持 a-z A-Z 0-9 _ -");
  });
});
