import { getAssetPaths } from "../lib/runtime.mjs";
import { inspectToolProfile, installMissingTools, loadToolManifest, renderSetupReport, summarizeToolProfile } from "../lib/tooling.mjs";

export async function runSetupCommand(options, { io }) {
  const assets = getAssetPaths();
  const manifest = await loadToolManifest(assets.toolManifestPath);
  let report = await inspectToolProfile(manifest);

  io.write(renderSetupReport(report));

  if (report.ready) {
    return;
  }

  if (options.dryRun) {
    io.write("\nDry run complete. No tools were installed.");
    return;
  }

  if (!options.write) {
    if (io.isInteractive()) {
      const confirmation = (await io.prompt("\nInstall the missing default helpers now? [Y/n] ")).toLowerCase();
      if (confirmation === "n" || confirmation === "no") {
        io.write("Skipped setup.");
        return;
      }
    } else {
      io.write("\nReview only. Re-run with --write or use an interactive terminal to confirm.");
      return;
    }
  }

  const installed = await installMissingTools(report, { io });
  report = await inspectToolProfile(manifest);

  io.write("\nSetup complete.");
  io.write(summarizeToolProfile(report));

  if (installed.length > 0) {
    io.write(`Installed tools: ${installed.map((tool) => tool.title).join(", ")}`);
  }
}
