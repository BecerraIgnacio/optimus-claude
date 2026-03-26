import path from "node:path";

import { runClaudeJson } from "../lib/claude.mjs";
import { inspectTargetDirectory } from "../lib/inspect.mjs";
import { mergeProposal } from "../lib/merge.mjs";
import { buildRepoReviewPrompt, buildStartPrompt } from "../lib/prompting.mjs";
import { loadReferenceManifest, selectReferences } from "../lib/references.mjs";
import { renderProjectFiles, renderReview, getWritePlan, writeProjectFiles } from "../lib/render.mjs";
import { expandHomePath, getAssetPaths } from "../lib/runtime.mjs";
import { createManagedState, OPTIMUS_STATE_RELATIVE_PATH, renderManagedState } from "../lib/state.mjs";
import { loadToolManifest, maybeOfferDefaultToolSetup } from "../lib/tooling.mjs";

function parseExplicitRefs(value) {
  return String(value || "")
    .split(",")
    .map((item) => item.trim())
    .filter(Boolean);
}

async function resolveIdea(options, io) {
  let idea = String(options.idea || "").trim();
  let stack = String(options.stack || "").trim();

  if (!idea) {
    idea = await io.prompt("Project idea: ");
  }

  if (!idea) {
    const error = new Error("A project idea is required");
    error.exitCode = 1;
    throw error;
  }

  if (idea.length < 12) {
    const outcome = await io.prompt("Main outcome: ");
    if (outcome) {
      idea = `${idea} - ${outcome}`;
    }
  }

  if (!stack && !idea.match(/react|next|node|python|go|rust|api|backend|frontend|web app|cli/i) && io.isInteractive()) {
    stack = await io.prompt("Stack hint (optional): ");
  }

  return { idea, stack };
}

export async function runStartCommand(options, { io }) {
  const targetDir = path.resolve(expandHomePath(options.path || "."));
  const { idea, stack } = await resolveIdea(options, io);
  const explicitRefs = parseExplicitRefs(options.refs);
  const assets = getAssetPaths();
  const toolManifest = await loadToolManifest(assets.toolManifestPath);
  await maybeOfferDefaultToolSetup(toolManifest, {
    io,
    allowPrompt: !options.dryRun
  });
  const inspection = await inspectTargetDirectory(targetDir);
  const manifest = await loadReferenceManifest(assets.referenceManifestPath);
  const references = selectReferences(manifest, {
    idea,
    stackHint: stack,
    explicitRefs,
    inspection
  });

  const startPrompt = await buildStartPrompt({
    templatePath: assets.startPromptPath,
    idea,
    stackHint: stack,
    inspection,
    references
  });

  const proposal = await runClaudeJson({
    prompt: startPrompt,
    schemaPath: assets.startSchemaPath,
    addDirs: inspection.hasCode ? [inspection.absolutePath] : [],
    cwd: inspection.exists ? inspection.absolutePath : process.cwd()
  });

  let review = null;

  if (inspection.hasCode) {
    try {
      const repoReviewPrompt = await buildRepoReviewPrompt({
        templatePath: assets.repoReviewPromptPath,
        idea,
        stackHint: stack,
        inspection,
        references
      });

      review = await runClaudeJson({
        prompt: repoReviewPrompt,
        schemaPath: assets.repoReviewSchemaPath,
        addDirs: [inspection.absolutePath],
        cwd: inspection.absolutePath
      });
    } catch (error) {
      io.error(`Repo review fallback: ${error.message}`);
    }
  }

  const mergedProposal = mergeProposal({
    proposal,
    review,
    inspection,
    references,
    idea,
    stackHint: stack,
    explicitRefs
  });

  const files = renderProjectFiles({
    proposal: mergedProposal,
    inspection,
    references
  });
  const state = createManagedState({
    managedFiles: Object.fromEntries(files.map((file) => [file.relativePath, file.content]))
  });
  files.push({
    relativePath: OPTIMUS_STATE_RELATIVE_PATH,
    content: renderManagedState(state)
  });

  const writePlan = await getWritePlan(targetDir, files);
  io.write(renderReview({ proposal: mergedProposal, inspection, references, writePlan }));

  if (options.dryRun) {
    io.write("\nDry run complete. No files were written.");
    return;
  }

  if (!options.write) {
    if (io.isInteractive()) {
      const confirmation = (await io.prompt("\nWrite these files? [y/N] ")).toLowerCase();
      if (confirmation !== "y" && confirmation !== "yes") {
        io.write("Skipped writing files.");
        return;
      }
    } else {
      io.write("\nReview only. Re-run with --write or use an interactive terminal to confirm.");
      return;
    }
  }

  const writtenFiles = await writeProjectFiles(targetDir, files);
  io.write("\nWrote files:");
  for (const filePath of writtenFiles) {
    io.write(`- ${filePath}`);
  }
}
