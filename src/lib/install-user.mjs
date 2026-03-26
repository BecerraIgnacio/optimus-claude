import fs from "node:fs/promises";
import os from "node:os";
import path from "node:path";

import { getProjectRoot } from "./runtime.mjs";

async function copyEntry(sourceRoot, installRoot, entryName) {
  const sourcePath = path.join(sourceRoot, entryName);
  const targetPath = path.join(installRoot, entryName);
  await fs.cp(sourcePath, targetPath, { recursive: true });
}

async function listDirectoryEntries(directoryPath) {
  try {
    return await fs.readdir(directoryPath, { withFileTypes: true });
  } catch {
    return [];
  }
}

async function installClaudeSkills(sourceRoot, claudeRoot) {
  const sourceSkillsRoot = path.join(sourceRoot, "claude", "skills");
  const targetSkillsRoot = path.join(claudeRoot, "skills");
  const entries = await listDirectoryEntries(sourceSkillsRoot);
  const installed = [];

  await fs.mkdir(targetSkillsRoot, { recursive: true });

  for (const entry of entries) {
    if (!entry.isDirectory()) {
      continue;
    }

    const sourcePath = path.join(sourceSkillsRoot, entry.name);
    const targetPath = path.join(targetSkillsRoot, entry.name);
    await fs.rm(targetPath, { recursive: true, force: true });
    await fs.cp(sourcePath, targetPath, { recursive: true });
    installed.push(entry.name);
  }

  return installed.sort();
}

async function installClaudeAgents(sourceRoot, claudeRoot) {
  const sourceAgentsRoot = path.join(sourceRoot, "claude", "agents");
  const targetAgentsRoot = path.join(claudeRoot, "agents");
  const entries = await listDirectoryEntries(sourceAgentsRoot);
  const installed = [];

  await fs.mkdir(targetAgentsRoot, { recursive: true });

  for (const entry of entries) {
    if (!entry.isFile() || !entry.name.endsWith(".md")) {
      continue;
    }

    const sourcePath = path.join(sourceAgentsRoot, entry.name);
    const targetPath = path.join(targetAgentsRoot, entry.name);
    await fs.rm(targetPath, { force: true });
    await fs.cp(sourcePath, targetPath);
    installed.push(entry.name.replace(/\.md$/i, ""));
  }

  return installed.sort();
}

export async function installUser({ io }) {
  const sourceRoot = getProjectRoot();
  const claudeRoot = path.join(os.homedir(), ".claude");
  const installRoot = path.join(claudeRoot, "optimus");
  const wrapperDir = path.join(os.homedir(), ".local", "bin");
  const entries = ["assets", "bin", "claude", "src", "package.json", "README.md", "install.sh"];

  await fs.mkdir(claudeRoot, { recursive: true });
  await fs.rm(installRoot, { recursive: true, force: true });
  await fs.mkdir(installRoot, { recursive: true });

  for (const entry of entries) {
    await copyEntry(sourceRoot, installRoot, entry);
  }

  const installedSkills = await installClaudeSkills(sourceRoot, claudeRoot);
  const installedAgents = await installClaudeAgents(sourceRoot, claudeRoot);

  await fs.mkdir(wrapperDir, { recursive: true });
  const wrapperPath = path.join(wrapperDir, "optimus");
  const wrapperScript = `#!/usr/bin/env bash\nexec node "${path.join(installRoot, "bin", "optimus.mjs")}" "$@"\n`;
  await fs.writeFile(wrapperPath, wrapperScript, { mode: 0o755 });
  await fs.chmod(wrapperPath, 0o755);

  io.write(`Installed Optimus runtime to ${installRoot}`);
  io.write(`Created wrapper: ${wrapperPath}`);
  io.write(`Installed Claude skills: ${installedSkills.join(", ")}`);
  io.write(`Installed Claude agents: ${installedAgents.join(", ")}`);
  io.write("Available slash commands: /optimus-setup, /optimus-status, /optimus-start, /optimus-optimize");
  io.write("Available agent: optimus-guide");
}
