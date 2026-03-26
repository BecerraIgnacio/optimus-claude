import fs from "node:fs/promises";
import path from "node:path";

import { renderSettingsJson } from "./settings.mjs";

function dedupeStrings(values, maxItems) {
  const seen = new Set();
  const results = [];

  for (const value of values) {
    const text = String(value || "").trim();
    if (!text) {
      continue;
    }

    const normalized = text.toLowerCase();
    if (seen.has(normalized)) {
      continue;
    }

    seen.add(normalized);
    results.push(text);

    if (results.length >= maxItems) {
      break;
    }
  }

  return results;
}

function renderBullets(values, maxItems) {
  return dedupeStrings(values, maxItems).map((value) => `- ${value}`).join("\n");
}

function renderCommands(commands) {
  const rendered = commands.slice(0, 6).map((command) => {
    return `- \`${command.command}\` (${command.status})`;
  });

  return rendered.join("\n");
}

function renderProjectMarkdown(proposal, inspection) {
  return [
    `# ${proposal.project_title}`,
    "",
    proposal.project_summary,
    "",
    "## Audience",
    `- ${proposal.audience}`,
    "",
    "## Project Shape",
    `- ${proposal.project_type}`,
    `- Target mode: ${inspection.hasCode ? "existing codebase" : "greenfield"}`,
    "",
    "## Primary Outcomes",
    renderBullets(proposal.primary_outcomes, 5),
    "",
    "## Success Criteria",
    renderBullets(proposal.success_criteria, 5),
    "",
    "## Problem",
    renderBullets(proposal.project_sections.problem, 4),
    "",
    "## Users",
    renderBullets(proposal.project_sections.users, 4),
    "",
    "## In Scope",
    renderBullets(proposal.project_sections.in_scope, 5),
    "",
    "## Out Of Scope",
    renderBullets(proposal.project_sections.out_of_scope, 4)
  ].join("\n");
}

function renderDecisionsMarkdown(proposal) {
  const entries = proposal.decisions.length > 0
    ? proposal.decisions.map((decision) => {
        return [
          `## ${decision.topic}`,
          `- Decision: ${decision.decision}`,
          `- Why: ${decision.rationale}`
        ].join("\n");
      })
    : ["## Defaults", "- Decision: Keep the bootstrap flow lean and review-first.", "- Why: It reduces token waste and prevents premature implementation."];

  return ["# Decisions", "", ...entries].join("\n\n");
}

function renderResearchMarkdown(proposal, references) {
  const referenceSection = references.map((reference) => {
    return [
      `## ${reference.title}`,
      `- URL: ${reference.url}`,
      `- Tags: ${reference.tags.join(", ")}`,
      `- Why this made the cut: ${reference.usage}`,
      `- Summary: ${reference.promptSummary}`
    ].join("\n");
  });

  const noteSection = proposal.research_notes.slice(0, 6).map((note) => {
    return [
      `## ${note.topic}`,
      `- Takeaway: ${note.takeaway}`,
      `- Action: ${note.action}`
    ].join("\n");
  });

  return ["# Research", "", ...referenceSection, ...(noteSection.length > 0 ? ["", ...noteSection] : [])].join("\n");
}

function renderNextMarkdown(proposal) {
  return [
    "# Next",
    "",
    "## Recommended Next Steps",
    renderBullets(proposal.next_steps, 8)
  ].join("\n");
}

