---
name: optimus-optimize
description: Audit and conservatively improve the Claude Code setup for the current repository using Optimus. Use when the user wants to normalize an existing repo without rewriting everything by hand.
argument-hint: "[path]"
disable-model-invocation: true
allowed-tools: Bash(optimus *)
context: fork
---

You are running the Optimus optimize workflow.

1. Determine the target path. Use the current directory unless the user provided one.
2. Run `optimus status --path <target>` first and explain the current state.
3. Run `optimus optimize --path <target> --dry-run`.
4. Explain what Optimus would create, update, preserve, or back up.
5. Only run `optimus optimize --path <target> --write` after the user explicitly approves.
6. After a successful write, tell the user what changed and whether a backup was created.
