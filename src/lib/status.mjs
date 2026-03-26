import path from "node:path";

import { deriveCommandsFromInspection, deriveRequiredRuleSlugs } from "./merge.mjs";
import {
  CLAUDE_SETTINGS_RELATIVE_PATH,
  OPTIMIZATION_REPORT_RELATIVE_PATH,
  ROOT_CLAUDE_RELATIVE_PATH
} from "./optimize-flow.mjs";
import { classifyOwnership, OPTIMUS_STATE_RELATIVE_PATH, readTextFileIfExists } from "./state.mjs";
import { buildToolSetupHint, summarizeToolProfile } from "./tooling.mjs";

function basenameWithoutExtension(fileName) {
  return fileName.replace(/\.md$/i, "");
}

function rankSeverity(severity) {
  switch (severity) {
    case "high":
      return 3;
    case "medium":
      return 2;
    case "low":
      return 1;
    default:
      return 0;
  }
}

function getOverallStatus(findings) {
  const highest = findings.reduce((max, finding) => Math.max(max, rankSeverity(finding.severity)), 0);

  if (highest >= 3) {
    return "needs attention";
  }

  if (highest === 2) {
    return "needs updates";
  }

  if (highest === 1) {
    return "mostly healthy";
  }

  return "healthy";
}

function formatOwnership(kind) {
  switch (kind) {
    case "managed":
      return "Optimus-managed";
    case "managed-modified":
      return "Optimus-managed but manually edited";
    case "unowned":
      return "user-authored or unmanaged";
    case "absent":
      return "missing";
    case "tool":
      return "tool-managed";
    default:
      return kind;
  }
}

function formatSeverity(finding) {
  return `- [${finding.severity}] ${finding.topic}: ${finding.message}`;
}

function formatRuleStatus(ruleStatus) {
  return `- ${ruleStatus.slug}: ${ruleStatus.exists ? `${formatOwnership(ruleStatus.ownership)}.` : "missing."}${ruleStatus.note ? ` ${ruleStatus.note}` : ""}`;
}

function formatToolStatus(tool) {
  if (tool.installed) {
    return `- ${tool.title}: installed.${tool.detail ? ` ${tool.detail}` : ""}${tool.onPath === false ? " Installed under `~/.local/bin` but not on PATH." : ""}`;
  }

  return `- ${tool.title}: missing. ${tool.summary}`;
}

async function inspectOwnership(targetDir, relativePath, stateInfo) {
  const existingContent = await readTextFileIfExists(path.join(targetDir, relativePath));
  return {
    existingContent,
    ownership: classifyOwnership({
      relativePath,
      existingContent,
      stateInfo
    })
  };
}

async function collectManagedDrift(targetDir, stateInfo) {
  if (!stateInfo.parseable) {
    return [];
  }

  const drift = [];

  for (const relativePath of Object.keys(stateInfo.state.managedFiles || {})) {
    if (relativePath === OPTIMUS_STATE_RELATIVE_PATH) {
      continue;
    }

    const existingContent = await readTextFileIfExists(path.join(targetDir, relativePath));
    if (existingContent === null) {
      drift.push({
        relativePath,
        kind: "missing"
      });
      continue;
    }

    const ownership = classifyOwnership({
      relativePath,
      existingContent,
      stateInfo
    });

    if (ownership.kind === "managed-modified") {
      drift.push({
        relativePath,
        kind: "modified"
      });
    }
  }

  return drift;
}

