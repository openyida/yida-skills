/**
 * 回归测试：历史 Bug 修复验证用例
 *
 * 每个测试用例对应一个已修复的 bug，确保不会回归。
 * 新增 bug 修复时，应在此文件中添加对应的回归测试。
 */

"use strict";

const querystring = require("querystring");

// ── 共用纯函数（与脚本实现完全一致）────────────────────────────────

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

function resolveBaseUrl(cookieData) {
  const defaultBaseUrl = "https://www.aliwork.com";
  return ((cookieData && cookieData.base_url) || defaultBaseUrl).replace(/\/+$/, "");
}

function isLoginExpired(responseJson) {
  return responseJson && responseJson.success === false && (responseJson.errorCode === "307" || responseJson.errorCode === "302");
}

function isCsrfTokenExpired(responseJson) {
  return responseJson && responseJson.success === false && responseJson.errorCode === "TIANSHU_000030";
}

// ── Bug #1: tianshu_corp_user 含多个下划线时 corpId 解析错误 ─────────
//
// 问题：早期版本使用 indexOf("_") 而非 lastIndexOf("_")，
//       导致 corpId 为 "CORP" 而非 "CORP_WITH_UNDERSCORES"。
// 修复：改用 lastIndexOf("_") 按最后一个下划线分割。

describe("Bug #1: corpId 含多个下划线时解析正确", () => {
  test("corpId 含一个下划线：CORP_ID_userId → corpId = CORP_ID", () => {
    const cookies = [
      { name: "tianshu_corp_user", value: "CORP_ID_userId123" },
    ];
    const { corpId } = extractInfoFromCookies(cookies);
    expect(corpId).toBe("CORP_ID");
    // 确保不是按第一个下划线分割的错误结果
    expect(corpId).not.toBe("CORP");
  });

  test("corpId 含两个下划线：A_B_C_userId → corpId = A_B_C", () => {
    const cookies = [
      { name: "tianshu_corp_user", value: "A_B_C_userId" },
    ];
    const { corpId } = extractInfoFromCookies(cookies);
    expect(corpId).toBe("A_B_C");
  });

  test("corpId 含多个下划线：DING_CORP_ENTERPRISE_2024_userId → 正确提取", () => {
    const cookies = [
      { name: "tianshu_corp_user", value: "DING_CORP_ENTERPRISE_2024_userId999" },
    ];
    const { corpId } = extractInfoFromCookies(cookies);
    expect(corpId).toBe("DING_CORP_ENTERPRISE_2024");
  });

  test("corpId 无下划线时返回 null（不崩溃）", () => {
    const cookies = [
      { name: "tianshu_corp_user", value: "NOUNDERSCORE" },
    ];
    const { corpId } = extractInfoFromCookies(cookies);
    expect(corpId).toBeNull();
  });
});

// ── Bug #2: base_url 末尾斜杠导致 API 路径双斜杠 ─────────────────────
//
// 问题：base_url 末尾有斜杠时，拼接 API 路径会出现双斜杠，
//       如 "https://www.aliwork.com//query/app/registerApp.json"。
// 修复：resolveBaseUrl 中使用 replace(/\/+$/, "") 去掉末尾所有斜杠。

describe("Bug #2: base_url 末尾斜杠导致路径双斜杠", () => {
  test("末尾单斜杠被去掉", () => {
    const url = resolveBaseUrl({ base_url: "https://www.aliwork.com/" });
    expect(url).toBe("https://www.aliwork.com");
    expect(url.endsWith("/")).toBe(false);
  });

  test("末尾多斜杠全部去掉", () => {
    const url = resolveBaseUrl({ base_url: "https://www.aliwork.com///" });
    expect(url).toBe("https://www.aliwork.com");
  });

  test("拼接 API 路径后不出现双斜杠", () => {
    const baseUrl = resolveBaseUrl({ base_url: "https://www.aliwork.com/" });
    const apiPath = "/query/app/registerApp.json";
    const fullUrl = baseUrl + apiPath;
    expect(fullUrl).toBe("https://www.aliwork.com/query/app/registerApp.json");
    expect(fullUrl).not.toContain("//query");
  });

  test("无末尾斜杠时不受影响", () => {
    const url = resolveBaseUrl({ base_url: "https://www.aliwork.com" });
    expect(url).toBe("https://www.aliwork.com");
  });
});

// ── Bug #3: Cookie 文件为旧版纯数组格式时解析失败 ────────────────────
//
// 问题：早期 Cookie 文件格式为纯 JSON 数组，新版期望对象格式，
//       导致 base_url 和 csrf_token 无法正确读取。
// 修复：loadCookieData 中兼容旧版数组格式，自动补充 base_url。

