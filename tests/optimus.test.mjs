import test from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import { spawnSync } from "node:child_process";

import { inspectTargetDirectory } from "../src/lib/inspect.mjs";
import { mergeProposal } from "../src/lib/merge.mjs";
import { loadReferenceManifest, selectReferences } from "../src/lib/references.mjs";
import { renderProjectFiles } from "../src/lib/render.mjs";
import { getAssetPaths, getProjectRoot } from "../src/lib/runtime.mjs";
import { DEFAULT_DENY_RULES } from "../src/lib/settings.mjs";

const projectRoot = getProjectRoot();
const nodeBinary = process.execPath;
const cliPath = path.join(projectRoot, "bin", "optimus.mjs");
const stubPath = path.join(projectRoot, "tests", "fixtures", "claude-stub.mjs");
const installRtkStubPath = path.join(projectRoot, "tests", "fixtures", "install-rtk-stub.sh");
const installRalphStubPath = path.join(projectRoot, "tests", "fixtures", "install-ralph-stub.sh");

async function makeTempDir() {
  return fs.mkdtemp(path.join(os.tmpdir(), "optimus-test-"));
}

function runCli(args, cwd) {
  return runCliWithEnv(args, { cwd });
}

function runCliWithEnv(args, { cwd = projectRoot, env = {} } = {}) {
  return spawnSync(nodeBinary, [cliPath, ...args], {
    cwd,
    env: {
      ...process.env,
      OPTIMUS_CLAUDE_BIN: stubPath,
      ...env
    },
    encoding: "utf8"
  });
}

test("reference selection keeps max three items and includes UI source for frontend ideas", async () => {
  const manifest = await loadReferenceManifest(getAssetPaths().referenceManifestPath);
  const inspection = {
    hasCode: false,
    tags: ["greenfield"]
  };

  const references = selectReferences(manifest, {
    idea: "Design a landing page for a wellness startup",
    stackHint: "next,tailwind",
    explicitRefs: [],
    inspection
  });

  assert.ok(references.length <= 3);
  assert.ok(references.some((reference) => reference.id === "ui-ux-pro-max-skill"));
  assert.ok(references.some((reference) => reference.id === "anthropic-memory"));
});

test("rendered root CLAUDE stays within the line budget", async () => {
  const inspection = {
    absolutePath: "/tmp/demo",
    hasCode: true,
    tags: ["existing-codebase", "backend", "security"],
    packageScripts: {
      build: "node build.mjs",
      test: "node test.mjs"
    },
    packageManager: "npm"
  };

  const proposal = mergeProposal({
    proposal: {
      project_title: "Billing API",
      project_summary: "Bootstrap a backend integration service.",
      audience: "Developers",
      project_type: "Backend integration service",
      primary_outcomes: ["One", "Two", "Three"],
      success_criteria: ["A", "B", "C"],
      project_sections: {
        problem: ["P"],
        users: ["U"],
        in_scope: ["I"],
        out_of_scope: ["O"]
      },
      decisions: [],
      research_notes: [],
      root_claude: {
        goal: "Bootstrap a safe backend",
        instructions: new Array(10).fill("Keep the session small and explicit."),
        workflow: new Array(10).fill("Clarify before coding."),
        build_test_commands: [],
        safety: new Array(10).fill("Do not read secrets.")
      },
      rules: [],
      next_steps: ["N1", "N2", "N3"]
    },
    review: {
      build_commands: [
        { label: "build", command: "npm run build", status: "confirmed" }
      ],
      test_commands: [
        { label: "test", command: "npm test", status: "confirmed" }
      ],
      lint_commands: [
        { label: "lint", command: "npm run lint", status: "likely" }
      ],
      conventions: ["Keep handler logic narrow."],
      gaps: ["Document webhook verification."],
      notes: []
    },
    inspection,
    references: [],
    idea: "Build a billing webhook API",
    stackHint: "node,postgres",
    explicitRefs: []
  });

  const files = renderProjectFiles({
    proposal,
    inspection,
    references: []
  });

  const claudeFile = files.find((file) => file.relativePath === ".claude/CLAUDE.md");
  assert.ok(claudeFile);
  assert.ok(claudeFile.content.split("\n").length <= 120);
});

