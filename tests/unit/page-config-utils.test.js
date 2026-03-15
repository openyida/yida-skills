/**
 * 单元测试：yida-page-config 系列脚本核心逻辑
 *
 * 覆盖：
 * - save-share-config.js：validateParams（参数校验）、POST 数据构建
 * - get-page-config.js：sendRequest 路径拼接逻辑（GET vs POST）
 * - update-form-config.js：buildPostData（表单配置 POST 数据构建）
 */

"use strict";

const querystring = require("querystring");

// ── save-share-config.js：validateParams（与脚本实现完全一致）────────

function validateShareConfigParams(params) {
  if (params.isOpen !== "y" && params.isOpen !== "n") {
    throw new Error(`isOpen 必须为 y 或 n，当前值: ${params.isOpen}`);
  }
  if (params.openAuth !== "y" && params.openAuth !== "n") {
    throw new Error(`openAuth 必须为 y 或 n，当前值: ${params.openAuth}`);
  }
  if (params.isOpen === "y" && !params.openUrl) {
    throw new Error("开启公开访问时，openUrl 不能为空");
  }
  if (params.isOpen === "n") {
    return true;
  }
  if (!params.openUrl.startsWith("/o/")) {
    throw new Error(`openUrl 必须以 /o/ 开头，当前值: ${params.openUrl}`);
  }
  const pathPart = params.openUrl.slice(3);
  if (!/^[a-zA-Z0-9_-]+$/.test(pathPart)) {
    throw new Error(`openUrl 路径部分只支持 a-z A-Z 0-9 _ -，当前值: ${params.openUrl}`);
  }
  return true;
}

// ── save-share-config.js：POST 数据构建 ──────────────────────────────

function buildSaveShareConfigPostData(csrfToken, formUuid, openUrl, isOpen, openAuth) {
  const authConfig = JSON.stringify({
    openAuth: openAuth,
    authSources: [],
  });
  return querystring.stringify({
    _api: "Share.saveShareConfig",
    _csrf_token: csrfToken,
    _locale_time_zone_offset: "28800000",
    formUuid: formUuid,
    shareUrl: "",
    openUrl: openUrl,
    isOpen: isOpen,
    openPageAuthConfig: authConfig,
  });
}

// ── get-page-config.js：sendRequest 路径拼接逻辑 ─────────────────────

/**
 * 模拟 get-page-config.js 中 sendRequest 的路径拼接逻辑（修复后版本）
 */
function buildRequestPath(method, requestPath, postData) {
  return method === "GET"
    ? `${requestPath}?${querystring.stringify(postData)}`
    : requestPath;
}

// ── update-form-config.js：buildPostData（与脚本实现完全一致）────────

function buildUpdateFormConfigPostData(csrfToken, formUuid, isRenderNav, title) {
  const titleJson = JSON.stringify({
    pureEn_US: title,
    en_US: title,
    zh_CN: title,
    envLocale: null,
    type: "i18n",
    ja_JP: null,
    key: null,
  });

  return querystring.stringify({
    _api: "Form.updateFormSchemaInfo",
    _csrf_token: csrfToken,
    _locale_time_zone_offset: "28800000",
    formUuid: formUuid,
    serialSwitch: "n",
    consultPerson: "",
    defaultManager: "n",
    submissionRule: "RESUBMIT",
    redirectConfig: "",
    pushTask: "y",
    defaultOrder: "cd",
    showPrint: "y",
    relateUuid: "",
    title: titleJson,
    pageType: "web,mobile",
    isInner: "y",
    isNew: "n",
    isAgent: "y",
    showAgent: "n",
    showDingGroup: "y",
    reStart: "n",
    previewConfig: "y",
    formulaType: "n",
    displayTitle: "%24%7Blegao_creator%7D%E5%8F%91%E8%B5%B7%E7%9A%84%24%7Blegao_formname%7D",
    displayType: "RE",
    isRenderNav: isRenderNav,
    manageCustomActionInfo: "[]",
  });
}

// ── validateShareConfigParams 测试 ───────────────────────────────────

