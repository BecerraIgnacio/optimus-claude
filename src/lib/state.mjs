import crypto from "node:crypto";
import fs from "node:fs/promises";
import os from "node:os";
import path from "node:path";

import { OPTIMUS_VERSION } from "./version.mjs";

export const OPTIMUS_STATE_RELATIVE_PATH = ".claude/optimus-state.json";

function sortObjectEntries(object) {
  return Object.fromEntries(Object.entries(object).sort(([left], [right]) => left.localeCompare(right)));
}

export function hashText(value) {
  return crypto.createHash("sha256").update(String(value), "utf8").digest("hex");
}

export async function readTextFileIfExists(filePath) {
  try {
    return await fs.readFile(filePath, "utf8");
  } catch {
    return null;
  }
}

export async function loadOptimusState(targetDir) {
  const absolutePath = path.join(targetDir, OPTIMUS_STATE_RELATIVE_PATH);
  const raw = await readTextFileIfExists(absolutePath);

  if (raw === null) {
    return {
      exists: false,
      parseable: false,
      absolutePath,
      state: null,
      managedCount: 0,
      version: ""
    };
  }

  try {
    const state = JSON.parse(raw);
    const managedFiles = state?.managedFiles && typeof state.managedFiles === "object" ? state.managedFiles : {};
    return {
      exists: true,
      parseable: true,
      absolutePath,
      state,
      managedCount: Object.keys(managedFiles).length,
      version: typeof state?.version === "string" ? state.version : ""
    };
  } catch {
    return {
      exists: true,
      parseable: false,
      absolutePath,
      state: null,
      managedCount: 0,
      version: ""
    };
  }
}

export function classifyOwnership({ relativePath, existingContent, stateInfo }) {
  if (relativePath === OPTIMUS_STATE_RELATIVE_PATH) {
    return {
      kind: "tool",
      isManaged: true,
      isModified: false
    };
  }

  if (existingContent === null) {
    return {
      kind: "absent",
      isManaged: false,
      isModified: false
    };
  }

  if (!stateInfo?.parseable) {
    return {
      kind: "unowned",
      isManaged: false,
      isModified: false
    };
  }

  const entry = stateInfo.state?.managedFiles?.[relativePath];
  if (!entry?.sha256) {
    return {
      kind: "unowned",
      isManaged: false,
      isModified: false
    };
  }

  const currentHash = hashText(existingContent);
  if (currentHash === entry.sha256) {
    return {
      kind: "managed",
      isManaged: true,
      isModified: false
    };
  }

  return {
    kind: "managed-modified",
    isManaged: true,
    isModified: true
  };
}

export function createManagedState({ existingStateInfo = null, managedFiles = {}, carriedForwardPaths = [] }) {
  const nextManagedFiles = {};
  const existingManagedFiles = existingStateInfo?.parseable ? existingStateInfo.state?.managedFiles ?? {} : {};

  for (const relativePath of carriedForwardPaths) {
    if (existingManagedFiles[relativePath]) {
      nextManagedFiles[relativePath] = existingManagedFiles[relativePath];
    }
  }

  for (const [relativePath, content] of Object.entries(managedFiles)) {
    if (relativePath === OPTIMUS_STATE_RELATIVE_PATH) {
      continue;
    }

    nextManagedFiles[relativePath] = {
      sha256: hashText(content)
    };
  }

  return {
    version: OPTIMUS_VERSION,
    updatedAt: new Date().toISOString(),
    managedFiles: sortObjectEntries(nextManagedFiles)
  };
}

export function renderManagedState(stateObject) {
  return JSON.stringify(stateObject, null, 2);
}

export async function backupFiles(targetDir, relativePaths, { homeDir = os.homedir() } = {}) {
  const projectHash = hashText(path.resolve(targetDir)).slice(0, 12);
  const timestamp = new Date().toISOString().replaceAll(":", "-");
  const backupRoot = path.join(homeDir, ".claude", "optimus", "backups", projectHash, timestamp);
  const writtenFiles = [];

  for (const relativePath of relativePaths) {
    const sourcePath = path.join(targetDir, relativePath);
    const targetPath = path.join(backupRoot, relativePath);
    const sourceContent = await readTextFileIfExists(sourcePath);

    if (sourceContent === null) {
      continue;
    }

    await fs.mkdir(path.dirname(targetPath), { recursive: true });
    await fs.writeFile(targetPath, sourceContent, "utf8");
    writtenFiles.push(targetPath);
  }

  return {
    backupRoot,
    writtenFiles
  };
}
