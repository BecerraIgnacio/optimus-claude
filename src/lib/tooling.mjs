import fs from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import { execFile, spawn } from "node:child_process";
import { promisify } from "node:util";

const execFileAsync = promisify(execFile);
const DEFAULT_PROFILE_ID = "default";

function normalizeToolIdForEnv(toolId) {
  return String(toolId || "")
    .trim()
    .toUpperCase()
    .replace(/[^A-Z0-9]+/g, "_");
}

function resolveProfile(manifest, profileId = DEFAULT_PROFILE_ID) {
  const profile = (manifest.profiles || []).find((item) => item.id === profileId);

  if (!profile) {
    const error = new Error(`Unknown tool profile: ${profileId}`);
    error.exitCode = 1;
    throw error;
  }

  return profile;
}

function resolveTool(manifest, toolId) {
  const tool = (manifest.tools || []).find((item) => item.id === toolId);

  if (!tool) {
    const error = new Error(`Unknown tool in manifest: ${toolId}`);
    error.exitCode = 1;
    throw error;
  }

  return tool;
}

async function runShellCommand(command, { cwd = process.cwd() } = {}) {
  await new Promise((resolve, reject) => {
    const child = spawn("/bin/bash", ["-lc", command], {
      cwd,
      stdio: "inherit",
      env: process.env
    });

    child.on("error", reject);
    child.on("exit", (code) => {
      if (code === 0) {
        resolve();
        return;
      }

      const error = new Error(`Command failed with exit code ${code}`);
      error.exitCode = code || 1;
      reject(error);
    });
  });
}

async function probeTool(tool) {
  const checkArgs = Array.isArray(tool.checkArgs) && tool.checkArgs.length > 0 ? tool.checkArgs : [["--help"]];
  const localToolPath = path.join(os.homedir(), ".local", "bin", tool.command);
  let lastError = null;

  for (const candidateCommand of [tool.command, localToolPath]) {
    const onPath = candidateCommand === tool.command;

    for (const args of checkArgs) {
      try {
        const { stdout, stderr } = await execFileAsync(candidateCommand, args, {
          maxBuffer: 1024 * 1024
        });
        const detail = `${stdout || stderr}`.trim().split(/\r?\n/).find(Boolean) || "";

        return {
          ...tool,
          installed: true,
          onPath,
          detectedBy: [candidateCommand, ...args].join(" "),
          detail
        };
      } catch (error) {
        lastError = error;
        if (error?.code === "ENOENT") {
          continue;
        }
      }
    }
  }

  return {
    ...tool,
    installed: false,
    onPath: false,
    detectedBy: tool.command,
    detail: lastError?.code === "ENOENT" ? "" : String(lastError?.stderr || lastError?.message || "").trim()
  };
}

function formatManualInstallNote(tool) {
  return tool.setupNote || `See ${tool.homepage}`;
}

function getInstallCommand(tool) {
  const override = process.env[`OPTIMUS_INSTALL_${normalizeToolIdForEnv(tool.id)}`];
  if (override) {
    return override;
  }

  switch (tool.installStrategy) {
    case "rtk-shell-installer":
      return "curl -fsSL https://raw.githubusercontent.com/rtk-ai/rtk/refs/heads/master/install.sh | sh";
    case "ralph-clone-installer":
      return [
        'tmpdir="$(mktemp -d)"',
        'git clone https://github.com/frankbria/ralph-claude-code.git "$tmpdir/ralph-claude-code"',
        'cd "$tmpdir/ralph-claude-code"',
        "./install.sh",
        'rm -rf "$tmpdir"'
      ].join("\n");
    default:
      return "";
  }
}

function getPathHint(tool) {
  if (tool.installed && tool.onPath === false) {
    return " Installed under `~/.local/bin` but not currently on PATH.";
  }

  return "";
}

function getActionSummary(report) {
  if (report.missingTools.length > 0) {
    const names = report.missingTools.map((tool) => tool.title).join(", ");
    return `Default helpers missing: ${names}. Run \`optimus setup --write\` once to install them globally.`;
  }

  if (report.pathWarnings.length > 0) {
    return "Default helpers are installed, but `~/.local/bin` is not on PATH yet. Add it to your shell profile, then re-run `optimus setup`.";
  }

  return "";
}

