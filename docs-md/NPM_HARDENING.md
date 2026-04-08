# NPM Install Hardening

This document records the supply-chain hardening decisions applied to npm installs across all apps and CI pipelines.

## Root `.npmrc` Policy

```ini
save-exact=true          # pin exact versions, no ^ or ~ ranges
ignore-scripts=true      # disable lifecycle scripts globally on the host
min-release-age=3        # block packages published less than 3 days ago
package-lock=true        # enforce lockfile use
```

All developer workstations and CI runs inherit these settings automatically.

## CI / GitHub Actions

All workflows use `npm ci --ignore-scripts` (never plain `npm install`):

| Workflow | Command |
|---|---|
| `backend-qa.yml` | `npm ci --ignore-scripts` (root) |
| `frontend-qa.yml` | `npm ci --ignore-scripts` (root) |
| `temporal-qa.yml` | `npm ci --ignore-scripts` (root + apps/temporal) |
| `release.yml` | `npm ci --ignore-scripts` (root) |
| `migrate-db.yml` | `npm install --ignore-scripts @changesets/cli` (single tool install, no lockfile) |

`build-apps.yml` builds apps inside Docker containers; the host CI job does not run `npm install`. The npm cache key uses the root `package-lock.json` only.

## Dockerfiles

Dockerfiles do **not** have a lockfile in the build context (monorepo `file:` paths do not resolve inside the container). Therefore they use `npm install --ignore-scripts` rather than `npm ci`.

| Image | Builder stage | Production stage |
|---|---|---|
| `backend-services` | `npm install --ignore-scripts` + explicit bcrypt binary step | `npm install --omit=dev --ignore-scripts` |
| `temporal` | `npm install --ignore-scripts` | `npm install --omit=dev --ignore-scripts` |
| `frontend` | `npm install --ignore-scripts` | n/a (nginx static) |
| `packages/logging` (build dep) | `npm install --ignore-scripts` + explicit `npm run build` | n/a (pre-built into dist) |

## Lifecycle Script Exceptions

The scan below was run against root `node_modules` to find packages with `preinstall`, `install`, or `postinstall` scripts. Only native-addon packages require an explicit post-install step; all others are build/publish artefacts that run only for package authors.

### bcrypt — **exception required in backend-services Docker image**

```
bcrypt: { "install": "node-gyp-build" }
```

- Used in: `apps/backend-services` (production dependency, API-key hashing).
- Build tool: `node-gyp-build` reads prebuilt binaries from `bcrypt/prebuilds/`; it ships binaries for `linux-x64/bcrypt.glibc.node` **and** `linux-x64/bcrypt.musl.node` (Alpine), `darwin-arm64`, etc.  No compiler (`python3`/`make`/`g++`) is needed.
- With `--ignore-scripts`, the install script is skipped but the runtime `require('node-gyp-build')` in `bcrypt/bcrypt.js` still locates the correct prebuilt at load time.
- The Dockerfile **builder stage** explicitly runs the step for clarity:
  ```dockerfile
  RUN npm install --ignore-scripts
  RUN cd node_modules/bcrypt && node-gyp-build
  ```
- The **production stage** (`npm install --omit=dev --ignore-scripts`) relies on the runtime dynamic-load path — no separate step needed because prebuilt binaries are bundled in the package.

### esbuild — no exception needed

```
esbuild: { "postinstall": "node install.js" }
```

- esbuild ships platform binaries via optional npm packages (`@esbuild/linux-x64`, etc.).
- `install.js` only validates the already-installed platform binary; it does not download or compile.
- Confirmed working with `ignore-scripts=true` in local `.npmrc`.

### cpu-features, ssh2 — no exception needed in CI or Docker

Both are devDependencies of the root workspace (used by `temporal` devtools or testing utilities). Neither appears in any Dockerfile production stage.

### lefthook — no exception needed

```
lefthook: { "postinstall": "node postinstall.js" }
```

Installs git hooks on developer machines. Skipping in CI is intentional — git hooks are not relevant during automated builds.

### unrs-resolver — no exception needed

```
unrs-resolver: { "postinstall": "napi-postinstall unrs-resolver 1.11.1 check" }
```

NAPI binary resolver used by Biome (linter). Ships prebuilt binaries as optional packages, same model as esbuild. Works without running postinstall.
