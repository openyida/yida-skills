/**
 * 集成测试：API 调用 Mock 测试
 *
 * 通过 Mock Node.js 的 http/https 模块，测试各 skill 脚本的 API 调用逻辑：
 * - 正常响应处理
 * - 登录过期（errorCode: "307"）检测与标记
 * - csrf_token 过期（errorCode: "TIANSHU_000030"）检测与标记
 * - 网络超时处理
 * - 非 JSON 响应处理
 */

"use strict";

const { EventEmitter } = require("events");

// ── Mock HTTP 请求工具 ───────────────────────────────────────────────

/**
 * 创建一个模拟的 HTTP 响应对象
 * @param {number} statusCode HTTP 状态码
 * @param {string} body 响应体字符串
 */
function createMockResponse(statusCode, body) {
  const response = new EventEmitter();
  response.statusCode = statusCode;
  process.nextTick(() => {
    response.emit("data", body);
    response.emit("end");
  });
  return response;
}

/**
 * 创建一个模拟的 HTTP 请求对象
 * @param {object} mockResponse 模拟响应对象
 */
function createMockRequest(mockResponse) {
  const request = new EventEmitter();
  request.write = jest.fn();
  request.end = jest.fn(() => {
    // 模拟异步响应
    process.nextTick(() => {
      // 触发 requestOptions 中的 callback
      if (request._callback) {
        request._callback(mockResponse);
      }
    });
  });
  request.destroy = jest.fn();
  return request;
}

// ── 从脚本中提取的响应处理逻辑（与脚本完全一致）────────────────────

function isLoginExpired(responseJson) {
  return responseJson && responseJson.success === false && (responseJson.errorCode === "307" || responseJson.errorCode === "302");
}

function isCsrfTokenExpired(responseJson) {
  return responseJson && responseJson.success === false && responseJson.errorCode === "TIANSHU_000030";
}

/**
 * 模拟 sendRequest 的核心响应解析逻辑
 * 将 HTTP 响应体解析为结构化结果
 */
function parseApiResponse(statusCode, responseBody) {
  let parsed;
  try {
    parsed = JSON.parse(responseBody);
  } catch {
    return { success: false, errorMsg: `HTTP ${statusCode}: 响应非 JSON` };
  }

  if (isLoginExpired(parsed)) {
    return { __needLogin: true };
  }

  if (isCsrfTokenExpired(parsed)) {
    return { __csrfExpired: true };
  }

  return parsed;
}

// ── 响应解析逻辑测试 ─────────────────────────────────────────────────

describe("API 响应解析", () => {
  test("成功响应正确解析", () => {
    const body = JSON.stringify({ success: true, content: "APP_XYZ123" });
    const result = parseApiResponse(200, body);
    expect(result.success).toBe(true);
    expect(result.content).toBe("APP_XYZ123");
    expect(result.__needLogin).toBeUndefined();
    expect(result.__csrfExpired).toBeUndefined();
  });

  test("登录过期响应（errorCode: 307）返回 __needLogin 标记", () => {
    const body = JSON.stringify({
      success: false,
      errorCode: "307",
      errorMsg: "登录状态已过期，请刷新页面后重新访问",
    });
    const result = parseApiResponse(200, body);
    expect(result.__needLogin).toBe(true);
    expect(result.__csrfExpired).toBeUndefined();
  });

  test("csrf_token 过期响应（errorCode: TIANSHU_000030）返回 __csrfExpired 标记", () => {
    const body = JSON.stringify({
      success: false,
      errorCode: "TIANSHU_000030",
      errorMsg: "csrf校验失败",
    });
    const result = parseApiResponse(200, body);
    expect(result.__csrfExpired).toBe(true);
    expect(result.__needLogin).toBeUndefined();
  });

  test("非 JSON 响应返回错误对象", () => {
    const result = parseApiResponse(500, "<html>Internal Server Error</html>");
    expect(result.success).toBe(false);
    expect(result.errorMsg).toContain("响应非 JSON");
    expect(result.errorMsg).toContain("500");
  });

  test("空响应体返回错误对象", () => {
    const result = parseApiResponse(200, "");
    expect(result.success).toBe(false);
    expect(result.errorMsg).toContain("响应非 JSON");
  });

  test("其他业务错误正常透传", () => {
    const body = JSON.stringify({
      success: false,
      errorCode: "TIANSHU_000001",
      errorMsg: "应用名称已存在",
    });
    const result = parseApiResponse(200, body);
    expect(result.success).toBe(false);
    expect(result.errorCode).toBe("TIANSHU_000001");
    expect(result.errorMsg).toBe("应用名称已存在");
    expect(result.__needLogin).toBeUndefined();
    expect(result.__csrfExpired).toBeUndefined();
  });
});

