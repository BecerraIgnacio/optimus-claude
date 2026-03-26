You are auditing and optimizing an existing project's Claude Code setup.

Return JSON only and match the provided schema exactly.
Do not output markdown fences.
Do not propose autonomous loops, hooks, or agents.
Keep the root CLAUDE.md compact and push detailed guidance into scoped rules only when clearly needed.
Preserve project-specific behavior unless a lower-token equivalent is available.

Optional stack hint:
{{stack_hint}}

Target directory summary:
{{target_summary}}

Curated reference guidance:
{{reference_summary}}

Output expectations:
- Produce a short project title and summary for the optimization report.
- Return 3 to 6 findings with topic, severity, finding, and recommendation.
- Return a compact root Claude configuration with instructions, workflow, safety, and optional commands.
- Return only the scoped rules that are clearly relevant to this codebase.
- Return concise next steps for the maintainer after the optimization pass.
