#!/usr/bin/env node

import path from "node:path";

const args = process.argv.slice(2);
const schemaIndex = args.indexOf("--json-schema");
const schemaPath = schemaIndex >= 0 ? args[schemaIndex + 1] : "";
const schemaBaseName = path.basename(schemaPath);
const prompt = args.at(-1) || "";
const ideaMatch = prompt.match(/Project idea:\n([\s\S]*?)\n+Optional stack hint:/);
const idea = ideaMatch?.[1] || prompt;
const isFrontend = /\b(?:landing page|frontend|ui|ux|design|wellness)\b/i.test(idea);
const isBackend = /\b(?:api|backend|webhook|server|billing)\b/i.test(idea);
const optimizeIsFrontend = /\b(?:frontend|ui|design|wellness|react|next)\b/i.test(prompt);
const optimizeIsBackend = /\b(?:backend|api|server|billing|webhook|express)\b/i.test(prompt);

function emit(value) {
  process.stdout.write(`${JSON.stringify(value)}\n`);
}

if (schemaBaseName === "start.schema.json") {
  emit({
    project_title: isFrontend ? "Wellness Landing Page" : "Billing Webhook API",
    project_summary: isFrontend
      ? "Create a compact starter package for a polished marketing site."
      : "Create a compact starter package for a billing-oriented webhook service.",
    audience: isFrontend ? "Founders and early users" : "Developers integrating billing events",
    project_type: isFrontend ? "Frontend product website" : "Backend integration service",
    primary_outcomes: isFrontend
      ? [
          "Define a strong visual direction before implementation.",
          "Create a minimal planning package for the first build session.",
          "Keep Claude context small with scoped frontend rules."
        ]
      : [
          "Clarify the first service boundaries and webhook responsibilities.",
          "Create a minimal planning package for the first build session.",
          "Keep Claude context small with scoped backend rules."
        ],
    success_criteria: [
      "The project has concise planning documents.",
      "The root CLAUDE.md stays compact.",
      "The next working session can start without re-explaining the project."
    ],
    project_sections: {
      problem: [isFrontend ? "The product needs a strong first impression." : "The service needs a safe first contract and execution path."],
      users: [isFrontend ? "Marketing visitors" : "Internal and external integration developers"],
      in_scope: ["Bootstrap planning documents", "Compact Claude Code configuration"],
      out_of_scope: ["Full feature implementation", "Autonomous execution loops"]
    },
    decisions: [
      {
        topic: "Bootstrap style",
        decision: "Keep the startup package review-first.",
        rationale: "It avoids wasted tokens and premature implementation."
      }
    ],
    research_notes: [
      {
        topic: "Context hygiene",
        takeaway: "Use a small root CLAUDE.md and scoped rules.",
        action: "Keep detailed guidance in `.claude/rules/`."
      }
    ],
    root_claude: {
      goal: isFrontend ? "Bootstrap a polished UI project without loading excessive context." : "Bootstrap a safe backend project without loading excessive context.",
      instructions: [
        "Start from `.planning/project.md` and `.planning/next.md`.",
        "Prefer targeted reads over broad scans.",
        "Keep the first session planning-oriented until the spec is approved."
      ],
      workflow: [
        "Clarify high-impact decisions before coding.",
        "Use scoped rules only when touching the relevant subsystem."
      ],
      build_test_commands: [],
      safety: [
        "Do not read secrets unless the task requires it.",
        "Keep edits scoped and verify the narrowest relevant command first."
      ]
    },
    rules: isFrontend
      ? [
          {
            slug: "frontend",
            title: "Frontend Rule",
            why: "The idea is UI-heavy.",
            when_to_use: "Use this rule when editing pages, components, styling, forms, or client-side state.",
            instructions: [
              "Keep visual direction explicit.",
              "Design responsive states early.",
              "Make loading and error states visible.",
              "Prefer reusable components.",
              "Avoid generic default UI patterns.",
              "Keep accessibility in scope."
            ]
          }
        ]
      : [
          {
            slug: "backend",
            title: "Backend Rule",
            why: "The idea is service-oriented.",
            when_to_use: "Use this rule when editing APIs, workers, services, persistence, or background jobs.",
            instructions: [
              "Keep boundaries explicit.",
              "Separate transport and business logic.",
              "Make side effects obvious.",
              "Prefer small data contracts.",
              "Keep verification close to changes.",
              "Call out operational assumptions."
            ]
          }
        ],
    next_steps: [
      "Review the generated package.",
      "Approve the first implementation slice.",
      "Start the first focused build session."
    ]
  });
} else if (schemaBaseName === "repo-review.schema.json") {
  emit({
    build_commands: [
      {
        label: "build",
        command: "npm run build",
        status: "confirmed"
      }
    ],
    test_commands: [
      {
        label: "test",
        command: "npm test",
        status: "confirmed"
      }
    ],
    lint_commands: [
      {
        label: "lint",
        command: "npm run lint",
        status: "likely"
      }
    ],
    conventions: [
      isBackend ? "Keep handler logic narrow and move orchestration into services." : "Keep page-level styling and reusable components separate."
    ],
    gaps: [
      isBackend ? "Document the first webhook verification path before implementation." : "Define the primary conversion path before implementation."
    ],
    notes: [
      "Use the detected commands in the root CLAUDE.md so the next session starts with concrete verification paths."
    ]
  });
} else if (schemaBaseName === "optimize.schema.json") {
  emit({
    project_title: optimizeIsFrontend ? "Frontend Claude Audit" : "Backend Claude Audit",
    project_summary: optimizeIsFrontend
      ? "Reduce token overhead and tighten the Claude setup for the frontend project."
      : "Reduce token overhead and tighten the Claude setup for the backend project.",
    findings: [
      {
        topic: "Root context",
        severity: "high",
        finding: "The root CLAUDE setup should stay compact and route detailed behavior into scoped rules.",
        recommendation: "Keep the root file short and create scoped rules only for relevant subsystems."
      },
      {
        topic: "Project settings",
        severity: "medium",
        finding: "Project settings should deny access to obvious secret-bearing files.",
        recommendation: "Add or merge the missing deny entries."
      },
      {
        topic: "Optimization report",
        severity: "low",
        finding: "The maintainer needs a clear summary of what was changed and what was preserved.",
        recommendation: "Write `.planning/optimization.md` every time optimize runs."
      }
    ],
    root_claude: {
      goal: optimizeIsFrontend
        ? "Keep Claude productive in the frontend repo with a compact root context."
        : "Keep Claude productive in the backend repo with a compact root context.",
      instructions: [
        "Prefer targeted reads over broad context loads.",
        "Preserve project-specific instructions unless a lower-token equivalent already exists.",
        "Use scoped rules only when touching the relevant subsystem."
      ],
      workflow: [
        "Review optimization findings before wider workflow changes.",
        "Keep Claude configuration changes narrow and explicit."
      ],
      build_test_commands: [],
      safety: [
        "Do not read secrets unless the task requires it.",
        "Avoid autonomous loops in the optimization flow."
      ]
    },
    rules: optimizeIsFrontend
      ? [
          {
            slug: "frontend",
            title: "Frontend Rule",
            why: "This repo includes a user-facing frontend.",
            when_to_use: "Use this rule when editing pages, components, styling, forms, or client-side state.",
            instructions: [
              "Keep UI work accessible first.",
              "Prefer reusable components.",
              "Make responsive states explicit.",
              "Document unusual visual choices.",
              "Avoid generic default UI patterns.",
              "Keep loading and error states visible."
            ]
          }
        ]
      : [
          {
            slug: "backend",
            title: "Backend Rule",
            why: "This repo includes backend or service behavior.",
            when_to_use: "Use this rule when editing APIs, workers, services, persistence, or background jobs.",
            instructions: [
              "Keep transport and business logic separate.",
              "Make side effects explicit.",
              "Prefer small data contracts.",
              "Verify narrow behavior before wider suites.",
              "Document operational assumptions.",
              "Avoid broad infrastructure drift."
            ]
          }
        ],
    next_steps: [
      "Review `.planning/optimization.md`.",
      "Confirm whether any preserved user-authored Claude files should be manually cleaned up.",
      "Use the optimized Claude setup in the next work session."
    ]
  });
} else {
  process.stderr.write("Unknown schema request\n");
  process.exit(1);
}
