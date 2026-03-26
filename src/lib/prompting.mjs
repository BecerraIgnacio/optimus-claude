import fs from "node:fs/promises";

import { formatInspectionSummary, formatOptimizationSummary } from "./inspect.mjs";
import { formatReferenceBrief } from "./references.mjs";

async function loadTemplate(filePath) {
  return fs.readFile(filePath, "utf8");
}

export function renderTemplate(template, values) {
  return template.replace(/{{\s*([a-zA-Z0-9_]+)\s*}}/g, (_, key) => values[key] ?? "");
}

export async function buildStartPrompt({ templatePath, idea, stackHint, inspection, references }) {
  const template = await loadTemplate(templatePath);
  return renderTemplate(template, {
    idea,
    stack_hint: stackHint || "none",
    target_summary: formatInspectionSummary(inspection),
    reference_summary: formatReferenceBrief(references)
  });
}

export async function buildRepoReviewPrompt({ templatePath, idea, stackHint, inspection, references }) {
  const template = await loadTemplate(templatePath);
  return renderTemplate(template, {
    idea,
    stack_hint: stackHint || "none",
    target_summary: formatInspectionSummary(inspection),
    reference_summary: formatReferenceBrief(references)
  });
}

export async function buildOptimizePrompt({ templatePath, stackHint, inspection, references }) {
  const template = await loadTemplate(templatePath);
  return renderTemplate(template, {
    stack_hint: stackHint || "none",
    target_summary: formatOptimizationSummary(inspection),
    reference_summary: formatReferenceBrief(references)
  });
}
