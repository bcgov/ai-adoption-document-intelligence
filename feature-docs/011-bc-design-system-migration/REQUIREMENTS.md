# Feature 011 — B.C. Design System Migration and Figma Alignment

## Overview

This feature introduces an incremental migration from the current Mantine-first frontend implementation to a B.C. Design System-aligned frontend while keeping the application stable and usable. It also establishes a workflow for keeping the Figma design file and the codebase aligned.

The first implementation release was a focused reference slice: B.C. Design System foundations, a local UI adapter layer, and the Processing Queue screen as the first synced Figma-to-code implementation. Follow-on work has expanded use of the adapter across additional pages and features while keeping Mantine as a deliberate fallback behind `apps/frontend/src/ui/`.

The feature must not attempt a full frontend rewrite and must not remove Mantine globally in the first release.

## Goals

- **Visually align** the UI with the B.C. Design System: tokens, BC Sans, and BC DS React components (and their packaged styles) are the source of truth for how standard controls look.
- **Functionally preserve** existing product behaviour during migration: adapters under `apps/frontend/src/ui/` keep Mantine-style props where already in use (e.g. `Button` `leftSection`, `loading`, `onClick`) while rendering BC DS components underneath — feature code should not require large prop rewrites for behaviour.
- Keep Mantine as a deliberate fallback only where BC DS has no suitable replacement or migration is deferred; fallbacks should still use BC DS tokens where practical so they blend visually.
- Create a local UI adapter layer so product code can migrate gradually without broad future churn.
- Align the Processing Queue screen with the provided Figma design as the first reference implementation.
- Document how Figma components, code components, and fallback classifications map to each other.
- Preserve workflow-critical product behaviour during visual and component migration.

## Non-Goals

- Do not remove Mantine from the entire frontend in this feature.
- Do not rewrite specialist workspaces end-to-end in a single release; migrate them incrementally. Complex areas (annotation, workflow graph editing, OCR document viewing, benchmarking) may keep Mantine fallbacks re-exported from `apps/frontend/src/ui/` until BC DS coverage and risk acceptance allow deeper replacement.
- Do not introduce Tailwind CSS.
- Do not fork or copy B.C. Design System source components into this repository.
- Do not create unused placeholder wrappers for future use.
- Do not create document-specific UI behaviour; the application must continue to support arbitrary workloads.

---

## Source Assets and References

| Asset | Purpose |
|-------|---------|
| Product Figma design file | `https://www.figma.com/design/xQXAh8qWoKZqEVkIyVzBlv/BC-Gov---New-Frame?node-id=120-249&p=f&t=mB4SNoipE4qmHnfl-0` |
| Processing Queue Figma frame | `Processing Queue — 1440`, node `120:250` inside the product Figma file |
| B.C. Design System Figma library | Official B.C. Design System components and tokens, referenced by the B.C. Design System documentation |
| B.C. Design System React package | `@bcgov/design-system-react-components` |
| B.C. Design System tokens package | `@bcgov/design-tokens` |
| B.C. Sans package | `@bcgov/bc-sans` |
| B.C. Design System docs | `https://www2.gov.bc.ca/gov/content/digital/design-system` |
| B.C. Design System Storybook | `https://designsystem.gov.bc.ca/react-components/` |

---

## Current State

The frontend currently uses React, Mantine, TanStack React Query, and Tabler icons. Mantine is used broadly across the application, including:

- Application shell, sidebar navigation, layout primitives, cards, tables, buttons, forms, modals, badges, notifications, and action icons.
- Date inputs, dropzones, form helpers, and notification APIs.
- Complex app-specific surfaces such as OCR review, workflow editing, benchmarking, tables, and annotation workspaces.

Because Mantine has deep coverage and the B.C. Design System component library is still growing, the migration uses a compatibility layer and category-based replacement strategy. Most product screens now import shared primitives, layout, Mantine fallbacks, and the Mantine notifications API through `apps/frontend/src/ui/` rather than directly from `@mantine/*` packages (global Mantine CSS remains loaded from `main.tsx`).

---

## Actors and Responsibilities

| Actor | Responsibility |
|-------|----------------|
| Frontend developer | Implements foundations, UI adapters, component migration, tests, and documentation updates. |
| Designer | Updates Figma screens/components to use official B.C. Design System assets where practical and reviews visual alignment. |
| Product owner / delivery lead | Confirms scope, prioritization, and open decisions that affect delivery or user experience. |
| QA / tester | Verifies interaction behaviour, responsive layout, accessibility basics, and Figma visual alignment. |

---

## First Release Scope

The first release must include:

1. B.C. Design System dependencies and global foundation setup.
2. BC Sans font loading for end users.
3. B.C. Design System token CSS availability.
4. Mantine theme alignment with B.C. Design System foundations where Mantine remains.
5. A local UI adapter layer under `apps/frontend/src/ui/` for components used by the reference implementation.
6. Processing Queue screen alignment with the Figma reference.
7. Documentation for compatibility, fallback decisions, and Figma/code sync expectations.

The first release must not attempt to migrate every frontend page.

---

## Component Replacement Policy