export async function analyzeStatus(targetDir, inspection, stateInfo, toolReport) {
  const setupHint = buildToolSetupHint(toolReport);
  const toolSection = {
    title: "Default Helpers",
    lines: [
      `- ${summarizeToolProfile(toolReport)}.`,
      ...toolReport.tools.map(formatToolStatus)
    ]
  };

  if (inspection.meaningfulEntryCount === 0) {
    const updates = [];

    if (setupHint) {
      updates.push(setupHint);
    }

    updates.push(`Use \`optimus start "<project idea>" --path ${inspection.absolutePath}\` to create the first planning and Claude files.`);

    return {
      empty: true,
      overallStatus: "empty directory",
      findings: [],
      updates,
      sections: [toolSection]
    };
  }

  const sections = [];
  const findings = [];
  const updates = [];
  const rootSummary = inspection.configSummary.rootClaude;
  const settingsSummary = inspection.configSummary.settings;
  const planningSummary = inspection.configSummary.planning;
  const ruleSummary = inspection.configSummary.rules;

  const rootStatus = await inspectOwnership(targetDir, ROOT_CLAUDE_RELATIVE_PATH, stateInfo);
  const settingsStatus = await inspectOwnership(targetDir, CLAUDE_SETTINGS_RELATIVE_PATH, stateInfo);
  const reportStatus = await inspectOwnership(targetDir, OPTIMIZATION_REPORT_RELATIVE_PATH, stateInfo);
  const managedDrift = await collectManagedDrift(targetDir, stateInfo);

  const existingRuleSlugs = new Set(ruleSummary.files.map((file) => basenameWithoutExtension(file.name)));
  const requiredRuleSlugs = deriveRequiredRuleSlugs({
    tags: new Set(inspection.tags),
    inspection,
    commands: deriveCommandsFromInspection(inspection)
  });
  const relevantRuleSlugs = Array.from(new Set([...ruleSummary.files.map((file) => basenameWithoutExtension(file.name)), ...requiredRuleSlugs])).sort();

  const ruleStatuses = await Promise.all(
    relevantRuleSlugs.map(async (slug) => {
      const relativePath = `.claude/rules/${slug}.md`;
      const status = await inspectOwnership(targetDir, relativePath, stateInfo);
      const isRequired = requiredRuleSlugs.includes(slug);
      const exists = existingRuleSlugs.has(slug);

      return {
        slug,
        exists,
        ownership: status.ownership.kind,
        note: exists
          ? status.ownership.kind === "unowned"
            ? "Optimize will preserve it by default."
            : status.ownership.kind === "managed-modified"
              ? "Optimize will preserve it because it drifted from the stored state."
              : "Safe for Optimus to refresh when needed."
          : isRequired
            ? "Optimize can create it."
            : "Not currently required by the detected repo shape."
      };
    })
  );

  sections.push({
    title: "Current Setup",
    lines: [
      `- Project mode: ${inspection.hasCode ? "existing codebase" : "project config only"}.`,
      `- Root CLAUDE.md: ${rootSummary.exists ? `${formatOwnership(rootStatus.ownership.kind)}, ${rootSummary.lineCount} lines, ${rootSummary.charCount} chars.` : "missing."}`,
      `- Claude settings: ${settingsSummary.exists ? `${formatOwnership(settingsStatus.ownership.kind)}, ${settingsSummary.parseable ? "parseable" : "invalid JSON"}, ${settingsSummary.denyCount} deny rules.` : "missing."}`,
      `- Scoped rules: ${ruleSummary.count} file${ruleSummary.count === 1 ? "" : "s"} present.`,
      `- Planning docs: ${planningSummary.count} file${planningSummary.count === 1 ? "" : "s"} present${reportStatus.ownership.kind === "absent" ? ", optimization report missing." : "."}`,
      `- Optimus state: ${inspection.configSummary.optimusState.exists ? `${inspection.configSummary.optimusState.parseable ? "present" : "invalid"}, ${inspection.configSummary.optimusState.managedCount} managed file record${inspection.configSummary.optimusState.managedCount === 1 ? "" : "s"}.` : "missing."}`
    ]
  });

  sections.push(toolSection);

  if (setupHint) {
    const issueCount = toolReport.missingTools.length + toolReport.pathWarnings.length;
    findings.push({
      severity: "low",
      topic: "Default helpers",
      message: toolReport.missingTools.length > 0
        ? `${issueCount} recommended global helper tool${issueCount === 1 ? "" : "s"} still need setup attention.`
        : "`~/.local/bin` is not on PATH, so the default helpers are not fully active yet."
    });
    updates.push(setupHint);
  }

  if (!rootSummary.exists) {
    findings.push({
      severity: "medium",
      topic: "Root CLAUDE.md",
      message: "No project-level root CLAUDE.md exists yet."
    });
    updates.push("Run `optimus optimize --dry-run` to create a compact root `.claude/CLAUDE.md`.");
  } else if (rootSummary.isBloated) {
    findings.push({
      severity: "high",
      topic: "Root CLAUDE.md",
      message: "The root CLAUDE.md exceeds the compactness threshold."
    });
    updates.push("`optimus optimize --write` can replace the bloated root `CLAUDE.md` after backing it up outside the repo.");
  } else if (rootStatus.ownership.kind === "managed-modified") {
    findings.push({
      severity: "medium",
      topic: "Root CLAUDE.md",
      message: "The root CLAUDE.md drifted from the stored Optimus state."
    });
    updates.push("If the drift is intentional, leave it. `optimus optimize` will preserve it by default and report the drift.");
  } else if (!rootSummary.hasScopedRuleRefs) {
    findings.push({
      severity: "medium",
      topic: "Root CLAUDE.md",
      message: "The root CLAUDE.md is compact but does not appear to route work into scoped rules."
    });
    updates.push("`optimus optimize` can tighten the root file and push subsystem-specific guidance into scoped rules.");
  }

  if (!settingsSummary.exists) {
    findings.push({
      severity: "medium",
      topic: "Claude settings",
      message: "No `.claude/settings.json` file exists."
    });
    updates.push("`optimus optimize` can create project settings with secret-deny defaults.");
  } else if (!settingsSummary.parseable) {
    findings.push({
      severity: "high",
      topic: "Claude settings",
      message: "The existing settings file is not valid JSON."
    });
    updates.push("Repair `.claude/settings.json` manually first. v1 optimize will preserve invalid JSON rather than guessing.");
  } else if (!settingsSummary.hasSensitiveDenies) {
    findings.push({
      severity: "medium",
      topic: "Claude settings",
      message: `The settings file is missing ${settingsSummary.missingDenyRules.length} sensitive-file deny rule${settingsSummary.missingDenyRules.length === 1 ? "" : "s"}.`
    });
    updates.push("`optimus optimize --write` can merge the missing deny rules without removing unrelated settings keys.");
  }

  if (!inspection.configSummary.optimusState.exists) {
    findings.push({
      severity: "low",
      topic: "Optimus state",
      message: "This repo does not have `.claude/optimus-state.json` yet."
    });
    updates.push("`optimus optimize` can create the ownership state file so future runs know what Optimus manages.");
  } else if (!inspection.configSummary.optimusState.parseable) {
    findings.push({
      severity: "medium",
      topic: "Optimus state",
      message: "The existing Optimus state file is not valid JSON."
    });
    updates.push("Rebuild the state by running `optimus optimize --write` after reviewing the current Claude files.");
  }

  if (reportStatus.ownership.kind === "absent") {
    findings.push({
      severity: "low",
      topic: "Optimization report",
      message: "No `.planning/optimization.md` report exists yet."
    });
    updates.push("`optimus optimize` can generate an optimization report that explains what it changed and what it preserved.");
  }

  if (ruleStatuses.some((status) => !status.exists)) {
    findings.push({
      severity: "medium",
      topic: "Scoped rules",
      message: `The repo is missing ${ruleStatuses.filter((status) => !status.exists).length} recommended scoped rule file${ruleStatuses.filter((status) => !status.exists).length === 1 ? "" : "s"}.`
    });
    updates.push("`optimus optimize` can add the missing scoped rules while preserving any existing unowned rule files.");
  }

  if (managedDrift.length > 0) {
    findings.push({
      severity: "medium",
      topic: "Managed file drift",
      message: `${managedDrift.length} Optimus-managed file${managedDrift.length === 1 ? "" : "s"} changed or went missing outside the tool.`
    });
    updates.push("Review the drifted files before running `optimus optimize`; v1 preserves drifted managed files by default.");
  }

  if (updates.length === 0) {
    updates.push("No urgent Claude setup changes are needed. Run `optimus optimize --dry-run` only if you want a fresh optimization report.");
  }

  if (ruleStatuses.length > 0) {
    sections.push({
      title: "Rule Files",
      lines: ruleStatuses.map(formatRuleStatus)
    });
  }

  if (managedDrift.length > 0) {
    sections.push({
      title: "Managed Drift",
      lines: managedDrift.map((entry) => {
        return `- ${entry.relativePath}: ${entry.kind === "missing" ? "missing from the repo but still present in Optimus state." : "modified since the last Optimus-managed write."}`;
      })
    });
  }

  sections.push({
    title: "What Can Be Updated",
    lines: updates.map((item) => `- ${item}`)
  });

  return {
    empty: false,
    overallStatus: getOverallStatus(findings),
    findings,
    updates,
    sections
  };
}

export function renderStatusReport({ inspection, analysis }) {
  if (analysis.empty) {
    const renderedSections = analysis.sections
      .map((section) => [section.title, ...section.lines].join("\n"))
      .join("\n\n");

    return [
      "Optimus status: empty directory",
      "",
      `Target: ${inspection.absolutePath}`,
      "",
      renderedSections,
      "",
      "What Can Be Updated",
      analysis.updates.map((item) => `- ${item}`).join("\n")
    ].join("\n");
  }

  const renderedSections = analysis.sections
    .map((section) => [section.title, ...section.lines].join("\n"))
    .join("\n\n");

  return [
    `Optimus status: ${analysis.overallStatus}`,
    "",
    `Target: ${inspection.absolutePath}`,
    `Mode: ${inspection.hasCode ? "existing codebase" : "project config only"}`,
    "",
    "Findings",
    analysis.findings.length > 0
      ? analysis.findings.map(formatSeverity).join("\n")
      : "- No urgent issues detected in the current Claude/project setup.",
    "",
    renderedSections
  ].join("\n");
}
