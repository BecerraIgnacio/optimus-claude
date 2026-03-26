import { buildReferenceTags } from "./references.mjs";

export const DEFAULT_RULE_LIBRARY = {
  frontend: {
    title: "Frontend Rule",
    why: "The project has a user-facing interface and benefits from scoped UI guidance.",
    when_to_use: "Use this rule when editing pages, components, styling, forms, or client-side state.",
    instructions: [
      "Keep UI work accessible first: semantic structure, visible focus states, and keyboard-safe interactions.",
      "Prefer reusable view primitives over one-off page-specific patterns when the same interaction repeats.",
      "Keep loading, empty, error, and success states explicit before polishing visuals.",
      "Protect responsive behavior on mobile and desktop instead of designing for a single breakpoint.",
      "Avoid broad refactors while bootstrapping; prefer the smallest UI surface that proves the workflow.",
      "Document any intentionally unusual visual or interaction choices in the nearest planning note."
    ]
  },
  backend: {
    title: "Backend Rule",
    why: "The project includes server-side or service behavior and needs clear operational defaults.",
    when_to_use: "Use this rule when editing APIs, workers, services, persistence, or background jobs.",
    instructions: [
      "Prefer explicit boundaries between transport, business logic, and persistence.",
      "Fail with actionable errors and avoid swallowing operational context that would matter during debugging.",
      "Keep data contracts small and typed where the stack supports it.",
      "Make side effects obvious and isolate network, filesystem, and database calls behind narrow functions.",
      "Do not widen scope into infrastructure changes unless the task clearly requires it.",
      "Add or update verification steps whenever behavior changes at a service boundary."
    ]
  },
  api: {
    title: "API Rule",
    why: "The project idea centers on external interfaces or request-response behavior.",
    when_to_use: "Use this rule when editing route handlers, request validation, response models, or integration points.",
    instructions: [
      "Keep request validation close to the boundary and reject malformed input early.",
      "Prefer stable response shapes and explicit status handling over implicit conventions.",
      "Make authentication and authorization behavior visible in the handler flow.",
      "Keep endpoint side effects idempotent where retries are realistic.",
      "Document contract changes in `.planning/decisions.md` before large edits.",
      "Add examples or test coverage for the highest-risk endpoint changes."
    ]
  },
  testing: {
    title: "Testing Rule",
    why: "The project already exposes or needs testable commands and should keep verification close to changes.",
    when_to_use: "Use this rule when touching behavior that has a runnable test, script, or measurable output.",
    instructions: [
      "Prefer the narrowest test or check that proves the changed behavior before running a full suite.",
      "Update tests when behavior changes instead of carrying stale expectations forward.",
      "Keep flaky or expensive checks out of the default path unless they are the only reliable signal.",
      "Record the exact verification command in `.planning/next.md` when adding new tooling.",
      "Use fixtures that explain intent and keep setup minimal.",
      "Treat missing verification as a gap to document, not something to ignore."
    ]
  },
  security: {
    title: "Security Rule",
    why: "The project handles credentials, external data, or privileged flows and needs tighter operating defaults.",
    when_to_use: "Use this rule when editing auth, payments, secrets handling, uploads, admin behavior, or integrations.",
    instructions: [
      "Do not read or print secrets unless the task explicitly requires it and the source is approved.",
      "Keep trust boundaries explicit: validate external input and avoid assuming caller identity or shape.",
      "Prefer deny-by-default behavior for privileged operations and sensitive data exposure.",
      "Log identifiers and safe metadata instead of tokens, raw payloads, or personal data.",
      "Document any new secret, environment variable, or credential flow in `.planning/decisions.md`.",
      "Call out unresolved security assumptions before implementation starts."
    ]
  },
  data: {
    title: "Data Rule",
    why: "The project manipulates schemas or persistent state and should keep that work explicit and reversible.",
    when_to_use: "Use this rule when editing models, migrations, schema files, seeds, or persistence logic.",
    instructions: [
      "Treat schema changes as product decisions and record them in `.planning/decisions.md`.",
      "Prefer additive migrations and compatibility-safe transitions during early iterations.",
      "Keep data shape changes close to the code that consumes them.",
      "Document any backfill or migration prerequisite before making dependent application changes.",
      "Avoid hidden defaults in persistence code when those defaults affect user-visible behavior.",
      "Add verification for serialization, queries, or migrations when state shape changes."
    ]
  }
};

export function dedupeStrings(values, maxItems) {
  const seen = new Set();
  const results = [];

  for (const value of values) {
    const text = String(value || "").trim();
    if (!text) {
      continue;
    }

    const normalized = text.toLowerCase();
    if (seen.has(normalized)) {
      continue;
    }

    seen.add(normalized);
    results.push(text);

    if (results.length >= maxItems) {
      break;
    }
  }

  return results;
}

