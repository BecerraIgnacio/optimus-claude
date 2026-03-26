import path from "node:path";

import { inspectTargetDirectory } from "../lib/inspect.mjs";
import { expandHomePath, getAssetPaths } from "../lib/runtime.mjs";
import { loadOptimusState } from "../lib/state.mjs";
import { analyzeStatus, renderStatusReport } from "../lib/status.mjs";
import { inspectToolProfile, loadToolManifest } from "../lib/tooling.mjs";

export async function runStatusCommand(options, { io }) {
  const targetDir = path.resolve(expandHomePath(options.path || "."));
  const assets = getAssetPaths();
  const inspection = await inspectTargetDirectory(targetDir);
  const stateInfo = await loadOptimusState(targetDir);
  const toolManifest = await loadToolManifest(assets.toolManifestPath);
  const toolReport = await inspectToolProfile(toolManifest);
  const analysis = await analyzeStatus(targetDir, inspection, stateInfo, toolReport);

  io.write(renderStatusReport({
    inspection,
    analysis
  }));
}
