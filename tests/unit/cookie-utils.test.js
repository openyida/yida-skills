/**
 * 单元测试：Cookie 解析工具函数
 *
 * 覆盖所有 skill 脚本中共用的 Cookie 相关纯函数：
 * - extractInfoFromCookies
 * - isLoginExpired
 * - isCsrfTokenExpired
 * - resolveBaseUrl
 */

"use strict";

// ── 从脚本中提取的纯函数（与各脚本实现完全一致）────────────────────

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

function isLoginExpired(responseJson) {
  return responseJson && responseJson.success === false && (responseJson.errorCode === "307" || responseJson.errorCode === "302");
}

function isCsrfTokenExpired(responseJson) {
  return responseJson && responseJson.success === false && responseJson.errorCode === "TIANSHU_000030";
}

function resolveBaseUrl(cookieData) {
  const defaultBaseUrl = "https://www.aliwork.com";
  return ((cookieData && cookieData.base_url) || defaultBaseUrl).replace(/\/+$/, "");
}

// ── extractInfoFromCookies 测试 ──────────────────────────────────────

describe("extractInfoFromCookies", () => {
  test("正常提取 csrfToken 和 corpId", () => {
    const cookies = [
      { name: "tianshu_csrf_token", value: "abc123" },
      { name: "tianshu_corp_user", value: "CORP001_USER001" },
    ];
    const result = extractInfoFromCookies(cookies);
    expect(result.csrfToken).toBe("abc123");
    expect(result.corpId).toBe("CORP001");
  });

  test("corpId 含多个下划线时，按最后一个下划线分割", () => {
    const cookies = [
      { name: "tianshu_corp_user", value: "CORP_WITH_UNDERSCORES_userId123" },
    ];
    const result = extractInfoFromCookies(cookies);
    expect(result.corpId).toBe("CORP_WITH_UNDERSCORES");
  });

  test("corpId 只有一个下划线时，正确分割", () => {
    const cookies = [
      { name: "tianshu_corp_user", value: "CORPID_USERID" },
    ];
    const result = extractInfoFromCookies(cookies);
    expect(result.corpId).toBe("CORPID");
  });

  test("tianshu_corp_user 没有下划线时，corpId 为 null", () => {
    const cookies = [
      { name: "tianshu_corp_user", value: "NOUNDERSCORE" },
    ];
    const result = extractInfoFromCookies(cookies);
    expect(result.corpId).toBeNull();
  });

  test("tianshu_corp_user 以下划线开头时（lastIndexOf=0），corpId 为 null", () => {
    const cookies = [
      { name: "tianshu_corp_user", value: "_USERID" },
    ];
    const result = extractInfoFromCookies(cookies);
    // lastIndexOf("_") === 0，不满足 > 0，corpId 应为 null
    expect(result.corpId).toBeNull();
  });

  test("Cookie 列表为空时，返回 null", () => {
    const result = extractInfoFromCookies([]);
    expect(result.csrfToken).toBeNull();
    expect(result.corpId).toBeNull();
  });

  test("不包含目标 Cookie 时，返回 null", () => {
    const cookies = [
      { name: "other_cookie", value: "some_value" },
      { name: "another_cookie", value: "another_value" },
    ];
    const result = extractInfoFromCookies(cookies);
    expect(result.csrfToken).toBeNull();
    expect(result.corpId).toBeNull();
  });

  test("只有 csrfToken，没有 corpUser Cookie 时", () => {
    const cookies = [
      { name: "tianshu_csrf_token", value: "token_xyz" },
    ];
    const result = extractInfoFromCookies(cookies);
    expect(result.csrfToken).toBe("token_xyz");
    expect(result.corpId).toBeNull();
  });

  test("多个同名 Cookie 时，以最后一个为准", () => {
    const cookies = [
      { name: "tianshu_csrf_token", value: "first_token" },
      { name: "tianshu_csrf_token", value: "second_token" },
    ];
    const result = extractInfoFromCookies(cookies);
    expect(result.csrfToken).toBe("second_token");
  });
});

// ── isLoginExpired 测试 ──────────────────────────────────────────────

describe("isLoginExpired", () => {
  test("登录过期响应返回 true", () => {
    const response = {
      success: false,
      errorCode: "307",
      errorMsg: "登录状态已过期，请刷新页面后重新访问",
    };
    expect(isLoginExpired(response)).toBe(true);
  });

  test("成功响应返回 false", () => {
    const response = { success: true, content: "APP_XXX" };
    expect(isLoginExpired(response)).toBe(false);
  });

  test("其他错误码返回 false", () => {
    const response = { success: false, errorCode: "500", errorMsg: "服务器错误" };
    expect(isLoginExpired(response)).toBe(false);
  });

  test("null 返回 false", () => {
    expect(isLoginExpired(null)).toBeFalsy();
  });

  test("undefined 返回 false", () => {
    expect(isLoginExpired(undefined)).toBeFalsy();
  });

  test("success 为 true 但 errorCode 为 307 时返回 false", () => {
    const response = { success: true, errorCode: "307" };
    expect(isLoginExpired(response)).toBe(false);
  });
});

// ── isCsrfTokenExpired 测试 ──────────────────────────────────────────

describe("isCsrfTokenExpired", () => {
  test("csrf 过期响应返回 true", () => {
    const response = {
      success: false,
      errorCode: "TIANSHU_000030",
      errorMsg: "csrf校验失败",
    };
    expect(isCsrfTokenExpired(response)).toBe(true);
  });

  test("成功响应返回 false", () => {
    const response = { success: true, content: {} };
    expect(isCsrfTokenExpired(response)).toBe(false);
  });

  test("登录过期错误码（307）返回 false", () => {
    const response = { success: false, errorCode: "307" };
    expect(isCsrfTokenExpired(response)).toBe(false);
  });

  test("null 返回 false", () => {
    expect(isCsrfTokenExpired(null)).toBeFalsy();
  });

  test("undefined 返回 false", () => {
    expect(isCsrfTokenExpired(undefined)).toBeFalsy();
  });
});

// ── resolveBaseUrl 测试 ──────────────────────────────────────────────

describe("resolveBaseUrl", () => {
  test("正常 base_url 直接返回", () => {
    const cookieData = { base_url: "https://example.aliwork.com" };
    expect(resolveBaseUrl(cookieData)).toBe("https://example.aliwork.com");
  });

  test("末尾有斜杠时去掉", () => {
    const cookieData = { base_url: "https://example.aliwork.com/" };
    expect(resolveBaseUrl(cookieData)).toBe("https://example.aliwork.com");
  });

  test("末尾有多个斜杠时全部去掉", () => {
    const cookieData = { base_url: "https://example.aliwork.com///" };
    expect(resolveBaseUrl(cookieData)).toBe("https://example.aliwork.com");
  });

  test("cookieData 为 null 时返回默认 URL", () => {
    expect(resolveBaseUrl(null)).toBe("https://www.aliwork.com");
  });

  test("cookieData 没有 base_url 时返回默认 URL", () => {
    expect(resolveBaseUrl({})).toBe("https://www.aliwork.com");
  });

  test("base_url 为空字符串时返回默认 URL", () => {
    const cookieData = { base_url: "" };
    expect(resolveBaseUrl(cookieData)).toBe("https://www.aliwork.com");
  });

  test("http 协议的 base_url 正常处理", () => {
    const cookieData = { base_url: "http://localhost:8080/" };
    expect(resolveBaseUrl(cookieData)).toBe("http://localhost:8080");
  });
});
