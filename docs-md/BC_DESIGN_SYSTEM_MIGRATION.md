# B.C. Design System Migration

## Purpose

This document tracks the migration from Mantine-first UI implementation to a B.C. Design System-aligned frontend. The migration is incremental: B.C. Design System components and tokens are preferred for standard UI, while Mantine remains as an explicit fallback for missing or high-risk components.

Feature requirements and user stories live in `feature-docs/011-bc-design-system-migration/`.

## Architecture

The migration uses a layered approach:

```
Product code (pages, features)
        │
        ▼
  Local UI adapter layer (apps/frontend/src/ui/)
        │
        ├──► B.C. Design System React components (@bcgov/design-system-react-components)
        ├──► Mantine fallback components (@mantine/core)
        └──► Application-specific composites (local markup + tokens)
```

- **Product code** imports shared UI exclusively from `apps/frontend/src/ui/` on migrated surfaces. Untouched surfaces may continue importing Mantine directly until they are migrated.
- **The adapter layer** decides which underlying library to use for each component. This isolates product code from library-level API changes.
- **B.C. Design System components** are preferred when they provide a suitable replacement without losing workflow-critical behaviour.
- **Mantine fallbacks** remain when no BC DS equivalent exists, the API gap is too wide for a transparent swap, or the migration would risk workflow-critical behaviour.
- **Application-specific composites** are product components with no design-system equivalent, built using BC DS tokens and Mantine layout primitives.

## Current Implementation Status

Initial migration slice implemented:

- Installed `@bcgov/design-system-react-components`, `@bcgov/design-tokens`, and `@bcgov/bc-sans`.
- Imported BC Sans and design token CSS in frontend bootstrap.
- Added a centralized app theme (`apps/frontend/src/theme/appTheme.ts`) and switched the default color scheme target to light mode.
- Created local adapter entry point at `apps/frontend/src/ui/index.tsx`.
- Updated Processing Queue screen files to consume local adapters instead of direct Mantine imports in touched files.
- Migrated app shell header to B.C. Design System `Header` with keyboard skip-link support.
- Added B.C. Design System `Footer` with acknowledgement and copyright content.

Not yet implemented in this slice:

- Code Connect mappings.
- Broad replacement across untouched screens.

## Guiding Rules

- Prefer B.C. Design System React components for standard controls and government chrome.
- Use B.C. Design System design tokens for custom and fallback styling.
- Import shared UI from local wrappers under `apps/frontend/src/ui/` for migrated surfaces.
- Keep Mantine only when there is no suitable B.C. Design System replacement or replacement is deferred.
- Do not introduce Tailwind CSS.
- Do not remove Mantine globally until all direct usage has been intentionally replaced or documented.
- Do not build document-specific UI; the application must remain generic for arbitrary workloads.

## Component Decision Rules

When adding or migrating a component, follow this decision order:

1. **Does the B.C. Design System provide a React component that covers the use case?**
   - Yes, and the API supports the required behaviour → use it (`BC DS native`).
   - Yes, but the API gap would break existing behaviour (e.g. `onPress` vs `onClick` with `stopPropagation`, missing `leftSection` slot, controlled vs uncontrolled mismatch) → defer and keep Mantine for now (`Mantine fallback`). Document the gap in the compatibility matrix.

2. **Is the component simple enough to build from React Aria primitives styled with BC DS tokens?**
   - Yes, and the BC DS component is likely to converge on the same React Aria primitive → build a local wrapper (`BC DS styled wrapper`). This eases future adoption when the official component ships.
   - No, or the effort would exceed the benefit → fall back to Mantine.

3. **Is there no design-system equivalent at all?**
   - If the component is a layout primitive (Group, Stack, Grid, Center) → keep Mantine (`Mantine fallback`).
   - If the component is product-specific (StatCard, PanelCard, DataTable) → build it locally using BC DS tokens and Mantine layout primitives (`Application-specific`).

4. **Style all fallback and application-specific components with BC DS tokens** (colors, spacing, radii, font) where practical, so they visually blend with BC DS native components.

## Component Classifications

| Classification | Meaning |
|----------------|---------|
| `BC DS native` | Uses a B.C. Design System React component directly or through a thin local wrapper. |
| `BC DS styled wrapper` | Uses local markup or React Aria primitives styled with B.C. Design System tokens. |
| `Mantine fallback` | Uses Mantine because no suitable B.C. Design System replacement exists or migration is deferred. |
| `Application-specific` | Product component built for this app, using B.C. Design System tokens and primitives where practical. |

## Compatibility Matrix

### Adapter wrappers (`apps/frontend/src/ui/index.tsx`)

