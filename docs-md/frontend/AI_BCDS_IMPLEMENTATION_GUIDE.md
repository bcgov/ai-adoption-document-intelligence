# AI-Assisted BC Design System Implementation Guide

**Ticket:** AI-2086  
**Scope:** How AI was used to implement BCDS in SDPR, how to maintain it, how to operationalize it across BC Gov, and what we learned.

---

## Table of Contents

1. [Context and Problem Statement](#1-context-and-problem-statement)
2. [How We Implemented BCDS Using AI](#2-how-we-implemented-bcds-using-ai)
3. [Maintaining BCDS for New Features](#3-maintaining-bcds-for-new-features)
4. [Operationalizing Across BC Gov](#4-operationalizing-across-bc-gov)
5. [Learnings](#5-learnings)
6. [Simplifying Manual Steps](#6-simplifying-manual-steps)
7. [Future State Vision](#7-future-state-vision)

---

## 1. Context and Problem Statement

### The Application

The SDPR (Social Development and Poverty Reduction) AI Document Intelligence platform is a functional pilot application (not deployed at full production scale) that processes arbitrary document workloads. At the start of the BCDS migration it used:

- **Mantine** as the primary UI component library (buttons, forms, modals, tables, shell)
- **React Query / TanStack** for data fetching
- **TypeScript** throughout
- Approximately 30 distinct routes and dozens of component files

The codebase had deep Mantine coverage: `@mantine/core` was imported directly across nearly every feature screen and component file.

### The Mandate

BC Government digital products are expected to align with the [B.C. Design System](https://www2.gov.bc.ca/gov/content/digital/design-system). This means:

- Using the official BC Sans typeface
- Using BCDS design tokens (`@bcgov/design-tokens`) for colour, spacing, and shape
- Replacing custom or third-party components with BCDS React components (`@bcgov/design-system-react-components`) where they exist
- Adopting official header, footer, and global chrome

### The Challenge

A full rewrite was not viable:
- BCDS component coverage is still growing; not every Mantine component has a BCDS equivalent
- Mantine props were deeply embedded in product code (e.g., `leftSection`, `loading`, `onClick` with `stopPropagation`)
- A big-bang migration would introduce broad regression risk
- The team needed to continue shipping features during migration

The goal was an **incremental, safe migration** that produced a visually BCDS-compliant product without rewriting every call site.

---

## 2. How We Implemented BCDS Using AI

### 2.1 AI Tools Used

The implementation relied on a combination of AI tools, each serving a different role:

| Tool | Role |
|------|------|
| **GitHub Copilot (VS Code)** | Primary code co-pilot: inline completions, chat, edit mode |
| **Claude (via VS Code Copilot)** | Code reasoning, architecture decisions, adapter implementation |
| **Claude Code (.claude/ skills)** | Structured skill-based workflows (story implementer, docs-sync) |
| **Figma MCP Server** | Design-to-code context: translating Figma frames to React without guessing |
| **BCDS Design System Skill** | Enforcing BCDS Figma token binding in any Figma work |
| **GitHub Copilot SWE Agent** | Used for targeted test coverage generation |

None of these tools operated without human review. Every AI-generated change went through a pull request with human code review.

### 2.2 Planning Phase: Requirements and User Stories via AI

The migration was not started with a blank file. The team used AI tooling to write the initial requirements and user stories. The process:

1. **Defined the constraint set:** no big-bang rewrite, no Tailwind, no custom forks of BCDS source, no document-specific UI
2. **Generated structured user stories** with explicit acceptance criteria and validation checklists for each story
3. **Worked through stories in dependency order** using AI-assisted workflows; each story was a focused, testable unit of work

This meant the AI was not just writing code; it was also the mechanism for **structured delivery governance**: what gets done, in what order, and how you know it's done.

Key user stories for Feature 011:

| Story | Outcome |
|-------|---------|
| US-001: Foundations | BCDS packages installed; BC Sans + token CSS loaded |
| US-002: UI Adapter Layer | `apps/frontend/src/ui/` established; compatibility matrix authored |
| US-003: App Shell | BCDS Header and Footer in place |
| US-004: Reference Screen | First Figma-aligned reference screen implemented |
| US-005: Code Connect Governance | Component classification matrix documented |
| US-006: Migration Documentation | Developer guide (this file's predecessor) authored |

### 2.3 Architecture Decision: The Adapter Pattern

> **What is an adapter?**  
> Think of it as a translator between your existing code and the new design system. The codebase was written to work with Mantine (a third-party component library), using Mantine's specific naming conventions and ways of passing information. Rather than rewriting every screen and component to use BCDS directly, the team placed a translator in the middle. Feature screens say "I need a Button that shows a loading spinner." The translator accepts that instruction in the familiar Mantine style and renders the correct BCDS component underneath, using BCDS tokens, visual styles, and accessibility semantics. Existing feature code changes little or nothing; only the visual output changes to match BCDS.

The most consequential design decision was the **local UI adapter layer** (`apps/frontend/src/ui/`). This was an AI-assisted architecture choice based on the constraint analysis:

```
Product code (pages, features)
        │
        ▼
  Local UI adapter layer (apps/frontend/src/ui/)
        │
        ├──► B.C. Design System React components
        ├──► Mantine fallback components
        └──► Application-specific composites (local markup + tokens)
```

**Why this works with AI:** The adapter layer is a collection of wrapper components that share a pattern: accept Mantine-compatible props, render BCDS underneath. This is exactly the kind of repetitive-but-context-heavy task where AI coding assistants excel. Once the first two adapters (`Button`, `Text`) were established, the AI assistant could infer the pattern and generate subsequent adapters (`Select`, `Modal`, `Checkbox`, `Switch`, etc.) correctly with minimal manual correction.

### 2.4 Component Classification System

AI helped define and maintain a **four-tier classification** for every UI component:

| Classification | Meaning |
|----------------|---------|
| `BC DS native` | Uses a BCDS React component directly or through a thin adapter |
| `BC DS styled wrapper` | Local markup styled entirely with BCDS tokens |
| `Mantine fallback` | Mantine retained because no suitable BCDS equivalent exists |
| `Application-specific` | Product composite built with BCDS tokens + Mantine layout |

Every component in the compatibility matrix has a classification and a documented rationale. AI was used to populate and maintain this matrix as new components were encountered.

### 2.5 Figma MCP for Design-to-Code Alignment

The Figma MCP Server (`mcp.figma.com`) was configured in `.vscode/mcp.json` from the start of the migration. This enabled a direct **design-to-code** workflow:

1. Designer updates a Figma frame using official BCDS library components
2. Developer uses `get_design_context` (via Figma MCP) to extract the layout, token bindings, and component hierarchy from the Figma node
3. The AI translates the design context into React code referencing the established adapter layer
4. No visual guesswork: token values, spacing, and component choices are read directly from Figma

The first reference screen (US-004) was the earliest implementation of this workflow: a Figma frame served as the source of truth for component choices and layout, removing visual guesswork from the implementation entirely. That screen was later removed from the application, but it established the workflow used across the rest of the migration.

### 2.6 Implementation Phases and Sprint Structure

The migration used a **vertical slice strategy** rather than migrating all components in one go:

| Phase | What Changed |
|-------|-------------|
| 1: Foundations | `@bcgov/design-system-react-components`, `@bcgov/design-tokens`, `@bcgov/bc-sans` installed; BC Sans + token CSS loaded in `main.tsx`; Mantine theme mapped to BCDS palette |
| 2: Global Chrome | BCDS `Header` + keyboard skip-link; BCDS `Footer` at page end (not fixed) |
| 3: Reference Screen | First reference screen aligned with Figma using adapter components |
| 4: Component Adapters | Full set of adapters: `Button`, `Text`, `Title`, `Badge`, `Tooltip`, `IconActionButton`, `Select`, `TextInput`, `Textarea`, `Checkbox`, `Switch`, `Radio`, `NumberInput`, `DateInput`, `Modal`, `Alert`, `Progress`, `Divider` |
| 5: Vertical Slices | All 30+ routes migrated screen-by-screen to import from `apps/frontend/src/ui/` instead of `@mantine/core` |

Each phase was a bounded PR, reviewed before the next began. AI pair-programming was used to write adapters and migrate call sites, with the human reviewer ensuring no functional regressions were introduced.

### 2.7 Mantine Fallback Token Styling

For components where BCDS has no equivalent (tables, dropzone, notifications, layout primitives), the approach was:

- Keep Mantine for the component itself
- Apply BCDS design tokens via a global CSS file (`bcds-mantine-fallbacks.css`) loaded after Mantine CSS
- Map Mantine spacing scale (`xs`–`xl`) to BCDS `--layout-margin-*` tokens in `appTheme.ts`

AI helped generate the token-to-Mantine-prop mappings and ensured the fallback CSS did not bleed into BCDS-native component styling.

### 2.8 Scope of Work Delivered

| Metric | Value |
|--------|-------|
| Routes fully migrated | ~30 of 31 (DocumentsPage is the known exception) |
| Component adapters built | 20+ |
| Direct Mantine imports eliminated | From every feature file except DocumentsPage and RouterErrorPage |
| Adapter unit tests | Full suite under `apps/frontend/src/ui/*.test.tsx` |
| Figma screens aligned | First reference screen (since removed); other screens follow token alignment |

---

## 3. Maintaining BCDS for New Features

### 3.1 The Rule: Import Only from the Adapter Layer

**All product code (pages, feature components) must import UI from `apps/frontend/src/ui/`**, not from `@mantine/core` or `@mantine/notifications` directly.

```ts
// ✅ Correct
import { Button, TextInput, Modal } from 'ui';

// ❌ Wrong: direct Mantine import in product code
import { Button } from '@mantine/core';
```

This rule applies to every new file a developer (or AI assistant) creates.

### 3.2 Component Decision Flow for New Features

When a new feature needs a component, follow this order:

```
Is there a BCDS React component that covers the use case?
│
├── Yes, thin adapter exists in ui/ → use it as-is
├── Yes, but needs new adapter → add adapter to apps/frontend/src/ui/
│       Pattern: accept Mantine-compat props, render BCDS underneath
├── No BCDS equivalent, Mantine has it → re-export via ui/ as Mantine fallback
│       Apply BCDS tokens via className or CSS custom properties
└── No equivalent anywhere → build application-specific composite
        Use BCDS tokens and Mantine layout primitives (Stack, Group, Grid)
        Document in BC_DESIGN_SYSTEM_MIGRATION.md compatibility matrix
```

### 3.3 AI-Assisted Maintenance Workflow

When implementing a new screen or feature with AI:

1. **Prompt context**: Always mention "import from `apps/frontend/src/ui/`" in the initial prompt; the AI assistant will respect the adapter layer convention if told about it upfront
2. **Check the compatibility matrix**: Ask the AI assistant "which adapter covers X?" before building something new; the compatibility matrix in `BC_DESIGN_SYSTEM_MIGRATION.md` is the reference
3. **Use Figma MCP for new screens**: Run `get_design_context` with the Figma node ID before implementing; this gives the AI the exact token bindings, layout, and component choices without guessing
4. **Verify AI output against the BC Gov Design System component documentation**: Check that generated component usage matches the [BC Gov Design System component docs](https://designsystem.gov.bc.ca/react-components/). AI can reference props that do not exist in the BCDS API, since BCDS is a newer library with less training data coverage than well-known alternatives

### 3.4 Tracking What Has Been Migrated

The SDPR project maintains a migration status table in `docs-md/frontend/BC_DS_SCREEN_MIGRATION_STATUS.md`. This file lists every screen in the application and whether it has been fully migrated to use the adapter layer.

After migrating a route, update that file:
- Mark the route as `Done`
- Note any exceptions, for example if one component on that screen still uses the old library directly

This tracking matters because migration happens incrementally across many sprints, not all at once. Without it, the team loses visibility into what is left to do, and new developers have no way to know which parts of the codebase follow the new pattern. It is also useful evidence when demonstrating BCDS compliance progress to stakeholders.

This is a manual step today (see [Section 6](#6-simplifying-manual-steps) for automation opportunities).

### 3.5 Accessibility

The following accessibility requirements are all implemented in the SDPR adapter layer today. This section documents what was built and what to maintain when adding new features; these are not aspirational goals.

**Form labels:** Every form field has a visible label that screen readers can read. The adapter layer resolves accessible names in `apps/frontend/src/ui/formFieldUtils.ts`:
- A visible `label` prop is the standard approach
- If no visible label is possible, an explicit `aria-label` is passed at the call site
- A `placeholder` alone is not used as a label; it disappears when the user types, and screen readers often ignore it

**Modal accessibility:** Every modal has an accessible title. The `Modal` adapter renders its title using a BCDS `Heading` with the correct `slot="title"` attribute so screen readers announce it correctly. Modals without a visible title carry an `aria-label` on the modal itself.

**Keyboard navigation:** All interactive elements (buttons, links, form fields, modals) are reachable and operable by keyboard alone. BCDS components are built on React Aria, which handles this automatically.

**Focus management:** When a modal opens, keyboard focus moves into it. When it closes, focus returns to the element that triggered it. BCDS `Modal` handles this via React Aria's `Dialog` primitive. Custom overlays outside the adapter layer need explicit focus management.

**Colour contrast:** BCDS design tokens meet WCAG 2.1 AA contrast requirements. Hardcoded colour values outside the token system are the most common source of contrast failures on BC Gov products and should be avoided.

**Skip link:** The app header includes a keyboard-accessible “Skip to main content” link, allowing keyboard-only users to bypass the navigation. This is implemented in SDPR's `RootLayout` via the BCDS `Header` component.

When building new features, continue these patterns. AI-generated code frequently omits accessibility attributes, so a dedicated check in the pull request process is recommended.

---

## 4. Operationalizing Across BC Gov

This section is a playbook for other BC Gov development teams that want to adopt BCDS using an AI-assisted process similar to what was done in SDPR.

### 4.1 Prerequisites

Before starting:

| Prerequisite | Why |
|-------------|-----|
| Audit current component usage | Know what you have before deciding what to replace |
| Access to BCDS Figma library | Designers must link Figma frames to official BCDS components |
| Figma MCP configured | Developers need `mcp.figma.com` in their `.vscode/mcp.json` |
| AI pair-programming tools enabled | AI assistance is essential for adapter implementation speed: GitHub Copilot, Claude via Copilot, or equivalent |
| BC Gov Design System component docs bookmarked | [designsystem.gov.bc.ca](https://designsystem.gov.bc.ca/react-components/) is the authoritative reference for component props and behaviour. This is a documentation site maintained by the BC Gov design system team, not something teams build themselves. |

### 4.2 Step-by-Step Playbook

> These steps reflect the actual process SDPR followed, presented as a repeatable guide. Teams using a different UI library would substitute their own library name wherever Mantine is referenced.

#### Step 1: Audit and Inventory (1–2 days)

Use AI to scan the codebase for direct imports from your current UI library:

```bash
# Example: find all direct @mantine/core imports in product code
grep -r "from '@mantine/core'" apps/frontend/src --include="*.tsx" --include="*.ts" \
  | grep -v "src/ui/"
```

Categorize each component against the BCDS component library:
- Does BCDS have an equivalent?
- Is the current API compatible with BCDS?
- How many files use it?

AI can help build this inventory from the command output.

#### Step 2: Define the Adapter Layer Boundaries (half a day)

Create `apps/frontend/src/ui/` (or equivalent for your tech stack) with:
- A single barrel export (`index.tsx`)
- A documented classification for every component you plan to wrap

Use AI to generate the initial compatibility matrix document from your inventory.

#### Step 3: Write Requirements and User Stories with AI

Use the SDPR user stories in `feature-docs/011-bc-design-system-migration/user_stories/` as a template. Adapt with your:
- Technology stack specifics
- Figma file references
- Non-goals (what you are not migrating in this release)

This structured planning step is often skipped when teams use AI purely for code generation. It is worth doing; it bounds the work and gives AI assistants explicit acceptance criteria to check against.

#### Step 4: Implement Foundations (1 day)

```bash
npm install @bcgov/design-system-react-components @bcgov/design-tokens @bcgov/bc-sans
```

Bootstrap tasks (all AI-assisted):
- Load BC Sans CSS in your app entry point
- Load design token CSS (after any third-party CSS)
- Map your current theme's colour/spacing scales to BCDS tokens
- Set your app to light mode (BCDS is light-mode first)

#### Step 5: Implement Global Chrome (1 day)

Replace your app header and footer with BCDS `Header` and `Footer` components. This is the highest-visibility change and establishes the BC Gov brand immediately. Key notes:
- Add a keyboard skip-link (`<a href="#main-content">Skip to main content</a>`), required for WCAG 2.1 AA
- Place the footer at the bottom of page scroll content, not in a fixed footer slot

#### Step 6: Establish the Adapter Layer (2–4 days)

Work through components in this order, using AI to write each adapter:

1. **Primitive controls**: `Button`, `Text`, `Heading`, `Link`
2. **Form fields**: `TextInput`, `Textarea`, `Select`, `Checkbox`, `Radio`, `Switch`
3. **Feedback**: `Alert`, `Badge/Tag`, `Progress`, `Tooltip`
4. **Overlay**: `Modal`/`Dialog`
5. **Layout fallbacks**: Re-export layout primitives (`Stack`, `Group`, `Grid`) that have no BCDS equivalent

AI prompt tip for each adapter:
> "Write a React adapter for BCDS `[ComponentName]` that accepts Mantine-compatible props `[list props]` and renders the BCDS component underneath. Import from `@bcgov/design-system-react-components`. File goes in `apps/frontend/src/ui/[ComponentName].tsx`."

#### Step 7: Choose and Implement a Reference Screen (1–2 days)

Pick one screen that uses a broad set of components. Implement it end-to-end using the Figma MCP workflow:

1. Open the Figma frame for the screen
2. Run `get_design_context` with the node ID
3. Give the AI the design context and ask it to implement the screen using the adapter layer
4. Review and fix any BCDS API mismatches

This produces a working reference that all future feature screens follow.

#### Step 8: Migrate Remaining Screens (iterative, per sprint)

Migrate screen by screen, tracking status in a migration table (like `BC_DS_SCREEN_MIGRATION_STATUS.md`). Use AI to:
- Find all `@mantine/core` imports in a file
- Replace them with adapter layer equivalents
- Write or update component tests

Treat each screen migration as a focused PR, not a mega-PR.

### 4.3 AI Tooling Configuration for a New Team

`.vscode/mcp.json`, add Figma MCP:
```json
{
  "inputs": [],
  "servers": {
    "figma": {
      "url": "https://mcp.figma.com/mcp",
      "type": "http"
    }
  }
}
```

`.github/copilot-instructions.md`, add BCDS conventions:
```markdown
## Frontend Implementation Guidelines
- Import all UI primitives from `apps/frontend/src/ui/`, never directly from `@mantine/core`.
- Prefer BCDS components for new UI. Check BC_DESIGN_SYSTEM_MIGRATION.md compatibility matrix.
- Use BCDS design tokens for any custom styling. Never hardcode hex colours or pixel spacing.
- Load the `bcgov-design-system` skill for any Figma work.
```

A `bcgov-design-system` Copilot skill is available to team members on this project. It automatically enforces BCDS token binding (colours, spacing, border-radius, and typography) when working with Figma. Contact your team lead to have it set up in your VS Code environment.

---

## 5. Learnings

### 5.1 What Worked Well

**The adapter pattern was the right call.** It isolated product code from library-level API changes. When BCDS made breaking changes to their Select component (React Aria's stricter key requirements), only the adapter needed updating; zero feature files changed.

**AI dramatically accelerated adapter authoring.** Writing 20+ component adapters by hand would have taken weeks. With AI assistance, each adapter took 10–30 minutes including tests and compatibility matrix entry. The pattern was consistent enough that the AI could infer it from the first two examples and apply it reliably across all subsequent components.

**Figma MCP eliminated visual guesswork.** The design-to-code flow with `get_design_context` produced accurate component choices and spacing values on the first pass. Without it, developers would have to manually read Figma and guess at token names.

**Phased migration reduced risk.** Because each phase was a bounded PR with clear acceptance criteria, the team could ship features in parallel while migration continued. There were no migration-blocking regressions.

**The compatibility matrix became a living contract.** Every time a new component was encountered, the matrix answer was authoritative: use BC DS native, Mantine fallback, or application-specific. This reduced back-and-forth in code review.

**User stories as AI-executable specifications.** Writing acceptance criteria upfront meant each story could be given directly to the AI as a specification. The story defined what done looked like; the AI implemented to that definition.

### 5.2 What Was Harder Than Expected

**BCDS component coverage gaps forced more fallbacks than planned.** Several components have no BCDS equivalent: layout primitives (Stack, Group, Grid), ScrollArea, Dropzone, and Loader. These remain Mantine fallbacks, styled using BCDS tokens to blend visually with native BCDS components.

**React Aria's strict prop requirements created unexpected edge cases.** The BCDS `Select` component (built on React Aria) rejects empty-string values as item keys. This was not obvious from the BCDS docs and required a sentinel-value workaround inside the adapter. AI-generated adapters initially reproduced the React Aria constraint without handling it.

**Visual fidelity and functional fidelity must be maintained simultaneously.** The easiest path for AI was to replace Mantine with BCDS components directly, but this broke existing prop usage at call sites. The adapter wrapper pattern had to be explained carefully in every prompt; without it, AI would generate direct BCDS usage that required product code rewrites.

**Product code cleanliness is not self-enforcing.** Two files (`DocumentsPage.tsx` and `RouterErrorPage.tsx`) still import `@mantine/core` directly because they were added or modified after the vertical slice migration completed and there was no lint rule to catch it. The convention alone is insufficient; it needs automation.

**AI can reference BCDS component props that do not exist.** BCDS is a newer, less well-represented library in AI training data compared to more established alternatives. Generated adapters occasionally referenced props that do not exist in the BCDS API. Every adapter needed verification against the [BC Gov Design System component documentation](https://designsystem.gov.bc.ca/react-components/) before merging.

**Keeping Figma in sync with code is an ongoing commitment.** The Figma MCP workflow works well in one direction (Figma → code), but when code changes are made without updating Figma, the design file drifts. Code Connect mappings (planned but not fully completed) would close this gap.

### 5.3 What Could Be Done Better

**Define the adapter layer boundary before writing a single line of code.** In SDPR, the boundary was defined early but iteratively refined. A team starting fresh should document the boundary rules in `copilot-instructions.md` on day one, before any AI starts generating code.

**Add an automated import check from day one.** A lint rule is a check that runs automatically every time code is saved or a pull request is opened. Adding one that flags any code that tries to use the old UI library directly, instead of going through the adapter layer, catches mistakes immediately, before they can be merged. In SDPR, two screen files slipped through without using the adapter layer because this check did not exist. Setting it up on day one, as part of the foundations phase, would have prevented those regressions entirely.

**Complete Code Connect mappings.** Figma Code Connect (mapping Figma components to code components) was planned in US-005 but not fully delivered. Without it, the Figma file cannot display accurate code snippets, and the design-to-code workflow remains one-directional.

**Auto-generate adapter starting files from BCDS component definitions.** The [BC Gov Design System component documentation](https://designsystem.gov.bc.ca/react-components/) describes every component's available properties in a structured, machine-readable format. A script could read this data and automatically create the starting code for new adapters, so developers do not have to write the same boilerplate by hand each time a new BCDS component needs to be wrapped.

**Include an accessibility audit in the Definition of Done.** Accessibility gaps (missing `aria-label` on unlabeled controls, missing skip-link targets) were caught in code review but were not systematically verified. Adding a Playwright accessibility test per screen (using `axe-core`) would catch these automatically.

---

## 6. Simplifying Manual Steps

### 6.1 Where the Process Still Relies on Humans

As the BCDS migration matured, several recurring tasks emerged that developers had to do manually on every screen or pull request: checking that imports are correct, updating tracking documents, verifying visual alignment, and reviewing accessibility. These tasks are candidates for automation: a script or CI rule could handle them instead of a person.

| Task | Current effort | How it could be automated |
|------|---------------|---------------------------|
| Checking that feature code is not importing UI components directly from the old library | Manual code review, easily missed on large PRs | An automated rule that fails immediately when the pattern is detected |
| Deciding how to classify a new component (BCDS native, fallback, or custom?) | Developer looks up the compatibility matrix by hand | An AI prompt pre-loaded with the compatibility matrix can suggest the right classification |
| Keeping the screen migration status table up to date | Developer manually updates the table after each screen is migrated | A script that scans the codebase and generates the table automatically |
| Verifying that the application still looks like the Figma design | Manual side-by-side visual inspection | Automated screenshot comparison that flags visual differences |
| Writing the starting code for a new adapter | Developer writes the same boilerplate by hand for each new component | A script that generates the starting file from BCDS component definitions |
| Checking that all interactive elements are accessible | Manual review during pull request | Automated accessibility scanner run as part of the test suite |

### 6.2 Highest Priority: The Import Lint Rule

Add the following to `biome.json`. This tells the code analysis tool to treat any direct import of `@mantine/core` in feature code as an error, with a helpful message pointing developers to the adapter layer instead:

```json
// biome.json: restrict @mantine/core imports to adapter layer
{
  "linter": {
    "rules": {
      "suspicious": {
        "noRestrictedImports": {
          "level": "error",
          "options": {
            "paths": [
              {
                "name": "@mantine/core",
                "message": "Import from 'ui' (the local adapter layer) instead of @mantine/core directly."
              }
            ]
          }
        }
      }
    }
  }
}
```

This single rule would have prevented the `DocumentsPage.tsx` and `RouterErrorPage.tsx` regressions.

### 6.3 Migration Status Script

A Node.js script that generates the content of `BC_DS_SCREEN_MIGRATION_STATUS.md` by scanning route files for direct Mantine imports:

```ts
// scripts/bcds-migration-status.ts
// For each route file in apps/frontend/src/pages and apps/frontend/src/features,
// check whether it imports directly from @mantine/core or @mantine/notifications.
// Output a markdown table with Done / Not migrated per route.
```

This would turn manual status tracking into a single CI job output.

### 6.4 AI-Assisted Adapter Generation

Given a component name and a link to its [BC Gov Design System documentation page](https://designsystem.gov.bc.ca/react-components/), the AI can generate a complete adapter:

```
Prompt: "Generate a React adapter for BCDS [ComponentName] using the component
documentation at [DocURL]. Accept the same props as [CurrentComponent] from
our existing UI library.
Follow the pattern in apps/frontend/src/ui/Button.tsx.
Include a unit test in apps/frontend/src/ui/[ComponentName].test.tsx
following the pattern in apps/frontend/src/ui/Button.test.tsx."
```

The team used this pattern ad hoc; formalizing it as a documented prompt template would make it reusable across teams.

### 6.5 Figma Code Connect (Incomplete Work)

[Figma Code Connect](https://www.figma.com/developers/code-connect) maps Figma components to their code implementations, enabling accurate code snippets in Figma's Dev Mode. US-005 called for this but it was not completed. The `get_code_connect_map` and `add_code_connect_map` Figma MCP tools support this workflow.

Priority mappings to complete:

| Figma Component | Code Component |
|-----------------|---------------|
| BCDS Button | `apps/frontend/src/ui/Button.tsx` |
| BCDS TextField | `apps/frontend/src/ui/TextInput.tsx` |
| BCDS Select | `apps/frontend/src/ui/Select.tsx` |
| BCDS Modal | `apps/frontend/src/ui/Modal.tsx` |
| BCDS Tag | `apps/frontend/src/ui/Badge.tsx` |

---

## 7. Future State Vision

### 7.1 Shared BCDS Adapter Package

The adapter layer built for SDPR is not unique to this application. Any BC Gov team building a React web application that needs to be BCDS-compliant faces the same challenge: BCDS components look and behave differently from whatever the team is currently using, and there are gaps in BCDS coverage where a fallback is still needed.

Right now, each team would have to build their own version of this adapter layer from scratch. A shared package, published once and maintained centrally by the BCDS or OCIO team, would mean any new BC Gov project could install one package and immediately have all the wrappers, accessibility fixes, and token mappings in place. When BCDS releases a new component, the update flows to all projects at once rather than each team having to update separately.

This is the highest-impact single thing BC Gov could do to speed up BCDS adoption across all digital products.

### 7.2 BCDS Compliance Check in Every Pull Request

Currently, whether a new code change follows BCDS conventions is checked by a human reviewer reading through the diff. Humans miss things, especially on large pull requests with many files changed.

A compliance check added to the pull request pipeline would automatically scan every code change for common violations:
- Is any feature code importing UI components directly from a third-party library instead of the adapter layer?
- Are any colours or spacing values hardcoded instead of using BCDS design tokens?

The check would report a pass or fail on the pull request, the same way automated tests do, giving teams instant, consistent feedback without relying on every reviewer to catch every case.

### 7.3 Automated Figma Sync

One ongoing challenge is keeping the Figma design file and the live application visually aligned. Currently, a developer must manually compare the running application against the Figma design to spot drift, and this rarely happens on a consistent schedule.

An automated check could run on a schedule, comparing screenshots of the live application against reference designs in Figma, and automatically raise an issue when they diverge. This would catch cases where a code change introduces an unintended visual difference from the intended design, without requiring any manual inspection.

### 7.4 BCDS Migration Starter Template

One of the biggest barriers to adoption is starting from zero. Every team has to figure out the same things: how to structure the adapter layer, what automated checks to add, how to connect Figma and code, and what conventions to give the AI assistant.

A starter template (a ready-to-use GitHub repository) would include all of this pre-configured. A new BC Gov team would copy the template, update it for their project name and stack, and be BCDS-compliant from their very first line of code. The AI conventions and import checks would be enforced from day one without any team-specific setup work.

This lowers the barrier to adoption from weeks of setup to a single afternoon.

---

## Related Files

| File | Purpose |
|------|---------|
| [BC_DESIGN_SYSTEM_MIGRATION.md](./BC_DESIGN_SYSTEM_MIGRATION.md) | Developer reference: compatibility matrix, adapter rules, guiding principles |
| [BC_DS_SCREEN_MIGRATION_STATUS.md](./BC_DS_SCREEN_MIGRATION_STATUS.md) | Per-route migration status tracker |
| [feature-docs/011-bc-design-system-migration/](../../feature-docs/011-bc-design-system-migration/) | Requirements and user stories for Feature 011 |
| [apps/frontend/src/ui/](../../apps/frontend/src/ui/) | The adapter layer, source of truth for all UI components |
| [.vscode/mcp.json](../../.vscode/mcp.json) | Figma MCP server configuration |
| [.github/copilot-instructions.md](../../.github/copilot-instructions.md) | AI coding conventions for this repository |