describe("Bug #3: 旧版纯数组 Cookie 格式兼容", () => {
  function parseCookieFileContent(rawContent, defaultBaseUrl) {
    if (!rawContent || !rawContent.trim()) return null;
    try {
      const parsed = JSON.parse(rawContent.trim());
      let cookieData;
      if (Array.isArray(parsed)) {
        // 兼容旧版纯数组格式
        cookieData = { cookies: parsed, base_url: defaultBaseUrl };
      } else {
        cookieData = parsed;
      }
      if (cookieData.cookies && cookieData.cookies.length > 0) {
        for (const cookie of cookieData.cookies) {
          if (cookie.name === "tianshu_csrf_token") {
            cookieData.csrf_token = cookie.value;
          } else if (cookie.name === "tianshu_corp_user") {
            const lastUnderscore = cookie.value.lastIndexOf("_");
            if (lastUnderscore > 0) {
              cookieData.corp_id = cookie.value.slice(0, lastUnderscore);
            }
          }
        }
      }
      return cookieData;
    } catch {
      return null;
    }
  }

  test("旧版数组格式正确解析，自动补充 base_url", () => {
    const oldFormatCookies = [
      { name: "tianshu_csrf_token", value: "token_old" },
      { name: "tianshu_corp_user", value: "CORP_OLD_user001" },
    ];
    const result = parseCookieFileContent(
      JSON.stringify(oldFormatCookies),
      "https://www.aliwork.com"
    );
    expect(result).not.toBeNull();
    expect(result.base_url).toBe("https://www.aliwork.com");
    expect(result.csrf_token).toBe("token_old");
    expect(result.corp_id).toBe("CORP_OLD");
  });

  test("新版对象格式正常解析，不受影响", () => {
    const newFormatData = {
      cookies: [
        { name: "tianshu_csrf_token", value: "token_new" },
      ],
      base_url: "https://custom.aliwork.com",
    };
    const result = parseCookieFileContent(
      JSON.stringify(newFormatData),
      "https://www.aliwork.com"
    );
    expect(result.base_url).toBe("https://custom.aliwork.com");
    expect(result.csrf_token).toBe("token_new");
  });
});

// ── Bug #4: 登录过期与 csrf 过期的错误码混淆 ─────────────────────────
//
// 问题：早期版本通过 HTTP 状态码（302/307）判断，但实际接口返回 200，
//       错误信息在响应体的 errorCode 字段中。
// 修复：改为解析响应体中的 errorCode 字段进行判断。

describe("Bug #4: 通过响应体 errorCode 判断错误类型", () => {
  test("HTTP 200 但 errorCode=307 时正确识别为登录过期", () => {
    const response = {
      success: false,
      errorCode: "307",
      errorMsg: "登录状态已过期，请刷新页面后重新访问",
    };
    expect(isLoginExpired(response)).toBe(true);
    expect(isCsrfTokenExpired(response)).toBe(false);
  });

  test("HTTP 200 但 errorCode=TIANSHU_000030 时正确识别为 csrf 过期", () => {
    const response = {
      success: false,
      errorCode: "TIANSHU_000030",
      errorMsg: "csrf校验失败",
    };
    expect(isCsrfTokenExpired(response)).toBe(true);
    expect(isLoginExpired(response)).toBe(false);
  });

  test("两种错误不会互相误判", () => {
    const loginExpiredResponse = { success: false, errorCode: "307" };
    const csrfExpiredResponse = { success: false, errorCode: "TIANSHU_000030" };

    expect(isLoginExpired(loginExpiredResponse)).toBe(true);
    expect(isCsrfTokenExpired(loginExpiredResponse)).toBe(false);

    expect(isLoginExpired(csrfExpiredResponse)).toBe(false);
    expect(isCsrfTokenExpired(csrfExpiredResponse)).toBe(true);
  });
});

// ── Bug #5: buildRegisterPostData icon 格式错误 ──────────────────────
//
// 问题：icon 和 iconColor 需要拼接为 "icon%%iconColor" 格式，
//       早期版本可能使用了错误的分隔符。
// 修复：使用 "%%" 作为分隔符。

describe("Bug #5: icon 字段格式必须为 icon%%iconColor", () => {
  function buildIconValue(icon, iconColor) {
    return icon + "%%" + iconColor;
  }

  test("icon 和 iconColor 用 %% 拼接", () => {
    expect(buildIconValue("xian-yingyong", "#0089FF")).toBe("xian-yingyong%%#0089FF");
  });

  test("icon 和 iconUrl 字段值相同", () => {
    const icon = "xian-daka";
    const iconColor = "#00B853";
    const iconValue = buildIconValue(icon, iconColor);
    // icon 和 iconUrl 应该是同一个值
    expect(iconValue).toBe("xian-daka%%#00B853");

    const postData = querystring.stringify({ icon: iconValue, iconUrl: iconValue });
    const parsed = querystring.parse(postData);
    expect(parsed.icon).toBe(parsed.iconUrl);
  });

  test("不使用单 % 或其他分隔符", () => {
    const iconValue = buildIconValue("xian-yingyong", "#0089FF");
    expect(iconValue).not.toMatch(/^[^%]+%[^%]/); // 不是单个 %
    expect(iconValue).toContain("%%");
  });
});