export function renderRootClaudeMarkdown(proposal) {
  const buildContent = (currentProposal) => [
    "# CLAUDE.md",
    "",
    "## Mission",
    `- ${currentProposal.root_claude.goal}`,
    "",
    "## Session Defaults",
    renderBullets(currentProposal.root_claude.instructions, 7),
    "",
    "## Workflow",
    renderBullets(currentProposal.root_claude.workflow, 5),
    "",
    "## Commands",
    currentProposal.root_claude.build_test_commands.length > 0
      ? renderCommands(currentProposal.root_claude.build_test_commands)
      : "- No confirmed build or test commands yet.",
    "",
    "## Safety",
    renderBullets(currentProposal.root_claude.safety, 5),
    "",
    "## Scoped Rules",
    currentProposal.rules.length > 0
      ? currentProposal.rules.map((rule) => `- Load \`./.claude/rules/${rule.slug}.md\` when ${rule.when_to_use.toLowerCase()}`).join("\n")
      : "- No scoped rules yet."
  ].join("\n");

  let content = buildContent(proposal);
  const lineCount = content.split("\n").length;

  if (lineCount > 120) {
    const trimmedProposal = {
      ...proposal,
      root_claude: {
        ...proposal.root_claude,
        instructions: proposal.root_claude.instructions.slice(0, 5),
        workflow: proposal.root_claude.workflow.slice(0, 4),
        safety: proposal.root_claude.safety.slice(0, 4),
        build_test_commands: proposal.root_claude.build_test_commands.slice(0, 5)
      },
      rules: proposal.rules.slice(0, 3)
    };
    content = buildContent(trimmedProposal);
  }

  return content;
}

export function renderRuleMarkdown(rule) {
  return [
    `# ${rule.title}`,
    "",
    `- Why: ${rule.why}`,
    `- When to use: ${rule.when_to_use}`,
    "",
    "## Instructions",
    renderBullets(rule.instructions, 6)
  ].join("\n");
}

export function renderProjectFiles({ proposal, inspection, references }) {
  const files = [
    {
      relativePath: ".planning/project.md",
      content: renderProjectMarkdown(proposal, inspection)
    },
    {
      relativePath: ".planning/decisions.md",
      content: renderDecisionsMarkdown(proposal)
    },
    {
      relativePath: ".planning/research.md",
      content: renderResearchMarkdown(proposal, references)
    },
    {
      relativePath: ".planning/next.md",
      content: renderNextMarkdown(proposal)
    },
    {
      relativePath: ".claude/CLAUDE.md",
      content: renderRootClaudeMarkdown(proposal)
    },
    {
      relativePath: ".claude/settings.json",
      content: renderSettingsJson()
    }
  ];

  for (const rule of proposal.rules) {
    files.push({
      relativePath: `.claude/rules/${rule.slug}.md`,
      content: renderRuleMarkdown(rule)
    });
  }

  return files;
}

export async function writeProjectFiles(targetDir, files) {
  const written = [];

  for (const file of files) {
    const absolutePath = path.join(targetDir, file.relativePath);
    await fs.mkdir(path.dirname(absolutePath), { recursive: true });
    await fs.writeFile(absolutePath, `${file.content.trimEnd()}\n`, "utf8");
    written.push(absolutePath);
  }

  return written;
}

export async function getWritePlan(targetDir, files) {
  const results = [];

  for (const file of files) {
    const absolutePath = path.join(targetDir, file.relativePath);
    let exists = false;

    try {
      await fs.access(absolutePath);
      exists = true;
    } catch {
      exists = false;
    }

    results.push({
      relativePath: file.relativePath,
      absolutePath,
      exists
    });
  }

  return results;
}

export function renderReview({ proposal, inspection, references, writePlan }) {
  const overwriteCount = writePlan.filter((entry) => entry.exists).length;
  const fileList = writePlan.map((entry) => `- ${entry.relativePath}${entry.exists ? " (overwrite)" : ""}`).join("\n");
  const refList = references
    .map((reference) => `- ${reference.title} [${reference.tags.join(", ")}]`)
    .join("\n");
  const ruleList = proposal.rules.length > 0
    ? proposal.rules.map((rule) => `- ${rule.slug}: ${rule.when_to_use}`).join("\n")
    : "- none";

  return [
    `Optimus proposal: ${proposal.project_title}`,
    "",
    proposal.project_summary,
    "",
    `Target: ${inspection.absolutePath}`,
    `Mode: ${inspection.hasCode ? "existing codebase" : "greenfield"}`,
    overwriteCount > 0 ? `Overwrites: ${overwriteCount}` : "Overwrites: 0",
    "",
    "Selected References",
    refList,
    "",
    "Primary Outcomes",
    renderBullets(proposal.primary_outcomes, 5),
    "",
    "Scoped Rules",
    ruleList,
    "",
    "Planned Files",
    fileList
  ].join("\n");
}