Component migration must follow this phase order:

1. **Foundations**: font, tokens, theme, global styles.
2. **Global chrome**: header, footer, page shell, skip links, and navigation structure.
3. **Low-risk primitives**: button, link, text, heading, text field, text area, select, checkbox, radio, switch, alert, dialog, tag/badge equivalents.
4. **App-specific composites**: queue cards, stat cards, tables, upload panels, review panels, benchmarking cards.
5. **Specialist surfaces**: annotation canvas, workflow graph editor, OCR document viewer, charts, and high-interaction workspaces.

Mantine components may remain when replacing them would create disproportionate risk or when there is no B.C. Design System equivalent. Those cases must be documented in the compatibility matrix.

---

## Theme and Visual Direction

The application must support both light and dark modes, with the B.C. Design System-aligned light mode as the default target presentation.

Requirements:

- Light mode must be the primary visual target for the migration reference implementation.
- Dark mode may continue to exist, but it must not block the Processing Queue reference implementation.
- Mantine fallback components must be theme-aware where practical.
- Any visual mismatch between B.C. Design System native components and Mantine fallback components must be captured in the compatibility documentation if it cannot be resolved in the first release.

---

## UI Adapter Layer

A local UI adapter layer must be introduced under `apps/frontend/src/ui/`.

Migrated product code must import shared UI through this layer rather than directly importing from Mantine or the B.C. Design System packages, except where explicitly documented (for example, global `@mantine/core` / `@mantine/notifications` stylesheet imports in bootstrap).

The direct-import rule applies to all files that have been brought onto the adapter. New or untouched files should adopt `apps/frontend/src/ui/` when touched rather than introducing new direct Mantine imports.

The adapter layer must:

- Prefer B.C. Design System React components where available and appropriate.
- Use Mantine fallback components when B.C. Design System does not provide a suitable replacement.
- Style Mantine fallback components with B.C. Design System tokens where practical.
- Preserve existing product behaviour for workflow-critical controls.
- Expose typed APIs and avoid `any`.
- Include only wrappers and re-exports needed by migrated surfaces (see `docs-md/BC_DESIGN_SYSTEM_MIGRATION.md` for the live compatibility matrix).

---

## Fallback Strategy

When the B.C. Design System does not provide a suitable component, the first fallback choice is Mantine styled with B.C. Design System tokens.

React Aria primitives may be used instead of Mantine when:

- The component is simple enough to style locally without creating unnecessary maintenance burden.
- Accessibility behaviour is better served by React Aria.
- The B.C. Design System component appears likely to be based on the same React Aria primitive and future convergence would be easier.

All fallback decisions introduced by this feature must be documented in the compatibility matrix.

---

## Component Classification

Every shared UI component introduced or migrated by this feature must be classified as one of:

| Classification | Meaning |
|----------------|---------|
| `BC DS native` | Uses a B.C. Design System React component directly or through a thin local wrapper. |
| `BC DS styled wrapper` | Uses local markup or React Aria primitives styled with B.C. Design System tokens. |
| `Mantine fallback` | Uses Mantine because no suitable B.C. Design System replacement exists or migration is deferred. |
| `Application-specific` | Product component built for this application, using B.C. Design System tokens and primitives where practical. |

---

## Compatibility Matrix

The migration documentation must include a compatibility matrix for the components touched by the reference implementation.

The matrix must include at minimum:

| Current usage | Target component | First-release approach | Classification |
|---------------|------------------|------------------------|----------------|
| Mantine `Button` | B.C. DS `Button` | Replace through `ui/Button` where used by the reference screen | `BC DS native` |
| Mantine `TextInput` | B.C. DS `TextField` | Replace simple inputs through `ui/TextField` | `BC DS native` |
| Mantine `Select` | B.C. DS `Select` or styled Mantine fallback | Use Mantine fallback first if behaviour/API mismatch would slow the reference implementation | `Mantine fallback` or `BC DS native` |
| Mantine `Modal` | B.C. DS `Dialog` / `Modal` | Defer unless touched by Processing Queue reference work | `BC DS native` when migrated |
| Mantine `Table` | No confirmed B.C. DS table equivalent | Keep Mantine, style with B.C. Design System tokens | `Mantine fallback` |
| Mantine `Badge` | B.C. DS tag or local status badge | Use local status badge or styled Mantine fallback | `BC DS styled wrapper` or `Mantine fallback` |
| Mantine `ActionIcon` | Local icon button | Keep Mantine or local button wrapper for icon actions | `Mantine fallback` or `Application-specific` |
| Mantine `Dropzone` | No confirmed B.C. DS equivalent | Keep Mantine/dropzone, style shell with B.C. DS tokens | `Mantine fallback` |
| Mantine `Notifications` | Inline alert or local notification layer | Mantine notifications re-exported from `apps/frontend/src/ui/` (`notifications`, `Notifications`); evaluate BC DS–aligned replacement later | `Mantine fallback` |
| Mantine `AppShell` / `NavLink` | B.C. DS Header/Footer plus local app nav | BC DS Header/Footer in use; shell layout remains Mantine via `apps/frontend/src/ui/` | `Mantine fallback` |
| Tabler icons | B.C. DS icons or approved app icon set | Continue using Tabler in first release unless a B.C. DS icon is readily available | `Application-specific` |