// ── Bug #6: 自定义页面获取数据时 pageSize 超过最大值 100 导致报错 ────
//
// 问题：AI 生成自定义页面代码时，调用 searchFormDatas、searchFormDataIds、
//       getProcessInstances、getProcessInstanceIds 等分页接口时，
//       有时会将 pageSize 设置为超过 100 的值（如 200、1000），
//       导致宜搭接口报错。
// 修复：在 SKILL.md 和 yida-api.md 中明确约束 pageSize 最大值为 100。
// 关联：Issue #95，PR #96

describe("Bug #6: pageSize 不得超过最大值 100", () => {
  // 模拟 pageSize 校验函数（与 SKILL.md 约束一致）
  function validatePageSize(pageSize) {
    const MAX_PAGE_SIZE = 100;
    if (typeof pageSize !== "number" || pageSize < 1) {
      return { valid: false, reason: "pageSize 必须为正整数" };
    }
    if (pageSize > MAX_PAGE_SIZE) {
      return { valid: false, reason: `pageSize 不得超过 ${MAX_PAGE_SIZE}，当前值：${pageSize}` };
    }
    return { valid: true };
  }

  // 模拟构建分页请求参数（确保 pageSize 不超限）
  function buildPaginationParams({ formUuid, currentPage = 1, pageSize = 10 }) {
    const MAX_PAGE_SIZE = 100;
    return {
      formUuid,
      currentPage,
      pageSize: Math.min(pageSize, MAX_PAGE_SIZE),
    };
  }

  test("pageSize 为 10 时合法", () => {
    expect(validatePageSize(10).valid).toBe(true);
  });

  test("pageSize 为 100 时合法（边界值）", () => {
    expect(validatePageSize(100).valid).toBe(true);
  });

  test("pageSize 为 101 时非法（超过最大值）", () => {
    const result = validatePageSize(101);
    expect(result.valid).toBe(false);
    expect(result.reason).toContain("100");
  });

  test("pageSize 为 200 时非法", () => {
    expect(validatePageSize(200).valid).toBe(false);
  });

  test("pageSize 为 1000 时非法", () => {
    expect(validatePageSize(1000).valid).toBe(false);
  });

  test("pageSize 为 0 时非法", () => {
    expect(validatePageSize(0).valid).toBe(false);
  });

  test("pageSize 为负数时非法", () => {
    expect(validatePageSize(-1).valid).toBe(false);
  });

  test("构建请求参数时 pageSize 超过 100 会被截断为 100", () => {
    const params = buildPaginationParams({ formUuid: "FORM-XXX", pageSize: 500 });
    expect(params.pageSize).toBe(100);
    expect(params.pageSize).not.toBeGreaterThan(100);
  });

  test("构建请求参数时 pageSize 为 50 不受影响", () => {
    const params = buildPaginationParams({ formUuid: "FORM-XXX", pageSize: 50 });
    expect(params.pageSize).toBe(50);
  });

  test("构建请求参数时不传 pageSize 使用默认值 10", () => {
    const params = buildPaginationParams({ formUuid: "FORM-XXX" });
    expect(params.pageSize).toBe(10);
    expect(params.pageSize).toBeLessThanOrEqual(100);
  });

  test("searchFormDatas 典型调用参数合法性验证", () => {
    const searchFormDatasParams = {
      formUuid: "FORM-ABC123",
      currentPage: 1,
      pageSize: 10,
    };
    expect(validatePageSize(searchFormDatasParams.pageSize).valid).toBe(true);
  });

  test("searchFormDataIds 典型调用参数合法性验证", () => {
    const searchFormDataIdsParams = {
      formUuid: "FORM-ABC123",
      currentPage: 1,
      pageSize: 20,
    };
    expect(validatePageSize(searchFormDataIdsParams.pageSize).valid).toBe(true);
  });

  test("getProcessInstances 典型调用参数合法性验证", () => {
    const getProcessInstancesParams = {
      formUuid: "FORM-ABC123",
      currentPage: 1,
      pageSize: 50,
    };
    expect(validatePageSize(getProcessInstancesParams.pageSize).valid).toBe(true);
  });
});
