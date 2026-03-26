---
name: optimus-setup
description: Install or verify the personal Optimus helper stack for Claude Code. Use when the user wants to set up Optimus, RTK, Ralph, or the Claude-side Optimus package.
argument-hint: "[install now]"
disable-model-invocation: true
allowed-tools: Bash(optimus *)
context: fork
---

You are running the Optimus setup workflow.

1. Run `optimus setup --dry-run`.
2. Explain what is already installed and what is missing in simple language.
3. If the user explicitly asked to install now, run `optimus setup --write`.
4. Otherwise ask for confirmation before any write step.
5. If setup succeeds, tell the user the next natural command:
   - `/optimus-start "<idea>"` for a new project
   - `/optimus-status` or `/optimus-optimize` for an existing repo
