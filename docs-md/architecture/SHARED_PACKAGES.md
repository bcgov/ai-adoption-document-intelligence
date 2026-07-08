# Shared Workspace Packages

This document describes the convention for extracting shared TypeScript code into a workspace package under `packages/`.

## When to create a shared package

Extract code into a shared package when the same types, logic, or utilities need to be used in more than one app (`backend-services`, `temporal`, `frontend`). Duplication across apps is the signal — not anticipated future use.

Existing packages and what they contain:

| Package | Name | Contents |
|---|---|---|
| `packages/logging` | `@ai-di/shared-logging` | Structured logger factory |
| `packages/blob-storage-paths` | `@ai-di/blob-storage-paths` | Blob key path helpers |
| `packages/graph-insertion-slots` | `@ai-di/graph-insertion-slots` | Graph workflow insertion slot types |
| `packages/graph-workflow` | `@ai-di/graph-workflow` | Graph workflow types and validator, plus workflow config hashing (`computeConfigHash`, `computeConfigHashWithOverrides`, `stampConfigWithPersistedHash`, `stripPersistedConfigHash`) and override helpers (`applyWorkflowConfigOverrides`, `isSafeOverridePathSegment`); ships a browser-safe entry (`src/index.browser.ts`) with no `node:crypto` |
| `packages/monitoring` | `@ai-di/monitoring` | Alert threshold config, static alert rules, Prometheus app-metrics factory |
| `packages/temporal-payload-codec` | `@ai-di/temporal-payload-codec` | Gzip Temporal `PayloadCodec` shared by worker and clients |

> Config hashing and override helpers previously lived in a separate
> `@ai-di/graph-workflow-config` package; they were consolidated into
> `@ai-di/graph-workflow`. No app depends on `@ai-di/graph-workflow-config`.

---

## Package structure

```
packages/my-package/
  package.json
  tsconfig.json
  src/
    index.ts        ← public exports
    types.ts
    ...
```

### `package.json`

```json
{
  "name": "@ai-di/my-package",
  "version": "1.0.0",
  "main": "dist/index.js",
  "types": "dist/index.d.ts",
  "scripts": {
    "build": "tsc",
    "clean": "rm -rf dist",
    "prepare": "npm run build"
  },
  "devDependencies": {
    "typescript": "5.9.3"
  }
}
```

### `tsconfig.json`

```json
{
  "compilerOptions": {
    "target": "ES2022",
    "module": "commonjs",
    "declaration": true,
    "outDir": "./dist",
    "rootDir": "./src",
    "strict": true,
    "skipLibCheck": true,
    "esModuleInterop": true
  },
  "include": ["src/**/*"],
  "exclude": ["node_modules", "dist"]
}
```

---

## Referencing from an app

Add a `file:` dependency to the app's `package.json`:

```json
"dependencies": {
  "@ai-di/my-package": "file:../../packages/my-package"
}
```

Run `npm install` from the repo root to create the workspace symlink.

**No `tsconfig.json` path alias is needed.** The package resolves through the workspace symlink in `node_modules` to `dist/index.js` / `dist/index.d.ts`, the same as any other installed package. This is consistent with all other `@ai-di/*` packages in this repo.

One exception: the frontend's `vite.config.ts` aliases `@ai-di/graph-workflow` to the package's browser entry `src/index.browser.ts` (and lists it in `optimizeDeps.include`), because the compiled dist is CommonJS and Rollup cannot resolve its named exports. The browser entry omits Node-only modules (e.g. `node:crypto`). Vite consumers bundling a package should follow that pattern instead of relying on the dist build.

Optionally add a helper script to the app's `package.json` for rebuilding the package in isolation:

```json
"build:my-package": "cd ../../packages/my-package && npm run build"
```

---

## Build convention

Packages must be compiled before any app that depends on them is started, built, or tested. The canonical way to build all packages is from the repo root:

```sh
npm run build:packages
```

This script (defined in the root `package.json`) runs `npm run build -w packages`, which compiles every package under `packages/`. Most packages have no inter-package dependencies; the one exception is `@ai-di/monitoring`, which peer-depends on `@ai-di/shared-logging` (which npm's alphabetical workspace ordering happens to build first).

App dev/watch scripts (`start:dev`, `dev`) do **not** include package build steps. The `build` scripts of `backend-services` and `temporal` chain the graph-related package builds (`build:graph-insertion-slots`, `build:graph-workflow`) before compiling the app, and the temporal `pretest` script builds those plus `logging`. The `temporal-payload-codec` package has no inter-package dependencies and is built by `npm run build:packages` (and copied/built directly in each Dockerfile). For anything not covered by those chains, run `npm run build:packages` first.

---

## Dockerfile updates

Each app's Dockerfile manually copies and builds workspace packages. When adding a new package, add two blocks in each Dockerfile that uses the package.

In the **builder stage**, after the existing package blocks:

```dockerfile
COPY packages/my-package /packages/my-package
RUN cd /packages/my-package && npm install --ignore-scripts && npm run build
```

In the **production stage**, after the existing `COPY --from=builder` package lines:

```dockerfile
COPY --from=builder /packages/my-package /packages/my-package
```

The production stage copy is needed because `node_modules` contains a symlink to `/packages/my-package` and the symlink target must exist in the final image.

If the package depends on another workspace package (as `@ai-di/monitoring` does on `@ai-di/shared-logging`), symlink the dependency into the package's `node_modules` before installing, since `file:`/workspace resolution is not available inside the image:

```dockerfile
COPY packages/monitoring /packages/monitoring
RUN mkdir -p /packages/monitoring/node_modules/@ai-di && \
    ln -s /packages/logging /packages/monitoring/node_modules/@ai-di/shared-logging && \
    cd /packages/monitoring && npm install --ignore-scripts && npm run build
```

---

## Checklist for adding a new package

- [ ] Create `packages/my-package/` with `package.json`, `tsconfig.json`, `src/index.ts`
- [ ] Add `"@ai-di/my-package": "file:../../packages/my-package"` to each consuming app's `package.json`
- [ ] Run `npm install` from repo root
- [ ] Update `apps/backend-services/Dockerfile` (if backend uses it)
- [ ] Update `apps/temporal/Dockerfile` (if temporal uses it)
- [ ] Update `apps/frontend/Dockerfile` (if frontend uses it)
- [ ] Run `npm run build:packages` before starting or testing