---

## Figma Alignment

Figma and code alignment requires joint designer and developer review before a migrated screen is considered complete.

### Figma Component Ownership

Application-specific Figma components should start in the current product design file. Once patterns stabilize, they should be extracted to a separate product component library file.

### Figma Component Usage

- Use official B.C. Design System Figma components for standard controls where practical.
- Create application-specific Figma components only when the B.C. Design System does not provide a suitable component.
- Name application-specific components consistently with code concepts.

Suggested names:

- `App / DataTable`
- `App / StatCard`
- `App / ProcessingQueueCard`
- `App / UploadDropzone`
- `App / ActionIconButton`

### Code Connect

The first release must document the intended Code Connect strategy but does not need to implement Code Connect mappings.

The strategy must specify:

- How official B.C. Design System mappings should be reused when they exist.
- Which local wrappers or application-specific components are candidates for future Code Connect mappings.
- Where mapping files are expected to live once the team decides ownership.

---

## Reference Implementation: Processing Queue

The Processing Queue screen is the single reference implementation for the first release.

Relevant existing code includes:

- `apps/frontend/src/layouts/RootLayout.tsx`
- `apps/frontend/src/pages/QueuePage.tsx`
- `apps/frontend/src/components/queue/ProcessingQueue.tsx`

The reference implementation must include:

- Page heading and description aligned to the Figma reference.
- Date badge or equivalent date display aligned to the Figma reference where appropriate.
- Processing queue card.
- Stat cards for total, completed, needs review, and processing/failed counts.
- Search field.
- Status filter.
- Document table.
- Status badge.
- View and delete row actions.

The implementation must preserve existing behaviours:

- Documents load from the existing data hooks.
- Search and status filtering continue to work.
- Refresh continues to work.
- Opening eligible documents continues to work.
- Delete confirmation and delete behaviour continue to work.
- Loading, empty, and error-adjacent states remain usable.

The reference implementation must not add logic specific to the attached sample form images or to any single document type.

---

## Behaviour Priority

For simple standard components, prefer B.C. Design System behaviour and adjust the product UX where reasonable.

For workflow-critical components, preserve current product behaviour even if that means keeping Mantine temporarily. Workflow-critical areas include OCR review, annotation, workflow editing, benchmarking analysis, document viewing, and data table workflows where behaviour regressions would materially slow users.

---

## Responsive and Accessibility Requirements

- The Processing Queue reference screen must be usable at desktop and smaller widths.
- Text must not overlap or become unreadable.
- Keyboard navigation must continue to work for migrated controls.
- Header skip link behaviour must be included when app shell migration touches the header.
- Controls must retain accessible labels or visible text equivalents.
- Automated checks do not replace visual review against Figma.

---

## Validation Requirements

A migration story is complete only when all applicable checks pass:

1. Type check.
2. Lint.
3. Relevant unit tests.
4. Visual review against the Figma reference.

For the first release, visual review must include at least desktop width matching the `Processing Queue — 1440` frame and one narrower viewport check for layout stability.

---

## Documentation Requirements

Documentation must be added or updated under `docs-md/` and must include:

- Migration strategy.
- UI adapter rules.
- Component classification definitions.
- Compatibility matrix.
- Figma component ownership guidance.
- Code Connect strategy, even if implementation is deferred.
- Validation checklist.
- Known gaps and deferred decisions.

---

## Open Decisions to Track

The following decisions are not blockers for the first release but must be tracked:

- When to extract application-specific Figma components into a separate product component library.
- Whether to formally replace the custom sidebar with a reusable application navigation component.
- Whether Code Connect mappings should live in the frontend package, a separate integration package, or another location.
- When to expand BC DS native usage for high-gap primitives (for example Mantine `Button`, `Text`, `Modal`) now routed through the adapter as fallbacks.

---

## Acceptance Criteria

- B.C. Design System packages are installed and pinned in the frontend package manifest.
- BC Sans is loaded through package-provided font-face declarations.
- B.C. Design System CSS tokens are available globally.
- Mantine remains available but is aligned with B.C. Design System foundations where practical.
- A local UI adapter layer exists under `apps/frontend/src/ui/` and is used by the Processing Queue reference implementation and by other migrated frontend surfaces (see `docs-md/BC_DESIGN_SYSTEM_MIGRATION.md` for scope).
- Direct Mantine package imports are avoided in migrated product TypeScript/TSX; shared UI, including imperative toasts, is imported from the adapter unless noted otherwise in migration docs.
- Mantine fallbacks used by the reference implementation are documented.
- The Processing Queue screen remains functionally equivalent while moving toward the Figma reference.
- Designer and developer review confirms the Processing Queue reference implementation is acceptably aligned with Figma.
- Documentation under `docs-md/` captures migration rules, compatibility, Figma ownership, and Code Connect strategy.
- Type check, lint, relevant unit tests, and visual review are complete before implementation is considered done.