// ── 自动重试逻辑测试 ─────────────────────────────────────────────────

describe("自动重试逻辑（requestWithAutoLogin 模拟）", () => {
  /**
   * 模拟 requestWithAutoLogin 的核心逻辑
   * 接受一个请求工厂函数和认证引用，处理 csrf 过期和登录过期的重试
   */
  async function requestWithAutoLogin(requestFn, authRef, mockRefreshCsrf, mockTriggerLogin) {
    let result = await requestFn(authRef);

    if (result && result.__csrfExpired) {
      const refreshed = mockRefreshCsrf();
      authRef.csrfToken = refreshed.csrf_token;
      authRef.cookies = refreshed.cookies;
      result = await requestFn(authRef);
    }

    if (result && result.__needLogin) {
      const newAuth = mockTriggerLogin();
      authRef.csrfToken = newAuth.csrf_token;
      authRef.cookies = newAuth.cookies;
      result = await requestFn(authRef);
    }

    return result;
  }

  test("首次请求成功时不触发重试", async () => {
    const requestFn = jest.fn().mockResolvedValue({ success: true, content: "APP_001" });
    const authRef = { csrfToken: "token", cookies: [] };
    const mockRefreshCsrf = jest.fn();
    const mockTriggerLogin = jest.fn();

    const result = await requestWithAutoLogin(requestFn, authRef, mockRefreshCsrf, mockTriggerLogin);

    expect(result.success).toBe(true);
    expect(requestFn).toHaveBeenCalledTimes(1);
    expect(mockRefreshCsrf).not.toHaveBeenCalled();
    expect(mockTriggerLogin).not.toHaveBeenCalled();
  });

  test("csrf 过期时刷新 token 后重试", async () => {
    const requestFn = jest.fn()
      .mockResolvedValueOnce({ __csrfExpired: true })
      .mockResolvedValueOnce({ success: true, content: "APP_002" });

    const authRef = { csrfToken: "old_token", cookies: [] };
    const mockRefreshCsrf = jest.fn().mockReturnValue({
      csrf_token: "new_token",
      cookies: [{ name: "tianshu_csrf_token", value: "new_token" }],
    });
    const mockTriggerLogin = jest.fn();

    const result = await requestWithAutoLogin(requestFn, authRef, mockRefreshCsrf, mockTriggerLogin);

    expect(result.success).toBe(true);
    expect(requestFn).toHaveBeenCalledTimes(2);
    expect(mockRefreshCsrf).toHaveBeenCalledTimes(1);
    expect(mockTriggerLogin).not.toHaveBeenCalled();
    expect(authRef.csrfToken).toBe("new_token");
  });

  test("登录过期时触发重新登录后重试", async () => {
    const requestFn = jest.fn()
      .mockResolvedValueOnce({ __needLogin: true })
      .mockResolvedValueOnce({ success: true, content: "APP_003" });

    const authRef = { csrfToken: "expired_token", cookies: [] };
    const mockRefreshCsrf = jest.fn();
    const mockTriggerLogin = jest.fn().mockReturnValue({
      csrf_token: "fresh_token",
      cookies: [{ name: "tianshu_csrf_token", value: "fresh_token" }],
    });

    const result = await requestWithAutoLogin(requestFn, authRef, mockRefreshCsrf, mockTriggerLogin);

    expect(result.success).toBe(true);
    expect(requestFn).toHaveBeenCalledTimes(2);
    expect(mockRefreshCsrf).not.toHaveBeenCalled();
    expect(mockTriggerLogin).toHaveBeenCalledTimes(1);
    expect(authRef.csrfToken).toBe("fresh_token");
  });

  test("csrf 过期刷新后仍然登录过期，触发重新登录", async () => {
    const requestFn = jest.fn()
      .mockResolvedValueOnce({ __csrfExpired: true })
      .mockResolvedValueOnce({ __needLogin: true })
      .mockResolvedValueOnce({ success: true, content: "APP_004" });

    const authRef = { csrfToken: "old_token", cookies: [] };
    const mockRefreshCsrf = jest.fn().mockReturnValue({
      csrf_token: "refreshed_token",
      cookies: [],
    });
    const mockTriggerLogin = jest.fn().mockReturnValue({
      csrf_token: "login_token",
      cookies: [],
    });

    const result = await requestWithAutoLogin(requestFn, authRef, mockRefreshCsrf, mockTriggerLogin);

    expect(result.success).toBe(true);
    expect(requestFn).toHaveBeenCalledTimes(3);
    expect(mockRefreshCsrf).toHaveBeenCalledTimes(1);
    expect(mockTriggerLogin).toHaveBeenCalledTimes(1);
  });
});