describe("save-share-config.js：validateParams", () => {
  test("isOpen=y 且 openUrl 合法时验证通过", () => {
    expect(validateShareConfigParams({
      isOpen: "y",
      openUrl: "/o/mypage",
      openAuth: "n",
    })).toBe(true);
  });

  test("isOpen=n 时不校验 openUrl，直接通过", () => {
    expect(validateShareConfigParams({
      isOpen: "n",
      openUrl: "",
      openAuth: "n",
    })).toBe(true);
  });

  test("isOpen=n 时 openUrl 为空也通过", () => {
    expect(validateShareConfigParams({
      isOpen: "n",
      openUrl: null,
      openAuth: "n",
    })).toBe(true);
  });

  test("isOpen 不是 y 或 n 时抛出错误", () => {
    expect(() => validateShareConfigParams({
      isOpen: "yes",
      openUrl: "/o/mypage",
      openAuth: "n",
    })).toThrow("isOpen 必须为 y 或 n");
  });

  test("openAuth 不是 y 或 n 时抛出错误", () => {
    expect(() => validateShareConfigParams({
      isOpen: "y",
      openUrl: "/o/mypage",
      openAuth: "true",
    })).toThrow("openAuth 必须为 y 或 n");
  });

  test("isOpen=y 但 openUrl 为空时抛出错误", () => {
    expect(() => validateShareConfigParams({
      isOpen: "y",
      openUrl: "",
      openAuth: "n",
    })).toThrow("开启公开访问时，openUrl 不能为空");
  });

  test("isOpen=y 但 openUrl 不以 /o/ 开头时抛出错误", () => {
    expect(() => validateShareConfigParams({
      isOpen: "y",
      openUrl: "/s/mypage",
      openAuth: "n",
    })).toThrow("openUrl 必须以 /o/ 开头");
  });

  test("openUrl 路径部分包含非法字符时抛出错误", () => {
    expect(() => validateShareConfigParams({
      isOpen: "y",
      openUrl: "/o/my page",
      openAuth: "n",
    })).toThrow("只支持 a-z A-Z 0-9 _ -");
  });

  test("openUrl 包含下划线和连字符时验证通过", () => {
    expect(validateShareConfigParams({
      isOpen: "y",
      openUrl: "/o/my_page-123",
      openAuth: "y",
    })).toBe(true);
  });
});

// ── buildSaveShareConfigPostData 测试 ────────────────────────────────

describe("save-share-config.js：POST 数据构建", () => {
  test("正常构建 POST 数据，包含所有必要字段", () => {
    const postData = buildSaveShareConfigPostData(
      "csrf_token_abc",
      "FORM-XYZ",
      "/o/mypage",
      "y",
      "n"
    );
    const parsed = querystring.parse(postData);

    expect(parsed._api).toBe("Share.saveShareConfig");
    expect(parsed._csrf_token).toBe("csrf_token_abc");
    expect(parsed.formUuid).toBe("FORM-XYZ");
    expect(parsed.openUrl).toBe("/o/mypage");
    expect(parsed.isOpen).toBe("y");
    expect(parsed.shareUrl).toBe("");
  });

  test("openPageAuthConfig 序列化为 JSON 字符串", () => {
    const postData = buildSaveShareConfigPostData("token", "FORM-XYZ", "/o/page", "y", "y");
    const parsed = querystring.parse(postData);
    const authConfig = JSON.parse(parsed.openPageAuthConfig);

    expect(authConfig.openAuth).toBe("y");
    expect(authConfig.authSources).toEqual([]);
  });

  test("isOpen=n 时 openUrl 为空字符串", () => {
    const postData = buildSaveShareConfigPostData("token", "FORM-XYZ", "", "n", "n");
    const parsed = querystring.parse(postData);
    expect(parsed.isOpen).toBe("n");
    expect(parsed.openUrl).toBe("");
  });

  test("_locale_time_zone_offset 固定为 28800000", () => {
    const postData = buildSaveShareConfigPostData("token", "FORM-XYZ", "/o/page", "y", "n");
    const parsed = querystring.parse(postData);
    expect(parsed._locale_time_zone_offset).toBe("28800000");
  });
});

// ── get-page-config.js：sendRequest 路径拼接逻辑测试 ─────────────────