test("dry run prints the proposal and writes nothing", async () => {
  const tempDir = await makeTempDir();
  const result = runCli(["start", "Build a SaaS analytics dashboard", "--path", tempDir, "--dry-run"], projectRoot);

  assert.equal(result.status, 0, result.stderr);
  assert.match(result.stdout, /Dry run complete/);

  const inspection = await inspectTargetDirectory(tempDir);
  assert.equal(inspection.exists, true);
  assert.equal(inspection.meaningfulEntryCount, 0);
});

test("write mode creates the expected bootstrap files for a greenfield project", async () => {
  const tempDir = await makeTempDir();
  const result = runCli(
    ["start", "Design a landing page for a wellness startup", "--path", tempDir, "--write"],
    projectRoot
  );

  assert.equal(result.status, 0, result.stderr);
  const expectedFiles = [
    ".planning/project.md",
    ".planning/decisions.md",
    ".planning/research.md",
    ".planning/next.md",
    ".claude/CLAUDE.md",
    ".claude/settings.json",
    ".claude/rules/frontend.md",
    ".claude/optimus-state.json"
  ];

  for (const relativePath of expectedFiles) {
    const absolutePath = path.join(tempDir, relativePath);
    await fs.access(absolutePath);
  }

  const rootClaude = await fs.readFile(path.join(tempDir, ".claude/CLAUDE.md"), "utf8");
  assert.ok(rootClaude.split("\n").length <= 120);
});

test("existing repo mode writes repo-aware commands and avoids irrelevant frontend rules for backend ideas", async () => {
  const tempDir = await makeTempDir();
  await fs.writeFile(
    path.join(tempDir, "package.json"),
    JSON.stringify(
      {
        name: "billing-api",
        scripts: {
          build: "tsc -p tsconfig.json",
          test: "vitest run",
          lint: "eslint ."
        },
        dependencies: {
          express: "^5.0.0"
        }
      },
      null,
      2
    )
  );
  await fs.mkdir(path.join(tempDir, "src"), { recursive: true });
  await fs.writeFile(path.join(tempDir, "src", "server.ts"), "export const server = true;\n");

  const result = runCli(
    ["start", "Build a billing webhook API", "--path", tempDir, "--write"],
    projectRoot
  );

  assert.equal(result.status, 0, result.stderr);

  const rootClaude = await fs.readFile(path.join(tempDir, ".claude/CLAUDE.md"), "utf8");
  assert.match(rootClaude, /npm test/);
  assert.match(rootClaude, /npm run build/);

  await assert.rejects(fs.access(path.join(tempDir, ".claude/rules/frontend.md")));
  await fs.access(path.join(tempDir, ".claude/rules/backend.md"));
});

test("optimize creates a managed optimization package when a codebase has no existing Claude config", async () => {
  const tempDir = await makeTempDir();
  await fs.writeFile(
    path.join(tempDir, "package.json"),
    JSON.stringify(
      {
        name: "frontend-app",
        scripts: {
          build: "next build",
          test: "vitest run"
        },
        dependencies: {
          next: "^15.0.0",
          react: "^19.0.0"
        }
      },
      null,
      2
    )
  );
  await fs.mkdir(path.join(tempDir, "src"), { recursive: true });
  await fs.writeFile(path.join(tempDir, "src", "app.tsx"), "export default function App() { return null; }\n");

  const result = runCli(["optimize", "--path", tempDir, "--write"], projectRoot);

  assert.equal(result.status, 0, result.stderr);
  const expectedFiles = [
    ".planning/optimization.md",
    ".claude/CLAUDE.md",
    ".claude/settings.json",
    ".claude/rules/frontend.md",
    ".claude/optimus-state.json"
  ];

  for (const relativePath of expectedFiles) {
    await fs.access(path.join(tempDir, relativePath));
  }

  const optimizationReport = await fs.readFile(path.join(tempDir, ".planning/optimization.md"), "utf8");
  assert.match(optimizationReport, /Optimization/);
});

