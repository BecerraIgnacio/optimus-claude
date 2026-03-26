import path from "node:path";

import { dedupeStrings } from "./merge.mjs";
import { renderRootClaudeMarkdown, renderRuleMarkdown, writeProjectFiles } from "./render.mjs";
import { mergeSettingsObject, parseSettingsText, renderSettingsJson } from "./settings.mjs";
import {
  backupFiles,
  classifyOwnership,
  createManagedState,
  OPTIMUS_STATE_RELATIVE_PATH,
  readTextFileIfExists,
  renderManagedState
} from "./state.mjs";

export const ROOT_CLAUDE_RELATIVE_PATH = ".claude/CLAUDE.md";
export const CLAUDE_SETTINGS_RELATIVE_PATH = ".claude/settings.json";
export const OPTIMIZATION_REPORT_RELATIVE_PATH = ".planning/optimization.md";

function action(relativePath, decision, reason, {
  shouldWrite = false,
  targetContent = "",
  ownership = "absent",
  managedAfter = false,
  carryForward = false,
  requiresBackup = false
} = {}) {
  return {
    relativePath,
    decision,
    reason,
    shouldWrite,
    targetContent,
    ownership,
    managedAfter,
    carryForward,
    requiresBackup
  };
}

function actionLabel(decision) {
  switch (decision) {
    case "create":
      return "create";
    case "update-managed":
      return "update";
    case "merge-settings":
      return "merge";
    case "replace-unowned":
      return "replace";
    case "replace-tool":
      return "replace";
    case "keep-unowned":
      return "keep";
    case "keep-managed-modified":
      return "keep";
    case "keep-unparseable":
      return "keep";
    case "unchanged":
      return "keep";
    default:
      return decision;
  }
}

function collectLocalFindings(inspection, actions) {
  const findings = [];
  const rootSummary = inspection.configSummary?.rootClaude;
  const settingsSummary = inspection.configSummary?.settings;

  if (rootSummary?.exists && rootSummary.isBloated) {
    findings.push({
      topic: "Root CLAUDE.md",
      severity: "high",
      finding: "The current root CLAUDE.md exceeds the compactness threshold.",
      recommendation: "Replace it only if it is unowned; otherwise document the cleanup path in the optimization report."
    });
  }

  if (rootSummary?.exists && !rootSummary.hasScopedRuleRefs) {
    findings.push({
      topic: "Scoped rules",
      severity: "medium",
      finding: "The current root CLAUDE.md does not appear to route work into scoped rule files.",
      recommendation: "Keep the root file short and push subsystem-specific guidance into `.claude/rules/*.md`."
    });
  }

  if (!settingsSummary?.exists) {
    findings.push({
      topic: "Claude settings",
      severity: "medium",
      finding: "No project-level Claude settings file is present.",
      recommendation: "Add a minimal settings file with deny rules for secrets and credentials."
    });
  } else if (!settingsSummary.parseable) {
    findings.push({
      topic: "Claude settings",
      severity: "high",
      finding: "The existing `.claude/settings.json` is not valid JSON.",
      recommendation: "Keep it untouched in v1 and repair it manually before relying on merged settings."
    });
  } else if (!settingsSummary.hasSensitiveDenies) {
    findings.push({
      topic: "Claude settings",
      severity: "medium",
      finding: "The current settings file is missing one or more sensitive-file deny rules.",
      recommendation: "Merge the missing deny rules without removing unrelated project settings."
    });
  }

  if (inspection.configSummary?.optimusState?.exists === false) {
    findings.push({
      topic: "Optimus ownership",
      severity: "low",
      finding: "This project has no Optimus state file yet.",
      recommendation: "Create `.claude/optimus-state.json` so future optimize runs can distinguish managed and user-authored files."
    });
  }

  if (actions.some((entry) => entry.decision === "keep-managed-modified")) {
    findings.push({
      topic: "Managed files changed manually",
      severity: "medium",
      finding: "One or more files previously managed by Optimus have been edited outside the tool.",
      recommendation: "Preserve those files in v1 and keep the old state hash so future optimize runs continue to flag them."
    });
  }

  return findings;
}

function renderFindingsBlock(findings) {
  return findings
    .slice(0, 8)
    .map((finding) => `- [${finding.severity}] ${finding.topic}: ${finding.finding}`)
    .join("\n");
}

