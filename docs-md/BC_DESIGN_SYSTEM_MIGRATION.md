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

- **Product code** imports shared UI from `apps/frontend/src/ui/` on migrated surfaces. Global stylesheet imports for Mantine remain in `main.tsx`; see **Continuous integration** below for how frontend checks are run in CI.
- **The adapter layer** decides which underlying library to use for each component. This isolates product code from library-level API changes.
- **B.C. Design System components** are preferred when they provide a suitable replacement without losing workflow-critical behaviour.
- **Mantine fallbacks** remain when no BC DS equivalent exists, the API gap is too wide for a transparent swap, or the migration would risk workflow-critical behaviour.
- **Application-specific composites** are product components with no design-system equivalent, built using BC DS tokens and Mantine layout primitives.

## Continuous integration (frontend)

GitHub Actions workflow [`.github/workflows/frontend-qa.yml`](../.github/workflows/frontend-qa.yml) runs, in `apps/frontend`:

1. `npm run lint` — Biome
2. `npm run type-check` — TypeScript
3. `npm run test` — Vitest (jsdom environment)

CI uses **Node 24** (see workflow), matching the recommended local Node for Vitest. The repo root `.nvmrc` pins `24` for `nvm use` / auto-switch (see README Quick Start). `jsdom` is **28.1.0** in `apps/frontend/package.json`. If tests fail worker startup with `ERR_REQUIRE_ESM` on Node 20.x, use Node 24 locally (or temporarily pin `jsdom` to 26.x).

## Current Implementation Status

Initial migration slice implemented:

- Installed `@bcgov/design-system-react-components`, `@bcgov/design-tokens`, and `@bcgov/bc-sans`.
- Imported BC Sans and design token CSS in frontend bootstrap.
- Added a centralized app theme (`apps/frontend/src/theme/appTheme.ts`) and switched the default color scheme target to light mode.
- Created local adapter entry point at `apps/frontend/src/ui/index.tsx`.
- Updated Processing Queue screen files to consume local adapters instead of direct Mantine imports in touched files.
- Migrated app shell header to B.C. Design System `Header` with keyboard skip-link support. Header layout overrides stretch the bar full width with logo and title on the left and auth/utility controls on the right, matching [gov.bc.ca design system pages](https://www2.gov.bc.ca/gov/content/digital/design-system/components/buttons).
- Added B.C. Design System `Footer` with acknowledgement and copyright content. The footer sits at the end of `AppShell.Main` scroll content (not in a fixed `AppShell.Footer` slot), matching [gov.bc.ca design system pages](https://www2.gov.bc.ca/gov/content/digital/design-system/components/buttons): it appears only after scrolling to the bottom of the page content.
- **Typography adapters:** `Text` and `Title` in `apps/frontend/src/ui/` render BC DS `Text` / `Heading` with Mantine-compatible props (`size`, `c`, `fw`, `order`, spacing shorthands, `component="a"` for text links).
- **`StatusBadge` adapter:** BC DS `Tag` for processing-queue status labels (`apps/frontend/src/ui/StatusBadge.tsx`).
- **Remaining component adapters (Phases 1–4):** `Badge`, `Tooltip`, `IconActionButton`, `Divider`, `Progress`, `Alert`, `TextInput`, `Textarea`, `Select`, `Checkbox`, `Switch`, `Radio`, `NumberInput`, `DateInput`, and `Modal` in dedicated files under `apps/frontend/src/ui/`. Shared helpers: `tagUtils.ts`, `formFieldUtils.ts`. Processing Queue screen (US-004): updated copy and BC DS token classes on `PanelCard` / `StatCard`.
- **Vertical slice (upload):** `UploadPage`, `DocumentUploadPanel`, and `Login` import shared UI from `apps/frontend/src/ui/` (Mantine fallbacks for dropzone, selects, cards, etc.).
- **Vertical slice (auth/setup pages):** `SetupPage` and `RequestMembershipPage` import layout and feedback primitives from `apps/frontend/src/ui/` instead of `@mantine/core`.
- **Vertical slice (tables):** All files under `apps/frontend/src/features/tables/` import shared UI from `apps/frontend/src/ui/` (pages, components, lookup templates). `RowForm` still imports `@mantine/dates/styles.css` for date picker styling.
- **Vertical slice (classification, groups, settings):** Pages and components under `components/classification/`, `components/group/`, and `SettingsPage` / `ClassifierPage` / `GroupsPage` / `GroupDetailPage` import from `apps/frontend/src/ui/`, including the `notifications` toast API re-exported from the adapter.
- **Vertical slice (workflows):** `WorkflowPage`, `WorkflowEditPage`, `WorkflowEditorPage`, `WorkflowListPage`, and all files under `components/workflow/` import from `apps/frontend/src/ui/` (including `useDebouncedValue` for the graph editor).
- **Vertical slice (benchmarking):** All pages and components under `apps/frontend/src/features/benchmarking/` import from `apps/frontend/src/ui/`, including `notifications` where toasts are used.
- **Vertical slice (annotation / HITL / template models):** Pages and components under `apps/frontend/src/features/annotation/` (including `hitl/`, `template-models/`, and shared `core/`) import layout and Mantine fallbacks from `apps/frontend/src/ui/`, including `notifications` where toasts are used.
- **App shell, bootstrap, and document surfaces:** `RootLayout`, `App`, `main.tsx` (`MantineProvider` and `Notifications` from the adapter), `appTheme.ts` (`createTheme` via the adapter), and document-related components (`DocumentViewer`, `DocumentViewerModal`, `DocumentDetailDrawer`, `DocumentValidation`, `DocumentsList`) plus `HelloWorld` import shared primitives from `apps/frontend/src/ui/`. `main.tsx` still imports `@mantine/core/styles.css` and `@mantine/notifications/styles.css`.

- **Mantine fallback token styling:** `apps/frontend/src/ui/bcds-mantine-fallbacks.css` (loaded after Mantine CSS) styles tables, dropzone, loader, notifications, app shell/nav, and plain `Paper`/`Card` using BC DS design tokens. `appTheme.ts` maps Mantine `blue`/`gray`/`red` scales to BC DS palette values.
- **Layout spacing:** `appTheme.ts` maps Mantine `spacing` (`xs`–`xl`) to BC DS `--layout-margin-*` tokens (tighter than Mantine defaults). `Stack`/`Group` `gap="sm"` → `--layout-margin-small` (0.5rem); `gap="md"` / `gap="lg"` / `gap="xl"` → `--layout-margin-medium` (1rem). Smaller steps: `--layout-margin-xsmall` (0.25rem), `--layout-margin-hair` (0.125rem).
- **DataTable composite:** `apps/frontend/src/ui/DataTable.tsx` wraps Mantine `Table` with `bcds-data-table-wrapper` border/radius, optional `caption`, and `Table.*` static aliases. Processing Queue uses `DataTable` instead of raw `Table`.
- **Upload panel composite:** `DocumentUploadPanel` uses `PanelCard`, `bcds-upload-panel` / `bcds-upload-queue-*` classes (`bcds-upload-panel.css`), BC DS `IconActionButton` for row actions, and token-colored dropzone icons.
- **Direct-import cleanup:** Product TSX no longer imports `@mantine/core` or `@mantine/notifications` except inside `apps/frontend/src/ui/` (adapter layer). `rem()` is re-exported from `apps/frontend/src/ui/spacingUtils.ts` instead of Mantine.

Not yet implemented in this slice:

- Code Connect mappings.
- Replacing Mantine `notifications` imperative API (toast API remains Mantine; styles use BC DS tokens).

## Migration principle: visual vs functional

This migration has two separate goals. Do not conflate them.

| Goal | What changes | What stays the same |
|------|----------------|---------------------|
| **Visual alignment** | Appearance must match [B.C. Design System](https://www2.gov.bc.ca/gov/content/digital/design-system): BC DS React components, design tokens (`@bcgov/design-tokens`), BC Sans, and component CSS from `@bcgov/design-system-react-components`. Product UI should not look like Mantine-themed controls when a BC DS equivalent exists. | — |
| **Functional preservation** | — | Product code keeps familiar Mantine-style APIs where they are already in use (`leftSection`, `loading`, `variant="light"`, `onClick` + `stopPropagation`, `fullWidth`, etc.). Adapters in `apps/frontend/src/ui/` translate those props to BC DS components; feature code should not need wide rewrites for behaviour. |

**Adapter pattern (e.g. `Button`):** render **BC DS under the hood** for visuals; accept **Mantine prop names** for behaviour. Variant names like `filled` / `light` / `subtle` are mapped to BC DS `primary` / `secondary` / `tertiary` / `link` — that mapping is for hierarchy and look, not for keeping Mantine colours. Do not reintroduce Mantine `Button` in product code for migrated surfaces.

When reviewing a migrated control, ask:

1. Does it **look** like Storybook / gov.bc.ca buttons (size, border, fill, focus ring, danger state)?
2. Do existing call sites still **work** without prop renames (loading, icons, disabled, click handlers)?

## Guiding Rules

- Prefer B.C. Design System React components for standard controls and government chrome.
- Use B.C. Design System design tokens for custom and fallback styling.
- Import shared UI from local wrappers under `apps/frontend/src/ui/` for migrated surfaces. Do not import `@mantine/core`, `@mantine/notifications`, or other `@mantine/*` packages from product code; only `apps/frontend/src/ui/index.tsx` and adapter modules (e.g. `DataTable.tsx`) may import Mantine directly.
- Keep Mantine only when there is no suitable B.C. Design System replacement or replacement is deferred.
- Preserve Mantine-compatible behaviour through adapters; do not sacrifice BC DS visuals to keep Mantine styling.
- Do not introduce Tailwind CSS.
- Do not remove Mantine globally until all direct usage has been intentionally replaced or documented.
- Do not build document-specific UI; the application must remain generic for arbitrary workloads.

## Component Decision Rules

When adding or migrating a component, follow this decision order:

1. **Does the B.C. Design System provide a React component that covers the use case?**
   - Yes, and product code can use it directly or through a thin adapter → use it (`BC DS native`). **Visually** it must be the BC DS component.
   - Yes, but the BC DS API differs from Mantine props already used in the app (e.g. `leftSection`, `loading`, `onClick` with `stopPropagation`) → add or extend an adapter in `apps/frontend/src/ui/` that renders BC DS and preserves Mantine-compat props (`BC DS native` + functional adapter). Example: `Button`.
   - No, or the gap is too large for a thin adapter (controlled `Modal`, etc.) → keep Mantine for now (`Mantine fallback`). Document the gap in the compatibility matrix.

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
| `StatusBadge` | B.C. DS `Tag` | `BC DS native` | `StatusBadge.tsx`; shared `tagUtils.ts`. Read-only cursor via `bcds-status-badge.css`. |
| `Badge` | B.C. DS `Tag` | `BC DS native` | `Badge.tsx`; general labels/counts; supports `leftSection`→`icon`, margins, `onClick`, `data-testid`. |
| `Tooltip` | B.C. DS `Tooltip` + `TooltipTrigger` | `BC DS native` | `Tooltip.tsx`; Mantine `label`→children, `position` mapped (incl. `top-start`). |
| `IconActionButton` | B.C. DS `Button` + `Tooltip` | `BC DS native` | `IconActionButton.tsx`; icon-only `Button` with `stopPropagation` on `onClick`. |
| `Divider` | B.C. DS `Separator` | `BC DS native` | `Divider.tsx`; vertical divider uses token border fallback. |
| `Progress` | B.C. DS `ProgressBar` | `BC DS native` | `Progress.tsx`; `animated` without `value`→indeterminate. |
| `Alert` | B.C. DS `InlineAlert` | `BC DS native` | `Alert.tsx`; Mantine `color`→`variant`. |
| `TextInput` | B.C. DS `TextField` | `BC DS native` | `TextInput.tsx`; Mantine `onChange` event bridge. |
| `Textarea` | B.C. DS `TextArea` | `BC DS native` | `Textarea.tsx`. |
| `Select` | B.C. DS `Select` | `BC DS native` | `Select.tsx`; flat `data` and grouped `{ group, items }`; default trigger/popover width fits option labels (`bcds-select.css`, `bcds-form-field--fit`); use `fullWidth` in form columns or `w` for fixed width; `StatusSelect` remains separate. |
| `Checkbox` | B.C. DS `Checkbox` | `BC DS native` | `Checkbox.tsx`; `Radio.Group` in `Radio.tsx`. |
| `Switch` | B.C. DS `Switch` | `BC DS native` | `Switch.tsx`. |
| `Radio` | B.C. DS `Radio` / `RadioGroup` | `BC DS native` | `Radio.tsx`. |
| `NumberInput` | B.C. DS `NumberField` | `BC DS native` | `NumberInput.tsx`. |
| `DateInput` | B.C. DS `DatePicker` | `BC DS native` | `DateInput.tsx`; Mantine `Date` value via `@internationalized/date`. |
| `Modal` | B.C. DS `Modal` + `Dialog` | `BC DS native` | `Modal.tsx`; controlled `opened`/`onClose`; size CSS classes in `bcds-modal.css`. |
| `DataTable` | Mantine `Table` | `Mantine fallback` | [`DataTable.tsx`](apps/frontend/src/ui/DataTable.tsx): bordered wrapper, caption, `bcds-mantine-table` tokens |
| `PanelCard` | Mantine `Paper` | `Application-specific` | `bcds-panel-card` token class |
| `StatCard` | Mantine `Paper` + `Text` | `Application-specific` | `bcds-stat-card` token class |

### Re-exported Mantine primitives (via adapter layer)

| Re-export | BC DS equivalent exists | Classification | Migration notes |
|-----------|------------------------|----------------|-----------------|
| `Button` | Yes (`Button`) | `BC DS native` | **Visual:** BC DS `Button` / `Link` (`isButton`), tokens, `ui/bcds-button.css`. **Functional (adapter):** Mantine props preserved — `leftSection`/`rightSection`, `loading`→`isPending`, `onClick`, `fullWidth`, `component="a"`+`href`, legacy `variant`/`size`/`color`. Variant map: `filled`→primary, `outline`/`default`/`light`→secondary, `subtle`/`transparent`→tertiary; `color="red"`→`danger`. **Do not pass `className={undefined}`** to BC DS — it overwrites `bcds-react-aria-Button` classes via `...props` spread. See [Buttons](https://www2.gov.bc.ca/gov/content/digital/design-system/components/buttons). |
| `Text` | Yes (`Text`) | `BC DS native` | **Visual:** BC DS `Text` with token typography. **Functional (adapter):** Mantine props preserved — `size` (xs/sm/md/lg), `c` (dimmed→secondary, red→danger, blue/green/yellow/orange via tokens), `fw`, `ta`, `td`, `tt`, `fs`, `ff`, `lineClamp`, `span`/`component`, spacing shorthands (`mt`, `mb`, `ml`, `mr`, `py`, `px`), `inline`, `style`, `className`. Do not pass `className={undefined}`. |
| `Title` | Yes (`Heading`) | `BC DS native` | **Visual:** BC DS `Heading` (h1–h6 via `order`). **Functional (adapter):** same typography shorthands as `Text`; `order` maps to `level`. |
| `Badge` | Yes (`Tag`) | `BC DS native` | Adapter: `Badge.tsx`. |
| `Modal` | Yes (`Modal`) | `BC DS native` | Adapter: `Modal.tsx` (controlled wrapper). |
| `Tooltip` | Yes (`Tooltip`) | `BC DS native` | Adapter: `Tooltip.tsx`. |
| `Group` | No | `Mantine fallback` | Layout primitive; no BC DS equivalent. |
| `Stack` | No | `Mantine fallback` | Layout primitive; no BC DS equivalent. |
| `Center` | No | `Mantine fallback` | Layout primitive; no BC DS equivalent. |
| `SimpleGrid` | No | `Mantine fallback` | Layout primitive; no BC DS equivalent. |
| `Loader` | Partial (`ProgressCircle`) | `Mantine fallback` | Spinner color uses `--theme-primary-blue` token. |
| `Table` | No | `Mantine fallback` | Raw Mantine table; prefer `DataTable` for token wrapper + caption. |
| `DataTable` | No | `Application-specific` | Exported from adapter layer; wraps `Table` with `bcds-data-table-wrapper`. |
| `Alert` | Yes (`InlineAlert` / `AlertBanner`) | `BC DS native` | Adapter: `Alert.tsx`. |
| `Box` | No | `Mantine fallback` | Layout primitive; no BC DS equivalent. |
| `Card` | No | `Mantine fallback` | Card container; no BC DS equivalent. |
| `Paper` | No | `Mantine fallback` | Surface container; used by `PanelCard` / `StatCard`. |
| `Divider` | Yes (`Separator`) | `BC DS native` | Adapter: `Divider.tsx`. |
| `Progress` | Yes (`ProgressBar`) | `BC DS native` | Adapter: `Progress.tsx`. |
| `ScrollArea` | No | `Mantine fallback` | Scroll container; no BC DS equivalent. |
| `Select` | Yes (`Select`) | `BC DS native` | Adapter: `Select.tsx`; `StatusSelect` for queue filter. |
| `Dropzone` | No | `Mantine fallback` | `bcds-mantine-dropzone` + global dropzone token rules. |
| `Avatar` | No | `Mantine fallback` | No BC DS equivalent. |
| `rem` | No | `Mantine fallback` | Re-exported from [`spacingUtils.ts`](apps/frontend/src/ui/spacingUtils.ts) (same API as Mantine; no `@mantine/core` in product code). |
| `Container` | No | `Mantine fallback` | Page width constraint. |
| `TextInput` / `Textarea` | Yes (`TextField` / `TextArea`) | `BC DS native` | Adapters: `TextInput.tsx`, `Textarea.tsx`. |
| `Tabs` | No | `Mantine fallback` | Tabbed detail views. |
| `Pagination` | No | `Mantine fallback` | Table paging. |
| `NumberInput` | Yes (`NumberField`) | `BC DS native` | Adapter: `NumberInput.tsx`. |
| `Switch` | Yes (`Switch`) | `BC DS native` | Adapter: `Switch.tsx`. |
| `JsonInput` / `TagsInput` | No | `Mantine fallback` | Specialized Mantine inputs. |
| `Code` | No | `Mantine fallback` | Monospace snippet display. |
| `DateInput` | Yes (`DatePicker`) | `BC DS native` | Adapter: `DateInput.tsx`. |
| `useForm` | N/A | `Mantine fallback` | Re-exported from `@mantine/form`. |
| `useDebouncedValue` | N/A | `Mantine fallback` | Re-exported from `@mantine/hooks`. |
| `useDisclosure` | N/A | `Mantine fallback` | Re-exported from `@mantine/hooks`. |
| `useSessionStorage` | N/A | `Mantine fallback` | Re-exported from `@mantine/hooks`. |
| `useElementSize` | N/A | `Mantine fallback` | Re-exported from `@mantine/hooks`. |
| `Drawer` | No | `Mantine fallback` | Side panels (e.g. benchmarking). |
| `Breadcrumbs` | No | `Mantine fallback` | Navigation trails. |
| `Checkbox` | Yes (`Checkbox`) | `BC DS native` | Adapter: `Checkbox.tsx`. |
| `MultiSelect` | No | `Mantine fallback` | Multiple selection. |
| `Radio` | Yes (`Radio`) | `BC DS native` | Adapter: `Radio.tsx`. |
| `Kbd` | No | `Mantine fallback` | Shortcut hints in annotation/HITL UI; no BC DS equivalent. |
| `Popover` | No | `Mantine fallback` | Overlay panels. |
| `AppShell` | No | `Mantine fallback` | Application layout shell (root nav). |
| `NavLink` | No | `Mantine fallback` | Sidebar navigation links. |
| `Image` | No | `Mantine fallback` | Mantine `Image` for document previews. |
| `Skeleton` | No | `Mantine fallback` | Loading placeholders. |
| `createTheme` | N/A | `Mantine fallback` | Mantine theme factory; used by `appTheme.ts` through the adapter. |
| `Notifications` | N/A | `Mantine fallback` | Notification stack provider from `@mantine/notifications`; re-exported for bootstrap next to `MantineProvider`. |
| `notifications` | N/A | `Mantine fallback` | Imperative API unchanged; toast chrome styled with BC DS tokens in `bcds-mantine-fallbacks.css`. |

### Global chrome (outside adapter layer)

| Current usage | Target component | Interim approach | Classification |
|---------------|------------------|------------------|----------------|
| `AppShell` / `NavLink` (in `RootLayout`) | B.C. DS Header/Footer plus local app nav | Mantine shell with token styling in `bcds-mantine-fallbacks.css` | `Mantine fallback` |
| Mantine `Dropzone` | No confirmed B.C. DS equivalent | Mantine dropzone + `bcds-mantine-dropzone` token styling | `Mantine fallback` |
| Mantine `Notifications` | Inline alert or local notification layer | Mantine API + BC DS token toast styles | `Mantine fallback` |
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
| `App / UploadDropzone` | `DocumentUploadPanel` (`bcds-upload-panel`) | `Application-specific` |
| `App / ActionIconButton` | `IconActionButton` wrapper (`ui/IconActionButton.tsx`) | `BC DS native` |

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

## Screen migration checklist

Apply this recipe when rolling out beyond the Processing Queue reference. Track per-route status in [BC_DS_SCREEN_MIGRATION_STATUS.md](./BC_DS_SCREEN_MIGRATION_STATUS.md).

### Page shell (top-level route)

- Prefer `PageHeader` from `ui/` (`title`, `description`, optional `actions`, `showDateBadge`).
- Or manually: `Title` `order={2}` + dimmed `Text` + outline date `Badge` (see `QueuePage.tsx`).
- `Stack` `gap="lg"` wrapping shell + main content.

### Main panel

- Wrap primary content in `PanelCard` (token class `bcds-panel-card`).
- Optional inner `Title` `order={3}` + dimmed description for the panel section.

### Stats row (queue-like screens)

- Replace `Paper withBorder` stat blocks with `StatCard` inside `SimpleGrid` `cols={{ base: 1, sm: 4 }}` (adjust column count as needed).

### Filters

- Use `SearchField` and `StatusSelect` where the queue uses search + status filter; otherwise existing BC DS form adapters from `ui/`.

### Tables

- Import `DataTable` instead of raw `Table`.
- Replace tags: `Table.Thead` → `DataTable.Thead`, same for `Tbody`, `Tr`, `Th`, `Td`.
- Pass through `striped`, `highlightOnHover`, `withTableBorder`, `data-testid` as before.
- Optional `caption` prop on `DataTable` for row counts.

### Row actions

- Replace icon-only `ActionIcon` + `Tooltip` with `IconActionButton` (`tooltip`, `icon`, `onClick`, `variant`, `color`, `disabled`, `loading`).

### Status labels

- Pipeline statuses: prefer `StatusBadge`; general labels: `Badge` adapter.

### Upload areas

- Add `className="bcds-mantine-dropzone"` on `Dropzone` roots.

### Mechanical replacements

| From | To |
|------|-----|
| `Table` | `DataTable` (+ `DataTable.*` subcomponents) |
| `ActionIcon` + `Tooltip` (icon-only row action) | `IconActionButton` |
| `Paper withBorder` KPI block | `StatCard` |

### Out of scope per screen

- Canvas, graph editors, confusion-matrix layouts, OCR viewers: token/toolbar polish only; do not rewrite interaction model.

### Verification per screen

- `npm run type-check` and `npm run lint` in `apps/frontend`.
- Desktop ~1440px and narrow ~768px: stats stack, table scrolls, no overlap.
- Behaviour unchanged: filters, navigation, deletes, modals.

## Reference Screen

The Processing Queue screen is the first migration reference. It maps to the Figma frame `Processing Queue — 1440` in the product design file and exercises global chrome, page headings, stat cards, search, select, table, badges, and row actions.

Relevant code:

- `apps/frontend/src/layouts/RootLayout.tsx`
- `apps/frontend/src/pages/QueuePage.tsx`
- `apps/frontend/src/components/queue/ProcessingQueue.tsx`
- `apps/frontend/src/components/upload/DocumentUploadPanel.tsx`
- `apps/frontend/src/pages/UploadPage.tsx`

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