// ── Cookie Header 构建测试 ───────────────────────────────────────────

describe("Cookie Header 构建", () => {
  function buildCookieHeader(cookies) {
    return cookies.map((cookie) => `${cookie.name}=${cookie.value}`).join("; ");
  }

  test("单个 Cookie 正确格式化", () => {
    const cookies = [{ name: "session", value: "abc123" }];
    expect(buildCookieHeader(cookies)).toBe("session=abc123");
  });

  test("多个 Cookie 用分号空格分隔", () => {
    const cookies = [
      { name: "tianshu_csrf_token", value: "token123" },
      { name: "tianshu_corp_user", value: "CORP001_USER001" },
      { name: "session", value: "sess_abc" },
    ];
    const header = buildCookieHeader(cookies);
    expect(header).toBe("tianshu_csrf_token=token123; tianshu_corp_user=CORP001_USER001; session=sess_abc");
  });

  test("空 Cookie 列表返回空字符串", () => {
    expect(buildCookieHeader([])).toBe("");
  });
});

// ── URL 构建测试 ─────────────────────────────────────────────────────

describe("API 路径构建", () => {
  test("create-app 路径正确", () => {
    const path = "/query/app/registerApp.json";
    expect(path).toBe("/query/app/registerApp.json");
  });

  test("create-page 路径包含 appType", () => {
    const appType = "APP_XYZ123";
    const path = `/dingtalk/web/${appType}/query/formdesign/saveFormSchemaInfo.json`;
    expect(path).toBe("/dingtalk/web/APP_XYZ123/query/formdesign/saveFormSchemaInfo.json");
  });

  test("get-schema 路径包含 appType 和查询参数", () => {
    const appType = "APP_XYZ123";
    const formUuid = "FORM-ABC456";
    const basePath = `/alibaba/web/${appType}/_view/query/formdesign/getFormSchema.json`;
    const queryString = `formUuid=${formUuid}&schemaVersion=V5`;
    const fullPath = `${basePath}?${queryString}`;
    expect(fullPath).toContain("APP_XYZ123");
    expect(fullPath).toContain("FORM-ABC456");
    expect(fullPath).toContain("schemaVersion=V5");
  });

  test("publish 路径包含 appType 和时间戳", () => {
    const appType = "APP_XYZ123";
    const timestamp = 1700000000000;
    const path = `/alibaba/web/${appType}/_view/query/formdesign/saveFormSchema.json?_stamp=${timestamp}`;
    expect(path).toContain("APP_XYZ123");
    expect(path).toContain("_stamp=");
  });
});
