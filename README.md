# Optimus

> Claude-native bootstrap and cleanup for Claude Code projects.

Optimus helps you start new projects faster and clean up existing ones without turning your repo into one giant `CLAUDE.md`.

Install it once, then use Claude-facing commands to:

- bootstrap a new idea with a compact `.planning/` and `.claude/` package
- audit an existing repo before changing anything
- optimize an existing Claude setup conservatively
- keep root context small and move heavy guidance into scoped rules

No giant omniprompt. No blind rewrites. No autonomous loops by default.

## Why It Exists

Most Claude Code repos drift into the same problems:

- the root `CLAUDE.md` gets too big
- planning, rules, and temporary notes get mixed together
- every new repo repeats the same manual setup
- existing repos are hard to normalize without breaking custom files

Optimus fixes that with a simple model:

- small root context
- scoped rules only when relevant
- review-first writes
- ownership tracking for managed files
- backups before risky replacement

## Quick Start

Copy and paste this:

```bash
git clone https://github.com/BecerraIgnacio/optimus-claude.git && cd optimus-claude && ./install.sh
```

Then inside Claude Code:

```text
/optimus-setup
/optimus-start Build a SaaS analytics dashboard
```

For an existing repo:

```text
/optimus-status
/optimus-optimize
```

If the slash commands do not appear immediately, start a new Claude Code session.

## What Makes It Different

| Instead of this | Optimus does this |
| --- | --- |
| one huge always-on prompt | keeps root instructions compact |
| repeated manual scaffolding | generates a structured project package |
| risky cleanup on existing repos | applies conservative, review-first optimization |
| overwriting user files | preserves unowned files by default |
| vague repo state | explains exactly what exists and what can be updated |

## Claude-Native Workflow

After installation, Optimus adds personal Claude skills under `~/.claude/skills/` and a personal agent under `~/.claude/agents/`.

### Skills

| Skill | Purpose |
| --- | --- |
| `/optimus-setup` | Check or install the default helper stack |
| `/optimus-status` | Explain the current repo state in plain English |
| `/optimus-start` | Bootstrap a new project package from an idea |
| `/optimus-optimize` | Audit and conservatively improve an existing repo |

### Agent

| Agent | Purpose |
| --- | --- |
| `optimus-guide` | General Optimus agent for bootstrap, audit, and optimization workflows |

The CLI still exists, but it is the runtime behind the Claude-facing workflow, not the main product surface.

## Core Workflows

| You want to... | Use this |
| --- | --- |
| install the default helper stack | `/optimus-setup` |
| start a new project from an idea | `/optimus-start <idea>` |
| inspect a repo before changing it | `/optimus-status` |
| clean up an existing Claude setup | `/optimus-optimize` |
| work from the terminal directly | `optimus setup`, `optimus start`, `optimus status`, `optimus optimize` |

## What Optimus Writes

Depending on the repo and command, Optimus may create or update:

```text
.planning/
  project.md
  decisions.md
  research.md
  next.md
  optimization.md

.claude/
  CLAUDE.md
  settings.json
  rules/*.md
  optimus-state.json
```

## Safety Model

Optimus is intentionally conservative.

- `status` is read-only
- `start` and `optimize` are review-first by default
- unowned rule files are preserved
- existing unowned planning docs are not regenerated
- root `CLAUDE.md` is only replaced when it is clearly bloated
- replaced user files are backed up outside the repo
- Optimus-managed files are tracked in `.claude/optimus-state.json`

This makes it practical to run on real repos, not just toy demos.

## Default Helper Profile

Optimus separates repo setup from machine-level helpers.

The default helper profile is intentionally small:

- [`rtk-ai/rtk`](https://github.com/rtk-ai/rtk) for token-efficient shell workflow support
- [`frankbria/ralph-claude-code`](https://github.com/frankbria/ralph-claude-code) for a stronger Claude Code command layer

Run:

```bash
optimus setup --write
```

`start`, `optimize`, and `status` also check whether those helpers are present and tell you what to do if they are missing.

## Installation Details

Install command:

```bash
git clone https://github.com/BecerraIgnacio/optimus-claude.git && cd optimus-claude && ./install.sh
```

That installs:

- the Optimus runtime at `~/.claude/optimus`
- personal skills at `~/.claude/skills/optimus-*`
- the personal agent at `~/.claude/agents/optimus-guide.md`
- the terminal wrapper at `~/.local/bin/optimus`

After that you can use Optimus either inside Claude Code or directly from the terminal.

## CLI Commands

| Command | Purpose |
| --- | --- |
| `optimus setup` | Install the default helper profile |
| `optimus start "<idea>"` | Bootstrap a new or lightly initialized project |
| `optimus optimize` | Audit and conservatively improve an existing repo |
| `optimus status` | Explain current setup, drift, and recommended updates |
| `optimus install-user` | Install the personal Optimus package manually |

## Why The Output Stays Lean

Optimus uses Claude for structured reasoning, but keeps the file generation deterministic.

That means:

- up to 3 curated reference sources per run
- compact root `CLAUDE.md`
- optional guidance moved into scoped rules
- one planning invocation plus one optional repo-review pass
- no hooks, no autonomous loops, and no heavy orchestration in v1

## Reference Ecosystem

Optimus uses a curated subset of the Claude Code ecosystem.

### Default install profile

- [`rtk-ai/rtk`](https://github.com/rtk-ai/rtk)
- [`frankbria/ralph-claude-code`](https://github.com/frankbria/ralph-claude-code)

### Curated references and optional extras

- [`thedotmack/claude-mem`](https://github.com/thedotmack/claude-mem)
- [`obra/superpowers`](https://github.com/obra/superpowers)
- [`gsd-build/get-shit-done`](https://github.com/gsd-build/get-shit-done)
- [`nextlevelbuilder/ui-ux-pro-max-skill`](https://github.com/nextlevelbuilder/ui-ux-pro-max-skill)
- [`affaan-m/everything-claude-code`](https://github.com/affaan-m/everything-claude-code)
- [`hesreallyhim/awesome-claude-code`](https://github.com/hesreallyhim/awesome-claude-code)

The split is deliberate: the default install should stay small and dependable, while heavier workflow systems remain opt-in.

## Requirements

- Node.js `>= 22`
- Claude Code CLI installed and available as `claude`
- local Claude authentication if you want to run `start` or `optimize`

`status` is fully local and does not call Claude.

## Development

Run the test suite:

```bash
npm test
```

The tests use a local Claude stub, so the suite stays deterministic and does not depend on live Claude responses.

## Scope

Optimus is intentionally narrow.

It is not trying to be a project-management platform, a plugin marketplace, or an autonomous agent framework. It is a practical layer for keeping Claude Code project setup compact, reusable, and safe.

If this saves you time, star the repo.
