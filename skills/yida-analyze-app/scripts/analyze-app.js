#!/usr/bin/env node

const fs = require("fs");
const path = require("path");
const {
  PROJECT_ROOT,
  runLiveDiscovery,
  loadAppModelByAppType,
  sanitizeFileBase
} = require("../../yida-import-app/scripts/app-import-lib");

function parseAnalyzeArgs(argv) {
  const args = argv.slice(2);
  const parsed = {
    appType: "",
    reportName: "",
    writePrdReport: false,
    selectApp: false
  };

  let startIndex = 0;
  if (args[0] && !args[0].startsWith("--")) {
    parsed.appType = args[0];
    startIndex = 1;
  } else {
    parsed.selectApp = true;
  }

  for (let i = startIndex; i < args.length; i += 1) {
    const current = args[i];
    if (current === "--report-name") {
      parsed.reportName = args[++i] || "";
    } else if (current === "--write-prd-report") {
      parsed.writePrdReport = true;
    } else if (current === "--select-app") {
      parsed.selectApp = true;
    } else {
      throw new Error("Unknown argument: " + current);
    }
  }

  return parsed;
}

function buildStats(model) {
  const stats = {
    totalPages: model.pages.length,
    customPages: 0,
    formPages: 0,
    totalFields: 0,
    requiredFields: 0,
    fieldTypeCounts: {}
  };

  model.pages.forEach(function (page) {
    if (page.type === "custom") {
      stats.customPages += 1;
    } else if (page.type === "form") {
      stats.formPages += 1;
    }

    Object.values(page.fields || {}).forEach(function (field) {
      stats.totalFields += 1;
      if (field.required) {
        stats.requiredFields += 1;
      }
      const type = field.componentName || "Unknown";
      stats.fieldTypeCounts[type] = (stats.fieldTypeCounts[type] || 0) + 1;
    });
  });

  return stats;
}

function collectRisks(model) {
  const risks = [];
  const pageNames = new Set();

  if (!model.corpId) {
    risks.push("应用 corpId 缺失，后续跨组织发布和同步可能存在歧义。");
  }
  if (!model.pages.length) {
    risks.push("当前缓存中没有页面，说明导入结果不完整。");
  }

  model.pages.forEach(function (page) {
    if (pageNames.has(page.name)) {
      risks.push(`页面名称重复：${page.name}`);
    } else {
      pageNames.add(page.name);
    }

    const fieldNames = new Set();
    Object.keys(page.fields || {}).forEach(function (fieldName) {
      if (fieldNames.has(fieldName)) {
        risks.push(`页面「${page.name}」字段名称重复：${fieldName}`);
      } else {
        fieldNames.add(fieldName);
      }
    });
  });

  if (!model.pages.some(function (page) { return page.type === "form"; })) {
    risks.push("未识别到表单页面，当前应用可能以展示为主，或导入结果不完整。");
  }
  if (!model.pages.some(function (page) { return page.type === "custom"; })) {
    risks.push("未识别到自定义页面，后续前端体验优化空间可能有限。");
  }

  return risks;
}

function buildRecommendations(stats, risks) {
  const recommendations = [];

  if (risks.length) {
    recommendations.push("先运行 yida-sync-app 或重新导入，确保结构上下文完整。");
  }
  if (stats.formPages > 0) {
    recommendations.push("涉及数据结构调整时，优先使用 yida-create-form-page update。");
  }
  if (stats.customPages > 0) {
    recommendations.push("涉及首页、看板、运营页体验优化时，优先使用 yida-custom-page。");
  }
  if (!recommendations.length) {
    recommendations.push("当前应用结构信息不足，建议先补齐导入结果。");
  }

  return recommendations;
}

function renderMarkdown(model, stats, risks, recommendations) {
  const lines = [
    `# ${model.appName} 应用分析`,
    "",
    "## 结构概览",
    "",
    `- appType：${model.appType}`,
    `- 页面总数：${stats.totalPages}`,
    `- 自定义页面：${stats.customPages}`,
    `- 表单页面：${stats.formPages}`,
    `- 字段总数：${stats.totalFields}`,
    `- 必填字段数：${stats.requiredFields}`,
    "",
    "## 字段类型分布",
    ""
  ];

  const fieldTypes = Object.keys(stats.fieldTypeCounts);
  if (!fieldTypes.length) {
    lines.push("- 未识别到字段");
  } else {
    fieldTypes.sort().forEach(function (type) {
      lines.push(`- ${type}: ${stats.fieldTypeCounts[type]}`);
    });
  }

  lines.push("");
  lines.push("## 风险与缺口");
  lines.push("");
  if (!risks.length) {
    lines.push("- 暂未发现明显结构风险");
  } else {
    risks.forEach(function (risk) {
      lines.push("- " + risk);
    });
  }

  lines.push("");
  lines.push("## 建议动作");
  lines.push("");
  recommendations.forEach(function (item) {
    lines.push("- " + item);
  });
  lines.push("");
  return lines.join("\n");
}

function writeReport(reportName, content) {
  const prdDir = path.join(PROJECT_ROOT, "prd");
  if (!fs.existsSync(prdDir)) {
    fs.mkdirSync(prdDir, { recursive: true });
  }
  const filePath = path.join(prdDir, `${reportName}-analysis.md`);
  fs.writeFileSync(filePath, content, "utf-8");
  return filePath;
}

function resolveTargetApp(args) {
  if (args.appType) {
    return {
      appType: args.appType,
      appName: ""
    };
  }

  const liveSelection = runLiveDiscovery("", true);
  return {
    appType: liveSelection.appType,
    appName: liveSelection.appName || ""
  };
}

function main() {
  try {
    const args = parseAnalyzeArgs(process.argv);
    const targetApp = resolveTargetApp(args);
    const loaded = loadAppModelByAppType(targetApp.appType);
    if (!loaded) {
      throw new Error(`未找到 ${targetApp.appType} 的 schema cache，请先执行 yida-import-app。`);
    }

    const model = loaded.model;
    const stats = buildStats(model);
    const risks = collectRisks(model);
    const recommendations = buildRecommendations(stats, risks);
    const reportName = sanitizeFileBase(args.reportName || model.appName || model.appType, model.appType.toLowerCase());

    let reportPath = "";
    if (args.writePrdReport) {
      reportPath = writeReport(reportName, renderMarkdown(model, stats, risks, recommendations));
    }

    console.log(JSON.stringify({
      success: true,
      appType: model.appType,
      appName: model.appName,
      stats: stats,
      risks: risks,
      recommendations: recommendations,
      reportPath: reportPath
    }, null, 2));
  } catch (error) {
    console.error("分析失败: " + error.message);
    process.exit(1);
  }
}

if (require.main === module) {
  main();
}
