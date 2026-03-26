---
name: optimus-status
description: Explain the current Optimus and Claude Code setup for the current repository. Use when the user wants a plain-English audit before deciding whether to optimize.
argument-hint: "[path]"
disable-model-invocation: true
allowed-tools: Bash(optimus *)
context: fork
---

You are running the Optimus status workflow.

1. If the user supplied a path, use it. Otherwise use the current directory.
2. Run `optimus status --path <target>`.
3. Summarize the result in plain English:
   - overall state
   - most important problem, if any
   - exactly what command the user should run next
4. Do not rewrite files from this skill.
