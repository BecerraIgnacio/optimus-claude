You are generating a lean bootstrap package for a coding project.

Return JSON only and match the provided schema exactly.
Do not output markdown fences.
Do not write implementation tasks.
Do not propose autonomous execution loops.
Keep every list concise and concrete.
The root CLAUDE.md rendered from your output must stay compact.

Project idea:
{{idea}}

Optional stack hint:
{{stack_hint}}

Target directory summary:
{{target_summary}}

Curated reference guidance:
{{reference_summary}}

Output expectations:
- Produce a project title, short summary, audience, and project type.
- Provide 3 to 5 primary outcomes and success criteria.
- Fill project sections for problem, users, in-scope work, and out-of-scope work.
- Record only the most important decisions and research notes.
- Keep root CLAUDE.md guidance short, practical, and session-oriented.
- Create only scoped rules that are clearly relevant to this project.
- Build/test commands may be empty when not yet known.
