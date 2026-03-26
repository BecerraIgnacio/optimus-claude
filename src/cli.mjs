import { createIo } from "./lib/io.mjs";
import { installUser } from "./lib/install-user.mjs";
import { OPTIMUS_VERSION } from "./lib/version.mjs";
import { runOptimizeCommand } from "./commands/optimize.mjs";
import { runSetupCommand } from "./commands/setup.mjs";
import { runStartCommand } from "./commands/start.mjs";
import { runStatusCommand } from "./commands/status.mjs";

function printHelp(io) {
  io.write(
    [
      "Usage:",
      "  optimus setup [--dry-run] [--write]",
      "  optimus start \"<project idea>\" [--path <dir>] [--stack <hint>] [--refs <tag1,tag2>] [--dry-run] [--write]",
      "  optimus optimize [--path <dir>] [--stack <hint>] [--refs <tag1,tag2>] [--dry-run] [--write]",
      "  optimus status [--path <dir>]",
      "  optimus install-user",
      "",
      "Quick Start:",
      "  1. optimus setup --write",
      "  2. optimus start \"<idea>\"   or   optimus status",
      "  3. optimus optimize --write",
      "",
      "Options:",
      "  --path <dir>     Target directory, defaults to the current directory",
      "  --stack <hint>   Optional stack hint for reference and rule selection",
      "  --refs <tags>    Optional comma-separated tags, such as frontend,design",
      "  --dry-run        Print the reviewed proposal and skip file writes",
      "  --write          Skip the review gate and write files immediately",
      "  -h, --help       Show this help",
      "  -v, --version    Show the version"
    ].join("\n")
  );
}

function readValue(args, index, flag) {
  if (index >= args.length) {
    const error = new Error(`Missing value for ${flag}`);
    error.exitCode = 1;
    throw error;
  }

  return args[index];
}

function parseCommandArgs(args, { allowIdea }) {
  const options = {
    path: ".",
    stack: "",
    refs: "",
    dryRun: false,
    write: false,
    idea: ""
  };

  const positionals = [];

  for (let index = 0; index < args.length; index += 1) {
    const arg = args[index];

    switch (arg) {
      case "--path":
        options.path = readValue(args, index + 1, arg);
        index += 1;
        break;
      case "--stack":
        options.stack = readValue(args, index + 1, arg);
        index += 1;
        break;
      case "--refs":
        options.refs = readValue(args, index + 1, arg);
        index += 1;
        break;
      case "--dry-run":
        options.dryRun = true;
        break;
      case "--write":
        options.write = true;
        break;
      case "-h":
      case "--help":
        options.help = true;
        break;
      default:
        if (arg.startsWith("-")) {
          const error = new Error(`Unknown option: ${arg}`);
          error.exitCode = 1;
          throw error;
        }

        positionals.push(arg);
        break;
    }
  }

  if (!allowIdea && positionals.length > 0) {
    const error = new Error(`Unexpected positional arguments: ${positionals.join(" ")}`);
    error.exitCode = 1;
    throw error;
  }

  options.idea = positionals.join(" ").trim();
  return options;
}

function parseSimpleArgs(args, { allowPath = false } = {}) {
  const options = {
    path: ".",
    dryRun: false,
    write: false
  };

  for (let index = 0; index < args.length; index += 1) {
    const arg = args[index];

    switch (arg) {
      case "--path":
        if (!allowPath) {
          const error = new Error(`Unknown option: ${arg}`);
          error.exitCode = 1;
          throw error;
        }
        options.path = readValue(args, index + 1, arg);
        index += 1;
        break;
      case "--dry-run":
        options.dryRun = true;
        break;
      case "--write":
        options.write = true;
        break;
      case "-h":
      case "--help":
        options.help = true;
        break;
      default: {
        const error = new Error(`Unknown option: ${arg}`);
        error.exitCode = 1;
        throw error;
      }
    }
  }

  return options;
}

export async function main(argv = process.argv.slice(2)) {
  const io = createIo();

  if (argv.length === 0 || argv[0] === "-h" || argv[0] === "--help") {
    printHelp(io);
    return;
  }

  if (argv[0] === "-v" || argv[0] === "--version") {
    io.write(OPTIMUS_VERSION);
    return;
  }

  const command = argv[0];
  const rest = argv.slice(1);

  switch (command) {
    case "setup": {
      const options = parseSimpleArgs(rest);
      if (options.help) {
        printHelp(io);
        return;
      }

      await runSetupCommand(options, { io });
      return;
    }

    case "start": {
      const options = parseCommandArgs(rest, { allowIdea: true });
      if (options.help) {
        printHelp(io);
        return;
      }

      await runStartCommand(options, { io });
      return;
    }

    case "optimize": {
      const options = parseCommandArgs(rest, { allowIdea: false });
      if (options.help) {
        printHelp(io);
        return;
      }

      await runOptimizeCommand(options, { io });
      return;
    }

    case "status": {
      const options = parseSimpleArgs(rest, { allowPath: true });
      if (options.help) {
        printHelp(io);
        return;
      }

      await runStatusCommand(options, { io });
      return;
    }

    case "install-user":
      await installUser({ io });
      return;

    default: {
      const error = new Error(`Unknown command: ${command}`);
      error.exitCode = 1;
      throw error;
    }
  }
}