| Wrapper | Internal component | Classification | Notes |
|---------|-------------------|----------------|-------|
| `SearchField` | B.C. DS `TextField` | `BC DS native` | Uses `iconLeft` for search icon; `onChange` provides string directly |
| `StatusSelect` | B.C. DS `Select` | `BC DS native` | Maps `{ value, label }` data array to BC DS `items` format |
| `StatusBadge` | Mantine `Badge` | `Mantine fallback` | BC DS `Tag` lacks "orange" color required by status indicators |
| `DataTable` | Mantine `Table` | `Mantine fallback` | No confirmed BC DS table component |
| `IconActionButton` | Mantine `ActionIcon` + `Tooltip` | `Mantine fallback` | Product code uses `MouseEvent.stopPropagation()` not available in React Aria `PressEvent` |
| `PanelCard` | Mantine `Paper` | `Application-specific` | Card container; no BC DS equivalent |
| `StatCard` | Mantine `Paper` + `Text` | `Application-specific` | Summary metric card; no BC DS equivalent |

### Re-exported Mantine primitives (via adapter layer)

| Re-export | BC DS equivalent exists | Classification | Migration notes |
|-----------|------------------------|----------------|-----------------|
| `Button` | Yes (`Button`) | `Mantine fallback` | BC DS Button uses React Aria API (`onPress`, `isPending`, `isDisabled`) and different variant names; `leftSection` not supported. Deferred. |
| `Text` | Yes (`Text`) | `Mantine fallback` | BC DS Text lacks `fontWeight` (`fw`) prop and dynamic color values used by product code. Deferred. |
| `Title` | Yes (`Heading`) | `Mantine fallback` | Could migrate; deferred for consistency with Text. |
| `Badge` | Yes (`Tag`) | `Mantine fallback` | BC DS Tag has different semantics and missing `variant="outline"`. |
| `Modal` | Yes (`Modal`) | `Mantine fallback` | BC DS Modal is React Aria uncontrolled overlay; Mantine Modal is controlled. API gap too wide for transparent swap. |
| `Tooltip` | Yes (`Tooltip`) | `Mantine fallback` | BC DS Tooltip requires `TooltipTrigger` wrapper pattern. |
| `Group` | No | `Mantine fallback` | Layout primitive; no BC DS equivalent. |
| `Stack` | No | `Mantine fallback` | Layout primitive; no BC DS equivalent. |
| `Center` | No | `Mantine fallback` | Layout primitive; no BC DS equivalent. |
| `SimpleGrid` | No | `Mantine fallback` | Layout primitive; no BC DS equivalent. |
| `Loader` | Partial (`ProgressCircle`) | `Mantine fallback` | BC DS ProgressCircle is determinate; Mantine Loader is indeterminate spinner. |
| `Table` | No | `Mantine fallback` | Also used directly by `DataTable` wrapper. |

### Global chrome (outside adapter layer)

| Current usage | Target component | Interim approach | Classification |
|---------------|------------------|------------------|----------------|
| Mantine `AppShell` / `NavLink` | B.C. DS Header/Footer plus local app nav | Header and Footer replaced; app sidebar remains Mantine | Mixed |
| Mantine `Dropzone` | No confirmed B.C. DS equivalent | Keep Mantine/dropzone, style surrounding shell | `Mantine fallback` |
| Mantine `Notifications` | Inline alert or local notification layer | Keep initially, evaluate replacement | `Mantine fallback` |
| Tabler icons | B.C. DS icons or approved app icon set | Continue using Tabler until icon policy is decided | `Application-specific` |

## Figma Alignment

### Component Usage

Use official B.C. Design System Figma components for standard UI. Create application-specific Figma components only for product UI that is not represented in the design system.

### Naming Convention

Application-specific Figma components follow the pattern `App / <ComponentName>`, where `<ComponentName>` matches the code export name or its functional equivalent. This keeps Figma and code aligned without manual lookup.

| Figma component name | Code equivalent | Classification |
|----------------------|----------------|----------------|
| `App / DataTable` | `DataTable` wrapper (`ui/index.tsx`) | `Mantine fallback` |
| `App / StatCard` | `StatCard` wrapper (`ui/index.tsx`) | `Application-specific` |
| `App / ProcessingQueueCard` | `PanelCard` wrapper (`ui/index.tsx`) | `Application-specific` |
| `App / UploadDropzone` | Upload panel (feature component) | `Mantine fallback` |
| `App / ActionIconButton` | `IconActionButton` wrapper (`ui/index.tsx`) | `Mantine fallback` |

Standard BC DS components (Button, TextField, Select, Header, Footer, Tag, Modal, etc.) should use the official BC Design System Figma library components directly — do not recreate them as app-specific components.

### Code Connect Strategy

Code Connect links Figma components to their code implementations so developers can inspect a Figma node and see the corresponding code snippet.

**Scope rules:**

