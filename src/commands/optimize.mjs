import path from "node:path";

import { runClaudeJson } from "../lib/claude.mjs";
import { inspectTargetDirectory } from "../lib/inspect.mjs";
import { mergeOptimizationAudit } from "../lib/merge.mjs";
import { buildOptimizePlan, applyOptimizePlan, renderOptimizeReview } from "../lib/optimize-flow.mjs";
import { buildOptimizePrompt } from "../lib/prompting.mjs";
import { loadReferenceManifest, selectReferences } from "../lib/references.mjs";
import { expandHomePath, getAssetPaths } from "../lib/runtime.mjs";
import { loadOptimusState } from "../lib/state.mjs";
import { loadToolManifest, maybeOfferDefaultToolSetup } from "../lib/tooling.mjs";

function parseExplicitRefs(value) {
  return String(value || "")
    .split(",")
    .map((item) => item.trim())
    .filter(Boolean);
}

export async function runOptimizeCommand(options, { io }) {
  const targetDir = path.resolve(expandHomePath(options.path || "."));
  const stackHint = String(options.stack || "").trim();
  const explicitRefs = parseExplicitRefs(options.refs);
  const assets = getAssetPaths();
  const toolManifest = await loadToolManifest(assets.toolManifestPath);
  await maybeOfferDefaultToolSetup(toolManifest, {
    io,
    allowPrompt: !options.dryRun
  });
  const inspection = await inspectTargetDirectory(targetDir);

  if (inspection.meaningfulEntryCount === 0) {
    io.write('No meaningful project files were found. Use `optimus start "<project idea>"` instead.');
    return;
  }

  const manifest = await loadReferenceManifest(assets.referenceManifestPath);
  const references = selectReferences(manifest, {
    idea: "",
    stackHint,
    explicitRefs,
    inspection
  });

  const prompt = await buildOptimizePrompt({
    templatePath: assets.optimizePromptPath,
    stackHint,
    inspection,
    references
  });

  const audit = await runClaudeJson({
    prompt,
    schemaPath: assets.optimizeSchemaPath,
    addDirs: [inspection.absolutePath],
    cwd: inspection.absolutePath
  });
  const projectLabel = audit.project_title || path.basename(inspection.absolutePath);
  const optimization = mergeOptimizationAudit({
    audit,
    inspection,
    references,
    stackHint,
    explicitRefs,
    projectLabel
  });
  const stateInfo = await loadOptimusState(targetDir);
  const plan = await buildOptimizePlan({
    targetDir,
    inspection,
    optimization,
    references,
    stateInfo
  });

  io.write(renderOptimizeReview({
    optimization,
    inspection,
    references,
    actions: plan.actions,
    findings: plan.findings
  }));

  if (options.dryRun) {
    io.write("\nDry run complete. No files were written.");
    return;
  }

  if (!options.write) {
    if (io.isInteractive()) {
      const confirmation = (await io.prompt("\nApply these optimization changes? [y/N] ")).toLowerCase();
      if (confirmation !== "y" && confirmation !== "yes") {
        io.write("Skipped writing files.");
        return;
      }
    } else {
      io.write("\nReview only. Re-run with --write or use an interactive terminal to confirm.");
      return;
    }
  }

  const result = await applyOptimizePlan(targetDir, plan.actions);

  if (result.backupInfo?.writtenFiles?.length) {
    io.write(`\nBacked up replaced files to: ${result.backupInfo.backupRoot}`);
  }

  io.write("\nWrote files:");
  for (const filePath of result.writtenFiles) {
    io.write(`- ${filePath}`);
  }
}
