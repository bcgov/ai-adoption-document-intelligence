# App views — Playwright E2E suite

Coverage for the application views **outside** the workflow-builder and
benchmarking areas (those have their own suites).

## Layout

```
app-views/
├── helpers/app-test.ts   # origin-agnostic mock auth (+ isAdmin option)
└── specs/
    ├── smoke.spec.ts      # every main view mounts + renders its heading, no page errors
    ├── groups.spec.ts     # create-group modal UI + client-side validation (admin)
    └── tables.spec.ts     # reference-data list → detail, using the seeded table
```

## What's covered

- **smoke.spec** — Upload, Processing queue, Template Models, Tables, HITL
  Review, Classify, Settings, Groups each load with mock auth and render their
  heading without throwing a page error; the Dynamic-nodes *new* page mounts its
  editor shell. Shallow by design — these catch shared-component / routing / auth
  regressions that crash a whole view.
- **groups.spec** — the Groups page has the richest testid coverage in the app.
  Group mutations need real platform-admin JWT (the test API key is rejected with
  401), so we exercise the admin create-group **modal UI** + Mantine field
  validation without committing a mutation.
- **tables.spec** — list → detail of the seeded `payment_schedule` table
  (deterministic, no writes). Tables has no testids yet, so it navigates by
  visible text.

## Running

Needs frontend `:3000` + backend `:3002` up (e.g. VSCode `Dev: all`). Same
runner + DB-reset caveat as the workflow-builder suite — see
`../workflow-builder/README.md`. To run against an already-seeded stack without
wiping it:

```bash
PLAYWRIGHT_SKIP_DB_RESET=1 npm run test:e2e -- tests/e2e/app-views
```

## Notes / future polish

- Most views (Upload, Queue, Template Models, Tables, HITL, Classify, Settings)
  carry **no `data-testid`s**, which caps these at heading/text-level smoke
  assertions. Adding testids to e.g. Tables rows or the HITL queue would unlock
  deeper, less text-coupled tests.
- The router has **no catch-all (`path: "*"`)** route, so unknown paths fall
  through to React Router's default error boundary instead of the app shell. A
  `NotFound` route is a possible small polish.
- The Dynamic-nodes editor uses Monaco, whose web worker fails to initialise
  under headless Chromium (an environmental "Event" error); the smoke test
  therefore asserts the editor shell mounts but does not assert zero page errors
  on that page.
