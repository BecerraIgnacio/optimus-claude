import fs from "node:fs/promises";
import path from "node:path";

import { summarizeSettingsText } from "./settings.mjs";
import { loadOptimusState, readTextFileIfExists } from "./state.mjs";

const IGNORED_NAMES = new Set([
  ".git",
  ".DS_Store",
  "node_modules",
  "dist",
  "build",
  ".next",
  ".turbo",
  ".idea",
  ".vscode",
  ".cache",
  "coverage"
]);

const CODE_EXTENSIONS = new Set([
  ".js",
  ".jsx",
  ".ts",
  ".tsx",
  ".mjs",
  ".cjs",
  ".py",
  ".go",
  ".rs",
  ".rb",
  ".php",
  ".java",
  ".kt",
  ".swift",
  ".cs",
  ".scala",
  ".sh",
  ".sql"
]);

async function pathExists(targetPath) {
  try {
    await fs.access(targetPath);
    return true;
  } catch {
    return false;
  }
}

async function readJsonIfExists(filePath) {
  if (!(await pathExists(filePath))) {
    return null;
  }

  try {
    return JSON.parse(await fs.readFile(filePath, "utf8"));
  } catch {
    return null;
  }
}

function isMeaningfulName(name) {
  return !IGNORED_NAMES.has(name);
}

async function collectFileSample(rootDir, currentDir, maxDepth, maxFiles, results) {
  if (results.length >= maxFiles || maxDepth < 0) {
    return;
  }

  let entries = [];

  try {
    entries = await fs.readdir(currentDir, { withFileTypes: true });
  } catch {
    return;
  }

  const sorted = entries
    .filter((entry) => isMeaningfulName(entry.name))
    .sort((left, right) => left.name.localeCompare(right.name));

  for (const entry of sorted) {
    if (results.length >= maxFiles) {
      return;
    }

    const fullPath = path.join(currentDir, entry.name);
    const relativePath = path.relative(rootDir, fullPath) || ".";

    if (entry.isDirectory()) {
      if (maxDepth > 0) {
        await collectFileSample(rootDir, fullPath, maxDepth - 1, maxFiles, results);
      }
      continue;
    }

    results.push(relativePath);
  }
}

function deriveTagsFromPackageJson(packageJson) {
  const tags = new Set();
  const allDeps = {
    ...packageJson?.dependencies,
    ...packageJson?.devDependencies,
    ...packageJson?.peerDependencies
  };

  if (allDeps.react || allDeps.next || allDeps.vue || allDeps.svelte || allDeps["react-dom"]) {
    tags.add("frontend");
  }

  if (allDeps.next) {
    tags.add("nextjs");
    tags.add("frontend");
  }

  if (allDeps.react) {
    tags.add("react");
  }

  if (allDeps.tailwindcss || allDeps["@tailwindcss/vite"]) {
    tags.add("ui");
    tags.add("design");
  }

  if (allDeps.express || allDeps.fastify || allDeps["@nestjs/core"]) {
    tags.add("backend");
    tags.add("api");
  }

  if (allDeps.prisma || allDeps.drizzle || allDeps.typeorm || allDeps.mongoose) {
    tags.add("data");
  }

  if (allDeps.vitest || allDeps.jest || allDeps.playwright || allDeps.cypress) {
    tags.add("testing");
  }

  return [...tags];
}

function detectManifestTags(entries) {
  const names = new Set(entries.map((entry) => entry.name));
  const tags = new Set();
  const manifests = [];

  if (names.has("package.json")) {
    manifests.push("package.json");
    tags.add("javascript");
  }

  if (names.has("pnpm-lock.yaml") || names.has("package-lock.json") || names.has("yarn.lock")) {
    tags.add("javascript");
  }

  if (names.has("tsconfig.json")) {
    tags.add("typescript");
  }

  if (names.has("Cargo.toml")) {
    manifests.push("Cargo.toml");
    tags.add("rust");
    tags.add("backend");
  }

  if (names.has("go.mod")) {
    manifests.push("go.mod");
    tags.add("go");
    tags.add("backend");
  }

  if (names.has("pyproject.toml") || names.has("requirements.txt")) {
    manifests.push(names.has("pyproject.toml") ? "pyproject.toml" : "requirements.txt");
    tags.add("python");
    tags.add("backend");
  }

  if (names.has("Dockerfile") || names.has("docker-compose.yml")) {
    tags.add("deployment");
  }

  return { manifests, tags: [...tags] };
}

function detectTagsFromFiles(fileSample) {
  const tags = new Set();

  for (const filePath of fileSample) {
    const lowerPath = filePath.toLowerCase();

    if (lowerPath.endsWith(".tsx") || lowerPath.endsWith(".jsx") || lowerPath.includes("components/")) {
      tags.add("frontend");
      tags.add("ui");
    }

    if (lowerPath.includes("app/") || lowerPath.includes("pages/") || lowerPath.includes("src/routes/")) {
      tags.add("frontend");
    }

    if (lowerPath.includes("api/") || lowerPath.includes("server/") || lowerPath.includes("handlers/")) {
      tags.add("backend");
      tags.add("api");
    }

    if (lowerPath.includes("test") || lowerPath.includes("spec")) {
      tags.add("testing");
    }

    if (lowerPath.includes("schema") || lowerPath.includes("migrations")) {
      tags.add("data");
    }
  }

  return [...tags];
}

