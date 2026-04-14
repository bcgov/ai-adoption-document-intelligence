# NPM Install Hardening

This document records the supply-chain hardening decisions applied to npm installs across all apps and CI pipelines.

## Root `.npmrc` Policy

```ini
save-exact=true      # pin exact versions, no ^ or ~ ranges
ignore-scripts=true  # disable lifecycle scripts globally
min-release-age=3    # block packages published less than 3 days ago
```

`package-lock=true` is deliberately omitted — it is already npm's default in v7+. npm v11 only records the current-platform optional package in lockfile v3 (e.g. `@biomejs/cli-darwin-arm64` when generating on macOS arm64). When CI runs on Linux and a lockfile is present, npm honours that recorded resolution and installs the macOS binary; the Linux binary (`@biomejs/cli-linux-x64`) is never installed, causing tools like biome to fail. The three settings above are the primary supply-chain controls; the lockfile provides secondary coverage for all non-optional packages.

## CI / GitHub Actions

QA workflows use `npm install --ignore-scripts --no-package-lock`. `npm ci` is avoided because it enforces strict lockfile adherence, which also breaks on cross-platform optional packages. `--no-package-lock` causes npm to skip the lockfile entirely and resolve optional packages for the current platform, ensuring the Linux runner installs the correct binary (e.g. `@biomejs/cli-linux-x64` for biome).

Workflows that do not run platform-specific optional tools use `npm install --ignore-scripts` without `--no-package-lock` and benefit from lockfile-based reproducibility.

| Workflow | Command |
|---|---|
| `backend-qa.yml` | `npm install --ignore-scripts --no-package-lock` (root) |
| `frontend-qa.yml` | `npm install --ignore-scripts --no-package-lock` (root) |
| `temporal-qa.yml` | `npm install --ignore-scripts --no-package-lock` (root + apps/temporal) |
| `release.yml` | `npm install --ignore-scripts` (root) |
| `migrate-db.yml` | `npm install --ignore-scripts @changesets/cli` (single tool install) |

`build-apps.yml` builds apps inside Docker containers; the host CI job does not run `npm install`. The npm cache key uses the root `package-lock.json` only.

## Dockerfiles

Dockerfiles do **not** have a lockfile in the build context (monorepo `file:` paths do not resolve inside the container). Therefore they use `npm install --ignore-scripts` rather than `npm ci`.

| Image | Builder stage | Production stage |
|---|---|---|
| `backend-services` | `npm install --ignore-scripts` | `npm install --omit=dev --ignore-scripts` |
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
- `node-gyp-build` is called **both** from the `install` script and at module load time inside `bcrypt/bcrypt.js` (`require('node-gyp-build')(path.resolve(__dirname))`). This means skipping the install script with `--ignore-scripts` is safe — the correct prebuilt binary is still selected at `require('bcrypt')` time from `prebuilds/linux-x64/bcrypt.glibc.node` or `bcrypt.musl.node`.
- No extra Dockerfile step is needed. `RUN npm install --ignore-scripts` is sufficient in both builder and production stages.

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
