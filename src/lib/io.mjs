import readline from "node:readline/promises";

export function createIo(stdout = process.stdout, stderr = process.stderr, stdin = process.stdin) {
  return {
    stdout,
    stderr,
    stdin,
    isInteractive() {
      return Boolean(stdin.isTTY && stdout.isTTY);
    },
    write(message = "") {
      stdout.write(`${message}${message.endsWith("\n") ? "" : "\n"}`);
    },
    error(message = "") {
      stderr.write(`${message}${message.endsWith("\n") ? "" : "\n"}`);
    },
    async prompt(question) {
      if (!stdin.isTTY || !stdout.isTTY) {
        const error = new Error("Cannot prompt without an interactive terminal");
        error.exitCode = 1;
        throw error;
      }

      const rl = readline.createInterface({ input: stdin, output: stdout });

      try {
        return (await rl.question(question)).trim();
      } finally {
        rl.close();
      }
    }
  };
}