function countCodeFiles(fileSample) {
  return fileSample.filter((filePath) => CODE_EXTENSIONS.has(path.extname(filePath))).length;
}

function buildDefaultConfigSummary() {
  return {
    hasClaudeDir: false,
    rootClaude: {
      exists: false,
      lineCount: 0,
      charCount: 0,
      headings: [],
      hasScopedRuleRefs: false,
      isBloated: false
    },
    settings: {
      exists: false,
      parseable: false,
      topLevelKeys: [],
      denyCount: 0,
      hasSensitiveDenies: false,
      missingDenyRules: []
    },
    rules: {
      exists: false,
      count: 0,
      files: []
    },
    planning: {
      exists: false,
      count: 0,
      files: []
    },
    optimusState: {
      exists: false,
      parseable: false,
      managedCount: 0,
      version: ""
    }
  };
}

function summarizeMarkdownText(text) {
  const normalized = String(text ?? "");
  const lines = normalized.split(/\r?\n/);
  const headings = lines
    .filter((line) => /^#{1,6}\s/.test(line))
    .slice(0, 6)
    .map((line) => line.trim());

  return {
    lineCount: lines.length,
    charCount: normalized.length,
    headings
  };
}

async function summarizeTextFile(targetPath) {
  const content = await readTextFileIfExists(targetPath);
  if (content === null) {
    return null;
  }

  return {
    content,
    ...summarizeMarkdownText(content)
  };
}

async function listMarkdownFiles(directoryPath) {
  try {
    const entries = await fs.readdir(directoryPath, { withFileTypes: true });
    const files = [];

    for (const entry of entries.sort((left, right) => left.name.localeCompare(right.name))) {
      if (!entry.isFile() || !entry.name.endsWith(".md")) {
        continue;
      }

      const summary = await summarizeTextFile(path.join(directoryPath, entry.name));
      if (!summary) {
        continue;
      }

      files.push({
        name: entry.name,
        lineCount: summary.lineCount,
        charCount: summary.charCount,
        headings: summary.headings.slice(0, 3)
      });
    }

    return files;
  } catch {
    return [];
  }
}

async function inspectProjectConfig(absolutePath) {
  const configSummary = buildDefaultConfigSummary();
  const claudeDirPath = path.join(absolutePath, ".claude");
  const planningDirPath = path.join(absolutePath, ".planning");
  const rootClaudePath = path.join(claudeDirPath, "CLAUDE.md");
  const settingsPath = path.join(claudeDirPath, "settings.json");
  const rulesDirPath = path.join(claudeDirPath, "rules");

  configSummary.hasClaudeDir = await pathExists(claudeDirPath);

  const rootClaude = await summarizeTextFile(rootClaudePath);
  if (rootClaude) {
    configSummary.rootClaude = {
      exists: true,
      lineCount: rootClaude.lineCount,
      charCount: rootClaude.charCount,
      headings: rootClaude.headings,
      hasScopedRuleRefs: /\.claude\/rules\//.test(rootClaude.content),
      isBloated: rootClaude.lineCount > 120 || rootClaude.charCount > 5000
    };
  }

  const settingsText = await readTextFileIfExists(settingsPath);
  if (settingsText !== null) {
    const settingsSummary = summarizeSettingsText(settingsText);
    configSummary.settings = {
      exists: true,
      ...settingsSummary
    };
  }

  const ruleFiles = await listMarkdownFiles(rulesDirPath);
  configSummary.rules = {
    exists: ruleFiles.length > 0,
    count: ruleFiles.length,
    files: ruleFiles
  };

  const planningFiles = await listMarkdownFiles(planningDirPath);
  configSummary.planning = {
    exists: planningFiles.length > 0,
    count: planningFiles.length,
    files: planningFiles
  };

  const optimusState = await loadOptimusState(absolutePath);
  configSummary.optimusState = {
    exists: optimusState.exists,
    parseable: optimusState.parseable,
    managedCount: optimusState.managedCount,
    version: optimusState.version
  };

  return configSummary;
}

export async function inspectTargetDirectory(targetDir) {
  const absolutePath = path.resolve(targetDir);
  const exists = await pathExists(absolutePath);

  if (!exists) {
    return {
      absolutePath,
      exists: false,
      isEmpty: true,
      hasCode: false,
      hasGit: false,
      topEntries: [],
      fileSample: [],
      manifests: [],
      packageScripts: {},
      tags: ["greenfield"],
      packageManager: "",
      meaningfulEntryCount: 0,
      configSummary: buildDefaultConfigSummary()
    };
  }

  const entries = (await fs.readdir(absolutePath, { withFileTypes: true }))
    .filter((entry) => isMeaningfulName(entry.name))
    .sort((left, right) => left.name.localeCompare(right.name));

  const topEntries = entries.slice(0, 20).map((entry) => entry.name);
  const fileSample = [];
  await collectFileSample(absolutePath, absolutePath, 2, 30, fileSample);

  const manifestInfo = detectManifestTags(entries);
  const packageJson = await readJsonIfExists(path.join(absolutePath, "package.json"));
  const packageScripts = packageJson?.scripts ?? {};
  const packageTags = deriveTagsFromPackageJson(packageJson);
  const fileTags = detectTagsFromFiles(fileSample);
  const tags = new Set([...manifestInfo.tags, ...packageTags, ...fileTags]);
  const codeFileCount = countCodeFiles(fileSample);
  const hasCode = manifestInfo.manifests.length > 0 || codeFileCount >= 2;
  const packageManager = await pathExists(path.join(absolutePath, "pnpm-lock.yaml"))
    ? "pnpm"
    : await pathExists(path.join(absolutePath, "yarn.lock"))
      ? "yarn"
      : await pathExists(path.join(absolutePath, "package-lock.json"))
        ? "npm"
        : "";

  if (!hasCode) {
    tags.add("greenfield");
  } else {
    tags.add("existing-codebase");
  }

  return {
    absolutePath,
    exists: true,
    isEmpty: entries.length === 0,
    hasCode,
    hasGit: await pathExists(path.join(absolutePath, ".git")),
    topEntries,
    fileSample,
    manifests: manifestInfo.manifests,
    packageScripts,
    tags: [...tags],
    packageManager,
    meaningfulEntryCount: entries.length,
    configSummary: await inspectProjectConfig(absolutePath)
  };
}

export function formatInspectionSummary(inspection) {
  const lines = [
    `path: ${inspection.absolutePath}`,
    `mode: ${inspection.hasCode ? "existing-codebase" : "greenfield"}`,
    `exists: ${inspection.exists ? "yes" : "no"}`,
    `git: ${inspection.hasGit ? "yes" : "no"}`
  ];

  if (inspection.manifests.length > 0) {
    lines.push(`manifests: ${inspection.manifests.join(", ")}`);
  }

  if (inspection.packageManager) {
    lines.push(`package_manager: ${inspection.packageManager}`);
  }

  if (inspection.topEntries.length > 0) {
    lines.push(`top_entries: ${inspection.topEntries.join(", ")}`);
  }

  const scriptNames = Object.keys(inspection.packageScripts);
  if (scriptNames.length > 0) {
    lines.push(`package_scripts: ${scriptNames.join(", ")}`);
  }

  if (inspection.fileSample.length > 0) {
    lines.push(`file_sample: ${inspection.fileSample.join(", ")}`);
  }

  if (inspection.tags.length > 0) {
    lines.push(`tags: ${inspection.tags.join(", ")}`);
  }

  if (inspection.configSummary?.rootClaude?.exists) {
    lines.push(
      `claude_root: lines=${inspection.configSummary.rootClaude.lineCount}, chars=${inspection.configSummary.rootClaude.charCount}, bloated=${inspection.configSummary.rootClaude.isBloated ? "yes" : "no"}, scoped_rules=${inspection.configSummary.rootClaude.hasScopedRuleRefs ? "yes" : "no"}`
    );
  }

  if (inspection.configSummary?.settings?.exists) {
    lines.push(
      `claude_settings: parseable=${inspection.configSummary.settings.parseable ? "yes" : "no"}, deny_count=${inspection.configSummary.settings.denyCount}, sensitive_denies=${inspection.configSummary.settings.hasSensitiveDenies ? "yes" : "no"}`
    );
  }

  if (inspection.configSummary?.rules?.count > 0) {
    lines.push(`claude_rules: ${inspection.configSummary.rules.files.map((file) => file.name).join(", ")}`);
  }

  if (inspection.configSummary?.planning?.count > 0) {
    lines.push(`planning_docs: ${inspection.configSummary.planning.files.map((file) => file.name).join(", ")}`);
  }

  return lines.join("\n");
}

export function formatOptimizationSummary(inspection) {
  const lines = [formatInspectionSummary(inspection)];

  if (inspection.configSummary?.rootClaude?.exists && inspection.configSummary.rootClaude.headings.length > 0) {
    lines.push(`claude_root_headings: ${inspection.configSummary.rootClaude.headings.join(" | ")}`);
  }

  if (inspection.configSummary?.rules?.count > 0) {
    lines.push(
      `rule_details: ${inspection.configSummary.rules.files.map((file) => `${file.name}(${file.lineCount} lines)`).join(", ")}`
    );
  }

  if (inspection.configSummary?.planning?.count > 0) {
    lines.push(
      `planning_details: ${inspection.configSummary.planning.files.map((file) => `${file.name}(${file.lineCount} lines)`).join(", ")}`
    );
  }

  if (inspection.configSummary?.optimusState?.exists) {
    lines.push(
      `optimus_state: parseable=${inspection.configSummary.optimusState.parseable ? "yes" : "no"}, managed_files=${inspection.configSummary.optimusState.managedCount}, version=${inspection.configSummary.optimusState.version || "unknown"}`
    );
  }

  return lines.join("\n");
}