function renderActionBlock(actions) {
  return actions
    .map((entry) => {
      const suffix = entry.requiresBackup ? " (backup)" : "";
      return `- ${entry.relativePath}: ${actionLabel(entry.decision)}${suffix} — ${entry.reason}`;
    })
    .join("\n");
}

export function renderOptimizeReview({ optimization, inspection, references, actions, findings }) {
  const replaceCount = actions.filter((entry) => entry.decision === "replace-unowned").length;
  const refLines = references
    .map((reference) => `- ${reference.title} [${reference.tags.join(", ")}]`)
    .join("\n");

  return [
    `Optimus optimization: ${optimization.project_title}`,
    "",
    optimization.project_summary,
    "",
    `Target: ${inspection.absolutePath}`,
    `Mode: ${inspection.hasCode ? "existing codebase" : "project config only"}`,
    `Unowned replacements: ${replaceCount}`,
    "",
    "Findings",
    renderFindingsBlock(findings),
    "",
    "Selected References",
    refLines || "- none",
    "",
    "File Decisions",
    renderActionBlock(actions)
  ].join("\n");
}

function renderOptimizationReport({ optimization, inspection, references, actions, findings }) {
  const keptFiles = actions
    .filter((entry) => !entry.shouldWrite)
    .map((entry) => `- ${entry.relativePath}: ${entry.reason}`);
  const referenceLines = references.map((reference) => {
    return `- ${reference.title}: ${reference.promptSummary}`;
  });

  return [
    "# Optimization",
    "",
    optimization.project_summary,
    "",
    "## Project Context",
    `- Path: ${inspection.absolutePath}`,
    `- Mode: ${inspection.hasCode ? "existing codebase" : "project config only"}`,
    "",
    "## Findings",
    renderFindingsBlock(findings),
    "",
    "## Selected References",
    referenceLines.length > 0 ? referenceLines.join("\n") : "- none",
    "",
    "## File Decisions",
    renderActionBlock(actions),
    "",
    "## Kept Existing Files",
    keptFiles.length > 0 ? keptFiles.join("\n") : "- none",
    "",
    "## Next Steps",
    optimization.next_steps.map((step) => `- ${step}`).join("\n")
  ].join("\n");
}

async function planRootClaudeAction({ targetDir, inspection, optimization, stateInfo }) {
  const targetContent = renderRootClaudeMarkdown(optimization);
  const existingContent = await readTextFileIfExists(path.join(targetDir, ROOT_CLAUDE_RELATIVE_PATH));
  const ownership = classifyOwnership({
    relativePath: ROOT_CLAUDE_RELATIVE_PATH,
    existingContent,
    stateInfo
  });

  if (existingContent === null) {
    return action(
      ROOT_CLAUDE_RELATIVE_PATH,
      "create",
      "No root CLAUDE.md exists yet.",
      {
        shouldWrite: true,
        targetContent,
        ownership: ownership.kind,
        managedAfter: true
      }
    );
  }

  if (ownership.kind === "managed") {
    if (existingContent === targetContent) {
      return action(ROOT_CLAUDE_RELATIVE_PATH, "unchanged", "Existing Optimus-managed root CLAUDE.md is already up to date.", {
        targetContent,
        ownership: ownership.kind,
        managedAfter: true
      });
    }

    return action(ROOT_CLAUDE_RELATIVE_PATH, "update-managed", "Refresh the existing Optimus-managed root CLAUDE.md.", {
      shouldWrite: true,
      targetContent,
      ownership: ownership.kind,
      managedAfter: true
    });
  }

  if (ownership.kind === "managed-modified") {
    return action(ROOT_CLAUDE_RELATIVE_PATH, "keep-managed-modified", "Preserve the manually edited Optimus-managed root CLAUDE.md.", {
      targetContent,
      ownership: ownership.kind,
      carryForward: true
    });
  }

  if (inspection.configSummary.rootClaude.isBloated) {
    return action(ROOT_CLAUDE_RELATIVE_PATH, "replace-unowned", "Replace the unowned root CLAUDE.md because it exceeds the compactness threshold.", {
      shouldWrite: true,
      targetContent,
      ownership: ownership.kind,
      managedAfter: true,
      requiresBackup: true
    });
  }

  return action(ROOT_CLAUDE_RELATIVE_PATH, "keep-unowned", "Keep the existing user-authored root CLAUDE.md and document recommended changes instead.", {
    targetContent,
    ownership: ownership.kind
  });
}

