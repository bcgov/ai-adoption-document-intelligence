# Feature 011 — B.C. Design System Migration and Figma Alignment

## Overview

This feature introduces a phased migration from Mantine-first UI implementation to the B.C. Design System while keeping the application stable and usable. The target state is a frontend where:

1. B.C. Design System tokens and React components are the preferred source of truth for common UI.
2. Mantine remains only as a deliberate fallback for components that do not yet have suitable B.C. Design System replacements or where replacement would be high risk.
3. The Figma design file and the codebase share a documented component mapping so designs and implementation stay in sync.
4. The Processing Queue screen is used as the first reference implementation for the migration pattern.

The migration must be incremental. It must not attempt a full rewrite of the frontend or remove Mantine in one pass.

---

## Source Design Assets

| Asset | Purpose |
|-------|---------|
| Application design file | `https://www.figma.com/design/xQXAh8qWoKZqEVkIyVzBlv/BC-Gov---New-Frame?node-id=120-249&p=f&t=mB4SNoipE4qmHnfl-0` |
| B.C. Design System Figma library | Official B.C. Design System components and tokens, referenced by the B.C. Design System documentation |
| B.C. Design System React package | `@bcgov/design-system-react-components` |
| B.C. Design System tokens package | `@bcgov/design-tokens` |
| B.C. Sans font package | `@bcgov/bc-sans` |

---

## Current State

The frontend currently uses React, Mantine, TanStack React Query, and Tabler icons. Mantine is used broadly across application pages and specialist workflows, including:

- Application shell, sidebar navigation, cards, tables, buttons, forms, modals, badges, notifications, and layout primitives.
- Date inputs, dropzones, form helpers, and notification APIs.
- Complex app-specific surfaces such as OCR review, workflow editing, benchmarking, tables, and annotation workspaces.

Because Mantine has deep coverage in the application and the B.C. Design System component library is still growing, this feature must use a compatibility layer and category-based migration rather than a page-by-page rewrite.

---

## Target Architecture

### UI Adapter Layer

A local UI adapter layer must be introduced under `apps/frontend/src/ui/`.

New or migrated product code should import common UI from this layer instead of importing directly from Mantine or the B.C. Design System packages.

The adapter layer is responsible for:

- Preferring B.C. Design System React components where available and appropriate.
- Using Mantine as a documented fallback where no suitable B.C. Design System component exists.
- Applying B.C. Design System tokens to fallback components.
- Providing stable local APIs so future component swaps do not require broad product-code churn.

### Foundations

The application must import and use:

- B.C. Sans font-face declarations.
- B.C. Design System CSS tokens.
- A Mantine theme configured to align remaining Mantine components with B.C. Design System typography, colors, spacing, and border radius decisions.

### Component Replacement Policy

Component migration must follow this order:

1. Foundations: font, tokens, theme, global styles.
2. Global chrome: header, footer, page shell, skip links, and navigation structure.
3. Low-risk primitives: button, link, text, heading, text field, text area, select, checkbox, radio, switch, alert, dialog, tag/badge equivalents.
4. App-specific composites: queue cards, stat cards, tables, upload panels, review panels, benchmarking cards.
5. Specialist surfaces: annotation canvas, workflow graph editor, OCR document viewer, charts, and high-interaction workspaces.

Mantine components may remain when replacing them would create disproportionate risk or when there is no B.C. Design System equivalent. Those cases must be documented in the compatibility matrix.

---

## Figma Alignment Requirements

### Design Source of Truth

Figma screens should use official B.C. Design System components for standard UI wherever possible. Application-specific components should be created only when the design system does not provide a suitable component.

Application-specific Figma components must be named consistently with their code counterparts, for example:

- `App / DataTable`
- `App / StatCard`
- `App / ProcessingQueueCard`
- `App / UploadDropzone`
- `App / ActionIconButton`

### Component Classification

Every shared UI component introduced or migrated by this feature must be classified as one of:

| Classification | Meaning |
|----------------|---------|
| `BC DS native` | Uses a B.C. Design System React component directly or through a thin local wrapper. |
| `BC DS styled wrapper` | Uses local markup or React Aria primitives styled with B.C. Design System tokens. |
| `Mantine fallback` | Uses Mantine because no suitable B.C. Design System replacement exists or replacement is deferred. |
| `Application-specific` | A domain component built for this product, using B.C. Design System tokens and primitives where possible. |

### Code Connect

Where practical, Code Connect mappings should be added for local wrapper components and application-specific components so the Figma design file can point to the actual implementation surface.

Code Connect is required for the reference implementation components unless the team determines that the official B.C. Design System mapping already covers the component.

---

## Reference Implementation: Processing Queue

The Processing Queue screen from the Figma file is the first reference implementation. It covers a useful cross-section of UI:

- Global header and sidebar context.
- Page heading and date badge.
- Queue card.
- Stat cards.
- Search input and status select.
- Data table.
- Status badge.
- Icon actions.

The implementation must align the existing code with the Figma design while respecting the target migration strategy. It should not introduce one-off styling that cannot be reused by future screens.

Relevant existing files include:

- `apps/frontend/src/layouts/RootLayout.tsx`
- `apps/frontend/src/pages/QueuePage.tsx`
- `apps/frontend/src/components/queue/ProcessingQueue.tsx`

---

## Compatibility Matrix Requirements

A compatibility matrix must be maintained in `docs-md/BC_DESIGN_SYSTEM_MIGRATION.md`.

The matrix must include at minimum:

| Current usage | Target component | Interim approach | Classification |
|---------------|------------------|------------------|----------------|
| Mantine `Button` | B.C. DS `Button` | Replace via `ui/Button` | `BC DS native` |
| Mantine `TextInput` | B.C. DS `TextField` | Replace simple inputs via `ui/TextField` | `BC DS native` |
| Mantine `Select` | B.C. DS `Select` | Replace simple selects; keep complex selects as fallback | Mixed |
| Mantine `Modal` | B.C. DS `Dialog` / `Modal` | Replace confirm and info dialogs first | `BC DS native` |
| Mantine `Table` | No confirmed B.C. DS equivalent | Keep Mantine, style with B.C. DS tokens | `Mantine fallback` |
| Mantine `Dropzone` | No confirmed B.C. DS equivalent | Keep Mantine/dropzone, style shell | `Mantine fallback` |
| Mantine `Notifications` | Inline alert or local notification layer | Keep initially, evaluate replacement | `Mantine fallback` |
| Mantine `AppShell` / `NavLink` | B.C. DS Header/Footer plus local app nav | Replace shell in phases | Mixed |

---

## Non-Goals

- Do not remove Mantine from the entire frontend in this feature.
- Do not rewrite specialist workspaces unless required by the reference implementation.
- Do not introduce Tailwind CSS.
- Do not fork or copy B.C. Design System source components into this repository.
- Do not create generic placeholder components that are not used by the migration stories.
- Do not create document-specific UI behaviour; the application must continue to support arbitrary workloads.

---

## Acceptance Criteria

- The frontend can consume B.C. Design System React components and tokens.
- B.C. Sans is loaded for application users, not only developers with the font installed locally.
- Remaining Mantine components are visually aligned with B.C. Design System foundations where practical.
- A local UI adapter layer exists and is used by the reference implementation.
- The Processing Queue screen is updated as the first migrated screen.
- The Figma design file has a documented mapping to code components and classifications.
- The compatibility matrix documents every intentional Mantine fallback introduced or retained by the reference implementation.
- Related documentation is added under `docs-md/`.
- Frontend type checks, linting, and relevant unit tests pass for changed code.

---

## Open Questions

- Should the application keep a dark color scheme, or should migration reset the product to the B.C. Design System default light presentation?
- Should the application sidebar remain a custom product navigation pattern, or should it be redesigned as a B.C. Design System-compatible application navigation component?
- Which Figma file should own application-specific components: the current product design file or a separate product component library file?
- Should Code Connect mappings live in this repo as part of the frontend package, or in a separate design-system integration package?
