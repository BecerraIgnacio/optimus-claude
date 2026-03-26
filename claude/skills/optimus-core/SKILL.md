---
name: optimus-core
description: Internal Optimus workflow guidance for bootstrapping, auditing, and maintaining Claude Code project setup with the installed optimus CLI. Use from the Optimus agent or Optimus slash skills.
user-invocable: false
disable-model-invocation: true
allowed-tools: Bash(optimus *), Read, Grep, Glob
---

Use the installed `optimus` CLI instead of recreating its workflow by hand.

Core rules:

1. Prefer `optimus status --path .` before `optimus optimize` when the repo already exists.
2. Preserve the review gate. Use `--dry-run` or the default review path before `--write` unless the user clearly asked to apply changes now.
3. Translate command output into short, plain-English guidance instead of pasting terminal noise.
4. Keep the working path local to the current repository unless the user explicitly gives another path.
5. If Optimus reports missing default helpers, surface `optimus setup --write` before continuing.
6. Do not bypass Optimus ownership rules, backup rules, or conservative merge behavior.