1. **Official BC DS components**: Reuse the Code Connect mappings maintained in the `@bcgov/design-system` repository. Do not duplicate or override these. When a BC DS native adapter (like `SearchField`) wraps a BC DS component, the official mapping for the underlying component (e.g. `TextField`) already covers the Figma link.

2. **Application-specific components**: The following local wrappers and product components are candidates for future app-level Code Connect mappings:

   | Code component | Figma target | Mapping rationale |
   |----------------|-------------|-------------------|
   | `StatCard` | `App / StatCard` | No official BC DS equivalent; app-specific layout |
   | `PanelCard` | `App / ProcessingQueueCard` | Wraps Mantine Paper; app-specific card |
   | `DataTable` | `App / DataTable` | Wraps Mantine Table; no BC DS table |
   | `IconActionButton` | `App / ActionIconButton` | Wraps Mantine ActionIcon + Tooltip |
   | `StatusBadge` | BC DS `Tag` or `App / StatusBadge` | Depends on future BC DS Tag color support |

3. **Mantine fallback re-exports** (Button, Text, Title, Badge, Modal, etc.): No Code Connect mappings needed in this repo. These will be replaced by BC DS components over time, at which point the official BC DS mappings take over.

**Mapping file location:**

Code Connect mapping files should live alongside the components they describe, following the convention `<component-name>.figma.tsx`. For the adapter layer, this means `apps/frontend/src/ui/<component>.figma.tsx`. The final location is an open decision tracked below; once the team agrees, mapping files can be created.

### Sync Workflow

When a component changes in either Figma or code:

1. **Figma change** (designer updates a component):
   - If the component uses an official BC DS Figma component: no action needed in this repo; the BC DS team maintains their own Code Connect mappings.
   - If the component is app-specific: update the adapter wrapper or product component to match the new design. Update the compatibility matrix classification if the component's status changed (e.g. a Mantine fallback is replaced by a new BC DS component).

2. **Code change** (developer migrates or modifies a component):
   - Update the component's classification comment in `ui/index.tsx`.
   - Update the compatibility matrix in this document.
   - If the component has a Code Connect mapping file, update the mapping to reflect the new code.
   - Notify the designer if the change affects visual appearance or available props, so the Figma component stays in sync.

3. **New component added to BC DS**:
   - Check the compatibility matrix for Mantine fallbacks that now have a BC DS equivalent.
   - Evaluate whether the BC DS component is a suitable replacement (see Component Decision Rules above).
   - If suitable: update the adapter wrapper to use the BC DS component, change the classification, and update the matrix.

## Reference Screen

The Processing Queue screen is the first migration reference. It maps to the Figma frame `Processing Queue — 1440` in the product design file and exercises global chrome, page headings, stat cards, search, select, table, badges, and row actions.

Relevant code:

- `apps/frontend/src/layouts/RootLayout.tsx`
- `apps/frontend/src/pages/QueuePage.tsx`
- `apps/frontend/src/components/queue/ProcessingQueue.tsx`

## Verification

A migration story is complete only when all applicable checks pass.

### Automated checks

Run from `apps/frontend`:

```bash
# TypeScript type check
npx tsc --noEmit

# Production build (includes tsc + Vite bundling)
npm run build

# Unit tests
npm run test
```

### Visual verification checklist

For any story that changes visual output:

- [ ] Desktop width: layout matches Figma reference (or documented intent) at 1440px.
- [ ] Narrow viewport: controls and content remain usable at 768px without overlap or unreadable text.
- [ ] BC DS native components render with correct BC DS styling (not unstyled or broken).
- [ ] Mantine fallback components blend visually with BC DS components (font, color, spacing).
- [ ] Keyboard navigation works for migrated interactive controls (tab order, enter/space activation, escape to dismiss).
- [ ] Header skip link targets the main content area correctly.

### Documentation checklist

After implementation:

- [ ] Compatibility matrix in this document reflects any new or changed wrappers.
- [ ] Classification comments in `apps/frontend/src/ui/index.tsx` are up to date.
- [ ] If a new fallback decision was made, the reason is noted in the compatibility matrix "Notes" column.
- [ ] Story file scenario checkboxes are marked complete.

## Open Questions

- Should the application keep dark mode, or migrate toward the B.C. Design System default light presentation?
- Should the app sidebar remain custom, or become a formal app-specific design-system component?
- Should application-specific Figma components live in the current product file or a separate product component library file?
- Where should Code Connect mapping files live: frontend package (`apps/frontend/src/ui/*.figma.tsx`), a separate integration package, or design documentation area?
- When should migration expand beyond the Processing Queue to additional pages?
- Should Mantine fallback components that have BC DS equivalents with API gaps (Button, Text, Modal) be migrated with breaking API changes, or wait until BC DS adds the missing capabilities?