export function dedupeCommands(commands, maxItems) {
  const seen = new Set();
  const results = [];

  for (const command of commands) {
    const normalizedCommand = String(command?.command || "").trim();
    if (!normalizedCommand || seen.has(normalizedCommand)) {
      continue;
    }

    seen.add(normalizedCommand);
    results.push({
      label: String(command.label || "command").trim(),
      command: normalizedCommand,
      status: String(command.status || "candidate").trim()
    });

    if (results.length >= maxItems) {
      break;
    }
  }

  return results;
}

export function deriveCommandsFromInspection(inspection) {
  const scripts = inspection.packageScripts ?? {};
  return Object.entries(scripts)
    .filter(([scriptName]) => ["dev", "start", "build", "test", "lint"].includes(scriptName))
    .map(([scriptName]) => {
      const packageManager = inspection.packageManager || "npm";
      const directCommand = scriptName === "test" && packageManager === "npm" ? "npm test" : `${packageManager} run ${scriptName}`;
      return {
        label: scriptName,
        command: directCommand,
        status: "local-detected"
      };
    });
}

function buildFallbackRule(slug) {
  const rule = DEFAULT_RULE_LIBRARY[slug];
  if (!rule) {
    return null;
  }

  return {
    slug,
    title: rule.title,
    why: rule.why,
    when_to_use: rule.when_to_use,
    instructions: rule.instructions
  };
}

export function ensureRules(rules, requiredSlugs) {
  const existing = new Map();

  for (const rule of rules) {
    if (rule?.slug) {
      existing.set(rule.slug, {
        slug: rule.slug,
        title: rule.title,
        why: rule.why,
        when_to_use: rule.when_to_use,
        instructions: dedupeStrings(rule.instructions || [], 6)
      });
    }
  }

  for (const slug of requiredSlugs) {
    if (!existing.has(slug)) {
      const fallback = buildFallbackRule(slug);
      if (fallback) {
        existing.set(slug, fallback);
      }
    }
  }

  return [...existing.values()].slice(0, 4);
}

export function deriveRequiredRuleSlugs({ tags, inspection, commands }) {
  const slugs = [];

  if (tags.has("frontend")) {
    slugs.push("frontend");
  }

  if (tags.has("api")) {
    slugs.push("api");
  } else if (tags.has("backend")) {
    slugs.push("backend");
  }

  if (tags.has("security")) {
    slugs.push("security");
  }

  if (tags.has("data")) {
    slugs.push("data");
  }

  const hasTests = commands.some((command) => command.label === "test" || /test|vitest|jest|playwright|pytest/i.test(command.command));
  if (hasTests || tags.has("testing") || inspection.hasCode) {
    slugs.push("testing");
  }

  return dedupeStrings(slugs, 4);
}

function withDefaultSections(sections = {}) {
  return {
    problem: dedupeStrings(sections.problem || [], 4),
    users: dedupeStrings(sections.users || [], 4),
    in_scope: dedupeStrings(sections.in_scope || [], 5),
    out_of_scope: dedupeStrings(sections.out_of_scope || [], 4)
  };
}