test("optimize preserves a compact unowned root CLAUDE file", async () => {
  const tempDir = await makeTempDir();
  await fs.writeFile(
    path.join(tempDir, "package.json"),
    JSON.stringify(
      {
        name: "billing-api",
        scripts: {
          build: "tsc -p tsconfig.json",
          test: "vitest run"
        },
        dependencies: {
          express: "^5.0.0"
        }
      },
      null,
      2
    )
  );
  await fs.mkdir(path.join(tempDir, ".claude"), { recursive: true });
  const originalRoot = "# CLAUDE.md\n\n## Mission\n- Keep my custom workflow.\n";
  await fs.writeFile(path.join(tempDir, ".claude", "CLAUDE.md"), originalRoot);

  const result = runCli(["optimize", "--path", tempDir, "--write"], projectRoot);

  assert.equal(result.status, 0, result.stderr);
  const rootAfter = await fs.readFile(path.join(tempDir, ".claude", "CLAUDE.md"), "utf8");
  assert.equal(rootAfter, originalRoot);
  await fs.access(path.join(tempDir, ".planning", "optimization.md"));
});

test("optimize replaces a bloated unowned root CLAUDE file and backs it up outside the repo", async () => {
  const tempDir = await makeTempDir();
  const fakeHome = await makeTempDir();
  await fs.writeFile(
    path.join(tempDir, "package.json"),
    JSON.stringify(
      {
        name: "billing-api",
        scripts: {
          build: "tsc -p tsconfig.json",
          test: "vitest run"
        },
        dependencies: {
          express: "^5.0.0"
        }
      },
      null,
      2
    )
  );
  await fs.mkdir(path.join(tempDir, ".claude"), { recursive: true });
  const bloatedRoot = Array.from({ length: 160 }, (_, index) => `- instruction ${index + 1}`).join("\n");
  await fs.writeFile(path.join(tempDir, ".claude", "CLAUDE.md"), `# CLAUDE.md\n${bloatedRoot}\n`);

  const result = runCliWithEnv(["optimize", "--path", tempDir, "--write"], {
    cwd: projectRoot,
    env: {
      HOME: fakeHome
    }
  });

  assert.equal(result.status, 0, result.stderr);
  const rootAfter = await fs.readFile(path.join(tempDir, ".claude", "CLAUDE.md"), "utf8");
  assert.match(rootAfter, /## Mission/);
  assert.ok(rootAfter.split("\n").length <= 120);
  assert.match(result.stdout, /Backed up replaced files/);

  const backupRoot = path.join(fakeHome, ".claude", "optimus", "backups");
  const backupEntries = await fs.readdir(backupRoot, { recursive: true });
  assert.ok(backupEntries.some((entry) => String(entry).endsWith(".claude/CLAUDE.md")));
});

test("optimize merges deny rules into existing settings without removing unrelated keys", async () => {
  const tempDir = await makeTempDir();
  await fs.writeFile(
    path.join(tempDir, "package.json"),
    JSON.stringify(
      {
        name: "billing-api",
        scripts: {
          build: "tsc -p tsconfig.json",
          test: "vitest run"
        },
        dependencies: {
          express: "^5.0.0"
        }
      },
      null,
      2
    )
  );
  await fs.mkdir(path.join(tempDir, ".claude"), { recursive: true });
  await fs.writeFile(
    path.join(tempDir, ".claude", "settings.json"),
    JSON.stringify(
      {
        model: "opus",
        permissions: {
          allow: ["WebSearch"]
        }
      },
      null,
      2
    )
  );

  const result = runCli(["optimize", "--path", tempDir, "--write"], projectRoot);

  assert.equal(result.status, 0, result.stderr);
  const settings = JSON.parse(await fs.readFile(path.join(tempDir, ".claude", "settings.json"), "utf8"));
  assert.equal(settings.model, "opus");
  assert.deepEqual(settings.permissions.allow, ["WebSearch"]);
  for (const rule of DEFAULT_DENY_RULES) {
    assert.ok(settings.permissions.deny.includes(rule));
  }
});

test("optimize preserves unowned rule files and creates complementary managed rules", async () => {
  const tempDir = await makeTempDir();
  await fs.writeFile(
    path.join(tempDir, "package.json"),
    JSON.stringify(
      {
        name: "billing-api",
        scripts: {
          build: "tsc -p tsconfig.json",
          test: "vitest run"
        },
        dependencies: {
          express: "^5.0.0"
        }
      },
      null,
      2
    )
  );
  await fs.mkdir(path.join(tempDir, ".claude", "rules"), { recursive: true });
  const customBackendRule = "# Backend Rule\n\n- Keep my custom backend rule.\n";
  await fs.writeFile(path.join(tempDir, ".claude", "rules", "backend.md"), customBackendRule);

  const result = runCli(["optimize", "--path", tempDir, "--write"], projectRoot);

  assert.equal(result.status, 0, result.stderr);
  const backendRuleAfter = await fs.readFile(path.join(tempDir, ".claude", "rules", "backend.md"), "utf8");
  assert.equal(backendRuleAfter, customBackendRule);
  await fs.access(path.join(tempDir, ".claude", "rules", "api.md"));
  await fs.access(path.join(tempDir, ".claude", "rules", "testing.md"));
});

test("optimize dry-run writes nothing and empty directories point back to start", async () => {
  const emptyDir = await makeTempDir();
  const emptyResult = runCli(["optimize", "--path", emptyDir, "--dry-run"], projectRoot);

  assert.equal(emptyResult.status, 0, emptyResult.stderr);
  assert.match(emptyResult.stdout, /Use `optimus start/);

  const repoDir = await makeTempDir();
  await fs.writeFile(
    path.join(repoDir, "package.json"),
    JSON.stringify(
      {
        name: "billing-api",
        dependencies: {
          express: "^5.0.0"
        }
      },
      null,
      2
    )
  );
  const dryRunResult = runCli(["optimize", "--path", repoDir, "--dry-run"], projectRoot);
  assert.equal(dryRunResult.status, 0, dryRunResult.stderr);
  await assert.rejects(fs.access(path.join(repoDir, ".planning", "optimization.md")));
});

test("optimize reruns cleanly on Optimus-managed files", async () => {
  const tempDir = await makeTempDir();
  const startResult = runCli(
    ["start", "Build a billing webhook API", "--path", tempDir, "--write"],
    projectRoot
  );
  assert.equal(startResult.status, 0, startResult.stderr);

  const optimizeResult = runCli(["optimize", "--path", tempDir, "--write"], projectRoot);
  assert.equal(optimizeResult.status, 0, optimizeResult.stderr);

  const state = JSON.parse(await fs.readFile(path.join(tempDir, ".claude", "optimus-state.json"), "utf8"));
  assert.ok(state.managedFiles[".claude/CLAUDE.md"]);
  assert.ok(state.managedFiles[".planning/optimization.md"]);
});

test("status explains empty directories and points to start", async () => {
  const tempDir = await makeTempDir();
  const result = runCli(["status", "--path", tempDir], projectRoot);

  assert.equal(result.status, 0, result.stderr);
  assert.match(result.stdout, /Optimus status: empty directory/);
  assert.match(result.stdout, /optimus start/);
});

test("setup reviews missing default helpers and can install them with stub installers", async () => {
  const fakeHome = await makeTempDir();
  const baseEnv = {
    HOME: fakeHome,
    PATH: `/usr/bin:/bin`,
    OPTIMUS_INSTALL_RTK: `bash "${installRtkStubPath}"`,
    OPTIMUS_INSTALL_RALPH: `bash "${installRalphStubPath}"`
  };

  const reviewResult = runCliWithEnv(["setup", "--dry-run"], {
    cwd: projectRoot,
    env: baseEnv
  });

  assert.equal(reviewResult.status, 0, reviewResult.stderr);
  assert.match(reviewResult.stdout, /Optimus setup: default helpers/i);
  assert.match(reviewResult.stdout, /RTK: missing/i);
  assert.match(reviewResult.stdout, /Ralph: missing/i);
  assert.match(reviewResult.stdout, /Dry run complete/i);

  const writeResult = runCliWithEnv(["setup", "--write"], {
    cwd: projectRoot,
    env: {
      ...baseEnv,
      PATH: `${path.join(fakeHome, ".local", "bin")}:/usr/bin:/bin`
    }
  });

  assert.equal(writeResult.status, 0, writeResult.stderr);
  assert.match(writeResult.stdout, /Installed RTK/i);
  assert.match(writeResult.stdout, /Installed Ralph/i);
  await fs.access(path.join(fakeHome, ".local", "bin", "rtk"));
  await fs.access(path.join(fakeHome, ".local", "bin", "ralph"));
});

test("install-user installs Claude skills, agent, and wrapper into the user directories", async () => {
  const fakeHome = await makeTempDir();
  const result = runCliWithEnv(["install-user"], {
    cwd: projectRoot,
    env: {
      HOME: fakeHome
    }
  });

  assert.equal(result.status, 0, result.stderr);
  await fs.access(path.join(fakeHome, ".local", "bin", "optimus"));
  await fs.access(path.join(fakeHome, ".claude", "skills", "optimus-start", "SKILL.md"));
  await fs.access(path.join(fakeHome, ".claude", "skills", "optimus-optimize", "SKILL.md"));
  await fs.access(path.join(fakeHome, ".claude", "agents", "optimus-guide.md"));
  assert.match(result.stdout, /Installed Claude skills:/);
  assert.match(result.stdout, /Available slash commands:/);
  assert.match(result.stdout, /optimus-guide/);
});

test("status explains unmanaged repos and what optimize can update", async () => {
  const tempDir = await makeTempDir();
  await fs.writeFile(
    path.join(tempDir, "package.json"),
    JSON.stringify(
      {
        name: "billing-api",
        scripts: {
          build: "tsc -p tsconfig.json",
          test: "vitest run"
        },
        dependencies: {
          express: "^5.0.0"
        }
      },
      null,
      2
    )
  );
  await fs.mkdir(path.join(tempDir, ".claude", "rules"), { recursive: true });
  await fs.writeFile(path.join(tempDir, ".claude", "rules", "backend.md"), "# Backend Rule\n\n- custom rule\n");
  await fs.writeFile(
    path.join(tempDir, ".claude", "settings.json"),
    JSON.stringify(
      {
        model: "opus"
      },
      null,
      2
    )
  );

  const result = runCli(["status", "--path", tempDir], projectRoot);

  assert.equal(result.status, 0, result.stderr);
  assert.match(result.stdout, /Optimus status: needs updates/);
  assert.match(result.stdout, /Root CLAUDE\.md: missing/);
  assert.match(result.stdout, /settings file is missing/);
  assert.match(result.stdout, /optimize --dry-run/);
  assert.match(result.stdout, /Optimize will preserve it by default/);
});

test("status includes default helper guidance when the global profile is missing", async () => {
  const tempDir = await makeTempDir();
  const result = runCliWithEnv(["status", "--path", tempDir], {
    cwd: projectRoot,
    env: {
      HOME: await makeTempDir(),
      PATH: "/usr/bin:/bin"
    }
  });

  assert.equal(result.status, 0, result.stderr);
  assert.match(result.stdout, /Default helpers/i);
  assert.match(result.stdout, /RTK: missing/i);
  assert.match(result.stdout, /Ralph: missing/i);
  assert.match(result.stdout, /optimus setup --write/i);
});

test("status reports drift in Optimus-managed files and explains preserve behavior", async () => {
  const tempDir = await makeTempDir();
  const startResult = runCli(
    ["start", "Build a billing webhook API", "--path", tempDir, "--write"],
    projectRoot
  );
  assert.equal(startResult.status, 0, startResult.stderr);

  await fs.appendFile(path.join(tempDir, ".claude", "CLAUDE.md"), "\n## Custom note\n- drifted\n");
  const result = runCli(["status", "--path", tempDir], projectRoot);

  assert.equal(result.status, 0, result.stderr);
  assert.match(result.stdout, /managed file drift/i);
  assert.match(result.stdout, /drifted from the stored Optimus state/i);
  assert.match(result.stdout, /preserve it by default/i);
});
