import fs from "node:fs/promises";

const KEYWORD_TAGS = [
  [/\b(?:landing page|marketing|homepage|brand|website|visual|design|component|tailwind|ui|ux|dashboard|frontend|react|next)\b/i, ["frontend", "ui", "design"]],
  [/\b(?:api|backend|server|service|worker|webhook|queue|auth|oauth|database|postgres|mysql|redis|automation|cli)\b/i, ["backend", "api"]],
  [/\b(?:test|qa|e2e|integration|unit test|verification|reliability|ci)\b/i, ["testing"]],
  [/\b(?:security|secret|credential|payment|billing|auth|token|role|permission|compliance)\b/i, ["security"]],
  [/\b(?:memory|context|token|compact|cost|performance)\b/i, ["token-hygiene", "memory"]],
  [/\b(?:agent|workflow|planning|spec|roadmap|research)\b/i, ["planning"]],
  [/\b(?:schema|migration|prisma|orm|model|sql|data)\b/i, ["data"]],
  [/\b(?:deploy|docker|kubernetes|infra|terraform)\b/i, ["deployment"]]
];

function normalizeTag(tag) {
  return tag.trim().toLowerCase();
}

export async function loadReferenceManifest(filePath) {
  return JSON.parse(await fs.readFile(filePath, "utf8"));
}

export function buildReferenceTags({ idea = "", stackHint = "", explicitRefs = [], inspection }) {
  const tags = new Set(["planning"]);
  const combined = `${idea} ${stackHint}`.trim();

  for (const [pattern, mappedTags] of KEYWORD_TAGS) {
    if (pattern.test(combined)) {
      for (const tag of mappedTags) {
        tags.add(tag);
      }
    }
  }

  for (const tag of explicitRefs.map(normalizeTag).filter(Boolean)) {
    tags.add(tag);
  }

  for (const tag of inspection.tags ?? []) {
    tags.add(normalizeTag(tag));
  }

  if (inspection.hasCode) {
    tags.add("existing-codebase");
  }

  if (!inspection.hasCode) {
    tags.add("greenfield");
  }

  return tags;
}

function matchesExplicitRef(item, explicitRefs) {
  const normalizedRefs = explicitRefs.map(normalizeTag);
  return normalizedRefs.some((tag) => item.id === tag || item.tags.includes(tag));
}

function scoreReference(item, tags, explicitRefs, inspection) {
  let score = item.priority ?? 0;

  if (item.kind === "official") {
    score += 40;
  }

  for (const tag of item.tags) {
    if (tags.has(tag)) {
      score += item.kind === "domain" ? 18 : 12;
    }
  }

  if (matchesExplicitRef(item, explicitRefs)) {
    score += 60;
  }

  if (item.id === "anthropic-memory") {
    score += 25;
  }

  if (item.id === "anthropic-settings" && (inspection.hasCode || tags.has("security"))) {
    score += 20;
  }

  if (item.id === "anthropic-subagents" && tags.has("planning")) {
    score += 15;
  }

  if (item.id === "ui-ux-pro-max-skill" && tags.has("frontend")) {
    score += 30;
  }

  if (item.id === "get-shit-done" && tags.has("planning")) {
    score += 18;
  }

  if (item.id === "superpowers" && tags.has("planning")) {
    score += 16;
  }

  if (item.id === "everything-claude-code" && tags.has("token-hygiene")) {
    score += 18;
  }

  if (item.id === "rtk" && tags.has("token-hygiene")) {
    score += 14;
  }

  return score;
}

function dedupeReferences(items) {
  const seen = new Set();
  const results = [];

  for (const item of items) {
    if (!item || seen.has(item.id)) {
      continue;
    }

    seen.add(item.id);
    results.push(item);
  }

  return results;
}

export function selectReferences(manifest, { idea = "", stackHint = "", explicitRefs = [], inspection }) {
  const tags = buildReferenceTags({ idea, stackHint, explicitRefs, inspection });
  const normalizedExplicitRefs = explicitRefs.map(normalizeTag).filter(Boolean);
  const eligible = manifest.filter((item) => {
    if (item.deferred && !matchesExplicitRef(item, normalizedExplicitRefs)) {
      return false;
    }

    if (item.kind === "domain") {
      return matchesExplicitRef(item, normalizedExplicitRefs) || item.tags.some((tag) => tags.has(tag));
    }

    return true;
  });

  const sorted = [...eligible].sort((left, right) => {
    return scoreReference(right, tags, normalizedExplicitRefs, inspection)
      - scoreReference(left, tags, normalizedExplicitRefs, inspection);
  });

  const official = sorted.filter((item) => item.kind === "official");
  const nonOfficial = sorted.filter((item) => item.kind !== "official");
  const selected = [];

  if (official.length > 0) {
    selected.push(official[0]);
  }

  if ((inspection.hasCode || tags.has("security") || tags.has("token-hygiene")) && official.length > 1) {
    selected.push(official[1]);
  }

  if (tags.has("frontend")) {
    const frontendDomain = nonOfficial.find((item) => item.kind === "domain" && item.tags.includes("frontend"));
    if (frontendDomain) {
      selected.push(frontendDomain);
    }
  }

  if (selected.length < 3) {
    selected.push(...sorted);
  }

  return dedupeReferences(selected).slice(0, 3);
}

export function formatReferenceBrief(references) {
  return references
    .map((reference, index) => {
      return `${index + 1}. ${reference.title} | tags: ${reference.tags.join(", ")} | use: ${reference.usage} | summary: ${reference.promptSummary} | url: ${reference.url}`;
    })
    .join("\n");
}
