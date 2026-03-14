#!/usr/bin/env node

function buildConfigTable(appModel) {
  return [
    "## 应用配置",
    "",
    "| 配置项 | 值 |",
    "| --- | --- |",
    `| appType | ${appModel.appType || ""} |`,
    `| corpId | ${appModel.corpId || ""} |`,
    `| baseUrl | ${appModel.baseUrl || ""} |`,
    `| appName | ${appModel.appName || ""} |`,
    ""
  ].join("\n");
}

function buildDiscoverySection(appModel) {
  const discovery = appModel.discovery || {};
  const warnings = discovery.warnings || [];
  const lines = [
    "## 接入信息",
    "",
    `- 导入时间：${appModel.importedAt || ""}`,
    `- 页面发现来源：${discovery.source || "unknown"}`,
    `- 是否使用 manifest：${discovery.usedManifest ? "是" : "否"}`
  ];

  if (warnings.length) {
    lines.push("- 发现阶段告警：");
    warnings.forEach(function (warning) {
      lines.push("  - " + warning);
    });
  }

  lines.push("");
  return lines.join("\n");
}

function buildPageTable(appModel) {
  const pages = appModel.pages || [];
  const lines = [
    "## 页面清单",
    "",
    "| 页面名称 | 页面类型 | formUuid | 字段数 | 说明 |",
    "| --- | --- | --- | --- | --- |"
  ];

  if (!pages.length) {
    lines.push("| - | - | - | - | 未发现页面 |");
  } else {
    pages.forEach(function (page) {
      const fieldCount = page.schemaSummary ? page.schemaSummary.fieldCount : 0;
      const note = page.discoveryNote || "";
      lines.push(`| ${page.name || ""} | ${page.type || ""} | ${page.formUuid || ""} | ${fieldCount || 0} | ${note} |`);
    });
  }

  lines.push("");
  return lines.join("\n");
}

function buildFieldsSection(appModel) {
  const pages = appModel.pages || [];
  const lines = ["## 页面与表单配置", ""];
  let hasFields = false;

  pages.forEach(function (page) {
    const fieldEntries = Object.entries(page.fields || {});
    if (!fieldEntries.length) {
      return;
    }
    hasFields = true;
    lines.push(`### ${page.name}（${page.type === "custom" ? "自定义页面" : "表单页面"}）`);
    lines.push("");
    lines.push("| 字段名称 | 字段类型 | fieldId | 必填 | 说明 |");
    lines.push("| --- | --- | --- | --- | --- |");
    fieldEntries.forEach(function (entry) {
      const fieldName = entry[0];
      const field = entry[1] || {};
      lines.push(`| ${fieldName} | ${field.componentName || ""} | ${field.fieldId || ""} | ${field.required ? "是" : "否"} | ${field.description || ""} |`);
    });
    lines.push("");
  });

  if (!hasFields) {
    lines.push("当前未导入到可识别的表单字段。");
    lines.push("");
  }

  return lines.join("\n");
}

function buildCurrentState(appModel) {
  const pages = appModel.pages || [];
  const customPages = pages.filter(function (page) { return page.type === "custom"; }).length;
  const formPages = pages.filter(function (page) { return page.type === "form"; }).length;
  const totalFields = pages.reduce(function (sum, page) {
    return sum + Object.keys(page.fields || {}).length;
  }, 0);

  return [
    "## 当前应用现状",
    "",
    `- 已识别页面数：${pages.length}`,
    `- 自定义页面数：${customPages}`,
    `- 表单页面数：${formPages}`,
    `- 已识别字段数：${totalFields}`,
    "- 本文档由导入脚本逆向生成，可作为后续 AI 改造的基础版本。",
    ""
  ].join("\n");
}

function renderPrd(appModel) {
  return [
    `# ${appModel.appName || appModel.appType} 需求文档`,
    "",
    buildConfigTable(appModel),
    buildDiscoverySection(appModel),
    buildPageTable(appModel),
    buildFieldsSection(appModel),
    buildCurrentState(appModel)
  ].join("\n");
}

module.exports = {
  renderPrd: renderPrd
};