async function planSettingsAction({ targetDir, stateInfo }) {
  const existingContent = await readTextFileIfExists(path.join(targetDir, CLAUDE_SETTINGS_RELATIVE_PATH));
  const ownership = classifyOwnership({
    relativePath: CLAUDE_SETTINGS_RELATIVE_PATH,
    existingContent,
    stateInfo
  });

  if (existingContent === null) {
    const targetContent = renderSettingsJson();
    return action(CLAUDE_SETTINGS_RELATIVE_PATH, "create", "No Claude settings file exists yet.", {
      shouldWrite: true,
      targetContent,
      ownership: ownership.kind,
      managedAfter: true
    });
  }

  const parsed = parseSettingsText(existingContent);
  if (!parsed.parseable) {
    return action(CLAUDE_SETTINGS_RELATIVE_PATH, "keep-unparseable", "Preserve the existing settings file because it is not valid JSON and cannot be safely merged.", {
      targetContent: existingContent,
      ownership: ownership.kind,
      carryForward: ownership.kind === "managed-modified"
    });
  }

  const mergedObject = mergeSettingsObject(parsed.object);
  const targetContent = renderSettingsJson(mergedObject);

  if (existingContent === `${targetContent}\n` || existingContent === targetContent) {
    const managedAfter = ownership.kind === "managed";
    return action(CLAUDE_SETTINGS_RELATIVE_PATH, "unchanged", "Existing Claude settings already include the required safe deny rules.", {
      targetContent,
      ownership: ownership.kind,
      managedAfter,
      carryForward: ownership.kind === "managed-modified"
    });
  }

  if (ownership.kind === "managed") {
    return action(CLAUDE_SETTINGS_RELATIVE_PATH, "update-managed", "Refresh the existing Optimus-managed settings file with the current safe defaults.", {
      shouldWrite: true,
      targetContent,
      ownership: ownership.kind,
      managedAfter: true
    });
  }

  return action(CLAUDE_SETTINGS_RELATIVE_PATH, "merge-settings", "Merge missing safe deny rules into the existing settings file without removing unrelated keys.", {
    shouldWrite: true,
    targetContent,
    ownership: ownership.kind,
    managedAfter: false,
    requiresBackup: true
  });
}

async function planRuleActions({ targetDir, optimization, stateInfo }) {
  const actions = [];

  for (const rule of optimization.rules) {
    const relativePath = `.claude/rules/${rule.slug}.md`;
    const targetContent = renderRuleMarkdown(rule);
    const existingContent = await readTextFileIfExists(path.join(targetDir, relativePath));
    const ownership = classifyOwnership({
      relativePath,
      existingContent,
      stateInfo
    });

    if (existingContent === null) {
      actions.push(action(relativePath, "create", "Create the missing scoped rule file.", {
        shouldWrite: true,
        targetContent,
        ownership: ownership.kind,
        managedAfter: true
      }));
      continue;
    }

    if (ownership.kind === "managed") {
      if (existingContent === targetContent) {
        actions.push(action(relativePath, "unchanged", "Existing Optimus-managed rule is already up to date.", {
          targetContent,
          ownership: ownership.kind,
          managedAfter: true
        }));
      } else {
        actions.push(action(relativePath, "update-managed", "Refresh the existing Optimus-managed scoped rule.", {
          shouldWrite: true,
          targetContent,
          ownership: ownership.kind,
          managedAfter: true
        }));
      }
      continue;
    }

    if (ownership.kind === "managed-modified") {
      actions.push(action(relativePath, "keep-managed-modified", "Preserve the manually edited Optimus-managed rule file.", {
        targetContent,
        ownership: ownership.kind,
        carryForward: true
      }));
      continue;
    }

    actions.push(action(relativePath, "keep-unowned", "Preserve the existing user-authored rule file and avoid overwriting it in v1.", {
      targetContent,
      ownership: ownership.kind
    }));
  }

  return actions;
}