export function mergeProposal({ proposal, review, inspection, references, idea, stackHint, explicitRefs }) {
  const tags = buildReferenceTags({
    idea,
    stackHint,
    explicitRefs,
    inspection
  });

  const commands = dedupeCommands(
    [
      ...(proposal.root_claude?.build_test_commands || []),
      ...(review?.build_commands || []),
      ...(review?.test_commands || []),
      ...(review?.lint_commands || []),
      ...deriveCommandsFromInspection(inspection)
    ],
    6
  );

  const projectSections = withDefaultSections(proposal.project_sections);
  if (projectSections.problem.length === 0) {
    projectSections.problem = [`Build a clear, compact bootstrap package for: ${idea}`];
  }

  if (projectSections.users.length === 0) {
    projectSections.users = [proposal.audience || "The primary builder or maintainer of the project"];
  }

  if (projectSections.in_scope.length === 0) {
    projectSections.in_scope = ["Create the first planning documents and a compact Claude Code project configuration."];
  }

  if (projectSections.out_of_scope.length === 0) {
    projectSections.out_of_scope = ["Do not start feature implementation or autonomous execution loops in the bootstrap step."];
  }

  const merged = {
    project_title: proposal.project_title || idea,
    project_summary: proposal.project_summary || `Bootstrap package for ${idea}`,
    audience: proposal.audience || "Builder and maintainers",
    project_type: proposal.project_type || (inspection.hasCode ? "Existing codebase refinement" : "Greenfield project"),
    primary_outcomes: dedupeStrings(proposal.primary_outcomes || [], 5),
    success_criteria: dedupeStrings(proposal.success_criteria || [], 5),
    project_sections: projectSections,
    decisions: (proposal.decisions || []).slice(0, 6),
    research_notes: [
      ...(proposal.research_notes || []).slice(0, 5),
      ...(review?.notes || []).slice(0, 2).map((note) => ({
        topic: "Repo review",
        takeaway: note,
        action: "Carry this detail into the first working session."
      }))
    ],
    root_claude: {
      goal: proposal.root_claude?.goal || proposal.project_summary || `Bootstrap ${idea}`,
      instructions: dedupeStrings(
        [
          ...(proposal.root_claude?.instructions || []),
          ...(review?.conventions || []),
          "Read the `.planning/` files before making large edits.",
          "Prefer targeted reads and scoped rules over loading broad context.",
          "Keep planning compact until the project shape is approved."
        ],
        7
      ),
      workflow: dedupeStrings(
        [
          ...(proposal.root_claude?.workflow || []),
          "Clarify missing decisions before implementation.",
          "Use `.planning/next.md` as the active checklist for the next session."
        ],
        5
      ),
      build_test_commands: commands,
      safety: dedupeStrings(
        [
          ...(proposal.root_claude?.safety || []),
          ...(review?.gaps || []),
          "Do not read secrets or environment files unless the task explicitly requires it.",
          "Keep changes scoped and verify the narrowest relevant command first."
        ],
        5
      )
    },
    rules: [],
    next_steps: dedupeStrings(
      [
        ...(proposal.next_steps || []),
        ...(review?.gaps || []),
        "Approve the startup package before asking Claude to implement features."
      ],
      8
    )
  };

  if (merged.primary_outcomes.length === 0) {
    merged.primary_outcomes = [
      "Capture the project goal in a compact planning package.",
      "Create a minimal Claude Code root context with scoped rules only where needed.",
      "Define the next high-value decisions before implementation starts."
    ];
  }

  if (merged.success_criteria.length === 0) {
    merged.success_criteria = [
      "The project has concise planning documents under `.planning/`.",
      "The root `.claude/CLAUDE.md` stays short and references scoped rules instead of large imports.",
      "The first implementation session can start without re-explaining the project."
    ];
  }

  const requiredRuleSlugs = deriveRequiredRuleSlugs({
    tags,
    inspection,
    commands
  });

  merged.rules = ensureRules(proposal.rules || [], requiredRuleSlugs);
  merged.selected_references = references;

  return merged;
}

export function mergeOptimizationAudit({ audit, inspection, references, stackHint, explicitRefs, projectLabel }) {
  const tags = buildReferenceTags({
    idea: "",
    stackHint,
    explicitRefs,
    inspection
  });

  const commands = dedupeCommands(
    [
      ...(audit.root_claude?.build_test_commands || []),
      ...deriveCommandsFromInspection(inspection)
    ],
    6
  );

  const merged = {
    project_title: audit.project_title || projectLabel,
    project_summary: audit.project_summary || `Optimize the Claude setup for ${projectLabel}.`,
    findings: (audit.findings || []).slice(0, 6),
    root_claude: {
      goal: audit.root_claude?.goal || `Keep Claude productive in ${projectLabel} with a compact root context.`,
      instructions: dedupeStrings(
        [
          ...(audit.root_claude?.instructions || []),
          "Prefer targeted reads over broad context loads.",
          "Use `.planning/optimization.md` as the change log for Claude setup decisions.",
          "Keep root context short and push specific guidance into scoped rules."
        ],
        7
      ),
      workflow: dedupeStrings(
        [
          ...(audit.root_claude?.workflow || []),
          "Read existing project docs before rewriting any Claude configuration.",
          "Preserve project-specific instructions unless a lower-token equivalent is already documented."
        ],
        5
      ),
      build_test_commands: commands,
      safety: dedupeStrings(
        [
          ...(audit.root_claude?.safety || []),
          "Do not read secrets or private credentials unless the task explicitly requires it.",
          "Keep optimization changes scoped to Claude/project configuration in this workflow."
        ],
        5
      )
    },
    rules: [],
    next_steps: dedupeStrings(
      [
        ...(audit.next_steps || []),
        "Review `.planning/optimization.md` before making larger Claude workflow changes."
      ],
      8
    )
  };

  if (merged.findings.length === 0) {
    merged.findings = [
      {
        topic: "Claude setup",
        severity: "medium",
        finding: "No structured optimization findings were returned.",
        recommendation: "Review the generated optimization report and apply only the clearly safe changes."
      }
    ];
  }

  const requiredRuleSlugs = deriveRequiredRuleSlugs({
    tags,
    inspection,
    commands
  });

  merged.rules = ensureRules(audit.rules || [], requiredRuleSlugs);
  merged.selected_references = references;

  return merged;
}
