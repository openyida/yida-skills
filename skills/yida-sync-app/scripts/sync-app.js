#!/usr/bin/env node

const fs = require("fs");
const path = require("path");
const {
  PROJECT_ROOT,
  parseArgs,
  importApp,
  runLiveDiscovery,
  loadAppModelByAppType,
  sanitizeFileBase
} = require("../../yida-import-app/scripts/app-import-lib");

function renderDiffMarkdown(appName, diff) {
  const lines = [
    `# ${appName} 同步报告`,
    "",
    "## 页面变化",
    ""
  ];

  if (!diff.addedPages.length && !diff.removedPages.length && !diff.changedPages.length) {
    lines.push("- 未发现页面结构变化");
  } else {
    diff.addedPages.forEach(function (item) {
      lines.push(`- 新增页面：${item.name}（${item.formUuid}）`);
    });
    diff.removedPages.forEach(function (item) {
      lines.push(`- 删除页面：${item.name}（${item.formUuid}）`);
    });
    diff.changedPages.forEach(function (item) {
      lines.push(`- 页面变更：${item.name}`);
      item.changes.forEach(function (change) {
        lines.push(`  - ${change}`);
      });
    });
  }

  lines.push("");
  lines.push("## 字段变化");
  lines.push("");

  if (!diff.fieldChanges.length) {
    lines.push("- 未发现字段结构变化");
  } else {
    diff.fieldChanges.forEach(function (item) {
      lines.push(`- 页面：${item.pageName}`);
      item.changes.forEach(function (change) {
        lines.push(`  - ${change}`);
      });
    });
  }

  lines.push("");
  return lines.join("\n");
}

function comparePages(oldPages, newPages) {
  const oldMap = new Map((oldPages || []).map(function (page) { return [page.formUuid, page]; }));
  const newMap = new Map((newPages || []).map(function (page) { return [page.formUuid, page]; }));
  const diff = {
    addedPages: [],
    removedPages: [],
    changedPages: [],
    fieldChanges: []
  };

  (newPages || []).forEach(function (page) {
    if (!oldMap.has(page.formUuid)) {
      diff.addedPages.push(page);
      return;
    }

    const oldPage = oldMap.get(page.formUuid);
    const changes = [];
    if (oldPage.name !== page.name) {
      changes.push(`名称从「${oldPage.name}」变为「${page.name}」`);
    }
    if (oldPage.type !== page.type) {
      changes.push(`类型从「${oldPage.type}」变为「${page.type}」`);
    }
    if (changes.length) {
      diff.changedPages.push({
        name: page.name,
        formUuid: page.formUuid,
        changes: changes
      });
    }

    const oldFields = oldPage.fields || {};
    const newFields = page.fields || {};
    const fieldChanges = [];

    Object.keys(newFields).forEach(function (fieldName) {
      if (!oldFields[fieldName]) {
        fieldChanges.push(`新增字段：${fieldName}`);
        return;
      }
      if (oldFields[fieldName].componentName !== newFields[fieldName].componentName) {
        fieldChanges.push(`字段「${fieldName}」类型从 ${oldFields[fieldName].componentName} 变为 ${newFields[fieldName].componentName}`);
      }
      if (Boolean(oldFields[fieldName].required) !== Boolean(newFields[fieldName].required)) {
        fieldChanges.push(`字段「${fieldName}」必填状态发生变化`);
      }
    });

    Object.keys(oldFields).forEach(function (fieldName) {
      if (!newFields[fieldName]) {
        fieldChanges.push(`删除字段：${fieldName}`);
      }
    });

    if (fieldChanges.length) {
      diff.fieldChanges.push({
        pageName: page.name,
        formUuid: page.formUuid,
        changes: fieldChanges
      });
    }
  });

  (oldPages || []).forEach(function (page) {
    if (!newMap.has(page.formUuid)) {
      diff.removedPages.push(page);
    }
  });

  return diff;
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

async function main() {
  try {
    const args = parseArgs(process.argv);
    const targetApp = resolveTargetApp(args);
    const existing = loadAppModelByAppType(targetApp.appType);
    if (!existing) {
      throw new Error(`未找到 ${targetApp.appType} 的本地 schema cache，请先执行 yida-import-app。`);
    }

    const outputName = args.outputName || sanitizeFileBase(existing.model.appName || existing.model.appType, existing.model.appType.toLowerCase());
    const result = await importApp({
      appType: targetApp.appType,
      appName: existing.model.appName || targetApp.appName,
      manifestPath: args.manifestPath,
      outputName: outputName,
      force: true,
      selectApp: false
    });

    const diff = comparePages(existing.model.pages || [], result.appModel.pages || []);
    const syncReportPath = path.join(PROJECT_ROOT, "prd", `${outputName}-sync.md`);
    fs.writeFileSync(syncReportPath, renderDiffMarkdown(result.appModel.appName, diff), "utf-8");

    console.log(JSON.stringify({
      success: true,
      appType: result.appModel.appType,
      appName: result.appModel.appName,
      schemaCachePath: result.cachePath,
      prdPath: result.prdPath,
      syncReportPath: syncReportPath,
      diff: diff
    }, null, 2));
  } catch (error) {
    console.error("同步失败: " + error.message);
    process.exit(1);
  }
}

if (require.main === module) {
  main();
}