async function planToolManagedFile({ targetDir, relativePath, targetContent, stateInfo, reason }) {
  const existingContent = await readTextFileIfExists(path.join(targetDir, relativePath));

  if (existingContent === null) {
    return action(relativePath, "create", reason, {
      shouldWrite: true,
      targetContent,
      ownership: "absent",
      managedAfter: true
    });
  }

  if (existingContent === `${targetContent}\n` || existingContent === targetContent) {
    return action(relativePath, "unchanged", "Existing Optimus-managed report/state file is already up to date.", {
      targetContent,
      ownership: relativePath === OPTIMUS_STATE_RELATIVE_PATH ? "tool" : classifyOwnership({
        relativePath,
        existingContent,
        stateInfo
      }).kind,
      managedAfter: true
    });
  }

  const ownership = relativePath === OPTIMUS_STATE_RELATIVE_PATH
    ? "tool"
    : classifyOwnership({
      relativePath,
      existingContent,
      stateInfo
    }).kind;

  return action(relativePath, ownership === "managed" ? "update-managed" : "replace-tool", reason, {
    shouldWrite: true,
    targetContent,
    ownership,
    managedAfter: true,
    requiresBackup: ownership === "unowned" || ownership === "managed-modified"
  });
}

function combineFindings(optimization, localFindings) {
  return [
    ...(optimization.findings || []),
    ...localFindings
  ].slice(0, 10);
}

export async function buildOptimizePlan({ targetDir, inspection, optimization, references, stateInfo }) {
  const rootAction = await planRootClaudeAction({ targetDir, inspection, optimization, stateInfo });
  const settingsAction = await planSettingsAction({ targetDir, stateInfo });
  const ruleActions = await planRuleActions({ targetDir, optimization, stateInfo });
  const configActions = [rootAction, settingsAction, ...ruleActions];
  const localFindings = collectLocalFindings(inspection, configActions);
  const findings = combineFindings(optimization, localFindings);
  const reportContent = renderOptimizationReport({
    optimization,
    inspection,
    references,
    actions: configActions,
    findings
  });
  const reportAction = await planToolManagedFile({
    targetDir,
    relativePath: OPTIMIZATION_REPORT_RELATIVE_PATH,
    targetContent: reportContent,
    stateInfo,
    reason: "Refresh the optimization report for the current audit."
  });

  const touchedPaths = new Set([...configActions, reportAction].map((entry) => entry.relativePath));
  const managedFiles = {};

  for (const entry of [...configActions, reportAction]) {
    if (entry.managedAfter) {
      managedFiles[entry.relativePath] = entry.targetContent;
    }
  }

  const carriedForwardPaths = [];
  if (stateInfo.parseable) {
    for (const relativePath of Object.keys(stateInfo.state.managedFiles || {})) {
      if (relativePath === OPTIMUS_STATE_RELATIVE_PATH || touchedPaths.has(relativePath)) {
        continue;
      }

      const currentContent = await readTextFileIfExists(path.join(targetDir, relativePath));
      if (currentContent !== null) {
        carriedForwardPaths.push(relativePath);
      }
    }
  }

  for (const entry of [...configActions, reportAction]) {
    if (entry.carryForward && !carriedForwardPaths.includes(entry.relativePath)) {
      carriedForwardPaths.push(entry.relativePath);
    }
  }

  const nextState = createManagedState({
    existingStateInfo: stateInfo,
    managedFiles,
    carriedForwardPaths
  });
  const stateContent = renderManagedState(nextState);
  const stateAction = await planToolManagedFile({
    targetDir,
    relativePath: OPTIMUS_STATE_RELATIVE_PATH,
    targetContent: stateContent,
    stateInfo,
    reason: "Refresh the Optimus ownership state."
  });
  const actions = [...configActions, reportAction, stateAction];

  return {
    actions,
    findings
  };
}

export async function applyOptimizePlan(targetDir, actions) {
  const backupTargets = actions
    .filter((entry) => entry.shouldWrite && entry.requiresBackup)
    .map((entry) => entry.relativePath);
  const backupInfo = backupTargets.length > 0
    ? await backupFiles(targetDir, dedupeStrings(backupTargets, backupTargets.length))
    : null;
  const filesToWrite = actions
    .filter((entry) => entry.shouldWrite)
    .map((entry) => ({
      relativePath: entry.relativePath,
      content: entry.targetContent
    }));

  const writtenFiles = await writeProjectFiles(targetDir, filesToWrite);
  return {
    writtenFiles,
    backupInfo
  };
}
