---
name: create-skill
description: "Create a new Claude Agent Skill. Auto-invoke when the user asks to create a skill, make a new skill, or scaffold a workflow automation. Do NOT invoke for general coding tasks."
---

# Create Skill

Scaffold a new Claude Agent Skill using the architecture below.

## Skill Architecture

Every skill lives at `.claude/skills/[SkillName]/` and uses 
progressive disclosure — Claude loads only what each task needs:

- **Tier 1 — frontmatter (~100 tokens):** Always in memory
- **Tier 2 — SKILL.md body (<5k tokens):** Loaded on trigger
- **Tier 3 — Workflow + resource files:** Loaded on demand

## Directory Layout

```

.claude/skills/[SkillName]/
├── SKILL.md                 ← required, entry point
├── CONVENTIONS.md           ← if the domain has style/format rules
├── Workflows/
│   ├── [Action1].md         ← one file per distinct task
│   └── [Action2].md
└── scripts/                 ← optional, only if no existing scripts suffice
└── [script].sh          ← shell commands, never inline them

```

## What Goes in Each File

**SKILL.md** — frontmatter + routing table + always-follow rules
- `name`: kebab-case skill name
- `description`: what it does, exact trigger phrases, and explicit
  exclusions ("Do NOT invoke for...").
  **IMPORTANT:** The description MUST be a single-line quoted string, NOT a YAML
  multiline block (`>` or `|`). Multiline descriptions break skill detection.
  Example: `description: "Does X. Trigger phrases: a, b. Do NOT invoke for: c."`
- Body: index of Workflows with links, and any rules that apply 
  to ALL workflows

**CONVENTIONS.md** — domain-specific rules Claude must always follow
- Formatting, file naming, forbidden patterns
- Write specific checkable rules, not vague guidance
- Referenced in SKILL.md "Always Follow" so it's loaded every time

**Workflows/[Action].md** — step-by-step instructions for one task
- Numbered steps in order
- Bash commands in code blocks, referencing scripts/ by path
- "Common Pitfalls" section at the bottom

**scripts/[script].sh** — actual shell commands (only if needed)
- Before creating any script, search the repo for existing scripts,
  build tools, npm scripts, or Makefiles that already do the job
- If an existing script exists (e.g., `docs/build.sh`, `npm run build`),
  reference it directly in Workflows instead of creating a duplicate
- Only create a new script when no existing tool covers the need
- When creating: start with `#!/bin/bash` and `set -e`
- Always cd to project root: `cd "$(git rev-parse --show-toplevel)"`
- Called from Workflows via: `bash .claude/skills/[SkillName]/scripts/[script].sh`
- Scripts run via bash — their code never enters Claude's context,
  only their output does

## Steps to Create a New Skill

1. Ask the user:
   - What does the skill automate? (tool, project, or domain)
   - What are the distinct actions it needs to handle? (each = one Workflow)
   - Are there domain conventions to follow? (yes → CONVENTIONS.md)
   - When should it auto-invoke, and when should it stay dormant?

2. Search the repo for existing shell scripts, npm scripts, Makefiles,
   and build tools that relate to the skill's domain. List what you find
   and plan to reference them in Workflows instead of creating duplicates.

3. Summarize the planned structure and confirm with the user

4. Create all files — SKILL.md first, then Workflows, then CONVENTIONS.md.
   Only create scripts/ if no existing scripts cover the need.

4. After creating, tell the user:
   - The full file tree of what was created
   - Example prompts that will trigger the new Skill
