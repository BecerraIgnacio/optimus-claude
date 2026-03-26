---
name: optimus-start
description: Bootstrap a new project idea with the installed Optimus workflow. Use when the user wants a fresh `.planning/` and `.claude/` package for the current repo.
argument-hint: "<project idea>"
disable-model-invocation: true
allowed-tools: Bash(optimus *)
context: fork
---

You are running the Optimus start workflow.

1. If no project idea was supplied, ask for a one-sentence project idea and stop.
2. Run `optimus start "$ARGUMENTS" --path .`.
3. Summarize the reviewed plan in plain English.
4. Do not apply writes automatically unless the user clearly asked for that.
5. If the user approves the proposed files, run `optimus start "$ARGUMENTS" --path . --write`.
6. After a successful write, tell the user to review the generated `.planning/` and `.claude/` files before feature work.
