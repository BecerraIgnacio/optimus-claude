import { execFile } from "node:child_process";
import { promisify } from "node:util";

const execFileAsync = promisify(execFile);

export async function runClaudeJson({
  binary = process.env.OPTIMUS_CLAUDE_BIN || "claude",
  prompt,
  schemaPath,
  addDirs = [],
  cwd = process.cwd()
}) {
  const args = [
    "--print",
    "--permission-mode",
    "plan",
    "--output-format",
    "json",
    "--json-schema",
    schemaPath
  ];

  if (process.env.OPTIMUS_MODEL) {
    args.push("--model", process.env.OPTIMUS_MODEL);
  }

  for (const addDir of addDirs) {
    args.push("--add-dir", addDir);
  }

  args.push(prompt);

  const { stdout, stderr } = await execFileAsync(binary, args, {
    cwd,
    maxBuffer: 10 * 1024 * 1024
  });

  const raw = stdout.trim();

  if (!raw) {
    const error = new Error(`Claude returned no JSON output${stderr ? `: ${stderr.trim()}` : ""}`);
    error.exitCode = 1;
    throw error;
  }

  try {
    return JSON.parse(raw);
  } catch (error) {
    const parseError = new Error(`Failed to parse Claude JSON output: ${raw.slice(0, 240)}`);
    parseError.cause = error;
    parseError.exitCode = 1;
    throw parseError;
  }
}
