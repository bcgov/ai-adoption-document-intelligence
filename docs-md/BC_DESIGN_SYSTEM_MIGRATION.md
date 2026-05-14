# B.C. Design System Migration

## Purpose

This document tracks the migration from Mantine-first UI implementation to a B.C. Design System-aligned frontend. The migration is incremental: B.C. Design System components and tokens are preferred for standard UI, while Mantine remains as an explicit fallback for missing or high-risk components.

Feature requirements and user stories live in `feature-docs/011-bc-design-system-migration/`.

## Guiding Rules

- Prefer B.C. Design System React components for standard controls and government chrome.
- Use B.C. Design System design tokens for custom and fallback styling.
- Import shared UI from local wrappers under `apps/frontend/src/ui/` for migrated surfaces.
- Keep Mantine only when there is no suitable B.C. Design System replacement or replacement is deferred.
- Do not introduce Tailwind CSS.
- Do not remove Mantine globally until all direct usage has been intentionally replaced or documented.
- Do not build document-specific UI; the application must remain generic for arbitrary workloads.

## Component Classifications

| Classification | Meaning |
|----------------|---------|
| `BC DS native` | Uses a B.C. Design System React component directly or through a thin local wrapper. |
| `BC DS styled wrapper` | Uses local markup or React Aria primitives styled with B.C. Design System tokens. |
| `Mantine fallback` | Uses Mantine because no suitable B.C. Design System replacement exists or migration is deferred. |
| `Application-specific` | Product component built for this app, using B.C. Design System tokens and primitives where practical. |

## Compatibility Matrix

| Current usage | Target component | Interim approach | Classification |
|---------------|------------------|------------------|----------------|
| Mantine `Button` | B.C. DS `Button` | Replace through `ui/Button` | `BC DS native` |
| Mantine `TextInput` | B.C. DS `TextField` | Replace simple inputs through `ui/TextField` | `BC DS native` |
| Mantine `Textarea` | B.C. DS `TextArea` | Replace simple text areas through `ui/TextArea` | `BC DS native` |
| Mantine `Select` | B.C. DS `Select` | Replace simple selects; keep complex selects as fallback | Mixed |
| Mantine `Modal` | B.C. DS `Dialog` / `Modal` | Replace confirm and info dialogs first | `BC DS native` |
| Mantine `Badge` | B.C. DS tag or local badge | Use local wrapper until status/tag semantics are finalized | `BC DS styled wrapper` or `Mantine fallback` |
| Mantine `Table` | No confirmed B.C. DS equivalent | Keep Mantine, style with B.C. Design System tokens | `Mantine fallback` |
| Mantine `Dropzone` | No confirmed B.C. DS equivalent | Keep Mantine/dropzone, style surrounding shell | `Mantine fallback` |
| Mantine `Notifications` | Inline alert or local notification layer | Keep initially, evaluate replacement | `Mantine fallback` |
| Mantine `AppShell` / `NavLink` | B.C. DS Header/Footer plus local app nav | Replace shell in phases; keep app sidebar custom | Mixed |
| Tabler icons | B.C. DS icons or approved app icon set | Continue using Tabler until icon policy is decided | `Application-specific` |

## Figma Alignment

Use official B.C. Design System Figma components for standard UI. Create application-specific Figma components only for product UI that is not represented in the design system.

Suggested app-specific component names:

- `App / DataTable`
- `App / StatCard`
- `App / ProcessingQueueCard`
- `App / UploadDropzone`
- `App / ActionIconButton`

When a local code component has a matching Figma component, add or update Code Connect mappings where practical. Reuse official B.C. Design System mappings when the official component already covers the case.

## Reference Screen

The Processing Queue screen is the first migration reference. It maps to the Figma frame `Processing Queue — 1440` in the product design file and exercises global chrome, page headings, stat cards, search, select, table, badges, and row actions.

Relevant code:

- `apps/frontend/src/layouts/RootLayout.tsx`
- `apps/frontend/src/pages/QueuePage.tsx`
- `apps/frontend/src/components/queue/ProcessingQueue.tsx`

## Verification

For implementation stories, run the relevant frontend validation commands from `apps/frontend`:

```bash
npm run type-check
npm run lint
npm run test
```

For visual changes, verify at desktop and mobile widths. Confirm text does not overlap, keyboard navigation remains usable, and migrated components preserve existing behaviours.

## Open Questions

- Should the application keep dark mode, or migrate toward the B.C. Design System default light presentation?
- Should the app sidebar remain custom, or become a formal app-specific design-system component?
- Should application-specific Figma components live in the current product file or a separate product component library file?
- Where should Code Connect mappings live: frontend package, separate integration package, or design documentation area?