describe("get-page-config.js：sendRequest 路径拼接逻辑", () => {
  const requestPath = "/dingtalk/web/APP_XXX/query/formdesign/getShareConfig.json";
  const postData = { _api: "Share.getShareConfig", formUuid: "FORM-XYZ" };

  test("GET 请求时，路径拼接 query string", () => {
    const fullPath = buildRequestPath("GET", requestPath, postData);
    expect(fullPath).toContain("?");
    expect(fullPath).toContain("_api=Share.getShareConfig");
    expect(fullPath).toContain("formUuid=FORM-XYZ");
    expect(fullPath.startsWith(requestPath)).toBe(true);
  });

  test("POST 请求时，路径不拼接 query string", () => {
    const fullPath = buildRequestPath("POST", requestPath, postData);
    expect(fullPath).toBe(requestPath);
    expect(fullPath).not.toContain("?");
  });

  test("GET 请求时，postData 为空对象时路径末尾有 ?", () => {
    const fullPath = buildRequestPath("GET", requestPath, {});
    expect(fullPath).toBe(`${requestPath}?`);
  });

  test("修复前的 bug 验证：原逻辑 postData ? requestPath : ... 在 postData 非空时返回裸路径", () => {
    // 原 bug：path: postData ? requestPath : `${requestPath}?${querystring.stringify(postData)}`
    // 当 postData 非空（truthy）时，返回裸 requestPath，导致 GET 请求没有 query string
    const buggyPath = postData ? requestPath : `${requestPath}?${querystring.stringify(postData)}`;
    expect(buggyPath).toBe(requestPath); // 这就是 bug：GET 请求丢失了 query string

    // 修复后的逻辑
    const fixedPath = buildRequestPath("GET", requestPath, postData);
    expect(fixedPath).not.toBe(requestPath); // 修复后 GET 请求有 query string
    expect(fixedPath).toContain("?");
  });
});

// ── buildUpdateFormConfigPostData 测试 ───────────────────────────────

describe("update-form-config.js：buildPostData", () => {
  test("正常构建 POST 数据，包含所有必要字段", () => {
    const postData = buildUpdateFormConfigPostData(
      "csrf_token_abc",
      "FORM-XYZ",
      "false",
      "我的页面"
    );
    const parsed = querystring.parse(postData);

    expect(parsed._api).toBe("Form.updateFormSchemaInfo");
    expect(parsed._csrf_token).toBe("csrf_token_abc");
    expect(parsed.formUuid).toBe("FORM-XYZ");
    expect(parsed.isRenderNav).toBe("false");
  });

  test("title 序列化为 i18n JSON 格式", () => {
    const postData = buildUpdateFormConfigPostData("token", "FORM-XYZ", "true", "考勤打卡");
    const parsed = querystring.parse(postData);
    const titleObj = JSON.parse(parsed.title);

    expect(titleObj.zh_CN).toBe("考勤打卡");
    expect(titleObj.en_US).toBe("考勤打卡");
    expect(titleObj.pureEn_US).toBe("考勤打卡");
    expect(titleObj.type).toBe("i18n");
    expect(titleObj.envLocale).toBeNull();
    expect(titleObj.ja_JP).toBeNull();
    expect(titleObj.key).toBeNull();
  });

  test("isRenderNav=true 时正确传递", () => {
    const postData = buildUpdateFormConfigPostData("token", "FORM-XYZ", "true", "页面");
    const parsed = querystring.parse(postData);
    expect(parsed.isRenderNav).toBe("true");
  });

  test("isRenderNav=false 时正确传递", () => {
    const postData = buildUpdateFormConfigPostData("token", "FORM-XYZ", "false", "页面");
    const parsed = querystring.parse(postData);
    expect(parsed.isRenderNav).toBe("false");
  });

  test("包含所有必要的固定字段", () => {
    const postData = buildUpdateFormConfigPostData("token", "FORM-XYZ", "false", "页面");
    const parsed = querystring.parse(postData);

    const requiredFields = [
      "_api", "_csrf_token", "_locale_time_zone_offset", "formUuid",
      "serialSwitch", "submissionRule", "pushTask", "defaultOrder",
      "showPrint", "title", "pageType", "isInner", "isNew", "isAgent",
      "showAgent", "showDingGroup", "isRenderNav", "manageCustomActionInfo",
    ];
    for (const field of requiredFields) {
      expect(parsed).toHaveProperty(field);
    }
  });

  test("固定字段值正确", () => {
    const postData = buildUpdateFormConfigPostData("token", "FORM-XYZ", "false", "页面");
    const parsed = querystring.parse(postData);

    expect(parsed.serialSwitch).toBe("n");
    expect(parsed.submissionRule).toBe("RESUBMIT");
    expect(parsed.pushTask).toBe("y");
    expect(parsed.defaultOrder).toBe("cd");
    expect(parsed.showPrint).toBe("y");
    expect(parsed.pageType).toBe("web,mobile");
    expect(parsed.isInner).toBe("y");
    expect(parsed.isNew).toBe("n");
    expect(parsed.isAgent).toBe("y");
    expect(parsed.showAgent).toBe("n");
    expect(parsed.showDingGroup).toBe("y");
    expect(parsed.manageCustomActionInfo).toBe("[]");
  });

  test("_locale_time_zone_offset 固定为 28800000", () => {
    const postData = buildUpdateFormConfigPostData("token", "FORM-XYZ", "false", "页面");
    const parsed = querystring.parse(postData);
    expect(parsed._locale_time_zone_offset).toBe("28800000");
  });
});
