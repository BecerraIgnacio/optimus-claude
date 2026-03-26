import os from "node:os";
import path from "node:path";
import { fileURLToPath } from "node:url";

const CURRENT_DIR = path.dirname(fileURLToPath(import.meta.url));

export function getProjectRoot() {
  return path.resolve(CURRENT_DIR, "../..");
}

export function getAssetPaths(root = getProjectRoot()) {
  return {
    root,
    referenceManifestPath: path.join(root, "assets", "manifests", "references.json"),
    toolManifestPath: path.join(root, "assets", "manifests", "tools.json"),
    optimizePromptPath: path.join(root, "assets", "prompts", "optimize.md"),
    startPromptPath: path.join(root, "assets", "prompts", "start-planning.md"),
    repoReviewPromptPath: path.join(root, "assets", "prompts", "repo-review.md"),
    optimizeSchemaPath: path.join(root, "assets", "schemas", "optimize.schema.json"),
    startSchemaPath: path.join(root, "assets", "schemas", "start.schema.json"),
    repoReviewSchemaPath: path.join(root, "assets", "schemas", "repo-review.schema.json")
  };
}

export function expandHomePath(value) {
  if (!value) {
    return value;
  }

  if (value === "~") {
    return os.homedir();
  }

  if (value.startsWith("~/")) {
    return path.join(os.homedir(), value.slice(2));
  }

  return value;
}
