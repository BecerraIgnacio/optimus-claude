#!/usr/bin/env node

import { main } from "../src/cli.mjs";

main(process.argv.slice(2)).catch((error) => {
  const message = error instanceof Error ? error.message : String(error);
  console.error(`optimus: ${message}`);

  if (process.env.OPTIMUS_DEBUG && error instanceof Error && error.stack) {
    console.error(error.stack);
  }

  process.exitCode = Number.isInteger(error?.exitCode) ? error.exitCode : 1;
});