function getSetupNextLine(report) {
  if (report.pathWarnings.length > 0) {
    return "- Add `~/.local/bin` to your PATH, then re-run `optimus setup` to verify the default helpers.";
  }

  if (report.missingTools.length > 0) {
    return "- Run `optimus setup --write` to install the missing default helpers globally.";
  }

  return "- Default helpers are already installed. You can jump straight into `optimus start`, `optimus optimize`, or `optimus status`.";
}

function formatInstalledToolLine(tool) {
  const suffix = tool.detail ? ` ${tool.detail}` : "";
  return `- ${tool.title}: installed.${suffix}${getPathHint(tool)}`;
}

function formatMissingToolLine(tool) {
  return `- ${tool.title}: missing. ${tool.summary}`;
}

async function finalizeInstall(tool) {
  if (tool.id !== "rtk") {
    return;
  }

  const localRtkPath = path.join(os.homedir(), ".local", "bin", "rtk");
  await runShellCommand(`"${localRtkPath}" init -g --auto-patch`);
}

export async function loadToolManifest(filePath) {
  const raw = await fs.readFile(filePath, "utf8");
  return JSON.parse(raw);
}

export async function inspectToolProfile(manifest, profileId = DEFAULT_PROFILE_ID) {
  const profile = resolveProfile(manifest, profileId);
  const tools = await Promise.all(profile.toolIds.map(async (toolId) => probeTool(resolveTool(manifest, toolId))));
  const missingTools = tools.filter((tool) => !tool.installed);
  const pathWarnings = tools.filter((tool) => tool.installed && tool.onPath === false);

  return {
    profile,
    tools,
    missingTools,
    pathWarnings,
    ready: missingTools.length === 0 && pathWarnings.length === 0
  };
}

export function summarizeToolProfile(report) {
  if (report.ready) {
    return `${report.profile.title}: ready`;
  }

  if (report.missingTools.length > 0) {
    const names = report.missingTools.map((tool) => tool.title).join(", ");
    return `${report.profile.title}: missing ${report.missingTools.length} of ${report.tools.length} tool${report.tools.length === 1 ? "" : "s"} (${names})`;
  }

  return `${report.profile.title}: installed but not fully active`;
}

export function buildToolSetupHint(report) {
  return getActionSummary(report);
}

export function renderSetupReport(report) {
  const lines = [
    `Optimus setup: ${report.profile.title.toLowerCase()}`,
    "",
    report.profile.description,
    "",
    "Current Status",
    ...report.tools.map((tool) => (tool.installed ? formatInstalledToolLine(tool) : formatMissingToolLine(tool))),
    "",
    "What This Setup Does",
    ...report.tools.map((tool) => `- ${tool.title}: ${formatManualInstallNote(tool)}`),
    "",
    "Next",
    getSetupNextLine(report)
  ];

  if (report.missingTools.length > 0) {
    lines.push("- After setup, use `optimus start \"<idea>\"` for new work or `optimus optimize --write` for an existing repo.");
  }

  return lines.join("\n");
}

export async function installMissingTools(report, { io }) {
  const installed = [];

  for (const tool of report.missingTools) {
    if (tool.installStrategy === "manual") {
      io.write(`Skipping ${tool.title}: manual install only. ${formatManualInstallNote(tool)}`);
      continue;
    }

    const command = getInstallCommand(tool);
    if (!command) {
      const error = new Error(`No installer is configured for ${tool.title}`);
      error.exitCode = 1;
      throw error;
    }

    io.write(`\nInstalling ${tool.title}...`);
    await runShellCommand(command);
    await finalizeInstall(tool);
    const refreshed = await probeTool(tool);

    if (!refreshed.installed) {
      const error = new Error(`${tool.title} did not appear after installation.`);
      error.exitCode = 1;
      throw error;
    }

    installed.push(refreshed);
    io.write(`Installed ${tool.title}.${getPathHint(refreshed)}`);
  }

  return installed;
}

export async function maybeOfferDefaultToolSetup(manifest, { io, allowPrompt = true }) {
  const report = await inspectToolProfile(manifest);

  if (report.ready) {
    return report;
  }

  const hint = buildToolSetupHint(report);
  if (hint) {
    io.write(hint);
  }

  if (!allowPrompt || !io.isInteractive()) {
    return report;
  }

  const confirmation = (await io.prompt("Install them now before continuing? [Y/n] ")).toLowerCase();
  if (confirmation === "n" || confirmation === "no") {
    return report;
  }

  await installMissingTools(report, { io });
  return inspectToolProfile(manifest);
}
