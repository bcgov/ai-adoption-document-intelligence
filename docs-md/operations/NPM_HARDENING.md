# NPM Install Hardening

This document records the supply-chain hardening decisions applied to npm installs across all apps and CI pipelines.

## Root `.npmrc` Policy

```ini
save-exact=true      # pin exact versions, no ^ or ~ ranges
ignore-scripts=true  # disable lifecycle scripts globally
min-release-age=3    # block packages published less than 3 days ago
```

`package-lock=true` is deliberately omitted — it is already npm's default in v7+. The root `package-lock.json` is what CI installs from (see below), so it is a supply-chain control alongside the three settings above: CI gets exactly the versions recorded there.

Use npm 11.13 or newer; Node 24.16 and later include it. Older npm versions drop other platforms' native binaries from the lockfile when they rewrite it (fixed in npm 11.3.0, [npm/cli#8184](https://github.com/npm/cli/pull/8184)), and older `npm ci` rejected a lockfile that lists them (fixed in npm 11.11.1, [npm/cli#9083](https://github.com/npm/cli/pull/9083)). See [Native binaries in the lockfile](#native-binaries-in-the-lockfile).

## CI / GitHub Actions

QA workflows install with `npm ci --ignore-scripts`. `npm ci` installs exactly the versions in `package-lock.json` and fails if a `package.json` and the lockfile disagree, so commit lockfile changes together with the `package.json` change that caused them.

| Workflow | Command |
|---|---|
| `backend-qa.yml` | `npm ci --ignore-scripts` (root) |
| `frontend-qa.yml` | `npm ci --ignore-scripts` (root) |
| `temporal-qa.yml` | `npm ci --ignore-scripts` (root) |
| `pages.yml` | `npm ci --ignore-scripts` (`docs/`, which has its own `package-lock.json` and its own copy of the root `.npmrc` policy because npm reads the `.npmrc` beside the package it installs) |
| `deploy-instance.yml` | `npm ci --ignore-scripts` (root, alert-rule generation only) |

`deploy-instance.yml` builds app images inside Docker (buildx); the host job only runs the root install above to generate Prometheus alert rules.

### Native binaries in the lockfile

Some dependencies ship a prebuilt binary for each operating system as optional packages, and npm installs only the one that matches the machine: `@biomejs/biome`, `esbuild`, `rollup`, `@swc/core`, `sharp`, `lefthook`, `unrs-resolver` (which Jest 30 loads to resolve modules), `@napi-rs/canvas` and `@napi-rs/nice`. `npm ci` installs only what the lockfile lists, so the lockfile must contain each of these binaries for every platform that installs from it: Linux x64 (glibc) for CI, and Windows x64, macOS x64 and macOS arm64 for developers.

When an entry is missing, the tool that loads that binary fails on that platform. For `unrs-resolver`, Jest fails with `Cannot find native binding`. `npm ci` does not always catch it first: it can stop with `Missing: <package>@<version> from lock file`, but in this repo's CI it installs without the binary. Restore the missing entry: copy it from `develop`'s `package-lock.json`, or add it at the version the parent package lists under `optionalDependencies`. Do not delete `package-lock.json` and reinstall, as the Jest error suggests; that re-resolves every dependency to the newest version allowed.

### Min-release-age compatibility note

npm 11.10 and later honour `min-release-age`. It applies whenever npm chooses a version, such as when a developer adds or updates a dependency: npm skips versions published less than 3 days ago, and asking for one of them exactly fails with `ETARGET`, even though it exists on npm. `npm ci` can apply the same check to lockfile entries that have no `resolved` URL, so CI can also fail with `ETARGET` when one of those names a version under 3 days old.

## Dockerfiles

Dockerfiles do **not** have a lockfile in the build context (monorepo `file:` paths do not resolve inside the container). Therefore they use `npm install --ignore-scripts` rather than `npm ci`.

| Image | Builder stage | Production stage |
|---|---|---|
| `backend-services` | `npm install --ignore-scripts` | `npm install --omit=dev --ignore-scripts` |
| `temporal` | `npm install --ignore-scripts` | `npm install --omit=dev --ignore-scripts` |
| `frontend` | `npm install --ignore-scripts` | n/a (nginx static) |
| `ches-adapter` | `npm install --ignore-scripts` | `npm install --omit=dev --ignore-scripts` |
| shared packages (build deps: `logging`, `graph-insertion-slots`, `blob-storage-paths`, `graph-workflow`, `monitoring`) | `npm install --ignore-scripts` + explicit `npm run build` (exception: `graph-insertion-slots` runs plain `npm install`) | n/a (pre-built into dist) |

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

Both arrive transitively via `testcontainers` (a devDependency of `apps/backend-services`, used only in tests). Neither appears in any Dockerfile production stage.

### lefthook — no exception needed

```
lefthook: { "postinstall": "node postinstall.js" }
```

Installs git hooks on developer machines. Skipping in CI is intentional — git hooks are not relevant during automated builds.

### unrs-resolver — no exception needed

```
unrs-resolver: { "postinstall": "napi-postinstall unrs-resolver 1.11.1 check" }
```

NAPI binary resolver pulled in via Jest (`jest-resolve`). Ships prebuilt binaries as optional packages, same model as esbuild. Works without running postinstall.
